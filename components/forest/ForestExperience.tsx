"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ForestGraph, ForestNodeDTO } from "@/lib/forest/types";
import { GROWTH_STAGES } from "@/lib/forest/types";
import GrowthPanel from "./GrowthPanel";
import InviteButton from "./InviteButton";
import ShareClipButton, { isClipKind } from "./ShareClipButton";
import StoryFeedPlayer from "./StoryFeedPlayer";
import CapsulePanel from "./CapsulePanel";
import CategoryPanel from "./CategoryPanel";
import GuardianPanel, { type FamilyOption } from "./GuardianPanel";
import { signOutAction } from "@/app/actions/forest";

// three.js only runs in the browser — load the canvas without SSR.
const ForestCanvas = dynamic(() => import("./ForestCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-parchment/50">
      Growing your forest…
    </div>
  ),
});

const ForestIntro = dynamic(() => import("./ForestIntro"), { ssr: false });

const INTRO_SEEN_KEY = "everroot_intro_seen";

const NEXT_STAGE_LABEL: Record<string, { min: number; label: string } | null> = Object.fromEntries(
  GROWTH_STAGES.map((s, i) => [
    s.stage,
    GROWTH_STAGES[i + 1] ? { min: GROWTH_STAGES[i + 1].minScore, label: GROWTH_STAGES[i + 1].label } : null,
  ]),
);

// How each freshly grown object announces itself.
const GREW_VERB: Record<string, string> = {
  LEAF: "A new leaf unfurled",
  FLOWER: "A flower bloomed",
  FRUIT: "Fruit ripened",
  ROOT: "A root took hold",
  PERSON: "A family sapling was planted",
  PHOTO: "A memory was pinned",
  MEMORY_MOMENT: "A moment was captured",
  BRANCH: "A new branch reached out",
  SEED: "A seed was planted",
};

