"use client";

import { useCallback, useEffect, useState } from "react";

interface CategoryItem {
  nodeId: string;
  kind: string;
  title: string;
  summary: string | null;
  transcript: string | null;
  question: string | null;
  epoch: string | null;
  createdAt: string;
  recordingId: string | null;
  mimeType: string | null;
  durationMs: number;
  isVideo: boolean;
  photoUrl: string | null;
}

interface Contents {
  branchId: string;
  title: string;
  summary: string | null;
  ownerId: string;
  items: CategoryItem[];
  canView: boolean;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

/**
 * The drawer behind a category lantern (e.g. "Messages for the Future"): every
 * memory hanging off that branch, with its voice memo, video, photo, and
 * written words. Access is gated server-side (owner + linked family only).
 */
export default function CategoryPanel({
  branchId,
  branchTitle,
  onClose,
}: {
  branchId: string;
  branchTitle: string;
  onClose: () => void;
}) {
  const [contents, setContents] = useState<Contents | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/category/${branchId}`)
      .then((r) => (r.ok ? (r.json() as Promise<Contents>) : null))
      .then((c) => setContents(c))
      .catch(() => setContents(null))
      .finally(() => setLoading(false));
  }, [branchId]);

  useEffect(() => {
    load();
  }, [load]);

  const items = contents?.items ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 font-sans backdrop-blur-sm">
      <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-parchment/15 bg-gradient-to-b from-[#1a2417] to-[#0d130b] shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-parchment/10 px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-widest text-canopy-light">Memories</p>
            <h2 className="font-serif text-2xl text-parchment">{contents?.title ?? branchTitle}</h2>
          </div>
          <button onClick={onClose} className="text-parchment/50 transition hover:text-parchment" aria-label="Close">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <p className="py-8 text-center text-sm text-parchment/50">Gathering these memories…</p>
          ) : !contents || !contents.canView ? (
            <p className="py-8 text-center text-sm text-parchment/60">
              These memories are private to their family.
            </p>
          ) : items.length === 0 ? (
            <p className="py-6 text-center text-sm text-parchment/60">
              Nothing has been added to this branch yet.
            </p>
          ) : (
            <ul className="space-y-4">
              {items.map((it) => (
                <li key={it.nodeId} className="rounded-2xl border border-parchment/10 bg-black/30 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-serif text-lg text-parchment">{it.title}</p>
                    <span className="shrink-0 text-xs text-parchment/40">{fmtDate(it.createdAt)}</span>
                  </div>

                  {it.question ? (
                    <p className="mt-1 text-xs italic text-canopy-light/80">“{it.question}”</p>
                  ) : null}

                  {/* Photo */}
                  {it.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={it.photoUrl}
                      alt={it.title}
                      className="mt-3 max-h-72 w-full rounded-xl object-cover"
                    />
                  ) : null}

                  {/* Video or voice recording */}
                  {it.recordingId ? (
                    it.isVideo ? (
                      <video
                        controls
                        src={`/api/recordings/${it.recordingId}`}
                        className="mt-3 w-full rounded-xl"
                      />
                    ) : (
                      <audio controls src={`/api/recordings/${it.recordingId}`} className="mt-3 w-full" />
                    )
                  ) : null}

                  {/* Written words — transcript preferred, else the summary */}
                  {it.transcript && it.transcript.trim().length > 0 ? (
                    <p className="mt-3 whitespace-pre-wrap font-serif text-sm leading-6 text-parchment/85">
                      {it.transcript}
                    </p>
                  ) : it.summary ? (
                    <p className="mt-3 whitespace-pre-wrap font-serif text-sm leading-6 text-parchment/75">
                      {it.summary}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
