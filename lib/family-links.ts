import { prisma } from "@/lib/prisma";

/**
 * Typed bridge to the Phase 5 cross-account family-link schema — the `Invite`
 * model and the `ForestNode.linkedUserId` field.
 *
 * Same rationale as lib/recordings.ts: the sandbox can't reach Prisma's engine
 * CDN to regenerate the client, so the checked-in generated types don't yet
 * know about `prisma.invite` or `linkedUserId`. This bridge describes exactly
 * the shapes we rely on so the codebase typechecks locally while matching the
 * real runtime client. Once the client is regenerated with the schema present,
 * call sites can use `prisma.invite` / `linkedUserId` directly.
 */

export interface InviteRow {
  id: string;
  code: string;
  inviterId: string;
  personNodeId: string | null;
  relationship: string | null;
  inviteeName: string | null;
  claimedById: string | null;
  claimedAt: Date | null;
  createdAt: Date;
}

export interface CreateInviteInput {
  code: string;
  inviterId: string;
  personNodeId?: string | null;
  relationship?: string | null;
  inviteeName?: string | null;
}

interface InviteDelegate {
  create(args: { data: CreateInviteInput }): Promise<InviteRow>;
  findUnique(args: { where: { code?: string; id?: string } }): Promise<InviteRow | null>;
  findFirst(args: {
    where: { inviterId?: string; personNodeId?: string | null; claimedById?: string | null };
    orderBy?: { createdAt?: "asc" | "desc" };
  }): Promise<InviteRow | null>;
  update(args: {
    where: { id?: string; code?: string };
    data: { claimedById?: string | null; claimedAt?: Date | null };
  }): Promise<InviteRow>;
}

/** The `Invite` Prisma delegate, typed to the calls we make. */
export function invites(): InviteDelegate {
  return (prisma as unknown as { invite: InviteDelegate }).invite;
}

// --- ForestNode.linkedUserId helpers -------------------------------------

export interface LinkedPersonNode {
  id: string;
  userId: string;
  title: string;
  linkedUserId: string | null;
}

interface LinkedNodeDelegate {
  update(args: { where: { id: string }; data: { linkedUserId: string } }): Promise<unknown>;
  findMany(args: {
    where: { userId?: string; kind?: string; linkedUserId?: string | { not: null } };
  }): Promise<LinkedPersonNode[]>;
}

function linkedNodes(): LinkedNodeDelegate {
  return (prisma as unknown as { forestNode: LinkedNodeDelegate }).forestNode;
}

/** Bind a PERSON placeholder node to the real account it now represents. */
export async function bindPersonToUser(personNodeId: string, linkedUserId: string): Promise<void> {
  await linkedNodes().update({ where: { id: personNodeId }, data: { linkedUserId } });
}

/** PERSON nodes in this user's forest that point at a real account (forward). */
export function findForwardLinks(userId: string): Promise<LinkedPersonNode[]> {
  return linkedNodes().findMany({ where: { userId, kind: "PERSON", linkedUserId: { not: null } } });
}

/** PERSON nodes in OTHER forests that point at this user (reverse). */
export function findReverseLinks(userId: string): Promise<LinkedPersonNode[]> {
  return linkedNodes().findMany({ where: { kind: "PERSON", linkedUserId: userId } });
}

/** Safely read linkedUserId off a node row from the (stale) generated client. */
export function linkedUserIdOf(node: unknown): string | null {
  return (node as { linkedUserId?: string | null }).linkedUserId ?? null;
}

/**
 * True if the two accounts are linked family (either direction). Used to gate
 * access to shared legacy products like memory clips.
 */
export async function isLinkedFamily(viewerId: string, ownerId: string): Promise<boolean> {
  if (viewerId === ownerId) return true;
  const [forward, reverse] = await Promise.all([
    findForwardLinks(viewerId),
    findReverseLinks(viewerId),
  ]);
  if (forward.some((n) => n.linkedUserId === ownerId)) return true;
  if (reverse.some((n) => n.userId === ownerId)) return true;
  return false;
}
