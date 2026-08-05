"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { login, type ActionState } from "@/app/actions/auth";
import { brandImage, BRAND } from "@/lib/brand";

const initialState: ActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 w-full rounded-full bg-canopy px-6 py-3 font-sans font-semibold text-white transition hover:bg-canopy-light disabled:opacity-60"
    >
      {pending ? "Entering your forest…" : "Enter my forest"}
    </button>
  );
}

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { next?: string };
}) {
  const [state, formAction] = useFormState(login, initialState);
  const next = typeof searchParams?.next === "string" ? searchParams.next : undefined;

  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-5 py-[max(3rem,env(safe-area-inset-top))]">
      {/* Golden-hour valley — the world you're returning to. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={brandImage("valleyHero")}
        alt={BRAND.valleyHero.alt}
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover"
        style={{ objectPosition: BRAND.valleyHero.focus }}
      />
      {/* Legibility scrim so the form panel reads over the art. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 45%, rgba(6,16,10,0.35) 0%, rgba(6,16,10,0.68) 60%, rgba(6,16,10,0.90) 100%)",
        }}
      />

      <div className="relative z-10 w-full max-w-md rounded-3xl border border-parchment/15 bg-black/35 p-6 backdrop-blur-md sm:p-8">
      <h1 className="mb-2 font-serif text-3xl text-parchment">Welcome back</h1>
      <p className="mb-8 text-parchment/70">Return to your Living Legacy Forest.</p>

      <form action={formAction} className="flex flex-col gap-4 font-sans">
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-parchment/80">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="rounded-lg border border-parchment/20 bg-black/20 px-4 py-3 text-base text-parchment outline-none transition focus:border-canopy-light"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-parchment/80">Password</span>
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="rounded-lg border border-parchment/20 bg-black/20 px-4 py-3 text-base text-parchment outline-none transition focus:border-canopy-light"
          />
        </label>

        {state.error ? (
          <p className="rounded-lg bg-red-900/40 px-4 py-2 text-sm text-red-200">{state.error}</p>
        ) : null}

        <SubmitButton />
      </form>

      <p className="mt-6 text-center text-sm text-parchment/60">
        New here?{" "}
        <Link href="/signup" className="text-canopy-light hover:underline">
          Plant your seed
        </Link>
      </p>
      </div>
    </main>
  );
}
