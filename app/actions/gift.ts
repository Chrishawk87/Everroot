"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { stripe, stripePriceId, billingConfigured } from "@/lib/billing";

/**
 * Begin a GIFT purchase: create a Stripe Checkout Session that anyone — signed
 * in or not — can pay, then hand the browser to Stripe's hosted page. Unlike the
 * direct unlock (app/actions/billing.ts) there's no account required and nothing
 * is granted to the buyer; on success we mint a redeemable code the buyer can
 * pass to the recipient. Same Price, so a gift costs exactly what an unlock does.
 */
export async function startGiftCheckout(): Promise<void> {
  if (!billingConfigured()) {
    redirect("/gift?status=unconfigured");
  }

  const h = headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host");
  const base = `${proto}://${host}`;

  const checkout = await stripe().checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: stripePriceId(), quantity: 1 }],
    // Stripe collects the buyer's email on the hosted page (for their receipt).
    billing_address_collection: "auto",
    allow_promotion_codes: true,
    // `kind: gift` tells the webhook to mint a GiftCode instead of unlocking an
    // account (there is no account to unlock — it's a present).
    metadata: { kind: "gift" },
    // Stripe swaps {CHECKOUT_SESSION_ID} for the real id so the success page can
    // verify the payment server-side and show the code.
    success_url: `${base}/gift/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/gift?status=cancel`,
  });

  if (!checkout.url) throw new Error("Stripe did not return a checkout URL");

  redirect(checkout.url);
}
