# Hero Tree Recipe

The production recipe for the single most important asset in EverRoot: **the Hero Tree**. This is the emotional centerpiece, the primary interface, and the living representation of a life. It is authored once as a professional base asset, then dynamically modified by the app forever after.

**EverRoot Rule:** Code builds systems. Artists build beauty. The Hero Tree *originates* in SpeedTree — never grown procedurally in Three.js. The app reshapes it from the memory graph; it does not invent it.

---

## Design target (locked from vision)

A colossal ancient sacred tree: **oak × mythic Tree of Life × living neural network**.

- Enormous, powerfully buttressed trunk; deep textured bark with visible growth rings and healed scars.
- Strong upward primary limbs that fan into an ever-finer lattice of branches (veins / synapses) holding a vast embracing canopy.
- Golden **memory veins** glowing beneath the bark, brighter toward the branch tips; warm particles drifting upward through the trunk.
- Massive roots gripping the earth (and diving underground for the ancestor network).
- Golden-hour palette: warm earth tones, deep greens, gold, muted blue sky, never oversaturated. Volumetric god rays, mist, pollen, fireflies. Subsurface-scattering translucent leaves.
- Emotional bar: awe + peace; the viewer feels small; it feels like a sacred place, not software.

---

## Stage 1 — Concept (Higgsfield) → APPROVAL GATE

**Owner:** Art Team (Higgsfield, `nano_banana_pro`).
**Goal:** Lock the tree's silhouette, proportions, bark/vein language, and mood *before* any 3D work.

Deliverables:
1. Three hero silhouette variations at golden hour (DONE — awaiting Chris's pick).
2. Once a direction is chosen: a 3-view turnaround-style set (front / three-quarter / canopy-up) of the chosen form for the modeler to match.
3. Two macro detail plates: (a) bark with growth rings + healed scar + glowing memory vein; (b) canopy leaf cluster showing subsurface scattering + a few category-tinted leaves.
4. Upscale the final selects to 4K as the modeling reference sheet.

**Gate:** Chris approves one hero direction. Nothing proceeds to SpeedTree until this is signed off.

---

## Stage 2 — Base tree authoring (SpeedTree)

**Owner:** Vegetation Team (SpeedTree 10).
**Goal:** Build the approved concept as a real, controllable production tree.

Parameter intent (to match the approved concept):
- **Trunk:** single dominant leader, heavy buttressed base flaring into surface roots; high girth; slow taper; deep bark displacement. Author with generous radius so the app can scale girth by memory count without looking thin.
- **Primary limbs:** 5–8 strong, upward-reaching scaffold branches — these map to EverRoot's category branches (Life Advice, Recipes, Family Traditions, Beliefs, Favorite Stories, Biggest Wins, Biggest Mistakes, Messages for Future Generations). Keep them individually addressable / named so the app can target them.
- **Secondary + fine branches:** dense recursive fan into a synapse-like lattice; enough resolution to read as a neural canopy at hero distance.
- **Canopy:** broad, embracing, rounded crown; leaf cards authored as an atlas (see Stage 3). Leave density controllable — the app fills the canopy as memories accrue.
- **Wind:** author SpeedTree wind zones (trunk / branch / leaf tiers) so the runtime gets natural, independent branch sway rather than a single uniform wobble.
- **LODs:** generate LOD0–LOD3 + a billboard/impostor for distant Family-Forest instances.

Exports (SpeedTree → Blender): **FBX** (geometry + wind rig + LODs), **material set (.stmat / textures)**, leaf **atlas**. Growth/animation as **Alembic** if needed.

---

## Stage 3 — Conform gate (Blender)

**Owner:** 3D Team (Blender). This is the quality gate every asset passes through.

- Clean mesh: remove n-gons, fix normals, weld seams, sane scale (1 unit = 1 m), origin at trunk base, +Y up conform for glTF.
- **UV + materials:** bake bark PBR (albedo/normal/roughness/AO). Add a **memory-vein emissive mask** channel painted along the trunk and major limbs so the runtime can drive vein glow. Add a **category mask / vertex group per primary limb** so the app can tint each branch's leaves independently.
- **Leaves:** confirm the atlas cards carry an alpha + translucency/SSS-friendly setup.
- **LOD verification:** check LOD transitions are clean; decimate where SpeedTree over-tessellated.
- **Optimize for web:** target triangle budgets (hero LOD0 ~150–300k tris; impostor near-zero), texture atlasing.
- **Export:** **glTF/GLB** with **Draco or Meshopt** compression; textures as **KTX2 / Basis**. One canonical `hero_tree.glb` + LOD chain.

**Conform checklist (must pass):** correct scale & orientation · no loose/degenerate geometry · named primary limbs preserved · vein emissive mask present · per-category leaf mask present · KTX2 textures · Draco/Meshopt compressed · loads under web budget.

---

## Stage 4 — Runtime handoff (Three.js / R3F)

**Owner:** Software Team (Claude Code) — resumes *only after the three heroes are approved*.

- Load `hero_tree.glb` via the existing asset loader; replace the current procedural trunk/branch geometry as the tree's **origin**.
- Keep EverRoot's "grows inward" data→form layer, but re-scope it: instead of *generating* the tree, it **modifies the authored base** — scale trunk girth by memory count, extend/tilt named limbs by category weight, unfurl leaves on the atlas as memories are added, deepen roots per relationship, add scars per "Biggest Mistakes", bend the silhouette per milestone. Deterministic + cumulative, exactly as specified.
- Drive the **memory-vein emissive** via the baked mask + a shader uniform (pulse when a memory is added).
- Tint canopy leaves per **category mask**; keep SSS on leaves.
- Feed SpeedTree wind tiers into the runtime wind so branch sway stays independent.
- Distant Family-Forest trees use the **impostor/billboard** LOD, instanced.

### UE5 (offline only)
Bake Lumen/GI lighting into the hero tree's textures and generate octahedral impostors for the Family-Forest crowd. Also render the cinematic launch/marketing trailer. **Never** runtime UE5 in the browser.

---

## Acceptance criteria — the Hero Tree is "approved" when

1. The silhouette reads instantly as *one colossal ancient sacred tree* — awe + you feel small — at golden hour.
2. Bark shows real depth, growth rings, and at least one healed scar; memory veins glow convincingly beneath it.
3. The eight category primary limbs are present, individually addressable, and can be tinted independently.
4. Canopy is broad and embracing with SSS leaves; the crown holds together as a neural lattice at hero distance.
5. It loads inside the web budget on mobile at 30fps with LODs/impostors working.
6. The app can visibly modify it from memory data (girth, limb growth, leaf unfurl, veins pulse) without breaking the silhouette.

Only when Chris signs off on the Hero Tree **and** the Hero Environment **and** the Hero Camera does application implementation resume.
