"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useGLTF, Clone } from "@react-three/drei";
import { MODELS } from "@/lib/forest/assets";

/**
 * Architectural monument elements composed AROUND the tree — a Legacy Plaza the
 * trunk rises from, a winding approach path, a crossing stream with a small
 * wooden bridge, and fireflies that wake at dusk. These are deliberate designed
 * structures (an architect's monument, not a game level), so unlike the scanned
 * environment they're built from simple forms + a couple of loaded stone props.
 */

// Warm natural-stone palette used across the plaza + path so they read as one
// quarried material rather than separate objects.
const STONE = "#8d8375";
const STONE_DARK = "#6f665a";
const WOOD = "#6b4a2f";
const WOOD_DARK = "#4e341f";

// ---------------------------------------------------------------------------
// Legacy Plaza — a circular stone court the trunk grows out of. Concentric
// inlaid rings draw the eye inward to the trunk; a low kerb of natural stone
// blocks rings the rim. The roots are left to emerge THROUGH the plaza (the
// floor sits just below the root flare), so the monument looks grown, not built.
// ---------------------------------------------------------------------------
export function LegacyPlaza({ radius }: { radius: number }) {
  const rockA = useGLTF(MODELS.rock_a.url).scene;
  const rockB = useGLTF(MODELS.rock_b.url).scene;

  // Kerb stones evenly ringing the rim, alternating the two rock props.
  const kerb = useMemo(() => {
    const N = Math.max(16, Math.round(radius * 3));
    return Array.from({ length: N }, (_, i) => {
      const a = (i / N) * Math.PI * 2;
      return {
        a,
        x: Math.cos(a) * radius,
        z: Math.sin(a) * radius,
        s: 0.5 + ((i * 37) % 10) / 22,
        which: i % 2,
      };
    });
  }, [radius]);

  return (
    <group>
      {/* plaza floor — a shallow stone disc just above grade */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} receiveShadow>
        <cylinderGeometry args={[radius, radius, 0.16, 96]} />
        <meshStandardMaterial color={STONE} roughness={0.95} metalness={0} />
      </mesh>
      {/* concentric inlaid rings pointing to the trunk */}
      {[0.42, 0.64, 0.84].map((f, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.14, 0]}>
          <ringGeometry args={[radius * f - 0.06, radius * f, 96]} />
          <meshStandardMaterial color={STONE_DARK} roughness={1} metalness={0} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* natural-stone kerb around the rim */}
      {kerb.map((k, i) => (
        <group key={i} position={[k.x, 0.02, k.z]} rotation={[0, k.a, 0]} scale={k.s}>
          <Clone object={k.which === 0 ? rockA : rockB} castShadow receiveShadow />
        </group>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Winding stone path — flat stepping stones on a gentle sine curve leading in
// from the treeline toward the plaza, so the eye is drawn along it to the tree.
// ---------------------------------------------------------------------------
export function StonePath({
  start,
  plazaRadius,
  steps = 16,
}: {
  /** Where the path begins, out at the treeline (world XZ). */
  start: [number, number];
  plazaRadius: number;
  steps?: number;
}) {
  const stones = useMemo(() => {
    const out: { x: number; z: number; s: number; rot: number }[] = [];
    const [sx, sz] = start;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // straight-line lerp from start to plaza edge, plus a sine sway sideways
      const bx = sx * (1 - t);
      const bz = sz * (1 - t) + Math.sign(sz || 1) * plazaRadius * t;
      const sway = Math.sin(t * Math.PI * 2.2) * (1.2 + 1.6 * (1 - t));
      // sideways offset perpendicular to the mostly-radial direction
      out.push({
        x: bx + sway,
        z: bz,
        s: 0.6 + ((i * 53) % 10) / 26,
        rot: (i * 1.3) % Math.PI,
      });
    }
    return out;
  }, [start, plazaRadius, steps]);

  return (
    <group>
      {stones.map((s, i) => (
        <mesh key={i} position={[s.x, 0.04, s.z]} rotation={[-Math.PI / 2, 0, s.rot]} receiveShadow>
          <cylinderGeometry args={[s.s, s.s * 0.92, 0.12, 10]} />
          <meshStandardMaterial color={i % 2 ? STONE : STONE_DARK} roughness={0.98} metalness={0} />
        </mesh>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Stream — a shallow ribbon of water crossing the garden, rippling in-shader
// (the accepted moving-water exception). A small wooden footbridge arches over
// it where the path crosses.
// ---------------------------------------------------------------------------
function makeStreamNormal(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 32;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#8080ff";
  ctx.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * c.width;
    const y = Math.random() * c.height;
    const r = 3 + Math.random() * 8;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(120,120,255,0.5)");
    g.addColorStop(1, "rgba(128,128,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 1);
  return t;
}

export function Stream({
  center = [6, 0.04, 8],
  length = 40,
  width = 2.4,
  angle = 0,
}: {
  center?: [number, number, number];
  length?: number;
  width?: number;
  angle?: number;
}) {
  const normal = useMemo(makeStreamNormal, []);
  useFrame((_, delta) => {
    normal.offset.x = (normal.offset.x - delta * 0.12) % 1;
  });
  return (
    <group position={center} rotation={[0, angle, 0]}>
      {/* streambed (dark, sunk a touch) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[length, width * 1.25]} />
        <meshStandardMaterial color="#2a2418" roughness={1} />
      </mesh>
      {/* water ribbon */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <planeGeometry args={[length, width, 1, 1]} />
        <meshStandardMaterial
          color="#33606a"
          normalMap={normal}
          normalScale={new THREE.Vector2(0.5, 0.5)}
          roughness={0.08}
          metalness={0.55}
          transparent
          opacity={0.9}
          envMapIntensity={1.4}
        />
      </mesh>
    </group>
  );
}

// A small arched wooden footbridge: a slightly cambered deck of planks with two
// hand-rails on posts. Placed where the path meets the stream.
export function WoodenBridge({
  position = [0, 0, 0],
  rotationY = 0,
  span = 4.2,
  width = 1.6,
}: {
  position?: [number, number, number];
  rotationY?: number;
  span?: number;
  width?: number;
}) {
  const planks = 9;
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* deck planks, gently cambered */}
      {Array.from({ length: planks }, (_, i) => {
        const t = i / (planks - 1);
        const x = (t - 0.5) * span;
        const camber = Math.sin(t * Math.PI) * 0.28; // slight arch
        return (
          <mesh key={i} position={[x, 0.28 + camber, 0]} castShadow receiveShadow>
            <boxGeometry args={[span / planks - 0.03, 0.08, width]} />
            <meshStandardMaterial color={i % 2 ? WOOD : WOOD_DARK} roughness={0.9} />
          </mesh>
        );
      })}
      {/* two rails + end posts on each side */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[0, 0.72, (side * width) / 2]} castShadow>
            <boxGeometry args={[span, 0.06, 0.06]} />
            <meshStandardMaterial color={WOOD} roughness={0.9} />
          </mesh>
          {[-1, 1].map((end) => (
            <mesh key={end} position={[(end * span) / 2, 0.5, (side * width) / 2]} castShadow>
              <boxGeometry args={[0.08, 0.5, 0.08]} />
              <meshStandardMaterial color={WOOD_DARK} roughness={0.9} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Fireflies — tiny warm glimmers that wake at dusk and drift low around the
// garden. Opacity is driven by nightRef so they fade in as the light goes and
// are invisible in full day. Additive so they bloom.
// ---------------------------------------------------------------------------
export function Fireflies({
  count = 46,
  radius = 12,
  nightRef,
}: {
  count?: number;
  radius?: number;
  nightRef?: React.MutableRefObject<number>;
}) {
  const ref = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.PointsMaterial>(null);

  const { geometry, params } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const params = new Array(count).fill(0).map(() => ({
      cx: (Math.random() - 0.5) * radius * 2,
      cz: (Math.random() - 0.5) * radius * 2,
      y: 0.6 + Math.random() * 3.2,
      r: 0.6 + Math.random() * 1.8,
      speed: 0.2 + Math.random() * 0.5,
      phase: Math.random() * Math.PI * 2,
      blink: 1 + Math.random() * 3,
    }));
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return { geometry: g, params };
  }, [count, radius]);

  // Soft round sprite so each firefly is a glowing dot, not a square.
  const sprite = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(255,240,180,1)");
    g.addColorStop(0.4, "rgba(255,200,110,0.6)");
    g.addColorStop(1, "rgba(255,180,90,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const g = ref.current;
    if (g) {
      const pos = g.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < params.length; i++) {
        const p = params[i];
        const a = t * p.speed + p.phase;
        pos.setXYZ(
          i,
          p.cx + Math.cos(a) * p.r + Math.sin(a * 1.7) * 0.4,
          p.y + Math.sin(a * 1.3) * 0.5,
          p.cz + Math.sin(a * 0.9) * p.r + Math.cos(a * 2.1) * 0.4,
        );
      }
      pos.needsUpdate = true;
    }
    if (matRef.current) {
      const night = nightRef?.current ?? 0;
      // Wake only at dusk/night; a gentle collective shimmer.
      const shimmer = 0.6 + Math.sin(t * 2) * 0.2;
      matRef.current.opacity = Math.max(0, (night - 0.25) / 0.75) * shimmer;
    }
  });

  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial
        ref={matRef}
        map={sprite}
        color="#ffd98a"
        size={0.5}
        transparent
        opacity={0}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}

useGLTF.preload(MODELS.rock_a.url);
useGLTF.preload(MODELS.rock_b.url);
