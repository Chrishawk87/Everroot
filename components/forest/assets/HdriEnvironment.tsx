"use client";

import { Environment } from "@react-three/drei";
import { HDRI } from "@/lib/forest/assets";

/**
 * Image-based lighting from a real HDRI. This is what makes every PBR surface
 * in the scene read as photographed rather than shaded — reflections, ambient
 * bounce and highlight shape all come from the captured sky.
 *
 * Lighting-only by default (the existing procedural <Sky> stays as the visible
 * dome); pass `background` to also show the HDRI as the sky. Must be rendered
 * inside an <AssetBoundary> so a missing file degrades to no-op.
 */
export function HdriEnvironment({
  hdriId = "golden_hour",
  background = false,
  intensity,
}: {
  hdriId?: keyof typeof HDRI;
  background?: boolean;
  intensity?: number;
}) {
  const hdri = HDRI[hdriId];
  if (!hdri) return null;
  return (
    <Environment
      files={hdri.url}
      background={background}
      environmentIntensity={intensity}
    />
  );
}
