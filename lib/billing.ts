/**
 * EverRoot billing — a free trial that resolves to a single, one-time lifetime
 * unlock (there is no recurring subscription).
 *
 * A new account is granted a {@link TRIAL_DAYS}-day trial at signup. While the
 * trial is live the owner has full access to their forest. When it lapses the
 * forest is gated (they can still sign in, but entering bounces to /unlock)
 * until they make one payment, which flips `lifetimeAccess` on permanently.
 *
 * All Stripe access + the access decision live here so the rest of the app only
 * has to ask two questions: "does this user have access?" and "unlock them".
 *
 * NOTE on the Prisma bridge below: the generated Prisma client is frozen in this
 * environment and predates the billing columns, so — exactly as lib/social.ts
 * does for `notificationsSeenAt` — we hand-type the reads/writes we need against
 * the real `prisma.user` delegate. Railway regenerates the client on deploy.
 */

import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

/** Length of the free trial granted at signup, in days. */
export const TRIAL_DAYS = 3;

// --- Stripe client ---------------------------------------------------------

let _stripe: Stripe | null = null;

/** The shared Stripe client. Throws if STRIPE_SECRET_KEY is not configured. */
export function stripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    _stripe = new Stripe(key);
  }
  return _stripe;
}

/** The Stripe Price id for the one-time lifetime unlock. */
export function stripePriceId(): string {
  const id = process.env.STRIPE_PRICE_ID;
  if (!id) throw new Error("STRIPE_PRICE_ID is not set");
  return id;
}

/** True when Stripe is configured (used to fail loudly rather than silently). */
export function billingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
}

// --- Prisma bridge (frozen-client pattern; see lib/social.ts) --------------

export interface UserBilling {
  id: string;
  email: string;
  trialEndsAt: Date | null;
  lifetimeAccess: boolean;
  paidAt: Date | null;
  stripeCustomerId: string | null;
  stripeSessionId: string | null;
}

interface UserBillingDelegate {
  findUnique(args: {
    where: { id: string };
    select: {
      id: true;
      email: true;
      trialEndsAt: true;
      lifetimeAccess: true;
      paidAt: true;
      stripeCustomerId: true;
      stripeSessionId: true;
    };
  }): Promise<UserBilling | null>;
  update(args: {
    where: { id: string };
    data: Partial<{
      trialEndsAt: Date | null;
      lifetimeAccess: boolean;
      paidAt: Date | null;
      stripeCustomerId: string | null;
      stripeSessionId: string | null;
    }>;
  }): Promise<unknown>;
}

function userBilling(): UserBillingDelegate {
  return (prisma as unknown as { user: UserBillingDelegate }).user;
}

/** Read the billing-relevant fields for one user (null if no such user). */
export function getUserBilling(userId: string): Promise<UserBilling | null> {
  return userBilling().findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      trialEndsAt: true,
      lifetimeAccess: true,
      paidAt: true,
      stripeCustomerId: true,
      stripeSessionId: true,
    },
  });
}

/** Start the free trial clock for a freshly created account. */
export async function startTrial(userId: string): Promise<void> {
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  await userBilling().update({ where: { id: userId }, data: { trialEndsAt } });
}

/**
 * Grant permanent access after a completed checkout. Idempotent: replaying the
 * same webhook (or the success-page confirm) just re-sets the same flags.
 */
export async function grantLifetime(
  userId: string,
  opts: { sessionId?: string; customerId?: string } = {},
): Promise<void> {
  await userBilling().update({
    where: { id: userId },
    data: {
      lifetimeAccess: true,
      paidAt: new Date(),
      ...(opts.sessionId ? { stripeSessionId: opts.sessionId } : {}),
      ...(opts.customerId ? { stripeCustomerId: opts.customerId } : {}),
    },
  });
}

// --- Access decision -------------------------------------------------------

export interface AccessState {
  /** May the owner use their forest right now? */
  hasAccess: boolean;
  /** Has the one-time lifetime payment cleared? */
  isPaid: boolean;
  /** Currently inside the free-trial window? */
  inTrial: boolean;
  trialEndsAt: Date | null;
  /** Whole days remaining in the trial (0 once lapsed or paid). */
  trialDaysLeft: number;
}

/**
 * Decide whether an account may use the app:
 *  - paid (lifetime) → always in;
 *  - NULL trialEndsAt → grandfathered account created before billing existed, so
 *    it keeps permanent access and we never lock out an early user;
 *  - otherwise → in until the trial end date passes.
 */
export function accessState(u: {
  lifetimeAccess: boolean;
  trialEndsAt: Date | null;
}): AccessState {
  if (u.lifetimeAccess) {
    return { hasAccess: true, isPaid: true, inTrial: false, trialEndsAt: u.trialEndsAt, trialDaysLeft: 0 };
  }
  if (u.trialEndsAt === null) {
    return { hasAccess: true, isPaid: false, inTrial: false, trialEndsAt: null, trialDaysLeft: 0 };
  }
  const msLeft = u.trialEndsAt.getTime() - Date.now();
  const inTrial = msLeft > 0;
  const trialDaysLeft = Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
  return { hasAccess: inTrial, isPaid: false, inTrial, trialEndsAt: u.trialEndsAt, trialDaysLeft };
}

/**
 * Convenience for gating a page/route: reads the user and returns the access
 * state. Returns a permissive state if the user can't be found so a missing
 * record never hard-locks someone out of an otherwise valid session.
 */
export async function getAccess(userId: string): Promise<AccessState> {
  const u = await getUserBilling(userId);
  if (!u) return { hasAccess: true, isPaid: false, inTrial: false, trialEndsAt: null, trialDaysLeft: 0 };
  return accessState(u);
}
