import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { brandImage, BRAND } from "@/lib/brand";
import { getGiftByCode, redeemGift } from "@/lib/gift";

export const dynamic = "force-dynamic";

/**
 * Where a gift recipient lands. Behaviour depends on who's here:
 *   - signed in + valid code → redeem immediately, then into their forest;
 *   - signed in, no/invalid code → prompt to paste the code;
 *   - signed out → welcome them and route to signup (new) or login (returning),
 *     carrying the code so redemption happens right after they're authenticated.
 */
export default async function RedeemPage({
  searchParams,
}: {
  searchParams: { code?: string; status?: string };
}) {
  const rawCode = typeof searchParams.code === "string" ? searchParams.code.trim() : "";
  const code = rawCode.toUpperCase();
  const session = await auth();
  const signedIn = Boolean(session?.user?.id);

  // Signed in with a code → try to redeem right now.
  let failure: "not_found" | "already_redeemed" | null = null;
  if (signedIn && code) {
    const result = await redeemGift(code, session!.user!.id);
    if (result.ok) redirect("/forest");
    failure = result.reason;
  }

  // Signed out with a code → confirm it's real, then send them to auth carrying it.
  let giftValid = false;
  if (!signedIn && code) {
    const gift = await getGiftByCode(code);
    giftValid = Boolean(gift && !gift.redeemedByUserId);
  }

  const shell = (children: React.ReactNode) => (
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
        {children}
      </div>
    </main>
  );

  // Signed OUT with a valid code → welcome + route to auth carrying the code.
  if (!signedIn && giftValid) {
    return shell(
      <>
        <h1 className="mb-3 font-serif text-3xl text-parchment">You&rsquo;ve been given EverRoot</h1>
        <p className="mb-6 text-parchment/75">
          Someone gifted you a lifetime forest — a place to keep every memory,
          voice, and story for the generations who come after. Create your account
          to claim it.
        </p>
        <Link
          href={`/signup?gift=${code}`}
          className="block w-full rounded-full bg-canopy px-6 py-3 font-sans font-semibold text-white transition hover:bg-canopy-light"
        >
          Claim my gift
        </Link>
        <p className="mt-5 text-sm text-parchment/60">
          Already have a forest?{" "}
          <Link
            href={`/login?next=${encodeURIComponent(`/redeem?code=${code}`)}`}
            className="text-canopy-light hover:underline"
          >
            Sign in to claim it
          </Link>
        </p>
      </>,
    );
  }

  // Any remaining case → show the "enter your code" prompt with context.
  const message =
    failure === "already_redeemed"
      ? "This gift has already been redeemed."
      : failure === "not_found" || (code && !giftValid)
        ? "We couldn't find that gift code. Please check it and try again."
        : null;

  return shell(
    <>
      <h1 className="mb-3 font-serif text-3xl text-parchment">Redeem your gift</h1>
      <p className="mb-6 text-parchment/75">
        Enter the gift code you received to unlock your EverRoot forever.
      </p>

      {message ? (
        <p className="mb-4 rounded-lg bg-red-900/40 px-4 py-2 text-sm text-red-200">{message}</p>
      ) : null}

      <form method="get" action="/redeem" className="flex flex-col gap-3">
        <input
          name="code"
          required
          defaultValue={code || undefined}
          placeholder="EVR-XXXX-XXXX"
          autoComplete="off"
          className="rounded-lg border border-parchment/20 bg-black/20 px-4 py-3 text-center font-mono tracking-wide text-parchment outline-none transition focus:border-canopy-light"
        />
        <button
          type="submit"
          className="w-full rounded-full bg-canopy px-6 py-3 font-sans font-semibold text-white transition hover:bg-canopy-light"
        >
          Redeem gift
        </button>
      </form>

      {!signedIn ? (
        <p className="mt-5 text-sm text-parchment/60">
          New to EverRoot?{" "}
          <Link href="/signup" className="text-canopy-light hover:underline">
            Create your account
          </Link>{" "}
          first, then redeem.
        </p>
      ) : null}
    </>,
  );
}
