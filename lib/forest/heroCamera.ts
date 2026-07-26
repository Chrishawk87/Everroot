/**
 * Hero opening camera — pure, framework-free sampler.
 *
 * The single source of truth for the 6-beat opening cinematic move is
 * HERO_CAMERA_SPEC.md. This module encodes that spec as data (six keyed poses:
 * position + target + focal length + timing) plus a sampler that, given a time
 * in seconds, returns an eased, cross-blended camera pose. It intentionally has
 * NO three.js / R3F imports so it can be unit-checked with tsc/node in isolation
 * and reused by both the R3F runtime and any offline tooling.
 *
 * The R3F component (components/forest/HeroOpeningCamera.tsx) drives a clock,
 * calls sampleHeroCamera(t, ...), and writes the result onto the live camera.
 *
 * Coordinates are expressed as multiples of the tree's trunk height H so the
 * move scales with whatever the authored hero_tree.glb turns out to be. The
 * caller passes `scale = H` (world units) and the sampler multiplies through.
 */

export type Vec3 = [number, number, number];

/** One keyed pose in the opening move. Positions/targets are in H-relative
 *  units (multiply by trunk height at sample time). */
export interface HeroCameraBeat {
  /** 1..6, for reference against the spec. */
  index: number;
  /** Beat name from the spec (The Threshold, The Glide, …). */
  name: string;
  /** Seconds from the start of the move at which this pose is reached. */
  time: number;
  /** Camera position, in units of trunk height H. */
  position: Vec3;
  /** Look-at target, in units of trunk height H. */
  target: Vec3;
  /** Lens focal length (mm, 35mm-equivalent) for this beat. Drives FOV. */
  focalLengthMm: number;
}

/**
 * The six beats, per HERO_CAMERA_SPEC.md. Positions are authored H-relative:
 * the tree base is the origin, +Y up, the viewer approaches from camera-left
 * front (+Z toward camera, path receding in −Z). These are deliberate,
 * hand-tuned staging values — treat the spec doc as the intent and refine the
 * numbers against the real hero_tree.glb once it lands.
 *
 *  H = trunk height (~25–30 m authored). So e.g. z = 6H places the camera ~6
 *  tree-heights back down the path for the wide threshold, easing in to a
 *  three-quarter hero framing at ~2.4H for the final settle.
 */
export const HERO_CAMERA_BEATS: HeroCameraBeat[] = [
  {
    index: 1,
    name: "The Threshold",
    time: 0,
    // Very low, near-static hover at the foot of the bridge; tree small/distant.
    position: [0.15, 0.05, 6.0],
    target: [0, 0.35, 0],
    focalLengthMm: 24,
  },
  {
    index: 2,
    name: "The Glide",
    time: 4,
    // Low forward tracking along the path; bridge falling behind.
    position: [0.1, 0.08, 4.0],
    target: [0, 0.4, 0],
    focalLengthMm: 35,
  },
  {
    index: 3,
    name: "The Rise",
    time: 9,
    // Crane begins lifting at the plaza base; roots fill the lower frame.
    position: [0.05, 0.22, 2.6],
    target: [0, 0.55, 0],
    focalLengthMm: 40,
  },
  {
    index: 4,
    name: "Ignition",
    time: 14,
    // Push in close to the trunk as veins surge; tilting up.
    position: [0.02, 0.35, 1.5],
    target: [0, 0.7, 0],
    focalLengthMm: 35,
  },
  {
    index: 5,
    name: "Awe",
    time: 18,
    // Boom up + tilt into the canopy; limbs fan across the sky.
    position: [0.0, 0.85, 1.3],
    target: [0, 1.15, 0],
    focalLengthMm: 24,
  },
  {
    index: 6,
    name: "Home",
    time: 23,
    // Ease back and settle into the resolved three-quarter hero framing.
    position: [0.55, 0.5, 2.4],
    target: [0, 0.55, 0],
    focalLengthMm: 50,
  },
];

/** Total duration of the move in seconds (spec: ~28s — the final settle holds
 *  from the last beat's time to here). */
export const HERO_CAMERA_DURATION = 28;

/** Sensor height used for the 35mm-equivalent focal-length → FOV conversion
 *  (full-frame 24mm tall). */
const SENSOR_HEIGHT_MM = 24;

/**
 * Convert a 35mm-equivalent focal length to a VERTICAL field of view (radians),
 * which is what three.js PerspectiveCamera.fov expects (in degrees — caller
 * converts). Aspect is accepted for symmetry / future horizontal-FOV needs but
 * vertical FOV is aspect-independent for a fixed sensor height.
 */
