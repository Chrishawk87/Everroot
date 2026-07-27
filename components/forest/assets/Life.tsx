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
// Lanterns — a memory made visible. One hangs from the bough beside each memory,
// dangling on a short cord and lit from within by a warm glowing core. Each is a
// loaded GLB clone that swings gently like a pendulum from its cord; a cheap
// (shadowless) warm point light rides along, always lit and blooming after dark.
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
  castLight = true,
}: {
  placement: LanternPlacement;
  nightRef?: React.MutableRefObject<number>;
  /** Only a capped subset carry a real point light (mobile light budget); the
   *  rest still glow via their emissive core + bloom. */
  castLight?: boolean;
}) {
  const { scene } = useGLTF(MODELS.lantern.url);
  const swingRef = useRef<THREE.Group>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const coreRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const night = nightRef?.current ?? 0;
    // Pendulum swing from the top of the cord (the swing group pivots at y=0,
    // and the lantern hangs below it), so it reads as truly suspended.
    if (swingRef.current) {
      swingRef.current.rotation.z = Math.sin(t * 0.7 + placement.phase) * 0.06;
      swingRef.current.rotation.x = Math.cos(t * 0.5 + placement.phase) * 0.04;
    }
    const flicker = 0.92 + Math.sin(t * 5 + placement.phase) * 0.08;
    if (lightRef.current) {
      // Always clearly lit — these are memories — and it blooms after dark.
      lightRef.current.intensity = (0.9 + night * 2.2) * flicker;
    }
    if (coreRef.current) {
      coreRef.current.emissiveIntensity = (1.6 + night * 2.2) * flicker;
    }
  });

  return (
    <group
      position={placement.position}
      rotation={[0, placement.rotationY, 0]}
      scale={placement.scale}
    >
      {/* the cord's top pivot sits at the group origin (the branch); everything
          hangs below it and swings as one pendulum */}
      <group ref={swingRef}>
        {/* short hanging cord up to the bough */}
        <mesh position={[0, 0.55, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 1.1, 6]} />
          <meshStandardMaterial color="#2a1f12" roughness={1} />
        </mesh>
        {/* the lantern body, hung at the bottom of the cord */}
        <group position={[0, -0.4, 0]}>
          <Clone object={scene} castShadow receiveShadow />
          {/* warm glowing core so the lantern reads as lit from within */}
          <mesh position={[0, 0.15, 0]}>
            <sphereGeometry args={[0.14, 12, 12]} />
            <meshStandardMaterial
              ref={coreRef}
              color="#ffdca0"
              emissive="#ffb867"
              emissiveIntensity={1.6}
              toneMapped={false}
            />
          </mesh>
          {castLight ? (
            <pointLight
              ref={lightRef}
              color="#ffb867"
              intensity={1.0}
              distance={7}
              decay={2}
              position={[0, 0.15, 0]}
            />
          ) : null}
        </group>
      </group>
    </group>
  );
}

