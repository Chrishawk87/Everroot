import { randomUUID } from "crypto";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

/**
 * Object storage for voice recordings, backed by Cloudflare R2 (S3-compatible).
 *
 * Audio used to live as raw bytes inside Postgres, which bloats the database and
 * makes backups/streaming expensive at scale. New recordings are written here
 * instead; each is keyed `recordings/<recordingId>`. Existing DB-stored
 * recordings keep working — the stream route falls back to Postgres bytes when a
 * recording has no `storageKey`.
 *
 * Configured entirely from env (set on Railway):
 *   R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
 * If any are missing, `storageConfigured()` is false and callers fall back to
 * storing bytes in the database, so the app keeps working without R2.
 */

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? "";
const BUCKET = process.env.R2_BUCKET ?? "";
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? "";
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY ?? "";

export function storageConfigured(): boolean {
  return Boolean(ACCOUNT_ID && BUCKET && ACCESS_KEY_ID && SECRET_ACCESS_KEY);
}

let cachedClient: S3Client | null = null;

function client(): S3Client {
  if (cachedClient) return cachedClient;
  cachedClient = new S3Client({
    region: "auto",
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
    },
  });
  return cachedClient;
}

/** A fresh, unguessable object key for a new recording. */
export function newRecordingKey(): string {
  return `recordings/${randomUUID()}`;
}

/** Upload audio bytes to R2 under the given key. Returns the key. */
export async function putRecording(
  key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<string> {
  await client().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: bytes,
      ContentType: contentType || "audio/webm",
    }),
  );
  return key;
}

/** Fetch a recording's audio bytes from R2. */
export async function getRecording(key: string): Promise<Uint8Array> {
  const res = await client().send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
  );
  if (!res.Body) throw new Error(`R2 object has no body: ${key}`);
  // The AWS SDK stream in Node exposes transformToByteArray().
  const body = res.Body as unknown as { transformToByteArray(): Promise<Uint8Array> };
  return body.transformToByteArray();
}

/** Delete a recording's audio from R2 (best-effort; ignores missing objects). */
export async function deleteRecording(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
