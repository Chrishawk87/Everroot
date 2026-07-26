# SpeedTree Authoring Brief — EverRoot Hero Tree

Build spec for the single most important asset in EverRoot: **the Hero Tree**, authored in **SpeedTree 10** from the approved concept **"B — the Neural Lattice."** This is Stage 2 of `HERO_TREE_RECIPE.md`. The output of this stage feeds the Blender conform gate (Stage 3), which produces the `hero_tree.glb` the app loads.

**EverRoot Rule:** the tree *originates* here in SpeedTree. It is never grown procedurally in Three.js. The app later *modifies* this authored base from the memory graph — so everything below must be built generous, clean, and individually addressable.

**Concept reference (4K):** `hf_20260726_194114_264b99d7-…png` (Tree B hero), plus turnaround + detail plates listed in `HERO_HANDOFF.md`. Match that silhouette, bark/vein language, and mood.

---

## 0. Acceptance target (what "right" looks like)

One colossal ancient sacred tree — **oak × mythic Tree of Life × living neural network**. Powerfully buttressed trunk dividing into strong upward primary limbs that fan into an ever-finer synapse/vein-like lattice holding a vast embracing canopy. Golden memory-veins read beneath the bark, brighter toward the tips. Deep bark with growth rings + healed scars. Golden-hour palette, never oversaturated. The viewer should feel small; it should feel sacred, not botanical.

---

## 1. Scale & orientation (set this first — everything depends on it)

- **Real-world scale:** 1 SpeedTree unit = 1 meter. Author the tree at roughly **25–30 m tall** so it reads as colossal against a ~1.8 m human reference. Keep a human-scale figure in the viewport the whole time.
- **Origin:** at the base of the trunk, centered, sitting on the ground plane (Y = 0).
- **Up axis:** author Z-up (SpeedTree default); the Blender stage will conform to +Y up for glTF. Don't pre-rotate.
- **Facing:** hero three-quarter readable from the concept's camera-left front.

## 2. Trunk

- Single dominant leader — **one clear trunk**, not co-dominant forks low down.
- **Heavy buttressed base**: strong flare into 5–7 surface-root buttresses gripping the ground. This is a signature of the concept — make it pronounced.
- **High girth, slow taper.** Author the radius generous — the app scales trunk girth *up* with memory count, so it must not look thin at the authored baseline. Err thick.
- **Deep bark displacement**: furrowed, ancient, with visible growth-ring banding and at least one prominent **healed scar** (a smooth grown-over wound). These map to the app's "Biggest Mistakes" scars later, so leave clean surface area where more can be added.
- Trunk should carry the memory-vein emissive later (Blender bakes the mask) — keep bark UVs clean and non-overlapping along the trunk and major limbs.

## 3. Primary limbs — the 8 category branches (critical, addressable)

Author exactly **8 strong upward-reaching scaffold limbs** off the upper trunk. Each maps to one EverRoot memory category and **must be individually named and separable** so the app can target, tilt, extend, and tint each one:

| Limb name | Category | Authoring note |
|-----------|----------|----------------|
| `limb_life_advice` | Life Advice | upper tier, prominent |
| `limb_recipes` | Recipes | mid tier (bears fruit later) |
| `limb_family_traditions` | Family Traditions | warm, broad |
| `limb_beliefs` | Beliefs | upper, reaching |
| `limb_favorite_stories` | Favorite Stories | mid, welcoming (birds visit later) |
| `limb_biggest_wins` | Biggest Wins | **tallest**, reaches highest |
| `limb_biggest_mistakes` | Biggest Mistakes | carries the healed-scar bark |
| `limb_messages_future` | Messages for Future Generations | positioned to read from far — brightest glow later |

Requirements:
- Name each as a separate branch generator / node so it survives export as a **named object or vertex group**.
- Keep them **balanced but not symmetrical** — the tree must read as organic. `limb_biggest_wins` is the visibly tallest; `limb_messages_future` sits where it's silhouette-visible from a distance.
- Author each limb with generous length and a slight built-in reserve so the app can *extend* it by category weight without snapping.

