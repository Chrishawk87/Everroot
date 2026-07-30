import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A framed thumbnail is a small on-device JPEG data URL. Cap it so node.data
// can't be stuffed with arbitrary or oversized content.
const MAX_THUMB_CHARS = 200_000;

// Choose whether one of your own memories hangs on the tree as a framed photo.
// Only the tree's owner can curate this. Body: { onTree: boolean, thumb?: string }.
// When turning a memory ON, the client sends a freshly made thumbnail so the
// frame has a picture to show; turning it OFF just flips the flag (the thumbnail
// is kept so re-hanging is instant).
export async function POST(req: Request, { params }: { params: { nodeId: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "You must be signed in" }, { status: 401 });
  }
  const userId = session.user.id;

  const limit = rateLimit(`ontree:${userId}`, 240, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "You're changing things very quickly — please wait a moment." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limit.retryAfterMs)) } },
    );
  }

  const node = await prisma.forestNode.findUnique({ where: { id: params.nodeId } });
  if (!node) {
    return NextResponse.json({ error: "That memory doesn't exist" }, { status: 404 });
  }
  // Curating what hangs on the tree is an owner-only act.
  if (node.userId !== userId) {
    return NextResponse.json({ error: "You can only change your own tree" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { onTree?: boolean; thumb?: string };
  const onTree = body.onTree === true;
  const thumbRaw = typeof body.thumb === "string" ? body.thumb : "";
  const thumb =
    thumbRaw.startsWith("data:image/") && thumbRaw.length <= MAX_THUMB_CHARS ? thumbRaw : null;

  const existing =
    node.data && typeof node.data === "object" ? (node.data as Record<string, unknown>) : {};

  const nextData: Record<string, unknown> = { ...existing, onTree };
  // Only overwrite the stored thumbnail when the client supplies a fresh one.
  if (thumb) nextData.thumb = thumb;

  try {
    await prisma.forestNode.update({
      where: { id: params.nodeId },
      // Prisma's Json field accepts a plain object; cast to satisfy the stale
      // generated types without pulling in Prisma.JsonValue here.
      data: { data: nextData as unknown as never },
    });
  } catch (err) {
    console.error("Failed to update on-tree flag:", err);
    return NextResponse.json(
      { error: "We couldn't update that just now. Please try again." },
      { status: 500 },
    );
  }

  revalidatePath("/forest");
  return NextResponse.json({ ok: true, onTree });
}
