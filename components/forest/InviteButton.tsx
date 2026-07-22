"use client";

import { useState } from "react";
import { createInvite } from "@/app/actions/family";
import type { ForestNodeDTO } from "@/lib/forest/types";

// Shown in the detail panel when a family member (PERSON) is selected. Lets the
// user mint a shareable invite so that person can grow their own tree in the
// family forest.
export default function InviteButton({ person }: { person: ForestNodeDTO }) {
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Already joined — nothing to invite.
  if (person.linkedUserId) {
    return (
      <p className="mt-3 rounded-lg border border-canopy-light/30 bg-canopy/15 px-3 py-2 text-xs text-canopy-light">
        ✦ {person.title} has joined your family forest — their tree grows alongside yours.
      </p>
    );
  }

  async function handleInvite() {
    setLoading(true);
    setError(null);
    const res = await createInvite({ personNodeId: person.id });
    setLoading(false);
    if (!res.ok || !res.code) {
      setError(res.error ?? "Could not create an invite");
      return;
    }
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    setLink(`${origin}/signup?invite=${res.code}`);
  }

  async function handleCopy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the link is still selectable below */
    }
  }

  if (link) {
    return (
      <div className="mt-3">
        <p className="text-xs text-parchment/70">
          Share this link with {person.title}. When they sign up, their tree joins your family forest.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <input
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 rounded-lg border border-parchment/20 bg-black/30 px-3 py-1.5 text-xs text-parchment outline-none"
          />
          <button
            onClick={handleCopy}
            className="shrink-0 rounded-lg bg-canopy px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-canopy-light"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <button
        onClick={handleInvite}
        disabled={loading}
        className="rounded-full border border-canopy-light/50 bg-canopy/30 px-4 py-1.5 text-xs font-semibold text-parchment transition hover:border-canopy-light disabled:opacity-60"
      >
        {loading ? "Creating invite…" : `Invite ${person.title} to grow their own tree`}
      </button>
      {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
