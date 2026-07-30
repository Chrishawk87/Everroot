import type { ForestGraph, ForestNodeDTO } from "./types";

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
  kind: "branch" | "sub" | "twig" | "root" | "fork" | "flare";
}

export interface Fork {
  base: Vec3;
  tip: Vec3;
}

/** A healed wound in the bark — one per hardship/lesson the life carried
 *  through. Placed on the lower/mid trunk; glows faintly gold (scars that
 *  became wisdom). */
export interface Scar {
  /** World position of the scar's centre on the trunk surface. */
  pos: Vec3;
  /** Rotation about the trunk axis so the seam faces outward. */
  angle: number;
  /** Length of the vertical seam. */
  size: number;
}

/** A concentric ripple ring in the underground root network — one per
 *  generation of family/heritage, radiating outward like growth rings of the
 *  whole lineage, not just this one tree. */
export interface GenRing {
  radius: number;
  depth: number;
}

export interface ForestLayout {
  trunkHeight: number;
  /** Height up the trunk where it splits into two main forks. */
  forkHeight: number;
  /** The two great forks the concept tree splits into. */
  forks: Fork[];
  positioned: PositionedNode[];
  limbs: Limb[];
  /** Healed bark wounds — one per hardship the life carried through. */
  scars: Scar[];
  /** Underground generational rings — one per generation of family/heritage. */
  genRings: GenRing[];
  /** Cumulative lean of the whole crown, read from life milestones. Applied to
   *  the fork tips and the crown centre so big turning-points visibly bend the
   *  silhouette (a new dominant direction), always clamped so the tree still
   *  stands gracefully. Expressed as a fraction of trunk height. */
  crownLean: Vec3;
  /** ---- Continuous growth grammar (form read from the life, not a stage bucket) ---- */
  /** Trunk girth at the ground — grows with the volume of a life's memories. */
  trunkRadiusBottom: number;
  /** Trunk girth where it meets the forks (flows smoothly into them). */
  trunkRadiusTop: number;
  /** Crown spread, proportional to height so the tree always reads as balanced. */
  crownRadius: number;
  /** How many decorative leaves fill the crown at this size/fullness. */
  crownCount: number;
  /** 0..1 canopy fullness (memories + life-themes) — drives leaf density. */
  crownFullness: number;
  /** Multiplier applied to every limb's thickness so branches stay in
   *  proportion to the trunk at any size (a small tree has fine twigs, an
   *  ancient one has massive boughs). 1.0 ≈ a fully mature tree. */
  girthScale: number;
}

// Smooth, saturating 0..1 curve: rises quickly at first, then eases toward 1 and
// never exceeds it — so more memories always add a little, but the tree can never
// balloon into something grotesque. `k` is the value at which it reaches ~0.63.
function saturate(x: number, k: number): number {
  return x <= 0 ? 0 : 1 - Math.exp(-x / k);
}

// Node kinds that represent an actual remembered moment (as opposed to the
// tree's structural scaffolding). Total memory volume drives trunk girth and
// canopy fullness.
const MEMORY_KINDS_FOR_GROWTH: string[] = [
  "LEAF", "FLOWER", "FRUIT", "MEMORY_MOMENT", "PHOTO", "MEMORY",
];

// The seven life epochs, in the order a life is lived. A branch's position in
// this sequence decides where its chapter hangs on the tree, so the crown reads
// chronologically — the earliest years to one side, the latest to the other.
const EPOCH_ORDER: string[] = [
  "ROOTS", "FIRST_STEPS", "CROSSROADS", "ANCHORS", "STORMS", "HARVEST", "HORIZONS",
];

export interface GrowthMetrics {
  trunkHeight: number;
  trunkRadiusBottom: number;
  trunkRadiusTop: number;
  crownRadius: number;
  crownCount: number;
  crownFullness: number;
  girthScale: number;
}

/**
 * The heart of the "grows inward" idea: translate a life's data directly into
 * the tree's FORM. Everything here is deterministic (same life → same tree) and
 * cumulative (form only ever grows), and every mapping is constrained so that
 * any possible tree still reads as a gorgeous, balanced ancient tree.
 *
 *   legacy score      → overall height (a life's fullness lifts the whole tree)
 *   memory volume      → trunk girth + a little extra height (thickening rings)
 *   memories + themes  → canopy fullness (leaf density) + crown spread
 *
 * Trunk girth and crown spread are kept PROPORTIONAL to height, so the tree is
 * never top-heavy or spindly — the data moves its size and fullness, never its
 * good proportions.
 */
