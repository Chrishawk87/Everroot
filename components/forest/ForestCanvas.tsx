"use client";

import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Line, Html, Sky } from "@react-three/drei";
import * as THREE from "three";
import type { ForestGraph, ForestNodeDTO } from "@/lib/forest/types";
import { computeLayout, type PositionedNode, type Vec3, type Limb } from "@/lib/forest/layout";

const COLORS: Record<string, string> = {
  SEED: "#c9a86a",
  TRUNK: "#5b3a29",
  BRANCH: "#6b4a35",
  LEAF: "#4caf6d",
  FLOWER: "#e5738a",
  FRUIT: "#e8a33d",
  PHOTO: "#cfd8e3",
  PERSON: "#7fc99a",
  ROOT: "#7a5638",
  MEMORY_MOMENT: "#5bd0c0",
  MEMORY: "#9ad0b0",
};

// Nodes that are metadata, not drawn in the tree.
const HIDDEN = new Set(["TIMELINE_EVENT", "RELATIONSHIP", "SUB_BRANCH"]);

const SUN_POSITION: Vec3 = [-30, 18, -42];

// Deterministic 0..1 from an id, matching layout.ts, so a leaf's look is stable.
function hash01(id: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

// A pointed-oval leaf silhouette, built once and reused (scaled per node).
const LEAF_GEOMETRY = (() => {
  const s = new THREE.Shape();
  s.moveTo(0, -0.5);
  s.bezierCurveTo(0.42, -0.18, 0.34, 0.5, 0, 0.72);
  s.bezierCurveTo(-0.34, 0.5, -0.42, -0.18, 0, -0.5);
  const g = new THREE.ShapeGeometry(s, 14);
  g.center();
  return g;
})();

// Slight per-node hue/lightness jitter so the canopy reads as many leaves, not one paint.
function tintFor(kind: string, id: string): string {
  const base = COLORS[kind] ?? "#9ad0b0";
  if (kind !== "LEAF" && kind !== "FLOWER" && kind !== "FRUIT") return base;
  const c = new THREE.Color(base);
  const hueJitter = (hash01(id, 21) - 0.5) * 0.08;
  const lightJitter = (hash01(id, 42) - 0.5) * 0.16;
  c.offsetHSL(hueJitter, 0, lightJitter);
  return `#${c.getHexString()}`;
}

interface Props {
  graph: ForestGraph;
  selectedId: string | null;
  focusId: string | null;
  onSelect: (node: ForestNodeDTO | null) => void;
}

export default function ForestCanvas({ graph, selectedId, focusId, onSelect }: Props) {
  const layout = useMemo(() => computeLayout(graph), [graph]);

  const focusPos = useMemo<Vec3 | null>(() => {
    if (!focusId) return null;
    const p = layout.positioned.find((n) => n.node.id === focusId);
    return p ? p.position : null;
  }, [focusId, layout]);

  return (
    <Canvas
      shadows
      camera={{ position: [4.5, 3.2, 6.5], fov: 50 }}
      onPointerMissed={() => onSelect(null)}
    >
      {/* Warm daytime sky + hazy horizon. */}
      <color attach="background" args={["#cfe3d6"]} />
      <Sky
        distance={450000}
        sunPosition={SUN_POSITION}
        turbidity={7}
        rayleigh={1.6}
        mieCoefficient={0.006}
        mieDirectionalG={0.82}
      />
      <fog attach="fog" args={["#d7e6d2", 18, 55]} />

      <ambientLight intensity={0.55} />
      <hemisphereLight args={["#dff0e2", "#5a6b3f", 0.7]} />
      <directionalLight
        position={SUN_POSITION}
        intensity={1.4}
        color="#ffe9c6"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <pointLight position={[0, layout.trunkHeight + 1.5, 0]} intensity={0.35} color="#ffe6b0" distance={12} />

      <Hills />
      <Ground />
      <Motes trunkHeight={layout.trunkHeight} />

      {/* Structural limbs — branches & roots as curved tubes, fine twigs as lines. */}
      {layout.limbs.map((limb, i) =>
        limb.kind === "twig" ? (
          <Line
            key={i}
            points={[limb.from, limb.to]}
            color="#6b4a35"
            lineWidth={1.4}
            transparent
            opacity={0.75}
          />
        ) : (
          <Branch key={i} limb={limb} />
        ),
      )}

      {/* Trunk drawn as a tapered cylinder from the ground up. */}
      <Trunk height={layout.trunkHeight} />

      {/* Every other node as a glyph. */}
      {layout.positioned
        .filter((p) => p.node.kind !== "TRUNK" && !HIDDEN.has(p.node.kind))
        .map((p) => (
          <NodeGlyph
            key={p.node.id}
            positioned={p}
            selected={p.node.id === selectedId}
            justGrew={p.node.id === focusId}
            onSelect={onSelect}
          />
        ))}

      <OrbitControls
        makeDefault
        enablePan
        enableZoom
        minDistance={2}
        maxDistance={22}
        maxPolarAngle={Math.PI / 2.05}
        target={[0, layout.trunkHeight * 0.5, 0]}
      />
      <CameraRig focusPos={focusPos} />
    </Canvas>
  );
}

/** When a node is freshly grown, glide the camera to frame it for a few seconds. */
function CameraRig({ focusPos }: { focusPos: Vec3 | null }) {
  const tmpTarget = useRef(new THREE.Vector3());
  const tmpCam = useRef(new THREE.Vector3());

  useFrame((state, delta) => {
    const controls = state.controls as unknown as
      | { target: THREE.Vector3; update: () => void }
      | null;
    if (!controls || !focusPos) return;
    const k = 1 - Math.pow(0.0016, delta);
    tmpTarget.current.set(focusPos[0], focusPos[1], focusPos[2]);
    controls.target.lerp(tmpTarget.current, k);
    tmpCam.current.set(focusPos[0] + 2.4, focusPos[1] + 1.5, focusPos[2] + 3.2);
    state.camera.position.lerp(tmpCam.current, k * 0.55);
    controls.update();
  });

  return null;
}

/** A curved, tapered woody limb between two points. Branches bow up, roots bow down. */
function Branch({ limb }: { limb: Limb }) {
  const geometry = useMemo(() => {
    const a = new THREE.Vector3(...limb.from);
    const b = new THREE.Vector3(...limb.to);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const len = a.distanceTo(b);
    mid.y += len * (limb.kind === "root" ? -0.28 : 0.32);
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const radius = limb.kind === "root" ? 0.045 : 0.06;
    // Taper along the length by scaling per-segment radii.
    const geo = new THREE.TubeGeometry(curve, 14, radius, 7, false);
    taperTube(geo, 14, 7, radius, radius * 0.35);
    return geo;
  }, [limb]);

  const color = limb.kind === "root" ? "#4a3222" : "#5b3a29";
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.95} />
    </mesh>
  );
}