## 4. Secondary + fine branches — the neural lattice

- From each primary limb, a **dense recursive fan** of secondary → tertiary → fine branches, splitting into a synapse-like web.
- Enough resolution that at hero distance the crown reads as an **intricate neural lattice**, not a blobby canopy. This is the concept's defining feature — push branch density and fine forking harder than a normal oak.
- Keep fine-branch generation driven by SpeedTree nodes so LOD decimation is clean.

## 5. Canopy / leaves

- Broad, embracing, rounded crown — **sheltering-arms** shape overall.
- **Leaf cards authored as an atlas** (see §7). Shape: oak-like broadleaf, translucent for subsurface scattering.
- **Density must be controllable** — author at a "mature but not maxed" fill. The app fills the canopy as memories accrue and unfurls leaves over time, so leave clear headroom.
- Include subtle per-cluster variation; avoid a uniform green wall. A restrained few clusters can carry category-tint hints, but keep the base natural — the app drives category color via the Blender leaf mask, not baked-in.

## 6. Wind

Author SpeedTree wind in **independent tiers** so the runtime gets natural, layered motion rather than one uniform wobble:

- **Trunk tier:** very subtle low-frequency sway.
- **Branch tier:** primary/secondary limbs move independently, slightly more.
- **Leaf tier:** high-frequency flutter on the canopy.

Export the wind rig with the FBX so R3F can drive it. Tune for a gentle golden-hour breeze — nothing storm-like.

## 7. LODs & atlas

- Generate **LOD0 → LOD3** plus a **billboard/impostor** for distant Family-Forest instances.
- LOD0 is the hero (see triangle budget in §8). LOD chain should decimate fine branches and reduce leaf-card counts gracefully; transitions must not pop.
- **Leaf atlas:** single atlas texture with alpha; author leaves as cards referencing it. Confirm the atlas leaves have room for an alpha + translucency setup (Blender adds SSS).

## 8. Budgets (web-first — this ships in a browser at 30fps on mobile)

- **LOD0 hero:** target **150k–300k triangles** total. Do not exceed 300k.
- Impostor: near-zero geometry (billboard).
- Textures authored to atlas cleanly; final compression (KTX2/Basis) happens in Blender. Keep source textures ≤ 2K per map where possible.
- Keep material count low — one bark material set + one leaf atlas material is the goal.

## 9. Exports (SpeedTree → Blender)

Hand the Blender team:
- **FBX** — geometry + wind rig + full LOD chain, with the **8 primary limbs preserved as named objects/groups**.
- **Material set** — `.stmat` + all bark/leaf textures (albedo, normal, roughness, AO; leaf alpha).
- **Leaf atlas** texture.
- **Alembic** — only if authoring a growth/animation pass; otherwise skip.

Confirm on export: correct 1u=1m scale, origin at trunk base, named limbs intact, atlas linked.

---

## Handoff checklist (Stage 2 → Stage 3 is done when…)

- [ ] Silhouette matches Tree B at hero distance — colossal, buttressed, neural-lattice crown.
- [ ] Single leader; pronounced buttressed root flare.
- [ ] Trunk girth authored generous (won't look thin at baseline); ≥1 healed scar; clean bark UVs.
- [ ] Exactly 8 primary limbs, correctly **named** per the table, balanced-not-symmetrical, `biggest_wins` tallest, `messages_future` silhouette-visible.
- [ ] Fine branches read as a neural lattice; density controllable.
- [ ] Canopy authored with fill headroom; leaves as an alpha atlas, SSS-ready.
- [ ] Wind authored in trunk/branch/leaf tiers.
- [ ] LOD0–3 + impostor; LOD0 ≤ 300k tris; clean transitions.
- [ ] FBX + material set + atlas exported; scale/origin/named-limbs verified.

Once this passes, Blender (Stage 3) bakes the memory-vein emissive mask + per-category leaf mask and exports the compressed `hero_tree.glb` the app loads.
