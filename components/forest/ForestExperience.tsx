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
  const [panelOpen, setPanelOpen] = useState(true);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showIntro, setShowIntro] = useState(false);
  const [greeting, setGreeting] = useState("Welcome back");
  const [toolsOpen, setToolsOpen] = useState(false);

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

  const navItems: { label: string; href?: string; active?: boolean; icon: ReactNode }[] = [
    { label: "My Forest", href: "/forest", active: true, icon: ICONS.tree },
    { label: "Timeline", icon: ICONS.timeline },
    { label: "People", href: "/family", icon: ICONS.people },
    { label: "Places", icon: ICONS.pin },
    { label: "Search", icon: ICONS.search },
    { label: "Daily Prompt", href: "/interview", icon: ICONS.mic },
    { label: "Time Capsules", href: "/interview", icon: ICONS.capsule },
    { label: "Settings", icon: ICONS.settings },
  ];

  return (
    <div className="relative h-screen w-screen overflow-hidden font-sans">
      {/* Hero 3D forest — full-bleed behind the dashboard chrome. */}
      <div className="absolute inset-0">
        <ForestCanvas
          graph={graph}
          selectedId={selected?.id ?? null}
          focusId={focusId}
          onSelect={setSelected}
          memorial={graph.isMemorial}
        />
      </div>

      {/* Soft scrims keep the floating panels legible over a bright canopy. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-72 bg-gradient-to-r from-black/50 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-96 bg-gradient-to-l from-black/40 to-transparent" />

      {/* Memorial banner. */}
      {graph.isMemorial ? (
        <div className="pointer-events-none absolute left-1/2 top-6 z-30 -translate-x-1/2 text-center font-serif [text-shadow:0_1px_8px_rgba(0,0,0,0.9)]">
          <p className="text-xs uppercase tracking-[0.3em] text-parchment/60">In loving memory</p>
          <p className="text-lg text-parchment/90">{graph.profile.displayName}</p>
          {graph.memorialNote ? (
            <p className="mt-1 max-w-md text-sm italic text-parchment/60">{graph.memorialNote}</p>
          ) : null}
        </div>
      ) : null}

      {/* ---------------- LEFT SIDEBAR ---------------- */}
      <aside className="pointer-events-auto absolute left-0 top-0 z-20 flex h-full w-60 flex-col border-r border-parchment/10 bg-black/55 backdrop-blur-md">
        <div className="px-5 pt-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/everroot-logo-transparent.png" alt="EverRoot" className="h-11 w-auto" />
          <p className="mt-1 text-[11px] tracking-wide text-parchment/45">Grow Your Legacy. Share Forever.</p>
        </div>

        <nav className="mt-5 flex-1 space-y-0.5 overflow-y-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {navItems.map((item) => (
            <NavItem key={item.label} {...item} />
          ))}
        </nav>

        {/* Today's Prompt. */}
        <div className="mx-3 mb-3 rounded-xl border border-canopy-light/25 bg-canopy/15 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-canopy-light">
            {ICONS.leaf} Today&apos;s Prompt
          </p>
          <p className="mt-1.5 text-sm leading-snug text-parchment/85">
            What is a lesson life taught you the hard way?
          </p>
          <Link
            href="/interview"
            className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-canopy to-canopy-light py-2 text-sm font-medium text-white shadow transition hover:brightness-110"
          >
            {ICONS.mic} Record Memory
          </Link>
        </div>

        {/* Profile + sign out. */}
        <div className="flex items-center gap-3 border-t border-parchment/10 px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-canopy/40 font-serif text-sm text-parchment">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-parchment">{graph.profile.displayName}</p>
            <p className="truncate text-[11px] text-parchment/45">{role}</p>
          </div>
          <form action={signOutAction}>
            <button title="Sign out" className="text-parchment/40 transition hover:text-parchment/80">
              {ICONS.signout}
            </button>
          </form>
        </div>
      </aside>

      {/* ---------------- TOP-RIGHT: greeting + stats ---------------- */}
      <div className="pointer-events-auto absolute right-5 top-5 z-20 w-80 max-w-[calc(100vw-16rem)]">
        <div className="rounded-2xl border border-parchment/12 bg-black/55 p-4 backdrop-blur-md">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-fruit">{ICONS.sun}</span>
            <div className="min-w-0 flex-1">
              <p className="font-serif text-lg leading-tight text-parchment">
                {greeting}, {firstName}
              </p>
              <p className="text-xs text-parchment/55">Your forest is growing beautifully.</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {stats.map((s) => (
              <div key={s.label} className="rounded-lg bg-white/[0.06] px-1 py-2 text-center">
                <p className="font-serif text-lg leading-none text-parchment">{s.value}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wide text-parchment/50">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="text-fruit">{stageMeta?.label ?? graph.stage}</span>
            <span className="text-parchment/30">·</span>
            <span className="text-parchment/70">Legacy {graph.legacyScore}</span>
            <button
              onClick={() => setShowIntro(true)}
              className="ml-auto text-parchment/40 transition hover:text-parchment/80"
            >
              ▶ Replay
            </button>
          </div>
          {next ? (
            <p className="mt-1.5 text-[11px] text-parchment/45">
              {next.min - graph.legacyScore > 0
                ? `${next.min - graph.legacyScore} more to reach ${next.label}`
                : `Ready to become ${next.label}`}
            </p>
          ) : (
            <p className="mt-1.5 text-[11px] text-parchment/45">Fully grown — an ancient legacy</p>
          )}
        </div>
      </div>

      {/* Growth toast — announces what just grew. */}
      {toast ? (
        <div className="pointer-events-none absolute left-1/2 top-6 z-30 -translate-x-1/2 animate-[fadeIn_0.4s_ease-out]">
          <div className="flex items-center gap-2 rounded-full border border-fruit/40 bg-black/80 px-5 py-2 text-sm text-parchment shadow-lg backdrop-blur">
            <span className="text-fruit">✦</span>
            <span>{toast}</span>
          </div>
        </div>
      ) : null}

      {/* Selected node detail. */}
      {selected ? (
        <div className="absolute bottom-5 left-64 z-20 max-w-sm rounded-2xl border border-parchment/15 bg-black/70 p-5 backdrop-blur">
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
          {selected.kind === "PERSON" ? <InviteButton person={selected} /> : null}
          {isClipKind(selected.kind) ? <ShareClipButton node={selected} /> : null}
          <button
            onClick={() => setSelected(null)}
            className="mt-3 text-xs text-parchment/50 hover:text-parchment"
          >
            Close
          </button>
        </div>
      ) : null}

      {/* Cinematic opening — plays over everything. */}
      {showIntro ? (
        <ForestIntro displayName={graph.profile.displayName} onComplete={completeIntro} />
      ) : null}

      {/* ---------------- BOTTOM-RIGHT: tools ---------------- */}
      <div className="absolute bottom-5 right-5 z-20 flex flex-col items-end gap-3">
        {toolsOpen ? (
          <div className="max-h-[70vh] w-80 max-w-[90vw] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <StoryFeedPlayer ownerId={ownerId} ownerName={graph.profile.displayName} isSelf />
              <Link
                href={`/book/${ownerId}`}
                className="inline-flex items-center gap-2 rounded-full border border-parchment/25 bg-black/50 px-4 py-1.5 text-sm text-parchment/85 transition hover:border-parchment/60 hover:text-parchment"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
                Book of the Tree
              </Link>
              <CapsulePanel ownerId={ownerId} ownerName={graph.profile.displayName} isSelf />
              <GuardianPanel
                ownerId={ownerId}
                isMemorial={graph.isMemorial}
                memorialNote={graph.memorialNote}
                currentGuardianId={guardianId}
                family={familyOptions}
              />
            </div>
            <div className="rounded-2xl border border-parchment/15 bg-black/70 backdrop-blur">
              <button
                onClick={() => setPanelOpen((o) => !o)}
                className="flex w-full items-center justify-between px-5 py-3 text-left"
              >
                <span className="font-serif text-lg text-parchment">Grow your forest</span>
                <span className="text-parchment/50">{panelOpen ? "–" : "+"}</span>
              </button>
              {panelOpen ? (
                <div className="border-t border-parchment/10 p-5 pt-4">
                  <GrowthPanel onGrew={handleGrew} />
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        <button
          onClick={() => setToolsOpen((o) => !o)}
          className="inline-flex items-center gap-2 rounded-full border border-parchment/25 bg-black/60 px-4 py-2 text-sm text-parchment/85 shadow-lg backdrop-blur transition hover:border-parchment/60 hover:text-parchment"
        >
          {ICONS.tools}
          {toolsOpen ? "Close tools" : "Tools"}
        </button>
      </div>
    </div>
  );
}

/* ---------------- Sidebar nav item ---------------- */

function NavItem({
  label,
  href,
  active,
  icon,
}: {
  label: string;
  href?: string;
  active?: boolean;
  icon: ReactNode;
}) {
  const base = "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition";
  if (!href) {
    return (
      <span className={`${base} cursor-default text-parchment/30`} title="Coming soon">
        <span className="shrink-0 opacity-70">{icon}</span>
        <span>{label}</span>
        <span className="ml-auto text-[9px] uppercase tracking-wide text-parchment/25">soon</span>
      </span>
    );
  }
  return (
    <Link
      href={href}
      className={`${base} ${
        active
          ? "bg-canopy/30 text-parchment"
          : "text-parchment/70 hover:bg-white/5 hover:text-parchment"
      }`}
    >
      <span className={`shrink-0 ${active ? "text-canopy-light" : ""}`}>{icon}</span>
      <span>{label}</span>
    </Link>
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
};