/** Shrink a TubeGeometry's radius from base to tip for a natural taper. */
function taperTube(
  geo: THREE.TubeGeometry,
  tubularSegments: number,
  radialSegments: number,
  rBase: number,
  rTip: number,
) {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const frames = geo.parameters.path.computeFrenetFrames(tubularSegments, false);
  const path = geo.parameters.path;
  let idx = 0;
  for (let i = 0; i <= tubularSegments; i++) {
    const t = i / tubularSegments;
    const point = path.getPointAt(t);
    const r = rBase + (rTip - rBase) * t;
    const N = frames.normals[i];
    const B = frames.binormals[i];
    for (let j = 0; j <= radialSegments; j++) {
      const v = (j / radialSegments) * Math.PI * 2;
      const cos = -Math.cos(v);
      const sin = Math.sin(v);
      const nx = cos * N.x + sin * B.x;
      const ny = cos * N.y + sin * B.y;
      const nz = cos * N.z + sin * B.z;
      pos.setXYZ(idx, point.x + r * nx, point.y + r * ny, point.z + r * nz);
      idx++;
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

/** Grassy ground: a broad green disc plus a softer inner clearing. */
function Ground() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <circleGeometry args={[60, 64]} />
        <meshStandardMaterial color="#4c7a3a" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <circleGeometry args={[10, 48]} />
        <meshStandardMaterial color="#5c8a44" roughness={1} />
      </mesh>
    </group>
  );
}

/** Low-poly rolling hills ringed around the horizon, hazed by fog. */
function Hills() {
  const hills = useMemo(() => {
    const out: { pos: Vec3; scale: Vec3; color: string }[] = [];
    const count = 14;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + hash01(`h${i}`, 3) * 0.3;
      const r = 34 + hash01(`h${i}`, 7) * 12;
      const w = 10 + hash01(`h${i}`, 11) * 12;
      const h = 3 + hash01(`h${i}`, 5) * 5;
      const green = 0.28 + hash01(`h${i}`, 9) * 0.12;
      const c = new THREE.Color().setHSL(0.28, 0.35, green);
      out.push({
        pos: [Math.cos(a) * r, -1.5, Math.sin(a) * r],
        scale: [w, h, w],
        color: `#${c.getHexString()}`,
      });
    }
    return out;
  }, []);

  return (
    <group>
      {hills.map((hill, i) => (
        <mesh key={i} position={hill.pos} scale={hill.scale}>
          <sphereGeometry args={[1, 12, 8]} />
          <meshStandardMaterial color={hill.color} roughness={1} flatShading />
        </mesh>
      ))}
    </group>
  );
}

