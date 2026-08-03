"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { brandImage, BRAND, type BrandImage } from "@/lib/brand";

/**
 * The cinematic entry experience — the slow crossfading journey up to the great
 * tree that lands EverRoot's emotional pitch.
 *
 * It runs in two modes:
 *  - "landing" (default): the marketing surface shown to logged-OUT visitors.
 *    It settles on the logo, the pitch, and the signup / login call-to-action.
 *  - "replay": the same journey played as an overlay INSIDE the forest — for a
 *    first visit and for the "Replay the opening" button. Instead of a signup
 *    CTA it settles on a warm welcome and then dismisses into the forest
 *    (via onComplete), so a signed-in person is never shown a signup button.
 *
 * The journey itself (frames + staged text) is identical in both modes so the
 * brand moment is consistent everywhere it appears.
 *
 * Design choices:
 *  - Auto-plays but is always SKIPPABLE so no one is trapped watching it.
 *  - Uses the existing brand stills (served from the CDN via brandImage), so it
 *    ships with no new assets and stays light on mobile.
 *  - Honors prefers-reduced-motion: the journey is skipped and the final frame
 *    is shown immediately (see globals.css .kb-frame overrides).
 */

interface Beat {
  /** Which brand still this beat sits on. */
  key: keyof typeof BRAND;
  /** The line of copy that fades in over the frame (empty on the arrival frame). */
  line: string;
}

// The narrative arc. Frames 0–3 carry a line of copy; the final frame (reveal)
// is the "arrival" that carries the logo + ending instead of a line.
const BEATS: Beat[] = [
  { key: "valleyVista", line: "Every life is a story worth keeping." },
  { key: "duskPath", line: "But memory fades. Voices go quiet." },
  { key: "valleyHero", line: "Preserve them —" },
  { key: "trunk", line: "— before they're gone." },
  { key: "reveal", line: "" },
];

const ARRIVAL = BEATS.length - 1; // index of the final frame
const HOLD_MS = 3200; // how long each narrative beat holds before advancing
const REPLAY_LINGER_MS = 3600; // how long the welcome holds before auto-dismiss
const FADE_MS = 1000; // overlay fade-out on dismiss (replay mode)

interface Props {
  /** "landing" = marketing page (signup CTA). "replay" = in-forest overlay. */
  mode?: "landing" | "replay";
  /** Personalizes the replay welcome ("Welcome home, {name}."). */
  displayName?: string;
  /** Replay mode only: called once the overlay should be dismissed. */
  onComplete?: () => void;
}

