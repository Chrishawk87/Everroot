import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isLinkedFamily } from "@/lib/family-links";
import { recordings } from "@/lib/recordings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Resolve a memory's OWN photo/video (as opposed to a family member's comment
// reply) and hand the browser off to the streaming endpoint. The full-screen
// viewer points an <img>/<video> here without needing to know the recording id.
//
// A memory's own upload is created before any comments, so the earliest
// recording attached to the node is its own media; later recordings on the same
// node are comment replies. We redirect to /api/recordings/[id], which already
// enforces access and serves HTTP range requests (needed for video on iOS).
export async function GET(_req: Request, { params }: { params: { nodeId: string } }) {
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

  return NextResponse.redirect(new URL(`/api/recordings/${rec.id}`, _req.url));
}
