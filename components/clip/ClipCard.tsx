"use client";

import { useState } from "react";
import Link from "next/link";
import type { MemoryClip } from "@/lib/forest/queries";

const KIND_LABEL: Record<string, string> = {
  LEAF: "Story",
  FLOWER: "Milestone",
  FRUIT: "Life advice",
  MEMORY_MOMENT: "Memory moment",
  PHOTO: "Photograph",
  MEMORY: "Memory",
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return "";
  }
}

export default function ClipCard({ clip }: { clip: MemoryClip }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  }

  const kindLabel = KIND_LABEL[clip.kind] ?? "Memory";

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-12">
      <div className="overflow-hidden rounded-3xl border border-parchment/15 bg-black/40 shadow-2xl backdrop-blur">
        {/* Header band */}
        <div className="bg-gradient-to-r from-canopy/70 to-canopy-light/60 px-8 py-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/everroot-logo-transparent.png" alt="EverRoot" className="mb-3 h-9 w-auto" />
          <p className="font-sans text-xs uppercase tracking-widest text-white/80">{kindLabel}</p>
          <h1 className="mt-1 font-serif text-3xl leading-tight text-white">{clip.title}</h1>
        </div>

        <div className="px-8 py-7 font-sans">
          {/* Teller + date */}
          <p className="text-sm text-parchment/70">
            Told by <span className="text-parchment">{clip.tellerName}</span>
            {clip.tellerRole ? <span className="text-parchment/50"> · {clip.tellerRole}</span> : null}
            {clip.epoch ? (
              <span className="text-parchment/50"> · {clip.epoch.replace(/_/g, " ").toLowerCase()}</span>
            ) : null}
          </p>
          <p className="mt-0.5 text-xs text-parchment/40">{formatDate(clip.createdAt)}</p>

          {/* The prompting question, if this grew from an interview. */}
          {clip.question ? (
            <p className="mt-5 border-l-2 border-canopy-light/50 pl-4 font-serif text-lg italic text-parchment/85">
              “{clip.question}”
            </p>
          ) : null}

          {/* Voice */}
          {clip.recordingId ? (
            <div className="mt-5">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio controls preload="metadata" className="w-full" src={`/api/recordings/${clip.recordingId}`} />
            </div>
          ) : null}

          {/* The story */}
          {clip.transcript ? (
            <p className="mt-6 whitespace-pre-wrap text-[15px] leading-relaxed text-parchment/90">{clip.transcript}</p>
          ) : clip.summary ? (
            <p className="mt-6 whitespace-pre-wrap text-[15px] leading-relaxed text-parchment/90">{clip.summary}</p>
          ) : (
            <p className="mt-6 text-sm text-parchment/50">This memory hasn’t been written down yet.</p>
          )}

          {/* Actions */}
          <div className="mt-8 flex items-center justify-between border-t border-parchment/10 pt-5">
            <Link href="/forest" className="text-sm text-canopy-light hover:underline">
              ← Back to the forest
            </Link>
            <button
              onClick={copyLink}
              className="rounded-full bg-canopy px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-canopy-light"
            >
              {copied ? "Link copied!" : "Copy share link"}
            </button>
          </div>
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-parchment/40">
        A living memory from a Legacy Forest on EverRoot.
      </p>
    </main>
  );
}
