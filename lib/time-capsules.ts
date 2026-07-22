import { prisma } from "@/lib/prisma";

/**
 * Typed bridge to the `TimeCapsule` Prisma model.
 *
 * Like lib/recordings.ts and lib/family-links.ts, this exists because the local
 * sandbox can't reach Prisma's engine CDN to regenerate the client, so the
 * checked-in types don't yet know about `prisma.timeCapsule`. This describes the
 * exact shape we use so the codebase typechecks locally while matching the real
 * runtime client. Once the client is regenerated it can use `prisma.timeCapsule`
 * directly.
 */

export interface TimeCapsuleRow {
  id: string;
  userId: string;
  title: string;
  message: string;
  recipient: string | null;
  unlockAt: Date;
  createdAt: Date;
}

export interface CreateCapsuleInput {
  userId: string;
  title: string;
  message: string;
  recipient?: string | null;
  unlockAt: Date;
}

interface CapsuleDelegate {
  create(args: { data: CreateCapsuleInput }): Promise<TimeCapsuleRow>;
  findMany(args: {
    where: { userId: string };
    orderBy?: { unlockAt?: "asc" | "desc" };
  }): Promise<TimeCapsuleRow[]>;
}

export function capsules(): CapsuleDelegate {
  return (prisma as unknown as { timeCapsule: CapsuleDelegate }).timeCapsule;
}

/** Every capsule a user has sealed, soonest to unlock first. */
export function listCapsulesForUser(userId: string): Promise<TimeCapsuleRow[]> {
  return capsules().findMany({ where: { userId }, orderBy: { unlockAt: "asc" } });
}
