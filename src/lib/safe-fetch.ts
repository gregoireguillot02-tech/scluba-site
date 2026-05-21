/**
 * SSRF defense helpers for outbound `fetch()` calls in Cloudflare Workers.
 *
 * Workers' `fetch()` does NOT block RFC1918/loopback/link-local destinations
 * and exposes no native DNS resolver, so private-IP enforcement must happen
 * at the URL layer. This module:
 *
 *   1. Enforces an `http:` / `https:` scheme allowlist.
 *   2. Rejects known internal hostnames (`localhost`, `*.internal`, `*.local`,
 *      `*.lan`, `metadata.google.internal`).
 *   3. Rejects IP-literal hostnames (IPv4 dotted-quad and IPv6 hex literals).
 *   4. Performs manual redirect chasing (`redirect: 'manual'`) with up to 3
 *      hops, re-validating every `Location:` value through `assertSafeUrl`.
 *   5. Streams the response body and aborts at a caller-supplied byte cap
 *      (does NOT trust `Content-Length`).
 *   6. Wraps `fetch()` in an `AbortController` timeout.
 *
 * Public API:
 *   - {@link assertSafeUrl}(url)             → throws `SafeFetchError` on reject
 *   - {@link safeFetch}(url, opts)           → returns `{ res, redirectedTo }`
 *   - {@link safeFetchBoundedBytes}(url, …)  → returns truncated `Uint8Array`
 *   - {@link safeFetchBoundedText}(url, …)   → returns truncated `string`
 */

export class SafeFetchError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'SafeFetchError';
  }
}

const BLOCKED_EXACT_HOSTS = new Set<string>([
  'localhost',
  'metadata.google.internal',
]);

const BLOCKED_SUFFIXES = [
  '.localhost',
  '.internal',
  '.local',
  '.lan',
];

const IPV4_LITERAL = /^(\d{1,3}\.){3}\d{1,3}$/;
// Hex/colon-only string — IPv6 literal even when not bracketed
const IPV6_LIKE = /^\[?[0-9a-fA-F:]+\]?$/;

/**
 * Throws {@link SafeFetchError} if `url` is unsafe to fetch from a Worker.
 *
 * Checks scheme, hostname suffixes, IPv4/IPv6 literals. Does NOT do a DNS
 * lookup — Workers cannot resolve hostnames cheaply, so the IP-literal
 * rejection is the strongest signal we can enforce at this layer.
 */
export function assertSafeUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SafeFetchError('invalid_url', 'URL invalide');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SafeFetchError('bad_scheme', 'URL doit être http(s)');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname) {
    throw new SafeFetchError('empty_host', 'URL hostname vide');
  }

  if (BLOCKED_EXACT_HOSTS.has(hostname)) {
    throw new SafeFetchError('blocked_host', 'Hostname interne refusé');
  }
  for (const suffix of BLOCKED_SUFFIXES) {
    if (hostname === suffix.slice(1) || hostname.endsWith(suffix)) {
      throw new SafeFetchError('blocked_host', 'Hostname interne refusé');
    }
  }

  // IPv4 dotted-quad literal
  if (IPV4_LITERAL.test(hostname)) {
    throw new SafeFetchError('ip_literal', 'IP littérale refusée');
  }
  // IPv6 literal — URL.hostname returns bracketed form (e.g. "[::1]")
  // but be defensive about unbracketed colon-only strings too.
  if (hostname.includes(':') || (parsed.hostname.startsWith('[') && parsed.hostname.endsWith(']'))) {
    if (IPV6_LIKE.test(parsed.hostname) || hostname.includes(':')) {
      throw new SafeFetchError('ip_literal', 'IP littérale refusée');
    }
  }

  return parsed;
}

export interface SafeFetchOptions {
  /** Wall-clock timeout in ms. Default 8000. */
  timeoutMs?: number;
  /** Max redirect hops to follow manually. Default 3. */
  maxRedirects?: number;
  /** Optional request init (method, headers, body). `redirect` is forced to 'manual'. */
  init?: Omit<RequestInit, 'redirect' | 'signal'>;
}

export interface SafeFetchResult {
  res: Response;
  /** Final URL after following any redirects (== original if no redirect). */
  finalUrl: string;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Fetches `url` with SSRF guards on every hop. Returns the final {@link Response}.
 *
 * Throws {@link SafeFetchError} if the original URL or any redirect target
 * fails {@link assertSafeUrl}, if redirect cap is exceeded, or if the
 * timeout fires.
 */
export async function safeFetch(
  url: string,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const timeoutMs = options.timeoutMs ?? 8_000;
  const maxRedirects = options.maxRedirects ?? 3;

  let currentUrl = assertSafeUrl(url).toString();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let hops = 0;
    while (true) {
      const res = await fetch(currentUrl, {
        ...(options.init ?? {}),
        signal: controller.signal,
        redirect: 'manual',
      });

      if (!REDIRECT_STATUSES.has(res.status)) {
        return { res, finalUrl: currentUrl };
      }

      const location = res.headers.get('location');
      if (!location) {
        // Treat redirect-without-location as final.
        return { res, finalUrl: currentUrl };
      }

      hops += 1;
      if (hops > maxRedirects) {
        throw new SafeFetchError('too_many_redirects', 'Trop de redirections');
      }

      // Resolve relative redirects against the current URL.
      let nextUrl: string;
      try {
        nextUrl = new URL(location, currentUrl).toString();
      } catch {
        throw new SafeFetchError('invalid_redirect', 'Redirection invalide');
      }
      // Re-validate after every hop.
      assertSafeUrl(nextUrl);
      currentUrl = nextUrl;

      // Drain the redirect response so the connection can be reused.
      try { await res.body?.cancel(); } catch { /* noop */ }
    }
  } catch (err) {
    if (err instanceof SafeFetchError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new SafeFetchError('timeout', 'Timeout de la requête');
    }
    throw new SafeFetchError('fetch_failed', 'Échec de la requête');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Streams the response body up to `maxBytes`, then cancels the reader.
 * Returns the truncated bytes. Does not trust `Content-Length`.
 */
async function readBoundedBytes(res: Response, maxBytes: number): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) {
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf.byteLength > maxBytes ? buf.slice(0, maxBytes) : buf);
  }
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (received + value.byteLength > maxBytes) {
      const remaining = Math.max(0, maxBytes - received);
      if (remaining > 0) chunks.push(value.subarray(0, remaining));
      received = maxBytes;
      try { await reader.cancel(); } catch { /* noop */ }
      break;
    }
    chunks.push(value);
    received += value.byteLength;
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/**
 * Wraps {@link safeFetch} + bounded-byte stream reader.
 */
export async function safeFetchBoundedBytes(
  url: string,
  maxBytes: number,
  options: SafeFetchOptions = {},
): Promise<{ bytes: Uint8Array; res: Response; finalUrl: string }> {
  const { res, finalUrl } = await safeFetch(url, options);
  const bytes = await readBoundedBytes(res, maxBytes);
  return { bytes, res, finalUrl };
}

/**
 * Wraps {@link safeFetch} + bounded-byte stream reader + UTF-8 decode.
 */
export async function safeFetchBoundedText(
  url: string,
  maxBytes: number,
  options: SafeFetchOptions = {},
): Promise<{ text: string; res: Response; finalUrl: string }> {
  const { bytes, res, finalUrl } = await safeFetchBoundedBytes(url, maxBytes, options);
  const text = new TextDecoder('utf-8').decode(bytes);
  return { text, res, finalUrl };
}
