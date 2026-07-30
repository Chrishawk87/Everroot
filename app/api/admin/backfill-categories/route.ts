import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureCategoryBranches } from "@/lib/forest/growth-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One-time migration: give every existing forest the full set of ten category
// branches (each renders as one lantern on the mature tree). Idempotent — a
// forest that already has a category branch keeps it, so this is safe to run
// repeatedly.
//
// Gated by a shared secret in the BACKFILL_SECRET env var. If that var is unset
// the endpoint returns 404, so it stays dormant unless deliberately enabled.
// Call: GET /api/admin/backfill-categories?key=<BACKFILL_SECRET>

export async function GET(req: Request) {
  const secret = process.env.BACKFILL_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const key = new URL(req.url).searchParams.get("key");
  if (key !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Every forest is keyed by a profile's userId.
  const profiles = await prisma.profile.findMany({ select: { userId: true } });

  let updated = 0;
  const failed: string[] = [];
  for (const p of profiles) {
    try {
      await ensureCategoryBranches(p.userId);
      updated += 1;
    } catch (err) {
      console.error(`Category backfill failed for user ${p.userId}:`, err);
      failed.push(p.userId);
    }
  }

  return NextResponse.json({
    ok: true,
    forests: profiles.length,
    updated,
    failed,
    done: failed.length === 0,
  });
}
