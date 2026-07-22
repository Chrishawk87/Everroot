import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { recordings } from "@/lib/recordings";
import { isLinkedFamily } from "@/lib/family-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stream a stored voice recording to its owner or their linked family (so
// shared memory clips play for the whole family forest).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
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
