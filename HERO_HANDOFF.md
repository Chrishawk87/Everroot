# EverRoot — Approved Hero Reference Pack (4K)

The locked concept-art references for the three approved heroes, for handoff to the SpeedTree / Blender / R3F / UE5 teams. All three heroes are **approved (2026-07-26)** — Tree ✔ B · Environment ✔ C · Camera ✔ — so the production gate is lifted.

**Where the files live:** the 4K PNGs are in Chris's Higgsfield workspace (each is a completed upscale job; open it in the Higgsfield widget to download the full-res PNG). They can't be auto-copied into this folder from here — remote fetch into the local workspace isn't available — so this manifest is the index. Companion docs in this folder: `HERO_TREE_RECIPE.md`, `HERO_CAMERA_SPEC.md`.

Higgsfield asset base URL: `https://d8j0ntlcm91z4.cloudfront.net/user_3GCNPmBJ5PVXiIZ2LrnYgU4wRKx/`

---

## Hero #1 — The Tree ("B — Neural Lattice")  → feeds SpeedTree base authoring

| Asset | Res | Upscale job ID | Source job ID | File |
|-------|-----|----------------|---------------|------|
| Hero establishing (three-quarter, golden hour) | 4K (4096×2751) | `264b99d7-f0c5-4f35-83e0-cf48e50deb40` | `fa318fda-2111-46a5-8685-8336c0c7204e` | `hf_20260726_194114_264b99d7-f0c5-4f35-83e0-cf48e50deb40.png` |
| Turnaround — front elevation | 1K | — | `4e660a53-43d2-4e38-a91a-881dfb9f483e` | `hf_20260726_180157_4e660a53-…png` |
| Turnaround — canopy-up | 1K | — | `ec7cc9c1-e63f-4879-8ab6-43ec7203c7bc` | `hf_20260726_180601_ec7cc9c1-…png` |
| Detail plate — bark (growth rings + healed scar + vein) | 1K | — | `9c87e926-18e2-492d-8269-819c82247950` | `hf_20260726_181227_9c87e926-…png` |
| Detail plate — canopy leaf SSS + category tints | 1K | — | `f424375b-dd8b-4bb2-8697-0617616408b3` | `hf_20260726_181254_f424375b-…png` |

## Hero #2 — The Environment ("C — The Approach")  → feeds Quixel/Megascans + Blender world build

| Asset | Res | Upscale job ID | Source job ID | File |
|-------|-----|----------------|---------------|------|
| Hero establishing (bridge→path→plaza, golden-to-dusk) | 4K (4096×2751) | `75ffcdfb-9644-4395-8134-6f32f8d38b65` | `3dfa9490-73c5-41bf-abf4-3f5bf23d8aca` | `hf_20260726_194142_75ffcdfb-9644-4395-8134-6f32f8d38b65.png` |
| Detail plate — Legacy Plaza stonework + roots | 1K | — | `63feae95-af56-4cc9-8576-78cb2ae8041d` | `hf_20260726_185745_63feae95-…png` |
| Detail plate — wooden bridge + glowing stream | 1K | — | `4676a228-5159-4990-aa51-157addd3d0c1` | `hf_20260726_185808_4676a228-…png` |
| Detail plate — ground-cover / scatter kit | 1K | — | `505373f1-d1de-4039-ae52-c5d946685b6f` | `hf_20260726_190010_505373f1-…png` |

## Hero #3 — The Camera (6-beat opening move, 4K)  → feeds R3F runtime camera + UE5 trailer

Spec: `HERO_CAMERA_SPEC.md`. All frames 16:9, 4096×2294.

| Frame | Beat | Upscale job ID | Source job ID | File |
|-------|------|----------------|---------------|------|
| 1 | The Threshold | `497aeb87-3fa5-42c4-a21d-a7e760a670a0` | `ec7322f8-a01b-4e98-8633-43b38532e4b8` | `hf_20260726_193112_497aeb87-…png` |
| 2 | The Glide | `059c1a2e-553e-460f-99b7-ec561e8bf761` | `03efbc22-0e30-44a1-b28c-1fe1982d07d5` | `hf_20260726_193920_059c1a2e-…png` |
| 3 | The Rise | `34d0e7a8-a735-4844-a808-3b0bcc76f28f` | `ba536294-e421-4dd1-a615-0466176d90d9` | `hf_20260726_193943_34d0e7a8-…png` |
| 4 | Ignition | `8a8c916d-9ee9-40ef-bc36-3673bdb30e46` | `0a06ba1e-b48c-4826-9066-708f4af701b4` | `hf_20260726_194359_8a8c916d-…png` |
| 5 | Awe | `9cbcaef9-6f94-4f65-8ccb-da861912c7e5` | `2766ee37-539f-48df-995b-a8270a4ede94` | `hf_20260726_194523_9cbcaef9-…png` |
| 6 | Home | `0a36346c-8b61-4fc4-85f8-ee2001e056de` | `b5d153f6-2849-4241-b788-a756b555d4f2` | `hf_20260726_194045_0a36346c-…png` |

---

## Next in the pipeline (gate lifted)

1. **SpeedTree** — author the Hero Tree base from the Tree B references (named category limbs, wind tiers, LOD0–3 + impostor).
2. **Blender conform** — clean, bake bark PBR + memory-vein emissive mask + per-category leaf mask, export compressed `hero_tree.glb`.
3. **R3F runtime** — load the glb, re-scope the "grows inward" layer to modify the authored base, wire the 6-beat opening camera (see spec) with vein-ignition synced to beat 4.
