"use client";

import { useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FamilyTreeData } from "./FamilyForestCanvas";

const FamilyForestCanvas = dynamic(() => import("./FamilyForestCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-parchment/50">
      Gathering the family forest…
    </div>
  ),
});

export default function FamilyForestExperience({ trees }: { trees: FamilyTreeData[] }) {
  const router = useRouter();

  const handleEnter = useCallback(
    (userId: string, isSelf: boolean) => {
      router.push(isSelf ? "/forest" : `/family/${userId}`);
    },
    [router],
  );

  const memberCount = trees.filter((t) => !t.isSelf).length;

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <div className="absolute inset-0">
        <FamilyForestCanvas trees={trees} onEnter={handleEnter} />
      </div>

      {/* Header */}
      <div className="pointer-events-none absolute left-5 top-5 max-w-sm font-sans">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/everroot-logo-transparent.png" alt="EverRoot" className="mb-2 h-14 w-auto drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)]" />
        <h1 className="font-serif text-2xl text-parchment">Family Forest</h1>
        <p className="mt-1 text-sm text-parchment/70">
          {memberCount > 0
            ? `${memberCount} tree${memberCount === 1 ? "" : "s"} growing alongside yours. Click any tree to visit it.`
            : "No family trees yet. Invite family from your own tree to grow the forest together."}
        </p>
      </div>

      {/* Back to my tree */}
      <Link
        href="/forest"
        className="absolute right-5 top-5 rounded-full border border-parchment/20 bg-black/40 px-4 py-1.5 font-sans text-sm text-parchment/80 transition hover:border-parchment/50"
      >
        ← Back to my tree
      </Link>
    </div>
  );
}
