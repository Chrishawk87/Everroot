import Link from "next/link";
import { brandImage, BRAND } from "@/lib/brand";
import GiftButton from "@/components/billing/GiftButton";

export const dynamic = "force-dynamic";

/**
 * The public "give EverRoot as a gift" page. Anyone — no account needed — can
 * buy one lifetime unlock here; on payment they receive a code and a shareable
 * link to pass to the person they're gifting it to.
 */
export default function GiftPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const status = typeof searchParams.status === "string" ? searchParams.status : undefined;

  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-5 py-[max(3rem,env(safe-area-inset-top))]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={brandImage("valleyHero")}
        alt={BRAND.valleyHero.alt}
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover"
        style={{ objectPosition: BRAND.valleyHero.focus }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 45%, rgba(6,16,10,0.35) 0%, rgba(6,16,10,0.68) 60%, rgba(6,16,10,0.92) 100%)",
        }}
      />

      <div className="relative z-10 w-full max-w-md rounded-3xl border border-parchment/15 bg-black/35 p-6 text-center backdrop-blur-md sm:p-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/everroot-logo-transparent.png"
          alt="EverRoot"
          className="mx-auto mb-6 w-[220px] max-w-full drop-shadow-[0_4px_24px_rgba(0,0,0,0.7)]"
        />

        <h1 className="mb-3 font-serif text-3xl text-parchment">Give EverRoot as a gift</h1>

        <p className="mb-6 text-parchment/75">
          The most meaningful gift is a place to keep what matters. Give someone
          you love a forest to grow — every memory, voice, and story preserved for
          the generations who come after.
        </p>

        <div className="mb-6 rounded-2xl border border-parchment/15 bg-black/20 px-5 py-4">
          <p className="font-serif text-lg text-parchment">One payment. Theirs forever.</p>
          <div className="mt-2 flex items-baseline justify-center gap-2">
            <span className="font-serif text-4xl text-parchment">$99</span>
            <span className="text-lg text-parchment/40 line-through">$149</span>
          </div>
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-canopy-light">
            Founder pricing — limited time
          </p>
          <p className="mt-2 text-sm text-parchment/60">
            No subscription, no renewals — a single lifetime unlock.
          </p>
        </div>

        {status === "cancel" ? (
          <p className="mb-4 rounded-lg bg-black/30 px-4 py-2 text-sm text-parchment/70">
            No charge was made. You can send the gift whenever you&rsquo;re ready.
          </p>
        ) : null}

        {status === "unconfigured" || status === "error" ? (
          <p className="mb-4 rounded-lg bg-red-900/40 px-4 py-2 text-sm text-red-200">
            We couldn&rsquo;t start checkout just now. Please try again shortly.
          </p>
        ) : null}

        <GiftButton label="Buy a gift — $99" />

        <p className="mt-5 text-sm text-parchment/60">
          After you pay, you&rsquo;ll get a code and a link to share with them.
        </p>

        <p className="mt-4 text-sm text-parchment/50">
          Have a gift code?{" "}
          <Link href="/redeem" className="text-canopy-light hover:underline">
            Redeem it here
          </Link>
        </p>
      </div>
    </main>
  );
}
