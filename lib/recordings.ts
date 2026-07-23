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
  // Legacy recordings keep their audio here; R2-backed recordings have `bytes`
  // null and their audio under `storageKey`.
  bytes: Uint8Array | null;
  storageKey: string | null;
  transcript: string | null;
  question: string | null;
  createdAt: Date;
}

export interface CreateRecordingInput {
  userId: string;
  nodeId: string;
  mimeType: string;
  durationMs: number;
  bytes?: Uint8Array | null;
  storageKey?: string | null;
  transcript?: string | null;
  question?: string | null;
}

// Lean recording metadata — everything a story feed needs EXCEPT the audio
// bytes, which are streamed on demand via /api/recordings/[id].
export interface RecordingMeta {
  id: string;
  nodeId: string;
  mimeType: string;
  durationMs: number;
  transcript: string | null;
  question: string | null;
  createdAt: Date;
}

interface RecordingDelegate {
  create(args: { data: CreateRecordingInput }): Promise<RecordingRow>;
  findUnique(args: { where: { id: string } }): Promise<RecordingRow | null>;
  findFirst(args: {
    where: { nodeId: string };
    orderBy?: { createdAt?: "asc" | "desc" };
  }): Promise<RecordingRow | null>;
  findMany(args: {
    where: { userId: string };
    orderBy?: { createdAt?: "asc" | "desc" };
    select?: {
      id?: boolean;
      nodeId?: boolean;
      mimeType?: boolean;
      durationMs?: boolean;
      transcript?: boolean;
      question?: boolean;
      createdAt?: boolean;
    };
  }): Promise<RecordingMeta[]>;
}

export function recordings(): RecordingDelegate {
  return (prisma as unknown as { recording: RecordingDelegate }).recording;
}

/** The most recent recording attached to a memory node, if any. */
export function findRecordingForNode(nodeId: string): Promise<RecordingRow | null> {
  return recordings().findFirst({ where: { nodeId }, orderBy: { createdAt: "desc" } });
}

/**
 * Every recording a user has made, oldest→newest — the raw material for their
 * story feed. Omits the audio bytes so we don't pull whole recordings into
 * memory; the player streams each one from /api/recordings/[id] as it plays.
 */
export function listRecordingsForUser(userId: string): Promise<RecordingMeta[]> {
  return recordings().findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      nodeId: true,
      mimeType: true,
      durationMs: true,
      transcript: true,
      question: true,
      createdAt: true,
    },
  });
}
