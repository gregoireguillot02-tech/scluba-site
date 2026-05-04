/**
 * Validates a `next` redirect target. Only same-origin paths are allowed.
 * Rejects protocol-relative URLs (`//evil.com`), absolute URLs, and anything
 * that doesn't start with a single `/`. Returns `fallback` if invalid.
 */
export function safeNextPath(next: string | null | undefined, fallback = '/ops'): string {
  if (!next || typeof next !== 'string') return fallback;
  if (!next.startsWith('/')) return fallback;
  if (next.startsWith('//')) return fallback;
  if (next.startsWith('/\\')) return fallback;
  if (next.includes('://')) return fallback;
  return next;
}
