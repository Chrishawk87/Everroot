"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { signup, type ActionState } from "@/app/actions/auth";
import type { InvitePreview } from "@/app/actions/family";
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
      {pending ? "Planting your seed…" : "Plant my seed"}
    </button>
  );
}

export default function SignupForm({ invite }: { invite?: InvitePreview | null }) {
  const [state, formAction] = useFormState(signup, initialState);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-12">
      {/* Inside the sunlit canopy — where a new life begins as a seed. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={brandImage("canopy")}
        alt={BRAND.canopy.alt}
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover"
        style={{ objectPosition: BRAND.canopy.focus }}
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

      <div className="relative z-10 w-full max-w-md rounded-3xl border border-parchment/15 bg-black/35 p-8 backdrop-blur-md">
      <h1 className="mb-2 font-serif text-3xl text-parchment">Plant your seed</h1>

      {invite ? (
        <div className="mb-6 rounded-2xl border border-canopy-light/40 bg-canopy/20 px-5 py-4">
          <p className="text-sm text-parchment/90">
            <span className="font-semibold text-canopy-light">{invite.inviterName}</span>{" "}
            invited you to grow your own tree in their family forest
            {invite.relationship ? (
              <>
                {" "}
                as their <span className="text-canopy-light">{invite.relationship}</span>
              </>
            ) : null}
            .
          </p>
          <p className="mt-1 text-xs text-parchment/60">
            Your tree will connect to theirs underground — the start of your family forest.
          </p>
        </div>
      ) : (
        <p className="mb-8 text-parchment/70">
          Create your account and begin your Living Legacy Forest.
        </p>
      )}

      <form action={formAction} className="flex flex-col gap-4 font-sans">
        {invite ? <input type="hidden" name="inviteCode" value={invite.code} /> : null}
        <Field
          label="Your name"
          name="displayName"
          type="text"
          required
          autoComplete="name"
          defaultValue={invite?.inviteeName ?? undefined}
        />
        <Field label="Email" name="email" type="email" required autoComplete="email" />
        <Field
          label="Password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          hint="At least 8 characters"
        />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Birth year" name="birthYear" type="number" placeholder="1952" />
          <Field label="Family role" name="familyPosition" type="text" placeholder="Grandfather" />
        </div>

        {state.error ? (
          <p className="rounded-lg bg-red-900/40 px-4 py-2 text-sm text-red-200">{state.error}</p>
        ) : null}

        <SubmitButton />
      </form>

      <p className="mt-6 text-center text-sm text-parchment/60">
        Already have a forest?{" "}
        <Link href="/login" className="text-canopy-light hover:underline">
          Sign in
        </Link>
      </p>
      </div>
    </main>
  );
}

function Field({
  label,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-parchment/80">{label}</span>
      <input
        {...props}
        className="rounded-lg border border-parchment/20 bg-black/20 px-4 py-2.5 text-parchment outline-none transition focus:border-canopy-light"
      />
      {hint ? <span className="text-xs text-parchment/50">{hint}</span> : null}
    </label>
  );
}
