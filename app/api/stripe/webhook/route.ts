import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe, grantLifetime } from "@/lib/billing";

// Node runtime: Stripe signature verification needs the raw request body and
// Node crypto. `dynamic` keeps this from being statically optimized.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook — the authoritative signal that a one-time payment cleared.
 * We verify the signature against STRIPE_WEBHOOK_SECRET, then on a completed &
 * paid checkout grant the buyer permanent access. Granting is idempotent, so
 * Stripe's retries (and the success-page confirm) are safe to replay.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  // Must be the raw, unparsed body for signature verification.
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const s = event.data.object as Stripe.Checkout.Session;
    const userId = s.metadata?.userId ?? s.client_reference_id ?? undefined;
    if (userId && s.payment_status === "paid") {
      await grantLifetime(userId, {
        sessionId: s.id,
        customerId: typeof s.customer === "string" ? s.customer : undefined,
      });
    }
  }

  return NextResponse.json({ received: true });
}
