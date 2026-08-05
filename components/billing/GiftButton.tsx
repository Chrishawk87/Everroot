"use client";

import { useFormStatus } from "react-dom";
import { startGiftCheckout } from "@/app/actions/gift";

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
 * The "buy as a gift" call to action. A plain form whose action is the
 * server-side {@link startGiftCheckout}, which creates the Stripe Checkout
 * Session and redirects the browser to Stripe's hosted payment page.
 */
export default function GiftButton({ label }: { label: string }) {
  return (
    <form action={startGiftCheckout} className="w-full">
      <Inner label={label} />
    </form>
  );
}
