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

  const headers: Record<string, string> = {
    "Content-Type": rec.mimeType || "audio/webm",
    "Content-Length": String(body.byteLength),
    "Cache-Control": "private, max-age=31536000, immutable",
  };

  // `?download=<name>` turns the stream into a saved file so a memory can be
  // shared as a download rather than a live link.
  const downloadName = new URL(req.url).searchParams.get("download");
  if (downloadName) {
    const safe = downloadName.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "memory";
    headers["Content-Disposition"] = `attachment; filename="${safe}"`;
  }

  return new Response(body, { status: 200, headers });
}
