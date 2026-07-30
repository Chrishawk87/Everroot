import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isLinkedFamily } from "@/lib/family-links";
import { addComment } from "@/lib/social";
import { recordings } from "@/lib/recordings";
import { storageConfigured, putRecording, newRecordingKey } from "@/lib/storage";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A comment can be text, a photo/short video reply, or both. Match the lantern
// media caps so a runaway file can't blow out memory.
const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB
const MAX_VIDEO_BYTES = 80 * 1024 * 1024; // ~80 MB — a short phone clip
const MAX_AUDIO_BYTES = 20 * 1024 * 1024; // 20 MB — a short voice reply
const MAX_BODY_CHARS = 2000;

// Leave a comment on a memory. Any linked family member can comment. A media
// reply is stored just like a memory's own media (R2 with a DB fallback), and
// crucially under the memory OWNER's id — so it's visible to the whole family
// forest that can already see the memory, not just the commenter.
export async function POST(req: Request, { params }: { params: { nodeId: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "You must be signed in" }, { status: 401 });
  }
  const authorId = session.user.id;

  const limit = rateLimit(`comment:${authorId}`, 120, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "You're commenting very quickly — please wait a moment." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limit.retryAfterMs)) } },
    );
  }

  const node = await prisma.forestNode.findUnique({ where: { id: params.nodeId } });
  if (!node) {
    return NextResponse.json({ error: "That memory doesn't exist" }, { status: 404 });
  }
  if (!(await isLinkedFamily(authorId, node.userId))) {
    return NextResponse.json({ error: "This memory is private to its family" }, { status: 403 });
  }
  const ownerId = node.userId;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const body = String(form.get("body") ?? "").trim().slice(0, MAX_BODY_CHARS);
  const file = form.get("file");
  const hasFile = file instanceof Blob && file.size > 0;

  if (!body && !hasFile) {
    return NextResponse.json({ error: "Add a few words, a photo, or a video." }, { status: 400 });
  }

  let recordingId: string | null = null;

  if (hasFile) {
    const blob = file as Blob;
    const mimeType = blob.type || "";
    const isImage = mimeType.startsWith("image/");
    const isVideo = mimeType.startsWith("video/");
    const isAudio = mimeType.startsWith("audio/");
    if (!isImage && !isVideo && !isAudio) {
      return NextResponse.json(
        { error: "Only photos, videos, or voice replies can be attached." },
        { status: 415 },
      );
    }
    const cap = isVideo ? MAX_VIDEO_BYTES : isAudio ? MAX_AUDIO_BYTES : MAX_IMAGE_BYTES;
    if (blob.size > cap) {
      return NextResponse.json(
        {
          error: isVideo
            ? "That video is a bit long — please keep clips short (under ~80 MB)."
            : "That file is too large.",
        },
        { status: 413 },
      );
    }

    try {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let storageKey: string | null = null;
      if (storageConfigured()) {
        try {
          const key = newRecordingKey();
          await putRecording(key, bytes, mimeType);
          storageKey = key;
        } catch (e) {
          console.error("R2 upload failed — storing comment media in DB instead:", e);
          storageKey = null;
        }
      }
      // Stored under the memory owner so the whole family that can see the
      // memory can also stream the reply (recording access is gated by owner).
      const rec = await recordings().create({
        data: {
          userId: ownerId,
          nodeId: params.nodeId,
          mimeType,
          durationMs: 0,
          bytes: storageKey ? null : bytes,
          storageKey,
          transcript: null,
          question: null,
        },
      });
      recordingId = rec.id;
    } catch (err) {
      console.error("Failed to store comment media:", err);
      return NextResponse.json(
        { error: "We couldn't add that just now. Please try again." },
        { status: 500 },
      );
    }
  }

  try {
    const comment = await addComment({
      nodeId: params.nodeId,
      authorId,
      body: body || null,
      recordingId,
    });
    return NextResponse.json({ ok: true, commentId: comment.id });
  } catch (err) {
    console.error("Failed to save comment:", err);
    return NextResponse.json(
      { error: "We couldn't add that just now. Please try again." },
      { status: 500 },
    );
  }
}
