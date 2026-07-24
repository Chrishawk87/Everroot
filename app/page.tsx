import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { brandImage, BRAND } from "@/lib/brand";

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/forest");

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 text-center">
      {/* Cinematic hero backdrop — establishes the visual language on first sight. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={brandImage("reveal")}
        alt={BRAND.reveal.alt}
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover"
        style={{ objectPosition: BRAND.reveal.focus }}
      />
      {/* Warm legibility scrim so text and buttons stay readable over the art. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 40%, rgba(6,16,10,0.30) 0%, rgba(6,16,10,0.62) 60%, rgba(6,16,10,0.86) 100%)",
        }}
      />

      <div className="relative z-10 flex max-w-3xl flex-col items-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/everroot-logo-transparent.png"
        alt="EverRoot — the living legacy forest"
        className="mb-8 w-[320px] max-w-full drop-shadow-[0_4px_24px_rgba(0,0,0,0.7)] md:w-[420px]"
      />
      <p className="mb-10 max-w-xl text-lg text-parchment/90 [text-shadow:0_2px_16px_rgba(0,0,0,0.6)]">
        Preserve your family&apos;s history before it&apos;s gone. Every person begins as a
        seed. Every story grows a tree. Every family becomes a forest that future
        generations can walk through.
      </p>
      <div className="flex flex-col gap-4 sm:flex-row">
        <Link
          href="/signup"
          className="rounded-full bg-canopy px-8 py-3 font-sans text-base font-semibold text-white transition hover:bg-canopy-light"
        >
          Plant your seed
        </Link>
        <Link
          href="/login"
          className="rounded-full border border-parchment/30 px-8 py-3 font-sans text-base font-semibold text-parchment transition hover:border-parchment/60"
        >
          Return to your forest
        </Link>
      </div>
      </div>
    </main>
  );
}
