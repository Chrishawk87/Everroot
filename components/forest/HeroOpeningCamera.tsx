"use client";

import { useEffect, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  sampleHeroCamera,
  sampleHeroCameraReducedMotion,
  veinIgnition01,
  HERO_CAMERA_DURATION,
} from "@/lib/forest/heroCamera";

/**
 * The 6-beat opening cinematic camera (HERO_CAMERA_SPEC.md).
 *
 * Drives the live camera along the single eased spline in lib/forest/heroCamera
 * — one unbroken ~28s move, low glide → crane → boom → settle. Raw useFrame +
 * an eased clock (no react-spring / GSAP), matching the rest of the scene.
 *
 * Behaviour, per spec:
 *  - fires ONCE (guarded by `enabled` + an internal done ref); never re-triggers
 *    on navigation. The caller owns first-load gating (e.g. localStorage).
 *  - honours prefers-reduced-motion: falls back to a gentle beat5→6 push.
 *  - reports vein-ignition 0..1 via onVeinGlow so the tree "wakes" on beat 4.
 *  - hands control back to OrbitControls on completion via onComplete.
 *
 * This is a scaffold and is GATED OFF by default (`enabled = false`) so it does
 * not hijack the existing ForestIntro. Flip it on at the wire-up point once the
 * hero tree + environment are in the runtime scene.
 */

export interface HeroOpeningCameraProps {
  /** Master gate. Default false so the scaffold is inert until wired. */
  enabled?: boolean;
  /** Trunk height H (world units) — poses are H-relative. Default 25. */
  scale?: number;
  /** Called each frame with vein-ignition 0..1 (sync to HeroTree.veinGlow). */
  onVeinGlow?: (v: number) => void;
  /** Called once when the move finishes (hand back to OrbitControls). */
  onComplete?: () => void;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function HeroOpeningCamera({
  enabled = false,
  scale = 25,
  onVeinGlow,
  onComplete,
}: HeroOpeningCameraProps) {
  const camera = useThree((s) => s.camera);
  const startRef = useRef<number | null>(null);
  const doneRef = useRef(false);
  const reducedRef = useRef(false);
  const targetVec = useRef(new THREE.Vector3());

  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    // Reset the clock whenever the move is (re)enabled.
    startRef.current = null;
    doneRef.current = false;
  }, [enabled]);

  useFrame((state) => {
    if (!enabled || doneRef.current) return;

    if (startRef.current === null) startRef.current = state.clock.elapsedTime;
    const elapsed = state.clock.elapsedTime - startRef.current;

    const reduced = reducedRef.current;
    // Reduced-motion runs a short 4s beat5→6 push; full move is HERO_CAMERA_DURATION.
    const duration = reduced ? 4 : HERO_CAMERA_DURATION;

    const pose = reduced
      ? sampleHeroCameraReducedMotion(elapsed / duration, scale)
      : sampleHeroCamera(elapsed, scale);

    camera.position.set(pose.position[0], pose.position[1], pose.position[2]);
    targetVec.current.set(pose.target[0], pose.target[1], pose.target[2]);
    camera.lookAt(targetVec.current);

    if (camera instanceof THREE.PerspectiveCamera) {
      // FOV animates with the lens arc (24→35→…→50mm). Only touch it for the
      // full move; reduced-motion holds the wide framing.
      camera.fov = pose.fovDeg;
      camera.updateProjectionMatrix();
    }

    if (onVeinGlow) onVeinGlow(reduced ? 1 : veinIgnition01(elapsed));

    if (elapsed >= duration) {
      doneRef.current = true;
      if (onVeinGlow) onVeinGlow(1);
      if (onComplete) onComplete();
    }
  });

  return null;
}

/*
 * WIRE-UP (single point). In components/forest/ForestCanvas.tsx:
 *
 *   const [veinGlow, setVeinGlow] = useState(0);
 *   const [openingDone, setOpeningDone] = useState(false);
 *   ...
 *   <HeroOpeningCamera
 *     enabled={playOpening}          // your first-load gate
 *     scale={layout.trunkHeight}
 *     onVeinGlow={setVeinGlow}
 *     onComplete={() => setOpeningDone(true)}
 *   />
 *   <HeroTree scale={layout.trunkHeight} veinGlow={veinGlow} />
 *
 * While `enabled`, disable OrbitControls (or set makeDefault only after
 * openingDone) so the two don't fight for the camera. Leave `enabled={false}`
 * until the hero tree + environment are in the scene — the current ForestIntro
 * keeps running in the meantime.
 */
