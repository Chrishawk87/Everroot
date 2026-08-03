import { prisma } from "@/lib/prisma";

/**
 * Typed bridge to the `Reaction` and `Comment` Prisma models — the family
 * likes/comments layer on top of a memory.
 *
 * Same rationale as lib/recordings.ts: the sandbox can't reach Prisma's engine
 * CDN to regenerate the client, so the checked-in generated types don't yet
 * know about `prisma.reaction` / `prisma.comment`. This bridge describes exactly
 * the shapes we rely on so the codebase typechecks locally while matching the
 * real runtime client. Once the client is regenerated with the models present,
 * call sites can use `prisma.reaction` / `prisma.comment` directly.
 */

// The small, fixed set of reactions a family can leave on a memory. Kept short
// and warm on purpose — this is a family remembrance, not a social network.
export const REACTION_EMOJIS = ["❤️", "😂", "😢", "🙏", "👏"] as const;

// --- Reactions -------------------------------------------------------------

export interface ReactionRow {
  id: string;
  nodeId: string;
  userId: string;
  emoji: string;
  createdAt: Date;
}

interface ReactionDelegate {
  findMany(args: { where: { nodeId: string } }): Promise<ReactionRow[]>;
  upsert(args: {
    where: { nodeId_userId: { nodeId: string; userId: string } };
    create: { nodeId: string; userId: string; emoji: string };
    update: { emoji: string };
  }): Promise<ReactionRow>;
  deleteMany(args: { where: { nodeId: string; userId: string } }): Promise<{ count: number }>;
}

export function reactions(): ReactionDelegate {
  return (prisma as unknown as { reaction: ReactionDelegate }).reaction;
}

/** Every reaction on a memory. */
export function listReactions(nodeId: string): Promise<ReactionRow[]> {
  return reactions().findMany({ where: { nodeId } });
}

/** Set (or change) a person's single reaction to a memory. */
export function setReaction(nodeId: string, userId: string, emoji: string): Promise<ReactionRow> {
  return reactions().upsert({
    where: { nodeId_userId: { nodeId, userId } },
    create: { nodeId, userId, emoji },
    update: { emoji },
  });
}

/** Clear a person's reaction to a memory (no-op if none). */
export async function clearReaction(nodeId: string, userId: string): Promise<void> {
  await reactions().deleteMany({ where: { nodeId, userId } });
}

// --- Comments --------------------------------------------------------------

export interface CommentRow {
  id: string;
  nodeId: string;
  authorId: string;
  body: string | null;
  recordingId: string | null;
  createdAt: Date;
}

interface CommentDelegate {
  findMany(args: {
    where: { nodeId: string };
    orderBy?: { createdAt?: "asc" | "desc" };
  }): Promise<CommentRow[]>;
  create(args: {
    data: { nodeId: string; authorId: string; body?: string | null; recordingId?: string | null };
  }): Promise<CommentRow>;
}

export function comments(): CommentDelegate {
  return (prisma as unknown as { comment: CommentDelegate }).comment;
}

/** Every comment on a memory, oldest → newest. */
export function listComments(nodeId: string): Promise<CommentRow[]> {
  return comments().findMany({ where: { nodeId }, orderBy: { createdAt: "asc" } });
}

/** Add a comment (text and/or a media reply) to a memory. */
export function addComment(input: {
  nodeId: string;
  authorId: string;
  body?: string | null;
  recordingId?: string | null;
}): Promise<CommentRow> {
  return comments().create({ data: input });
}

// --- Lightweight recording metadata ----------------------------------------
// Read just the mime types for a set of comment media recordings, so the UI
// knows whether each reply is a photo, video, or voice clip — WITHOUT pulling
// the (possibly large) media bytes into memory.

interface RecMetaDelegate {
  findMany(args: {
    where: { id: { in: string[] } };
    select: { id: true; mimeType: true };
  }): Promise<{ id: string; mimeType: string }[]>;
}

export function recordingMimeTypes(ids: string[]): Promise<{ id: string; mimeType: string }[]> {
  if (ids.length === 0) return Promise.resolve([]);
  return (prisma as unknown as { recording: RecMetaDelegate }).recording.findMany({
    where: { id: { in: ids } },
    select: { id: true, mimeType: true },
  });
}

// --- Notifications ---------------------------------------------------------
// A comment left by SOMEONE ELSE on one of the current user's own memories is a
// notification: it lights up the bell and, when tapped, opens that memory. We
// read these with the same "typed bridge" trick as everything above, since the
// generated client is frozen. The comment carries its node (so the UI can show
// the memory title and deep-link) and its author (for the "who" line).

export interface NotifCommentRow {
  id: string;
  nodeId: string;
  authorId: string;
  body: string | null;
  recordingId: string | null;
  createdAt: Date;
  node: { id: string; title: string; kind: string; userId: string; data: unknown } | null;
}

interface NotifCommentDelegate {
  findMany(args: {
    where: { node: { userId: string }; authorId: { not: string } };
    orderBy?: { createdAt?: "asc" | "desc" };
    take?: number;
    include?: {
      node: { select: { id: true; title: true; kind: true; userId: true; data: true } };
    };
  }): Promise<NotifCommentRow[]>;
}

/**
 * The most recent comments left by OTHER people on memories that `ownerId`
 * owns — newest first. These are the raw material for the notification bell.
 */
export function commentsOnMyMemories(ownerId: string, limit = 30): Promise<NotifCommentRow[]> {
  return (prisma as unknown as { comment: NotifCommentDelegate }).comment.findMany({
    where: { node: { userId: ownerId }, authorId: { not: ownerId } },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { node: { select: { id: true, title: true, kind: true, userId: true, data: true } } },
  });
}

// --- "Seen" watermark on the user -----------------------------------------
// `notificationsSeenAt` marks when the user last opened their notifications
// list; anything newer is unread. Bridged for the same frozen-client reason.

interface UserNotifDelegate {
  findUnique(args: {
    where: { id: string };
    select: { notificationsSeenAt: true };
  }): Promise<{ notificationsSeenAt: Date | null } | null>;
  update(args: {
    where: { id: string };
    data: { notificationsSeenAt: Date };
  }): Promise<unknown>;
}

function userNotif(): UserNotifDelegate {
  return (prisma as unknown as { user: UserNotifDelegate }).user;
}

/** When this user last opened their notifications (null if never). */
export async function notificationsSeenAt(userId: string): Promise<Date | null> {
  const row = await userNotif().findUnique({
    where: { id: userId },
    select: { notificationsSeenAt: true },
  });
  return row?.notificationsSeenAt ?? null;
}

/** Mark all current notifications as seen (clears the bell badge). */
export async function markNotificationsSeen(userId: string): Promise<void> {
  await userNotif().update({ where: { id: userId }, data: { notificationsSeenAt: new Date() } });
}
