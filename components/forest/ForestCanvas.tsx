"use client";

import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Line, Html } from "@react-three/drei";
import * as THREE from "three";
import type { ForestGraph, ForestNodeDTO } from "@/lib/forest/types";
import { computeLayout, type PositionedNode, type Vec3 } from "@/lib/forest/layout";

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

// Deterministic 0..1 from an id, matching layout.ts, so a leaf's tint is stable.
function hash01(id: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

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
      <color attach="background" args={["#0a1a11"]} />
      <fog attach="fog" args={["#0a1a11", 10, 26]} />

      <ambientLight intensity={0.5} />
      <hemisphereLight args={["#bfe6cf", "#0a1a11", 0.6]} />
      <directionalLight position={[6, 10, 4]} intensity={1.1} castShadow />
      <directionalLight position={[-6, 4, -4]} intensity={0.3} color="#8fd4a8" />
      <pointLight position={[0, layout.trunkHeight + 1.5, 0]} intensity={0.4} color="#ffe6b0" distance={12} />

      <Ground />
      <Motes trunkHeight={layout.trunkHeight} />

      {/* Structural limbs (branches, twigs, roots). */}
      {layout.limbs.map((limb, i) => (
        <Line
          key={i}
          points={[limb.from, limb.to]}
          color={limb.kind === "root" ? "#4a3222" : "#5b3a29"}
          lineWidth={limb.kind === "branch" ? 3 : limb.kind === "root" ? 2.5 : 1.5}
          transparent
          opacity={limb.kind === "twig" ? 0.7 : 1}
        />
      ))}

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
        maxDistance={20}
        maxPolarAngle={Math.PI / 1.9}
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

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <circleGeometry args={[18, 48]} />
      <meshStandardMaterial color="#123421" roughness={1} />
    </mesh>
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
        size={0.06}
        color="#ffe6a8"
        transparent
        opacity={0.55}
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
      <Geometry kind={node.kind} scale={scale} color={color} glow={justGrew} />
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
}: {
  kind: string;
  scale: number;
  color: string;
  glow: boolean;
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
        <mesh castShadow>
          <icosahedronGeometry args={[scale, 0]} />
          <meshStandardMaterial color={color} roughness={0.6} emissive={emissive} emissiveIntensity={emissiveIntensity} />
        </mesh>
      );
    case "FLOWER":
      return (
        <mesh castShadow>
          <dodecahedronGeometry args={[scale, 0]} />
          <meshStandardMaterial color={color} emissive={glow ? "#ffcf7a" : color} emissiveIntensity={glow ? 0.5 : 0.25} />
        </mesh>
      );
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
