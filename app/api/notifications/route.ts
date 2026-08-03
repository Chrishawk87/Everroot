import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  commentsOnMyMemories,
  notificationsSeenAt,
  markNotificationsSeen,
} from "@/lib/social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The notification feed: comments left by other family members on the current
// user's own memories. Unread = left after the user last opened this list.
//
// GET  → { items, unread } for the bell badge + list panel.
// POST → marks everything seen (called when the user opens the list), which
//        clears the badge.

interface NotifItem {
  id: string;
  nodeId: string;
  authorName: string;
  snippet: string;
  createdAt: string;
  nodeTitle: string;
  kind: string;
  /** "photo" | "video" | null — drives whether tapping opens the full-screen
   *  media viewer or the memory's detail panel. */
  mediaType: string | null;
  unread: boolean;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const userId = session.user.id;

  const [rows, seenAt] = await Promise.all([
    commentsOnMyMemories(userId),
    notificationsSeenAt(userId),
  ]);

  // Look up who wrote each comment (bulk).
  const authorIds = [...new Set(rows.map((r) => r.authorId))];
  const profiles = authorIds.length
    ? await prisma.profile.findMany({
        where: { userId: { in: authorIds } },
        select: { userId: true, displayName: true },
      })
    : [];
  const nameByUser = new Map(profiles.map((p) => [p.userId, p.displayName]));

  const seenMs = seenAt ? seenAt.getTime() : 0;
  let unread = 0;
  const items: NotifItem[] = rows.map((r) => {
    const isUnread = r.createdAt.getTime() > seenMs;
    if (isUnread) unread += 1;
    const data = (r.node?.data ?? null) as { mediaType?: unknown } | null;
    const mediaType =
      typeof data?.mediaType === "string" ? (data.mediaType as string) : null;
    const snippet = r.body
      ? r.body.length > 80
        ? `${r.body.slice(0, 80)}…`
        : r.body
      : r.recordingId
        ? "sent a photo or video"
        : "left a comment";
    return {
      id: r.id,
      nodeId: r.nodeId,
      authorName: nameByUser.get(r.authorId) ?? "A family member",
      snippet,
      createdAt: r.createdAt.toISOString(),
      nodeTitle: r.node?.title ?? "a memory",
      kind: r.node?.kind ?? "MEMORY",
      mediaType,
      unread: isUnread,
    };
  });

  return NextResponse.json({ items, unread });
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  await markNotificationsSeen(session.user.id);
  return NextResponse.json({ ok: true });
}
