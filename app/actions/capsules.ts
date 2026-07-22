"use server";

import { z } from "zod";
import { auth } from "@/auth";
import { capsules } from "@/lib/time-capsules";
import { rateLimit } from "@/lib/rate-limit";

const capsuleSchema = z.object({
  title: z.string().trim().min(1, "Give your capsule a title").max(120),
  message: z.string().trim().min(1, "Write a message to seal").max(20000),
  recipient: z.string().trim().max(120).optional(),
  // yyyy-mm-dd from a date input.
  unlockDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick an unlock date"),
});

export interface CapsuleResult {
  ok: boolean;
  error?: string;
}

/**
 * Seal a message until a future date. The capsule stays locked in the forest
 * (only its title, recipient, and unlock date are visible) until unlockAt
 * passes, then opens for the owner and their linked family.
 */
export async function createCapsule(input: {
  title: string;
  message: string;
  recipient?: string;
  unlockDate: string;
}): Promise<CapsuleResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Not signed in" };

  if (!rateLimit(`capsule:${userId}`, 30, 10 * 60 * 1000).ok) {
    return { ok: false, error: "You're doing that a lot — please wait a moment." };
  }

  const parsed = capsuleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid capsule" };
  }

  // Unlock at the end of the chosen day, and require it to be in the future.
  const unlockAt = new Date(`${parsed.data.unlockDate}T23:59:59`);
  if (Number.isNaN(unlockAt.getTime())) {
    return { ok: false, error: "Pick a valid unlock date" };
  }
  if (unlockAt.getTime() <= Date.now()) {
    return { ok: false, error: "The unlock date must be in the future" };
  }

  await capsules().create({
    data: {
      userId,
      title: parsed.data.title,
      message: parsed.data.message,
      recipient: parsed.data.recipient || null,
      unlockAt,
    },
  });

  return { ok: true };
}