export function Lanterns({
  placements,
  nightRef,
  maxLights = 8,
}: {
  placements: LanternPlacement[];
  nightRef?: React.MutableRefObject<number>;
  /** Cap on real point lights to stay within the mobile light budget. */
  maxLights?: number;
}) {
  // Give real lights to the lanterns nearest the tree centre first, so the
  // canopy core is warmly lit; the rest rely on their emissive glow + bloom.
  const litSet = useMemo(() => {
    const idx = placements.map((p, i) => ({
      i,
      d: p.position[0] * p.position[0] + p.position[2] * p.position[2],
    }));
    idx.sort((a, b) => a.d - b.d);
    return new Set(idx.slice(0, maxLights).map((x) => x.i));
  }, [placements, maxLights]);

  return (
    <>
      {placements.map((p, i) => (
        <OneLantern
          key={i}
          placement={p}
          nightRef={nightRef}
          castLight={litSet.has(i)}
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Birds — cloned GLBs that wheel across the sky on looping elliptical paths,
// banking into the turn and bobbing their wings via a subtle scale pulse.
// ---------------------------------------------------------------------------
const smooth = (u: number) => u * u * (3 - 2 * u);

function OneBird({ seed, perch }: { seed: number; perch?: [number, number, number] }) {
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
      // Each bird runs its own long cycle; for part of it it peels off the sky
      // path and settles on an assigned branch tip, then lifts off again.
      period: 24 + hash01(k, 37) * 20,
      landFrac: 0.22 + hash01(k, 41) * 0.12,
      landOffset: hash01(k, 43),
    };
  }, [seed]);

  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    const et = state.clock.elapsedTime;
    const t = et * params.speed + params.phase;
    // Free-flight position on the wheeling ellipse.
    const fx = params.cx + Math.cos(t) * params.rx;
    const fz = params.cz + Math.sin(t) * params.rz;
    const fy = params.y + Math.sin(t * 2) * 1.2;
    const dx = -Math.sin(t) * params.rx;
    const dz = Math.cos(t) * params.rz;

    // When a perch is assigned, blend down to it during a window of the cycle.
    let ease = 0;
    if (perch) {
      const cyc = ((et / params.period) + params.landOffset) % 1;
      const pStart = 0.5;
      const pEnd = pStart + params.landFrac;
      if (cyc > pStart && cyc < pEnd) {
        const local = (cyc - pStart) / (pEnd - pStart); // 0..1 across the visit
        // ease in for the first fifth, hold, ease out for the last fifth
        ease = local < 0.2 ? smooth(local / 0.2) : local > 0.8 ? smooth((1 - local) / 0.2) : 1;
      }
    }

    if (ease > 0 && perch) {
      g.position.set(
        THREE.MathUtils.lerp(fx, perch[0], ease),
        THREE.MathUtils.lerp(fy, perch[1] + 0.12, ease),
        THREE.MathUtils.lerp(fz, perch[2], ease),
      );
      // The bird GLB faces -Z by default, so aiming it straight at the heading
      // (dx,dz) flew it tail-first. Add PI so it faces its direction of travel.
      g.rotation.y = Math.atan2(dx, dz) + Math.PI;
      g.rotation.z = Math.sin(t) * 0.3 * (1 - ease);
      // wings settle as it lands, a tiny bob while perched
      const flap = 1 + Math.sin(et * 9 + params.phase) * 0.25 * (1 - ease * 0.9);
      g.scale.set(params.scale, params.scale * flap, params.scale);
    } else {
      g.position.set(fx, fy, fz);
      // The bird GLB faces -Z by default, so aiming it straight at the heading
      // (dx,dz) flew it tail-first. Add PI so it faces its direction of travel.
      g.rotation.y = Math.atan2(dx, dz) + Math.PI;
      g.rotation.z = Math.sin(t) * 0.3;
      const flap = 1 + Math.sin(et * 9 + params.phase) * 0.25;
      g.scale.set(params.scale, params.scale * flap, params.scale);
    }
  });

  return (
    <group ref={ref}>
      <Clone object={scene} />
    </group>
  );
}

export function Birds({ count = 7, perches }: { count?: number; perches?: [number, number, number][] }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <OneBird key={i} seed={i} perch={perches && perches.length ? perches[i % perches.length] : undefined} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Butterflies — cloned GLBs that flutter low over the flowers on erratic,
// bobbing wander paths with a fast wing-flap pulse.
// ---------------------------------------------------------------------------
function OneButterfly({ seed, anchor }: { seed: number; anchor?: [number, number, number] }) {
  const { scene } = useGLTF(MODELS.butterfly.url);
  const ref = useRef<THREE.Group>(null);

  const params = useMemo(() => {
    const k = `fly${seed}`;
    // With a flower anchor, the butterfly stays tight around that bloom on a
    // small radius; without one it wanders the garden as before.
    const base = anchor
      ? {
          cx: anchor[0],
          cz: anchor[2],
          y: anchor[1] + 0.5 + hash01(k, 17) * 0.7,
          r: 0.5 + hash01(k, 11) * 1.1,
        }
      : {
          cx: (hash01(k, 3) - 0.5) * 30,
          cz: (hash01(k, 7) - 0.5) * 30,
          y: 0.8 + hash01(k, 17) * 1.8,
          r: 1.5 + hash01(k, 11) * 4,
        };
    return {
      ...base,
      speed: 0.5 + hash01(k, 19) * 0.6,
      phase: hash01(k, 23) * Math.PI * 2,
      scale: 0.18 + hash01(k, 29) * 0.16,
    };
  }, [seed, anchor]);

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

export function Butterflies({
  count = 14,
  anchors,
}: {
  count?: number;
  anchors?: [number, number, number][];
}) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <OneButterfly key={i} seed={i} anchor={anchors && anchors.length ? anchors[i % anchors.length] : undefined} />
      ))}
    </>
  );
}

// drei caches by URL; preloading avoids a pop when the flocks first mount.
useGLTF.preload(MODELS.lantern.url);
useGLTF.preload(MODELS.bird.url);
useGLTF.preload(MODELS.butterfly.url);