export function focalLengthToVerticalFov(focalLengthMm: number): number {
  return 2 * Math.atan(SENSOR_HEIGHT_MM / (2 * focalLengthMm));
}

/** Vertical FOV in DEGREES (three.js PerspectiveCamera.fov unit). */
export function focalLengthToFovDegrees(focalLengthMm: number): number {
  return (focalLengthToVerticalFov(focalLengthMm) * 180) / Math.PI;
}

/** Smoothstep ease (C¹ continuous) used to cross-blend between beats so there
 *  is no visible "stop" at a keyframe. */
function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

export interface HeroCameraPose {
  /** World-space camera position (H already applied). */
  position: Vec3;
  /** World-space look-at target (H already applied). */
  target: Vec3;
  /** Vertical FOV in degrees for the current lens. */
  fovDeg: number;
  /** 0..1 progress through the whole move (for callers syncing e.g. the vein
   *  ignition uniform to beat 4). */
  progress: number;
}

/**
 * Sample the opening move at time `t` (seconds), scaling H-relative poses by
 * `scale` (world trunk height). Returns an eased, cross-blended pose. Clamps
 * before beat 1 and after the final beat (holds the last pose through the
 * settle to HERO_CAMERA_DURATION).
 */
export function sampleHeroCamera(t: number, scale: number): HeroCameraPose {
  const beats = HERO_CAMERA_BEATS;
  const clamped = Math.max(0, Math.min(HERO_CAMERA_DURATION, t));

  // Find the segment [i, i+1] that contains `clamped`.
  let i = 0;
  while (i < beats.length - 1 && clamped >= beats[i + 1].time) i++;

  const a = beats[i];
  const b = beats[Math.min(i + 1, beats.length - 1)];

  let seg = 0;
  if (b.time > a.time) {
    seg = smoothstep((clamped - a.time) / (b.time - a.time));
  }

  const positionH = lerpVec3(a.position, b.position, seg);
  const targetH = lerpVec3(a.target, b.target, seg);
  const focal = lerp(a.focalLengthMm, b.focalLengthMm, seg);

  return {
    position: [positionH[0] * scale, positionH[1] * scale, positionH[2] * scale],
    target: [targetH[0] * scale, targetH[1] * scale, targetH[2] * scale],
    fovDeg: focalLengthToFovDegrees(focal),
    progress: clamped / HERO_CAMERA_DURATION,
  };
}

/** The reduced-motion fallback per the spec: a gentle slow push from roughly
 *  beat-5 framing into the beat-6 hold, over the given duration. Returns a
 *  sampler that maps 0..1 progress → pose. */
export function sampleHeroCameraReducedMotion(
  progress01: number,
  scale: number,
): HeroCameraPose {
  const p = smoothstep(Math.max(0, Math.min(1, progress01)));
  // Blend from Awe (beat 5) toward Home (beat 6) only — no low approach.
  const from = HERO_CAMERA_BEATS[4];
  const to = HERO_CAMERA_BEATS[5];
  const positionH = lerpVec3(from.position, to.position, p);
  const targetH = lerpVec3(from.target, to.target, p);
  const focal = lerp(from.focalLengthMm, to.focalLengthMm, p);
  return {
    position: [positionH[0] * scale, positionH[1] * scale, positionH[2] * scale],
    target: [targetH[0] * scale, targetH[1] * scale, targetH[2] * scale],
    fovDeg: focalLengthToFovDegrees(focal),
    progress: p,
  };
}

/** Beat index (1-based) whose window contains time `t`. Handy for syncing
 *  events — e.g. ramp the vein-emissive uniform during beat 4 (Ignition). */
export function heroBeatAt(t: number): number {
  const beats = HERO_CAMERA_BEATS;
  const clamped = Math.max(0, Math.min(HERO_CAMERA_DURATION, t));
  let i = 0;
  while (i < beats.length - 1 && clamped >= beats[i + 1].time) i++;
  return beats[i].index;
}

/** 0..1 ramp for the beat-4 vein ignition, per the spec ("the vein glow ramps
 *  up as the camera pushes in"). Ramps across beat 3→4 and holds at 1 after. */
export function veinIgnition01(t: number): number {
  const start = HERO_CAMERA_BEATS[2].time; // Rise begins
  const full = HERO_CAMERA_BEATS[3].time + 2; // shortly after Ignition peak
  if (t <= start) return 0;
  if (t >= full) return 1;
  return smoothstep((t - start) / (full - start));
}
