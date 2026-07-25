"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useGLTF, Clone } from "@react-three/drei";
import { MODELS } from "@/lib/forest/assets";
import type { Vec3 } from "@/lib/forest/layout";

/** Small deterministic hash → [0,1). Keeps every placement stable across
 *  reloads without importing the scene's private helper. */
function hash01(key: string, salt = 1): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

// ---------------------------------------------------------------------------
// Waterfall — a shader-driven cascade feeding the lake. This is the accepted
// exception to the "loaded assets only" rule: falling water reads as motion,
// not geometry, so it's a scrolling translucent sheet + a mist plume at the
// base rather than a static GLB. Render inside an <AssetBoundary> is not
// required (no file dependency), but it's grouped with the lake in the scene.
// ---------------------------------------------------------------------------
export function Waterfall({
  top = [-24, 7.5, 8],
  height = 7.2,
  width = 2.6,
}: {
  top?: Vec3;
  height?: number;
  width?: number;
}) {
  const sheetRef = useRef<THREE.Mesh>(null);
  const mistRef = useRef<THREE.Points>(null);

  // A vertical sheet with a scrolling normal-ish gradient baked as a canvas
  // texture: soft vertical streaks that slide downward to read as falling water.
  const streakTex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 256;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#cfe8ee";
    ctx.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * c.width;
      const w = 1 + Math.random() * 3;
      ctx.fillStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.4})`;
      ctx.fillRect(x, 0, w, c.height);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, 2);
    return t;
  }, []);

  // Mist particles at the base.
  const mist = useMemo(() => {
    const N = 120;
    const positions = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      positions[i * 3] = (Math.random() - 0.5) * (width * 1.8);
      positions[i * 3 + 1] = Math.random() * 1.6;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 1.4;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, [width]);

  useFrame((_, delta) => {
    streakTex.offset.y = (streakTex.offset.y - delta * 1.4) % 1;
    if (mistRef.current) {
      mistRef.current.rotation.y += delta * 0.15;
    }
  });

  return (
    <group position={top}>
      {/* falling sheet */}
      <mesh ref={sheetRef} position={[0, -height / 2, 0]}>
        <planeGeometry args={[width, height, 1, 1]} />
        <meshStandardMaterial
          map={streakTex}
          color="#eaf6f8"
          transparent
          opacity={0.72}
          roughness={0.15}
          metalness={0.1}
          emissive="#bfe0e6"
          emissiveIntensity={0.25}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* mist plume at the base */}
      <points ref={mistRef} position={[0, -height, 0]} geometry={mist}>
        <pointsMaterial
          size={0.35}
          color="#ffffff"
          transparent
          opacity={0.28}
          depthWrite={false}
          sizeAttenuation
        />
      </points>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Lanterns — physical lantern props that line the meadow paths and glow warmer
// after dark. Each is a loaded GLB clone inside a group that sways gently; a
// cheap (shadowless) warm point light rides along and brightens with nightRef.
// ---------------------------------------------------------------------------
export interface LanternPlacement {
  position: Vec3;
  rotationY: number;
  scale: number;
  /** phase offset so they don't all sway in lockstep */
  phase: number;
}

function OneLantern({
  placement,
  nightRef,
}: {
  placement: LanternPlacement;
  nightRef?: React.MutableRefObject<number>;
}) {
  const { scene } = useGLTF(MODELS.lantern.url);
  const groupRef = useRef<THREE.Group>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (groupRef.current) {
      groupRef.current.rotation.z = Math.sin(t * 0.8 + placement.phase) * 0.04;
    }
    if (lightRef.current) {
      const night = nightRef?.current ?? 0;
      // Always faintly lit; blooms after dark.
      const flicker = 0.9 + Math.sin(t * 6 + placement.phase) * 0.06;
      lightRef.current.intensity = (0.35 + night * 2.4) * flicker;
    }
  });

  return (
    <group
      position={placement.position}
      rotation={[0, placement.rotationY, 0]}
      scale={placement.scale}
    >
      <group ref={groupRef}>
        <Clone object={scene} castShadow receiveShadow />
      </group>
      <pointLight
        ref={lightRef}
        color="#ffb867"
        intensity={0.5}
        distance={9}
        decay={2}
        position={[0, 1.1, 0]}
      />
    </group>
  );
}

export function Lanterns({
  placements,
  nightRef,
}: {
  placements: LanternPlacement[];
  nightRef?: React.MutableRefObject<number>;
}) {
  return (
    <>
      {placements.map((p, i) => (
        <OneLantern key={i} placement={p} nightRef={nightRef} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Birds — cloned GLBs that wheel across the sky on looping elliptical paths,
// banking into the turn and bobbing their wings via a subtle scale pulse.
// ---------------------------------------------------------------------------
function OneBird({ seed }: { seed: number }) {
  const { scene } = useGLTF(MODELS.bird.url);
  const ref = useRef<THREE.Group>(null);

  const params = useMemo(() => {
    const k = `bird${seed}`;
    return {
      cx: (hash01(k, 3) - 0.5) * 40,
      cz: (hash01(k, 7) - 0.5) * 40,
      rx: 14 + hash01(k, 11) * 12,
      rz: 10 + hash01(k, 13) * 10,
      y: 16 + hash01(k, 17) * 10,
      speed: 0.12 + hash01(k, 19) * 0.1,
      phase: hash01(k, 23) * Math.PI * 2,
      scale: 0.5 + hash01(k, 29) * 0.5,
    };
  }, [seed]);

  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    const t = state.clock.elapsedTime * params.speed + params.phase;
    const x = params.cx + Math.cos(t) * params.rx;
    const z = params.cz + Math.sin(t) * params.rz;
    const y = params.y + Math.sin(t * 2) * 1.2;
    g.position.set(x, y, z);
    // face direction of travel
    const dx = -Math.sin(t) * params.rx;
    const dz = Math.cos(t) * params.rz;
    g.rotation.y = Math.atan2(dx, dz);
    // bank into the turn + wing flap via scale pulse on Y
    g.rotation.z = Math.sin(t) * 0.3;
    const flap = 1 + Math.sin(state.clock.elapsedTime * 9 + params.phase) * 0.25;
    g.scale.set(params.scale, params.scale * flap, params.scale);
  });

  return (
    <group ref={ref}>
      <Clone object={scene} />
    </group>
  );
}

export function Birds({ count = 7 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <OneBird key={i} seed={i} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Butterflies — cloned GLBs that flutter low over the flowers on erratic,
// bobbing wander paths with a fast wing-flap pulse.
// ---------------------------------------------------------------------------
function OneButterfly({ seed }: { seed: number }) {
  const { scene } = useGLTF(MODELS.butterfly.url);
  const ref = useRef<THREE.Group>(null);

  const params = useMemo(() => {
    const k = `fly${seed}`;
    return {
      cx: (hash01(k, 3) - 0.5) * 30,
      cz: (hash01(k, 7) - 0.5) * 30,
      r: 1.5 + hash01(k, 11) * 4,
      y: 0.8 + hash01(k, 17) * 1.8,
      speed: 0.5 + hash01(k, 19) * 0.6,
      phase: hash01(k, 23) * Math.PI * 2,
      scale: 0.18 + hash01(k, 29) * 0.16,
    };
  }, [seed]);

  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    const t = state.clock.elapsedTime * params.speed + params.phase;
    // lissajous wander so the path never repeats obviously
    const x = params.cx + Math.cos(t) * params.r + Math.sin(t * 1.7) * 0.8;
    const z = params.cz + Math.sin(t * 0.9) * params.r + Math.cos(t * 2.1) * 0.8;
    const y = params.y + Math.sin(t * 3) * 0.5;
    g.position.set(x, y, z);
    g.rotation.y = t * 0.9;
    // fast wing flap
    const flap = Math.sin(state.clock.elapsedTime * 18 + params.phase);
    g.rotation.z = flap * 0.5;
    g.scale.setScalar(params.scale);
  });

  return (
    <group ref={ref}>
      <Clone object={scene} />
    </group>
  );
}

export function Butterflies({ count = 14 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <OneButterfly key={i} seed={i} />
      ))}
    </>
  );
}

// drei caches by URL; preloading avoids a pop when the flocks first mount.
useGLTF.preload(MODELS.lantern.url);
useGLTF.preload(MODELS.bird.url);
useGLTF.preload(MODELS.butterfly.url);
