/**
 * EverRoot gifts — a prepaid, one-time lifetime unlock that someone buys for
 * another person. The buyer needs no account: they pay through Stripe and get a
 * shareable code. The recipient signs in (or signs up) and redeems the code,
 * which grants their account the same permanent access a direct purchase would.
 *
 * The flow mirrors the direct unlock (lib/billing.ts): same Stripe Price, same
 * `grantLifetime`. The only new state is the GiftCode row that sits between the
 * payment and the eventual redemption.
 *
 * NOTE on the Prisma bridge below: the generated Prisma client is frozen in this
 * environment and predates the `GiftCode` model, so — exactly as lib/social.ts
 * and lib/billing.ts do — we hand-type the reads/writes we need against the real
 * `prisma.giftCode` delegate. Railway regenerates the client on deploy.
 */

import { prisma } from "@/lib/prisma";
import { grantLifetime } from "@/lib/billing";

// --- Code generation -------------------------------------------------------

// Unambiguous alphabet — no 0/O, 1/I so codes are easy to read aloud and type.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A human-shareable gift code, e.g. "EVR-7GK2-QP9M". */
export function generateGiftCode(): string {
  const block = (n: number) =>
    Array.from({ length: n }, () =>
      CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)],
    ).join("");
  return `EVR-${block(4)}-${block(4)}`;
}

// --- Prisma bridge (frozen-client pattern; see lib/billing.ts) -------------

export interface GiftCodeRow {
  id: string;
  code: string;
  stripeSessionId: string;
  purchaserEmail: string | null;
  redeemedByUserId: string | null;
  redeemedAt: Date | null;
  createdAt: Date;
}

interface GiftCodeDelegate {
  findUnique(args: {
    where: { code: string } | { stripeSessionId: string };
  }): Promise<GiftCodeRow | null>;
  create(args: {
    data: {
      code: string;
      stripeSessionId: string;
      purchaserEmail?: string | null;
    };
  }): Promise<GiftCodeRow>;
  update(args: {
    where: { id: string };
    data: Partial<{ redeemedByUserId: string | null; redeemedAt: Date | null }>;
  }): Promise<GiftCodeRow>;
}

function giftCodes(): GiftCodeDelegate {
  return (prisma as unknown as { giftCode: GiftCodeDelegate }).giftCode;
}

/** Look up a gift by its shareable code (null if it doesn't exist). */
export function getGiftByCode(code: string): Promise<GiftCodeRow | null> {
  return giftCodes().findUnique({ where: { code: code.trim().toUpperCase() } });
}

/**
 * Create the GiftCode for a paid checkout session, or return the existing one.
 * Idempotent on `stripeSessionId`, so the webhook and the success page can both
 * call it (and Stripe can retry) without ever minting two codes for one payment.
 */
export async function createGiftForSession(opts: {
  sessionId: string;
  purchaserEmail?: string | null;
}): Promise<GiftCodeRow> {
  const existing = await giftCodes().findUnique({
    where: { stripeSessionId: opts.sessionId },
  });
  if (existing) return existing;

  try {
    return await giftCodes().create({
      data: {
        code: generateGiftCode(),
        stripeSessionId: opts.sessionId,
        purchaserEmail: opts.purchaserEmail ?? null,
      },
    });
  } catch {
    // Lost a race (unique violation on stripeSessionId) — the row now exists.
    const row = await giftCodes().findUnique({
      where: { stripeSessionId: opts.sessionId },
    });
    if (row) return row;
    throw new Error("Could not create or find the gift for this session");
  }
}

// --- Redemption ------------------------------------------------------------

export type RedeemResult =
  | { ok: true; alreadyMine: boolean }
  | { ok: false; reason: "not_found" | "already_redeemed" };

/**
 * Redeem a gift code for a signed-in user: grants them lifetime access and marks
 * the gift claimed. Safe to call twice for the same user (idempotent). A code
 * already claimed by someone else is rejected.
 */
export async function redeemGift(code: string, userId: string): Promise<RedeemResult> {
  const gift = await getGiftByCode(code);
  if (!gift) return { ok: false, reason: "not_found" };

  if (gift.redeemedByUserId) {
    if (gift.redeemedByUserId === userId) {
      // Same person re-clicked — already theirs, treat as success.
      await grantLifetime(userId);
      return { ok: true, alreadyMine: true };
    }
    return { ok: false, reason: "already_redeemed" };
  }

  await grantLifetime(userId);
  await giftCodes().update({
    where: { id: gift.id },
    data: { redeemedByUserId: userId, redeemedAt: new Date() },
  });
  return { ok: true, alreadyMine: false };
}
