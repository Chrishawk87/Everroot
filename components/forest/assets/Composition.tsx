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
        <mesh key={i} position={[s.x, 0.04, s.z]} rotation={[0, s.rot, 0]} receiveShadow>
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

// ---------------------------------------------------------------------------
// Moat — a naturally-formed, spring-fed pool encircling the hero-tree island.
//
// NOT a dug circle: the water plane has an IRREGULAR, organic shoreline (its
// inner + outer edges wander in and out), a dark spring bed beneath it for real
// depth, and — most importantly — its banks are hidden behind a continuous,
// overlapping drift of LOADED natural props (mossy boulders, pebbles, ferns,
// grasses, wildflowers) that rise from grade up over the waterline. There are no
// primitive walls; the stone-and-plant banks dissolve the edge so the water
// reads as a stream that has always been here, worn into the land.
// ---------------------------------------------------------------------------

// An irregular annulus of water: outer + inner contours each wander with layered
// sine noise so no part of the shoreline is a clean arc.
function makeMoatWaterGeometry(innerRadius: number, outerRadius: number): THREE.ShapeGeometry {
  const N = 128;
  const shape = new THREE.Shape();
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const wobble = 1 + Math.sin(a * 3) * 0.05 + Math.sin(a * 7 + 1.3) * 0.035 + Math.sin(a * 13 + 0.6) * 0.02;
    const r = outerRadius * wobble;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  const hole = new THREE.Path();
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const wobble = 1 + Math.sin(a * 4 + 2) * 0.06 + Math.sin(a * 9 + 0.4) * 0.04 + Math.sin(a * 15) * 0.02;
    const r = innerRadius * wobble;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) hole.moveTo(x, y);
    else hole.lineTo(x, y);
  }
  shape.holes.push(hole);
  const geo = new THREE.ShapeGeometry(shape, 24);
  geo.rotateX(-Math.PI / 2); // lay flat in the XZ plane
  return geo;
}

