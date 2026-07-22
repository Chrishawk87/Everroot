"use client";

import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html, Sky } from "@react-three/drei";
import * as THREE from "three";
import { computeLayout, type Vec3 } from "@/lib/forest/layout";
import type { ForestGraph, GrowthStage } from "@/lib/forest/types";

const SUN_POSITION: Vec3 = [-28, 30, -18];

// Crown fullness by growth stage — a stylized silhouette for the overview.
const CROWN: Record<GrowthStage, { r: number }> = {
  SEED: { r: 0.45 },
  SPROUT: { r: 0.9 },
  SAPLING: { r: 1.5 },
  YOUNG_TREE: { r: 2.2 },
  MATURE_TREE: { r: 2.9 },
  ANCIENT_TREE: { r: 3.6 },
};

function hash01(id: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

export interface FamilyTreeData {
  userId: string;
  displayName: string;
  relationship: string | null;
  isSelf: boolean;
  graph: ForestGraph;
}

interface Props {
  trees: FamilyTreeData[];
  onEnter: (userId: string, isSelf: boolean) => void;
}

// Places each tree in a clearing: you at the centre, family arranged in a ring
// around you. A glowing underground web ties every tree back to the shared
// heart of the forest.
export default function FamilyForestCanvas({ trees, onEnter }: Props) {
  const placed = useMemo(() => {
    const others = trees.filter((t) => !t.isSelf);
    const self = trees.find((t) => t.isSelf);
    const ring = Math.max(9, others.length * 2.4);
    const out: { tree: FamilyTreeData; pos: Vec3 }[] = [];
    if (self) out.push({ tree: self, pos: [0, 0, 0] });
    others.forEach((tree, i) => {
      const a = (i / Math.max(others.length, 1)) * Math.PI * 2 + 0.6;
      out.push({ tree, pos: [Math.cos(a) * ring, 0, Math.sin(a) * ring] });
    });
    return out;
  }, [trees]);

  return (
    <Canvas
      shadows
      camera={{ position: [0, 12, 26], fov: 50 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
    >
      <color attach="background" args={["#cfe3d6"]} />
      <Sky distance={450000} sunPosition={SUN_POSITION} turbidity={6} rayleigh={1.4} mieCoefficient={0.006} mieDirectionalG={0.85} />
      <fog attach="fog" args={["#d7e6d2", 40, 120]} />

      <ambientLight intensity={0.45} />
      <hemisphereLight args={["#e6f2e6", "#4a5b34", 0.7]} />
      <directionalLight position={SUN_POSITION} intensity={2} color="#fff1d6" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} />

      <Ground />
      <RootWeb points={placed.map((p) => p.pos)} />

      {placed.map(({ tree, pos }) => (
        <StylizedTree key={tree.userId} tree={tree} position={pos} onEnter={onEnter} />
      ))}

      <OrbitControls makeDefault enablePan enableZoom minDistance={6} maxDistance={80} maxPolarAngle={Math.PI / 2.1} target={[0, 2, 0]} />
    </Canvas>
  );
}

function StylizedTree({
  tree,
  position,
  onEnter,
}: {
  tree: FamilyTreeData;
  position: Vec3;
  onEnter: (userId: string, isSelf: boolean) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const trunkHeight = useMemo(() => computeLayout(tree.graph).trunkHeight, [tree.graph]);
  const crown = CROWN[tree.graph.stage];

  // A lumpy crown from three overlapping blobs so it isn't a plain ball.
  const blobs = useMemo(() => {
    const out: { p: Vec3; r: number }[] = [];
    for (let i = 0; i < 3; i++) {
      const a = hash01(tree.userId, i * 7) * Math.PI * 2;
      const rr = crown.r * (0.45 + hash01(tree.userId, i * 5) * 0.3);
      out.push({
        p: [Math.cos(a) * crown.r * 0.4, (hash01(tree.userId, i * 3) - 0.3) * crown.r * 0.5, Math.sin(a) * crown.r * 0.4],
        r: rr,
      });
    }
    return out;
  }, [tree.userId, crown.r]);

  const crownColor = tree.isSelf ? "#8fce62" : "#6fae54";
  const glow = hovered ? 0.5 : 0.12;

  return (
    <group
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
        onEnter(tree.userId, tree.isSelf);
      }}
    >
      {/* Trunk */}
      <mesh position={[0, trunkHeight / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.12, 0.28, trunkHeight, 12, 3]} />
        <meshStandardMaterial color="#6b4a30" roughness={0.95} />
      </mesh>

      {/* Crown */}
      {crown.r > 0
        ? blobs.map((b, i) => (
            <mesh key={i} position={[b.p[0], trunkHeight + crown.r * 0.5 + b.p[1], b.p[2]]} castShadow>
              <icosahedronGeometry args={[b.r, 1]} />
              <meshStandardMaterial color={crownColor} roughness={0.85} flatShading emissive={crownColor} emissiveIntensity={glow} />
            </mesh>
          ))
        : null}

      {/* Underground seed-orb — the tree's root in the shared web. */}
      <mesh position={[0, -0.6, 0]}>
        <sphereGeometry args={[0.34, 16, 16]} />
        <meshStandardMaterial color="#7fc99a" emissive="#7fc99a" emissiveIntensity={hovered ? 1.1 : 0.7} roughness={0.35} />
      </mesh>

      {/* Selection ring on the ground */}
      {hovered ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <ringGeometry args={[crown.r + 0.6, crown.r + 0.9, 40]} />
          <meshBasicMaterial color="#ffe6a8" transparent opacity={0.6} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ) : null}

      <Html center distanceFactor={22} position={[0, trunkHeight + crown.r + 1.1, 0]}>
        <div className="pointer-events-none select-none whitespace-nowrap rounded-full bg-black/75 px-3 py-1 text-center font-sans text-xs text-parchment backdrop-blur">
          <span className="font-semibold">{tree.isSelf ? "You" : tree.displayName}</span>
          {tree.relationship ? <span className="text-parchment/60"> · {tree.relationship}</span> : null}
        </div>
      </Html>
    </group>
  );
}

