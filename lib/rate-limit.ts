/**
 * In-memory rate limiter — a fixed-window counter keyed by an arbitrary string
 * (usually an IP address or user id + action).
 *
 * This is deliberately dependency-free and lives entirely in this process's
 * memory. That means:
 *   - counts reset when the server restarts, and
 *   - each running instance keeps its own counts (they aren't shared).
 * For a single Railway instance that's fine. When Everroot scales out to
 * multiple instances, swap the `rateLimit` implementation below for a shared
 * store (e.g. Upstash Redis) — every caller goes through this one function, so
 * it's a localized change.
 */

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

// Guard against unbounded growth: once the map gets large, drop expired entries.
const MAX_KEYS = 50_000;

function sweep(now: number) {
  for (const [key, w] of windows) {
    if (w.resetAt <= now) windows.delete(key);
  }
}

export interface RateLimitResult {
  /** True if this request is allowed. */
  ok: boolean;
  /** Requests remaining in the current window. */
  remaining: number;
  /** Milliseconds until the window resets (only meaningful when blocked). */
  retryAfterMs: number;
}

/**
 * Record one hit against `key` and report whether it's within `limit` per
 * `windowMs`. The first call in a window starts the clock.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  if (windows.size > MAX_KEYS) sweep(now);

  const w = windows.get(key);
  if (!w || w.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterMs: 0 };
  }

  if (w.count >= limit) {
    return { ok: false, remaining: 0, retryAfterMs: w.resetAt - now };
  }

  w.count += 1;
  return { ok: true, remaining: limit - w.count, retryAfterMs: 0 };
}

/**
 * Best-effort client IP from proxy headers. Railway (like most hosts) puts the
 * real client IP first in `x-forwarded-for`. Works with both a Web `Headers`
 * object (route handlers) and Next's `headers()` result (server actions).
 */
export function ipFromHeaders(h: Headers | { get(name: string): string | null }): string {
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip") ?? "unknown";
}

/** Round a millisecond duration up to whole seconds, for user-facing messages. */
export function retryAfterSeconds(ms: number): number {
  return Math.max(1, Math.ceil(ms / 1000));
}
