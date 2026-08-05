"use client";

import { useState } from "react";

/**
 * A read-only value (a gift link or code) with a one-tap "Copy" button. Used on
 * the gift success page so the buyer can grab the link/code to share.
 */
export default function CopyField({ value, mono = false }: { value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the value is visible for manual copy. */
    }
  }

  return (
    <div className="flex items-stretch gap-2">
      <input
        readOnly
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        className={`min-w-0 flex-1 rounded-lg border border-parchment/20 bg-black/30 px-3 py-2.5 text-sm text-parchment outline-none ${
          mono ? "font-mono tracking-wide" : ""
        }`}
      />
      <button
        type="button"
        onClick={copy}
        className="shrink-0 rounded-lg bg-canopy px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-canopy-light"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
