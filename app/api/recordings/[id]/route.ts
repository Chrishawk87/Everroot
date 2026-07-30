import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { recordings } from "@/lib/recordings";
import { getRecording } from "@/lib/storage";
import { isLinkedFamily } from "@/lib/family-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stream a stored voice recording to its owner or their linked family (so
// shared memory clips play for the whole family forest).
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const rec = await recordings().findUnique({ where: { id: params.id } });
  if (!rec) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (rec.userId !== session.user.id && !(await isLinkedFamily(session.user.id, rec.userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // New recordings live in object storage (R2); older ones kept their audio in
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
    console.error("Failed to load recording audio:", err);
    return NextResponse.json({ error: "Could not load recording" }, { status: 500 });
  }

  const contentType = rec.mimeType || "audio/webm";
  const total = body.byteLength;

  const headers: Record<string, string> = {
    "Content-Type": contentType,
    // Safari's <audio>/<video> element refuses to play unless the server
    // advertises byte-range support — without this, mobile playback silently
    // fails even though the recording saved fine.
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=31536000, immutable",
  };

  // `?download=<name>` turns the stream into a saved file so a memory can be
  // shared as a download rather than a live link.
  const downloadName = new URL(req.url).searchParams.get("download");
  if (downloadName) {
    const safe = downloadName.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "memory";
    headers["Content-Disposition"] = `attachment; filename="${safe}"`;
  }

  // Honor a Range request (Safari always sends one for media) by returning the
  // requested slice as 206 Partial Content. A download request is served whole.
  const range = req.headers.get("range");
  if (range && !downloadName) {
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
