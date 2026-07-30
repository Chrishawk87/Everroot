import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isLinkedFamily } from "@/lib/family-links";
import { REACTION_EMOJIS, setReaction, clearReaction } from "@/lib/social";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Set, change, or clear the signed-in family member's single reaction to a
// memory. Body: { emoji: string } to set/change, { emoji: null } to clear.
export async function POST(req: Request, { params }: { params: { nodeId: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "You must be signed in" }, { status: 401 });
  }
  const userId = session.user.id;

  const limit = rateLimit(`react:${userId}`, 240, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "You're reacting very quickly — please wait a moment." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limit.retryAfterMs)) } },
    );
  }

  const node = await prisma.forestNode.findUnique({ where: { id: params.nodeId } });
  if (!node) {
    return NextResponse.json({ error: "That memory doesn't exist" }, { status: 404 });
  }
  if (!(await isLinkedFamily(userId, node.userId))) {
    return NextResponse.json({ error: "This memory is private to its family" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { emoji?: string | null };
  const emoji = body.emoji;

  if (emoji === null || emoji === undefined || emoji === "") {
    await clearReaction(params.nodeId, userId);
    return NextResponse.json({ ok: true, myReaction: null });
  }
  if (!(REACTION_EMOJIS as readonly string[]).includes(emoji)) {
    return NextResponse.json({ error: "That's not one of the reactions" }, { status: 400 });
  }

  await setReaction(params.nodeId, userId, emoji);
  return NextResponse.json({ ok: true, myReaction: emoji });
}
