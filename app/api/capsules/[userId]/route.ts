import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCapsules } from "@/lib/forest/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A person's time capsules — owner + linked family only (gated in getCapsules).
// Sealed capsules never include their message.
export async function GET(_req: Request, { params }: { params: { userId: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const feed = await getCapsules(params.userId, session.user.id);
  if (!feed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(feed);
}
