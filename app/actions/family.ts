"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { invites, linkedUserIdOf } from "@/lib/family-links";

// Human-friendly invite code — no ambiguous characters (0/O, 1/I/L).
function generateCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
    if (i === 3) out += "-";
  }
  return out; // e.g. "AB3K-M7QP"
}

export interface InviteResult {
  ok: boolean;
  code?: string;
  error?: string;
}

/**
 * Generate a shareable invite that ties a placeholder PERSON in the caller's
 * forest to a future family account. If an unclaimed invite already exists for
 * that person, it's reused so the same code keeps working.
 */
export async function createInvite(params: {
  personNodeId?: string;
  personName?: string;
  relationship?: string;
}): Promise<InviteResult> {
  const session = await auth();
  const inviterId = session?.user?.id;
  if (!inviterId) return { ok: false, error: "Not signed in" };

  let personNodeId = params.personNodeId ?? null;
  let inviteeName = params.personName ?? null;
  let relationship = params.relationship ?? null;

  // Validate the person node belongs to the caller and pull its name/relationship.
  if (personNodeId) {
    const node = await prisma.forestNode.findFirst({
      where: { id: personNodeId, userId: inviterId, kind: "PERSON" },
    });
    if (!node) return { ok: false, error: "That family member could not be found" };
    inviteeName = inviteeName ?? node.title;
    if (linkedUserIdOf(node)) {
      return { ok: false, error: `${node.title} has already joined the forest` };
    }
    const fam = await prisma.forestEdge.findFirst({
      where: { userId: inviterId, kind: "FAMILY", toNodeId: personNodeId },
    });
    relationship = relationship ?? fam?.label ?? null;

    // Reuse an existing unclaimed invite for this person.
    const existing = await invites().findFirst({
      where: { inviterId, personNodeId, claimedById: null },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return { ok: true, code: existing.code };
  }

  // Generate a unique code (retry on the rare collision).
  let code = generateCode();
  for (let i = 0; i < 5; i++) {
    const clash = await invites().findUnique({ where: { code } });
    if (!clash) break;
    code = generateCode();
  }

  await invites().create({
    data: { code, inviterId, personNodeId, relationship, inviteeName },
  });

  return { ok: true, code };
}

export interface InvitePreview {
  code: string;
  inviterName: string;
  relationship: string | null;
  inviteeName: string | null;
}

/** Look up an unclaimed invite by code — used to greet the invitee on signup. */
export async function getInviteByCode(code: string): Promise<InvitePreview | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;

  const invite = await invites().findUnique({ where: { code: normalized } });
  if (!invite || invite.claimedById) return null;

  const inviterProfile = await prisma.profile.findUnique({
    where: { userId: invite.inviterId },
  });

  return {
    code: invite.code,
    inviterName: inviterProfile?.displayName ?? "A family member",
    relationship: invite.relationship,
    inviteeName: invite.inviteeName,
  };
}
