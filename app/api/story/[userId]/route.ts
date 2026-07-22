import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getStoryFeed } from "@/lib/forest/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A person's whole spoken story, in order — the owner's or a linked family
// member's. Access is gated inside getStoryFeed (owner + linked family only).
export async function GET(_req: Request, { params }: { params: { userId: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const feed = await getStoryFeed(params.userId, session.user.id);
  if (!feed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(feed);
}
