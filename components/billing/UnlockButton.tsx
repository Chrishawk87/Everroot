"use client";

import { useFormStatus } from "react-dom";
import { startCheckout } from "@/app/actions/billing";

function Inner({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-full bg-canopy px-6 py-3 font-sans font-semibold text-white transition hover:bg-canopy-light disabled:opacity-60"
    >
      {pending ? "Opening secure checkout…" : label}
    </button>
  );
}

/**
 * The "unlock" call to action. A plain form whose action is the server-side
 * {@link startCheckout}, which creates the Stripe Checkout Session and redirects
 * the browser to Stripe's hosted payment page.
 */
export default function UnlockButton({ label }: { label: string }) {
  return (
    <form action={startCheckout} className="w-full">
      <Inner label={label} />
    </form>
  );
}
