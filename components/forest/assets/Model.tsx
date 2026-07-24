"use client";

import { useGLTF, Clone } from "@react-three/drei";
import type { Vec3 } from "@/lib/forest/layout";

/**
 * A single loaded glTF/GLB model. Uses drei's Clone so many copies share the
 * same geometry/material buffers (cheap) while carrying their own transform.
 * Draco/Meshopt compressed models are decoded automatically. Suspenseful —
 * render inside an <AssetBoundary>.
 */
export function Model({
  url,
  position,
  rotation,
  scale = 1,
}: {
  url: string;
  position?: Vec3;
  rotation?: Vec3;
  scale?: number | Vec3;
}) {
  const { scene } = useGLTF(url);
  return (
    <Clone
      object={scene}
      position={position}
      rotation={rotation}
      scale={scale}
      castShadow
      receiveShadow
    />
  );
}

export interface ScatterItem {
  /** Which MODELS[...].url to place. */
  url: string;
  position: Vec3;
  rotationY: number;
  scale: number;
}

/**
 * Scatter a set of loaded models across the terrain. Each placement is a Clone,
 * so a handful of source GLBs populate the whole meadow. Placements come from
 * the caller (deterministic, seeded) — this component only renders them.
 */
export function Scatter({ items }: { items: ScatterItem[] }) {
  return (
    <>
      {items.map((it, i) => (
        <Model
          key={i}
          url={it.url}
          position={it.position}
          rotation={[0, it.rotationY, 0]}
          scale={it.scale}
        />
      ))}
    </>
  );
}
