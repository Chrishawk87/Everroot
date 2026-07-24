# EverRoot — Production Asset Install Guide

The forest scene no longer builds its environment out of code-generated shapes.
Every surface — the ground, the rocks, the ferns, the flowers, the background
trees, the water, the sky light — is now a **real, production-quality asset**
loaded at runtime.

The app already knows the exact filename and folder it expects for each asset
(that list lives in `lib/forest/assets.ts`). Your job here is simply to **get
each file and drop it into the matching folder** under `public/assets/`. As
soon as a file is in place, it shows up in the scene. Until then, that piece of
the world is simply left out — you'll never see a gray placeholder blob.

You do **not** have to install everything at once. Start with the "Prove it
works" set below (one HDRI + one ground texture), push, and confirm the scene
lights up. Then add the rest whenever you like.

---

## How this works (30-second version)

- All files go under the `public/assets/` folder in the project.
- The names and folders below are **exact**. `albedo.jpg` must be named
  `albedo.jpg`, in that exact folder. If a name is off, that asset won't load.
- After adding files, commit and push from your Mac (same as always), and
  Railway will rebuild. Then reload `/forest` to see them.

---

## Where to get the assets (all premium-grade, mostly free)

You only need these three sites. All produce the photoreal scanned look we
picked.

1. **Poly Haven** — https://polyhaven.com — CC0 (free, no attribution). Best
   source for the **HDRIs** (sky/lighting) and several **textures**. Download
   HDRIs as `.hdr`.
2. **ambientCG** — https://ambientcg.com — CC0 (free). Great for the **PBR
   texture sets** (forest floor, bark, water). Download the "JPG" zip; it
   contains the color/normal/roughness/AO/height maps you need.
3. **Quixel Megascans via Fab** — https://www.fab.com — free with an Epic
   account. Best source for the **3D models** (rocks, ferns, grass, flowers,
   cliffs) and scanned trees. Download models as **glTF/GLB**. Sketchfab
   (https://sketchfab.com, filter to "Downloadable") is a good backup for
   stylized trees if you prefer a less photoreal, more Pixar look.

> Tip: when a texture download gives you files with long names like
> `Ground037_2K_Color.jpg`, you just **rename** them to the short names below
> (`albedo.jpg`, `normal.jpg`, …) and drop them in the right folder.

---

## PROVE IT WORKS FIRST (do this set, then push)

Install just these two things first so we can confirm the pipeline live before
you spend time on the rest:

1. **Sky light** — Poly Haven, search a warm sunset/golden-hour HDRI (e.g.
   "kloppenheim" or "spruit sunrise"). Download the `.hdr`, rename to
   `golden_hour.hdr`, place at:

   ```
   public/assets/hdri/golden_hour.hdr
   ```

2. **Ground** — ambientCG, search "Ground" or "Forest floor". Download the JPG
   set and place the five maps (renamed) at:

   ```
   public/assets/materials/forest_floor/albedo.jpg     ← the "Color" map
   public/assets/materials/forest_floor/normal.jpg     ← the "NormalGL" map
   public/assets/materials/forest_floor/roughness.jpg  ← the "Roughness" map
   public/assets/materials/forest_floor/ao.jpg         ← the "AmbientOcclusion" map
   public/assets/materials/forest_floor/height.jpg     ← the "Displacement" map
   ```

Commit + push, reload `/forest`. You should see a real textured ground with
relief, lit by a warm sky. That confirms everything downstream works.

---

## FULL SHOPPING LIST

Each block below is: what to search for → what to name the file(s) → exactly
where to put them.

### HDRIs (sky + lighting) — Poly Haven, `.hdr`

| Get | Rename to | Put at |
|-----|-----------|--------|
| A warm golden-hour / sunset sky | `golden_hour.hdr` | `public/assets/hdri/golden_hour.hdr` |
| A soft overcast sky (optional alt mood) | `overcast.hdr` | `public/assets/hdri/overcast.hdr` |

### PBR texture sets — ambientCG / Poly Haven, JPG maps

For each material, download the set and rename the maps. Not every set includes
every map — install what you have; missing optional maps are fine.

**Forest floor** → folder `public/assets/materials/forest_floor/`
- `albedo.jpg` (Color) · `normal.jpg` (NormalGL) · `roughness.jpg` (Roughness)
  · `ao.jpg` (AmbientOcclusion) · `height.jpg` (Displacement)

**Bark** (search "Bark") → folder `public/assets/materials/bark/`
- `albedo.jpg` · `normal.jpg` · `roughness.jpg` · `ao.jpg`

**Leaf** (search "Leaf" — you want a single-leaf cutout **with transparency**;
these are PNGs, not JPGs) → folder `public/assets/materials/leaf/`
- `albedo.png` · `normal.png` · `roughness.png`

**Water** (search "Water") → folder `public/assets/materials/water/`
- `albedo.jpg` · `normal.jpg`

### 3D models — Fab / Megascans / Sketchfab, `.glb`

Download each as a **.glb** file (single-file glTF). Rename to the exact name
and place in the listed folder.

**Background trees** (3 different ones so the forest looks varied)
- `public/assets/models/trees/tree_a.glb`
- `public/assets/models/trees/tree_b.glb`
- `public/assets/models/trees/tree_c.glb`

**Rocks**
- `public/assets/models/rocks/rock_a.glb`
- `public/assets/models/rocks/rock_b.glb`

**Plants**
- `public/assets/models/plants/fern.glb`
- `public/assets/models/plants/grass_clump.glb`
- `public/assets/models/plants/flower_a.glb`
- `public/assets/models/plants/flower_b.glb`

**Distant mountain / cliff** (one big scanned rock, scaled up in the scene)
- `public/assets/models/terrain/mountain.glb`

---

## Checklist of every expected file

```
public/assets/
  hdri/
    golden_hour.hdr        (required to light the scene)
    overcast.hdr           (optional)
  materials/
    forest_floor/  albedo.jpg  normal.jpg  roughness.jpg  ao.jpg  height.jpg
    bark/          albedo.jpg  normal.jpg  roughness.jpg  ao.jpg
    leaf/          albedo.png  normal.png  roughness.png
    water/         albedo.jpg  normal.jpg
  models/
    trees/    tree_a.glb  tree_b.glb  tree_c.glb
    rocks/    rock_a.glb  rock_b.glb
    plants/   fern.glb  grass_clump.glb  flower_a.glb  flower_b.glb
    terrain/  mountain.glb
```

---

## Notes

- **The central life-tree is NOT in this list on purpose.** That tree is grown
  from your memory graph (the "grows inward" system) — it's the product, not a
  downloaded model. Once the `bark` and `leaf` texture sets above are installed,
  a follow-up change will dress that tree in them so it matches the photoreal
  world around it.
- **Want a different look for one asset?** Just replace the file — no code
  change needed. Same filename, same folder.
- **Adding a brand-new kind of asset** (say, a bench or a bird) is the only case
  that needs a code line added to `lib/forest/assets.ts`. Everything listed here
  is already wired.
- **File size / performance:** prefer 2K textures (not 4K/8K) and Draco- or
  Meshopt-compressed GLBs where the download offers it — the scene loads many at
  once, so this keeps `/forest` fast.
