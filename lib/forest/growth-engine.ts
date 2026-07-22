import { prisma } from "@/lib/prisma";
import type { NodeKind, EdgeKind, LifeEpoch, Prisma } from "@prisma/client";
import { bindPersonToUser } from "@/lib/family-links";

/**
 * TREE GROWTH ENGINE
 * ------------------
 * Every meaningful interaction results in visible growth. Each interaction type
 * produces a specific Forest object:
 *
 *   Record Story        -> LEAF
 *   Upload Photo        -> PHOTO memory node
 *   Add Family Member   -> connected PERSON sapling
 *   Answer Question     -> LEAF on an existing branch
 *   Record Life Advice  -> FRUIT
 *   Major Life Event    -> FLOWER
 *   Family History      -> ROOT (expands the root system)
 *   Memory Moment       -> LEAF / FRUIT / FLOWER / ROOT (by moment type)
 *
 * The engine also grows the tree's scaffolding on demand: the SEED grows into a
 * TRUNK the first time content is added, and BRANCH nodes are created for each
 * category as needed. The Forest is the source of truth — nothing is hardcoded
 * in the UI; the renderer draws whatever the graph contains.
 */

export type InteractionType =
  | "record_story"
  | "upload_photo"
  | "add_family_member"
  | "answer_question"
  | "record_advice"
  | "major_life_event"
  | "family_history"
  | "memory_moment";

export interface GrowInput {
  type: InteractionType;
  title: string;
  summary?: string;
  /** Branch category the content belongs to (e.g. "Life Advice"). */
  branch?: string;
  epoch?: LifeEpoch;
  /** For add_family_member: the relationship label, e.g. "Wife", "Son". */
  relationship?: string;
  /** Free-form structured payload: transcript, audio url, people, tags, etc. */
  data?: Prisma.InputJsonValue;
  /** For memory_moment: quick_wisdom | family_story | tradition | recipe | time_capsule | legacy_message */
  momentType?: string;
}

interface Recipe {
  kind: NodeKind;
  score: number;
  defaultBranch: string;
}

// How each interaction maps to a Forest object + its legacy-score weight.
const RECIPES: Record<InteractionType, Recipe> = {
  record_story: { kind: "LEAF", score: 5, defaultBranch: "Favorite Stories" },
  upload_photo: { kind: "PHOTO", score: 3, defaultBranch: "Childhood Memories" },
  add_family_member: { kind: "PERSON", score: 8, defaultBranch: "Family" },
  answer_question: { kind: "LEAF", score: 6, defaultBranch: "Family Questions" },
  record_advice: { kind: "FRUIT", score: 12, defaultBranch: "Life Advice" },
  major_life_event: { kind: "FLOWER", score: 15, defaultBranch: "Milestones" },
  family_history: { kind: "ROOT", score: 10, defaultBranch: "Roots & Heritage" },
  memory_moment: { kind: "MEMORY_MOMENT", score: 7, defaultBranch: "Memory Moments" },
};

// Memory Moments feed different parts of the forest depending on their type.
const MOMENT_KIND: Record<string, NodeKind> = {
  quick_wisdom: "FRUIT",
  legacy_message: "FRUIT",
  recipe: "FRUIT",
  family_story: "LEAF",
  tradition: "FLOWER",
  time_capsule: "FLOWER",
};

export interface GrowResult {
  createdNodeId: string;
  createdKind: NodeKind;
  branchId: string | null;
  newLegacyScore: number;
}

