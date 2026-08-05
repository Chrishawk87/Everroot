import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { brandImage, BRAND } from "@/lib/brand";
import {
  getUserBilling,
  accessState,
  grantLifetime,
  stripe,
  billingConfigured,
} from "@/lib/billing";
import UnlockButton from "@/components/billing/UnlockButton";

export const dynamic = "force-dynamic";

/**
 * The paywall. Reached when a lapsed-trial owner tries to enter their forest,
 * or when Stripe returns the buyer after checkout. It:
 *   1. confirms a returning payment (?session_id=…) server-side and unlocks;
 *   2. otherwise shows trial status + the one-time lifetime unlock CTA.
 */
export default async function UnlockPage({
  searchParams,
}: {
  searchParams: { session_id?: string; status?: string };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  // Returned from Stripe with a session id → verify the payment and unlock.
  const sessionId =
    typeof searchParams.session_id === "string" ? searchParams.session_id : undefined;
  if (sessionId && billingConfigured()) {
    let unlocked = false;
    try {
      const cs = await stripe().checkout.sessions.retrieve(sessionId);
      const belongsToUser =
        cs.metadata?.userId === userId || cs.client_reference_id === userId;
      if (belongsToUser && cs.payment_status === "paid") {
        await grantLifetime(userId, {
          sessionId: cs.id,
          customerId: typeof cs.customer === "string" ? cs.customer : undefined,
        });
        unlocked = true;
      }
    } catch {
      // Verification hiccup — fall through; the webhook is the backup path.
    }
    if (unlocked) redirect("/forest");
  }

  const billing = await getUserBilling(userId);
  const access = billing ? accessState(billing) : null;
  if (access?.isPaid) redirect("/forest");

  const status = typeof searchParams.status === "string" ? searchParams.status : undefined;
  const inTrial = access?.inTrial ?? false;
  const daysLeft = access?.trialDaysLeft ?? 0;

  const headline = inTrial
    ? daysLeft <= 1
      ? "Your free trial ends today"
      : `${daysLeft} days left in your free trial`
    : "Your free trial has ended";

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

        <h1 className="mb-3 font-serif text-3xl text-parchment">{headline}</h1>

        <p className="mb-6 text-parchment/75">
          {inTrial
            ? "Unlock EverRoot now and every memory, voice, and story you gather is kept safe — for you and for the generations who come after."
            : "Your forest is waiting. Unlock EverRoot to keep growing it — every memory, voice, and story preserved for generations to come."}
        </p>

        <div className="mb-6 rounded-2xl border border-parchment/15 bg-black/20 px-5 py-4">
          <p className="font-serif text-lg text-parchment">One payment. Yours forever.</p>
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
            No charge was made. You can unlock whenever you&rsquo;re ready.
          </p>
        ) : null}

        {status === "unconfigured" ? (
          <p className="mb-4 rounded-lg bg-red-900/40 px-4 py-2 text-sm text-red-200">
            Checkout isn&rsquo;t configured yet. Please try again shortly.
          </p>
        ) : null}

        <UnlockButton label="Unlock EverRoot forever" />

        {inTrial ? (
          <p className="mt-5 text-sm text-parchment/60">
            <Link href="/forest" className="text-canopy-light hover:underline">
              Not now — keep exploring my forest
            </Link>
          </p>
        ) : (
          <p className="mt-5 text-sm text-parchment/50">
            Questions? Reach us any time — we&rsquo;re here to help you preserve what matters.
          </p>
        )}

        <p className="mt-4 border-t border-parchment/10 pt-4 text-sm text-parchment/60">
          Want to give EverRoot to someone you love?{" "}
          <Link href="/gift" className="text-canopy-light hover:underline">
            Buy it as a gift
          </Link>
        </p>
      </div>
    </main>
  );
}
