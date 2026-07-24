"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import type { MaterialAsset } from "@/lib/forest/assets";

/**
 * Load a scanned PBR texture set and return the maps, configured for tiling and
 * correct color space. Suspenseful — always render inside an <AssetBoundary>.
 *
 * The keys of MaterialAsset.maps deliberately match three's material prop names
 * (map, normalMap, roughnessMap, ...), so the result can be spread straight
 * onto <meshStandardMaterial {...maps} />.
 */
export function usePbrTextures(asset: MaterialAsset): Record<string, THREE.Texture> {
  const urlMap = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(asset.maps)) if (v) out[k] = v;
    return out;
  }, [asset]);

  const textures = useTexture(urlMap) as unknown as Record<string, THREE.Texture>;

  useMemo(() => {
    for (const [key, tex] of Object.entries(textures)) {
      if (!tex) continue;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      if (asset.repeat) tex.repeat.set(asset.repeat[0], asset.repeat[1]);
      tex.anisotropy = 8;
      // Albedo is authored in sRGB; every data map (normal/roughness/ao/height)
      // must stay linear or lighting goes wrong.
      tex.colorSpace = key === "map" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex.needsUpdate = true;
    }
  }, [textures, asset]);

  return textures;
}

/** A ready-to-use standard material built from a scanned PBR set. */
export function PbrMaterial({ asset, ...props }: { asset: MaterialAsset } & Record<string, unknown>) {
  const maps = usePbrTextures(asset);
  return (
    <meshStandardMaterial
      {...maps}
      displacementScale={asset.displacementScale ?? 0}
      roughness={asset.roughness}
      metalness={asset.metalness}
      {...props}
    />
  );
}
