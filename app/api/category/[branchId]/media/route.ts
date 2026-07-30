import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { grow } from "@/lib/forest/growth-engine";
import { recordings } from "@/lib/recordings";
import { storageConfigured, putRecording, newRecordingKey } from "@/lib/storage";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Photos are small; short videos can be a few tens of MB. Cap the upload so a
// runaway file can't blow out memory or storage.
const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB
const MAX_VIDEO_BYTES = 80 * 1024 * 1024; // ~80 MB — a short phone clip
const MAX_CAPTION_CHARS = 200;

// Add a photo or short video straight onto one of a person's category lanterns.
// Only the lantern's owner can add to it. The file is grown into a memory node
// under that branch and stored the same way voice recordings are (R2 with a
// database fallback), so it plays/shows through the existing recording stream.
export async function POST(req: Request, { params }: { params: { branchId: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "You must be signed in" }, { status: 401 });
  }
  const userId = session.user.id;

  const limit = rateLimit(`media:${userId}`, 120, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "You're adding memories very quickly — please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limit.retryAfterMs)) } },
    );
  }

  // The lantern must exist and belong to the signed-in person — you can only add
  // memories to your own tree.
  const branch = await prisma.forestNode.findUnique({ where: { id: params.branchId } });
  if (!branch || (branch.kind !== "BRANCH" && branch.kind !== "SUB_BRANCH")) {
    return NextResponse.json({ error: "That lantern doesn't exist" }, { status: 404 });
  }
  if (branch.userId !== userId) {
    return NextResponse.json({ error: "You can only add memories to your own tree" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const file = form.get("file");
  const caption = String(form.get("caption") ?? "").trim().slice(0, MAX_CAPTION_CHARS);
  const durationMs = Number(form.get("durationMs") ?? 0) || 0;
  // Whether this memory should also hang out on the tree as a framed photo, and
  // a small on-device thumbnail (data URL) to show inside that frame.
  const onTree = String(form.get("onTree") ?? "") === "1";
  const thumbRaw = String(form.get("thumb") ?? "");
  // Only trust a small data-URL image; ignore anything else so node.data can't
  // be stuffed with arbitrary or oversized content.
  const thumb =
    onTree && thumbRaw.startsWith("data:image/") && thumbRaw.length <= 200_000
      ? thumbRaw
      : null;

  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "No photo or video was uploaded" }, { status: 400 });
  }

  const mimeType = file.type || "";
  const isImage = mimeType.startsWith("image/");
  const isVideo = mimeType.startsWith("video/");
  if (!isImage && !isVideo) {
    return NextResponse.json(
      { error: "Only photos and videos can be added here." },
      { status: 415 },
    );
  }
  const cap = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size > cap) {
    return NextResponse.json(
      {
        error: isVideo
          ? "That video is a bit long — please keep clips short (under ~80 MB)."
          : "That photo is too large.",
      },
      { status: 413 },
    );
  }

  try {
    // A sensible default title if the person didn't caption it.
    const title = caption || (isVideo ? "A video memory" : "A photo memory");

    // Grow the memory under this lantern. A photo becomes a PHOTO node; a video
    // is a spoken/visual "story" (a LEAF). Passing the branch title attaches it
    // to this exact category branch via the growth engine.
    const result = await grow(userId, {
      type: isImage ? "upload_photo" : "record_story",
      title,
      branch: branch.title,
      data: {
        source: "lantern_upload",
        mediaType: isImage ? "photo" : "video",
        // The renderer reads these to hang a framed photo on the branch.
        onTree,
        ...(thumb ? { thumb } : {}),
      },
    });

    // Store the media exactly like a voice recording: prefer R2, fall back to
    // storing bytes in the database if object storage is unavailable, so the
    // upload is never lost to a storage hiccup.
    const bytes = new Uint8Array(await file.arrayBuffer());
    let storageKey: string | null = null;
    if (storageConfigured()) {
      try {
        const key = newRecordingKey();
        await putRecording(key, bytes, mimeType);
        storageKey = key;
      } catch (e) {
        console.error("R2 upload failed — storing media bytes in DB instead:", e);
        storageKey = null;
      }
    }

    const rec = await recordings().create({
      data: {
        userId,
        nodeId: result.createdNodeId,
        mimeType,
        durationMs: isVideo ? durationMs : 0,
        bytes: storageKey ? null : bytes,
        storageKey,
        transcript: null,
        question: null,
      },
    });

    revalidatePath("/forest");

    return NextResponse.json({
      ok: true,
      nodeId: result.createdNodeId,
      recordingId: rec.id,
    });
  } catch (err) {
    console.error("Failed to add media to lantern:", err);
    return NextResponse.json(
      { error: "We couldn't add that just now. Please try again." },
      { status: 500 },
    );
  }
}
