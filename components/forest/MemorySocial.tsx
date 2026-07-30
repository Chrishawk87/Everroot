"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";

interface CommentView {
  id: string;
  authorName: string;
  body: string | null;
  recordingId: string | null;
  mediaKind: "image" | "video" | "audio" | null;
  mine: boolean;
  createdAt: string;
}

interface SocialData {
  canView: boolean;
  emojis: string[];
  myReaction: string | null;
  reactionCounts: { emoji: string; count: number }[];
  comments: CommentView[];
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(1, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * The likes + comments living under one memory — a warm, family-scale version
 * of the Facebook "reactions and comments" pattern. Any linked family member
 * can leave an emoji reaction and reply with words, a photo, or a short video.
 */
export default function MemorySocial({ nodeId }: { nodeId: string }) {
  const [data, setData] = useState<SocialData | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/memory/${nodeId}/social`)
      .then((r) => (r.ok ? (r.json() as Promise<SocialData>) : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [nodeId]);

  useEffect(() => {
    load();
  }, [load]);

  // Tap an emoji to set it; tap your current one again to clear it.
  const react = useCallback(
    async (emoji: string) => {
      if (!data) return;
      const next = data.myReaction === emoji ? null : emoji;
      // Optimistic: adjust counts locally so it feels instant.
      setData((prev) => {
        if (!prev) return prev;
        const counts = new Map(prev.reactionCounts.map((r) => [r.emoji, r.count]));
        if (prev.myReaction) counts.set(prev.myReaction, Math.max(0, (counts.get(prev.myReaction) ?? 1) - 1));
        if (next) counts.set(next, (counts.get(next) ?? 0) + 1);
        return {
          ...prev,
          myReaction: next,
          reactionCounts: [...counts.entries()]
            .filter(([, c]) => c > 0)
            .map(([e, c]) => ({ emoji: e, count: c }))
            .sort((a, b) => b.count - a.count),
        };
      });
      try {
        await fetch(`/api/memory/${nodeId}/react`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emoji: next }),
        });
      } catch {
        load(); // reconcile with the server on failure
      }
    },
    [data, nodeId, load],
  );

  const onPick = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    e.target.value = "";
    setFile(f);
  }, []);

  const post = useCallback(async () => {
    if (!draft.trim() && !file) return;
    setPosting(true);
    setError(null);
    try {
      const fd = new FormData();
      if (draft.trim()) fd.append("body", draft.trim());
      if (file) fd.append("file", file);
      const res = await fetch(`/api/memory/${nodeId}/comment`, { method: "POST", body: fd });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(d.error || "We couldn't post that just now.");
      setDraft("");
      setFile(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't post that just now.");
    } finally {
      setPosting(false);
    }
  }, [draft, file, nodeId, load]);

  if (loading) {
    return <p className="mt-3 text-xs text-parchment/40">Loading…</p>;
  }
  if (!data || !data.canView) return null;

  return (
    <div className="mt-4 border-t border-parchment/10 pt-3">
      {/* Reaction bar */}
      <div className="flex flex-wrap items-center gap-1.5">
        {data.emojis.map((emoji) => {
          const count = data.reactionCounts.find((r) => r.emoji === emoji)?.count ?? 0;
          const mine = data.myReaction === emoji;
          return (
            <button
              key={emoji}
              onClick={() => react(emoji)}
              className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm transition active:scale-95 ${
                mine
                  ? "border-fruit/70 bg-fruit/15 text-parchment"
                  : "border-parchment/15 bg-black/20 text-parchment/70 hover:border-parchment/40"
              }`}
            >
              <span>{emoji}</span>
              {count > 0 ? <span className="text-xs text-parchment/60">{count}</span> : null}
            </button>
          );
        })}
      </div>

      {/* Comments */}
      {data.comments.length > 0 ? (
        <ul className="mt-3 space-y-3">
          {data.comments.map((c) => (
            <li key={c.id} className="rounded-xl bg-black/20 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-serif text-sm text-parchment/90">{c.authorName}</span>
                <span className="shrink-0 text-[11px] text-parchment/40">{timeAgo(c.createdAt)}</span>
              </div>
              {c.body ? (
                <p className="mt-1 whitespace-pre-wrap text-sm text-parchment/80">{c.body}</p>
              ) : null}
              {c.recordingId && c.mediaKind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/recordings/${c.recordingId}`}
                  alt="A family member's reply"
                  className="mt-2 max-h-56 w-full rounded-lg object-cover"
                />
              ) : c.recordingId && c.mediaKind === "video" ? (
                <video controls src={`/api/recordings/${c.recordingId}`} className="mt-2 w-full rounded-lg" />
              ) : c.recordingId && c.mediaKind === "audio" ? (
                <audio controls src={`/api/recordings/${c.recordingId}`} className="mt-2 w-full" />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {/* Composer */}
      <div className="mt-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Share a memory, a thought, or a kind word…"
          rows={2}
          maxLength={2000}
          className="w-full resize-none rounded-xl border border-parchment/15 bg-black/30 px-3 py-2 text-sm text-parchment placeholder:text-parchment/30 focus:border-canopy/50 focus:outline-none"
        />
        {file ? (
          <p className="mt-1 text-xs text-parchment/60">
            Attached: {file.name}{" "}
            <button onClick={() => setFile(null)} className="text-fruit/80 underline">
              remove
            </button>
          </p>
        ) : null}
        {error ? <p className="mt-1 text-xs text-amber-300/90">{error}</p> : null}
        <div className="mt-2 flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={onPick}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={posting}
            className="rounded-full border border-parchment/20 bg-black/30 px-3 py-1.5 text-xs text-parchment/80 transition hover:border-parchment/50 disabled:opacity-50"
          >
            Photo / video
          </button>
          <button
            onClick={() => void post()}
            disabled={posting || (!draft.trim() && !file)}
            className="ml-auto rounded-full border border-fruit/50 bg-fruit/15 px-4 py-1.5 text-xs text-parchment transition hover:brightness-110 disabled:opacity-40"
          >
            {posting ? "Posting…" : "Post"}
          </button>
        </div>
      </div>
    </div>
  );
}
