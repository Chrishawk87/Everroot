"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html, Sky, Environment, Lightformer, useGLTF, Clone } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette, SMAA } from "@react-three/postprocessing";
import * as THREE from "three";
import type { ForestGraph, ForestNodeDTO } from "@/lib/forest/types";
import { computeLayout, type PositionedNode, type Vec3, type Limb, type Fork, type ForestLayout, type Scar, type GenRing } from "@/lib/forest/layout";
import { MODELS, BACKGROUND_TREE_IDS, GROUND_DETAIL_IDS } from "@/lib/forest/assets";
import {
  AssetBoundary,
  HdriEnvironment,
  Terrain,
  Water,
  Scatter,
  Birds,
  Butterflies,
  type ScatterItem,
} from "@/components/forest/assets";
import { LegacyPlaza, StonePath, Stream, WoodenBridge, Moat, Fireflies } from "@/components/forest/assets/Composition";
import { HeroTree } from "@/components/forest/HeroTree";

// The central tree is now the ONE authored/imported hero mesh
// (public/assets/models/hero/hero_tree.glb), per the EverRoot Studios pipeline:
// the tree ORIGINATES as an asset and the app only modifies it. When true, the
// generative woody structure (Trunk / LivingTrunk / Branches / decorative
// Canopy / trunk Scars) is retired and replaced by <HeroTree>. The interactive
// memory nodes, threads, god-rays and canopy sparkles stay — they're positioned
// from the layout math, not the retired geometry, so they still read as living
// memories in the crown. Flip to false to fall back to the generative tree if
// the .glb ever needs to be swapped out.
const USE_HERO_TREE = true;

const COLORS: Record<string, string> = {
  SEED: "#c9a86a",
  LEAF: "#7cc35a",
  FLOWER: "#e5738a",
  FRUIT: "#e8a33d",
  PHOTO: "#cfd8e3",
  PERSON: "#7fc99a",
  ROOT: "#7a5638",
  MEMORY_MOMENT: "#5bd0c0",
  MEMORY: "#9ad0b0",
};

const HIDDEN = new Set(["TIMELINE_EVENT", "RELATIONSHIP", "SUB_BRANCH"]);

// Normal-map strengths (three expects a Vector2, not an array literal).
const BARK_NORMAL_SCALE = new THREE.Vector2(0.7, 0.7);
const TRUNK_NORMAL_SCALE = new THREE.Vector2(0.85, 0.85);
const GROUND_NORMAL_SCALE = new THREE.Vector2(0.6, 0.6);
const SUN_POSITION: Vec3 = [-28, 30, -18];
// A memorial forest is lit at dusk: the sun rests low on the horizon, casting a
// long amber light that fades to a deep twilight blue overhead — a quiet, elegiac
// version of the same living world.
const MEMORIAL_SUN: Vec3 = [-26, 3.5, -20];

// Atmosphere palette, swapped whole when a forest becomes a memorial.
interface Atmosphere {
  sun: Vec3;
  background: string;
  sky: { turbidity: number; rayleigh: number; mieCoefficient: number; mieDirectionalG: number };
  fog: { color: string; near: number; far: number };
  ambient: number;
  hemi: { sky: string; ground: string; intensity: number };
  dir: { color: string; intensity: number };
  motes: { color: string; opacity: number };
}

// The resting daytime look is a warm golden hour: a low sun sitting behind the
// tree, an amber horizon, and rich (not washed-out) greens — the palette of the
// concept art. Night, dawn and deep-sunset keyframes still cycle around it.
// A LOW, deep golden hour — even the resting "daytime" look sits the sun near
// the horizon behind the tree so the sky glows amber rather than blowing out to
// white overhead. This is the unmistakable golden palette of the concept art.
const DAY_ATMOSPHERE: Atmosphere = {
  // A lower sun + richer sky so the horizon glows deep amber rather than
  // blowing out to white where the disc sits behind the tree.
  sun: [-30, 4.2, -24],
  background: "#dcb173",
  sky: { turbidity: 5, rayleigh: 2.2, mieCoefficient: 0.016, mieDirectionalG: 0.8 },
  fog: { color: "#d9b478", near: 44, far: 140 },
  ambient: 0.42,
  hemi: { sky: "#f6e3b4", ground: "#4a552f", intensity: 0.58 },
  dir: { color: "#ffca82", intensity: 1.35 },
  motes: { color: "#ffe2a6", opacity: 0.42 },
};

const MEMORIAL_ATMOSPHERE: Atmosphere = {
  sun: MEMORIAL_SUN,
  background: "#141d2b",
  sky: { turbidity: 10, rayleigh: 3.2, mieCoefficient: 0.02, mieDirectionalG: 0.82 },
  fog: { color: "#26303f", near: 36, far: 120 },
  ambient: 0.26,
  hemi: { sky: "#9fb0cc", ground: "#2a2b24", intensity: 0.38 },
  dir: { color: "#e7b184", intensity: 1.05 },
  // Warmer, brighter drifting motes read like candlelight or rising embers of memory.
  motes: { color: "#ffd8a0", opacity: 0.6 },
};

// ---- Living time-of-day cycle ----
// A slow ~2.5-minute loop carries the forest from night, through dawn, into full
// day, then down through golden hour to sunset and back to night. The scene
// starts mid-day so a fresh visitor lands in daylight. Each phase is a full
// Atmosphere plus a `night` value (0 = bright day, 1 = deep night) that drives
// the drifting motes and the memory constellations.
interface Keyframe extends Atmosphere {
  at: number; // position in the 0..1 cycle
  night: number;
}

const NIGHT_ATMOSPHERE: Atmosphere = {
  sun: [18, -6, 16],
  background: "#0a1020",
  sky: { turbidity: 0.1, rayleigh: 0.35, mieCoefficient: 0.001, mieDirectionalG: 0.9 },
  fog: { color: "#0d1526", near: 38, far: 130 },
  ambient: 0.18,
  hemi: { sky: "#38507a", ground: "#0e141d", intensity: 0.35 },
  dir: { color: "#9fb8e0", intensity: 0.28 },
  motes: { color: "#bcd0ff", opacity: 0.5 },
};

const DAWN_ATMOSPHERE: Atmosphere = {
  sun: [26, 5, 16],
  background: "#e6c4a8",
  sky: { turbidity: 4, rayleigh: 2.4, mieCoefficient: 0.02, mieDirectionalG: 0.85 },
  fog: { color: "#e6cbb6", near: 42, far: 135 },
  ambient: 0.34,
  hemi: { sky: "#f6dcc4", ground: "#40492e", intensity: 0.46 },
  dir: { color: "#ffd9a8", intensity: 1.05 },
  motes: { color: "#ffe4c0", opacity: 0.4 },
};

const GOLDEN_ATMOSPHERE: Atmosphere = {
  sun: [-26, 10, -20],
  background: "#e2caa0",
  sky: { turbidity: 6, rayleigh: 2.0, mieCoefficient: 0.017, mieDirectionalG: 0.82 },
  fog: { color: "#e0c99c", near: 46, far: 140 },
  ambient: 0.34,
  hemi: { sky: "#f3e0b0", ground: "#4a4a2e", intensity: 0.5 },
  dir: { color: "#ffcf8a", intensity: 1.35 },
  motes: { color: "#ffe6b0", opacity: 0.42 },
};

const SUNSET_ATMOSPHERE: Atmosphere = {
  sun: [-26, 2.5, -22],
  background: "#3a2c3e",
  sky: { turbidity: 10, rayleigh: 3.4, mieCoefficient: 0.03, mieDirectionalG: 0.85 },
  fog: { color: "#3a2f3e", near: 40, far: 125 },
  ambient: 0.28,
  hemi: { sky: "#c58aa0", ground: "#2a2320", intensity: 0.4 },
  dir: { color: "#ff9d6a", intensity: 0.95 },
  motes: { color: "#ffcfa0", opacity: 0.55 },
};

const DAY_CYCLE: Keyframe[] = [
  { at: 0.0, night: 1.0, ...NIGHT_ATMOSPHERE },
  { at: 0.16, night: 0.45, ...DAWN_ATMOSPHERE },
  { at: 0.32, night: 0.0, ...DAY_ATMOSPHERE },
  { at: 0.6, night: 0.0, ...DAY_ATMOSPHERE },
  { at: 0.76, night: 0.2, ...GOLDEN_ATMOSPHERE },
  { at: 0.9, night: 0.7, ...SUNSET_ATMOSPHERE },
  { at: 1.0, night: 1.0, ...NIGHT_ATMOSPHERE },
];

// Precomputed THREE.Color instances for each keyframe (avoids per-frame string parsing).
const CYCLE_COLORS = DAY_CYCLE.map((k) => ({
  bg: new THREE.Color(k.background),
  fog: new THREE.Color(k.fog.color),
  hemiSky: new THREE.Color(k.hemi.sky),
  hemiGround: new THREE.Color(k.hemi.ground),
  dir: new THREE.Color(k.dir.color),
}));

