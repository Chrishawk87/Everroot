"use client";

import { useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { MODELS } from "@/lib/forest/assets";
import { AssetBoundary } from "./assets/AssetBoundary";
import type { Vec3 } from "@/lib/forest/layout";

/**
 * THE HERO TREE.
 *
 * Loads the one canonical authored asset (hero_tree.glb, produced by the
 * SpeedTree → Blender pipeline) and mounts it as the scene's central tree. Per
 * the EverRoot Rule the app never *generates* this tree — it ORIGINATES here as
 * loaded geometry and the "grows inward" layer only *modifies* it.
 *
 * This is a scaffold: it renders nothing until hero_tree.glb is installed (the
 * AssetBoundary omits it, never a placeholder). It exposes the two hooks the
 * runtime will drive once the baked masks land:
 *   1. the 8 named category limbs (limb_life_advice … limb_messages_future),
 *      collected here so callers can tilt/extend/tint each one;
 *   2. the memory-vein emissive uniform, ramped by `veinGlow` (0..1) — wired to
 *      beat-4 ignition of the opening camera.
 *
 * Nothing is force-mounted into the live ForestCanvas yet. Wire it in at the
 * single documented point (see HeroTree usage note at bottom) when the .glb is
 * ready; until then the existing generative tree keeps rendering untouched.
 */

/** The 8 category limbs, in the canonical order shared with the briefs. */
export const HERO_LIMB_NAMES = [
  "limb_life_advice",
  "limb_recipes",
  "limb_family_traditions",
  "limb_beliefs",
  "limb_favorite_stories",
  "limb_biggest_wins",
  "limb_biggest_mistakes",
  "limb_messages_future",
] as const;

export type HeroLimbName = (typeof HERO_LIMB_NAMES)[number];

export interface HeroTreeProps {
  position?: Vec3;
  rotation?: Vec3;
  /** Uniform world scale. The authored tree is ~25–30 m tall at scale 1. */
  scale?: number;
  /** Memory-vein emissive intensity, 0..1. Drive from the opening-camera
   *  ignition (see lib/forest/heroCamera.ts → veinIgnition01). Default 0. */
  veinGlow?: number;
  /** Glow color the vein mask is multiplied by. Warm gold by default. */
  veinColor?: THREE.ColorRepresentation;
}

/** Inner loader — suspends on useGLTF, so it must live under an AssetBoundary. */
function HeroTreeModel({
  position,
  rotation,
  scale = 1,
  veinGlow = 0,
  veinColor = "#ffcf7a",
}: HeroTreeProps) {
  const { scene } = useGLTF(MODELS.hero_tree.url);

  // Clone once so multiple mounts (unlikely for the hero, but safe) don't share
  // mutable material state, and so we can safely retarget uniforms per-instance.
  const root = useMemo(() => scene.clone(true), [scene]);

  // Collect the 8 named category limbs and every material that carries a vein
  // emissive channel, once, on load. The Blender conform bakes the vein mask
  // into the emissive slot; here we simply gather the materials so useFrame can
  // ramp their emissiveIntensity. If the mask ships as a separate texture +
  // custom shader instead, swap this block for the uniform it exposes.
  const { limbs, veinMaterials } = useMemo(() => {
    const limbMap = new Map<HeroLimbName, THREE.Object3D>();
    const mats = new Set<THREE.MeshStandardMaterial>();
    const nameSet = new Set<string>(HERO_LIMB_NAMES);

    root.traverse((obj: THREE.Object3D) => {
      if (nameSet.has(obj.name)) {
        limbMap.set(obj.name as HeroLimbName, obj);
      }
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh.material) {
        const applyMat = (m: THREE.Material) => {
          const std = m as THREE.MeshStandardMaterial;
          // Heuristic: treat any material with an emissive map / non-black
          // emissive as a vein-carrying material. The bake gives us this.
          if (std.emissive || std.emissiveMap) {
            std.emissive = std.emissive ?? new THREE.Color(veinColor);
            mats.add(std);
          }
        };
        if (Array.isArray(mesh.material)) mesh.material.forEach(applyMat);
        else applyMat(mesh.material);
      }
    });

    if (limbMap.size !== HERO_LIMB_NAMES.length) {
      // eslint-disable-next-line no-console
      console.warn(
        `[everroot/hero] hero_tree.glb: found ${limbMap.size}/8 named category ` +
          `limbs. Expected: ${HERO_LIMB_NAMES.join(", ")}. Check the SpeedTree ` +
          `naming survived the Blender conform.`,
      );
    }
    return { limbs: limbMap, veinMaterials: mats };
  }, [root, veinColor]);

  // Expose limbs for future runtime modifiers (tilt/extend/tint by category
  // weight). Kept in a ref so the "grows inward" layer can read them without
  // re-traversing. Referenced to avoid an unused-binding error until wired.
  const limbsRef = useRef(limbs);
  limbsRef.current = limbs;

  const targetColor = useMemo(() => new THREE.Color(veinColor), [veinColor]);

  // Ramp the vein emissive toward the requested glow each frame (smoothed).
  useFrame(() => {
    const target = THREE.MathUtils.clamp(veinGlow, 0, 1);
    veinMaterials.forEach((m) => {
      m.emissiveIntensity = THREE.MathUtils.lerp(
        m.emissiveIntensity ?? 0,
        target,
        0.08,
      );
      m.emissive.lerp(targetColor, 0.08);
    });
  });

  return (
    <primitive
      object={root}
      position={position}
      rotation={rotation}
      scale={scale}
    />
  );
}

export function HeroTree(props: HeroTreeProps) {
  return (
    <AssetBoundary label="hero_tree">
      <HeroTreeModel {...props} />
    </AssetBoundary>
  );
}

// Preloading is intentionally NOT called at module scope: if the file isn't
// installed yet, an eager useGLTF.preload would warn on every page. Once
// hero_tree.glb ships, uncomment to warm the cache before mount:
//   useGLTF.preload(MODELS.hero_tree.url);

/*
 * WIRE-UP (single point). In components/forest/ForestCanvas.tsx, inside the
 * <Canvas> scene graph where the central generative tree is assembled, mount:
 *
 *   <HeroTree scale={H} veinGlow={veinGlow} />
 *
 * where `H` is layout.trunkHeight and `veinGlow` comes from the opening camera
 * (veinIgnition01(elapsed)). Do this only after hero_tree.glb is installed and
 * the generative central tree is ready to be retired — until then HeroTree
 * renders null and the existing tree stays live.
 */
