"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

// A small pointed-oval leaf silhouette for the sprout.
const LEAF_GEOMETRY = (() => {
  const s = new THREE.Shape();
  s.moveTo(0, -0.5);
  s.bezierCurveTo(0.42, -0.18, 0.34, 0.5, 0, 0.72);
  s.bezierCurveTo(-0.34, 0.5, -0.42, -0.18, 0, -0.5);
  const g = new THREE.ShapeGeometry(s, 14);
  g.center();
  return g;
})();

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

interface Props {
  displayName: string;
  onComplete: () => void;
}

export default function ForestIntro({ displayName, onComplete }: Props) {
  const [line, setLine] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const finished = useRef(false);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    setLeaving(true);
    setTimeout(onComplete, 1100);
  };

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setLine("Every life begins with a story."), 2000));
    timers.push(setTimeout(() => setLine(null), 5200));
    timers.push(setTimeout(() => setLine(`This is you, ${displayName}.`), 6400));
    timers.push(setTimeout(() => setLine(null), 8600));
    timers.push(setTimeout(finish, 9200));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayName]);

  return (
    <div
      className="fixed inset-0 z-50 transition-opacity duration-1000"
      style={{ opacity: leaving ? 0 : 1 }}
    >
      <Canvas camera={{ position: [3, 1.1, 0], fov: 45 }}>
        <color attach="background" args={["#05090a"]} />
        <fog attach="fog" args={["#05090a", 5, 14]} />
        <IntroScene />
      </Canvas>

      {/* Cinematic vignette. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 45%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.35) 70%, rgba(0,0,0,0.85) 100%)",
        }}
      />

      {/* Narration line. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-[22%] flex justify-center px-6">
        <p
          className="max-w-xl text-center font-serif text-2xl tracking-wide text-parchment transition-opacity duration-[1500ms] sm:text-3xl"
          style={{ opacity: line ? 1 : 0, textShadow: "0 2px 20px rgba(0,0,0,0.8)" }}
        >
          {line ?? "\u00A0"}
        </p>
      </div>

      {/* Skip. */}
      <button
        onClick={finish}
        className="absolute bottom-6 right-6 rounded-full border border-parchment/25 bg-black/40 px-4 py-1.5 font-sans text-sm text-parchment/70 transition hover:border-parchment/60 hover:text-parchment"
      >
        Skip ›
      </button>
    </div>
  );
}