export default function ForestExperience({
  graph,
  ownerId,
  guardianId = null,
}: {
  graph: ForestGraph;
  ownerId: string;
  guardianId?: string | null;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<ForestNodeDTO | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showIntro, setShowIntro] = useState(false);
  const [greeting, setGreeting] = useState("Welcome back");
  // Facebook-style: one active bottom sheet at a time.
  const [sheet, setSheet] = useState<null | "create" | "memories" | "more" | "tree">(null);

  // Time-of-day greeting, resolved after mount to avoid a hydration mismatch.
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");
  }, []);

  // Play the opening automatically the first time this browser sees the forest.
  useEffect(() => {
    try {
      if (!localStorage.getItem(INTRO_SEEN_KEY)) setShowIntro(true);
    } catch {
      /* localStorage unavailable — just skip the intro. */
    }
  }, []);

  const completeIntro = useCallback(() => {
    setShowIntro(false);
    try {
      localStorage.setItem(INTRO_SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  // Nodes arrive ordered oldest→newest, so the last one is the freshest.
  const newestNode = graph.nodes.length ? graph.nodes[graph.nodes.length - 1] : null;
  const newestId = newestNode?.id ?? null;
  // Seed with the current newest so the first render doesn't fly the camera.
  const prevNewest = useRef<string | null>(newestId);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (newestId && prevNewest.current && newestId !== prevNewest.current && newestNode) {
      // Something new grew — reveal it.
      setSelected(newestNode);
      setFocusId(newestId);
      const verb = GREW_VERB[newestNode.kind] ?? "Your forest grew";
      setToast(`${verb}: ${newestNode.title}`);

      if (focusTimer.current) clearTimeout(focusTimer.current);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      focusTimer.current = setTimeout(() => setFocusId(null), 4500);
      toastTimer.current = setTimeout(() => setToast(null), 4000);
    }
    prevNewest.current = newestId;
  }, [newestId, newestNode]);

  useEffect(() => {
    return () => {
      if (focusTimer.current) clearTimeout(focusTimer.current);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const handleGrew = useCallback(() => {
    router.refresh();
  }, [router]);

  const stageMeta = GROWTH_STAGES.find((s) => s.stage === graph.stage);
  const next = NEXT_STAGE_LABEL[graph.stage];
  const memoryCount =
    graph.counts.LEAF + graph.counts.FLOWER + graph.counts.FRUIT + graph.counts.MEMORY_MOMENT + graph.counts.PHOTO;

  // Linked family who could serve as a guardian (PERSON nodes bound to a real account).
  const familyOptions: FamilyOption[] = graph.nodes
    .filter((n) => n.kind === "PERSON" && n.linkedUserId)
    .map((n) => ({ userId: n.linkedUserId as string, name: n.title }));

  // Headline stats shown in the dashboard greeting card.
  const storiesCount = graph.counts.LEAF + graph.counts.MEMORY_MOMENT;
  const stats: { label: string; value: number }[] = [
    { label: "Stories", value: storiesCount },
    { label: "Memories", value: memoryCount },
    { label: "Family", value: graph.counts.PERSON },
    { label: "Trees", value: familyOptions.length + 1 },
  ];

  const initials = graph.profile.displayName
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const firstName = graph.profile.displayName.split(/\s+/)[0];
  const role = graph.profile.familyPosition || "Legacy Keeper";

  // Legacy Strength as a percentage of a fully-grown legacy (for the ring gauge).
  const finalMin = GROWTH_STAGES[GROWTH_STAGES.length - 1]?.minScore || 100;
  const legacyPct = Math.max(4, Math.min(100, Math.round((graph.legacyScore / finalMin) * 100)));

  // Browsable categories = the branch nodes hanging off the trunk.
  const branches = graph.nodes.filter((n) => n.kind === "BRANCH" || n.kind === "SUB_BRANCH");

  // Open a branch's category drawer (from the "My Tree" sheet).
  const openBranch = useCallback((node: ForestNodeDTO) => {
    setSheet(null);
    setSelected(node);
  }, []);

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden font-sans">
      {/* Hero 3D forest — full-bleed behind the mobile chrome. */}
      <div className="absolute inset-0">
        <ForestCanvas
          graph={graph}
          selectedId={selected?.id ?? null}
          focusId={focusId}
          onSelect={setSelected}
          memorial={graph.isMemorial}
          onOpenFamily={(userId) => router.push(`/family/${userId}`)}
        />
      </div>

      {/* Soft scrims keep top bar + bottom card legible over a bright canopy. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-40 bg-gradient-to-b from-black/65 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-72 bg-gradient-to-t from-black/75 via-black/40 to-transparent" />

      {/* ---------------- TOP BAR ---------------- */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 pt-safe">
        <div className="pointer-events-auto mx-auto flex w-full max-w-md items-center justify-between gap-3 px-4 py-3">
          <Link href="/forest" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/everroot-logo-transparent.png" alt="EverRoot" className="h-9 w-auto" />
            <span className="font-serif text-lg leading-none text-parchment [text-shadow:0_1px_6px_rgba(0,0,0,0.8)]">
              EverRoot
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <IconButton label="Search" onClick={() => setSheet("tree")}>
              {ICONS.search}
            </IconButton>
            <IconButton label="Notifications" onClick={() => setToast("You're all caught up.")}>
              {ICONS.bell}
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-canopy-light" />
            </IconButton>
            <button
              onClick={() => setSheet("more")}
              aria-label="Menu"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-parchment/25 bg-canopy/40 font-serif text-sm text-parchment shadow-lg backdrop-blur transition active:scale-95"
            >
              {initials}
            </button>
          </div>
        </div>
      </header>

      {/* Memorial banner. */}
      {graph.isMemorial ? (
        <div className="pointer-events-none absolute left-1/2 top-[4.5rem] z-20 w-full max-w-md -translate-x-1/2 px-6 text-center font-serif [text-shadow:0_1px_8px_rgba(0,0,0,0.9)]">
          <p className="text-xs uppercase tracking-[0.3em] text-parchment/60">In loving memory</p>
          <p className="text-lg text-parchment/90">{graph.profile.displayName}</p>
          {graph.memorialNote ? (
            <p className="mt-1 text-sm italic text-parchment/60">{graph.memorialNote}</p>
          ) : null}
        </div>
      ) : null}

      {/* Growth toast — announces what just grew. */}
      {toast ? (
        <div className="pointer-events-none absolute left-1/2 top-20 z-40 -translate-x-1/2 animate-[fadeIn_0.4s_ease-out]">
          <div className="flex items-center gap-2 rounded-full border border-fruit/40 bg-black/85 px-5 py-2 text-sm text-parchment shadow-lg backdrop-blur">
            <span className="text-fruit">✦</span>
            <span>{toast}</span>
          </div>
        </div>
      ) : null}

      {/* Category lantern → full drawer of everything hanging off that branch. */}
      {selected && (selected.kind === "BRANCH" || selected.kind === "SUB_BRANCH") ? (
        <CategoryPanel
          branchId={selected.id}
          branchTitle={selected.title}
          onClose={() => setSelected(null)}
        />
      ) : null}

      {/* Selected node detail — bottom sheet card on mobile. */}
      {selected && selected.kind !== "BRANCH" && selected.kind !== "SUB_BRANCH" ? (
        <div className="absolute inset-x-0 bottom-0 z-40">
          <div className="absolute inset-0 -top-[100vh]" onClick={() => setSelected(null)} />
          <div className="relative mx-auto w-full max-w-md animate-[sheetUp_0.28s_ease-out] rounded-t-3xl border-t border-parchment/15 bg-[#0b1710]/95 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl backdrop-blur-xl">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-parchment/25" />
            <p className="text-xs uppercase tracking-widest text-canopy-light">
              {selected.kind.replace(/_/g, " ")}
            </p>
            <h2 className="mt-1 font-serif text-xl text-parchment">{selected.title}</h2>
            {selected.summary ? (
              <p className="mt-2 text-sm text-parchment/75">{selected.summary}</p>
            ) : null}
            {selected.epoch ? (
              <p className="mt-2 text-xs text-parchment/50">Epoch · {selected.epoch.replace(/_/g, " ")}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {selected.kind === "PERSON" ? <InviteButton person={selected} /> : null}
              {isClipKind(selected.kind) ? <ShareClipButton node={selected} /> : null}
            </div>
            <button
              onClick={() => setSelected(null)}
              className="mt-4 w-full rounded-xl border border-parchment/20 py-2.5 text-sm text-parchment/70 transition active:scale-[0.98]"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      {/* ---------------- FLOATING STATS CARD ---------------- */}
      {!selected ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 px-4">
          <div className="pointer-events-auto mx-auto w-full max-w-md rounded-2xl border border-parchment/12 bg-black/55 p-4 backdrop-blur-md">
            <div className="flex items-center gap-4">
              <LegacyRing pct={legacyPct} />
              <div className="min-w-0 flex-1">
                <p className="font-serif text-lg leading-tight text-parchment">
                  {greeting}, {firstName} 🌱
                </p>
                <p className="mt-0.5 text-xs italic leading-snug text-parchment/55">
                  The roots of today build the branches of tomorrow.
                </p>
              </div>
              <button
                onClick={() => setShowIntro(true)}
                aria-label="Replay intro"
                className="shrink-0 text-parchment/40 transition active:scale-90 hover:text-parchment/80"
              >
                {ICONS.play}
              </button>
            </div>
            <div className="mt-3 grid grid-cols-4 divide-x divide-parchment/10">
              {stats.map((s) => (
                <div key={s.label} className="px-1 text-center">
                  <p className="font-serif text-lg leading-none text-parchment">{s.value}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-parchment/50">{s.label}</p>
                </div>
              ))}
            </div>
            <p className="mt-2.5 text-center text-[11px] text-parchment/45">
              <span className="text-fruit">{stageMeta?.label ?? graph.stage}</span>
              {next
                ? next.min - graph.legacyScore > 0
                  ? ` · ${next.min - graph.legacyScore} more to reach ${next.label}`
                  : ` · Ready to become ${next.label}`
                : " · Fully grown — an ancient legacy"}
            </p>
          </div>
        </div>
      ) : null}

      {/* ---------------- BOTTOM TAB BAR (Facebook-style) ---------------- */}
      <nav className="absolute inset-x-0 bottom-0 z-30 pb-safe">
        <div className="mx-auto flex w-full max-w-md items-end justify-around border-t border-parchment/10 bg-black/70 px-2 pb-2 pt-1.5 backdrop-blur-xl">
          <Tab label="Forest" active icon={ICONS.tree} onClick={() => setSheet(null)} />
          <Tab label="My Tree" icon={ICONS.branches} onClick={() => setSheet("tree")} />
          <CenterTab onClick={() => setSheet("create")} />
          <Tab label="Memories" icon={ICONS.photo} onClick={() => setSheet("memories")} />
          <Tab label="More" icon={ICONS.dots} onClick={() => setSheet("more")} />
        </div>
      </nav>

      {/* ---------------- BOTTOM SHEETS ---------------- */}
      {sheet === "create" ? (
        <BottomSheet title="Grow your forest" onClose={() => setSheet(null)}>
          <Link
            href="/interview"
            className="mb-4 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-canopy to-canopy-light py-3 text-sm font-medium text-white shadow transition active:scale-[0.98]"
          >
            {ICONS.mic} Record a memory
          </Link>
          <div className="rounded-2xl border border-parchment/12 bg-black/30 p-4">
            <GrowthPanel onGrew={handleGrew} />
          </div>
        </BottomSheet>
      ) : null}

      {sheet === "memories" ? (
        <BottomSheet title="Memories" onClose={() => setSheet(null)}>
          <div className="flex flex-wrap items-center gap-2">
            <StoryFeedPlayer ownerId={ownerId} ownerName={graph.profile.displayName} isSelf />
            <Link
              href={`/book/${ownerId}`}
              className="inline-flex items-center gap-2 rounded-full border border-parchment/25 bg-black/50 px-4 py-2 text-sm text-parchment/85 transition active:scale-95"
            >
              {ICONS.book}
              Book of the Tree
            </Link>
          </div>
          <p className="mt-4 text-xs text-parchment/45">
            Tap any glowing leaf, lantern, or family light on your tree to open that memory.
          </p>
        </BottomSheet>
      ) : null}

      {sheet === "tree" ? (
        <BottomSheet title="My Tree" onClose={() => setSheet(null)}>
          {branches.length ? (
            <div className="grid grid-cols-2 gap-2">
              {branches.map((b) => (
                <button
                  key={b.id}
                  onClick={() => openBranch(b)}
                  className="flex items-center gap-2 rounded-xl border border-parchment/12 bg-black/30 px-3 py-3 text-left transition active:scale-[0.98]"
                >
                  <span className="text-canopy-light">{ICONS.leaf}</span>
                  <span className="truncate text-sm text-parchment/90">{b.title}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-parchment/60">
              Your tree is just getting started. Tap the ＋ button to grow your first branch.
            </p>
          )}
          <Link
            href="/family"
            className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-parchment/20 py-3 text-sm text-parchment/85 transition active:scale-[0.98]"
          >
            {ICONS.people} Visit the family forest
          </Link>
        </BottomSheet>
      ) : null}

      {sheet === "more" ? (
        <BottomSheet title="More" onClose={() => setSheet(null)}>
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-parchment/10 bg-black/30 px-4 py-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-canopy/40 font-serif text-parchment">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-parchment">{graph.profile.displayName}</p>
              <p className="truncate text-[11px] text-parchment/45">{role}</p>
            </div>
          </div>
          <div className="space-y-2">
            <SheetLink href="/family" icon={ICONS.people}>Family forest</SheetLink>
            <SheetLink href={`/book/${ownerId}`} icon={ICONS.book}>Book of the Tree</SheetLink>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-parchment/12 bg-black/30 px-3 py-3">
              <CapsulePanel ownerId={ownerId} ownerName={graph.profile.displayName} isSelf />
              <GuardianPanel
                ownerId={ownerId}
                isMemorial={graph.isMemorial}
                memorialNote={graph.memorialNote}
                currentGuardianId={guardianId}
                family={familyOptions}
              />
            </div>
            <button
              onClick={() => {
                setSheet(null);
                setShowIntro(true);
              }}
              className="flex w-full items-center gap-3 rounded-xl border border-parchment/12 bg-black/30 px-4 py-3 text-left text-sm text-parchment/85 transition active:scale-[0.98]"
            >
              <span className="text-parchment/60">{ICONS.play}</span> Replay the opening
            </button>
            <form action={signOutAction}>
              <button className="flex w-full items-center gap-3 rounded-xl border border-parchment/12 bg-black/30 px-4 py-3 text-left text-sm text-parchment/85 transition active:scale-[0.98]">
                <span className="text-parchment/60">{ICONS.signout}</span> Sign out
              </button>
            </form>
          </div>
        </BottomSheet>
      ) : null}

      {/* Cinematic opening — plays over everything. */}
      {showIntro ? (
        <ForestIntro displayName={graph.profile.displayName} onComplete={completeIntro} />
      ) : null}
    </div>
  );
}

/* ---------------- Mobile chrome pieces ---------------- */

// Round top-bar icon button (search, notifications).
function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="relative flex h-10 w-10 items-center justify-center rounded-full border border-parchment/20 bg-black/40 text-parchment/85 shadow-lg backdrop-blur transition active:scale-95"
    >
      {children}
    </button>
  );
}

// A bottom-tab-bar item.
function Tab({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 flex-col items-center gap-0.5 py-1 transition active:scale-95 ${
        active ? "text-canopy-light" : "text-parchment/55"
      }`}
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}

// The glowing center "+" — the primary create action, Facebook-style.
function CenterTab({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex flex-1 justify-center">
      <button
        onClick={onClick}
        aria-label="Grow your forest"
        className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-fruit to-canopy-light text-black shadow-[0_0_24px_rgba(232,163,61,0.55)] ring-4 ring-black/40 transition active:scale-95"
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
  );
}

// A slide-up modal sheet anchored to the bottom of the phone frame.
function BottomSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 animate-[scrimIn_0.2s_ease-out] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0 mx-auto max-h-[82dvh] w-full max-w-md animate-[sheetUp_0.28s_ease-out] overflow-y-auto rounded-t-3xl border-t border-parchment/15 bg-[#0b1710]/97 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl backdrop-blur-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-parchment/25" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-xl text-parchment">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-parchment/20 text-parchment/60 transition active:scale-90"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// A tappable row link inside the "More" sheet.
function SheetLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex w-full items-center gap-3 rounded-xl border border-parchment/12 bg-black/30 px-4 py-3 text-sm text-parchment/85 transition active:scale-[0.98]"
    >
      <span className="text-parchment/60">{icon}</span>
      {children}
    </Link>
  );
}

// Circular Legacy Strength gauge for the floating stats card.
function LegacyRing({ pct }: { pct: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(246,241,231,0.12)" strokeWidth="5" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke="#4caf6d"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-serif text-base leading-none text-canopy-light">{pct}%</span>
        <span className="mt-0.5 text-[8px] uppercase tracking-wide text-parchment/45">Legacy</span>
      </div>
    </div>
  );
}

/* ---------------- Inline icon set ---------------- */

function icon(children: ReactNode) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

const ICONS = {
  tree: icon(
    <>
      <path d="M12 22v-6" />
      <path d="M9 16a4 4 0 0 1-1-7.7A4.5 4.5 0 1 1 16 8a4 4 0 0 1-1 8Z" />
    </>,
  ),
  timeline: icon(
    <>
      <line x1="4" y1="12" x2="20" y2="12" />
      <circle cx="8" cy="12" r="1.7" />
      <circle cx="16" cy="12" r="1.7" />
    </>,
  ),
  people: icon(
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.5a3 3 0 0 1 0 5.5" />
      <path d="M17.5 20a5.5 5.5 0 0 0-3-4.9" />
    </>,
  ),
  pin: icon(
    <>
      <path d="M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10Z" />
      <circle cx="12" cy="11" r="2" />
    </>,
  ),
  search: icon(
    <>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.5" y2="16.5" />
    </>,
  ),
  mic: icon(
    <>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </>,
  ),
  capsule: icon(
    <>
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <path d="M3 8l3-4h12l3 4" />
      <line x1="12" y1="12" x2="12" y2="16" />
    </>,
  ),
  settings: icon(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
    </>,
  ),
  leaf: icon(<path d="M4 20c8 0 16-4 16-16C8 4 4 12 4 20Zm0 0c2-6 6-8 10-9" />),
  sun: icon(
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </>,
  ),
  signout: icon(
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </>,
  ),
  tools: icon(
    <>
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.1 2.1-2.1-.6-.6-2.1Z" />
    </>,
  ),
  bell: icon(
    <>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </>,
  ),
  play: icon(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.5l5 3.5-5 3.5z" />
    </>,
  ),
  branches: icon(
    <>
      <path d="M12 22V7" />
      <path d="M12 12L7 7" />
      <path d="M12 10l5-5" />
      <circle cx="6" cy="6" r="1.8" />
      <circle cx="18" cy="4" r="1.8" />
      <circle cx="12" cy="5" r="1.8" />
    </>,
  ),
  photo: icon(
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="M21 16l-5-5-6 6-2-2-5 5" />
    </>,
  ),
  dots: icon(
    <>
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </>,
  ),
  book: icon(
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </>,
  ),
};
