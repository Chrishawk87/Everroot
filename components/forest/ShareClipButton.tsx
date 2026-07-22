"use client";

import { useState } from "react";
import type { ForestNodeDTO } from "@/lib/forest/types";

// Memory kinds that can become a shareable clip.
const CLIP_KINDS = new Set(["LEAF", "FLOWER", "FRUIT", "MEMORY_MOMENT", "PHOTO", "MEMORY"]);

export function isClipKind(kind: string): boolean {
  return CLIP_KINDS.has(kind);
}

// Shown in the memory detail panel — copies a shareable link to this memory's
// clip page, which the family forest can open.
export default function ShareClipButton({ node }: { node: ForestNodeDTO }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/clip/${node.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — open the clip so they can copy from the address bar */
      window.open(url, "_blank");
    }
  }

  return (
    <button
      onClick={share}
      className="mt-3 inline-flex items-center gap-2 rounded-full border border-canopy-light/50 bg-canopy/25 px-4 py-1.5 text-xs font-semibold text-parchment transition hover:border-canopy-light"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <line x1="8.6" y1="10.5" x2="15.4" y2="6.5" />
        <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
      </svg>
      {copied ? "Clip link copied!" : "Share this memory"}
    </button>
  );
}
