# Blender Conform Brief — EverRoot Hero Tree

The quality gate every asset passes through. This is **Stage 3** of `HERO_TREE_RECIPE.md`: take the SpeedTree export (Stage 2, see `SPEEDTREE_AUTHORING_BRIEF.md`) and turn it into the one canonical, web-ready `hero_tree.glb` the app loads. Nothing ships to the runtime until it passes the checklist at the bottom.

**Two jobs no one else can do here:** (1) bake the **memory-vein emissive mask** so the app can make the veins glow and pulse, and (2) bake the **per-category leaf mask** so the app can tint each of the 8 category limbs independently. These two masks are the bridge between the authored art and EverRoot's "grows inward" data layer. If they're wrong, the app can't drive the tree.

**Input from SpeedTree:** FBX (geometry + wind rig + LOD0–3 + impostor, 8 named primary limbs), material set (.stmat + bark/leaf textures), leaf atlas.

---

## 1. Import & sanity

- Import the FBX. Confirm the **8 primary limbs survived as named objects/vertex groups** (`limb_life_advice`, `limb_recipes`, `limb_family_traditions`, `limb_beliefs`, `limb_favorite_stories`, `limb_biggest_wins`, `limb_biggest_mistakes`, `limb_messages_future`). If names were flattened on export, re-establish them now — the app targets these names.
- Confirm the LOD chain + impostor all imported and are grouped/labeled `LOD0`…`LOD3`, `impostor`.

## 2. Scale & orientation (conform for glTF)

- **1 unit = 1 meter.** Verify the tree is ~25–30 m tall.
- **Origin at trunk base**, centered, sitting on Z=0 before axis conform.
- **Conform +Y up** for glTF (Blender is Z-up; apply the correct up-axis conversion so the exported glb is Y-up). Apply all transforms (rotation + scale → identity) so nothing ships with baked-in non-uniform transforms.

## 3. Mesh cleanup

- Remove n-gons (triangulate or convert to quads/tris cleanly), fix flipped normals (recalculate outside), weld coincident/seam vertices, delete loose/degenerate geometry and stray verts.
- Check the leaf cards are single- or double-sided as intended and normals face correctly for SSS.
- Remove any SpeedTree helper/empty objects not needed at runtime.

## 4. UVs & bark PBR bake

- Confirm bark UVs are clean, non-overlapping along the trunk and major limbs (the emissive mask paints into this space).
- Bake bark **PBR set**: albedo, normal, roughness, AO. Keep to one bark material set.

## 5. Memory-vein emissive mask (REQUIRED)

- Add a dedicated **emissive mask channel/texture** painted along the trunk and out the primary limbs, following the concept's vein paths — **brighter toward the branch tips**, faint at the base.
- This is a mask the runtime multiplies by a glow color + animated uniform (veins pulse when a memory is added). Author it as a grayscale mask in its own UV-consistent texture, not baked-in bright emission.
- Make sure vein paths run up all 8 primary limbs so any category can glow.

## 6. Per-category leaf mask (REQUIRED)

- Give the app a way to tint each category limb's leaves independently. Provide **either** a per-primary-limb **vertex group / vertex-color ID** on the canopy geometry, **or** a category-ID mask texture — whichever the runtime shader expects (default: vertex-color category ID, 8 IDs matching the limb order).
- Verify every canopy leaf cluster is assigned to exactly one category ID, matching the limb it grows from.

## 7. Leaves — SSS setup

- Confirm the leaf atlas cards carry a working **alpha** and a **translucency / subsurface-scattering-friendly** material setup (the runtime keeps SSS on leaves for the backlit golden-hour look).
- Keep leaf material to the single atlas material.

## 8. LOD verification & optimization

- Check **LOD0→LOD3** transitions are clean (no popping); decimate anywhere SpeedTree over-tessellated.
- **Triangle budget:** LOD0 hero **150k–300k tris** (hard cap 300k); impostor near-zero.
- **Texture atlasing:** consolidate maps; keep material/texture count minimal.
- Confirm the wind rig data is preserved / exportable so R3F can drive the trunk/branch/leaf wind tiers.

## 9. Export — the canonical asset

- Export **glTF/GLB** with **Draco or Meshopt** compression.
- Textures as **KTX2 / Basis**.
- One canonical **`hero_tree.glb`** containing the LOD chain; impostor either in the same file or as a sibling as the runtime prefers.
- Verify it **loads under the web budget** — target 30fps on mobile with LODs/impostor working.

---

## Conform checklist (must ALL pass before handoff to R3F)

- [ ] Correct scale (1u=1m, ~25–30 m) & orientation (+Y up, transforms applied).
- [ ] No loose / degenerate geometry; normals correct; seams welded.
- [ ] **8 primary limbs preserved and correctly named.**
- [ ] Bark PBR baked (albedo/normal/roughness/AO), clean non-overlapping UVs.
- [ ] **Memory-vein emissive mask present**, brighter toward tips, running up all 8 limbs.
- [ ] **Per-category leaf mask present** (8 IDs), every canopy cluster assigned to its limb's category.
- [ ] Leaf atlas alpha + SSS/translucency setup confirmed.
- [ ] LOD0–3 + impostor verified; clean transitions; LOD0 ≤ 300k tris.
- [ ] Wind rig preserved/exportable (trunk/branch/leaf tiers).
- [ ] KTX2 textures; Draco/Meshopt compressed; one canonical `hero_tree.glb`.
- [ ] Loads within web budget at 30fps on mobile.

Once this passes, Stage 4 (R3F runtime) loads `hero_tree.glb` as the tree's **origin**, re-scopes the "grows inward" layer to *modify* the authored base (girth by memory count, extend/tilt named limbs by category weight, unfurl leaves, add scars, deepen roots), drives the vein emissive via the baked mask + shader uniform, tints leaves via the category mask, and feeds the wind tiers into the runtime wind — plus the 6-beat opening camera in `HERO_CAMERA_SPEC.md`.
