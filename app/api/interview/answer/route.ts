import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { grow, ensurePerson, linkMention } from "@/lib/forest/growth-engine";
import { recordings } from "@/lib/recordings";
import { storageConfigured, putRecording, newRecordingKey } from "@/lib/storage";
import { aiConfigured, transcribeAudio } from "@/lib/ai";
import { getQuestionById, MOMENT_TYPE_BY_QUESTION } from "@/lib/interview/script";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Largest audio blob we'll accept for one answer (~25 MB ≈ several minutes of
// compressed webm). Guards the request body and the stored blob.
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
// Sane ceiling for a single transcript so a bad client can't store megabytes.
const MAX_TRANSCRIPT_CHARS = 20_000;

// Save one interview answer: grow a memory on the tree and (if provided) store
// the voice recording alongside it. Uses a route handler rather than a server
// action so the audio blob isn't capped by the server-action body limit.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "You must be signed in" }, { status: 401 });
  }
  const userId = session.user.id;

  // Generous per-user cap so a runaway client can't hammer the DB.
  const limit = rateLimit(`answer:${userId}`, 120, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "You're saving answers very quickly — please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limit.retryAfterMs)) } },
    );
  }

  // Reject oversized uploads before reading the whole body into memory.
  const declaredLength = Number(req.headers.get("content-length") ?? 0);
  if (declaredLength && declaredLength > MAX_AUDIO_BYTES + 1024 * 1024) {
    return NextResponse.json({ error: "That recording is too large." }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const questionId = String(form.get("questionId") ?? "");
  const transcript = String(form.get("transcript") ?? "").trim().slice(0, MAX_TRANSCRIPT_CHARS);
  const durationMs = Number(form.get("durationMs") ?? 0) || 0;
  const audio = form.get("audio");

  const question = getQuestionById(questionId);
  if (!question) {
    return NextResponse.json({ error: "Unknown question" }, { status: 400 });
  }
  if (!transcript && !(audio instanceof Blob)) {
    return NextResponse.json({ error: "Nothing to save yet" }, { status: 400 });
  }
  if (audio instanceof Blob && audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "That recording is too large." }, { status: 413 });
  }

  try {
  // Read the recorded audio once, up front: we need the bytes both for
  // server-side transcription and, later, for storage.
  let audioBytes: Uint8Array | null = null;
  let audioMime = "audio/webm";
  if (audio instanceof Blob && audio.size > 0) {
    audioBytes = new Uint8Array(await audio.arrayBuffer());
    audioMime = audio.type || "audio/webm";
  }

  // Accurate transcription only — we capture the speaker's EXACT words with
  // Whisper (more accurate than the phone's own transcription) but we do NOT
  // rewrite them here. Authenticity is the point: the real voice and the real
  // words are preserved. Turning a memory into polished prose is an explicit,
  // opt-in choice the owner makes later via the "Polish" button (see
  // /api/memory/[nodeId]/polish). If Whisper is off or fails, we fall back to
  // the transcript the phone captured.
  let rawTranscript = transcript;
  if (aiConfigured() && audioBytes) {
    const heard = await transcribeAudio(audioBytes, audioMime);
    if (heard) rawTranscript = heard.slice(0, MAX_TRANSCRIPT_CHARS);
  }

  // Grow the memory. Its displayed text is the raw transcript (their own words).
  const result = await grow(userId, {
    type: question.interaction,
    title: question.title,
    summary: rawTranscript || undefined,
    branch: question.branch,
    epoch: question.epoch,
    momentType: MOMENT_TYPE_BY_QUESTION[question.id],
    data: {
      source: "voice_interview",
      questionId: question.id,
      question: question.prompt,
      transcript: rawTranscript || null,
      story: null,
    },
  });

  // Weave the memory graph: connect this memory to the people who were part of
  // it. Each entry is either an existing person ({ id }) or a new one to plant
  // ({ name, relationship? }). We return the canonical [{ id, name }] so the
  // client can reuse freshly planted saplings on later questions.
  const linkedPeople: { id: string; name: string }[] = [];
  const rawPeople = form.get("people");
  if (typeof rawPeople === "string" && rawPeople.trim()) {
    try {
      const parsed = JSON.parse(rawPeople) as Array<{
        id?: string;
        name?: string;
        relationship?: string;
      }>;
      for (const p of Array.isArray(parsed) ? parsed : []) {
        let personId = p.id;
        let personName = p.name?.trim() ?? "";
        if (!personId && personName) {
          personId = await ensurePerson(userId, personName, p.relationship);
        }
        if (!personId) continue;
        if (!personName) {
          const node = await prisma.forestNode.findUnique({ where: { id: personId } });
          personName = node?.title ?? "";
        }
        await linkMention(userId, result.createdNodeId, personId);
        linkedPeople.push({ id: personId, name: personName });
      }
    } catch {
      /* malformed people payload — skip linking, still save the memory */
    }
  }

  // Store the recording, if the browser captured one.
  let recordingId: string | null = null;
  if (audioBytes) {
    const bytes = audioBytes;
    const mimeType = audioMime;

    // Prefer object storage (R2). If it's configured, upload the audio there and
    // store only the key in Postgres; the raw bytes stay out of the database.
    // If R2 isn't configured — OR the upload fails (bad/missing credentials,
    // network) — fall back to storing bytes in the DB. The recording must never
    // be lost just because object storage is unavailable, so an R2 failure is
    // logged but not fatal: we keep the audio in Postgres instead.
    let storageKey: string | null = null;
    if (storageConfigured()) {
      try {
        const key = newRecordingKey();
        await putRecording(key, bytes, mimeType);
        storageKey = key;
      } catch (e) {
        console.error("R2 upload failed — storing recording bytes in DB instead:", e);
        storageKey = null;
      }
    }

    const rec = await recordings().create({
      data: {
        userId,
        nodeId: result.createdNodeId,
        mimeType,
        durationMs,
        bytes: storageKey ? null : bytes,
        storageKey,
        transcript: rawTranscript || null,
        story: null,
        question: question.prompt,
      },
    });
    recordingId = rec.id;
  }

  revalidatePath("/forest");

  return NextResponse.json({
    ok: true,
    nodeId: result.createdNodeId,
    createdKind: result.createdKind,
    legacyScore: result.newLegacyScore,
    recordingId,
    linkedPeople,
  });
  } catch (err) {
    console.error("Failed to save interview answer:", err);
    return NextResponse.json(
      { error: "We couldn't save that just now. Please try again." },
      { status: 500 },
    );
  }
}
