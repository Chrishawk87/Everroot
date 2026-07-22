"use client";

import { useCallback, useEffect, useState } from "react";
import { createCapsule } from "@/app/actions/capsules";

interface Capsule {
  id: string;
  title: string;
  recipient: string | null;
  unlockAt: string;
  sealed: boolean;
  message: string | null;
  createdAt: string;
}

interface Feed {
  ownerId: string;
  ownerName: string;
  capsules: Capsule[];
  canView: boolean;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

// Tomorrow, as yyyy-mm-dd, for the date input's minimum.
function tomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Time capsules for one tree — messages sealed until a future date. Anyone with
 * access sees sealed capsules (title, who it's for, unlock date) but not their
 * contents until the date passes. The owner can seal new ones.
 */
export default function CapsulePanel({
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
  const [opened, setOpened] = useState<string | null>(null); // which unlocked capsule is expanded
  const [creating, setCreating] = useState(false);

  // form
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [recipient, setRecipient] = useState("");
  const [message, setMessage] = useState("");
  const [unlockDate, setUnlockDate] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/capsules/${ownerId}`)
      .then((r) => (r.ok ? (r.json() as Promise<Feed>) : null))
      .then((f) => setFeed(f))
      .catch(() => setFeed(null))
      .finally(() => setLoading(false));
  }, [ownerId]);

  useEffect(() => {
    if (open && !feed && !loading) load();
  }, [open, feed, loading, load]);

  const capsules = feed?.capsules ?? [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setCreating(true);
    const res = await createCapsule({ title, message, recipient, unlockDate });
    setCreating(false);
    if (!res.ok) {
      setFormError(res.error ?? "Something went wrong");
      return;
    }
    setTitle("");
    setRecipient("");
    setMessage("");
    setUnlockDate("");
    setShowForm(false);
    setFeed(null); // force a refetch to show the new sealed capsule
    load();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full border border-parchment/25 bg-black/50 px-4 py-1.5 font-sans text-sm text-parchment/85 transition hover:border-parchment/60 hover:text-parchment"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="8" width="18" height="13" rx="2" />
          <path d="M3 8V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2" />
          <path d="M12 12v5" />
          <path d="M9 12h6" />
        </svg>
        Time Capsules
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 font-sans backdrop-blur-sm">
          <div className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-parchment/15 bg-gradient-to-b from-[#1a2417] to-[#0d130b] shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-parchment/10 px-6 py-5">
              <div>
                <p className="text-xs uppercase tracking-widest text-canopy-light">Time Capsules</p>
                <h2 className="font-serif text-2xl text-parchment">
                  {isSelf ? "Sealed for the future" : `${ownerName}'s capsules`}
                </h2>
              </div>
              <button onClick={() => setOpen(false)} className="text-parchment/50 transition hover:text-parchment" aria-label="Close">
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {loading ? (
                <p className="py-8 text-center text-sm text-parchment/50">Opening the vault…</p>
              ) : !feed || !feed.canView ? (
                <p className="py-8 text-center text-sm text-parchment/60">
                  These capsules are private to {ownerName} and their family.
                </p>
              ) : (
                <>
                  {capsules.length === 0 ? (
                    <p className="py-6 text-center text-sm text-parchment/60">
                      {isSelf ? "You haven't" : `${ownerName} hasn't`} sealed any capsules yet.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {capsules.map((c) => (
                        <li
                          key={c.id}
                          className={`rounded-2xl border p-4 ${
                            c.sealed ? "border-parchment/10 bg-black/30" : "border-fruit/40 bg-canopy/20"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <span className={c.sealed ? "text-parchment/40" : "text-fruit"}>
                              {c.sealed ? (
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="3" y="11" width="18" height="11" rx="2" />
                                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                </svg>
                              ) : (
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="3" y="11" width="18" height="11" rx="2" />
                                  <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                                </svg>
                              )}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="font-serif text-lg text-parchment">{c.title}</p>
                              {c.recipient ? (
                                <p className="text-xs text-parchment/50">For {c.recipient}</p>
                              ) : null}
                              {c.sealed ? (
                                <p className="mt-1 text-xs text-parchment/40">
                                  Unlocks {fmtDate(c.unlockAt)}
                                </p>
                              ) : (
                                <>
                                  <p className="mt-1 text-xs text-fruit/80">
                                    Unlocked {fmtDate(c.unlockAt)}
                                  </p>
                                  {opened === c.id ? (
                                    <p className="mt-3 whitespace-pre-wrap font-serif text-sm leading-6 text-parchment/85">
                                      {c.message}
                                    </p>
                                  ) : (
                                    <button
                                      onClick={() => setOpened(c.id)}
                                      className="mt-2 text-xs font-semibold text-canopy-light hover:underline"
                                    >
                                      Open capsule →
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Create — owner only */}
                  {isSelf ? (
                    <div className="mt-5 border-t border-parchment/10 pt-5">
                      {showForm ? (
                        <form onSubmit={submit} className="space-y-3">
                          <input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Title (e.g. For Ava's 18th)"
                            maxLength={120}
                            className="w-full rounded-xl border border-parchment/15 bg-black/40 px-3 py-2 text-sm text-parchment placeholder:text-parchment/30 focus:border-canopy-light focus:outline-none"
                          />
                          <input
                            value={recipient}
                            onChange={(e) => setRecipient(e.target.value)}
                            placeholder="Who is it for? (optional)"
                            maxLength={120}
                            className="w-full rounded-xl border border-parchment/15 bg-black/40 px-3 py-2 text-sm text-parchment placeholder:text-parchment/30 focus:border-canopy-light focus:outline-none"
                          />
                          <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Write your message…"
                            rows={5}
                            className="w-full resize-y rounded-xl border border-parchment/15 bg-black/40 px-3 py-2 text-sm text-parchment placeholder:text-parchment/30 focus:border-canopy-light focus:outline-none"
                          />
                          <label className="block text-xs text-parchment/50">
                            Unlock date
                            <input
                              type="date"
                              value={unlockDate}
                              min={tomorrowStr()}
                              onChange={(e) => setUnlockDate(e.target.value)}
                              className="mt-1 w-full rounded-xl border border-parchment/15 bg-black/40 px-3 py-2 text-sm text-parchment focus:border-canopy-light focus:outline-none [color-scheme:dark]"
                            />
                          </label>
                          {formError ? <p className="text-xs text-red-300">{formError}</p> : null}
                          <div className="flex gap-2">
                            <button
                              type="submit"
                              disabled={creating}
                              className="flex-1 rounded-full bg-fruit px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-50"
                            >
                              {creating ? "Sealing…" : "Seal capsule"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowForm(false)}
                              className="rounded-full border border-parchment/20 px-4 py-2 text-sm text-parchment/70 transition hover:border-parchment/50"
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : (
                        <button
                          onClick={() => setShowForm(true)}
                          className="flex w-full items-center justify-center gap-2 rounded-full border border-fruit/40 bg-fruit/15 px-4 py-2 text-sm font-semibold text-parchment transition hover:brightness-110"
                        >
                          + Seal a new capsule
                        </button>
                      )}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
