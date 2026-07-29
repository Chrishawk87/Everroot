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
    <div className="relative h-[100dvh] w-screen overflow-hidden">
      <div className="absolute inset-0">
        <FamilyForestCanvas trees={trees} onEnter={handleEnter} />
      </div>

      {/* Top gradient scrim for legibility over the canvas */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-black/60 to-transparent"
      />

      {/* Header */}
      <div className="pointer-events-none absolute left-[max(1.25rem,env(safe-area-inset-left))] top-[max(1.25rem,env(safe-area-inset-top))] right-[max(1.25rem,env(safe-area-inset-right))] max-w-[16rem] font-sans sm:max-w-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/everroot-logo-transparent.png" alt="EverRoot" className="mb-2 h-10 w-auto drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)] sm:h-14" />
        <h1 className="font-serif text-xl text-parchment sm:text-2xl">Family Forest</h1>
        <p className="mt-1 text-xs text-parchment/70 sm:text-sm">
          {memberCount > 0
            ? `${memberCount} tree${memberCount === 1 ? "" : "s"} growing alongside yours. Tap any tree to visit it.`
            : "No family trees yet. Invite family from your own tree to grow the forest together."}
        </p>
      </div>

      {/* Back to my tree */}
      <Link
        href="/forest"
        className="absolute right-[max(1.25rem,env(safe-area-inset-right))] bottom-[max(1.25rem,env(safe-area-inset-bottom))] rounded-full border border-parchment/20 bg-black/40 px-4 py-2 font-sans text-sm text-parchment/80 backdrop-blur-sm transition hover:border-parchment/50"
      >
        ← Back to my tree
      </Link>
    </div>
  );
}