/** Grow the forest in response to a single interaction. */
export async function grow(userId: string, input: GrowInput): Promise<GrowResult> {
  const recipe = RECIPES[input.type];

  // Memory Moments override the node kind based on their moment type.
  const kind: NodeKind =
    input.type === "memory_moment" && input.momentType && MOMENT_KIND[input.momentType]
      ? MOMENT_KIND[input.momentType]
      : recipe.kind;

  return prisma.$transaction(async (tx) => {
    const seed = await getSeed(tx, userId);

    // The seed grows into a trunk on the first piece of content.
    const trunk = await ensureTrunk(tx, userId, seed.id);

    // Roots attach directly under the trunk; people attach to the seed as
    // saplings; everything else hangs off a category branch.
    let branchId: string | null = null;
    let parentId = trunk.id;
    let parentEdge: EdgeKind = "CONTAINS";

    if (kind === "ROOT") {
      parentId = trunk.id;
      parentEdge = "ANCESTOR_OF";
    } else if (kind === "PERSON") {
      parentId = seed.id;
      parentEdge = "FAMILY";
    } else {
      const branchName = input.branch?.trim() || recipe.defaultBranch;
      const branch = await ensureBranch(tx, userId, trunk.id, branchName);
      branchId = branch.id;
      parentId = branch.id;
      parentEdge = "CONTAINS";
    }

    const node = await tx.forestNode.create({
      data: {
        userId,
        kind,
        title: input.title,
        summary: input.summary ?? null,
        epoch: input.epoch ?? null,
        score: recipe.score,
        data: input.data ?? undefined,
      },
    });

    await tx.forestEdge.create({
      data: {
        userId,
        kind: parentEdge,
        fromNodeId: parentId,
        toNodeId: node.id,
        label: kind === "PERSON" ? input.relationship ?? null : null,
      },
    });

    // Major life events also drop a timeline event so the tree and timeline
    // stay synchronized.
    if (input.type === "major_life_event") {
      const evt = await tx.forestNode.create({
        data: {
          userId,
          kind: "TIMELINE_EVENT",
          title: input.title,
          summary: input.summary ?? null,
          epoch: input.epoch ?? null,
          score: 0,
        },
      });
      await tx.forestEdge.create({
        data: { userId, kind: "OCCURRED_IN", fromNodeId: node.id, toNodeId: evt.id },
      });
    }

    const newLegacyScore = await recomputeLegacyScore(tx, userId);

    return {
      createdNodeId: node.id,
      createdKind: kind,
      branchId,
      newLegacyScore,
    };
  });
}

// --- scaffolding helpers -------------------------------------------------

type Tx = Prisma.TransactionClient;

async function getSeed(tx: Tx, userId: string) {
  const seed = await tx.forestNode.findFirst({
    where: { userId, kind: "SEED" },
  });
  if (!seed) {
    throw new Error("Forest has no seed. Was the account seeded on signup?");
  }
  return seed;
}

async function ensureTrunk(tx: Tx, userId: string, seedId: string) {
  const existing = await tx.forestNode.findFirst({
    where: { userId, kind: "TRUNK" },
  });
  if (existing) return existing;

  const trunk = await tx.forestNode.create({
    data: {
      userId,
      kind: "TRUNK",
      title: "Life Journey",
      summary: "The trunk of this legacy — it grows as the story is told.",
      score: 5,
    },
  });
  await tx.forestEdge.create({
    data: { userId, kind: "GREW_INTO", fromNodeId: seedId, toNodeId: trunk.id },
  });
  return trunk;
}

async function ensureBranch(tx: Tx, userId: string, trunkId: string, name: string) {
  const existing = await tx.forestNode.findFirst({
    where: { userId, kind: "BRANCH", title: name },
  });
  if (existing) return existing;

  const branch = await tx.forestNode.create({
    data: { userId, kind: "BRANCH", title: name, score: 2 },
  });
  await tx.forestEdge.create({
    data: { userId, kind: "CONTAINS", fromNodeId: trunkId, toNodeId: branch.id },
  });
  return branch;
}

/** Legacy score = sum of every node's score. Recomputed after each growth. */
export async function recomputeLegacyScore(tx: Tx, userId: string): Promise<number> {
  const agg = await tx.forestNode.aggregate({
    where: { userId },
    _sum: { score: true },
  });
  return agg._sum.score ?? 0;
}

/**
 * Find an existing family member (PERSON node) by name, or plant one as a new
 * sapling. Names are matched case-insensitively so "Mom" isn't planted twice.
 * Returns the PERSON node's id.
 */
export async function ensurePerson(
  userId: string,
  name: string,
  relationship?: string,
): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("A person needs a name.");

  const existing = await prisma.forestNode.findFirst({
    where: { userId, kind: "PERSON", title: { equals: trimmed, mode: "insensitive" } },
  });
  if (existing) return existing.id;

  const res = await grow(userId, {
    type: "add_family_member",
    title: trimmed,
    relationship,
  });
  return res.createdNodeId;
}

