// Best-effort in-memory rate limiting (Cloudflare Workers).
// Chaque Worker instance a sa mémoire isolée par edge location, cold starts
// resettent. Best-effort par design. Pour du strict distribué : Cloudflare KV
// ou Durable Objects (out-of-scope MVP).

type Bucket = { count: number; resetAt: number };
type LimitRule = { limit: number; windowSec: number };

const buckets = new Map<string, Bucket>();

// Order matters: the more specific rule must come before the catch-all `/api/`.
// New /api/ops/clubs/import rules added in coordination with
// `fix/sec-llm-importer-ssrf` (audit 2026-05-21).
const RULES: Array<{ match: RegExp; method?: string; rule: LimitRule; keyByEmail?: boolean }> = [
  // /auth/login — per-email slow brute (5 / 15 min) THEN per-IP mailbomb cap.
  { match: /^\/auth\/login\/?$/, method: 'POST', rule: { limit: 5, windowSec: 900 }, keyByEmail: true },
  // IP-only mailbomb cap (F-5): independent of email so attacker rotating
  // victim addresses can't bypass.
  { match: /^\/auth\/login\/?$/, method: 'POST', rule: { limit: 8, windowSec: 900 } },
  { match: /^\/ops\/login\/?$/, method: 'POST', rule: { limit: 10, windowSec: 900 } },
  // Importer-specific (cross-branch with fix/sec-llm-importer-ssrf).
  { match: /^\/api\/ops\/clubs\/import\/?$/, method: 'POST', rule: { limit: 5, windowSec: 60 } },
  { match: /^\/api\/ops\/clubs\/from-import\/?$/, method: 'POST', rule: { limit: 10, windowSec: 60 } },
  // Carnet AI detection (Haiku vision), appelé 1×/page PDF dans une boucle
  // client → borné comme les autres endpoints LLM (audit 2026-05-21). 30/min
  // couvre un carnet 18 trous (~5-9 pages) avec marge.
  { match: /^\/api\/ops\/clubs\/[^/]+\/carnet-detect\/?$/, method: 'POST', rule: { limit: 30, windowSec: 60 } },
  { match: /^\/api\/rounds\/?$/, method: 'POST', rule: { limit: 20, windowSec: 60 } },
  { match: /^\/api\/rounds\/[^/]+\/join\/?$/, method: 'POST', rule: { limit: 30, windowSec: 60 } },
  { match: /^\/api\/rounds\/[^/]+\/start\/?$/, method: 'POST', rule: { limit: 15, windowSec: 60 } },
  { match: /^\/api\/rounds\/[^/]+\/scores\/?$/, method: 'POST', rule: { limit: 240, windowSec: 60 } },
  { match: /^\/api\/rounds\/[^/]+\/finish\/?$/, method: 'POST', rule: { limit: 10, windowSec: 60 } },
  { match: /^\/api\/clubs\/[^/]+\/find-round\/?$/, method: 'POST', rule: { limit: 20, windowSec: 60 } },
  // Catch-all for the rest of /api/ — must stay last.
  { match: /^\/api\//, rule: { limit: 60, windowSec: 60 } },
];

// Trust ONLY `cf-connecting-ip`. `x-forwarded-for` is client-controllable on
// any non-CF egress path and would let an attacker rotate buckets at will (F-4).
function clientIp(headers: Headers): string | null {
  const ip = headers.get('cf-connecting-ip');
  return ip && ip.length > 0 ? ip : null;
}

function takeToken(key: string, rule: LimitRule, now: number): Bucket {
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const bucket = { count: 1, resetAt: now + rule.windowSec * 1000 };
    buckets.set(key, bucket);
    return bucket;
  }
  existing.count += 1;
  return existing;
}

function cleanup(now: number) {
  if (buckets.size < 1000) return;
  for (const [k, v] of buckets) {
    if (v.resetAt <= now) buckets.delete(k);
  }
}

async function readEmail(request: Request): Promise<string | null> {
  try {
    const cloned = request.clone();
    const ct = cloned.headers.get('content-type') ?? '';
    if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
      const form = await cloned.formData();
      const email = form.get('email');
      return typeof email === 'string' ? email.toLowerCase().trim() : null;
    }
    if (ct.includes('application/json')) {
      const body = (await cloned.json()) as { email?: unknown };
      return typeof body?.email === 'string' ? body.email.toLowerCase().trim() : null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function rateLimitResponse(retryAfterSec: number): Response {
  return new Response(
    JSON.stringify({
      error: 'rate_limited',
      message: 'Trop de requêtes. Réessaie dans quelques instants.',
      retry_after_seconds: retryAfterSec,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfterSec),
        'Cache-Control': 'no-store',
      },
    },
  );
}

/**
 * À appeler en tête de middleware. Retourne une `Response` 429 si limité,
 * `null` sinon (laisse passer la requête).
 */
export async function applyRateLimit(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  // Normalize trailing slashes so `/auth/login/` cannot bypass the literal
  // equality checks below (F-6).
  const path = url.pathname.replace(/\/+$/, '') || '/';

  const isProtected =
    path.startsWith('/api/') || path === '/auth/login' || path === '/ops/login';
  if (!isProtected) return null;
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return null;

  const matches = RULES.filter(
    (r) => r.match.test(path) && (!r.method || r.method === request.method),
  );
  if (matches.length === 0) return null;

  const now = Date.now();
  cleanup(now);

  const ip = clientIp(request.headers);
  // Fail-closed: if cf-connecting-ip is missing we treat the request as coming
  // from a shared "no-ip" identity AND apply a global per-route bucket with a
  // 10x stricter limit. This way an attacker hitting `*.workers.dev` directly
  // exhausts a route-wide budget instead of bypassing the limiter entirely.
  // See audit F-4 (2026-05-21).
  const ipId = ip ?? 'no-ip';
  const ipPenalty = ip ? 1 : 10;

  let emailCached: string | null | undefined;

  for (const r of matches) {
    let id = ipId;
    if (r.keyByEmail) {
      if (emailCached === undefined) emailCached = await readEmail(request);
      if (!emailCached) continue;
      id = `email:${emailCached}`;
    }
    // When no IP is known, collapse the bucket to a global per-route key so all
    // anonymous callers share it (and burn through it 10x faster).
    const ipScopedId = !r.keyByEmail && !ip ? 'global:no-ip' : id;
    const key = `${r.method ?? 'ANY'}:${path}:${ipScopedId}`;
    const effectiveLimit = r.keyByEmail ? r.rule.limit : Math.max(1, Math.ceil(r.rule.limit / ipPenalty));
    const bucket = takeToken(key, r.rule, now);
    if (bucket.count > effectiveLimit) {
      const retry = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      return rateLimitResponse(retry);
    }
  }

  return null;
}
