import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isLinkedFamily } from "@/lib/family-links";
import {
  REACTION_EMOJIS,
  listReactions,
  listComments,
  recordingMimeTypes,
} from "@/lib/social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mediaKind(mime: string | undefined): "image" | "video" | "audio" | null {
  if (!mime) return null;
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return null;
}

// The likes + comments hanging off one memory. Visible to the memory owner and
// their linked family only — the same circle that can see the memory itself.
export async function GET(_req: Request, { params }: { params: { nodeId: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const viewerId = session.user.id;

  const node = await prisma.forestNode.findUnique({ where: { id: params.nodeId } });
  if (!node) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await isLinkedFamily(viewerId, node.userId))) {
    return NextResponse.json({ canView: false }, { status: 200 });
  }

  const [rxns, cmts] = await Promise.all([
    listReactions(params.nodeId),
    listComments(params.nodeId),
  ]);

  // Aggregate reactions into per-emoji counts and find the viewer's own pick.
  const counts = new Map<string, number>();
  let myReaction: string | null = null;
  for (const r of rxns) {
    counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1);
    if (r.userId === viewerId) myReaction = r.emoji;
  }
  const reactionCounts = [...counts.entries()]
    .map(([emoji, count]) => ({ emoji, count }))
    .sort((a, b) => b.count - a.count);

  // Look up author names and comment-media types in bulk.
  const authorIds = [...new Set(cmts.map((c) => c.authorId))];
  const recordingIds = cmts.map((c) => c.recordingId).filter((x): x is string => !!x);
  const [profiles, recMeta] = await Promise.all([
    authorIds.length
      ? prisma.profile.findMany({
          where: { userId: { in: authorIds } },
          select: { userId: true, displayName: true },
        })
      : Promise.resolve([] as { userId: string; displayName: string }[]),
    recordingMimeTypes(recordingIds),
  ]);
  const nameByUser = new Map(profiles.map((p) => [p.userId, p.displayName]));
  const mimeByRec = new Map(recMeta.map((r) => [r.id, r.mimeType]));

  const comments = cmts.map((c) => ({
    id: c.id,
    authorName: nameByUser.get(c.authorId) ?? "A family member",
    body: c.body,
    recordingId: c.recordingId,
    mediaKind: c.recordingId ? mediaKind(mimeByRec.get(c.recordingId)) : null,
    mine: c.authorId === viewerId,
    createdAt: c.createdAt.toISOString(),
  }));

  return NextResponse.json({
    canView: true,
    emojis: REACTION_EMOJIS,
    myReaction,
    reactionCounts,
    comments,
  });
}
