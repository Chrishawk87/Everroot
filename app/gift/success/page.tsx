import Link from "next/link";
import { headers } from "next/headers";
import { brandImage, BRAND } from "@/lib/brand";
import { stripe, billingConfigured } from "@/lib/billing";
import { createGiftForSession } from "@/lib/gift";
import CopyField from "@/components/billing/CopyField";

export const dynamic = "force-dynamic";

/**
 * Where Stripe returns the buyer after a gift purchase. We verify the session
 * was actually paid, mint (idempotently) the redeemable GiftCode, and show the
 * buyer the code plus a shareable redeem link to pass to the recipient. The
 * webhook is the backup path that creates the same code if this page is skipped.
 */
export default async function GiftSuccessPage({
  searchParams,
}: {
  searchParams: { session_id?: string };
}) {
  const sessionId =
    typeof searchParams.session_id === "string" ? searchParams.session_id : undefined;

  let code: string | null = null;
  let error: string | null = null;

  if (!sessionId || !billingConfigured()) {
    error = "We couldn't find that purchase. If you were charged, please contact us.";
  } else {
    try {
      const cs = await stripe().checkout.sessions.retrieve(sessionId);
      if (cs.payment_status === "paid") {
        const gift = await createGiftForSession({
          sessionId: cs.id,
          purchaserEmail: cs.customer_details?.email ?? cs.customer_email ?? null,
        });
        code = gift.code;
      } else {
        error = "This purchase isn't complete yet. If you were charged, please contact us.";
      }
    } catch {
      error = "We couldn't confirm that purchase just now. If you were charged, please contact us.";
    }
  }

  const h = headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host");
  const redeemUrl = code ? `${proto}://${host}/redeem?code=${code}` : "";

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
          className="mx-auto mb-6 w-[200px] max-w-full drop-shadow-[0_4px_24px_rgba(0,0,0,0.7)]"
        />

        {code ? (
          <>
            <h1 className="mb-3 font-serif text-3xl text-parchment">Your gift is ready</h1>
            <p className="mb-6 text-parchment/75">
              Share the link or code below with the person you&rsquo;re gifting
              EverRoot to. When they redeem it, their forest is theirs forever.
            </p>

            <div className="mb-4 text-left">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-parchment/50">
                Shareable link
              </p>
              <CopyField value={redeemUrl} />
            </div>

            <div className="mb-6 text-left">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-parchment/50">
                Gift code
              </p>
              <CopyField value={code} mono />
            </div>

            <p className="text-sm text-parchment/60">
              Keep this code somewhere safe — it&rsquo;s the key to the gift.
            </p>
          </>
        ) : (
          <>
            <h1 className="mb-3 font-serif text-3xl text-parchment">Something went wrong</h1>
            <p className="mb-6 text-parchment/75">{error}</p>
            <Link
              href="/gift"
              className="text-canopy-light hover:underline"
            >
              Back to gifting
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
