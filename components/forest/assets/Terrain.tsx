"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { MATERIALS } from "@/lib/forest/assets";
import { PbrMaterial } from "./Materials";

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
 * A still meadow lake. The ripple normal map is generated in-canvas and scrolls
 * across the surface, so the lake needs NO installed texture files — the same
 * accepted exception as the waterfall (moving water reads as motion, not scanned
 * geometry). It stays glassy and metallic so it mirrors the sky/HDRI, with a
 * soft teal tint and a slightly lighter rim so the shoreline reads. Render
 * inside an <AssetBoundary>.
 */
function makeRippleNormal(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  // Neutral normal (pointing straight up) = (128,128,255).
  ctx.fillStyle = "#8080ff";
  ctx.fillRect(0, 0, 256, 256);
  // Overlay soft blobs that perturb the normal into gentle wavelets.
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const r = 6 + Math.random() * 26;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dx = 108 + Math.floor(Math.random() * 40);
    const dy = 108 + Math.floor(Math.random() * 40);
    g.addColorStop(0, `rgba(${dx},${dy},255,0.55)`);
    g.addColorStop(1, "rgba(128,128,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 4);
  return t;
}

export function Water({
  center = [-24, 0.06, 20],
  radius = 9,
}: {
  center?: [number, number, number];
  radius?: number;
}) {
  const rippleTex = useMemo(makeRippleNormal, []);

  useFrame((_, delta) => {
    rippleTex.offset.x = (rippleTex.offset.x + delta * 0.018) % 1;
    rippleTex.offset.y = (rippleTex.offset.y + delta * 0.012) % 1;
  });

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={center} receiveShadow>
      <circleGeometry args={[radius, 96]} />
      <meshStandardMaterial
        color="#2f5a63"
        normalMap={rippleTex}
        normalScale={new THREE.Vector2(0.35, 0.35)}
        roughness={MATERIALS.water.roughness ?? 0.06}
        metalness={MATERIALS.water.metalness ?? 0.6}
        envMapIntensity={1.6}
        transparent
        opacity={0.9}
      />
    </mesh>
  );
}
