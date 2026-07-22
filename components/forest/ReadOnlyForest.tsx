"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { ForestGraph, ForestNodeDTO } from "@/lib/forest/types";
import { GROWTH_STAGES } from "@/lib/forest/types";
import ShareClipButton, { isClipKind } from "./ShareClipButton";

const ForestCanvas = dynamic(() => import("./ForestCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-parchment/50">
      Growing the forest…
    </div>
  ),
});

// A visiting view of a family member's tree — the full 3D forest, but read-only
// (no growth controls). Reached by clicking a tree in the family forest.
export default function ReadOnlyForest({
  graph,
  relationship,
}: {
  graph: ForestGraph;
  relationship: string | null;
}) {
  const [selected, setSelected] = useState<ForestNodeDTO | null>(null);
  const stageMeta = GROWTH_STAGES.find((s) => s.stage === graph.stage);
  const memoryCount =
    graph.counts.LEAF + graph.counts.FLOWER + graph.counts.FRUIT + graph.counts.MEMORY_MOMENT + graph.counts.PHOTO;

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <div className="absolute inset-0">
        <ForestCanvas graph={graph} selectedId={selected?.id ?? null} focusId={null} onSelect={setSelected} />
      </div>

      {/* Whose tree this is */}
      <div className="pointer-events-none absolute left-5 top-5 max-w-xs font-sans">
        <p className="text-xs uppercase tracking-widest text-canopy-light">Visiting</p>
        <h1 className="font-serif text-2xl text-parchment">
          {graph.profile.displayName}
          {relationship ? <span className="text-parchment/50"> · {relationship}</span> : null}
        </h1>
        <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-black/40 px-3 py-1 text-sm">
          <span className="text-fruit">{stageMeta?.label ?? graph.stage}</span>
          <span className="text-parchment/40">·</span>
          <span className="text-parchment/80">Legacy {graph.legacyScore}</span>
        </div>
        <p className="mt-2 text-xs text-parchment/40">
          {memoryCount} memories · {graph.counts.PERSON} family · {graph.counts.ROOT} roots
        </p>
      </div>

      <Link
        href="/family"
        className="absolute right-5 top-5 rounded-full border border-parchment/20 bg-black/40 px-4 py-1.5 font-sans text-sm text-parchment/80 transition hover:border-parchment/50"
      >
        ← Family forest
      </Link>

      {/* Selected node detail (read-only) */}
      {selected ? (
        <div className="absolute bottom-5 left-5 max-w-sm rounded-2xl border border-parchment/15 bg-black/70 p-5 font-sans backdrop-blur">
          <p className="text-xs uppercase tracking-widest text-canopy-light">{selected.kind.replace(/_/g, " ")}</p>
          <h2 className="mt-1 font-serif text-xl text-parchment">{selected.title}</h2>
          {selected.summary ? <p className="mt-2 text-sm text-parchment/75">{selected.summary}</p> : null}
          {isClipKind(selected.kind) ? <ShareClipButton node={selected} /> : null}
          <button onClick={() => setSelected(null)} className="mt-3 block text-xs text-parchment/50 hover:text-parchment">
            Close
          </button>
        </div>
      ) : null}
    </div>
  );
}
