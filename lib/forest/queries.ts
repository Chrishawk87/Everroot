import { prisma } from "@/lib/prisma";
import { stageForScore, type ForestGraph, type ForestNodeDTO, type ForestEdgeDTO } from "./types";
import type { NodeKind } from "@prisma/client";

const ALL_KINDS: NodeKind[] = [
  "SEED", "ROOT", "TRUNK", "BRANCH", "SUB_BRANCH", "LEAF", "FLOWER",
  "FRUIT", "MEMORY", "PHOTO", "PERSON", "RELATIONSHIP", "TIMELINE_EVENT", "MEMORY_MOMENT",
];

function emptyCounts(): Record<NodeKind, number> {
  return ALL_KINDS.reduce((acc, k) => {
    acc[k] = 0;
    return acc;
  }, {} as Record<NodeKind, number>);
}

/** Load the entire forest for a user. The renderer builds itself from this. */
export async function getForest(userId: string): Promise<ForestGraph | null> {
  const [profile, nodes, edges] = await Promise.all([
    prisma.profile.findUnique({ where: { userId } }),
    prisma.forestNode.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.forestEdge.findMany({ where: { userId } }),
  ]);

  if (!profile) return null;

  const counts = emptyCounts();
  let legacyScore = 0;
  for (const n of nodes) {
    counts[n.kind] += 1;
    legacyScore += n.score;
  }

  const nodeDTOs: ForestNodeDTO[] = nodes.map((n) => ({
    id: n.id,
    kind: n.kind,
    title: n.title,
    summary: n.summary,
    epoch: n.epoch,
    score: n.score,
    createdAt: n.createdAt.toISOString(),
    data: (n.data as Record<string, unknown> | null) ?? null,
    linkedUserId: n.linkedUserId,
  }));

  const edgeDTOs: ForestEdgeDTO[] = edges.map((e) => ({
    id: e.id,
    kind: e.kind,
    fromNodeId: e.fromNodeId,
    toNodeId: e.toNodeId,
    label: e.label,
  }));

  return {
    profile: {
      displayName: profile.displayName,
      birthYear: profile.birthYear,
      familyPosition: profile.familyPosition,
    },
    nodes: nodeDTOs,
    edges: edgeDTOs,
    legacyScore,
    stage: stageForScore(legacyScore),
    counts,
  };
}

// One tree in the family forest — a linked member's forest plus how they relate
// to the person viewing.
export interface FamilyMemberForest {
  userId: string;
  relationship: string | null;
  graph: ForestGraph;
}

export interface FamilyForest {
  self: ForestGraph;
  members: FamilyMemberForest[];
}

/**
 * Gather every tree connected to this user into one family forest: the user's
 * own tree, everyone they've invited (forward links), and everyone who linked
 * to them (reverse links). One hop — direct family only, for now.
 */
export async function getFamilyForest(userId: string): Promise<FamilyForest | null> {
  const self = await getForest(userId);
  if (!self) return null;

  // Forward links: PERSON nodes in MY forest bound to a real account.
  const forward = await prisma.forestNode.findMany({
    where: { userId, kind: "PERSON", linkedUserId: { not: null } },
  });
  // Reverse links: PERSON nodes in OTHER forests bound to ME.
  const reverse = await prisma.forestNode.findMany({
    where: { kind: "PERSON", linkedUserId: userId },
  });

  // Relationship label per linked user (prefer the label on my side).
  const relById = new Map<string, string | null>();
  const memberIds = new Set<string>();

  for (const node of forward) {
    if (!node.linkedUserId || node.linkedUserId === userId) continue;
    memberIds.add(node.linkedUserId);
    const fam = await prisma.forestEdge.findFirst({
      where: { userId, kind: "FAMILY", toNodeId: node.id },
    });
    if (!relById.has(node.linkedUserId)) relById.set(node.linkedUserId, fam?.label ?? null);
  }
  for (const node of reverse) {
    if (node.userId === userId) continue;
    memberIds.add(node.userId);
    if (!relById.has(node.userId)) relById.set(node.userId, null);
  }

  const members: FamilyMemberForest[] = [];
  for (const memberId of memberIds) {
    const graph = await getForest(memberId);
    if (graph) {
      members.push({ userId: memberId, relationship: relById.get(memberId) ?? null, graph });
    }
  }

  return { self, members };
}