// A glowing web of roots joining every tree to the heart of the clearing.
function RootWeb({ points }: { points: Vec3[] }) {
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const geometries = useMemo(() => {
    const heart = new THREE.Vector3(0, -1.4, 0);
    return points
      .filter((p) => !(p[0] === 0 && p[2] === 0))
      .map((p) => {
        const end = new THREE.Vector3(p[0], -0.6, p[2]);
        const mid = heart.clone().add(end).multiplyScalar(0.5);
        mid.y -= 0.8 + heart.distanceTo(end) * 0.06;
        const curve = new THREE.QuadraticBezierCurve3(heart, mid, end);
        return new THREE.TubeGeometry(curve, 24, 0.03, 6, false);
      });
  }, [points]);

  useFrame((state) => {
    if (matRef.current) {
      matRef.current.opacity = 0.28 + 0.1 * Math.sin(state.clock.elapsedTime * 1.5);
    }
  });

  if (!geometries.length) return null;
  return (
    <group>
      {/* Shared heart of the family forest. */}
      <mesh position={[0, -1.4, 0]}>
        <sphereGeometry args={[0.5, 20, 20]} />
        <meshBasicMaterial color="#c4f5e0" transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {geometries.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshBasicMaterial ref={i === 0 ? matRef : undefined} color="#7fd6b4" transparent opacity={0.3} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function Ground() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.4, 0]}>
        <circleGeometry args={[120, 64]} />
        <meshStandardMaterial color="#241a12" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <circleGeometry args={[120, 64]} />
        <meshStandardMaterial color="#6f9a58" roughness={1} transparent opacity={0.72} depthWrite={false} />
      </mesh>
    </group>
  );
}