// Day/night follows the visitor's real local clock: midnight = 0, noon = 0.5.
function realTimePhase() {
  const now = new Date();
  return (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400;
}

// The nine interview branches each carry their own light. Memory leaves inherit
// their branch's color and glow a little brighter so the tree reads as chapters
// of a life, not one undifferentiated canopy. "Messages for Future Generations"
// is the brightest — it's the whole point of the forest.
const CATEGORY_COLORS: Record<string, string> = {
  "Life Advice": "#cdd8ff",
  "Family Traditions": "#f2c66b",
  "Favorite Stories": "#7fd0e8",
  "Childhood Memories": "#8fe0a0",
  Milestones: "#ffb0d6",
  "Roots & Heritage": "#d0a06a",
  "Biggest Wins": "#ffd54a",
  "Biggest Mistakes": "#9aa2b4",
  "Messages for Future Generations": "#fff4c0",
  Tributes: "#ffc2a6",
};

const MEMORY_KINDS = new Set(["LEAF", "FLOWER", "FRUIT", "PHOTO", "MEMORY", "MEMORY_MOMENT"]);

// Crown spread + leaf count, trunk girth and limb thickness are no longer read
// from a per-stage table — they're computed continuously from the life's data
// by computeGrowth() in lib/forest/layout.ts and arrive on the ForestLayout.

function hash01(id: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/* ---------- Procedural textures (canvas-generated; no external assets) ---------- */

function makeLeafTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 160;
  const x = c.getContext("2d")!;
  x.clearRect(0, 0, 128, 160);
  x.beginPath();
  x.moveTo(64, 4);
  x.bezierCurveTo(122, 42, 108, 132, 64, 156);
  x.bezierCurveTo(20, 132, 6, 42, 64, 4);
  x.closePath();
  const g = x.createLinearGradient(0, 0, 40, 160);
  g.addColorStop(0, "#8fce62");
  g.addColorStop(0.5, "#4e9a3d");
  g.addColorStop(1, "#2f6b2a");
  x.fillStyle = g;
  x.fill();
  x.strokeStyle = "rgba(22,60,22,0.45)";
  x.lineWidth = 2.5;
  x.beginPath();
  x.moveTo(64, 10);
  x.lineTo(64, 150);
  x.stroke();
  x.lineWidth = 1;
  for (let i = 1; i < 7; i++) {
    const yy = 18 + i * 19;
    x.beginPath();
    x.moveTo(64, yy);
    x.lineTo(64 + (i % 2 ? 28 : -28), yy - 15);
    x.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Converts a grayscale height canvas into a tangent-space normal map so surface
// detail catches the moving light believably (real bark ridges, not a flat decal).
function heightToNormal(height: HTMLCanvasElement, strength = 2.2): HTMLCanvasElement {
  const w = height.width;
  const h = height.height;
  const src = height.getContext("2d")!.getImageData(0, 0, w, h).data;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const dst = out.getContext("2d")!.createImageData(w, h);
  const at = (xx: number, yy: number) => {
    const cx = (xx + w) % w;
    const cy = (yy + h) % h;
    return src[(cy * w + cx) * 4] / 255;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x - 1, y) - at(x + 1, y)) * strength;
      const dy = (at(x, y - 1) - at(x, y + 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      dst.data[i] = ((dx / len) * 0.5 + 0.5) * 255;
      dst.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      dst.data[i + 2] = (1 / len) * 255;
      dst.data[i + 3] = 255;
    }
  }
  out.getContext("2d")!.putImageData(dst, 0, 0);
  return out;
}

function makeBarkTexture(): { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } {
  const w = 512;
  const h = 1024;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d")!;
  // Base gradient so the bark isn't a flat brown fill.
  const bg = x.createLinearGradient(0, 0, w, 0);
  bg.addColorStop(0, "#4a3320");
  bg.addColorStop(0.5, "#63472e");
  bg.addColorStop(1, "#4f3924");
  x.fillStyle = bg;
  x.fillRect(0, 0, w, h);
  // Mottled patches for age and moss hints.
  for (let i = 0; i < 900; i++) {
    const r = 6 + Math.random() * 40;
    const g = Math.random() < 0.15;
    x.fillStyle = g
      ? `rgba(70,88,52,${0.03 + Math.random() * 0.05})`
      : `rgba(${30 + Math.random() * 40},${20 + Math.random() * 26},${12 + Math.random() * 16},${0.05 + Math.random() * 0.08})`;
    x.beginPath();
    x.arc(Math.random() * w, Math.random() * h, r, 0, Math.PI * 2);
    x.fill();
  }
  const hc = document.createElement("canvas");
  hc.width = w;
  hc.height = h;
  const hx = hc.getContext("2d")!;
  hx.fillStyle = "#808080";
  hx.fillRect(0, 0, w, h);
  // Long vertical furrows: paired dark (color) + height strokes.
  for (let i = 0; i < 520; i++) {
    const px = Math.random() * w;
    const py = Math.random() * h;
    const len = 80 + Math.random() * 420;
    const dark = Math.random() < 0.55;
    const a = 0.12 + Math.random() * 0.32;
    const lw = 1 + Math.random() * 5;
    const cx = (Math.random() - 0.5) * 12;
    x.strokeStyle = dark ? `rgba(28,18,10,${a})` : `rgba(132,100,66,${a})`;
    x.lineWidth = lw;
    x.beginPath();
    x.moveTo(px, py);
    x.bezierCurveTo(px + cx, py + len * 0.5, px + cx, py + len, px + cx * 0.6, py + len);
    x.stroke();
    hx.strokeStyle = dark ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`;
    hx.lineWidth = lw;
    hx.beginPath();
    hx.moveTo(px, py);
    hx.bezierCurveTo(px + cx, py + len * 0.5, px + cx, py + len, px + cx * 0.6, py + len);
    hx.stroke();
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1.5, 3);
  map.anisotropy = 8;
  const normal = new THREE.CanvasTexture(heightToNormal(hc, 2.6));
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
  normal.repeat.set(1.5, 3);
  return { map, normal };
}

function makeGrassTexture(): THREE.CanvasTexture {
  const s = 256;
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const x = c.getContext("2d")!;
  x.fillStyle = "#3f6f34";
  x.fillRect(0, 0, s, s);
  for (let i = 0; i < 6000; i++) {
    x.fillStyle = `rgba(${28 + Math.random() * 46},${78 + Math.random() * 70},${30 + Math.random() * 44},0.5)`;
    x.fillRect(Math.random() * s, Math.random() * s, 2, 2 + Math.random() * 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 24);
  return tex;
}

// A soft, tileable noise normal map so the ground plane catches light with a
// little organic unevenness instead of reading as glass-flat.
function makeGroundNormal(): THREE.CanvasTexture {
  const s = 256;
  const hc = document.createElement("canvas");
  hc.width = s;
  hc.height = s;
  const hx = hc.getContext("2d")!;
  hx.fillStyle = "#808080";
  hx.fillRect(0, 0, s, s);
  for (let i = 0; i < 2600; i++) {
    const g = 90 + Math.random() * 110;
    hx.fillStyle = `rgba(${g},${g},${g},0.5)`;
    hx.beginPath();
    hx.arc(Math.random() * s, Math.random() * s, 1 + Math.random() * 4, 0, Math.PI * 2);
    hx.fill();
  }
  const tex = new THREE.CanvasTexture(heightToNormal(hc, 1.6));
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 24);
  return tex;
}

// Load a real photographic (CC0) color texture from /public/assets and tile it.
// TextureLoader populates the image asynchronously but returns the object
// immediately, so we can configure wrapping/repeat now and it updates on load —
// no Suspense boundary needed, and it never blocks the scene from rendering.
function loadColorTexture(url: string, repeatX: number, repeatY: number): THREE.Texture {
  const t = new THREE.TextureLoader().load(url);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 8;
  return t;
}

// A soft, feathered puff texture for the drifting sky clouds. Built as an
// in-memory CanvasTexture so the clouds carry NO external/remote asset and never
// go through a Suspense-throwing loader. (drei's <Clouds> used useTexture, whose
// loader could hang in production and hide the entire scene — so we roll our own.)
function makeCloudTexture(): THREE.CanvasTexture {
  const s = 128;
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.5, "rgba(255,255,255,0.75)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, s, s);
  // Break up the perfect circle with a few softer lobes for a wispier edge.
  for (let i = 0; i < 30; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 20 + Math.random() * 34;
    const px = s / 2 + Math.cos(a) * (18 + Math.random() * 20);
    const py = s / 2 + Math.sin(a) * (18 + Math.random() * 20);
    const lg = x.createRadialGradient(px, py, 2, px, py, r);
    lg.addColorStop(0, `rgba(255,255,255,${0.12 + Math.random() * 0.12})`);
    lg.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = lg;
    x.beginPath();
    x.arc(px, py, r, 0, Math.PI * 2);
    x.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A soft round glow used as the sprite for the drifting lantern lights, so they
// read as warm points of light being held aloft rather than hard dust specks.
function makeGlowSprite(): THREE.CanvasTexture {
  const s = 64;
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,240,205,0.9)");
  g.addColorStop(0.6, "rgba(255,209,140,0.35)");
  g.addColorStop(1, "rgba(255,190,110,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A gentle band of clouds drifting high above the forest, rendered as a handful
// of soft camera-facing billboards. Kept far up so they never touch the tree, and
// slow-moving so the sky feels alive but calm. No texture loader is involved, so
// this can never block the scene from appearing.
const CLOUD_DEFS = [
  { x: -22, y: 24, z: -20, w: 30, h: 15, opacity: 0.5, speed: 0.5, tint: "#f4f6ff" },
  { x: 18, y: 27, z: -26, w: 26, h: 13, opacity: 0.45, speed: 0.36, tint: "#eef2ff" },
  { x: 6, y: 30, z: 24, w: 24, h: 12, opacity: 0.4, speed: 0.44, tint: "#ffffff" },
  { x: -14, y: 33, z: 12, w: 28, h: 14, opacity: 0.32, speed: 0.28, tint: "#f4f6ff" },
];

function SkyClouds() {
  const tex = useMemo(makeCloudTexture, []);
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame((state, delta) => {
    for (let i = 0; i < refs.current.length; i++) {
      const m = refs.current[i];
      if (!m) continue;
      // Drift slowly across the sky, wrapping around when off the far edge.
      m.position.x += CLOUD_DEFS[i].speed * delta;
      if (m.position.x > 44) m.position.x = -44;
      // Face the camera so the soft puff reads from any orbit angle.
      m.quaternion.copy(state.camera.quaternion);
    }
  });
  return (
    <group>
      {CLOUD_DEFS.map((c, i) => (
        <mesh key={i} ref={(el) => { refs.current[i] = el; }} position={[c.x, c.y, c.z]}>
          <planeGeometry args={[c.w, c.h]} />
          <meshBasicMaterial
            map={tex}
            color={c.tint}
            transparent
            opacity={c.opacity}
            depthWrite={false}
            fog={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function makeRadialShadow(): THREE.CanvasTexture {
  const s = 256;
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(128, 128, 8, 128, 128, 128);
  g.addColorStop(0, "rgba(0,0,0,0.5)");
  g.addColorStop(0.7, "rgba(0,0,0,0.22)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
}

/* ---------- Scene ---------- */

interface Props {
  graph: ForestGraph;
  selectedId: string | null;
  focusId: string | null;
  onSelect: (node: ForestNodeDTO | null) => void;
  memorial?: boolean;
  /** Navigate to a linked family member's own forest (their /family/[userId]). */
  onOpenFamily?: (userId: string) => void;
}

export default function ForestCanvas({ graph, selectedId, focusId, onSelect, memorial = false, onOpenFamily }: Props) {
  const layout = useMemo(() => computeLayout(graph), [graph]);
  // The tree's height is the master dimension of the whole composition — camera,
  // fog, shadows, the Legacy Plaza, the path, the stream and the surrounding
  // forest are all sized from it, so the tree always reads as the monument at
  // the centre of everything.
  const H = layout.trunkHeight;
  const atmo = memorial ? MEMORIAL_ATMOSPHERE : DAY_ATMOSPHERE;

  // --- Hero-tree island + moat geometry -----------------------------------
  // The hero tree sits on a raised island (the authored base disc) ringed by a
  // water moat, reached by the footbridge. All sizes derive from the trunk
  // height H so the composition scales with the tree. `islandR` is the land the
  // roots rest on; the moat is the ring from the island edge out to `moatOuter`.
  const islandR = Math.max(5, H * 0.42); // the land the roots rest on
  const moatWidth = Math.max(5, H * 0.24); // width of the water ring
  const moatOuter = islandR + moatWidth;
  const moatWallT = 0.6; // (retained for callers; the moat no longer walls)
  // The terrain is a flat plane at y=0, so a shallow spring sits just above
  // grade like the lake (which rides fine at 0.06). Low water keeps the pool
  // reading as a stream worn into the land, not a raised basin.
  const waterLevel = Math.max(0.14, H * 0.006);
  // Land the bridge's island end right ON the island rim (not out over the root
  // flare) and rest its far end on the outer bank.
  const bridgeInner = islandR - 0.4;
  const bridgeOuter = moatOuter + 1.6;
  const bridgeSpan = bridgeOuter - bridgeInner;
  const bridgeZ = (bridgeInner + bridgeOuter) / 2;

  const bark = useMemo(makeBarkTexture, []);
  const leafTex = useMemo(makeLeafTexture, []);
  const grass = useMemo(makeGrassTexture, []);
  const groundNormal = useMemo(makeGroundNormal, []);

  // Real photographic bark + ground color maps (CC0). The procedural normal
  // maps stay in play for surface relief; only the color map is swapped for the
  // photo, which is the change that reads as "real". Repeats match the
  // procedural normals so relief and color stay aligned.
  const barkColor = useMemo(() => loadColorTexture("/assets/bark_color.jpg", 1.5, 3), []);
  const groundColor = useMemo(() => loadColorTexture("/assets/ground_color.jpg", 14, 14), []);
  const barkTex = useMemo(() => ({ map: barkColor, normal: bark.normal }), [barkColor, bark.normal]);
  const shadowTex = useMemo(makeRadialShadow, []);

  // Crown size + fullness now come straight from the growth grammar (a function
  // of the life's memories and score), not a fixed per-stage table.
  const crown = { r: layout.crownRadius, count: layout.crownCount };
  // Seat the canopy ON the boughs (the forks reach up to ~1.03× the trunk
  // height), not floating in a cloud above them, so the crown reads as one
  // connected mass growing out of the structure.
  // The crown leans with the life's milestones (see layout.crownLean), so the
  // whole silhouette bends toward the direction a life's big turning-points
  // pushed it — always clamped so the tree still stands gracefully.
  const crownCenter = useMemo<Vec3>(
    () => [
      layout.crownLean[0] * layout.trunkHeight,
      layout.trunkHeight * 0.9,
      layout.crownLean[2] * layout.trunkHeight,
    ],
    [layout.trunkHeight, layout.crownLean],
  );

  // Foliage grows from the boughs, not the air: sample points along the outer
  // half of every branch and secondary bough, and the canopy clumps its leaves
  // around these. This is what makes leaves read as attached to the tree.
  const leafAnchors = useMemo<Vec3[]>(() => {
    const pts: Vec3[] = [];
    for (const l of layout.limbs) {
      if (l.kind !== "branch" && l.kind !== "sub") continue;
      const samples = l.kind === "branch" ? [0.5, 0.66, 0.8, 0.92, 1.0] : [0.6, 0.82, 1.0];
      for (const t of samples) {
        pts.push([
          l.from[0] + (l.to[0] - l.from[0]) * t,
          l.from[1] + (l.to[1] - l.from[1]) * t,
          l.from[2] + (l.to[2] - l.from[2]) * t,
        ]);
      }
    }
    return pts;
  }, [layout.limbs]);

  // ---- The living world around the tree, placed from real assets ----
  // Deterministic seeded placements for the surrounding forest, ground detail
  // and distant peaks. The Scatter components load the actual GLB models for
  // these; if a model isn't installed yet, its AssetBoundary simply omits it.
  // A thin treeline hugs the clearing just past the plaza — enough to close the
  // world without competing with the tree. It's pulled in tight and kept small
  // so the eye never wanders out to it.
  const backgroundTrees = useMemo<ScatterItem[]>(() => {
    const out: ScatterItem[] = [];
    for (let i = 0; i < 24; i++) {
      const a = hash01(`bt${i}`, 3) * Math.PI * 2;
      const r = H * 0.95 + hash01(`bt${i}`, 7) * H * 0.9; // ring just past the clearing
      const id = BACKGROUND_TREE_IDS[i % BACKGROUND_TREE_IDS.length];
      out.push({
        url: MODELS[id].url,
        position: [Math.cos(a) * r, -0.2, Math.sin(a) * r],
        rotationY: hash01(`bt${i}`, 11) * Math.PI * 2,
        scale: 1.0 + hash01(`bt${i}`, 5) * 1.6,
      });
    }
    return out;
  }, [H]);

  // Moss, ferns, flowers and soft grass — ONLY within the first ~40 ft of the
  // trunk (the plaza garden). Random rocks are all but gone (just a couple of
  // accents); everything else is living groundcover so the base of the monument
  // reads as tended and alive.
  const groundDetail = useMemo<ScatterItem[]>(() => {
    const out: ScatterItem[] = [];
    // Plants only, biased to ferns/grass/flowers; rocks handled separately below.
    const PLANT_IDS = ["fern", "grass_clump", "flower_a", "flower_b", "grass_clump", "fern"] as const;
    const gardenR = Math.min(H * 0.75, 14); // ~first 40 ft around the trunk
    for (let i = 0; i < 90; i++) {
      const a = hash01(`gd${i}`, 3) * Math.PI * 2;
      // cluster toward the plaza edge, thinning outward
      const r = 2.2 + Math.pow(hash01(`gd${i}`, 7), 0.7) * gardenR;
      const id = PLANT_IDS[i % PLANT_IDS.length];
      out.push({
        url: MODELS[id].url,
        position: [Math.cos(a) * r, 0, Math.sin(a) * r],
        rotationY: hash01(`gd${i}`, 11) * Math.PI * 2,
        scale: 0.45 + hash01(`gd${i}`, 5) * 0.9,
      });
    }
    // Just two natural stone accents nestled in the garden — no rock field.
    for (let i = 0; i < 2; i++) {
      const a = 1.1 + i * 2.4;
      const r = gardenR * 0.7;
      out.push({
        url: MODELS[i === 0 ? "rock_a" : "rock_b"].url,
        position: [Math.cos(a) * r, 0, Math.sin(a) * r],
        rotationY: hash01(`rk${i}`, 11) * Math.PI * 2,
        scale: 0.8 + hash01(`rk${i}`, 5) * 0.6,
      });
    }
    return out;
  }, [H]);

  // Mountains are pushed far into the distance and scaled up, so they read as a
  // hazy massif on the horizon through the fog rather than nearby hills.
  const mountains = useMemo<ScatterItem[]>(() => {
    const out: ScatterItem[] = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + hash01(`mt${i}`, 3) * 0.5;
      const r = H * 4.0 + hash01(`mt${i}`, 7) * H * 0.8;
      out.push({
        url: MODELS.mountain.url,
        position: [Math.cos(a) * r, -3, Math.sin(a) * r],
        rotationY: hash01(`mt${i}`, 11) * Math.PI * 2,
        scale: (14 + hash01(`mt${i}`, 5) * 16) * 1.6,
      });
    }
    return out;
  }, [H]);

  // Category lanterns: ONE lantern hangs from each of the tree's main branches,
  // and each lantern IS a category. Every memory in that category lives inside
  // its lantern — clicking the lantern selects the category. They're placed at
  // the branch tips (the BRANCH nodes in the layout), sized large so they read
  // as the tree's chapter-markers, labeled with the category name, and colored
  // in that category's language. This replaces the old per-memory lanterns and
  // the floating memory glyphs/threads.
  const categoryLanterns = useMemo(() => {
    const branches = layout.positioned.filter((p) => p.node.kind === "BRANCH");
    const N = Math.max(1, branches.length);
    // The hero tree is one broad canopy mesh: measured from hero_tree.glb, its
    // half-width is ~0.83× its height and it spans the full trunk height H, with
    // the widest foliage around mid-height. So we anchor each cord's TOP INSIDE
    // that real canopy (not the generative crown, which is a different size —
    // that mismatch is what left the cords floating in empty air). The attach
    // point sits just inside the outer foliage at its broadest band; the lantern
    // then hangs straight down on its cord and emerges below the leaves.
    const H = layout.trunkHeight;
    const attachR = H * 0.6; // inside the ~0.83·H outer canopy, near its edge
    const attachY = H * 0.62; // in the broad foliage band, up under the leaves
    const size = Math.max(1.1, H * 0.12); // lantern scaled to the tree
    return branches.map((p, i) => {
      const key = `catlantern${p.node.id}`;
      // Ring the categories evenly ALL THE WAY AROUND the tree, first one facing
      // the camera (+Z) so the front reads immediately.
      const angle = (i / N) * Math.PI * 2 + Math.PI / 2;
      const jitter = (hash01(key, 3) - 0.5) * 0.18; // break perfect symmetry
      const a = angle + jitter;
      const R = attachR * (0.94 + hash01(key, 7) * 0.12);
      const y = attachY + (hash01(key, 5) - 0.5) * H * 0.1;
      const tip: Vec3 = [Math.cos(a) * R, y, Math.sin(a) * R];
      // Short, staggered cords — every lantern hangs just below its branch at a
      // slightly DIFFERENT length, so they read as strung individually through
      // the canopy (never long enough to dip toward the water).
      const drop = H * (0.05 + hash01(key, 17) * 0.06);
      return {
        node: p.node,
        position: tip,
        title: p.node.title,
        color: CATEGORY_COLORS[p.node.title] ?? "#ffd9a0",
        phase: hash01(key, 13) * Math.PI * 2,
        drop,
        size,
        light: H * 0.4, // point-light radius, kept in world units
      };
    });
  }, [layout.positioned, layout.trunkHeight]);

  // Family lanterns: every PERSON in the family tree also hangs as a lantern on
  // the hero tree — one lantern per relative. They ring an INNER band (closer to
  // the trunk, and a touch lower) than the category lanterns so the two rings
  // read as distinct, and they carry a cool moonlight tint so people read
  // differently from the warm category "chapter" lanterns. Clicking one opens
  // that person: if their account is linked we sail into THEIR forest; if not,
  // their info panel + invite link opens (handled at the click site).
  const familyLanterns = useMemo(() => {
    const people = layout.positioned.filter((p) => p.node.kind === "PERSON");
    const N = Math.max(1, people.length);
    const H = layout.trunkHeight;
    const attachR = H * 0.42; // inner band, closer to the trunk than categories
    const attachY = H * 0.5; // a touch lower in the canopy
    const size = Math.max(0.95, H * 0.1); // slightly smaller than categories
    return people.map((p, i) => {
      const key = `famlantern${p.node.id}`;
      // Offset the family ring half a step so a person never sits directly under
      // a category lantern.
      const angle = (i / N) * Math.PI * 2 + Math.PI / 2 + Math.PI / N;
      const jitter = (hash01(key, 3) - 0.5) * 0.22;
      const a = angle + jitter;
      const R = attachR * (0.9 + hash01(key, 7) * 0.16);
      const y = attachY + (hash01(key, 5) - 0.5) * H * 0.1;
      const tip: Vec3 = [Math.cos(a) * R, y, Math.sin(a) * R];
      const drop = H * (0.05 + hash01(key, 17) * 0.06); // short, staggered too
      return {
        node: p.node,
        position: tip,
        title: p.node.title,
        color: "#cfe4ff", // moonlight tint — family reads as people
        phase: hash01(key, 13) * Math.PI * 2,
        drop,
        size,
        light: H * 0.34,
        linkedUserId: p.node.linkedUserId ?? null,
      };
    });
  }, [layout.positioned, layout.trunkHeight]);

  // Flower positions in the garden — butterflies keep close to these instead of
  // wandering the whole clearing.
  const flowerAnchors = useMemo<Vec3[]>(
    () =>
      groundDetail
        .filter((it) => it.url.includes("flower"))
        .map((it) => [it.position[0], 0, it.position[2]] as Vec3),
    [groundDetail],
  );

  // Branch tips birds can land on — the outer end of every real branch, so a
  // bird occasionally peels out of the sky and settles in the canopy.
  const perches = useMemo<Vec3[]>(
    () => layout.limbs.filter((l) => l.kind === "branch").map((l) => l.to),
    [layout.limbs],
  );

  const focusPos = useMemo<Vec3 | null>(() => {
    if (!focusId) return null;
    const p = layout.positioned.find((n) => n.node.id === focusId);
    return p ? p.position : null;
  }, [focusId, layout]);

  // Map each memory node to the color of the branch it hangs from, so leaves,
  // memory glyphs and constellation stars all speak their category's language.
  const categoryColorByNodeId = useMemo(() => {
    const branchTitle = new Map<string, string>();
    for (const n of graph.nodes) if (n.kind === "BRANCH") branchTitle.set(n.id, n.title);
    const m = new Map<string, string>();
    for (const p of layout.positioned) {
      const title = p.parentId ? branchTitle.get(p.parentId) : undefined;
      if (title && CATEGORY_COLORS[title]) m.set(p.node.id, CATEGORY_COLORS[title]);
    }
    return m;
  }, [graph, layout]);

  // The loaded hero-tree GLB object, in world space. Lanterns raycast against it
  // so their cords attach to the actual canopy/branch surface (the tree is one
  // opaque mesh — there's no separate branch geometry to parent to).
  const heroRef = useRef<THREE.Object3D | null>(null);

  // Shared state the day-cycle writes and the constellations read (0 day → 1 night).
  const nightRef = useRef(memorial ? 0.6 : 0);
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const dirRef = useRef<THREE.DirectionalLight>(null);
  const skyRef = useRef<React.ElementRef<typeof Sky>>(null);

  // The tree is the monument: every framing dimension is derived from its
  // height H so it always fills roughly 70% of the opening viewport, whatever
  // the life's size. The camera sits close and low so you look UP at it.
  const isPortrait = typeof window !== "undefined" && window.innerHeight >= window.innerWidth;
  // Phones / touch devices get a lighter render budget: this scene (shadows,
  // bloom, thousands of instanced blades + particles) overwhelms mobile GPUs and
  // tanks the frame rate. lowPower trims the most expensive knobs.
  const lowPower =
    typeof window !== "undefined" &&
    (isPortrait ||
      window.matchMedia?.("(pointer: coarse)").matches ||
      Math.min(window.innerWidth, window.innerHeight) < 820);
  const camInit = isPortrait
    ? { position: [H * 0.16, H * 0.54, H * 1.5] as Vec3, fov: 52 }
    : { position: [H * 0.5, H * 0.46, H * 1.9] as Vec3, fov: 48 };

  return (
    <Canvas
      shadows
      dpr={lowPower ? [1, 1.5] : [1, 2]}
      performance={{ min: 0.5 }}
      camera={camInit}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.94 }}
      onPointerMissed={() => onSelect(null)}
    >
      <color attach="background" args={[atmo.background]} />
      <Sky ref={skyRef} distance={450000} sunPosition={atmo.sun} turbidity={atmo.sky.turbidity} rayleigh={atmo.sky.rayleigh} mieCoefficient={atmo.sky.mieCoefficient} mieDirectionalG={atmo.sky.mieDirectionalG} />
      {/* Fog pushed WAY out past the mountains (which sit at ~H*4–4.8) so the
          whole background — tree, hills, horizon — reads crisp and clear. Only
          the extreme far distance gets the faintest atmospheric fade into the
          sky; no more haze hanging behind the tree. */}
      <fog attach="fog" args={[atmo.fog.color, H * 5.5, H * 16]} />

      <ambientLight ref={ambientRef} intensity={atmo.ambient} />
      <hemisphereLight ref={hemiRef} args={[atmo.hemi.sky, atmo.hemi.ground, atmo.hemi.intensity]} />
      <directionalLight
        ref={dirRef}
        position={atmo.sun}
        intensity={atmo.dir.intensity}
        color={atmo.dir.color}
        castShadow
        shadow-mapSize={lowPower ? [1024, 1024] : [2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-near={1}
        shadow-camera-far={H * 5}
        shadow-camera-left={-H * 1.4}
        shadow-camera-right={H * 1.4}
        shadow-camera-top={H * 1.7}
        shadow-camera-bottom={-H * 0.4}
      />
      {/* Strong warm rim light from low behind the tree: the golden-hour sun
          rakes through the canopy and lights the silhouette from the back,
          just like the concept. No shadow — purely cinematic separation. */}
      <directionalLight position={[-14, 4, -16]} intensity={0.8} color="#ffb85e" />
      {/* Low sun-glow point tucked behind the trunk fork so light appears to
          burst through the split of the tree toward the viewer. */}
      <pointLight position={[0, 2.4, -3]} intensity={1.0} distance={22} decay={1.6} color="#ffc873" />

      {/* The day-cycle drives all of the above; memorial forests hold at dusk. */}
      <SceneClock
        enabled={!memorial}
        nightRef={nightRef}
        ambientRef={ambientRef}
        hemiRef={hemiRef}
        dirRef={dirRef}
        skyRef={skyRef}
        fogNear={H * 5.5}
        fogFar={H * 16}
        worldH={H}
      />

      {/* Memories rise into the night sky as a constellation you can read. */}
      <Constellation
        graph={graph}
        categoryColorByNodeId={categoryColorByNodeId}
        nightRef={nightRef}
        onSelect={onSelect}
      />

      {/* Image-based lighting: soft sky fill + a warm key + a ground bounce,
          built entirely in-scene (no external HDRI files). Gives leaves, fruit
          and bark realistic soft highlights and gentle reflections. */}
      <Environment resolution={512} frames={1}>
        {/* Cool sky dome fill — soft ambient bounce from above. */}
        <Lightformer intensity={0.6} color="#dbe8ff" position={[0, 10, 0]} scale={[16, 16, 1]} form="ring" />
        {/* Warm golden-hour key, low and to the side, the way a late sun rakes in. */}
        <Lightformer intensity={1.35} color="#ffe1ad" position={[-7, 4.5, -6]} scale={[8, 8, 1]} />
        {/* Low golden rim from behind for reflective separation on wet stone + water. */}
        <Lightformer intensity={0.8} color="#ffb765" position={[6, 2.2, -8]} scale={[7, 4, 1]} />
        {/* Earthy ground bounce so undersides pick up warm reflected light. */}
        <Lightformer intensity={0.4} color="#4a5a34" position={[0, -6, 0]} scale={[18, 18, 1]} rotation={[Math.PI / 2, 0, 0]} />
      </Environment>

      {/* Image-based lighting from a real HDRI — the biggest lever on a
          photoreal look. Falls back to the in-scene light rig above if the
          .hdr isn't installed yet. */}
      <AssetBoundary label="HDRI environment">
        <HdriEnvironment hdriId="golden_hour" />
      </AssetBoundary>

      {/* The living world, all from production assets. Each is independently
          boundaried, so any not-yet-installed asset is simply omitted (never a
          placeholder primitive). */}
      <AssetBoundary label="terrain">
        <Terrain />
      </AssetBoundary>
      <AssetBoundary label="distant mountains">
        <Scatter items={mountains} />
      </AssetBoundary>
      <AssetBoundary label="surrounding forest">
        <Scatter items={backgroundTrees} />
      </AssetBoundary>
      <AssetBoundary label="ground detail">
        <Scatter items={groundDetail} />
      </AssetBoundary>
      <AssetBoundary label="lake">
        <Water />
      </AssetBoundary>
      {/* Category lanterns — one per main branch. Each IS a category; every
          memory in it lives inside the lantern. Click to open the category. */}
      <AssetBoundary label="category lanterns">
        {categoryLanterns.map((c) => (
          <CategoryLantern
            key={c.node.id}
            node={c.node}
            position={c.position}
            title={c.title}
            color={c.color}
            phase={c.phase}
            drop={c.drop}
            size={c.size}
            light={c.light}
            selected={c.node.id === selectedId}
            nightRef={nightRef}
            onSelect={onSelect}
            heroRef={heroRef}
            reach={layout.trunkHeight}
          />
        ))}
      </AssetBoundary>

      {/* Family lanterns — one per relative in the family tree, hung on an inner
          band of the same canopy. Click one to open that person: a linked
          account sails into their own forest; an unlinked person opens their
          info panel + invite link. */}
      <AssetBoundary label="family lanterns">
        {familyLanterns.map((c) => (
          <CategoryLantern
            key={c.node.id}
            node={c.node}
            position={c.position}
            title={c.title}
            color={c.color}
            phase={c.phase}
            drop={c.drop}
            size={c.size}
            light={c.light}
            selected={c.node.id === selectedId}
            nightRef={nightRef}
            onSelect={onSelect}
            heroRef={heroRef}
            reach={layout.trunkHeight}
            linkedUserId={c.linkedUserId}
            onOpenFamily={onOpenFamily}
          />
        ))}
      </AssetBoundary>

      {/* Living flocks: birds wheeling overhead, butterflies over the flowers. */}
      <AssetBoundary label="birds">
        <Birds count={lowPower ? 4 : 7} perches={perches} />
      </AssetBoundary>
      <AssetBoundary label="butterflies">
        <Butterflies count={lowPower ? 7 : 14} anchors={flowerAnchors} />
      </AssetBoundary>

      <SkyClouds />
      <Ground />

      {/* --- The monument's architecture, composed AROUND the trunk --- */}
      {/* GENERATIVE tree: a circular stone Legacy Plaza the trunk rises out of,
          a straight crossing stream, and a footbridge over it.
          HERO tree: the flat stone court reads as dead grey ground, so instead
          the island is ringed by a WATER MOAT (below) and the plaza is dropped. */}
      {!USE_HERO_TREE ? (
        <>
          <AssetBoundary label="legacy plaza">
            <LegacyPlaza radius={Math.max(3.2, H * 0.28)} />
          </AssetBoundary>
          <Stream center={[0, 0.05, H * 0.85]} length={Math.max(14, H * 1.8)} width={2.2} angle={0} />
          <WoodenBridge position={[0, 0, H * 0.85]} rotationY={Math.PI / 2} span={4.2} width={1.8} />
        </>
      ) : (
        <>
          {/* The moat: a ring of water encircling the island so the tree reads
              as a sacred island. Runs from the island edge out to moatOuter. */}
          <AssetBoundary label="moat">
            <Moat innerRadius={islandR} outerRadius={moatOuter} waterLevel={waterLevel} />
          </AssetBoundary>
          {/* One footbridge spanning the moat from the outer bank to the island,
              on the +Z (camera-facing) side where the path arrives. Raised to the
              waterline so it crosses OVER the basin, not through it. */}
          <WoodenBridge position={[0, 0, bridgeZ]} rotationY={Math.PI / 2} span={bridgeSpan} width={2.2} />
        </>
      )}
      {/* A winding stone path approaches from the treeline and draws the eye in
          toward the trunk / the moat's outer bank. */}
      <StonePath start={[0, H * 1.5]} plazaRadius={USE_HERO_TREE ? moatOuter : Math.max(3.2, H * 0.28)} />
      {/* Fireflies wake at dusk and drift low over the garden around the base. */}
      <Fireflies count={lowPower ? 22 : 48} radius={Math.min(H * 0.75, 14)} nightRef={nightRef} />

      {/* Generational rings ripple outward beneath the floor — one per
          generation of family/heritage — so the roots read as part of a whole
          lineage. */}
      <GenRings rings={layout.genRings} nightRef={nightRef} />
      {/* The canopy ground-shadow disc is sized/placed to the GENERATIVE crown.
          With the hero mesh it no longer matches the real footprint (it read as
          a stray circle at the tree), so it's only drawn for the generative tree. */}
      {!USE_HERO_TREE && crown.r > 0 ? <CanopyShadow tex={shadowTex} center={crownCenter} radius={crown.r} /> : null}
      <Motes trunkHeight={layout.trunkHeight} color={atmo.motes.color} opacity={atmo.motes.opacity} nightRef={nightRef} />

      {/* The authored HeroBase platform was removed: it read as a grey square
          plate under the tree (and its lip looked like a second bridge the tree
          sat on). The tree now rises straight out of the terrain inside the moat
          ring, so nothing grey shows and there's no phantom bridge. */}

      {/* THE HERO TREE — the one authored/imported central tree. Planted at the
          origin, scaled to the master trunk height H so it drives the whole
          composition exactly as the generative tree did. veinGlow=0 leaves it
          lit naturally by the scene; drive it 0..1 (e.g. from the opening
          camera's beat-4 ignition) to surge the memory-veins. */}
      {USE_HERO_TREE ? (
        <HeroTree scale={H} veinGlow={0} veinBoost={1.7} objectRef={heroRef} />
      ) : (
        <>
          {/* Woody structure: a thick base to the fork height, then the two great
              forks and every branch continue as tapered tubes. */}
          <Trunk
            height={layout.forkHeight}
            rBottom={layout.trunkRadiusBottom}
            rTop={layout.trunkRadiusTop}
            bark={barkTex}
          />
          {layout.forkHeight > 0 ? (
            <LivingTrunk
              forkHeight={layout.forkHeight}
              forks={layout.forks}
              baseRadius={layout.trunkRadiusBottom}
              topRadius={layout.trunkRadiusTop}
              nightRef={nightRef}
            />
          ) : null}
          {layout.limbs
            .filter((l) => l.kind !== "twig")
            .map((limb, i) => (
              <Branch key={i} limb={limb} girthScale={layout.girthScale} bark={barkTex} />
            ))}

          {/* Healed scars climb the trunk — one per hardship the life carried
              through, each glowing faintly gold: wounds that became wisdom. */}
          <Scars scars={layout.scars} nightRef={nightRef} />
        </>
      )}

      {/* Decorative full canopy — only for the generative tree. The hero mesh
          ships its own foliage, so we skip the leaf-card cloud when it's on. */}
      {!USE_HERO_TREE && crown.count > 0 ? (
        <Canopy center={crownCenter} radius={crown.r} count={crown.count} leafTex={leafTex} anchors={leafAnchors} />
      ) : null}

      {/* Volumetric sunlight raking down through the canopy toward the plaza.
          The shafts are flat additive billboard planes sized/placed to the
          GENERATIVE crown (spread ~height*0.7 wide at height*0.55). Against the
          hero mesh they no longer track the real canopy and read as pale flat
          sheets jutting out of the tree's sides — so, like the other crown
          decorations, they're only drawn for the generative tree. */}
      {!USE_HERO_TREE && crown.r > 0 ? (
        <GodRays center={crownCenter} height={H} sun={atmo.sun} nightRef={nightRef} />
      ) : null}

      {/* Golden twinkling memory-lights scattered through the crown. Distributed
          as a SPHERE around the generative crown centre; against the hero mesh
          that sphere read as a glowing orb floating mid-tree, so it's gated to
          the generative tree until it can be re-anchored to the real canopy. */}
      {!USE_HERO_TREE && crown.r > 0 ? (
        <CanopySparkles
          center={crownCenter}
          radius={crown.r}
          count={Math.min(Math.round(crown.count * 0.22), 360)}
          nightRef={nightRef}
        />
      ) : null}

      {/* The floating memory glyphs and the threads between them were removed:
          against the hero mesh they hung in empty space around the canopy. Every
          memory now lives inside its category lantern instead. Family PEOPLE now
          hang as their own lanterns on the tree (see family lanterns above), so
          only the heritage ROOT nodes remain underground, surfacing as the
          camera dips below the earth. */}
      {layout.positioned
        .filter((p) => p.node.kind === "ROOT")
        .map((p) => (
          <NodeGlyph
            key={p.node.id}
            positioned={p}
            selected={p.node.id === selectedId}
            justGrew={p.node.id === focusId}
            leafTex={leafTex}
            overrideColor={categoryColorByNodeId.get(p.node.id)}
            onSelect={onSelect}
          />
        ))}

      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.55}
        zoomSpeed={0.8}
        autoRotate={!focusPos}
        autoRotateSpeed={0.28}
        minDistance={H * 0.6}
        maxDistance={H * 6}
        minPolarAngle={0.25}
        maxPolarAngle={Math.PI / 1.3}
        target={[0, H * 0.5, 0]}
      />
      <CameraRig focusPos={focusPos} />
      {/* A subtle handheld "breath" on the idle camera: a very slow FOV swell
          layered over the auto-orbit so the framing feels alive, never static.
          Suspended while focusing a memory so the push-in stays crisp. */}
      <IdleBreath idle={!focusPos} />

      {/* Cinematic pass: bloom lifts the glowing memories, stars and low sun;
          SMAA cleans edges; a soft vignette focuses the eye on the tree. */}
      {lowPower ? (
        // Mobile: bloom's mipmap blur is the single biggest GPU cost here, so we
        // drop it and keep only the cheap vignette. Antialiasing is handled by
        // the WebGL context instead of an SMAA pass.
        <EffectComposer multisampling={0} enableNormalPass={false}>
          <Vignette offset={0.28} darkness={0.62} eskil={false} />
        </EffectComposer>
      ) : (
        <EffectComposer multisampling={0} enableNormalPass={false}>
          <Bloom mipmapBlur luminanceThreshold={0.9} luminanceSmoothing={0.28} intensity={0.32} radius={0.6} />
          <SMAA />
          <Vignette offset={0.28} darkness={0.62} eskil={false} />
        </EffectComposer>
      )}
    </Canvas>
  );
}

// Cinematic idle breathing. Layers a slow, low-amplitude FOV swell (two
// detuned sines so it never feels like a loop) onto whatever the camera is
// doing. It only ever nudges the projection — it never touches camera position
// or the OrbitControls target — so every manual orbit/zoom interaction is
// preserved exactly, and the hero tree stays dominant in frame.
function IdleBreath({ idle }: { idle: boolean }) {
  const { camera } = useThree();
  const baseFov = useRef<number | null>(null);
  useFrame((state) => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    if (baseFov.current === null) baseFov.current = camera.fov;
    const t = state.clock.elapsedTime;
    // Ease the breath in only while idle; hold the true base FOV when focusing.
    const breath = idle ? Math.sin(t * 0.5) * 0.6 + Math.sin(t * 0.83 + 1.7) * 0.3 : 0;
    const target = baseFov.current + breath;
    if (Math.abs(camera.fov - target) > 0.002) {
      camera.fov += (target - camera.fov) * 0.06;
      camera.updateProjectionMatrix();
    }
  });
  return null;
}

function CameraRig({ focusPos }: { focusPos: Vec3 | null }) {
  const tmpTarget = useRef(new THREE.Vector3());
  const tmpCam = useRef(new THREE.Vector3());
  useFrame((state, delta) => {
    const controls = state.controls as unknown as { target: THREE.Vector3; update: () => void } | null;
    if (!controls || !focusPos) return;
    const k = 1 - Math.pow(0.0016, delta);
    tmpTarget.current.set(focusPos[0], focusPos[1], focusPos[2]);
    controls.target.lerp(tmpTarget.current, k);
    tmpCam.current.set(focusPos[0] + 2.6, focusPos[1] + 1.6, focusPos[2] + 3.4);
    state.camera.position.lerp(tmpCam.current, k * 0.5);
    controls.update();
  });
  return null;
}

/* ---------- Memory threads ---------- */

// Draws faint glowing arcs for the semantic edges of the graph (a memory
// MENTIONS a person, memories RELATED_TO each other). Threads stay subtle so
// the tree never turns into a cat's cradle; selecting either endpoint lights
// its threads up and gives them a slow pulse.
function MemoryThreads({
  graph,
  layout,
  selectedId,
}: {
  graph: ForestGraph;
  layout: ForestLayout;
  selectedId: string | null;
}) {
  const threads = useMemo(() => {
    const pos = new Map<string, Vec3>();
    for (const p of layout.positioned) pos.set(p.node.id, p.position);
    const out: { id: string; a: Vec3; b: Vec3; from: string; to: string; kind: string }[] = [];
    for (const e of graph.edges) {
      if (e.kind !== "MENTIONS" && e.kind !== "RELATED_TO" && e.kind !== "FAMILY") continue;
      const a = pos.get(e.fromNodeId);
      const b = pos.get(e.toNodeId);
      if (!a || !b) continue;
      out.push({ id: e.id, a, b, from: e.fromNodeId, to: e.toNodeId, kind: e.kind });
    }
    return out;
  }, [graph, layout]);

  if (!threads.length) return null;

  return (
    <>
      {threads.map((t) => (
        <Thread
          key={t.id}
          a={t.a}
          b={t.b}
          kind={t.kind}
          active={selectedId === t.from || selectedId === t.to}
          dimmed={!!selectedId}
        />
      ))}
    </>
  );
}

// Family/root threads glow living-green; memory mentions glow warm gold.
const THREAD_COLORS: Record<string, { base: string; active: string }> = {
  FAMILY: { base: "#7fd6b4", active: "#c4f5e0" },
  MENTIONS: { base: "#e8c98d", active: "#ffe6a8" },
  RELATED_TO: { base: "#e8c98d", active: "#ffe6a8" },
};

function Thread({
  a,
  b,
  kind,
  active,
  dimmed,
}: {
  a: Vec3;
  b: Vec3;
  kind: string;
  active: boolean;
  dimmed: boolean;
}) {
  const matRef = useRef<THREE.MeshBasicMaterial>(null);

  const geometry = useMemo(() => {
    const start = new THREE.Vector3(a[0], a[1], a[2]);
    const end = new THREE.Vector3(b[0], b[1], b[2]);
    const dist = start.distanceTo(end);
    const mid = start.clone().add(end).multiplyScalar(0.5);
    // Underground threads sag downward like roots; above-ground ones bow up
    // like a light bridge. Decide by where the thread mostly lives.
    if (mid.y < 0.3) mid.y -= 0.2 + dist * 0.14;
    else mid.y += 0.25 + dist * 0.18;
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    return new THREE.TubeGeometry(curve, 32, 0.013, 6, false);
  }, [a, b]);

  useLayoutEffect(() => {
    return () => geometry.dispose();
  }, [geometry]);

  useFrame((state) => {
    if (!matRef.current) return;
    const base = active ? 0.7 : dimmed ? 0.08 : 0.26;
    const pulse = active ? 0.22 * (0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 3)) : 0;
    matRef.current.opacity = base + pulse;
  });

  const palette = THREAD_COLORS[kind] ?? THREAD_COLORS.MENTIONS;

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial
        ref={matRef}
        color={active ? palette.active : palette.base}
        transparent
        opacity={0.26}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

/* ---------- Canopy ---------- */

function Canopy({
  center,
  radius,
  count,
  leafTex,
  anchors,
}: {
  center: Vec3;
  radius: number;
  count: number;
  leafTex: THREE.CanvasTexture;
  /** Points along the real boughs where foliage grows. When present, leaves
   *  cluster on these instead of floating in a sphere. */
  anchors?: Vec3[];
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const shaderRef = useRef<{ uniforms: { uTime: { value: number } } } | null>(null);

  // Lumpy crown fallback: a handful of sub-cluster centers so the silhouette
  // isn't a perfect ball (only used when there are no bough anchors).
  const clusters = useMemo(() => {
    const out: Vec3[] = [];
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + hash01(`c${i}`, 2) * 1.2;
      const rr = radius * (0.35 + hash01(`c${i}`, 5) * 0.4);
      out.push([Math.cos(a) * rr, (hash01(`c${i}`, 9) - 0.35) * radius * 0.5, Math.sin(a) * rr]);
    }
    return out;
  }, [radius]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const useAnchors = !!anchors && anchors.length > 0;
    // Tight foliage clumps that hug the boughs, scaled to the tree's size.
    const clumpR = THREE.MathUtils.clamp(radius * 0.16, 0.35, 1.1);
    for (let i = 0; i < count; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * Math.PI * 2;
      const phi = Math.acos(2 * v - 1);
      let px: number;
      let py: number;
      let pz: number;
      if (useAnchors) {
        // Anchor each leaf to a point on a real bough, then scatter it a little
        // around that point — so foliage grows FROM the branch, never floats.
        const a = anchors![Math.floor(Math.random() * anchors!.length)];
        const rr = clumpR * (0.3 + Math.random() * 0.9);
        px = a[0] + Math.sin(phi) * Math.cos(theta) * rr;
        py = a[1] + Math.cos(phi) * rr * 0.8 - rr * 0.15; // gentle downward droop
        pz = a[2] + Math.sin(phi) * Math.sin(theta) * rr;
      } else {
        const c = clusters[i % clusters.length];
        const rr = radius * (0.4 + Math.random() * 0.55);
        px = center[0] + c[0] + Math.sin(phi) * Math.cos(theta) * rr;
        py = center[1] + c[1] + Math.cos(phi) * rr * 0.6;
        pz = center[2] + c[2] + Math.sin(phi) * Math.sin(theta) * rr;
      }
      dummy.position.set(px, py, pz);
      dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      dummy.scale.setScalar(0.24 + Math.random() * 0.2);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      // Inner leaves darker (fake ambient occlusion), outer brighter.
      const depth = Math.hypot(px - center[0], py - center[1], pz - center[2]) / (radius * 1.4);
      const l = THREE.MathUtils.clamp(0.16 + depth * 0.28 + (Math.random() - 0.5) * 0.08, 0.1, 0.5);
      color.setHSL(0.27 + (Math.random() - 0.5) * 0.05, 0.5, l);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [count, radius, center, clusters, anchors]);

  useLayoutEffect(() => {
    const mat = matRef.current;
    if (!mat) return;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.vertexShader =
        "uniform float uTime;\n" +
        shader.vertexShader.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
           #ifdef USE_INSTANCING
           float ph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 0.9;
           transformed.x += sin(uTime * 1.4 + ph) * 0.06;
           transformed.z += cos(uTime * 1.1 + ph) * 0.05;
           transformed.y += sin(uTime * 0.8 + ph) * 0.025;
           #endif`,
        );
      // Subsurface scattering: leaves glow warm-green where light rakes through
      // them at grazing/back-lit angles (a cheap fresnel term added to the
      // emissive), so the canopy shimmers and reads as translucent as the camera
      // orbits and the light moves — not flat cardboard.
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
         float sss = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 3.0);
         totalEmissiveRadiance += vec3(0.30, 0.52, 0.18) * sss * 0.6;`,
      );
      shaderRef.current = shader as unknown as { uniforms: { uTime: { value: number } } };
    };
    mat.needsUpdate = true;
  }, []);

  useFrame((state) => {
    if (shaderRef.current) shaderRef.current.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false} receiveShadow>
      <planeGeometry args={[1, 1.3]} />
      <meshStandardMaterial ref={matRef} map={leafTex} alphaTest={0.5} side={THREE.DoubleSide} roughness={0.85} metalness={0} />
    </instancedMesh>
  );
}

/* ---------- Woody parts ---------- */

// Radius + tip taper + bow direction per limb kind. Forks are near-trunk thick;
// flares are the mossy buttress roots; branches and twigs get thinner.
const LIMB_STYLE: Record<Limb["kind"], { rBase: number; rTip: number; bow: number }> = {
  fork: { rBase: 0.19, rTip: 0.1, bow: 0.18 },
  branch: { rBase: 0.1, rTip: 0.028, bow: 0.32 },
  sub: { rBase: 0.052, rTip: 0.016, bow: 0.42 },
  twig: { rBase: 0.05, rTip: 0.015, bow: 0.32 },
  flare: { rBase: 0.17, rTip: 0.04, bow: -0.55 },
  root: { rBase: 0.09, rTip: 0.026, bow: -0.28 },
};

function Branch({
  limb,
  girthScale = 1,
  bark,
}: {
  limb: Limb;
  girthScale?: number;
  bark: { map: THREE.Texture; normal: THREE.Texture };
}) {
  const style = LIMB_STYLE[limb.kind];
  const groupRef = useRef<THREE.Group>(null);
  // Geometry is built RELATIVE to the branch base (limb.from) so the group can
  // pivot at that base — that's what lets the wind rock each branch about where
  // it joins the tree, instead of shearing it about the world origin.
  const { geometry, sway, phase } = useMemo(() => {
    const a = new THREE.Vector3(0, 0, 0);
    const b = new THREE.Vector3(
      limb.to[0] - limb.from[0],
      limb.to[1] - limb.from[1],
      limb.to[2] - limb.from[2],
    );
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const len = a.distanceTo(b);
    mid.y += len * style.bow;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    // Every limb scales with the trunk's girth so branches stay in proportion at
    // any tree size — fine twigs on a sapling, massive boughs on an ancient tree.
    const rBase = style.rBase * girthScale;
    const rTip = style.rTip * girthScale;
    const geo = new THREE.TubeGeometry(curve, 16, rBase, 8, false);
    taperTube(geo, 16, 8, rBase, rTip);
    // Only the woody canopy limbs sway; roots and flares are earthbound. Thinner,
    // longer branches sway more (a small, capped amplitude in radians). A
    // deterministic phase from the base position makes every branch move on its
    // own beat, so the whole crown breathes rather than swinging as one.
    const woody = limb.kind === "branch" || limb.kind === "sub";
    const sway = woody ? Math.min(0.035, 0.01 + len * 0.003) : 0;
    const s = Math.sin(limb.from[0] * 12.9898 + limb.from[2] * 78.233) * 43758.5453;
    const phase = (s - Math.floor(s)) * Math.PI * 2;
    return { geometry: geo, sway, phase };
  }, [limb, style, girthScale]);

  useFrame((state) => {
    const g = groupRef.current;
    if (!g || sway === 0) return;
    const t = state.clock.elapsedTime;
    // Two overlapping slow sines = a gentle, non-repeating gust.
    const w = Math.sin(t * 0.6 + phase) * 0.7 + Math.sin(t * 0.23 + phase * 1.7) * 0.3;
    g.rotation.z = w * sway;
    g.rotation.x = Math.cos(t * 0.5 + phase) * sway * 0.5;
  });

  // Roots/flares stay dark and mossy (earthbound); woody parts use a light warm
  // tint so the real bark photo shows through.
  const color = limb.kind === "root" ? "#5c3d26" : limb.kind === "flare" ? "#5a4a30" : "#b39a7c";
  return (
    <group ref={groupRef} position={limb.from}>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial color={color} map={bark.map} normalMap={bark.normal} normalScale={BARK_NORMAL_SCALE} roughness={0.92} />
      </mesh>
    </group>
  );
}

function taperTube(geo: THREE.TubeGeometry, tubularSegments: number, radialSegments: number, rBase: number, rTip: number) {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const path = geo.parameters.path;
  const frames = path.computeFrenetFrames(tubularSegments, false);
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

function Trunk({
  height,
  rBottom,
  rTop,
  bark,
}: {
  height: number;
  rBottom: number;
  rTop: number;
  bark: { map: THREE.Texture; normal: THREE.Texture };
}) {
  // Thick, barely-tapering base that flows straight into the two forks. Girth
  // (rBottom) and the radius where it meets the forks (rTop) come from the
  // growth grammar, so the trunk thickens as a life accumulates memories.
  return (
    <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[rTop, rBottom, height, 32, 6]} />
      <meshStandardMaterial color="#b39a7c" map={bark.map} normalMap={bark.normal} normalScale={TRUNK_NORMAL_SCALE} roughness={0.92} />
    </mesh>
  );
}

// The trunk is alive: faint golden veins spiral up beneath the bark and out
// along the two forks, and soft golden particles drift up through them —
// memories moving through the body of a life. Purely additive glow over the
// existing trunk, so it never alters the woody structure. Brightens after dark.
function LivingTrunk({
  forkHeight,
  forks,
  baseRadius,
  topRadius = 0.19,
  nightRef,
}: {
  forkHeight: number;
  forks: Fork[];
  baseRadius: number;
  topRadius?: number;
  nightRef?: React.MutableRefObject<number>;
}) {
  const glowTex = useMemo(makeGlowSprite, []);

  const veinMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color("#ffcf7a"),
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );

  const veinGeoms = useMemo(() => {
    const geoms: THREE.TubeGeometry[] = [];
    // Strands spiralling up the base column.
    const STRANDS = 5;
    for (let i = 0; i < STRANDS; i++) {
      const phase = (i / STRANDS) * Math.PI * 2;
      const pts: THREE.Vector3[] = [];
      const SEG = 12;
      for (let s = 0; s <= SEG; s++) {
        const t = s / SEG;
        const r = (baseRadius * (1 - t) + topRadius * t) * 1.015;
        const ang = phase + t * 2.4;
        pts.push(new THREE.Vector3(Math.cos(ang) * r, t * forkHeight, Math.sin(ang) * r));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      geoms.push(new THREE.TubeGeometry(curve, SEG * 2, 0.012, 5, false));
    }
    // A vein continues up each great fork.
    for (const f of forks) {
      const a = new THREE.Vector3(...f.base);
      const b = new THREE.Vector3(...f.tip);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      mid.y += a.distanceTo(b) * 0.18;
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      geoms.push(new THREE.TubeGeometry(curve, 18, 0.013, 5, false));
    }
    return geoms;
  }, [forkHeight, forks, baseRadius, topRadius]);

  // Golden particles rising through the trunk column and up toward the forks.
  const COUNT = 44;
  const topY = forkHeight + Math.max(...forks.map((f) => f.tip[1] - f.base[1]), 1) * 0.6;
  const { partGeo, speeds } = useMemo(() => {
    const positions = new Float32Array(COUNT * 3);
    const speeds = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * baseRadius * 0.9;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = Math.random() * topY;
      positions[i * 3 + 2] = Math.sin(a) * r;
      speeds[i] = 0.25 + Math.random() * 0.5;
    }
    const partGeo = new THREE.BufferGeometry();
    partGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return { partGeo, speeds };
  }, [baseRadius, topY]);

  const partRef = useRef<THREE.Points>(null);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const night = nightRef ? nightRef.current : 0;
    veinMaterial.opacity = (0.4 + night * 0.35) * (0.75 + Math.sin(t * 1.3) * 0.25);
    if (partRef.current) {
      const pos = partRef.current.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < COUNT; i++) {
        let y = pos.getY(i) + speeds[i] * delta;
        if (y > topY) y = 0;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    }
  });

  return (
    <group>
      {veinGeoms.map((g, i) => (
        <mesh key={i} geometry={g} material={veinMaterial} />
      ))}
      <points ref={partRef} geometry={partGeo}>
        <pointsMaterial
          map={glowTex}
          size={0.13}
          color="#ffd98a"
          transparent
          opacity={0.85}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          sizeAttenuation
          toneMapped={false}
        />
      </points>
    </group>
  );
}

// Functional earth volume for the underground root view. The VISIBLE ground
// surface is now the asset-driven <Terrain/>; this component only supplies the
// dark soil that gives the root network depth and occludes the sky when the
// camera tilts below the horizon.
function Ground() {
  return (
    <group>
      {/* Dark soil backdrop — gives the underground volume depth so the family
          root network reads as being *in* the earth. Opaque, sits below. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.4, 0]}>
        <circleGeometry args={[60, 64]} />
        <meshStandardMaterial color="#241a12" roughness={1} />
      </mesh>
      {/* Soil ceiling — the opaque underside of the earth. FrontSide-only with a
          downward normal, so it renders solid when the camera is BELOW it (a
          real buried-in-earth feel) yet is culled from above. */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <circleGeometry args={[60, 64]} />
        <meshStandardMaterial color="#1a0f07" roughness={1} side={THREE.FrontSide} />
      </mesh>
    </group>
  );
}

function CanopyShadow({ tex, center, radius }: { tex: THREE.CanvasTexture; center: Vec3; radius: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center[0], 0.02, center[2]]}>
      <planeGeometry args={[radius * 3.2, radius * 3.2]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} opacity={0.85} />
    </mesh>
  );
}

// Warm vertical gradient used for the light shafts: bright at the crown, fading
// to nothing at the floor, with soft feathered sides so each shaft reads as a
// beam of dusty light rather than a hard quad.
function makeShaftTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 48;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "rgba(255,224,158,0.85)");
  g.addColorStop(0.55, "rgba(255,214,140,0.28)");
  g.addColorStop(1, "rgba(255,210,130,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 48, 256);
  // feather the vertical edges away
  const h = ctx.createLinearGradient(0, 0, 48, 0);
  h.addColorStop(0, "rgba(0,0,0,1)");
  h.addColorStop(0.5, "rgba(0,0,0,0)");
  h.addColorStop(1, "rgba(0,0,0,1)");
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = h;
  ctx.fillRect(0, 0, 48, 256);
  return new THREE.CanvasTexture(c);
}

// Volumetric-ish sunlight: a handful of warm additive beams slanting down out of
// the canopy toward the plaza, billboarded to the camera so they always read as
// shafts. They breathe faintly and fade out at night. This is the accepted cheap
// approximation of god-rays (no heavy volumetric pass on mobile).
function GodRays({
  center,
  height,
  sun,
  nightRef,
}: {
  center: Vec3;
  height: number;
  sun: Vec3;
  nightRef: React.MutableRefObject<number>;
}) {
  const tex = useMemo(makeShaftTexture, []);
  const groupRef = useRef<THREE.Group>(null);
  const matRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);

  const shafts = useMemo(() => {
    const N = 6;
    // Slant angle from the sun direction (projected), so beams rake the way the
    // light falls rather than dropping straight down.
    const tilt = Math.atan2(sun[0], sun[1]) * 0.5;
    return Array.from({ length: N }, (_, i) => ({
      x: center[0] + (hash01(`gr${i}`, 3) - 0.5) * height * 0.7,
      z: center[2] + (hash01(`gr${i}`, 7) - 0.5) * height * 0.5,
      len: height * (1.2 + hash01(`gr${i}`, 5) * 0.6),
      w: height * (0.16 + hash01(`gr${i}`, 9) * 0.14),
      tilt: tilt + (hash01(`gr${i}`, 13) - 0.5) * 0.25,
      speed: 0.4 + hash01(`gr${i}`, 11) * 0.6,
      phase: hash01(`gr${i}`, 17) * Math.PI * 2,
    }));
  }, [center, height, sun]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const day = 1 - (nightRef.current ?? 0);
    // Billboard the whole rig around Y so the flat beams always face the camera.
    if (groupRef.current) {
      const cam = state.camera.position;
      groupRef.current.rotation.y = Math.atan2(cam.x - center[0], cam.z - center[2]);
    }
    for (let i = 0; i < matRefs.current.length; i++) {
      const m = matRefs.current[i];
      if (!m) continue;
      const s = shafts[i];
      m.opacity = Math.max(0, day) * (0.12 + 0.06 * Math.sin(t * s.speed + s.phase));
    }
  });

  return (
    <group ref={groupRef} position={[center[0], 0, center[2]]}>
      {shafts.map((s, i) => (
        <mesh
          key={i}
          position={[s.x - center[0], height * 0.55, s.z - center[2]]}
          rotation={[0, 0, s.tilt]}
        >
          <planeGeometry args={[s.w, s.len]} />
          <meshBasicMaterial
            ref={(el) => {
              matRefs.current[i] = el;
            }}
            map={tex}
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

// Healed scars in the bark — one per hardship a life carried through. Each is a
// dark seam sunk into the trunk with a soft gold glow along it: a wound that
// became wisdom. They sit on the trunk surface, facing outward, and pulse very
// faintly so they read as alive rather than painted on.
function Scars({ scars, nightRef }: { scars: Scar[]; nightRef: React.MutableRefObject<number> }) {
  const glowRefs = useRef<(THREE.Material | null)[]>([]);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const night = nightRef.current;
    for (let i = 0; i < glowRefs.current.length; i++) {
      const m = glowRefs.current[i] as THREE.MeshBasicMaterial | null;
      if (!m) continue;
      // Gentle breathing, a touch brighter after dark so scars glow at night.
      m.opacity = 0.28 + 0.12 * Math.sin(t * 0.6 + i * 1.7) + night * 0.25;
    }
  });
  if (scars.length === 0) return null;
  return (
    <group>
      {scars.map((s, i) => {
        // Lay each seam flat against the trunk: rotate the group so +Z points
        // outward from the axis, then the seam runs vertically up the surface.
        return (
          <group key={i} position={s.pos} rotation={[0, -s.angle + Math.PI / 2, 0]}>
            {/* The dark healed groove. */}
            <mesh>
              <capsuleGeometry args={[0.035, s.size, 4, 8]} />
              <meshStandardMaterial color="#2c1a0e" roughness={1} />
            </mesh>
            {/* Soft gold light welling from within the scar. */}
            <mesh position={[0, 0, 0.02]}>
              <planeGeometry args={[0.14, s.size + 0.18]} />
              <meshBasicMaterial
                ref={(r) => {
                  glowRefs.current[i] = r;
                }}
                color="#ffce7a"
                transparent
                opacity={0.3}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                side={THREE.DoubleSide}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

// Generational rings: one faint gold ripple beneath the forest floor per
// generation of family/heritage. They radiate outward like growth rings of the
// whole lineage, softly pulsing so the underground reads as a living web that
// belongs to a family far larger than this single tree.
function GenRings({ rings, nightRef }: { rings: GenRing[]; nightRef: React.MutableRefObject<number> }) {
  const refs = useRef<(THREE.Material | null)[]>([]);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const night = nightRef.current;
    for (let i = 0; i < refs.current.length; i++) {
      const m = refs.current[i] as THREE.MeshBasicMaterial | null;
      if (!m) continue;
      // A slow outward pulse, offset per ring, brighter underground/at night.
      m.opacity = 0.06 + 0.05 * (0.5 + 0.5 * Math.sin(t * 0.5 - i * 0.9)) + night * 0.05;
    }
  });
  if (rings.length === 0) return null;
  return (
    <group>
      {rings.map((r, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, -r.depth, 0]}>
          <ringGeometry args={[r.radius - 0.06, r.radius + 0.06, 96]} />
          <meshBasicMaterial
            ref={(m) => {
              refs.current[i] = m;
            }}
            color="#e7b465"
            transparent
            opacity={0.08}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

// The signature of the concept art: hundreds of warm golden lights scattered
// through the crown, each softly twinkling as if memories were catching the
// last of the sun. Bright peaks cross the bloom threshold and flare, so the
// canopy shimmers. Brightens further after dark.
function CanopySparkles({
  center,
  radius,
  count,
  nightRef,
}: {
  center: Vec3;
  radius: number;
  count: number;
  nightRef?: React.MutableRefObject<number>;
}) {
  const matRef = useRef<THREE.PointsMaterial>(null);
  const glowTex = useMemo(makeGlowSprite, []);

  const { geometry, phases, speeds, base } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const speeds = new Float32Array(count);
    const base = new Float32Array(count * 3);
    const col = new THREE.Color();
    for (let i = 0; i < count; i++) {
      // Distribute toward the outer shell of the crown where light catches.
      const u = Math.random();
      const v = Math.random();
      const theta = u * Math.PI * 2;
      const phi = Math.acos(2 * v - 1);
      const rr = radius * (0.55 + Math.random() * 0.5);
      positions[i * 3] = center[0] + Math.sin(phi) * Math.cos(theta) * rr;
      positions[i * 3 + 1] = center[1] + Math.cos(phi) * rr * 0.92;
      positions[i * 3 + 2] = center[2] + Math.sin(phi) * Math.sin(theta) * rr;
      // Warm gold with a little variance — some white-hot, some deep amber.
      col.setHSL(0.11 + (Math.random() - 0.5) * 0.05, 0.85, 0.6 + Math.random() * 0.2);
      base[i * 3] = col.r;
      base[i * 3 + 1] = col.g;
      base[i * 3 + 2] = col.b;
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
      phases[i] = Math.random() * Math.PI * 2;
      speeds[i] = 0.8 + Math.random() * 2.4;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return { geometry, phases, speeds, base };
  }, [center, radius, count]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const night = nightRef ? nightRef.current : 0;
    const col = geometry.attributes.color as THREE.BufferAttribute;
    const arr = col.array as Float32Array;
    for (let i = 0; i < count; i++) {
      // Individual twinkle: brightness swings between a dim floor and a bright
      // flare, so lights pop in and out rather than pulsing in unison.
      const tw = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(t * speeds[i] + phases[i]), 2);
      const gain = tw * (1.15 + night * 0.6);
      arr[i * 3] = base[i * 3] * gain;
      arr[i * 3 + 1] = base[i * 3 + 1] * gain;
      arr[i * 3 + 2] = base[i * 3 + 2] * gain;
    }
    col.needsUpdate = true;
    if (matRef.current) matRef.current.opacity = 0.9 + night * 0.1;
  });

  return (
    <points geometry={geometry}>
      <pointsMaterial
        ref={matRef}
        map={glowTex}
        size={0.22}
        vertexColors
        transparent
        opacity={0.9}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
        toneMapped={false}
      />
    </points>
  );
}

function Motes({
  trunkHeight,
  color = "#ffdca6",
  opacity = 0.5,
  nightRef,
}: {
  trunkHeight: number;
  color?: string;
  opacity?: number;
  nightRef?: React.MutableRefObject<number>;
}) {
  const ref = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.PointsMaterial>(null);
  const glowTex = useMemo(makeGlowSprite, []);
  const COUNT = 50;
  const { geometry, speeds } = useMemo(() => {
    const positions = new Float32Array(COUNT * 3);
    const speeds = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.5 + Math.random() * 6;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = Math.random() * (trunkHeight + 4);
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
    const ceiling = trunkHeight + 4;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < COUNT; i++) {
      let y = pos.getY(i) + speeds[i] * delta;
      if (y > ceiling) y = 0;
      pos.setY(i, y);
      pos.setX(i, pos.getX(i) + Math.sin(t * 0.3 + i) * delta * 0.05);
    }
    pos.needsUpdate = true;
    // Lanterns breathe gently and glow stronger after dark.
    if (matRef.current) {
      const pulse = 0.82 + Math.sin(t * 0.7) * 0.18;
      const night = nightRef ? nightRef.current * 0.3 : 0;
      matRef.current.opacity = (opacity + night) * pulse;
    }
  });
  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial ref={matRef} map={glowTex} size={0.34} color={color} transparent opacity={opacity} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
    </points>
  );
}

/* ---------- Living time-of-day cycle ---------- */

// Interpolates the atmosphere keyframes each frame and mutates the scene's
// lights, sky, fog and background in place — no React state, so it's cheap.
// When disabled (memorial forests) it simply holds a gentle dusk night factor
// so the constellations stay faintly visible.
// Warm, near-black soil tones the world lerps toward as the camera dips
// underground, so tilting beneath the surface feels like being inside the earth.
const EARTH_FOG = new THREE.Color("#160c05");
const EARTH_BG = new THREE.Color("#1c1008");

function SceneClock({
  enabled,
  nightRef,
  ambientRef,
  hemiRef,
  dirRef,
  skyRef,
  fogNear,
  fogFar,
  worldH,
}: {
  enabled: boolean;
  nightRef: React.MutableRefObject<number>;
  ambientRef: React.RefObject<THREE.AmbientLight>;
  hemiRef: React.RefObject<THREE.HemisphereLight>;
  dirRef: React.RefObject<THREE.DirectionalLight>;
  skyRef: React.RefObject<React.ElementRef<typeof Sky>>;
  /** Fog distances, scaled to the hero tree so the monument stays crisp. */
  fogNear: number;
  fogFar: number;
  worldH: number;
}) {
  const { scene } = useThree();
  const lerp = THREE.MathUtils.lerp;

  useFrame((state) => {
    if (!enabled) {
      nightRef.current = 0.6;
      return;
    }
    const phase = realTimePhase();
    let i = 0;
    for (let k = 0; k < DAY_CYCLE.length - 1; k++) {
      if (phase >= DAY_CYCLE[k].at && phase < DAY_CYCLE[k + 1].at) {
        i = k;
        break;
      }
    }
    const k0 = DAY_CYCLE[i];
    const k1 = DAY_CYCLE[i + 1];
    const c0 = CYCLE_COLORS[i];
    const c1 = CYCLE_COLORS[i + 1];
    const t = THREE.MathUtils.clamp((phase - k0.at) / (k1.at - k0.at || 1), 0, 1);

    nightRef.current = lerp(k0.night, k1.night, t);

    if (scene.background instanceof THREE.Color) scene.background.copy(c0.bg).lerp(c1.bg, t);
    if (scene.fog instanceof THREE.Fog) {
      // Only the fog COLOUR animates with the day; the distances stay pinned to
      // the tree's scale so the monument never fogs out at any time of day.
      scene.fog.color.copy(c0.fog).lerp(c1.fog, t);
      scene.fog.near = fogNear;
      scene.fog.far = fogFar;
    }
    if (ambientRef.current) ambientRef.current.intensity = lerp(k0.ambient, k1.ambient, t);
    if (hemiRef.current) {
      hemiRef.current.color.copy(c0.hemiSky).lerp(c1.hemiSky, t);
      hemiRef.current.groundColor.copy(c0.hemiGround).lerp(c1.hemiGround, t);
      hemiRef.current.intensity = lerp(k0.hemi.intensity, k1.hemi.intensity, t);
    }

    const sx = lerp(k0.sun[0], k1.sun[0], t);
    const sy = lerp(k0.sun[1], k1.sun[1], t);
    const sz = lerp(k0.sun[2], k1.sun[2], t);
    if (dirRef.current) {
      dirRef.current.color.copy(c0.dir).lerp(c1.dir, t);
      dirRef.current.intensity = lerp(k0.dir.intensity, k1.dir.intensity, t);
      dirRef.current.position.set(sx, sy, sz);
    }
    const skyMat = skyRef.current?.material as THREE.ShaderMaterial | undefined;
    if (skyMat?.uniforms) {
      skyMat.uniforms.turbidity.value = lerp(k0.sky.turbidity, k1.sky.turbidity, t);
      skyMat.uniforms.rayleigh.value = lerp(k0.sky.rayleigh, k1.sky.rayleigh, t);
      skyMat.uniforms.mieCoefficient.value = lerp(k0.sky.mieCoefficient, k1.sky.mieCoefficient, t);
      skyMat.uniforms.mieDirectionalG.value = lerp(k0.sky.mieDirectionalG, k1.sky.mieDirectionalG, t);
      (skyMat.uniforms.sunPosition.value as THREE.Vector3).set(sx, sy, sz);
    }

    // Underground: as the camera dips below the surface, bury the world in warm
    // dark earth — the horizon and sky fade to soil so it feels like being *in*
    // the ground, not floating under a glass floor.
    const buried = THREE.MathUtils.clamp(-state.camera.position.y / (worldH * 0.12), 0, 1);
    if (buried > 0.001) {
      if (scene.background instanceof THREE.Color) scene.background.lerp(EARTH_BG, buried);
      if (scene.fog instanceof THREE.Fog) {
        scene.fog.color.lerp(EARTH_FOG, buried);
        scene.fog.near = lerp(scene.fog.near, worldH * 0.05, buried);
        scene.fog.far = lerp(scene.fog.far, worldH * 0.9, buried);
      }
      if (ambientRef.current) {
        ambientRef.current.intensity = lerp(ambientRef.current.intensity, 0.4, buried * 0.85);
      }
    }
  });

  return null;
}

/* ---------- Memory constellations ---------- */

interface Star {
  id: string;
  node: ForestNodeDTO;
  pos: Vec3;
  color: string;
}

// After dark, a selection of memories rises into the sky as stars, joined by
// faint lines into a constellation of a life. They fade in with the night and
// can be clicked to open the memory, just like a leaf on the tree.
function Constellation({
  graph,
  categoryColorByNodeId,
  nightRef,
  onSelect,
}: {
  graph: ForestGraph;
  categoryColorByNodeId: Map<string, string>;
  nightRef: React.MutableRefObject<number>;
  onSelect: (node: ForestNodeDTO | null) => void;
}) {
  const stars = useMemo<Star[]>(() => {
    const mem = graph.nodes
      .filter((n) => MEMORY_KINDS.has(n.kind))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 40);
    return mem.map((n) => {
      const theta = hash01(n.id, 1) * Math.PI * 2;
      const rad = 28 + hash01(n.id, 3) * 18;
      const y = 15 + hash01(n.id, 5) * 20;
      return {
        id: n.id,
        node: n,
        pos: [Math.cos(theta) * rad, y, Math.sin(theta) * rad] as Vec3,
        color: categoryColorByNodeId.get(n.id) ?? COLORS[n.kind] ?? "#cfe0ff",
      };
    });
  }, [graph, categoryColorByNodeId]);

  // Connect each star to its nearest neighbor to sketch constellation lines.
  const lineGeometry = useMemo(() => {
    if (stars.length < 2) return null;
    const pts: number[] = [];
    for (let i = 0; i < stars.length; i++) {
      let best = -1;
      let bestD = Infinity;
      for (let j = 0; j < stars.length; j++) {
        if (i === j) continue;
        const dx = stars[i].pos[0] - stars[j].pos[0];
        const dy = stars[i].pos[1] - stars[j].pos[1];
        const dz = stars[i].pos[2] - stars[j].pos[2];
        const d = dx * dx + dy * dy + dz * dz;
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
      if (best >= 0 && best > i) {
        pts.push(...stars[i].pos, ...stars[best].pos);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [stars]);

  const lineMat = useRef<THREE.LineBasicMaterial>(null);
  useFrame(() => {
    if (lineMat.current) lineMat.current.opacity = nightRef.current * 0.28;
  });

  useLayoutEffect(() => {
    return () => lineGeometry?.dispose();
  }, [lineGeometry]);

  if (!stars.length) return null;

  return (
    <group>
      {lineGeometry ? (
        <lineSegments geometry={lineGeometry}>
          <lineBasicMaterial
            ref={lineMat}
            color="#aac4ff"
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </lineSegments>
      ) : null}
      {stars.map((s) => (
        <StarNode key={s.id} star={s} nightRef={nightRef} onSelect={onSelect} />
      ))}
    </group>
  );
}

function StarNode({
  star,
  nightRef,
  onSelect,
}: {
  star: Star;
  nightRef: React.MutableRefObject<number>;
  onSelect: (node: ForestNodeDTO | null) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const coreRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const haloRef = useRef<THREE.MeshBasicMaterial>(null);
  const hitRef = useRef<THREE.Mesh>(null);
  const twinkle = useMemo(() => hash01(star.id, 7) * Math.PI * 2, [star.id]);

  useFrame((state) => {
    const night = nightRef.current;
    const visible = night > 0.15;
    if (hitRef.current) hitRef.current.visible = visible;
    const flicker = 0.75 + 0.25 * Math.sin(state.clock.elapsedTime * 1.5 + twinkle);
    if (matRef.current) matRef.current.opacity = night * (hovered ? 1 : flicker);
    if (haloRef.current) haloRef.current.opacity = night * (hovered ? 0.5 : 0.22);
    if (coreRef.current) coreRef.current.scale.setScalar(hovered ? 1.6 : 1);
  });

  return (
    <group position={star.pos}>
      <group ref={coreRef}>
        <mesh>
          <sphereGeometry args={[0.32, 12, 12]} />
          <meshBasicMaterial ref={matRef} color={star.color} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.7, 12, 12]} />
          <meshBasicMaterial ref={haloRef} color={star.color} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
      </group>
      {/* Invisible, larger hit target; disabled during daylight. */}
      <mesh
        ref={hitRef}
        visible={false}
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
          if (nightRef.current > 0.15) onSelect(star.node);
        }}
      >
        <sphereGeometry args={[1.1, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {hovered ? (
        <Html center distanceFactor={16} position={[0, 1.3, 0]}>
          <div className="pointer-events-none select-none whitespace-nowrap rounded-full bg-black/80 px-3 py-1 text-xs text-parchment">
            {star.node.title}
          </div>
        </Html>
      ) : null}
    </group>
  );
}

/* ---------- Interactive memory nodes ---------- */

// Shared scratch vectors so the per-frame label logic below allocates nothing.
const _lblWorld = new THREE.Vector3();
const _lblCamDir = new THREE.Vector3();
const _lblToNode = new THREE.Vector3();
const _catOut = new THREE.Vector3();
const _catToCam = new THREE.Vector3();
// Reused for anchoring each lantern's cord onto the REAL hero-tree geometry:
// we fire a small CONE of rays upward from the lantern's attach point and take
// the CLOSEST hit on the actual mesh as the branch/foliage the cord hangs from.
// A single straight-up ray missed whenever the canopy had a gap right overhead;
// the cone reliably finds the nearest real branch above/around the lantern.
const _rayFrom = new THREE.Vector3();
const _lanternRaycaster = new THREE.Raycaster();
const ANCHOR_DIRS: THREE.Vector3[] = [
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0.35, 1, 0).normalize(),
  new THREE.Vector3(-0.35, 1, 0).normalize(),
  new THREE.Vector3(0, 1, 0.35).normalize(),
  new THREE.Vector3(0, 1, -0.35).normalize(),
  new THREE.Vector3(0.28, 1, 0.28).normalize(),
  new THREE.Vector3(-0.28, 1, -0.28).normalize(),
  new THREE.Vector3(0.28, 1, -0.28).normalize(),
  new THREE.Vector3(-0.28, 1, 0.28).normalize(),
];

// The lantern GLB is opaque, so the candle inside is invisible from the front.
// Turn its shells translucent (once per shared source scene) so the warm flame
// glows through the glass. Mutating the cached source is fine — this GLB is
// only ever used for these lanterns.
const _lanternProcessed = new WeakSet<THREE.Object3D>();
function makeLanternTranslucent(root: THREE.Object3D) {
  if (_lanternProcessed.has(root)) return;
  _lanternProcessed.add(root);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const mat = m as THREE.MeshStandardMaterial;
      mat.transparent = true;
      mat.opacity = 0.5;
      mat.depthWrite = false;
      mat.side = THREE.DoubleSide;
      if (mat.emissive) {
        mat.emissive = new THREE.Color("#3a2410");
        mat.emissiveIntensity = 0.45;
      }
    }
  });
}

// ---------------------------------------------------------------------------
// CategoryLantern — one hangs from each main branch and IS a category. Every
// memory in that category lives inside it; clicking selects the category. It's
// a large, warmly-lit loaded lantern GLB that sways on its cord, carries its
// category's color in its glow, and floats a readable name label beside it.
// ---------------------------------------------------------------------------
function CategoryLantern({
  node,
  position,
  title,
  color,
  phase,
  drop,
  size,
  light,
  selected,
  nightRef,
  onSelect,
  heroRef,
  reach,
  linkedUserId,
  onOpenFamily,
}: {
  node: ForestNodeDTO;
  position: Vec3;
  title: string;
  color: string;
  phase: number;
  drop: number;
  size: number;
  light: number;
  selected: boolean;
  nightRef: React.MutableRefObject<number>;
  onSelect: (node: ForestNodeDTO | null) => void;
  /** The real hero-tree object, so the cord can be anchored onto actual geometry. */
  heroRef?: React.MutableRefObject<THREE.Object3D | null>;
  /** How far up to search for a branch to hang from (≈ the tree height). */
  reach?: number;
  /** Family variant: the linked account this person owns (null if not linked). */
  linkedUserId?: string | null;
  /** Family variant: navigate into a linked person's own forest. */
  onOpenFamily?: (userId: string) => void;
}) {
  const { scene } = useGLTF(MODELS.lantern.url);
  // Make the shared lantern GLB translucent so the candle glows through.
  useMemo(() => makeLanternTranslucent(scene), [scene]);
  const swingRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const coreRef = useRef<THREE.MeshStandardMaterial>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const appear = useRef(0);
  // Once we've cast a ray onto the real tree and found the branch the cord hangs
  // from, we lock the group's Y there. Until then we keep re-trying each frame
  // (the GLB loads async, so heroRef geometry isn't there on the first frames).
  const anchored = useRef(false);
  // Cap the retries. The cone-raycast is expensive (9 rays × full tree geometry)
  // and, if the lantern sits outside the canopy footprint, it NEVER hits — which
  // left every lantern re-firing that storm on every single frame forever and
  // tanked the frame rate. Give each lantern a bounded budget of attempts; once
  // spent we give up and keep the planned position, so the cost is paid once at
  // scene start and never again.
  const anchorTries = useRef(0);
  const MAX_ANCHOR_TRIES = 120;

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const night = nightRef?.current ?? 0;
    // Anchor the cord's TOP onto the real hero-tree geometry: fire a small CONE
    // of rays upward from the lantern's attach point and snap the whole group
    // onto the CLOSEST branch/foliage point found. The cord then physically
    // emerges from that real surface and the lantern hangs its short `drop`
    // below it. Casting a generous distance (≈ tree height) is what makes it
    // actually reach the canopy — the old single short ray fell short and left
    // the cords floating. Resolved once per lantern.
    if (!anchored.current && heroRef?.current && groupRef.current) {
      anchorTries.current += 1;
      _rayFrom.set(position[0], position[1], position[2]);
      const far = reach ?? 40;
      let best: THREE.Intersection | null = null;
      for (const dir of ANCHOR_DIRS) {
        _lanternRaycaster.set(_rayFrom, dir);
        _lanternRaycaster.far = far;
        const hits = _lanternRaycaster.intersectObject(heroRef.current, true);
        if (hits.length > 0 && (!best || hits[0].distance < best.distance)) best = hits[0];
      }
      if (best) {
        // Move the cord's TOP exactly onto the real branch point we found.
        groupRef.current.position.set(best.point.x, best.point.y, best.point.z);
        anchored.current = true;
      } else if (anchorTries.current >= MAX_ANCHOR_TRIES) {
        // Budget spent without a hit — give up and stop the per-frame storm.
        anchored.current = true;
      }
    }
    if (swingRef.current) {
      swingRef.current.rotation.z = Math.sin(t * 0.7 + phase) * 0.05;
      swingRef.current.rotation.x = Math.cos(t * 0.5 + phase) * 0.035;
    }
    const flicker = 0.92 + Math.sin(t * 5 + phase) * 0.08;
    const emphasis = selected ? 1.3 : hovered ? 1.14 : 1;
    if (bodyRef.current) {
      appear.current = THREE.MathUtils.damp(appear.current, emphasis, 6, delta);
      bodyRef.current.scale.setScalar(size * appear.current);
    }
    if (lightRef.current) {
      lightRef.current.intensity = (2.2 + night * 3.4 + (selected ? 1.8 : 0)) * flicker;
    }
    if (coreRef.current) {
      // A candle flame — gentle, warm, flickering; brighter after dark.
      coreRef.current.emissiveIntensity = (1.7 + night * 2.2 + (selected ? 0.9 : 0)) * flicker;
    }
    // Fade the label out on the far side of the tree so only the lanterns facing
    // the camera show their name — the front always reads cleanly.
    if (labelRef.current && groupRef.current) {
      groupRef.current.getWorldPosition(_lblWorld);
      _catOut.set(_lblWorld.x, 0, _lblWorld.z).normalize();
      _catToCam.copy(state.camera.position).sub(_lblWorld).setY(0).normalize();
      const facing = _catOut.dot(_catToCam); // 1 = lantern is on the camera side
      const op = THREE.MathUtils.clamp((facing + 0.15) / 0.6, 0, 1);
      labelRef.current.style.opacity = ((selected || hovered ? 1 : 0.92) * op).toFixed(3);
    }
  });

  const select = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    // Family lantern for a LINKED relative → sail into their own forest.
    if (linkedUserId && onOpenFamily) {
      onOpenFamily(linkedUserId);
      return;
    }
    // Category lantern, or an unlinked family member → open its panel (the
    // family panel carries the invite link for people who haven't joined yet).
    onSelect(node);
  };

  return (
    <group
      ref={groupRef}
      position={position}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = "default";
      }}
      onClick={select}
    >
      {/* the cord + lantern hang and sway as one pendulum. The group's ORIGIN is
          the attach point up inside the real canopy, so the cord drops straight
          DOWN out of the foliage and the lantern emerges below the leaves —
          reading as hung directly off the tree's own branches, no added limb. */}
      <group ref={swingRef}>
        {/* cord: from the in-canopy origin down its full length `drop` */}
        <mesh position={[0, -drop / 2, 0]}>
          <cylinderGeometry
            args={[Math.max(0.05, size * 0.03), Math.max(0.05, size * 0.03), drop, 6]}
          />
          <meshStandardMaterial color="#2a1f12" roughness={1} />
        </mesh>
        {/* lantern body at the cord's end — scaled (via useFrame) to the tree */}
        <group ref={bodyRef} position={[0, -drop, 0]}>
          <Clone object={scene} castShadow receiveShadow />
          {/* the CANDLE FLAME — a small warm point of light sitting INSIDE the
              lantern body (not perched on top). It flickers like a real flame;
              the category's color is carried by the surrounding glow light
              below, not by this core. */}
          <mesh position={[0, -0.05, 0]}>
            <sphereGeometry args={[0.11, 14, 14]} />
            <meshStandardMaterial
              ref={coreRef}
              color="#fff2d0"
              emissive="#ffb046"
              emissiveIntensity={1.4}
              toneMapped={false}
            />
          </mesh>
        </group>
        {/* the glow light lives OUTSIDE the scaled body so its radius stays in
            world units regardless of lantern size */}
        <pointLight
          ref={lightRef}
          color={color}
          intensity={1.4}
          distance={light}
          decay={2}
          position={[0, -drop, 0]}
        />
      </group>

      {/* the category name floats beside the lantern as its label / entry point */}
      <Html center distanceFactor={Math.max(14, size * 1.2)} position={[0, -drop, 0]} zIndexRange={[20, 0]}>
        <div
          ref={labelRef}
          onClick={select}
          style={{
            opacity: 0,
            color: "#f5ecd8",
            borderColor: color,
            background: selected || hovered ? "rgba(0,0,0,0.82)" : "rgba(0,0,0,0.6)",
            boxShadow: selected || hovered ? `0 0 14px ${color}` : "none",
          }}
          className="cursor-pointer select-none whitespace-nowrap rounded-full border px-3 py-1 font-serif text-xs [text-shadow:0_1px_5px_rgba(0,0,0,0.95)]"
        >
          {title}
        </div>
      </Html>
    </group>
  );
}

function NodeGlyph({
  positioned,
  selected,
  justGrew,
  leafTex,
  overrideColor,
  onSelect,
}: {
  positioned: PositionedNode;
  selected: boolean;
  justGrew: boolean;
  leafTex: THREE.CanvasTexture;
  overrideColor?: string;
  onSelect: (node: ForestNodeDTO | null) => void;
}) {
  const { node, position, scale } = positioned;
  const [hovered, setHovered] = useState(false);
  const ref = useRef<THREE.Group>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const appear = useRef(0);

  useFrame((state, delta) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    appear.current = THREE.MathUtils.damp(appear.current, 1, 5, delta);
    const emphasis = selected ? 1.6 : hovered ? 1.25 : justGrew ? 1.3 : 1;
    ref.current.scale.setScalar(appear.current * emphasis);
    if (node.kind === "LEAF" || node.kind === "FLOWER" || node.kind === "FRUIT") {
      ref.current.rotation.z = Math.sin(t * 0.9 + position[0]) * 0.09;
      ref.current.rotation.x = Math.cos(t * 0.7 + position[2]) * 0.05;
    }
    // Bloom-on-touch: the selected memory's halo breathes softly.
    if (haloRef.current) {
      const p = 1 + Math.sin(t * 2.2) * 0.07;
      haloRef.current.scale.setScalar(p);
    }
    // Declutter: with dozens of memories, showing every title at once turns the
    // canopy into an unreadable smear. Instead the ambient title only appears
    // for the memory the camera is actually looking AT — the one near the
    // center of view and reasonably close. As you orbit, titles light up one or
    // two at a time, so the tree always reads as real moments without clutter.
    if (labelRef.current) {
      const cam = state.camera;
      ref.current.getWorldPosition(_lblWorld);
      const dist = cam.position.distanceTo(_lblWorld);
      if (node.kind === "PERSON" || node.kind === "ROOT") {
        // Family & heritage names surface as the camera dips underground, so
        // tilting beneath the tree reveals who is rooted there — no aim gate, so
        // the whole family reads at once, just fading with the descent + distance.
        const buried = THREE.MathUtils.clamp(-cam.position.y / 1.5, 0, 1);
        const distF = THREE.MathUtils.clamp(1 - (dist - 4) / 13, 0, 1);
        labelRef.current.style.opacity = (buried * distF * 0.92).toFixed(3);
      } else {
        cam.getWorldDirection(_lblCamDir);
        _lblToNode.copy(_lblWorld).sub(cam.position).normalize();
        const aim = _lblCamDir.dot(_lblToNode); // 1 = dead center of view
        // Fade in only within ~9° of the view center and inside a soft distance
        // band; multiply the two so edge-of-view or far titles vanish smoothly.
        const aimF = THREE.MathUtils.clamp((aim - 0.988) / (1 - 0.988), 0, 1);
        const distF = THREE.MathUtils.clamp(1 - (dist - 6) / 14, 0, 1);
        const op = aimF * distF * 0.72;
        labelRef.current.style.opacity = op.toFixed(3);
      }
    }
  });

  const color = overrideColor ?? COLORS[node.kind] ?? "#9ad0b0";
  const isMemory = MEMORY_KINDS.has(node.kind);
  // Family (PERSON) and heritage (ROOT) live underground; their names surface
  // when the camera tilts below the earth, so they carry a persistent label too.
  const isRootWorld = node.kind === "PERSON" || node.kind === "ROOT";
  const year = useMemo(() => {
    const d = new Date(node.createdAt);
    return Number.isNaN(d.getTime()) ? null : d.getFullYear();
  }, [node.createdAt]);

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
      <Geometry kind={node.kind} scale={scale} color={color} glow={justGrew || selected} categorized={!!overrideColor} leafTex={leafTex} seed={hash01(node.id, 9)} />
      {justGrew ? <GrowthBurst scale={scale} /> : null}

      {/* Bloom-on-touch: a warm glowing halo opens around the chosen memory. */}
      {selected ? (
        <mesh ref={haloRef}>
          <sphereGeometry args={[scale * 2.4, 24, 24]} />
          <meshBasicMaterial color="#ffe6b0" transparent opacity={0.16} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      ) : null}

      {/* A soft, always-present name + year floats beside each memory so the tree
          reads as real moments, not abstract shapes. It brightens on touch. */}
      {hovered || selected ? (
        <Html center distanceFactor={10} position={[0, scale + 0.6, 0]}>
          <div className="pointer-events-none select-none whitespace-nowrap rounded-full bg-black/75 px-3 py-1 font-serif text-xs text-parchment [text-shadow:0_1px_4px_rgba(0,0,0,0.9)]">
            {node.title}
            {year ? <span className="text-parchment/50"> · {year}</span> : null}
          </div>
        </Html>
      ) : isMemory || isRootWorld ? (
        <Html center distanceFactor={15} position={[0, scale + 0.5, 0]} zIndexRange={[10, 0]}>
          <div
            ref={labelRef}
            style={{ opacity: 0 }}
            className="pointer-events-none select-none whitespace-nowrap font-serif text-[11px] text-parchment/90 [text-shadow:0_1px_5px_rgba(0,0,0,0.95)]"
          >
            {node.title}
            {year ? <span className="text-parchment/50"> · {year}</span> : null}
          </div>
        </Html>
      ) : null}
    </group>
  );
}

function GrowthBurst({ scale }: { scale: number }) {
  const ring = useRef<THREE.Mesh>(null);
  const start = useRef<number | null>(null);
  useFrame((state) => {
    if (!ring.current) return;
    if (start.current === null) start.current = state.clock.elapsedTime;
    const age = state.clock.elapsedTime - start.current;
    const p = Math.min(age / 1.4, 1);
    const s = 0.3 + p * 3.4;
    ring.current.scale.set(s, s, s);
    (ring.current.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.7;
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
  categorized,
  leafTex,
  seed,
}: {
  kind: string;
  scale: number;
  color: string;
  glow: boolean;
  categorized?: boolean;
  leafTex: THREE.CanvasTexture;
  seed: number;
}) {
  const emissive = glow ? "#ffcf7a" : color;
  // Memory nodes glow softly so they stand out from decorative canopy leaves.
  // Categorized leaves glow a touch stronger so their branch color carries.
  const baseGlow = glow ? 0.7 : categorized ? 0.5 : 0.35;

  switch (kind) {
    case "SEED":
      return (
        <mesh castShadow>
          <sphereGeometry args={[scale, 16, 16]} />
          <meshStandardMaterial color={color} roughness={0.6} emissive={emissive} emissiveIntensity={glow ? 0.6 : 0} />
        </mesh>
      );
    case "LEAF":
      return (
        <mesh geometry={LEAF_MEMORY_GEOMETRY} scale={scale * 4} rotation={[-0.5, seed * Math.PI * 2, seed * 0.6 - 0.3]} castShadow>
          <meshStandardMaterial map={leafTex} alphaTest={0.4} side={THREE.DoubleSide} roughness={0.5} emissive={emissive} emissiveIntensity={baseGlow} emissiveMap={leafTex} />
        </mesh>
      );
    case "FLOWER":
      return <Flower scale={scale} color={color} glow={glow} />;
    case "FRUIT":
      return (
        <mesh castShadow>
          <sphereGeometry args={[scale * 1.2, 18, 18]} />
          <meshStandardMaterial color={color} roughness={0.3} metalness={0.05} emissive={emissive} emissiveIntensity={baseGlow} />
        </mesh>
      );
    case "PHOTO":
      return (
        <mesh castShadow>
          <boxGeometry args={[scale * 1.5, scale * 1.5, scale * 0.15]} />
          <meshStandardMaterial color={color} roughness={0.5} emissive={emissive} emissiveIntensity={baseGlow} />
        </mesh>
      );
    case "PERSON":
      // A family member: a luminous seed-orb nested in the roots — the seed of
      // their own tree, waiting to grow. Three layers give it depth: a glowing
      // core, an inner light shell, and a soft outer halo that reads through soil.
      return (
        <group>
          <mesh>
            <sphereGeometry args={[scale, 20, 20]} />
            <meshStandardMaterial
              color={color}
              roughness={0.28}
              emissive={emissive}
              emissiveIntensity={glow ? 1.5 : 1.15}
              toneMapped={false}
            />
          </mesh>
          {/* Inner light shell. */}
          <mesh>
            <sphereGeometry args={[scale * 1.28, 18, 18]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.3}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          {/* Soft outer halo so the node glows through the soil. */}
          <mesh>
            <sphereGeometry args={[scale * 2.0, 16, 16]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.12}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </group>
      );
    case "ROOT":
      // Heritage: a warm ember of ancestry among the roots. Gently glowing so it
      // reads as living history, with a soft halo through the soil.
      return (
        <group>
          <mesh>
            <sphereGeometry args={[scale, 16, 16]} />
            <meshStandardMaterial color={color} roughness={0.5} emissive={emissive} emissiveIntensity={0.7} />
          </mesh>
          <mesh>
            <sphereGeometry args={[scale * 1.7, 14, 14]} />
            <meshBasicMaterial color={color} transparent opacity={0.12} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
        </group>
      );
    default:
      // Every other memory kind reads as a glowing leaf — no diamonds.
      return (
        <mesh geometry={LEAF_MEMORY_GEOMETRY} scale={scale * 4} rotation={[-0.5, seed * Math.PI * 2, seed * 0.6 - 0.3]} castShadow>
          <meshStandardMaterial map={leafTex} alphaTest={0.4} side={THREE.DoubleSide} roughness={0.5} emissive={emissive} emissiveIntensity={baseGlow} emissiveMap={leafTex} />
        </mesh>
      );
  }
}

// A slightly stouter leaf silhouette for interactive memory leaves.
const LEAF_MEMORY_GEOMETRY = (() => {
  const s = new THREE.Shape();
  s.moveTo(0, -0.5);
  s.bezierCurveTo(0.42, -0.18, 0.34, 0.5, 0, 0.72);
  s.bezierCurveTo(-0.34, 0.5, -0.42, -0.18, 0, -0.5);
  const g = new THREE.ShapeGeometry(s, 14);
  g.center();
  return g;
})();

function Flower({ scale, color, glow }: { scale: number; color: string; glow: boolean }) {
  const petals = [0, 1, 2, 3, 4];
  return (
    <group>
      {petals.map((i) => {
        const a = (i / petals.length) * Math.PI * 2;
        return (
          <mesh key={i} geometry={LEAF_MEMORY_GEOMETRY} position={[Math.cos(a) * scale * 0.5, 0, Math.sin(a) * scale * 0.5]} rotation={[-Math.PI / 2, 0, a]} scale={scale * 1.8}>
            <meshStandardMaterial color={color} side={THREE.DoubleSide} roughness={0.5} emissive={glow ? "#ffcf7a" : color} emissiveIntensity={glow ? 0.6 : 0.3} />
          </mesh>
        );
      })}
      <mesh>
        <sphereGeometry args={[scale * 0.4, 12, 12]} />
        <meshStandardMaterial color="#f4c95d" emissive="#f4c95d" emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}
