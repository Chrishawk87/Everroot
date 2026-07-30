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
