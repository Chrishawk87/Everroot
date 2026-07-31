import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isLinkedFamily } from "@/lib/family-links";
import { recordings } from "@/lib/recordings";
import { getRecording } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Serve a memory's OWN photo/video so the full-screen viewer can point an
// <img>/<video> straight here without knowing the recording id.
//
// A memory's own upload is created before any comments, so the earliest
// recording attached to the node is its own media; later recordings on the same
// node are comment replies.
//
// We STREAM the bytes here (with HTTP range support) rather than redirecting to
// /api/recordings/[id]. A redirect's absolute Location is rebuilt from the
// request URL, which behind Railway's TLS proxy can resolve to an internal
// http host the browser can't follow — so videos silently failed to load.
// Streaming inline sidesteps that entirely.
export async function GET(req: Request, { params }: { params: { nodeId: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const viewerId = session.user.id;

  const node = await prisma.forestNode.findUnique({ where: { id: params.nodeId } });
  if (!node) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (viewerId !== node.userId && !(await isLinkedFamily(viewerId, node.userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rec = await recordings().findFirst({
    where: { nodeId: params.nodeId },
    orderBy: { createdAt: "asc" },
  });
  if (!rec) {
    return NextResponse.json({ error: "No media for this memory" }, { status: 404 });
  }

  // New media lives in object storage (R2); older uploads kept their bytes in
  // Postgres. Pull from whichever this recording used.
  let body: Buffer;
  try {
    if (rec.storageKey) {
      body = Buffer.from(await getRecording(rec.storageKey));
    } else if (rec.bytes) {
      body = Buffer.from(rec.bytes);
    } else {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  } catch (err) {
    console.error("Failed to load memory media:", err);
    return NextResponse.json({ error: "Could not load media" }, { status: 500 });
  }

  const contentType = rec.mimeType || "application/octet-stream";
  const total = body.byteLength;

  const headers: Record<string, string> = {
    "Content-Type": contentType,
    // Safari's <video> refuses to play unless the server advertises byte-range
    // support — without this, mobile playback silently fails.
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=31536000, immutable",
  };

  // Honor a Range request (Safari always sends one for video) with 206.
  const range = req.headers.get("range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (match) {
      let start = match[1] ? parseInt(match[1], 10) : 0;
      let end = match[2] ? parseInt(match[2], 10) : total - 1;
      if (Number.isNaN(start)) start = 0;
      if (Number.isNaN(end) || end >= total) end = total - 1;
      if (start > end || start >= total) {
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${total}`, "Accept-Ranges": "bytes" },
        });
      }
      const slice = body.subarray(start, end + 1);
      return new Response(slice, {
        status: 206,
        headers: {
          ...headers,
          "Content-Range": `bytes ${start}-${end}/${total}`,
          "Content-Length": String(slice.byteLength),
        },
      });
    }
  }

  headers["Content-Length"] = String(total);
  return new Response(body, { status: 200, headers });
}
