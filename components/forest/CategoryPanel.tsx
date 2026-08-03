"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, SyntheticEvent } from "react";
import MemorySocial from "./MemorySocial";

interface CategoryItem {
  nodeId: string;
  kind: string;
  title: string;
  summary: string | null;
  transcript: string | null;
  story: string | null;
  aiPolished: boolean;
  question: string | null;
  epoch: string | null;
  createdAt: string;
  recordingId: string | null;
  mimeType: string | null;
  durationMs: number;
  isVideo: boolean;
  photoUrl: string | null;
  onTree: boolean;
}

interface Contents {
  branchId: string;
  title: string;
  summary: string | null;
  ownerId: string;
  items: CategoryItem[];
  canView: boolean;
  canEdit: boolean;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

/**
 * The drawer behind a category lantern (e.g. "Messages for the Future"): every
 * memory hanging off that branch, with its voice memo, video, photo, and
 * written words. Access is gated server-side (owner + linked family only).
 */
// Temporary: when an <audio>/<video> fails, probe the stream URL directly and
// report what actually came back, so we can tell a storage/auth problem
// (bad HTTP status) apart from a codec/decode problem (loads but won't play).
async function describePlaybackFailure(
  recordingId: string,
  mediaErrorCode: number | undefined,
): Promise<string> {
  const codeLabel =
    { 1: "aborted", 2: "network", 3: "decode/format", 4: "source not supported" }[
      mediaErrorCode ?? 0
    ] ?? "unknown";
  try {
    const res = await fetch(`/api/recordings/${recordingId}`, {
      headers: { Range: "bytes=0-1" },
    });
    const len = res.headers.get("content-range") || res.headers.get("content-length") || "?";
    const type = res.headers.get("content-type") || "?";
    return `Playback failed (${codeLabel}). Server: HTTP ${res.status}, type ${type}, size ${len}.`;
  } catch (e) {
    return `Playback failed (${codeLabel}). Couldn't even reach the file: ${
      e instanceof Error ? e.message : "network error"
    }.`;
  }
}

// Make a small JPEG thumbnail (data URL) on the device before uploading, so a
// framed photo can hang on the tree without streaming the full-size media. For
// a video we grab its first frame; for a photo we downscale it. Best-effort:
// if anything fails we just return null and the memory still uploads fine.
const THUMB_MAX = 320; // longest edge, px

function canvasThumb(
  source: HTMLImageElement | HTMLVideoElement,
  w: number,
  h: number,
): string | null {
  if (!w || !h) return null;
  const scale = Math.min(1, THUMB_MAX / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, cw, ch);
  try {
    return canvas.toDataURL("image/jpeg", 0.72);
  } catch {
    return null; // tainted canvas or unsupported — skip the thumbnail
  }
}

async function makeThumb(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    if (file.type.startsWith("image/")) {
      return await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(canvasThumb(img, img.naturalWidth, img.naturalHeight));
        img.onerror = () => resolve(null);
        img.src = url;
      });
    }
    if (file.type.startsWith("video/")) {
      return await new Promise((resolve) => {
        const video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.preload = "metadata";
        let done = false;
        const finish = (val: string | null) => {
          if (done) return;
          done = true;
          resolve(val);
        };
        video.onloadeddata = () => {
          // Nudge to a fraction of a second so we don't grab a black frame.
          const target = Math.min(0.1, (video.duration || 1) / 2);
          video.currentTime = target || 0;
        };
        video.onseeked = () =>
          finish(canvasThumb(video, video.videoWidth, video.videoHeight));
        video.onerror = () => finish(null);
        // Safety net if seeking never fires.
        setTimeout(() => finish(null), 4000);
        video.src = url;
      });
    }
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

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
  const [playbackErrors, setPlaybackErrors] = useState<Record<string, string>>({});
  const [caption, setCaption] = useState("");
  const [onTree, setOnTree] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

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

  // Upload a chosen photo/video, then refresh the drawer so it appears.
  const upload = useCallback(
    async (file: File) => {
      setUploading(true);
      setUploadError(null);
      try {
        const fd = new FormData();
        fd.append("file", file);
        if (caption.trim()) fd.append("caption", caption.trim());
        fd.append("onTree", onTree ? "1" : "0");
        // If it will hang on the tree, make a small thumbnail on-device so the
        // frame can show a picture without loading the full-size media.
        if (onTree) {
          const thumb = await makeThumb(file);
          if (thumb) fd.append("thumb", thumb);
        }
        const res = await fetch(`/api/category/${branchId}/media`, {
          method: "POST",
          body: fd,
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(data.error || "We couldn't add that just now.");
        setCaption("");
        load();
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : "We couldn't add that just now.");
      } finally {
        setUploading(false);
      }
    },
    [branchId, caption, onTree, load],
  );

  const onPick = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ""; // let the same file be picked again later
      if (file) void upload(file);
    },
    [upload],
  );

  // Which items are mid-toggle, so we can disable their switch + show a hint.
  const [toggling, setToggling] = useState<Record<string, boolean>>({});

  // Flip whether a memory hangs on the tree. Turning ON needs a thumbnail for
  // the frame: if the memory doesn't have one yet we make one on-device from its
  // stored media (its photo, or the first frame of its video). We update the
  // drawer optimistically so the switch feels instant.
  const toggleOnTree = useCallback(
    async (it: CategoryItem) => {
      const next = !it.onTree;
      setToggling((m) => ({ ...m, [it.nodeId]: true }));
      setContents((prev) =>
        prev
          ? { ...prev, items: prev.items.map((x) => (x.nodeId === it.nodeId ? { ...x, onTree: next } : x)) }
          : prev,
      );
      try {
        let thumb: string | null = null;
        if (next && it.recordingId) {
          try {
            const res = await fetch(`/api/recordings/${it.recordingId}`);
            if (res.ok) {
              const blob = await res.blob();
              const file = new File([blob], "media", { type: blob.type || it.mimeType || "" });
              thumb = await makeThumb(file);
            }
          } catch {
            thumb = null; // frame will simply show without a picture; not fatal
          }
        }
        const res = await fetch(`/api/memory/${it.nodeId}/on-tree`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ onTree: next, ...(thumb ? { thumb } : {}) }),
        });
        if (!res.ok) throw new Error("toggle failed");
      } catch {
        load(); // reconcile with the server on any failure
      } finally {
        setToggling((m) => {
          const { [it.nodeId]: _drop, ...rest } = m;
          return rest;
        });
      }
    },
    [load],
  );

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
          ) : (
          <>
            {/* Add a photo or video — only the owner of this tree sees this. */}
            {contents.canEdit ? (
              <div className="mb-5 rounded-2xl border border-canopy/30 bg-black/20 p-4">
                <p className="mb-2.5 text-sm text-parchment/80">Add a photo or short video</p>
                <input
                  ref={libraryInputRef}
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={onPick}
                />
                {/* Single media type + capture makes the phone open the camera
                    directly rather than falling back to the library picker. */}
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={onPick}
                />
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/*"
                  capture="environment"
                  className="hidden"
                  onChange={onPick}
                />
                <input
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Add a caption (optional)"
                  maxLength={200}
                  className="mb-3 w-full rounded-lg border border-parchment/15 bg-black/30 px-3 py-2 text-sm text-parchment placeholder:text-parchment/30 focus:border-canopy/50 focus:outline-none"
                />
                <label className="mb-3 flex cursor-pointer items-center gap-2.5 text-sm text-parchment/80">
                  <input
                    type="checkbox"
                    checked={onTree}
                    onChange={(e) => setOnTree(e.target.checked)}
                    className="h-4 w-4 shrink-0 accent-fruit"
                  />
                  <span>Also hang it on the tree as a framed photo</span>
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    onClick={() => photoInputRef.current?.click()}
                    disabled={uploading}
                    className="flex-1 rounded-full border border-fruit/40 bg-black/40 px-4 py-2 text-sm text-parchment transition hover:border-fruit/70 hover:brightness-110 disabled:opacity-50"
                  >
                    Take a photo
                  </button>
                  <button
                    onClick={() => videoInputRef.current?.click()}
                    disabled={uploading}
                    className="flex-1 rounded-full border border-fruit/40 bg-black/40 px-4 py-2 text-sm text-parchment transition hover:border-fruit/70 hover:brightness-110 disabled:opacity-50"
                  >
                    Record a video
                  </button>
                  <button
                    onClick={() => libraryInputRef.current?.click()}
                    disabled={uploading}
                    className="flex-1 rounded-full border border-parchment/20 bg-black/30 px-4 py-2 text-sm text-parchment/85 transition hover:border-parchment/50 hover:text-parchment disabled:opacity-50"
                  >
                    Choose from library
                  </button>
                </div>
                {uploading ? (
                  <p className="mt-2.5 text-xs text-parchment/60">Adding your memory…</p>
                ) : null}
                {uploadError ? (
                  <p className="mt-2.5 text-xs text-amber-300/90">{uploadError}</p>
                ) : null}
              </div>
            ) : null}

            {items.length === 0 ? (
              <p className="py-6 text-center text-sm text-parchment/60">
                {contents.canEdit
                  ? "Nothing here yet — add your first photo, video, or recorded memory."
                  : "Nothing has been added to this branch yet."}
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

                  {/* Photo, video, or voice recording (all streamed the same way) */}
                  {it.recordingId ? (
                    (() => {
                      const rid = it.recordingId;
                      const isImage = it.mimeType?.startsWith("image") ?? false;
                      const onErr = async (
                        e: SyntheticEvent<HTMLMediaElement>,
                      ) => {
                        const msg = await describePlaybackFailure(
                          rid,
                          e.currentTarget.error?.code,
                        );
                        setPlaybackErrors((prev) => ({ ...prev, [rid]: msg }));
                      };
                      return (
                        <>
                          {isImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={`/api/recordings/${rid}`}
                              alt={it.title}
                              className="mt-3 max-h-72 w-full rounded-xl object-cover"
                            />
                          ) : it.isVideo ? (
                            <video
                              controls
                              src={`/api/recordings/${rid}`}
                              onError={onErr}
                              className="mt-3 w-full rounded-xl"
                            />
                          ) : (
                            <audio
                              controls
                              src={`/api/recordings/${rid}`}
                              onError={onErr}
                              className="mt-3 w-full"
                            />
                          )}
                          {playbackErrors[rid] ? (
                            <p className="mt-2 rounded-lg border border-amber-400/30 bg-black/40 p-2 font-mono text-[11px] text-amber-300/90">
                              {playbackErrors[rid]}
                            </p>
                          ) : null}
                        </>
                      );
                    })()
                  ) : null}

                  {/* Written words — the AI-polished story if we have one,
                      otherwise the raw transcript, otherwise the summary. */}
                  {it.story && it.story.trim().length > 0 ? (
                    <>
                      <span className="mt-3 inline-flex items-center gap-1 rounded-full border border-canopy/50 bg-canopy/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-canopy-light">
                        ✨ Polished by AI
                      </span>
                      <p className="mt-2 whitespace-pre-wrap font-serif text-sm leading-6 text-parchment/85">
                        {it.story}
                      </p>
                    </>
                  ) : it.transcript && it.transcript.trim().length > 0 ? (
                    <p className="mt-3 whitespace-pre-wrap font-serif text-sm leading-6 text-parchment/85">
                      {it.transcript}
                    </p>
                  ) : it.summary ? (
                    <p className="mt-3 whitespace-pre-wrap font-serif text-sm leading-6 text-parchment/75">
                      {it.summary}
                    </p>
                  ) : null}
                  {/* Owner-only: hang this memory on the tree, or take it down. */}
                  {contents.canEdit && (it.recordingId || it.photoUrl) ? (
                    <button
                      onClick={() => void toggleOnTree(it)}
                      disabled={!!toggling[it.nodeId]}
                      className={`mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition disabled:opacity-50 ${
                        it.onTree
                          ? "border-fruit/60 bg-fruit/15 text-parchment"
                          : "border-parchment/20 bg-black/30 text-parchment/70 hover:border-parchment/50"
                      }`}
                    >
                      <span>{it.onTree ? "🌳" : "＋"}</span>
                      <span>
                        {toggling[it.nodeId]
                          ? "Updating…"
                          : it.onTree
                            ? "Hanging on the tree — tap to take down"
                            : "Hang on the tree"}
                      </span>
                    </button>
                  ) : null}
                  <MemorySocial nodeId={it.nodeId} />
                </li>
              ))}
            </ul>
            )}
          </>
          )}
        </div>
      </div>
    </div>
  );
}
