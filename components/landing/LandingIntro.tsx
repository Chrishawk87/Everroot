"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  openingVideo,
  openingVideoTail,
  openingPosterStart,
  openingPosterEnd,
  openingVoice,
} from "@/lib/brand";

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
 * The descent itself (a ~10s video authored in Higgsfield) is slowed to breathe
 * with the narration and holds its final frame; a warm, emotional voiceover
 * (Imogen, ~18.6s) reads the lines while they fade through over it, then the
 * logo + ending settle in.
 *
 * Because browsers block sound without a user gesture, the landing surface waits
 * on a gentle "Begin" tap before it starts the video + voiceover together. The
 * replay overlay is reached from a click inside the forest, so it starts itself.
 *
 * Design choices:
 *  - Plays inline WITH sound (after the Begin gesture); always SKIPPABLE so no
 *    one is trapped.
 *  - Honors prefers-reduced-motion: the video + voiceover are skipped and the
 *    final still is shown immediately with the ending already settled.
 */

// The narration, broken into the beats that fade through on screen — paced to
// the ~19.6s voiceover (Arthur, "reverence") so each line lingers as it is spoken.
const LINES = [
  "Every life leaves a story.",
  "Every voice carries a legacy.",
  "Every memory deserves to live on.",
  "Preserve the people you love \u2014",
  "their stories, their laughter, their wisdom, and the moments that made them unforgettable.",
  "Keep them close, for generations to come.",
];

