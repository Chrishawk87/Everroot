import { prisma } from "@/lib/prisma";

/**
 * Typed bridge to the `Recording` Prisma model.
 *
 * The model lives in schema.prisma and its client types + database table are
 * generated on deploy (`prisma generate` in the build step, `prisma db push`
 * on start). Our local sandbox cannot reach Prisma's engine CDN to regenerate
 * the client, so the checked-in generated types don't yet know about
 * `prisma.recording`. This bridge describes exactly the shape we rely on so the
 * codebase typechecks locally while matching the real runtime client. Once the
 * client is regenerated with the model present, this file can be simplified to
 * use `prisma.recording` directly.
 */

export interface RecordingRow {
  id: string;
  userId: string;
  nodeId: string;
  mimeType: string;
  durationMs: number;
  bytes: Uint8Array;
  transcript: string | null;
  question: string | null;
  createdAt: Date;
}

export interface CreateRecordingInput {
  userId: string;
  nodeId: string;
  mimeType: string;
  durationMs: number;
  bytes: Uint8Array;
  transcript?: string | null;
  question?: string | null;
}

interface RecordingDelegate {
  create(args: { data: CreateRecordingInput }): Promise<RecordingRow>;
  findUnique(args: { where: { id: string } }): Promise<RecordingRow | null>;
  findFirst(args: {
    where: { nodeId: string };
    orderBy?: { createdAt?: "asc" | "desc" };
  }): Promise<RecordingRow | null>;
}

export function recordings(): RecordingDelegate {
  return (prisma as unknown as { recording: RecordingDelegate }).recording;
}

/** The most recent recording attached to a memory node, if any. */
export function findRecordingForNode(nodeId: string): Promise<RecordingRow | null> {
  return recordings().findFirst({ where: { nodeId }, orderBy: { createdAt: "desc" } });
}
