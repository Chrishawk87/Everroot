"use client";

import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { MODELS } from "@/lib/forest/assets";
import { AssetBoundary } from "./assets/AssetBoundary";
import type { Vec3 } from "@/lib/forest/layout";

/**
 * THE HERO BASE — the authored platform/island the hero tree sits in the middle
 * of.
 *
 * The source mesh (hero_base.glb) is a thin disc centered on the origin: it
 * spans roughly ±0.95 in X/Z but only ±0.09 in Y. Mounted raw at [0,0,0] that
 * left HALF the plate below the ground plane — it read as a stray grey circle
 * buried at the trunk's foot (exactly the "sits under the tree / circle in the
 * centre" problem). So we normalize it here the same way the hero tree is
 * normalized:
 *
 *   • recenter X/Z on the origin,
 *   • drop the mesh's own base (min.y) to y=0 so the WHOLE plate rests ON the
 *     ground as a platform,
 *   • scale by the plate's half-width so `radius` sets its real world size.
 *
 * The tree is planted at the origin and rises from the centre of this platform.
 */
export interface HeroBaseProps {
  position?: Vec3;
  rotation?: Vec3;
  /** Target world radius of the platform (half its width). */
  radius: number;
}

function HeroBaseModel({ position = [0, 0, 0], rotation, radius }: HeroBaseProps) {
  const { scene } = useGLTF(MODELS.hero_base.url);
  const root = useMemo(() => scene.clone(true), [scene]);

  const norm = useMemo(() => {
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    // Half-width across the wider horizontal axis drives the scale so `radius`
    // means what it says regardless of the mesh's native units.
    const halfWidth = Math.max(size.x, size.z) / 2 || 1;
    return {
      unit: radius / halfWidth,
      // Recenter X/Z, and lift so the mesh's lowest point sits at y=0.
      offset: [-center.x, -box.min.y, -center.z] as Vec3,
    };
  }, [root, radius]);

  return (
    <group position={position} rotation={rotation} scale={norm.unit}>
      <primitive object={root} position={norm.offset} />
    </group>
  );
}

export function HeroBase(props: HeroBaseProps) {
  return (
    <AssetBoundary label="hero_base">
      <HeroBaseModel {...props} />
    </AssetBoundary>
  );
}
