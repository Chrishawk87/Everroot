"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  stripe,
  stripePriceId,
  billingConfigured,
  getUserBilling,
  accessState,
} from "@/lib/billing";

/**
 * Begin the one-time lifetime purchase: create a Stripe Checkout Session and
 * hand the browser off to Stripe's hosted payment page. Card details never
 * touch EverRoot — Stripe collects them and, on success, sends the buyer back
 * to /unlock (which confirms) while the webhook flips access as a backup.
 */
export async function startCheckout(): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  if (!billingConfigured()) {
    redirect("/unlock?status=unconfigured");
  }

  const billing = await getUserBilling(session.user.id);
  // Already unlocked — nothing to buy.
  if (billing && accessState(billing).isPaid) redirect("/forest");

  const h = headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host");
  const base = `${proto}://${host}`;

  // Create the hosted checkout. A misconfiguration (e.g. a bad STRIPE_PRICE_ID)
  // makes Stripe throw — we catch it and send the buyer back to /unlock with a
  // friendly notice rather than letting the page crash. redirect() is called
  // OUTSIDE the try so its internal control-flow throw is never swallowed.
  let checkoutUrl: string | null = null;
  try {
    const checkout = await stripe().checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: stripePriceId(), quantity: 1 }],
      customer_email: billing?.email,
      client_reference_id: session.user.id,
      metadata: { userId: session.user.id },
      allow_promotion_codes: true,
      // Stripe swaps {CHECKOUT_SESSION_ID} for the real id so the return page can
      // verify the payment server-side before granting access.
      success_url: `${base}/unlock?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/unlock?status=cancel`,
    });
    checkoutUrl = checkout.url;
  } catch (e) {
    console.error("Stripe checkout creation failed:", e);
  }

  if (!checkoutUrl) redirect("/unlock?status=error");

  // Leaves the app entirely for Stripe's hosted checkout.
  redirect(checkoutUrl);
}
