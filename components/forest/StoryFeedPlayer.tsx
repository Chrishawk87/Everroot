"use client";

import { useEffect, useRef, useState } from "react";

interface Episode {
  recordingId: string;
  nodeId: string;
  title: string;
  question: string | null;
  epoch: string | null;
  mimeType: string;
  durationMs: number;
  createdAt: string;
}

interface Feed {
  ownerId: string;
  tellerName: string;
  tellerRole: string | null;
  episodes: Episode[];
  totalDurationMs: number;
  canListen: boolean;
}

// mm:ss
function fmt(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}

// Best-guess file extension for a saved recording.
function extFor(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) return "m4a";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("wav")) return "wav";
  return "webm";
}

function downloadHref(ep: Episode, tellerName: string, n: number): string {
  const name = `${tellerName} - ${String(n).padStart(2, "0")} ${ep.title}.${extFor(ep.mimeType)}`;
  return `/api/recordings/${ep.recordingId}?download=${encodeURIComponent(name)}`;
}

// Trigger the browser's download for a single episode.
function saveEpisode(ep: Episode, tellerName: string, n: number) {
  const a = document.createElement("a");
  a.href = downloadHref(ep, tellerName, n);
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Listens to a person's whole spoken story inside the forest — every recording
 * they've made, in order, as one auto-advancing audio feed. Family can also
 * download any memory (or the whole story) to keep or share as a file.
 *
 * Renders its own trigger button; the player opens as an overlay.
 */
export default function StoryFeedPlayer({
  ownerId,
  ownerName,
  isSelf = false,
}: {
  ownerId: string;
  ownerName: string;
  isSelf?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [feed, setFeed] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(false);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Load the feed the first time the player is opened.
  useEffect(() => {
    if (!open || feed || loading) return;
    setLoading(true);
    fetch(`/api/story/${ownerId}`)
      .then((r) => (r.ok ? (r.json() as Promise<Feed>) : null))
      .then((f) => setFeed(f))
      .catch(() => setFeed(null))
      .finally(() => setLoading(false));
  }, [open, ownerId, feed, loading]);

  const episodes = feed?.episodes ?? [];
  const current = episodes[index] ?? null;
  const whose = isSelf ? "your" : `${ownerName}'s`;

  function play(i: number) {
    const el = audioRef.current;
    const ep = episodes[i];
    if (!el || !ep) return;
    setIndex(i);
    el.src = `/api/recordings/${ep.recordingId}`;
    el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }

  function toggle() {
    const el = audioRef.current;
    if (!el || !current) return;
    if (!el.src) {
      play(index);
      return;
    }
    if (el.paused) {
      el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      el.pause();
      setPlaying(false);
    }
  }

  function onEnded() {
    if (index < episodes.length - 1) play(index + 1);
    else setPlaying(false);
  }

  function close() {
    audioRef.current?.pause();
    setPlaying(false);
    setOpen(false);
  }

  // Save every episode as its own file, one after another.
  function saveAll() {
    if (!feed) return;
    episodes.forEach((ep, i) => {
      setTimeout(() => saveEpisode(ep, feed.tellerName, i + 1), i * 400);
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full border border-fruit/40 bg-black/50 px-4 py-1.5 font-sans text-sm text-parchment transition hover:border-fruit/70 hover:brightness-110"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" className="text-fruit">
          <path d="M8 5v14l11-7z" />
        </svg>
        Listen to {whose} story
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 font-sans backdrop-blur-sm">
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-parchment/15 bg-gradient-to-b from-[#1a2417] to-[#0d130b] shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-parchment/10 px-6 py-5">
              <div>
                <p className="text-xs uppercase tracking-widest text-canopy-light">The story of</p>
                <h2 className="font-serif text-2xl text-parchment">{feed?.tellerName ?? ownerName}</h2>
                {feed && feed.canListen ? (
                  <p className="mt-1 text-xs text-parchment/50">
                    {episodes.length} {episodes.length === 1 ? "memory" : "memories"} · {fmt(feed.totalDurationMs)}
                  </p>
                ) : null}
              </div>
              <button onClick={close} className="text-parchment/50 transition hover:text-parchment" aria-label="Close">
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5">
              {loading ? (
                <p className="py-8 text-center text-sm text-parchment/50">Gathering the story…</p>
              ) : !feed || !feed.canListen ? (
                <p className="py-8 text-center text-sm text-parchment/60">
                  This story is private to {ownerName} and their family.
                </p>
              ) : episodes.length === 0 ? (
                <p className="py-8 text-center text-sm text-parchment/60">
                  {isSelf ? "You haven't" : `${ownerName} hasn't`} recorded any memories yet.
                </p>
              ) : (
                <>
                  {/* Now playing */}
                  {current ? (
                    <div className="mb-4 rounded-2xl border border-parchment/10 bg-black/30 p-4">
                      {current.question ? (
                        <p className="text-xs italic text-parchment/50">“{current.question}”</p>
                      ) : null}
                      <p className="mt-1 font-serif text-lg text-parchment">{current.title}</p>
                      {current.epoch ? (
                        <p className="mt-0.5 text-xs text-parchment/40">{current.epoch.replace(/_/g, " ")}</p>
                      ) : null}
                      <div className="mt-3 flex items-center gap-3">
                        <button
                          onClick={toggle}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-fruit text-black transition hover:brightness-110"
                          aria-label={playing ? "Pause" : "Play"}
                        >
                          {playing ? (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                              <rect x="6" y="5" width="4" height="14" rx="1" />
                              <rect x="14" y="5" width="4" height="14" rx="1" />
                            </svg>
                          ) : (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          )}
                        </button>
                        <span className="text-xs text-parchment/50">
                          Memory {index + 1} of {episodes.length} · {fmt(current.durationMs)}
                        </span>
                      </div>
                    </div>
                  ) : null}

                  {/* Episode list */}
                  <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                    {episodes.map((ep, i) => (
                      <div
                        key={ep.recordingId}
                        className={`flex items-center gap-2 rounded-xl px-3 py-2 transition ${
                          i === index ? "bg-canopy/30" : "hover:bg-white/5"
                        }`}
                      >
                        <button onClick={() => play(i)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                          <span className="w-5 shrink-0 text-right text-xs text-parchment/40">{i + 1}</span>
                          <span className="min-w-0 flex-1 truncate text-sm text-parchment/85">{ep.title}</span>
                          <span className="shrink-0 text-xs text-parchment/40">{fmt(ep.durationMs)}</span>
                        </button>
                        <a
                          href={downloadHref(ep, feed.tellerName, i + 1)}
                          download
                          onClick={(e) => e.stopPropagation()}
                          className="shrink-0 text-parchment/40 transition hover:text-fruit"
                          aria-label={`Download ${ep.title}`}
                          title="Download this memory"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 3v12" />
                            <path d="m7 12 5 5 5-5" />
                            <path d="M5 21h14" />
                          </svg>
                        </a>
                      </div>
                    ))}
                  </div>

                  {/* Download whole story */}
                  <button
                    onClick={saveAll}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-parchment/20 bg-black/30 px-4 py-2 text-sm text-parchment/80 transition hover:border-parchment/50 hover:text-parchment"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3v12" />
                      <path d="m7 12 5 5 5-5" />
                      <path d="M5 21h14" />
                    </svg>
                    Download the whole story
                  </button>
                </>
              )}
            </div>

            <audio ref={audioRef} onEnded={onEnded} className="hidden" />
          </div>
        </div>
      ) : null}
    </>
  );
}
