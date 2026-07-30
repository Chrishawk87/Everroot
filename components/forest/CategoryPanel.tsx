"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, SyntheticEvent } from "react";

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
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

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
    [branchId, caption, load],
  );

  const onPick = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ""; // let the same file be picked again later
      if (file) void upload(file);
    },
    [upload],
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
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*,video/*"
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
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    onClick={() => libraryInputRef.current?.click()}
                    disabled={uploading}
                    className="flex-1 rounded-full border border-parchment/20 bg-black/30 px-4 py-2 text-sm text-parchment/85 transition hover:border-parchment/50 hover:text-parchment disabled:opacity-50"
                  >
                    Choose from library
                  </button>
                  <button
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={uploading}
                    className="flex-1 rounded-full border border-fruit/40 bg-black/40 px-4 py-2 text-sm text-parchment transition hover:border-fruit/70 hover:brightness-110 disabled:opacity-50"
                  >
                    Take photo or video
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
          </>
          )}
        </div>
      </div>
    </div>
  );
}