// When each line enters (ms), timed to where it falls in the spoken voiceover,
// and the safety arrival if the audio's onEnded never fires.
const LINE_CUES = [500, 2800, 5300, 8200, 10800, 16400];
const ARRIVE_MS = 20200; // safety fallback if the audio's onEnded never fires
// The descent clip is now authored at 15s, so it plays at native speed (1.0x)
// for perfectly smooth frames; a slow continuous push-in carries the eye through
// the settle while the closing line is spoken, easing to rest as the VO ends.
const DRIFT_MS = 20000; // duration of the gentle push-in (covers the whole intro)
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
  const [started, setStarted] = useState(false); // has the descent + VO begun?
  const [arrived, setArrived] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [reduce, setReduce] = useState(false);
  const [drift, setDrift] = useState(false); // slow push-in once begun
  const [tailOn, setTailOn] = useState(false); // continuation clip visible/playing
  const videoRef = useRef<HTMLVideoElement>(null);
  const tailVideoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const done = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const padStopRef = useRef<(() => void) | null>(null);

  // A soft, gentle melody under the voiceover — a slow music-box lullaby in C
  // major, so the voice has something warm to echo off of. Built with Web Audio
  // (no licensed track); the Begin gesture unlocks the AudioContext. Each note
  // is a soft, bell-like pluck that decays and rings through a warm delay, so
  // it reads as a tender melody, never a sustained drone. It stays well under
  // the voice.
  function startPad() {
    if (audioCtxRef.current) return;
    try {
      const Ctx =
        window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;

      const master = ctx.createGain();
      master.gain.setValueAtTime(0.0001, ctx.currentTime);
      master.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 3);
      master.connect(ctx.destination);

      // A round, mellow tone bus — soft low-pass so nothing is brittle.
      const tone = ctx.createBiquadFilter();
      tone.type = "lowpass";
      tone.frequency.value = 1400;
      tone.Q.value = 0.4;
      tone.connect(master);

      // A gentle echo so each note lingers — "something to echo off of".
      const delay = ctx.createDelay();
      delay.delayTime.value = 0.36;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.3;
      const wet = ctx.createGain();
      wet.gain.value = 0.35;
      tone.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(wet);
      wet.connect(master);

      // A soft, bell-like plucked note that swells fast and decays away.
      const voice = (freq: number, when: number) => {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, when);
        g.gain.exponentialRampToValueAtTime(0.1, when + 0.08);
        g.gain.exponentialRampToValueAtTime(0.0001, when + 2.4);
        o.connect(g);
        g.connect(tone);
        o.start(when);
        o.stop(when + 2.6);
      };

      // A slow, tender lullaby phrase (C major), spaced so it breathes.
      const C4 = 261.63,
        D4 = 293.66,
        E4 = 329.63,
        G4 = 392.0,
        A4 = 440.0,
        C5 = 523.25;
      const phrase: { t: number; f: number }[] = [
        { t: 0.0, f: E4 },
        { t: 1.6, f: G4 },
        { t: 3.2, f: C5 },
        { t: 5.0, f: A4 },
        { t: 6.8, f: G4 },
        { t: 8.4, f: E4 },
        { t: 10.0, f: D4 },
        { t: 11.6, f: C4 },
      ];
      const PHRASE_LEN = 13.4;
      const schedulePhrase = (base: number) => phrase.forEach((n) => voice(n.f, base + n.t));

      schedulePhrase(ctx.currentTime + 0.3);
      let nextBase = ctx.currentTime + 0.3 + PHRASE_LEN;
      const loop = setInterval(() => {
        if (!audioCtxRef.current) return;
        schedulePhrase(nextBase);
        nextBase += PHRASE_LEN;
      }, PHRASE_LEN * 1000);

      padStopRef.current = () => {
        clearInterval(loop);
        const now = ctx.currentTime;
        try {
          master.gain.cancelScheduledValues(now);
          master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now);
          master.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);
        } catch {
          /* ignore */
        }
        setTimeout(() => {
          try {
            ctx.close();
          } catch {
            /* ignore */
          }
        }, 1800);
        audioCtxRef.current = null;
        padStopRef.current = null;
      };
    } catch {
      /* Web Audio unavailable; the voiceover still plays on its own. */
    }
  }

  function stopPad() {
    padStopRef.current?.();
  }

  // Start the descent + voiceover together. Requires a user gesture on the
  // landing surface (browsers block sound otherwise); replay is reached from a
  // click so it can start itself on mount.
  function startExperience() {
    if (started || reduce || arrived) return;
    setStarted(true);
    setDrift(true); // begin the slow push-in
    const v = videoRef.current;
    if (v) {
      v.playbackRate = 1; // authored at 15s, so native speed = smooth frames
      v.play().catch(() => {
        /* ignore autoplay rejection */
      });
    }
    const a = audioRef.current;
    if (a) {
      a.play().catch(() => {
        /* sound may be blocked; the visual descent still plays */
      });
    }
    startPad();
  }

  // Respect reduced-motion: skip the descent, land on the settled final still.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (mq?.matches) {
      setReduce(true);
      setArrived(true);
    }
  }, []);

  // Replay mode is reached from a click, so it may start itself right away.
  useEffect(() => {
    if (isReplay && !reduce) startExperience();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReplay, reduce]);

  // Once started, drive the word beats + a safety arrival on a schedule timed to
  // the voiceover. (The audio's onEnded is the primary trigger for arrival.)
  useEffect(() => {
    if (!started || reduce || arrived) return;
    const t = timers.current;
    LINE_CUES.forEach((cue, i) => t.push(setTimeout(() => setLineIndex(i), cue)));
    t.push(setTimeout(() => setArrived(true), ARRIVE_MS));
    return () => {
      t.forEach(clearTimeout);
      timers.current = [];
    };
  }, [started, reduce, arrived]);

  // Fade the warm pad out the moment we arrive (audio ended or skipped).
  useEffect(() => {
    if (arrived) stopPad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrived]);

  // Safety: stop the pad if the component unmounts mid-descent.
  useEffect(() => {
    return () => stopPad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // "Enter" / skip jumps straight to the settled ending — stopping video + VO.
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
    const a = audioRef.current;
    if (a) {
      try {
        a.pause();
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
      {/* All the moving imagery lives inside one wrapper that carries a single,
          continuous slow push-in (the "drift"). Swapping videos inside it never
          disturbs the zoom, so the descent → settle reads as one unbroken move. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          transform: drift ? "scale(1.06)" : "scale(1)",
          transition: `transform ${DRIFT_MS}ms ease-out`,
        }}
      >
        {/* Guaranteed still behind the video: if the video is slow or fails to
            load, the art still shows instead of a black screen. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={reduce ? openingPosterEnd() : openingPosterStart()}
          alt=""
          className="absolute inset-0 h-full w-full select-none object-cover"
          style={{ filter: "saturate(1.08) brightness(1.03) sepia(0.12)" }}
        />

        {/* The cinematic descent (native 15s, plays once at 1.0x for smooth
            frames). When it ends, the continuation clip fades in seamlessly so
            the motion carries through the whole voiceover. Reduced-motion skips
            all of it and shows the settled still. */}
        {!reduce && (
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full select-none object-cover"
            src={openingVideo()}
            poster={openingPosterStart()}
            muted
            playsInline
            preload="auto"
            onEnded={() => {
              const t = tailVideoRef.current;
              if (t) t.play().catch(() => {});
              setTailOn(true);
            }}
            style={{ filter: "saturate(1.08) brightness(1.03) sepia(0.12)" }}
          />
        )}

        {/* The continuation — a gentle settle at the base of the trunk. Its first
            frame equals the descent's last frame, so fading it in over the held
            frame is seamless. It carries motion through the tail of the read. */}
        {!reduce && (
          <video
            ref={tailVideoRef}
            className="absolute inset-0 h-full w-full select-none object-cover"
            src={openingVideoTail()}
            muted
            playsInline
            preload="auto"
            style={{
              filter: "saturate(1.08) brightness(1.03) sepia(0.12)",
              opacity: tailOn ? 1 : 0,
              transition: "opacity 600ms ease-in-out",
            }}
          />
        )}
      </div>

      {/* The emotional voiceover — read over the descent. Started together with
          the video (needs a user gesture for sound), and its ending is the
          primary trigger for the settled arrival. Skipped for reduced-motion. */}
      {!reduce && (
        <audio
          ref={audioRef}
          src={openingVoice()}
          preload="auto"
          onEnded={() => setArrived(true)}
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

      {/* The gentle "Begin" gate (landing only). A browser won't play sound
          without a user gesture, so the descent + voiceover wait on this tap. */}
      {!isReplay && !started && !reduce && !arrived && (
        <div
          className="cta-settle relative z-10 flex max-w-3xl flex-col items-center"
          style={{ animation: "ctaSettle 900ms ease-out both" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/everroot-logo-transparent.png"
            alt="EverRoot — the living legacy forest"
            className="mb-8 w-[300px] max-w-full drop-shadow-[0_4px_24px_rgba(0,0,0,0.7)] md:w-[380px]"
          />
          <button
            type="button"
            onClick={startExperience}
            className="rounded-full bg-canopy px-10 py-3.5 font-sans text-base font-semibold text-white transition hover:bg-canopy-light"
          >
            Begin
          </button>
          <p className="mt-4 font-sans text-xs uppercase tracking-[0.2em] text-parchment/60">
            Best with sound on
          </p>
        </div>
      )}

      {/* Skip / Enter — available once begun so no one is trapped in the intro. */}
      {started && !arrived && (
        <button
          type="button"
          onClick={isReplay ? finish : enter}
          className="absolute right-5 top-5 z-20 rounded-full border border-parchment/25 bg-black/20 px-4 py-2 font-sans text-sm text-parchment/80 backdrop-blur-sm transition hover:border-parchment/50 hover:text-parchment pt-safe"
        >
          {isReplay ? "Skip \u203a" : "Enter the forest \u2192"}
        </button>
      )}

      {/* Progress dots — a quiet sense of how far the journey has come. */}
      {started && !arrived && (
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
