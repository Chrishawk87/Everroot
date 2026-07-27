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

  // Normalize the imported .glb into the scene's coordinate contract so the same
  // `scale` prop (= trunk height H) plants ANY hero mesh correctly, whatever
  // units/centering it shipped with. AI-lifted meshes (Tripo/Meshy) arrive
  // centered on the origin at ~unit size; the generative tree this replaces has
  // its BASE at y=0 and stands H tall. We measure the mesh once and derive a
  // transform that recenters X/Z to 0, drops the base to y=0 (so it sits ON the
  // plaza), and rescales so native height → 1 — then the outer `scale` (H) makes
  // it exactly H tall, matching the fog, shadows, camera and layout.
  const norm = useMemo(() => {
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const height = size.y > 1e-6 ? size.y : 1;
    return {
      unit: 1 / height,
      // Applied in the mesh's own units, on the inner group (before unit scale).
      offset: [-center.x, -box.min.y, -center.z] as Vec3,
    };
  }, [root]);

  // Collect the 8 named category limbs and every material that carries a vein
  // emissive channel, once, on load. The Blender conform bakes the vein mask
  // into the emissive slot; here we simply gather the materials so useFrame can
  // ramp their emissiveIntensity. If the mask ships as a separate texture +
  // custom shader instead, swap this block for the uniform it exposes.
  // Collect the 8 named category limbs and every emissive-carrying material,
  // capturing each material's AUTHORED emissive baseline (color + intensity).
  //
  // CRITICAL: many imported/AI-lifted tree meshes bake their entire visible
  // color into the emissive channel (emissiveFactor [1,1,1] + emissiveTexture)
  // for an "unlit" look. If we drove emissiveIntensity toward 0 and lerped the
  // color to gold — as an earlier version did — we ERASED the tree's real
  // colors, leaving it a flat brown silhouette under the golden fog. So we snap
  // a baseline here and, in useFrame, only ADD vein glow ON TOP of it. At
  // veinGlow=0 the material is left EXACTLY as authored: full original color.
  const { limbs, veinMaterials } = useMemo(() => {
    const limbMap = new Map<HeroLimbName, THREE.Object3D>();
    const mats: {
      mat: THREE.MeshStandardMaterial;
      baseIntensity: number;
      baseColor: THREE.Color;
    }[] = [];
    const nameSet = new Set<string>(HERO_LIMB_NAMES);

    root.traverse((obj: THREE.Object3D) => {
      if (nameSet.has(obj.name)) {
        limbMap.set(obj.name as HeroLimbName, obj);
      }
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh.material) {
        const applyMat = (m: THREE.Material) => {
          const std = m as THREE.MeshStandardMaterial;
          if (std.emissive || std.emissiveMap) {
            mats.push({
              mat: std,
              baseIntensity: std.emissiveIntensity ?? 1,
              baseColor: (std.emissive ?? new THREE.Color(0x000000)).clone(),
            });
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
  }, [root]);

  // Expose limbs for future runtime modifiers (tilt/extend/tint by category
  // weight). Kept in a ref so the "grows inward" layer can read them without
  // re-traversing. Referenced to avoid an unused-binding error until wired.
  const limbsRef = useRef(limbs);
  limbsRef.current = limbs;

  const targetColor = useMemo(() => new THREE.Color(veinColor), [veinColor]);
  const scratch = useMemo(() => new THREE.Color(), []);

  // Overlay vein glow ON TOP of each material's authored baseline. veinGlow=0 ⇒
  // baseline preserved exactly (tree keeps its real color). >0 ⇒ intensity is
  // lifted and the color is nudged toward the warm vein gold, proportionally.
  useFrame(() => {
    const g = THREE.MathUtils.clamp(veinGlow, 0, 1);
    veinMaterials.forEach(({ mat, baseIntensity, baseColor }) => {
      const targetIntensity = baseIntensity + g * 1.5;
      mat.emissiveIntensity = THREE.MathUtils.lerp(
        mat.emissiveIntensity ?? baseIntensity,
        targetIntensity,
        0.08,
      );
      // Start from the authored color, blend toward gold only as glow rises.
      scratch.copy(baseColor).lerp(targetColor, g * 0.6);
      mat.emissive.lerp(scratch, 0.08);
    });
  });

  // Outer group = world placement (position/rotation, and `scale` = H). Inner
  // group = the one-time normalization (unit-scale then recenter/base-drop),
  // so callers only ever think in trunk heights.
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <group scale={norm.unit}>
        <primitive object={root} position={norm.offset} />
      </group>
    </group>
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
