/**
 * Server-side AI for the voice interview: turn a spoken answer into an accurate
 * transcript and then into a warm, first-person written story.
 *
 * Two steps, both powered by OpenAI and both entirely optional:
 *   1. transcribeAudio() — Whisper speech-to-text on the recorded audio.
 *   2. polishIntoStory() — a chat model rewrites the raw transcript into
 *      readable first-person prose (fixing false starts, filler, and run-ons)
 *      WITHOUT inventing facts.
 *
 * Configured from a single env var, set on Railway:
 *   OPENAI_API_KEY            (required to enable AI; if missing, AI is off)
 *   OPENAI_TRANSCRIBE_MODEL   (optional, default "whisper-1")
 *   OPENAI_STORY_MODEL        (optional, default "gpt-4o-mini")
 *
 * Design rule: this module NEVER throws. Every function returns an empty string
 * on any problem (missing key, network error, bad response, timeout) so the
 * caller can fall back to the phone's own transcript and saving never breaks.
 */

const API_KEY = process.env.OPENAI_API_KEY ?? "";
const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1";
const STORY_MODEL = process.env.OPENAI_STORY_MODEL || "gpt-4o-mini";

const OPENAI_BASE = "https://api.openai.com/v1";

// Hard ceilings so a slow API can't hang a save request forever.
const TRANSCRIBE_TIMEOUT_MS = 60_000;
const STORY_TIMEOUT_MS = 30_000;

/** True when an OpenAI key is present, so callers know AI is available. */
export function aiConfigured(): boolean {
  return Boolean(API_KEY);
}

/** fetch with an abort-based timeout. Returns null instead of throwing. */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    console.error("OpenAI request failed:", e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Transcribe recorded audio to text with Whisper. Returns "" if AI is off or
 * anything goes wrong, so the caller falls back to the browser transcript.
 */
export async function transcribeAudio(
  bytes: Uint8Array,
  mimeType: string,
): Promise<string> {
  if (!API_KEY || bytes.byteLength === 0) return "";

  // Whisper needs a filename with a recognizable audio extension.
  const ext = extForMime(mimeType);
  const form = new FormData();
  // Copy into a fresh ArrayBuffer so Blob gets a clean, correctly-typed buffer.
  const buf = new Uint8Array(bytes).buffer;
  form.append("file", new Blob([buf], { type: mimeType || "audio/webm" }), `answer.${ext}`);
  form.append("model", TRANSCRIBE_MODEL);
  form.append("response_format", "text");

  const res = await fetchWithTimeout(
    `${OPENAI_BASE}/audio/transcriptions`,
    { method: "POST", headers: { Authorization: `Bearer ${API_KEY}` }, body: form },
    TRANSCRIBE_TIMEOUT_MS,
  );
  if (!res || !res.ok) {
    if (res) console.error("Whisper transcription failed:", res.status, await safeText(res));
    return "";
  }
  // response_format=text returns the transcript as the raw body.
  const text = (await safeText(res)).trim();
  return text;
}

/**
 * Rewrite a raw transcript into a polished first-person story. Preserves the
 * speaker's facts, voice, and meaning — only cleans up speech artifacts and
 * shapes it into readable prose. Returns "" on any failure so the caller keeps
 * the raw transcript.
 */
export async function polishIntoStory(
  rawText: string,
  question: string | null,
): Promise<string> {
  const source = rawText.trim();
  if (!API_KEY || !source) return "";

  const system =
    "You are a sensitive memoir editor helping a family preserve a loved one's " +
    "life stories. You are given a raw voice transcript of one spoken memory. " +
    "Rewrite it into a warm, clear, first-person story in the speaker's own " +
    "voice. Rules: (1) Never invent facts, names, dates, places, or feelings " +
    "that are not in the transcript. (2) Keep it first person and true to how " +
    "they speak. (3) Remove filler, false starts, repetition, and transcription " +
    "noise; fix grammar and punctuation. (4) Do not add a title, preamble, or " +
    "commentary — return only the story text. (5) Keep it roughly the same " +
    "length as the original; do not pad. If the transcript is too short or " +
    "unclear to form a story, lightly clean it up and return it as-is.";

  const user = question
    ? `The interview question was: "${question}"\n\nRaw transcript:\n${source}`
    : `Raw transcript:\n${source}`;

  const res = await fetchWithTimeout(
    `${OPENAI_BASE}/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: STORY_MODEL,
        temperature: 0.4,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    },
    STORY_TIMEOUT_MS,
  );
  if (!res || !res.ok) {
    if (res) console.error("Story polish failed:", res.status, await safeText(res));
    return "";
  }
  try {
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return (data.choices?.[0]?.message?.content ?? "").trim();
  } catch (e) {
    console.error("Could not parse story polish response:", e);
    return "";
  }
}

/** A plausible file extension for an audio mime type (Whisper reads the name). */
function extForMime(mimeType: string): string {
  const m = (mimeType || "").toLowerCase();
  if (m.includes("mp4") || m.includes("m4a")) return "mp4";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("wav")) return "wav";
  if (m.includes("ogg")) return "ogg";
  return "webm";
}

/** Read a response body as text without throwing. */
async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