export function computeGrowth(_graph: ForestGraph): GrowthMetrics {
  // MATURE FROM DAY ONE.
  // The tree is a finished monument the moment an account is created — its size
  // and fullness never change. A life's data no longer grows the tree itself;
  // it fills the tree's lanterns (its ten category lanterns and one lantern per
  // family member). So these metrics are fixed at "grand mature tree" values,
  // independent of legacy score or memory count. Every camera / fog / shadow /
  // environment dimension downstream derives from trunkHeight, so the whole
  // scene stays composed around this one constant size.
  const growth01 = 0.78; // a grand, mature tree (just shy of the old "ancient" ceiling)
  const girth01 = 0.7; // full, aged trunk
  const fullness01 = 0.85; // lush, layered crown

  const HERO = 2.6;
  const baseHeight = 0.5 + 10.5 * growth01;
  const trunkHeight = baseHeight * HERO;

  // Girth kept proportional to height (never top-heavy or spindly).
  const trunkRadiusBottom = trunkHeight * 0.085 + girth01 * 0.08;
  // 0.7 was the old fully-grown base radius; normalising against it keeps the
  // hand-tuned branch proportions intact.
  const girthScale = Math.max(0.28, trunkRadiusBottom / 0.7);
  const trunkRadiusTop = 0.19 * girthScale;

  // A dense, layered crown — full and deep. (The hero GLB brings its own
  // foliage; these values still feed layout positioning.)
  const crownFullness = 0.35 + 0.65 * fullness01;
  const crownRadius = trunkHeight * 0.66 + crownFullness * 0.6;
  const crownCount = Math.round(
    Math.min(6000, 34 * crownRadius * crownRadius * (0.4 + 0.6 * crownFullness)),
  );

  return {
    trunkHeight,
    trunkRadiusBottom,
    trunkRadiusTop,
    crownRadius,
    crownCount,
    crownFullness,
    girthScale,
  };
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

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
  // The tree's dimensions are read continuously from the life itself.
  const growth = computeGrowth(graph);
  const trunkHeight = growth.trunkHeight;

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

  // ---- Milestone lean: turning-points bend the silhouette ----
  // Every major life event (a FLOWER / "Milestones" memory) nudges the whole
  // crown in a stable direction unique to that event. The nudges accumulate —
  // a life full of bold turns leans further and grows a clearly dominant
  // direction — but the total is saturated and clamped so the tree always
  // stands gracefully rather than toppling. Deterministic: same milestones →
  // same lean, forever.
  const milestones = graph.nodes.filter(
    (n) => n.kind === "FLOWER" || /milestone|graduat|wedding|married|born|birth|first|moved|founded|launch/i.test(n.title),
  );
  let leanX = 0;
  let leanZ = 0;
  for (const m of milestones) {
    const dir = hash01(m.id, 71) * Math.PI * 2;
    const w = 0.12 + hash01(m.id, 72) * 0.1;
    leanX += Math.cos(dir) * w;
    leanZ += Math.sin(dir) * w;
  }
  // Saturate the magnitude so many milestones keep bending but ever less, and
  // clamp to a graceful maximum lean (~18% of height in any direction).
  const rawLean = Math.hypot(leanX, leanZ);
  const LEAN_MAX = 0.18;
  const leanScale = rawLean > 0 ? (LEAN_MAX * saturate(rawLean, 0.6)) / rawLean : 0;
  const crownLean: Vec3 = [leanX * leanScale, 0, leanZ * leanScale];

  // Split higher up so there's a real, tall trunk before the crown — a grand
  // tree, not a low slingshot. The forks then sweep UP and out, reaching above
  // the trunk's nominal height so the whole tree reads as towering. The whole
  // crown then leans by `crownLean`, so life's turning-points bend the tree.
  const forkHeight = H * 0.44;
  const forkBase: Vec3 = [0, forkHeight, 0];
  const forks: Fork[] = [
    { base: forkBase, tip: [H * 0.34 + crownLean[0] * H, H * 1.04, H * 0.05 + crownLean[2] * H] },
    { base: forkBase, tip: [-H * 0.36 + crownLean[0] * H, H * 1.02, -H * 0.05 + crownLean[2] * H] },
  ];
  for (const f of forks) limbs.push({ from: f.base, to: f.tip, kind: "fork" });

  // ---- How rooted is this life? ----
  // Family and heritage anchor a person. The more people in the forest and the
  // more heritage roots recorded, the stronger and deeper the tree's root
  // system reads — a visible measure of how rooted a life is. Saturating +
  // constrained, like every other mapping, so it never overwhelms the tree.
  const counts2 = graph.counts as Record<string, number>;
  const personCount = counts2.PERSON ?? 0;
  const rootNodeCount = counts2.ROOT ?? 0;
  const relCount = counts2.RELATIONSHIP ?? 0;
  const rootedness = saturate(personCount * 1.5 + rootNodeCount + relCount, 8); // 0..1

  // ---- Above-ground root flare ----
  // Thick buttress roots spread from the base of the trunk and dive into the
  // earth. A more rooted life grows more of them, spread wider, and scaled to
  // the trunk's girth so they always look like they belong to this tree.
  const gs = growth.girthScale;
  const FLARES = 5 + Math.round(rootedness * 5); // 5..10
  const flareStart = growth.trunkRadiusBottom * 0.85;
  for (let i = 0; i < FLARES; i++) {
    const a = (i / FLARES) * Math.PI * 2 + 0.3;
    const spread = (1.2 + hash01(`flare${i}`, 3) * 0.9) * (1 + rootedness * 0.7) * (0.7 + gs * 0.3);
    limbs.push({
      from: [Math.cos(a) * flareStart, growth.trunkRadiusBottom * 0.5, Math.sin(a) * flareStart],
      to: [Math.cos(a) * spread, -0.18 - hash01(`flare${i}`, 7) * 0.2, Math.sin(a) * spread],
      kind: "flare",
    });
  }

  // Deep taproots dive straight down and anchor the tree; the more rooted the
  // life, the more of them and the deeper they reach. These read through the
  // see-through soil as the tree's foundation.
  const TAPROOTS = Math.round(rootedness * 5); // 0..5
  for (let i = 0; i < TAPROOTS; i++) {
    const a = (i / Math.max(1, TAPROOTS)) * Math.PI * 2 + 1.1;
    const reach = 0.35 + hash01(`tap${i}`, 4) * 0.6;
    const depth = 1.4 + rootedness * 2.6 + hash01(`tap${i}`, 9) * 0.8;
    limbs.push({
      from: [Math.cos(a) * flareStart * 0.6, growth.trunkRadiusBottom * 0.2, Math.sin(a) * flareStart * 0.6],
      to: [Math.cos(a) * reach, -depth, Math.sin(a) * reach],
      kind: "root",
    });
  }

  // ---- Epoch density: how full each chapter of a life is ----
  // Every remembered moment is tallied under its life-epoch. The busiest chapter
  // becomes the reference (1.0) and quieter chapters reach proportionally less.
  // This is what turns the crown into a readable fingerprint: a life heavy in
  // "Harvest" wears its weight differently from one heavy in "First Steps".
  const epochMemoryCount = new Map<string, number>();
  for (const n of graph.nodes) {
    if (!MEMORY_KINDS_FOR_GROWTH.includes(n.kind) || !n.epoch) continue;
    epochMemoryCount.set(n.epoch, (epochMemoryCount.get(n.epoch) ?? 0) + 1);
  }
  const maxEpochMemories = Math.max(1, ...epochMemoryCount.values());

  // Which chapter of life a branch belongs to: prefer its own epoch, else the
  // plurality epoch of the memories hanging from it, so a branch always sits
  // where its stories actually live. Null when nothing says otherwise.
  const branchEpoch = (branch: ForestNodeDTO, foliage: ForestNodeDTO[]): string | null => {
    if (branch.epoch) return branch.epoch;
    const tally = new Map<string, number>();
    for (const f of foliage) if (f.epoch) tally.set(f.epoch, (tally.get(f.epoch) ?? 0) + 1);
    let best: string | null = null;
    let bestN = 0;
    for (const [e, n] of tally) if (n > bestN) { best = e; bestN = n; }
    return best;
  };

  // Branches hang off the two forks and reach outward, wide and low, building a
  // broad umbrella crown. Their reach and side are read from the life itself:
  // chronology decides which fork (early years to one side, later to the other)
  // and the chapter's density decides how far the bough reaches and how heavy
  // its foliage — all clamped so the tree never loses its balance.
  const branches = trunk ? childrenOf.get(trunk.id)?.filter((c) => c.kind === "BRANCH") ?? [] : [];
  const branchTip = new Map<string, Vec3>();

  branches.forEach((branch, i) => {
    const foliage = childrenOf.get(branch.id) ?? [];
    const epoch = branchEpoch(branch, foliage);
    const epochIdx = epoch ? EPOCH_ORDER.indexOf(epoch) : -1;

    // Chapter density, 0..1 (neutral 0.5 when the epoch is unknown). It nudges
    // reach and lift within tight bounds so a lopsided life still reads as a
    // gorgeous, balanced tree — the signal is legible, never distorting.
    const density = epoch ? (epochMemoryCount.get(epoch) ?? 0) / maxEpochMemories : 0.5;
    const reachMul = 0.82 + 0.34 * density; // 0.82 .. 1.16

    // Chronology chooses the great fork (and thus the side): earliest chapters
    // to one side, latest to the other, so the crown reads like a life told
    // left to right. Unknown epochs alternate so they still spread evenly.
    const chronoT = epochIdx >= 0 ? epochIdx / (EPOCH_ORDER.length - 1) : (i % 2);
    const fork = forks[chronoT < 0.5 ? 1 : 0];

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
    const length = (1.5 + hash01(branch.id, 7) * 1.3) * reachMul;
    const lift = (0.2 + hash01(branch.id, 13) * 0.45) * (0.85 + 0.3 * density);
    const outX = Math.sign(fork.tip[0]) || 1;
    const tip: Vec3 = [
      base[0] + Math.cos(angle) * length * 0.7 + outX * length * 0.5,
      base[1] + lift,
      base[2] + Math.sin(angle) * length,
    ];
    branchTip.set(branch.id, tip);
    positioned.push({ node: branch, position: tip, scale: 0.5, parentId: trunk!.id });
    limbs.push({ from: base, to: tip, kind: "branch" });

    // Secondary boughs fork off each main branch, reaching further up and out,
    // so an ancient tree reads as a full, layered crown rather than a bare
    // armature. Purely structural (no memory hangs on them); a fuller chapter
    // grows one or two more of them.
    const subCount = 1 + Math.round(hash01(branch.id, 21) * (0.6 + density));
    for (let s = 0; s < subCount; s++) {
      const at = 0.45 + hash01(branch.id, 30 + s) * 0.32;
      const from: Vec3 = [
        base[0] + (tip[0] - base[0]) * at,
        base[1] + (tip[1] - base[1]) * at,
        base[2] + (tip[2] - base[2]) * at,
      ];
      const spin = angle + (s - 0.5) * 1.1 + hash01(branch.id, 40 + s) * 0.6;
      const slen = length * (0.42 + hash01(branch.id, 50 + s) * 0.4);
      const subTip: Vec3 = [
        from[0] + Math.cos(spin) * slen * 0.7 + outX * slen * 0.32,
        from[1] + 0.3 + hash01(branch.id, 60 + s) * 0.6,
        from[2] + Math.sin(spin) * slen,
      ];
      limbs.push({ from, to: subTip, kind: "sub" });

      // Tertiary twigs fork off each secondary bough, building a second, deeper
      // layer of the crown so the canopy reads with real depth instead of a
      // single shell of leaves. These also carry foliage anchors.
      const twigCount = 1 + Math.round(hash01(branch.id, 70 + s) * (0.5 + density));
      for (let w = 0; w < twigCount; w++) {
        const twAt = 0.5 + hash01(branch.id, 80 + s * 3 + w) * 0.4;
        const twFrom: Vec3 = [
          from[0] + (subTip[0] - from[0]) * twAt,
          from[1] + (subTip[1] - from[1]) * twAt,
          from[2] + (subTip[2] - from[2]) * twAt,
        ];
        const twSpin = spin + (w - 0.5) * 1.3 + hash01(branch.id, 90 + w) * 0.7;
        const twLen = slen * (0.4 + hash01(branch.id, 100 + w) * 0.35);
        const twTip: Vec3 = [
          twFrom[0] + Math.cos(twSpin) * twLen * 0.7 + outX * twLen * 0.25,
          twFrom[1] + 0.25 + hash01(branch.id, 110 + w) * 0.5,
          twFrom[2] + Math.sin(twSpin) * twLen,
        ];
        limbs.push({ from: twFrom, to: twTip, kind: "sub" });
      }
    }

    // Leaves / flowers / fruit cluster around the branch tip; a fuller chapter
    // wears a slightly wider, richer cluster.
    const foliageSpread = 0.9 + 0.25 * density;
    foliage.forEach((leaf, j) => {
      const a = j * GOLDEN_ANGLE + hash01(leaf.id) * Math.PI * 2;
      const r = (0.25 + hash01(leaf.id, 3) * 0.35) * foliageSpread;
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

  // Roots radiate below ground (heritage / family history). A more rooted life
  // pushes them wider and deeper so the foundation visibly matches the family
  // above it.
  const roots = trunk ? childrenOf.get(trunk.id)?.filter((c) => c.kind === "ROOT") ?? [] : [];
  roots.forEach((root, i) => {
    const angle = i * GOLDEN_ANGLE + 0.9;
    const length = (1.1 + hash01(root.id, 11) * 0.7) * (1 + rootedness * 0.6);
    const pos: Vec3 = [
      Math.cos(angle) * length,
      -0.35 - hash01(root.id, 2) * 0.5 - rootedness * 0.7,
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
    // Tie each family member into the root network with a soft root limb so the
    // name node reads as growing out of the tree's roots, not floating loose.
    limbs.push({ from: [0, growth.trunkRadiusBottom * 0.2, 0], to: pos, kind: "root" });
  });

  // ---- Healed scars: the hardships a life carried through ----
  // Every storm, loss, mistake or hard-won lesson leaves a permanent mark in
  // the bark — but a HEALED one, glowing faintly gold, because scars are where
  // wisdom grew. They climb the lower/mid trunk in the order they were lived,
  // each facing a stable direction. Deterministic and cumulative: a scar, once
  // earned, never disappears.
  const adversity = graph.nodes
    .filter(
      (n) =>
        n.epoch === "STORMS" ||
        /mistake|regret|loss|lost|grief|lesson|hard|storm|struggl|fail|divorce|illness/i.test(n.title),
    )
    // Stable order so scars stack the same way every render.
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  const scars: Scar[] = [];
  const scarCount = Math.min(adversity.length, 14);
  for (let i = 0; i < scarCount; i++) {
    const n = adversity[i];
    // Climb the lower two-thirds of the trunk, spaced so they never crowd.
    const t = scarCount === 1 ? 0.4 : 0.12 + (i / (scarCount - 1)) * 0.62;
    const y = forkHeight * t;
    // Trunk radius tapers from bottom to the fork; sit the scar on the surface.
    const rHere = growth.trunkRadiusBottom + (growth.trunkRadiusTop - growth.trunkRadiusBottom) * t;
    const angle = hash01(n.id, 91) * Math.PI * 2;
    const size = (0.5 + hash01(n.id, 92) * 0.8) * (0.6 + growth.girthScale * 0.4);
    scars.push({
      pos: [Math.cos(angle) * rHere, y, Math.sin(angle) * rHere],
      angle,
      size,
    });
  }

  // ---- Generational rings: the whole lineage, not just this tree ----
  // The underground network expands by one ring per generation of family and
  // heritage recorded — parents, grandparents, and the future generations that
  // will grow from these seeds. Each ring is a faint gold ripple radiating
  // outward beneath the forest floor, so the roots read as belonging to a much
  // larger family story.
  const generations = 1 + Math.round(saturate(personCount + rootNodeCount, 5) * 3); // 1..4
  const genRings: GenRing[] = [];
  for (let g = 0; g < generations; g++) {
    genRings.push({
      radius: 1.4 + g * (1.3 + rootedness * 0.9),
      depth: 0.5 + g * 0.55,
    });
  }

  return {
    trunkHeight,
    forkHeight,
    forks,
    positioned,
    limbs,
    scars,
    genRings,
    crownLean,
    trunkRadiusBottom: growth.trunkRadiusBottom,
    trunkRadiusTop: growth.trunkRadiusTop,
    crownRadius: growth.crownRadius,
    crownCount: growth.crownCount,
    crownFullness: growth.crownFullness,
    girthScale: growth.girthScale,
  };
}