export default function LandingIntro({ mode = "landing", displayName, onComplete }: Props) {
  const isReplay = mode === "replay";
  const [index, setIndex] = useState(0);
  const [arrived, setArrived] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const done = useRef(false);

  // Respect reduced-motion: skip the journey, land on the final frame.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (reduce?.matches) {
      setIndex(ARRIVAL);
      setArrived(true);
    }
  }, []);

  // Auto-advance through the beats until we arrive at the final frame.
  useEffect(() => {
    if (arrived) return;
    if (index >= ARRIVAL) {
      setArrived(true);
      return;
    }
    timer.current = setTimeout(() => setIndex((i) => i + 1), HOLD_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [index, arrived]);

  // Replay mode: once we arrive, linger on the welcome, then dismiss.
  useEffect(() => {
    if (!isReplay || !arrived) return;
    const t = setTimeout(finish, REPLAY_LINGER_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReplay, arrived]);

  // Replay mode: fade the overlay out and hand control back to the forest.
  function finish() {
    if (done.current) return;
    done.current = true;
    if (timer.current) clearTimeout(timer.current);
    setLeaving(true);
    setTimeout(() => onComplete?.(), FADE_MS);
  }

  // Landing mode: "Enter" / skip jumps straight to the tree and the CTA.
  function enter() {
    if (timer.current) clearTimeout(timer.current);
    setIndex(ARRIVAL);
    setArrived(true);
  }

  const frames = useMemo(
    () => BEATS.map((b) => ({ ...b, img: BRAND[b.key] as BrandImage, url: brandImage(b.key) })),
    [],
  );

  const containerClass = isReplay
    ? "fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden px-6 text-center transition-opacity"
    : "relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 text-center";

  const welcomeName = displayName?.trim();

  return (
    <main
      className={containerClass}
      style={isReplay ? { opacity: leaving ? 0 : 1, transitionDuration: `${FADE_MS}ms` } : undefined}
    >
      {/* Stacked crossfading frames. Each drifts slowly (Ken Burns) so the still
          feels alive while it holds. Only the active frame is opaque. */}
      {frames.map((f, i) => (
        <div
          key={f.key}
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden transition-opacity duration-[1500ms] ease-in-out"
          style={{ opacity: i === index ? 1 : 0 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={f.url}
            alt={f.img.alt}
            className="kb-frame h-full w-full select-none object-cover"
            style={{
              objectPosition: f.img.focus,
              animation: `${i % 2 === 0 ? "kenBurnsIn" : "kenBurnsOut"} 16s ease-in-out infinite alternate`,
            }}
          />
        </div>
      ))}

      {/* Warm legibility scrim so text and buttons stay readable over the art. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 45%, rgba(6,16,10,0.28) 0%, rgba(6,16,10,0.60) 58%, rgba(6,16,10,0.88) 100%)",
        }}
      />

      {/* Narrative beat text (frames 0–3). Re-keyed per index so it re-animates. */}
      {!arrived && (
        <div className="relative z-10 flex max-w-3xl flex-col items-center">
          <p
            key={index}
            className="beat-rise max-w-xl font-serif text-2xl leading-snug text-parchment [text-shadow:0_2px_18px_rgba(0,0,0,0.75)] md:text-4xl"
            style={{ animation: "beatRise 1200ms ease-out both" }}
          >
            {frames[index].line}
          </p>
        </div>
      )}

      {/* Arrival. Landing → logo + pitch + signup CTA. Replay → warm welcome. */}
      {arrived && (
        <div
          className="cta-settle relative z-10 flex max-w-3xl flex-col items-center"
          style={{ animation: "ctaSettle 900ms ease-out both" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/everroot-logo-transparent.png"
            alt="EverRoot — the living legacy forest"
            className="mb-8 w-[320px] max-w-full drop-shadow-[0_4px_24px_rgba(0,0,0,0.7)] md:w-[420px]"
          />

          {isReplay ? (
            <>
              <p className="mb-10 max-w-xl font-serif text-2xl text-parchment [text-shadow:0_2px_16px_rgba(0,0,0,0.6)] md:text-3xl">
                Welcome home{welcomeName ? `, ${welcomeName}` : ""}.
              </p>
              <button
                type="button"
                onClick={finish}
                className="rounded-full bg-canopy px-8 py-3 font-sans text-base font-semibold text-white transition hover:bg-canopy-light"
              >
                Enter your forest &rarr;
              </button>
            </>
          ) : (
            <>
              <p className="mb-10 max-w-xl text-lg text-parchment/90 [text-shadow:0_2px_16px_rgba(0,0,0,0.6)]">
                The people you love won&apos;t be here forever. Capture their voice and
                their stories today — and grow a living legacy your grandchildren can
                walk through.
              </p>
              <div className="flex flex-col gap-4 sm:flex-row">
                <Link
                  href="/signup"
                  className="rounded-full bg-canopy px-8 py-3 font-sans text-base font-semibold text-white transition hover:bg-canopy-light"
                >
                  Plant your seed
                </Link>
                <Link
                  href="/login"
                  className="rounded-full border border-parchment/30 px-8 py-3 font-sans text-base font-semibold text-parchment transition hover:border-parchment/60"
                >
                  Return to your forest
                </Link>
              </div>
            </>
          )}
        </div>
      )}

      {/* Skip / Enter — always available so no one is trapped in the intro. */}
      {!arrived && (
        <button
          type="button"
          onClick={isReplay ? finish : enter}
          className="absolute right-5 top-5 z-20 rounded-full border border-parchment/25 bg-black/20 px-4 py-2 font-sans text-sm text-parchment/80 backdrop-blur-sm transition hover:border-parchment/50 hover:text-parchment pt-safe"
        >
          {isReplay ? "Skip \u203a" : "Enter the forest \u2192"}
        </button>
      )}

      {/* Progress dots — a quiet sense of how far the journey has come. */}
      {!arrived && (
        <div className="absolute bottom-8 left-1/2 z-20 flex -translate-x-1/2 gap-2">
          {BEATS.slice(0, ARRIVAL).map((_, i) => (
            <span
              key={i}
              className="h-1.5 rounded-full bg-parchment transition-all duration-500"
              style={{ width: i === index ? 24 : 8, opacity: i === index ? 0.9 : 0.35 }}
            />
          ))}
        </div>
      )}
    </main>
  );
}
