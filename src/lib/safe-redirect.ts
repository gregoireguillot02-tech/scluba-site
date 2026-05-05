/**
 * Validates a `next` redirect target. Returns a same-origin path or `fallback`.
 *
 * Defends against:
 *   - Absolute URLs (`https://evil.com/...`)
 *   - Protocol-relative URLs (`//evil.com/...`)
 *   - Backslash tricks (`/\\evil.com`) — WHATWG URL parser normalizes `\` to `/`
 *     for special schemes
 *   - Control-character smuggling (`/\t/evil.com`, `/\r\n/evil.com`) — browsers
 *     strip ASCII tab/newline during URL parsing, so a naïve `startsWith('//')`
 *     check is bypassable
 *
 * Strategy: parse `next` against a sentinel base origin and assert that the
 * resolved URL still has that origin. If anything else slipped in (scheme,
 * authority, control chars that re-form an authority), the origin shifts and
 * we fall back.
 */
const SENTINEL_ORIGIN = 'http://localhost.invalid';
const CONTROL_CHARS = /[\x00-\x1f\x7f]/;

export function safeNextPath(next: string | null | undefined, fallback = '/ops'): string {
  if (!next || typeof next !== 'string') return fallback;
  if (CONTROL_CHARS.test(next)) return fallback;
  if (!next.startsWith('/')) return fallback;
  try {
    const u = new URL(next, SENTINEL_ORIGIN);
    if (u.origin !== SENTINEL_ORIGIN) return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}
