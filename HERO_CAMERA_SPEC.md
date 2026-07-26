# Hero Camera Spec

The opening cinematic move of EverRoot — the first thing every visitor sees. Companion to `HERO_TREE_RECIPE.md` and the approved Hero Environment ("C — The Approach"). This is the single source of truth for both the **R3F runtime opening camera** and the **UE5 marketing trailer**; they must match beat-for-beat.

**Approved by Chris 2026-07-26.** This completes the 3-hero gate (Tree ✔ B · Environment ✔ C · Camera ✔). Application implementation may proceed.

---

## Design intent (locked)

One unbroken, elegant drone-style move — **never a cut, never a snap, never a teleport**. The viewer approaches a glowing sacred monument at the golden-hour-to-blue-dusk transition, the tree "wakes" as its memory-veins ignite, and the shot resolves into the hero framing the whole experience lives in. Emotional arc: **invitation → momentum → reverence → awe → peace/home.**

Total duration **~28 seconds**, eased in and out at both ends so it feels like a held breath, not a camera rig. Motion never fully stops until the final settle; something in frame (fireflies, pollen, mist, drifting light) is always alive.

Palette and atmosphere per the locked visual language: warm earth tones, deep greens, gold, deepening muted blue; volumetric god rays, mist, fireflies, floating pollen; nothing oversaturated.

---

## The six beats

| # | Beat | Lens | Move | Timing | What sells it |
|---|------|------|------|--------|---------------|
| 1 | **The Threshold** | 24mm wide | Very low, near-static hover at the foot of the wooden bridge over the glowing stream; deep focus | 0–4s | Foreground planks + mossy posts sharp; tree small/distant up the path. Establishes scale and invites entry. |
| 2 | **The Glide** | 35mm | Low forward tracking along the winding stone path, bridge falling behind | 4–9s | Path is the leading line straight to the plaza; pollen and fireflies stream past camera; god rays rake frame. Builds momentum. |
| 3 | **The Rise** | 35–40mm | Crane begins lifting at the plaza base | 9–14s | Massive roots breaking up through carved plaza stone fill the lower frame; trunk starts to tower. Viewer feels small. |
| 4 | **Ignition** | 35mm, tilting up | Push in close to the trunk as veins surge | 14–18s | The emotional turn — golden memory-veins beneath the bark light up and stream upward; a healed scar catches the glow. The tree comes alive. |
| 5 | **Awe** | 24mm wide | Boom up + tilt into the canopy | 18–23s | Primary limbs fan into the synapse-like lattice spread across the sky; luminous SSS crown overhead; god rays burst through gaps. Overwhelming scale. |
| 6 | **Home** | 50mm | Ease back and settle into resolved three-quarter hero framing | 23–28s | The whole tree on its plaza glowing like a lighthouse of memory at blue dusk; bridge, stream, and fogged mountains layered fore/mid/background. Awe resolves to peace. **This is the frame the experience rests in.** |

**Lens arc:** 24 → 35 → 35–40 → 35 → 24 → 50mm.
**Move arc:** low hover → forward glide → crane up → push in → boom up → settle back.

Storyboard reference frames (4K) live in `hero_handoff/camera/` — one PNG per beat, numbered `frame_1`…`frame_6`.

---

## Easing & feel

- Global ease-in from a dead-slow start (beat 1) and ease-out into the final hold (beat 6); interior beats cross-blend so there is no visible "stop" between moves.
- Speed peaks gently during beats 2–3 (the approach), slows through beat 4 (ignition) for weight, lifts through beat 5, and decelerates into beat 6.
- Handheld-free: this is a crane/drone feel, smooth and deliberate. No shake, no whip.
- Keep atmosphere in constant motion the entire time — fireflies, pollen, mist, drifting memory-lights.

---

## Runtime notes (R3F)

- Implement as a single spline/keyframe camera path with 6 keyed poses (position + target + FOV) matching the beats above; drive with an eased clock, not per-frame lerps that can stutter.
- FOV animates with the lens arc (24→35→…→50mm equivalents). Convert focal lengths to vertical FOV at the runtime aspect.
- Sync **beat 4 ignition** to the Hero Tree's memory-vein emissive uniform — the vein glow ramps up as the camera pushes in, so the "wake" reads as camera-triggered.
- Fires once on first load; offer a "replay opening" affordance. Never re-trigger on navigation.
- Respect `prefers-reduced-motion`: fall back to a gentle slow push from roughly beat 5→6 framing instead of the full move.
- Target the same 30fps mobile budget as the Hero Tree; the move must hold up with LODs/impostors active.

## Trailer notes (UE5, offline)

- Same 6 beats, same timing, rendered with Lumen/GI baked per the Hero Tree recipe.
- Free to extend durations slightly and add a title card on the beat-6 hold ("lighthouse of memory" framing).
- This is marketing only — never a browser runtime.

---

## Acceptance criteria — the Hero Camera is "done" when

1. The move is one unbroken ~28s take with no visible cut, snap, or stop until the final settle.
2. All six beats read in order with the lens/move arc above, eased in and out.
3. Beat 4's vein ignition is synced to the tree's emissive glow so the tree visibly "wakes."
4. Atmosphere (fireflies/pollen/mist/god rays) stays alive across the whole move.
5. It resolves into the exact beat-6 three-quarter hero framing.
6. Runs within the mobile frame budget and honors reduced-motion.
