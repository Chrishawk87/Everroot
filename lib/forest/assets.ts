/**
 * EverRoot production asset registry.
 *
 * This is the single source of truth for every production-quality asset the
 * forest scene loads. Nothing in the environment is generated from primitive
 * meshes or canvas textures any more — each surface (terrain, bark, leaves,
 * rocks, flowers, water, sky) is a real PBR asset referenced here and loaded at
 * runtime from `/public/assets/...` (served at `/assets/...`).
 *
 * Adding a new asset is a data change, not a code change: drop the file into the
 * documented path, add an entry here, and reference its id from the scene. When
 * a referenced file is not yet installed, the loader layer renders NOTHING for
 * it (never a placeholder primitive) — see components/forest/assets/.
 *
 * Sourcing + exact file placement is documented in ASSETS.md at the repo root.
 */

/** A physically-based texture set for a surface material. All maps optional
 *  except `map` (albedo/basecolor). Paths are under /public. */
export interface PbrMapSet {
  /** Albedo / base color (sRGB). */
  map: string;
  normalMap?: string;
  roughnessMap?: string;
  metalnessMap?: string;
  aoMap?: string;
  displacementMap?: string;
}

export interface MaterialAsset {
  id: string;
  maps: PbrMapSet;
  /** Tiling across the surface. */
  repeat?: [number, number];
  /** Height displacement in world units (needs geometry with segments). */
  displacementScale?: number;
  /** Optional roughness/metalness scalars when no map is supplied. */
  roughness?: number;
  metalness?: number;
}

export interface ModelAsset {
  id: string;
  /** glTF/GLB path under /public. Draco/Meshopt compressed is supported. */
  url: string;
  /** Uniform scale applied to the loaded model. */
  scale?: number;
}

export interface HdriAsset {
  id: string;
  /** Equirectangular .hdr/.exr path under /public. */
  url: string;
}

// ---------------------------------------------------------------------------
// HDRI — image-based lighting + (optional) sky. Drives every material's
// reflections and ambient light, which is the single biggest lever on photoreal
// look. Poly Haven ships production-grade CC0 .hdr that fits a premium pipeline.
// ---------------------------------------------------------------------------
export const HDRI: Record<string, HdriAsset> = {
  golden_hour: { id: "golden_hour", url: "/assets/hdri/golden_hour.hdr" },
  overcast: { id: "overcast", url: "/assets/hdri/overcast.hdr" },
};

// ---------------------------------------------------------------------------
// PBR materials — scanned surface texture sets (Megascans / ambientCG / Poly
// Haven). Wrapped onto scene geometry: the ground, the generative trunk bark,
// the leaf cards, and the water.
// ---------------------------------------------------------------------------
export const MATERIALS: Record<string, MaterialAsset> = {
  forest_floor: {
    id: "forest_floor",
    maps: {
      map: "/assets/materials/forest_floor/albedo.jpg",
      normalMap: "/assets/materials/forest_floor/normal.jpg",
      roughnessMap: "/assets/materials/forest_floor/roughness.jpg",
      aoMap: "/assets/materials/forest_floor/ao.jpg",
      displacementMap: "/assets/materials/forest_floor/height.jpg",
    },
    repeat: [22, 22],
    displacementScale: 0.35,
  },
  bark: {
    id: "bark",
    maps: {
      map: "/assets/materials/bark/albedo.jpg",
      normalMap: "/assets/materials/bark/normal.jpg",
      roughnessMap: "/assets/materials/bark/roughness.jpg",
      aoMap: "/assets/materials/bark/ao.jpg",
    },
    repeat: [2, 6],
  },
  leaf: {
    id: "leaf",
    maps: {
      // Leaf atlas / single-leaf cutout with alpha (PNG/WebP with transparency).
      map: "/assets/materials/leaf/albedo.png",
      normalMap: "/assets/materials/leaf/normal.png",
      roughnessMap: "/assets/materials/leaf/roughness.png",
    },
  },
  water: {
    id: "water",
    maps: {
      map: "/assets/materials/water/albedo.jpg",
      normalMap: "/assets/materials/water/normal.jpg",
    },
    repeat: [6, 6],
    roughness: 0.06,
    metalness: 0.2,
  },
};

// ---------------------------------------------------------------------------
// Models — glTF/GLB. Scanned vegetation, rocks, and background trees that get
// scattered across the terrain by the growth/scatter system. The CENTRAL life
// tree is intentionally NOT a model here: its form is generated from the memory
// graph (the "grows inward" grammar) and wears the `bark`/`leaf` materials
// above. These models are the surrounding living world.
// ---------------------------------------------------------------------------
export const MODELS: Record<string, ModelAsset> = {
  // Background forest — a small library so the community reads as varied.
  tree_a: { id: "tree_a", url: "/assets/models/trees/tree_a.glb" },
  tree_b: { id: "tree_b", url: "/assets/models/trees/tree_b.glb" },
  tree_c: { id: "tree_c", url: "/assets/models/trees/tree_c.glb" },
  // Ground detail.
  rock_a: { id: "rock_a", url: "/assets/models/rocks/rock_a.glb" },
  rock_b: { id: "rock_b", url: "/assets/models/rocks/rock_b.glb" },
  fern: { id: "fern", url: "/assets/models/plants/fern.glb" },
  grass_clump: { id: "grass_clump", url: "/assets/models/plants/grass_clump.glb" },
  flower_a: { id: "flower_a", url: "/assets/models/plants/flower_a.glb" },
  flower_b: { id: "flower_b", url: "/assets/models/plants/flower_b.glb" },
  // Distant terrain silhouette (scanned cliff/mountain rock, scaled large).
  mountain: { id: "mountain", url: "/assets/models/terrain/mountain.glb" },
  // Living-world props + creatures. Lanterns line the paths and glow after dark;
  // birds and butterflies are cloned into animated flocks by the Life layer.
  lantern: { id: "lantern", url: "/assets/models/props/lantern.glb" },
  bird: { id: "bird", url: "/assets/models/creatures/bird.glb" },
  butterfly: { id: "butterfly", url: "/assets/models/creatures/butterfly.glb" },
};

/** All background tree ids, for the scatter system to draw from. */
export const BACKGROUND_TREE_IDS = ["tree_a", "tree_b", "tree_c"] as const;
export const GROUND_DETAIL_IDS = ["rock_a", "rock_b", "fern", "grass_clump", "flower_a", "flower_b"] as const;
