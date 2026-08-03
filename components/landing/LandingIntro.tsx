"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { brandImage, BRAND, type BrandImage } from "@/lib/brand";

/**
 * The cinematic entry experience — a visitor's very first moment with EverRoot.
 *
 * It auto-plays a slow crossfading journey through the hero stills: a distant
 * valley, the path in, arriving at the great tree, looking up its trunk, and
 * the crown revealed. Staged text lands the emotional throughline — capture
 * your family's stories BEFORE they're gone — and the journey settles onto the
 * logo and call-to-action over the final frame.
 *
 * Design choices:
 *  - Auto-play but always SKIPPABLE ("Enter" jumps straight to the CTA) so no
 *    one is ever trapped watching it.
 *  - Uses the existing brand stills (served from the CDN via brandImage), so it
 *    ships with no new assets and stays light on mobile.
 *  - Honors prefers-reduced-motion: the journey is skipped and the final frame
 *    with the CTA is shown immediately (see globals.css .kb-frame overrides).
 */

interface Beat {
  /** Which brand still this beat sits on. */
  key: keyof typeof BRAND;
  /** The line of copy that fades in over the frame (empty on the arrival frame). */
  line: string;
}

// The narrative arc. Frames 0–3 carry a line of copy; the final frame (reveal)
// is the "arrival" that carries the logo + CTA instead of a line.
const BEATS: Beat[] = [
  { key: "valleyVista", line: "Every life is a story worth keeping." },
  { key: "duskPath", line: "But memory fades. Voices go quiet." },
  { key: "valleyHero", line: "Preserve them —" },
  { key: "trunk", line: "— before they're gone." },
  { key: "reveal", line: "" },
];

const ARRIVAL = BEATS.length - 1; // index of the final CTA frame
const HOLD_MS = 3200; // how long each narrative beat holds before advancing

export default function LandingIntro() {
  const [index, setIndex] = useState(0);
  const [arrived, setArrived] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Respect reduced-motion: skip the journey, land on the CTA immediately.
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

  // "Enter" / skip — jump straight to the tree and the CTA.
  function enter() {
    if (timer.current) clearTimeout(timer.current);
    setIndex(ARRIVAL);
    setArrived(true);
  }

  const frames = useMemo(
    () => BEATS.map((b) => ({ ...b, img: BRAND[b.key] as BrandImage, url: brandImage(b.key) })),
    [],
  );

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 text-center">
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

      {/* Arrival: logo + message + call-to-action over the final frame. */}
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
        </div>
      )}

      {/* Skip / Enter — always available so no one is trapped in the intro. */}
      {!arrived && (
        <button
          type="button"
          onClick={enter}
          className="absolute right-5 top-5 z-20 rounded-full border border-parchment/25 bg-black/20 px-4 py-2 font-sans text-sm text-parchment/80 backdrop-blur-sm transition hover:border-parchment/50 hover:text-parchment pt-safe"
        >
          Enter the forest &rarr;
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
