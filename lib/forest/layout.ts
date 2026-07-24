import type { ForestGraph, ForestNodeDTO, GrowthStage } from "./types";

export type Vec3 = [number, number, number];

export interface PositionedNode {
  node: ForestNodeDTO;
  position: Vec3;
  /** Radius/scale hint for the renderer. */
  scale: number;
  parentId: string | null;
}

export interface Limb {
  from: Vec3;
  to: Vec3;
  kind: "branch" | "twig" | "root" | "fork" | "flare";
}

export interface Fork {
  base: Vec3;
  tip: Vec3;
}

export interface ForestLayout {
  trunkHeight: number;
  /** Height up the trunk where it splits into two main forks. */
  forkHeight: number;
  /** The two great forks the concept tree splits into. */
  forks: Fork[];
  positioned: PositionedNode[];
  limbs: Limb[];
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

// Scaled up dramatically so a mature tree TOWERS over the visitor — the brief
// asks that the user feel small beneath an enormous ancient trunk. These heights
// (in world units) are read directly by the renderer and the camera framing.
const TRUNK_HEIGHT: Record<GrowthStage, number> = {
  SEED: 0.5,
  SPROUT: 1.6,
  SAPLING: 3.0,
  YOUNG_TREE: 4.6,
  MATURE_TREE: 6.2,
  ANCIENT_TREE: 8.0,
};

// Deterministic 0..1 pseudo-random from a string id so layouts are stable.
function hash01(id: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/**
 * Compute deterministic 3D positions for every node in the forest, purely from
 * graph data. The renderer draws exactly what this returns — no hardcoded tree.
 */
export function computeLayout(graph: ForestGraph): ForestLayout {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const parentOf = new Map<string, string>();
  for (const e of graph.edges) {
    if (["CONTAINS", "ANCESTOR_OF", "FAMILY", "GREW_INTO"].includes(e.kind)) {
      parentOf.set(e.toNodeId, e.fromNodeId);
    }
  }
  const childrenOf = new Map<string, ForestNodeDTO[]>();
  for (const [childId, parentId] of parentOf) {
    const child = byId.get(childId);
    if (!child) continue;
    const arr = childrenOf.get(parentId) ?? [];
    arr.push(child);
    childrenOf.set(parentId, arr);
  }

  const seed = graph.nodes.find((n) => n.kind === "SEED");
  const trunk = graph.nodes.find((n) => n.kind === "TRUNK");
  const trunkHeight = TRUNK_HEIGHT[graph.stage];

  const positioned: PositionedNode[] = [];
  const limbs: Limb[] = [];

  // Seed / trunk sit at the origin.
  if (seed) positioned.push({ node: seed, position: [0, 0.1, 0], scale: 0.35, parentId: null });
  if (trunk) positioned.push({ node: trunk, position: [0, trunkHeight * 0.5, 0], scale: 1, parentId: seed?.id ?? null });

  // ---- The two great forks ----
  // Like the concept tree, the trunk rises a short way then splits into two
  // massive forks that lean out and up. Every branch is hung off one of these
  // forks (not the central pole), which is what gives the wide, spreading
  // silhouette. The gap between the forks is where the low sun burns through.
  const H = trunkHeight;
  const forkHeight = H * 0.34;
  const forkBase: Vec3 = [0, forkHeight, 0];
  const forks: Fork[] = [
    { base: forkBase, tip: [H * 0.42, H * 0.9, H * 0.07] },
    { base: forkBase, tip: [-H * 0.44, H * 0.88, -H * 0.06] },
  ];
  for (const f of forks) limbs.push({ from: f.base, to: f.tip, kind: "fork" });

  // ---- Above-ground root flare ----
  // Thick buttress roots spread from the base of the trunk and dive into the
  // earth, the mossy flare that anchors the concept tree to the ground.
  const FLARES = 6;
  for (let i = 0; i < FLARES; i++) {
    const a = (i / FLARES) * Math.PI * 2 + 0.3;
    const spread = 1.2 + hash01(`flare${i}`, 3) * 0.9;
    limbs.push({
      from: [Math.cos(a) * 0.12, forkHeight * 0.5, Math.sin(a) * 0.12],
      to: [Math.cos(a) * spread, -0.18 - hash01(`flare${i}`, 7) * 0.2, Math.sin(a) * spread],
      kind: "flare",
    });
  }

  // Branches hang off the two forks and reach outward, wide and low, building a
  // broad umbrella crown.
  const branches = trunk ? childrenOf.get(trunk.id)?.filter((c) => c.kind === "BRANCH") ?? [] : [];
  const branchTip = new Map<string, Vec3>();

  branches.forEach((branch, i) => {
    const fork = forks[i % forks.length];
    // Origin somewhere along the upper half of the chosen fork.
    const along = 0.55 + hash01(branch.id, 17) * 0.4;
    const base: Vec3 = [
      fork.base[0] + (fork.tip[0] - fork.base[0]) * along,
      fork.base[1] + (fork.tip[1] - fork.base[1]) * along,
      fork.base[2] + (fork.tip[2] - fork.base[2]) * along,
    ];
    // Reach outward roughly in the fork's direction, spread around it, mostly
    // horizontal with a gentle upward lift.
    const angle = i * GOLDEN_ANGLE + hash01(branch.id) * 0.6;
    const length = 1.5 + hash01(branch.id, 7) * 1.3;
    const lift = 0.2 + hash01(branch.id, 13) * 0.45;
    const outX = Math.sign(fork.tip[0]) || 1;
    const tip: Vec3 = [
      base[0] + Math.cos(angle) * length * 0.7 + outX * length * 0.5,
      base[1] + lift,
      base[2] + Math.sin(angle) * length,
    ];
    branchTip.set(branch.id, tip);
    positioned.push({ node: branch, position: tip, scale: 0.5, parentId: trunk!.id });
    limbs.push({ from: base, to: tip, kind: "branch" });

    // Leaves / flowers / fruit cluster around the branch tip.
    const foliage = childrenOf.get(branch.id) ?? [];
    foliage.forEach((leaf, j) => {
      const a = j * GOLDEN_ANGLE + hash01(leaf.id) * Math.PI * 2;
      const r = 0.25 + hash01(leaf.id, 3) * 0.35;
      const pos: Vec3 = [
        tip[0] + Math.cos(a) * r,
        tip[1] + (hash01(leaf.id, 5) - 0.4) * 0.5,
        tip[2] + Math.sin(a) * r,
      ];
      const scale = leaf.kind === "FLOWER" ? 0.22 : leaf.kind === "FRUIT" ? 0.2 : 0.14;
      positioned.push({ node: leaf, position: pos, scale, parentId: branch.id });
      limbs.push({ from: tip, to: pos, kind: "twig" });
    });
  });

  // Roots radiate below ground (heritage / family history).
  const roots = trunk ? childrenOf.get(trunk.id)?.filter((c) => c.kind === "ROOT") ?? [] : [];
  roots.forEach((root, i) => {
    const angle = i * GOLDEN_ANGLE + 0.9;
    const length = 1.1 + hash01(root.id, 11) * 0.7;
    const pos: Vec3 = [
      Math.cos(angle) * length,
      -0.35 - hash01(root.id, 2) * 0.5,
      Math.sin(angle) * length,
    ];
    positioned.push({ node: root, position: pos, scale: 0.28, parentId: trunk!.id });
    limbs.push({ from: [0, 0, 0], to: pos, kind: "root" });
  });

  // Family members live UNDERGROUND as glowing nodes in the root network —
  // each one a seed for their own future tree. They fan out and down from the
  // base at organic depths/distances so the roots read as a living web, not a
  // ring. A soft root "limb" ties each back to the base of the trunk.
  const people = seed ? childrenOf.get(seed.id)?.filter((c) => c.kind === "PERSON") ?? [] : [];
  people.forEach((person, i) => {
    const angle = i * GOLDEN_ANGLE + hash01(person.id, 4) * 0.7;
    const r = 1.5 + hash01(person.id, 8) * 1.9;
    const depth = 0.55 + hash01(person.id, 6) * 1.1;
    const pos: Vec3 = [Math.cos(angle) * r, -depth, Math.sin(angle) * r];
    positioned.push({ node: person, position: pos, scale: 0.34, parentId: seed!.id });
  });

  return { trunkHeight, forkHeight, forks, positioned, limbs };
}