// A dark spring bed that reads as depth beneath the water; slightly larger and
// irregular so its edge is never a clean circle either.
function makeMoatBedGeometry(outerRadius: number): THREE.ShapeGeometry {
  const N = 96;
  const shape = new THREE.Shape();
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const wobble = 1 + Math.sin(a * 3) * 0.05 + Math.sin(a * 7 + 1.3) * 0.035;
    const r = (outerRadius + 0.8) * wobble;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  const geo = new THREE.ShapeGeometry(shape, 16);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

type BankProp = { x: number; z: number; y: number; s: number; rot: number; tilt: number; kind: number };

export function Moat({
  innerRadius,
  outerRadius,
  waterLevel = 1.0,
}: {
  innerRadius: number;
  outerRadius: number;
  /** Height of the water surface above grade. The stony banks rise from grade
   *  up past this so the pool never reads as a floating disc. */
  waterLevel?: number;
}) {
  const rockA = useGLTF(MODELS.rock_a.url).scene;
  const rockB = useGLTF(MODELS.rock_b.url).scene;
  const fern = useGLTF(MODELS.fern.url).scene;
  const grass = useGLTF(MODELS.grass_clump.url).scene;
  const flowerA = useGLTF(MODELS.flower_a.url).scene;
  const flowerB = useGLTF(MODELS.flower_b.url).scene;

  const waterGeo = useMemo(() => makeMoatWaterGeometry(innerRadius, outerRadius), [innerRadius, outerRadius]);
  const bedGeo = useMemo(() => makeMoatBedGeometry(outerRadius), [outerRadius]);

  const normal = useMemo(makeStreamNormal, []);
  useFrame((_, delta) => {
    normal.offset.x = (normal.offset.x - delta * 0.04) % 1;
    normal.offset.y = (normal.offset.y + delta * 0.018) % 1;
  });

  // Bank props ring BOTH shorelines. Large mossy boulders and grasses cluster on
  // the banks (rising from grade over the waterline to hide the edge); pebbles,
  // ferns and wildflowers fill between them and spill into the shallows. Placed
  // with heavy angular + radial jitter so nothing repeats or reads as a ring of
  // evenly-spaced stones.
  const banks = useMemo<BankProp[]>(() => {
    const out: BankProp[] = [];
    // deterministic pseudo-random so the layout is stable across renders
    let seed = 1337;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const banksAt = [
      { radius: outerRadius, spread: 1.6, density: 3.2, out: true }, // outer bank
      { radius: innerRadius, spread: 1.3, density: 3.0, out: false }, // island shore
    ];
    for (const bank of banksAt) {
      const count = Math.max(20, Math.round(bank.radius * bank.density));
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + (rnd() - 0.5) * 0.35;
        // push boulders slightly onto land, pebbles/plants toward the water
        const roll = rnd();
        const radialDir = bank.out ? 1 : -1;
        const off = (roll < 0.45 ? 0.2 + rnd() * bank.spread : -(rnd() * bank.spread * 0.7)) * radialDir;
        const r = bank.radius + off;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        let kind: number; // 0 boulder, 1 pebble, 2 fern, 3 grass, 4 flower
        let s: number;
        let y: number;
        if (roll < 0.28) {
          kind = 0; // mossy boulder on the bank, rising over the waterline
          s = 0.9 + rnd() * 1.6;
          y = -0.1 + rnd() * 0.2;
        } else if (roll < 0.5) {
          kind = 1; // pebble/cobble in the shallows
          s = 0.25 + rnd() * 0.4;
          y = waterLevel - 0.04 - rnd() * 0.06;
        } else if (roll < 0.68) {
          kind = 3; // grass clump
          s = 0.7 + rnd() * 0.7;
          y = 0.0;
        } else if (roll < 0.84) {
          kind = 2; // fern
          s = 0.6 + rnd() * 0.6;
          y = 0.0;
        } else {
          kind = 4; // wildflower
          s = 0.6 + rnd() * 0.6;
          y = 0.0;
        }
        out.push({ x, z, y, s, rot: rnd() * Math.PI * 2, tilt: (rnd() - 0.5) * 0.25, kind });
      }
    }
    return out;
  }, [innerRadius, outerRadius, waterLevel]);

  const propFor = (kind: number) => {
    switch (kind) {
      case 0:
        return rockA;
      case 1:
        return rockB;
      case 2:
        return fern;
      case 3:
        return grass;
      case 4:
        return Math.random() < 0.5 ? flowerA : flowerB;
      default:
        return rockA;
    }
  };

  return (
    <group>
      {/* Spring bed — dark, wet mineral floor giving the water real depth. */}
      <mesh geometry={bedGeo} position={[0, waterLevel - 0.1, 0]} receiveShadow>
        <meshStandardMaterial color="#15120b" roughness={1} metalness={0} />
      </mesh>
      {/* The spring water itself — an irregular sheet, glassy and reflective,
          rippling in-shader (the accepted moving-water exception). */}
      <mesh geometry={waterGeo} position={[0, waterLevel, 0]}>
        <meshStandardMaterial
          color="#2b525a"
          normalMap={normal}
          normalScale={new THREE.Vector2(0.45, 0.45)}
          roughness={0.06}
          metalness={0.4}
          transparent
          opacity={0.86}
          envMapIntensity={1.3}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Natural stone-and-plant banks that dissolve the shoreline. */}
      {banks.map((b, i) => (
        <group key={i} position={[b.x, b.y, b.z]} rotation={[b.tilt, b.rot, b.tilt * 0.6]} scale={b.s}>
          <Clone object={propFor(b.kind)} castShadow receiveShadow />
        </group>
      ))}
    </group>
  );
}