function IntroScene() {
  const { camera } = useThree();
  const seedRef = useRef<THREE.Mesh>(null);
  const seedLightRef = useRef<THREE.PointLight>(null);
  const rootRef = useRef<THREE.Group>(null);
  const sproutRef = useRef<THREE.Group>(null);
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const beamRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;

    // Slow orbit around the seed, lifting away at the very end.
    const ang = 0.5 + t * 0.2;
    const rad = THREE.MathUtils.lerp(3.1, 2.5, Math.min(t / 9, 1));
    const lift = t > 8 ? (t - 8) * 0.9 : 0;
    camera.position.set(Math.cos(ang) * rad, 1.0 + Math.min(t * 0.03, 0.35) + lift, Math.sin(ang) * rad);
    camera.lookAt(0, 0.2 + lift * 0.4, 0);

    // Sunbeam breaks through the dark.
    const beam = clamp01((t - 0.6) / 2.0);
    if (sunRef.current) sunRef.current.intensity = beam * 1.7;
    if (beamRef.current) (beamRef.current.material as THREE.MeshBasicMaterial).opacity = beam * 0.22;

    // Seed glows as the first memory takes hold.
    const glow = clamp01((t - 4.2) / 1.6);
    if (seedRef.current) (seedRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = glow * 1.5;
    if (seedLightRef.current) seedLightRef.current.intensity = glow * 1.2;

    // Root reaches downward.
    const rp = clamp01((t - 4.2) / 1.7);
    if (rootRef.current) rootRef.current.scale.set(rp, rp, rp);

    // Sprout breaks through the soil and unfurls.
    const sp = clamp01((t - 6.0) / 1.9);
    if (sproutRef.current) {
      sproutRef.current.scale.setScalar(sp);
      sproutRef.current.rotation.z = Math.sin(t * 1.2) * 0.06 * sp;
    }
  });

  return (
    <group>
      <ambientLight intensity={0.18} color="#9fb8c8" />
      <directionalLight ref={sunRef} position={[2.5, 6, 1.5]} intensity={0} color="#ffe4b0" />
      <pointLight ref={seedLightRef} position={[0, 0.25, 0]} intensity={0} color="#ffd27a" distance={4} />

      {/* Shaft of light. */}
      <mesh ref={beamRef} position={[1.6, 3.2, 1]} rotation={[0, 0, -0.35]}>
        <coneGeometry args={[1.3, 6, 24, 1, true]} />
        <meshBasicMaterial
          color="#ffe9c0"
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <Soil />
      <Particles />

      {/* Seed resting in the soil. */}
      <mesh ref={seedRef} position={[0, 0.12, 0]} scale={[0.8, 1.1, 0.8]} castShadow>
        <sphereGeometry args={[0.16, 24, 24]} />
        <meshStandardMaterial color="#d9b877" roughness={0.5} emissive="#ffcf7a" emissiveIntensity={0} />
      </mesh>

      {/* Roots grow down from the seed. */}
      <group ref={rootRef} position={[0, 0.02, 0]} scale={0}>
        <Root angle={0} length={0.9} />
        <Root angle={2.1} length={0.7} />
        <Root angle={4.2} length={0.8} />
      </group>

      {/* Sprout rises from the seed. */}
      <group ref={sproutRef} position={[0, 0.22, 0]} scale={0}>
        <mesh position={[0, 0.18, 0]}>
          <cylinderGeometry args={[0.012, 0.02, 0.36, 6]} />
          <meshStandardMaterial color="#5c8a44" roughness={0.7} />
        </mesh>
        <mesh geometry={LEAF_GEOMETRY} position={[0.06, 0.4, 0]} rotation={[-0.4, 0.6, 0.5]} scale={0.18}>
          <meshStandardMaterial color="#6cbf6c" roughness={0.5} side={THREE.DoubleSide} emissive="#3f7a3f" emissiveIntensity={0.15} />
        </mesh>
        <mesh geometry={LEAF_GEOMETRY} position={[-0.06, 0.34, 0]} rotation={[-0.4, -0.6, -0.5]} scale={0.16}>
          <meshStandardMaterial color="#5fae5f" roughness={0.5} side={THREE.DoubleSide} emissive="#3f7a3f" emissiveIntensity={0.15} />
        </mesh>
      </group>
    </group>
  );
}

function Root({ angle, length }: { angle: number; length: number }) {
  const geometry = useMemo(() => {
    const a = new THREE.Vector3(0, 0, 0);
    const b = new THREE.Vector3(Math.cos(angle) * length * 0.5, -length, Math.sin(angle) * length * 0.5);
    const mid = new THREE.Vector3(Math.cos(angle) * length * 0.15, -length * 0.5, Math.sin(angle) * length * 0.15);
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    return new THREE.TubeGeometry(curve, 10, 0.02, 6, false);
  }, [angle, length]);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#6b4a35" roughness={0.9} emissive="#b98a4a" emissiveIntensity={0.2} />
    </mesh>
  );
}

function Soil() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <circleGeometry args={[8, 48]} />
        <meshStandardMaterial color="#1a1208" roughness={1} />
      </mesh>
      <mesh position={[0, -0.05, 0]} scale={[1, 0.4, 1]}>
        <sphereGeometry args={[0.4, 24, 16]} />
        <meshStandardMaterial color="#2e2113" roughness={1} />
      </mesh>
    </group>
  );
}

/** Soft motes drifting through the beam of light. */
function Particles() {
  const ref = useRef<THREE.Points>(null);
  const COUNT = 60;
  const { geometry, speeds } = useMemo(() => {
    const positions = new Float32Array(COUNT * 3);
    const speeds = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 4;
      positions[i * 3 + 1] = Math.random() * 3;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 4;
      speeds[i] = 0.04 + Math.random() * 0.08;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return { geometry, speeds };
  }, []);

  useFrame((state, delta) => {
    if (!ref.current) return;
    const pos = ref.current.geometry.attributes.position as THREE.BufferAttribute;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < COUNT; i++) {
      let y = pos.getY(i) + speeds[i] * delta;
      if (y > 3) y = 0;
      pos.setY(i, y);
      pos.setX(i, pos.getX(i) + Math.sin(t * 0.3 + i) * delta * 0.04);
    }
    pos.needsUpdate = true;
  });

  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial size={0.035} color="#ffe9c0" transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
    </points>
  );
}
