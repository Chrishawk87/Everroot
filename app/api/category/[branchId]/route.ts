import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCategoryContents } from "@/lib/forest/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Everything hanging off one category branch — its voice memos, videos, photos,
// and written memories. Access is gated inside getCategoryContents (owner +
// linked family only).
export async function GET(_req: Request, { params }: { params: { branchId: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const contents = await getCategoryContents(params.branchId, session.user.id);
  if (!contents) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(contents);
}
