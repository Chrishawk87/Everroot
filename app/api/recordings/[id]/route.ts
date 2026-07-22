import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { recordings } from "@/lib/recordings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stream a stored voice recording to its owner (for future in-leaf playback).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const rec = await recordings().findUnique({ where: { id: params.id } });
  if (!rec || rec.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = Buffer.from(rec.bytes);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": rec.mimeType || "audio/webm",
      "Content-Length": String(body.byteLength),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