// An heirloom footbridge: a cambered deck of hand-hewn oak planks (grain
// variation plank to plank), seated on natural-stone abutments at each bank,
// with forged-iron railings on turned posts and a warm lantern at each corner
// post. Built as a deliberate designed structure (an heirloom object, not
// scanned terrain), so it composes from authored forms + loaded stone + a glow.
const IRON = "#211d18";
const IRON_HI = "#39322a";

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
  const rockA = useGLTF(MODELS.rock_a.url).scene;
  const lantern = useGLTF(MODELS.lantern.url).scene;
  const planks = 13;
  const railH = 0.86;
  const deckY = 0.3;
  // Subtle per-plank grain tone so the oak reads hand-hewn, not machined.
  const plankTone = (i: number) => {
    const g = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    const m = 0.5 + Math.abs(g) * 0.5;
    const c = new THREE.Color(WOOD).lerp(new THREE.Color(WOOD_DARK), m);
    return `#${c.getHexString()}`;
  };
  const corners: [number, number][] = [
    [-span / 2, -1],
    [-span / 2, 1],
    [span / 2, -1],
    [span / 2, 1],
  ];
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Natural-stone footings seating the deck at each bank — kept low and
          modest so they read as support, never as a boulder blocking the path. */}
      {[-1, 1].map((end) => (
        <group key={end} position={[(end * span) / 2, -0.2, (end * width) / 2]} rotation={[0, end * 0.6, 0]} scale={0.8}>
          <Clone object={rockA} castShadow receiveShadow />
        </group>
      ))}

      {/* Oak deck — cambered, plank grain varied. */}
      {Array.from({ length: planks }, (_, i) => {
        const t = i / (planks - 1);
        const x = (t - 0.5) * span;
        const camber = Math.sin(t * Math.PI) * 0.32; // gentle arch
        return (
          <mesh key={i} position={[x, deckY + camber, 0]} castShadow receiveShadow>
            <boxGeometry args={[span / planks - 0.02, 0.09, width]} />
            <meshStandardMaterial color={plankTone(i)} roughness={0.82} metalness={0} />
          </mesh>
        );
      })}
      {/* Twin oak stringers carrying the deck. */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[0, deckY - 0.08, (side * width) / 2 - side * 0.02]} castShadow>
          <boxGeometry args={[span, 0.14, 0.12]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.85} />
        </mesh>
      ))}

      {/* Forged-iron railings: a top rail + a mid rail on each side, on turned
          posts, following the deck camber roughly. */}
      {[-1, 1].map((side) => (
        <group key={side}>
          {[railH, railH - 0.3].map((h, r) => (
            <mesh key={r} position={[0, deckY + h, (side * width) / 2]} castShadow>
              <boxGeometry args={[span, 0.045, 0.045]} />
              <meshStandardMaterial color={r === 0 ? IRON_HI : IRON} roughness={0.5} metalness={0.7} />
            </mesh>
          ))}
          {/* balusters */}
          {Array.from({ length: 6 }, (_, k) => {
            const bx = ((k / 5) - 0.5) * (span - 0.4);
            return (
              <mesh key={k} position={[bx, deckY + railH / 2, (side * width) / 2]} castShadow>
                <cylinderGeometry args={[0.02, 0.02, railH, 6]} />
                <meshStandardMaterial color={IRON} roughness={0.5} metalness={0.7} />
              </mesh>
            );
          })}
        </group>
      ))}

      {/* Corner posts, each crowned with a lantern that glows warm. */}
      {corners.map(([cx, cs], i) => (
        <group key={i} position={[cx, deckY, (cs * width) / 2]}>
          <mesh position={[0, railH / 2, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.06, railH, 8]} />
            <meshStandardMaterial color={IRON_HI} roughness={0.45} metalness={0.75} />
          </mesh>
          <group position={[0, railH + 0.05, 0]} scale={0.5}>
            <Clone object={lantern} castShadow />
          </group>
          {/* warm integrated glow */}
          <pointLight position={[0, railH + 0.15, 0]} intensity={0.9} distance={6} decay={2} color="#ffca74" />
          <mesh position={[0, railH + 0.1, 0]}>
            <sphereGeometry args={[0.09, 10, 10]} />
            <meshBasicMaterial color="#ffdca0" toneMapped={false} />
          </mesh>
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
useGLTF.preload(MODELS.fern.url);
useGLTF.preload(MODELS.grass_clump.url);
useGLTF.preload(MODELS.flower_a.url);
useGLTF.preload(MODELS.flower_b.url);
useGLTF.preload(MODELS.lantern.url);
