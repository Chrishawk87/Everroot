"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { openingVideo, openingPosterStart, openingPosterEnd } from "@/lib/brand";

/**
 * The cinematic entry experience — a single continuous descent from the dawn
 * clouds, down through the branches past the hanging lanterns and memories,
 * settling at the base of the great tree, where EverRoot's pitch lands.
 *
 * It runs in two modes:
 *  - "landing" (default): the marketing surface shown to logged-OUT visitors.
 *    It settles on the logo, the pitch, and the signup / login call-to-action.
 *  - "replay": the same descent played as an overlay INSIDE the forest — for a
 *    first visit and for the "Replay the opening" button. Instead of a signup
 *    CTA it settles on a warm welcome and then dismisses into the forest (via
 *    onComplete), so a signed-in person is never shown a signup button.
 *
 * The descent itself (a ~10s video authored in Higgsfield) plays once and holds
 * its final frame; the four warm lines fade through over it, then the logo +
 * ending settle in.
 *
 * Design choices:
 *  - Auto-plays (muted, inline) but is always SKIPPABLE so no one is trapped.
 *  - Honors prefers-reduced-motion: the video is skipped and the final still is
 *    shown immediately with the ending already settled.
 */

// The four lines that fade through over the descent — the same warm words as
// the original opening.
const LINES = [
  "Every life is a story worth keeping.",
  "The people we love. The moments that made us.",
  "Their voices. Their laughter. Their words.",
  "Keep them close, always.",
];

// When each line enters (ms), paced to the ~10s descent, and when the descent
// settles and the logo / ending appear.
const LINE_CUES = [700, 3000, 5400, 7700];
const ARRIVE_MS = 10200; // safety fallback if the video's onEnded never fires
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
  const [lineIndex, setLineIndex] = useState(-1); // -1 = no line showing yet
  const [arrived, setArrived] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [reduce, setReduce] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const done = useRef(false);

  // Respect reduced-motion: skip the descent, land on the settled final still.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (mq?.matches) {
      setReduce(true);
      setArrived(true);
    }
  }, []);

  // Drive the word beats + a safety arrival on a fixed schedule paced to the
  // descent. (The video's onEnded is the primary trigger for arrival.)
  useEffect(() => {
    if (reduce || arrived) return;
    const t = timers.current;
    LINE_CUES.forEach((cue, i) => t.push(setTimeout(() => setLineIndex(i), cue)));
    t.push(setTimeout(() => setArrived(true), ARRIVE_MS));
    return () => {
      t.forEach(clearTimeout);
      timers.current = [];
    };
  }, [reduce, arrived]);

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
    timers.current.forEach(clearTimeout);
    setLeaving(true);
    setTimeout(() => onComplete?.(), FADE_MS);
  }

  // "Enter" / skip jumps straight to the settled ending.
  function enter() {
    timers.current.forEach(clearTimeout);
    const v = videoRef.current;
    if (v) {
      try {
        v.pause();
      } catch {
        /* ignore */
      }
    }
    setArrived(true);
  }

  const containerClass = isReplay
    ? "fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden px-6 text-center transition-opacity"
    : "relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 text-center";

  const welcomeName = displayName?.trim();

  return (
    <main
      className={containerClass}
      style={isReplay ? { opacity: leaving ? 0 : 1, transitionDuration: `${FADE_MS}ms` } : undefined}
    >
      {/* Guaranteed still behind the video: if the video is slow or fails to
          load, the art still shows instead of a black screen. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={reduce ? openingPosterEnd() : openingPosterStart()}
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover"
        style={{ filter: "saturate(1.08) brightness(1.03) sepia(0.12)" }}
      />

      {/* The cinematic descent. Plays once, muted + inline, and holds its final
          frame (the base of the trunk) when it ends. Skipped for reduced-motion. */}
      {!reduce && (
        <video
          ref={videoRef}
          className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover"
          src={openingVideo()}
          poster={openingPosterStart()}
          autoPlay
          muted
          playsInline
          preload="auto"
          onEnded={() => setArrived(true)}
          style={{ filter: "saturate(1.08) brightness(1.03) sepia(0.12)" }}
        />
      )}

      {/* Golden wash — bathes the whole frame in warm, sunset/firelight tones. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(100% 85% at 50% 40%, rgba(255,186,102,0.24) 0%, rgba(255,150,64,0.11) 45%, rgba(60,28,10,0) 72%)",
          mixBlendMode: "overlay",
        }}
      />

      {/* Soft, warm legibility vignette. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 92% at 50% 45%, rgba(26,14,6,0.06) 0%, rgba(22,12,5,0.42) 58%, rgba(16,9,4,0.76) 100%)",
        }}
      />

      {/* Narrative beat text. Re-keyed per line so it re-animates as it enters. */}
      {!arrived && lineIndex >= 0 && (
        <div className="relative z-10 flex max-w-3xl flex-col items-center">
          <p
            key={lineIndex}
            className="beat-rise max-w-xl font-serif text-2xl leading-snug text-parchment [text-shadow:0_2px_18px_rgba(0,0,0,0.75)] md:text-4xl"
            style={{ animation: "beatRise 1200ms ease-out both" }}
          >
            {LINES[lineIndex]}
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
                Gather the voices and stories of the people you love, in their own
                words — and grow a living legacy your family can walk through for
                generations to come.
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
          {LINES.map((_, i) => (
            <span
              key={i}
              className="h-1.5 rounded-full bg-parchment transition-all duration-500"
              style={{ width: i === lineIndex ? 24 : 8, opacity: i === lineIndex ? 0.9 : 0.35 }}
            />
          ))}
        </div>
      )}
    </main>
  );
}
