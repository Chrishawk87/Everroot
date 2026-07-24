"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { MATERIALS } from "@/lib/forest/assets";
import { PbrMaterial, usePbrTextures } from "./Materials";

/**
 * The meadow floor: a tessellated plane wearing a scanned forest-floor PBR set
 * with real height displacement, so the ground has genuine relief instead of a
 * painted flat texture. Render inside an <AssetBoundary>.
 */
export function Terrain({ size = 160, segments = 200 }: { size?: number; segments?: number }) {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(size, size, segments, segments);
    // aoMap samples the second UV set; mirror the primary UVs into uv2.
    const uv = g.attributes.uv as THREE.BufferAttribute;
    g.setAttribute("uv2", new THREE.BufferAttribute(uv.array.slice(), 2));
    return g;
  }, [size, segments]);

  return (
    <mesh geometry={geo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <PbrMaterial asset={MATERIALS.forest_floor} />
    </mesh>
  );
}

/**
 * A still meadow lake wearing a scanned water PBR set, with a gently scrolling
 * normal map so the surface ripples and mirrors the HDRI sky. Render inside an
 * <AssetBoundary>.
 */
export function Water({
  center = [-24, 0.05, 20],
  radius = 9,
}: {
  center?: [number, number, number];
  radius?: number;
}) {
  const maps = usePbrTextures(MATERIALS.water);
  const ref = useRef<THREE.Vector2 | null>(null);

  useFrame((_, delta) => {
    const n = maps.normalMap;
    if (n) {
      n.offset.x = (n.offset.x + delta * 0.02) % 1;
      n.offset.y = (n.offset.y + delta * 0.015) % 1;
    }
    ref.current = n ? n.offset : null;
  });

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={center} receiveShadow>
      <circleGeometry args={[radius, 64]} />
      <meshStandardMaterial
        {...maps}
        color="#3a5f66"
        roughness={MATERIALS.water.roughness ?? 0.08}
        metalness={MATERIALS.water.metalness ?? 0.2}
        envMapIntensity={1.3}
        transparent
        opacity={0.92}
      />
    </mesh>
  );
}