function Trunk({ height }: { height: number }) {
  return (
    <mesh position={[0, height / 2, 0]} castShadow>
      <cylinderGeometry args={[0.12, 0.28, height, 12]} />
      <meshStandardMaterial color={COLORS.TRUNK} roughness={0.9} />
    </mesh>
  );
}

/** Drifting warm motes (pollen / fireflies) that give the air some life. */
function Motes({ trunkHeight }: { trunkHeight: number }) {
  const ref = useRef<THREE.Points>(null);
  const COUNT = 70;

  const { geometry, speeds } = useMemo(() => {
    const positions = new Float32Array(COUNT * 3);
    const speeds = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.5 + Math.random() * 5.5;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = Math.random() * (trunkHeight + 3);
      positions[i * 3 + 2] = Math.sin(a) * r;
      speeds[i] = 0.05 + Math.random() * 0.12;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return { geometry, speeds };
  }, [trunkHeight]);

  useFrame((state, delta) => {
    if (!ref.current) return;
    const pos = ref.current.geometry.attributes.position as THREE.BufferAttribute;
    const ceiling = trunkHeight + 3;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < COUNT; i++) {
      let y = pos.getY(i) + speeds[i] * delta;
      if (y > ceiling) y = 0;
      const x = pos.getX(i) + Math.sin(t * 0.3 + i) * delta * 0.05;
      pos.setY(i, y);
      pos.setX(i, x);
    }
    pos.needsUpdate = true;
  });

  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial
        size={0.05}
        color="#fff2c8"
        transparent
        opacity={0.4}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}

function NodeGlyph({
  positioned,
  selected,
  justGrew,
  onSelect,
}: {
  positioned: PositionedNode;
  selected: boolean;
  justGrew: boolean;
  onSelect: (node: ForestNodeDTO | null) => void;
}) {
  const { node, position, scale } = positioned;
  const [hovered, setHovered] = useState(false);
  const ref = useRef<THREE.Group>(null);
  // Grow-in progress: springs 0 → 1 the first time this glyph exists.
  const appear = useRef(0);

  useFrame((state, delta) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    appear.current = THREE.MathUtils.damp(appear.current, 1, 5, delta);
    const emphasis = selected ? 1.5 : hovered ? 1.25 : justGrew ? 1.3 : 1;
    const s = appear.current * emphasis;
    ref.current.scale.setScalar(s);
    if (node.kind === "LEAF" || node.kind === "FLOWER" || node.kind === "FRUIT") {
      ref.current.rotation.z = Math.sin(t * 0.9 + position[0]) * 0.09;
      ref.current.rotation.x = Math.cos(t * 0.7 + position[2]) * 0.05;
    }
  });

  const color = tintFor(node.kind, node.id);

  return (
    <group
      ref={ref}
      position={position as Vec3}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = "default";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(node);
      }}
    >
      <Geometry kind={node.kind} scale={scale} color={color} glow={justGrew} seed={hash01(node.id, 9)} />
      {justGrew ? <GrowthBurst scale={scale} /> : null}
      {(hovered || selected) && (
        <Html center distanceFactor={10} position={[0, scale + 0.4, 0]}>
          <div className="pointer-events-none select-none whitespace-nowrap rounded-full bg-black/80 px-3 py-1 text-xs text-parchment">
            {node.title}
          </div>
        </Html>
      )}
    </group>
  );
}

