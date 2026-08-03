import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { findRecordingForNode, setRecordingStory } from "@/lib/recordings";
import { aiConfigured, polishIntoStory } from "@/lib/ai";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sane ceiling so a polished story can't balloon the row.
const MAX_STORY_CHARS = 20_000;

// Opt-in AI polish for a single memory. Turning a spoken memory into polished
// first-person prose is the OWNER'S choice — never automatic — because the
// authenticity of the real voice and the real words is the point. The raw
// transcript is always kept; polishing only fills in a separate `story` field
// the owner can toggle to, or undo, at any time.
//
// Body: { polish: boolean }.
//   polish:true  → generate and save the story from the raw transcript.
//   polish:false → clear the story (undo), leaving only the original words.
export async function POST(req: Request, { params }: { params: { nodeId: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "You must be signed in" }, { status: 401 });
  }
  const userId = session.user.id;

  // AI is comparatively expensive, so keep the per-user cap tight.
  const limit = rateLimit(`polish:${userId}`, 60, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "You're polishing very quickly — please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limit.retryAfterMs)) } },
    );
  }

  const node = await prisma.forestNode.findUnique({ where: { id: params.nodeId } });
  if (!node) {
    return NextResponse.json({ error: "That memory doesn't exist" }, { status: 404 });
  }
  // Polishing your loved one's words is an owner-only decision.
  if (node.userId !== userId) {
    return NextResponse.json({ error: "You can only polish your own memories" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { polish?: boolean };
  const wantPolish = body.polish !== false; // default to polishing

  const rec = await findRecordingForNode(params.nodeId);
  if (!rec) {
    return NextResponse.json(
      { error: "There's no recording on this memory to polish." },
      { status: 400 },
    );
  }

  // Undo: clear the polished story, keeping the original words untouched.
  if (!wantPolish) {
    try {
      await setRecordingStory(rec.id, null);
    } catch (err) {
      console.error("Failed to clear polished story:", err);
      return NextResponse.json(
        { error: "We couldn't undo that just now. Please try again." },
        { status: 500 },
      );
    }
    revalidatePath("/forest");
    return NextResponse.json({ ok: true, story: null });
  }

  // Polish: rewrite the raw transcript into first-person prose.
  if (!aiConfigured()) {
    return NextResponse.json(
      { error: "AI polishing isn't set up yet. Add an OpenAI key to enable it." },
      { status: 503 },
    );
  }
  const source = (rec.transcript ?? "").trim();
  if (!source) {
    return NextResponse.json(
      { error: "This memory has no transcript to polish yet." },
      { status: 400 },
    );
  }

  const story = (await polishIntoStory(source, rec.question)).slice(0, MAX_STORY_CHARS);
  if (!story) {
    return NextResponse.json(
      { error: "The polish didn't come through — please try again in a moment." },
      { status: 502 },
    );
  }

  try {
    await setRecordingStory(rec.id, story);
  } catch (err) {
    console.error("Failed to save polished story:", err);
    return NextResponse.json(
      { error: "We couldn't save that just now. Please try again." },
      { status: 500 },
    );
  }

  revalidatePath("/forest");
  return NextResponse.json({ ok: true, story });
}