/**
 * Weave a semantic thread: this memory MENTIONS this person. Idempotent — the
 * ForestEdge unique constraint (from, to, kind) makes re-linking a no-op.
 */
export async function linkMention(
  userId: string,
  memoryNodeId: string,
  personNodeId: string,
): Promise<void> {
  if (memoryNodeId === personNodeId) return;
  await prisma.forestEdge.upsert({
    where: {
      fromNodeId_toNodeId_kind: {
        fromNodeId: memoryNodeId,
        toNodeId: personNodeId,
        kind: "MENTIONS",
      },
    },
    update: {},
    create: {
      userId,
      kind: "MENTIONS",
      fromNodeId: memoryNodeId,
      toNodeId: personNodeId,
    },
  });
}

// Common family relationships and their inverse, so when someone is invited as
// my "Son" I show up in their forest as their "Father" (best-effort — falls
// back to the inviter's own family role, then a plain "Family" label).
const RECIPROCAL: Record<string, string> = {
  mother: "Child",
  father: "Child",
  son: "Parent",
  daughter: "Parent",
  brother: "Sibling",
  sister: "Sibling",
  grandmother: "Grandchild",
  grandfather: "Grandchild",
  grandson: "Grandparent",
  granddaughter: "Grandparent",
  wife: "Husband",
  husband: "Wife",
  partner: "Partner",
  aunt: "Niece/Nephew",
  uncle: "Niece/Nephew",
  cousin: "Cousin",
  niece: "Aunt/Uncle",
  nephew: "Aunt/Uncle",
  friend: "Friend",
};

function reciprocalRelationship(relationship?: string | null, fallback?: string | null): string {
  if (relationship) {
    const key = relationship.trim().toLowerCase();
    if (RECIPROCAL[key]) return RECIPROCAL[key];
  }
  return fallback?.trim() || "Family";
}

/**
 * Link two real accounts into one family forest (both directions).
 *
 * - The inviter's placeholder PERSON node (if given) is bound to the invitee's
 *   account via linkedUserId; otherwise one is planted for them.
 * - A PERSON node representing the inviter is planted in the invitee's forest
 *   and bound back to the inviter's account.
 *
 * Idempotent: re-linking an already-linked pair is a safe no-op.
 */
export async function linkAccounts(params: {
  inviterId: string;
  inviteeId: string;
  personNodeId?: string | null;
  relationship?: string | null;
}): Promise<void> {
  const { inviterId, inviteeId, personNodeId, relationship } = params;
  if (inviterId === inviteeId) return;

  const [inviterProfile, inviteeProfile] = await Promise.all([
    prisma.profile.findUnique({ where: { userId: inviterId } }),
    prisma.profile.findUnique({ where: { userId: inviteeId } }),
  ]);
  const inviterName = inviterProfile?.displayName ?? "Family";
  const inviteeName = inviteeProfile?.displayName ?? "Family";

  // 1. Bind the inviter-side PERSON node to the invitee's account.
  let inviterSideNodeId = personNodeId ?? null;
  if (inviterSideNodeId) {
    const node = await prisma.forestNode.findFirst({
      where: { id: inviterSideNodeId, userId: inviterId, kind: "PERSON" },
    });
    if (!node) inviterSideNodeId = null;
  }
  if (!inviterSideNodeId) {
    inviterSideNodeId = await ensurePerson(inviterId, inviteeName, relationship ?? undefined);
  }
  await bindPersonToUser(inviterSideNodeId, inviteeId);

  // 2. Plant / find the inviter as a PERSON in the invitee's forest and bind it.
  const reciprocal = reciprocalRelationship(relationship, inviterProfile?.familyPosition);
  const inviteeSideNodeId = await ensurePerson(inviteeId, inviterName, reciprocal);
  await bindPersonToUser(inviteeSideNodeId, inviterId);
}

/** Create the initial SEED for a brand-new account. */
export async function plantSeed(
  userId: string,
  displayName: string,
): Promise<void> {
  await prisma.forestNode.create({
    data: {
      userId,
      kind: "SEED",
      title: `${displayName}'s Seed`,
      summary: "Untold potential. Every story told will grow this into a tree.",
      score: 1,
    },
  });
}