/** An expanding, fading ring + glow that plays when a node first appears. */
function GrowthBurst({ scale }: { scale: number }) {
  const ring = useRef<THREE.Mesh>(null);
  const start = useRef<number | null>(null);

  useFrame((state) => {
    if (!ring.current) return;
    if (start.current === null) start.current = state.clock.elapsedTime;
    const life = 1.4;
    const age = state.clock.elapsedTime - start.current;
    const p = Math.min(age / life, 1);
    const s = 0.3 + p * 3.2;
    ring.current.scale.set(s, s, s);
    const mat = ring.current.material as THREE.MeshBasicMaterial;
    mat.opacity = (1 - p) * 0.7;
    ring.current.visible = p < 1;
  });

  return (
    <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[scale * 0.9, scale * 1.15, 32]} />
      <meshBasicMaterial color="#ffe6a8" transparent opacity={0.7} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

function Geometry({
  kind,
  scale,
  color,
  glow,
  seed,
}: {
  kind: string;
  scale: number;
  color: string;
  glow: boolean;
  seed: number;
}) {
  // A freshly grown object gets a warm emissive lift for a moment.
  const emissive = glow ? "#ffcf7a" : color;
  const emissiveIntensity = glow ? 0.5 : 0;

  switch (kind) {
    case "SEED":
      return (
        <mesh castShadow>
          <sphereGeometry args={[scale, 16, 16]} />
          <meshStandardMaterial color={color} roughness={0.6} emissive={emissive} emissiveIntensity={emissiveIntensity} />
        </mesh>
      );
    case "LEAF":
      return (
        <mesh
          geometry={LEAF_GEOMETRY}
          scale={scale * 3}
          rotation={[-0.5, seed * Math.PI * 2, seed * 0.6 - 0.3]}
          castShadow
        >
          <meshStandardMaterial
            color={color}
            roughness={0.55}
            side={THREE.DoubleSide}
            emissive={emissive}
            emissiveIntensity={emissiveIntensity}
          />
        </mesh>
      );
    case "FLOWER":
      return <Flower scale={scale} color={color} glow={glow} />;
    case "FRUIT":
      return (
        <mesh castShadow>
          <sphereGeometry args={[scale, 16, 16]} />
          <meshStandardMaterial color={color} roughness={0.35} metalness={0.1} emissive={emissive} emissiveIntensity={emissiveIntensity} />
        </mesh>
      );
    case "PHOTO":
      return (
        <mesh castShadow>
          <boxGeometry args={[scale * 1.4, scale * 1.4, scale * 0.15]} />
          <meshStandardMaterial color={color} roughness={0.6} emissive={emissive} emissiveIntensity={emissiveIntensity} />
        </mesh>
      );
    case "PERSON":
      return (
        <group>
          <mesh position={[0, scale * 0.35, 0]} castShadow>
            <coneGeometry args={[scale * 0.7, scale * 1.2, 8]} />
            <meshStandardMaterial color={color} roughness={0.7} emissive={emissive} emissiveIntensity={emissiveIntensity} />
          </mesh>
          <mesh position={[0, -scale * 0.4, 0]}>
            <cylinderGeometry args={[scale * 0.12, scale * 0.12, scale * 0.6, 6]} />
            <meshStandardMaterial color="#5b3a29" />
          </mesh>
        </group>
      );
    case "ROOT":
      return (
        <mesh>
          <sphereGeometry args={[scale, 10, 10]} />
          <meshStandardMaterial color={color} roughness={0.6} emissive={emissive} emissiveIntensity={emissiveIntensity} />
        </mesh>
      );
    default:
      return (
        <mesh castShadow>
          <octahedronGeometry args={[scale, 0]} />
          <meshStandardMaterial color={color} roughness={0.6} emissive={emissive} emissiveIntensity={emissiveIntensity} />
        </mesh>
      );
  }
}

/** A small bloom: five petals around a golden center. */
function Flower({ scale, color, glow }: { scale: number; color: string; glow: boolean }) {
  const petals = [0, 1, 2, 3, 4];
  return (
    <group>
      {petals.map((i) => {
        const a = (i / petals.length) * Math.PI * 2;
        return (
          <mesh
            key={i}
            geometry={LEAF_GEOMETRY}
            position={[Math.cos(a) * scale * 0.5, 0, Math.sin(a) * scale * 0.5]}
            rotation={[-Math.PI / 2, 0, a]}
            scale={scale * 1.6}
          >
            <meshStandardMaterial
              color={color}
              side={THREE.DoubleSide}
              roughness={0.5}
              emissive={glow ? "#ffcf7a" : color}
              emissiveIntensity={glow ? 0.5 : 0.15}
            />
          </mesh>
        );
      })}
      <mesh>
        <sphereGeometry args={[scale * 0.35, 12, 12]} />
        <meshStandardMaterial color="#f4c95d" emissive="#f4c95d" emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
}
