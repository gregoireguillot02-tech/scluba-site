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

export function safeNextPath(next: string | null | undefined, fallback = '/'): string {
  if (!next || typeof next !== 'string') return fallback;
  if (CONTROL_CHARS.test(next)) return fallback;
  if (!next.startsWith('/')) return fallback;
  try {
    const u = new URL(next, SENTINEL_ORIGIN);
    if (u.origin !== SENTINEL_ORIGIN) return fallback;
    // After URL normalization, paths like `/foo/..//evil.com` resolve to
    // pathname `//evil.com` while keeping the sentinel origin — the origin
    // gate passes but the returned string is protocol-relative, which
    // browsers follow cross-origin. Reject any normalized pathname that
    // re-introduces a leading `//`.
    if (u.pathname.startsWith('//')) return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}

/**
 * Escape characters that PostgreSQL/PostgREST `ilike` treats as wildcards
 * (`%`, `_`) plus the escape char (`\`). Use when passing user input through
 * `.ilike()` to enforce literal case-insensitive match instead of pattern
 * match.
 */
export function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, '\\$&');
}
