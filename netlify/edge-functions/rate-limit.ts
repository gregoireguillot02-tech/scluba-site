import type { Context } from '@netlify/edge-functions';

type Bucket = { count: number; resetAt: number };
type LimitRule = { limit: number; windowSec: number };

const buckets = new Map<string, Bucket>();

const RULES: Array<{ match: RegExp; method?: string; rule: LimitRule; keyByEmail?: boolean }> = [
  { match: /^\/auth\/login\/?$/, method: 'POST', rule: { limit: 5, windowSec: 900 }, keyByEmail: true },
  { match: /^\/auth\/login\/?$/, method: 'POST', rule: { limit: 15, windowSec: 900 } },
  { match: /^\/ops\/login\/?$/, method: 'POST', rule: { limit: 10, windowSec: 900 } },
  { match: /^\/api\/rounds\/?$/, method: 'POST', rule: { limit: 20, windowSec: 60 } },
  { match: /^\/api\/rounds\/[^/]+\/join\/?$/, method: 'POST', rule: { limit: 30, windowSec: 60 } },
  { match: /^\/api\/rounds\/[^/]+\/start\/?$/, method: 'POST', rule: { limit: 15, windowSec: 60 } },
  { match: /^\/api\/rounds\/[^/]+\/scores\/?$/, method: 'POST', rule: { limit: 240, windowSec: 60 } },
  { match: /^\/api\/rounds\/[^/]+\/finish\/?$/, method: 'POST', rule: { limit: 10, windowSec: 60 } },
  { match: /^\/api\/clubs\/[^/]+\/find-round\/?$/, method: 'POST', rule: { limit: 20, windowSec: 60 } },
  { match: /^\/api\//, rule: { limit: 60, windowSec: 60 } },
];

function clientIp(request: Request, context: Context): string {
  return (
    request.headers.get('x-nf-client-connection-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    context.ip ??
    'unknown'
  );
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

export default async (request: Request, context: Context): Promise<Response | void> => {
  const url = new URL(request.url);
  const path = url.pathname;

  const isProtected =
    path.startsWith('/api/') || path === '/auth/login' || path === '/ops/login';
  if (!isProtected) return;
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return;

  const matches = RULES.filter(
    (r) => r.match.test(path) && (!r.method || r.method === request.method),
  );
  if (matches.length === 0) return;

  const ip = clientIp(request, context);
  const now = Date.now();
  cleanup(now);

  let emailCached: string | null | undefined;

  for (const r of matches) {
    let id = ip;
    if (r.keyByEmail) {
      if (emailCached === undefined) emailCached = await readEmail(request);
      if (!emailCached) continue;
      id = `email:${emailCached}`;
    }
    const key = `${r.method ?? 'ANY'}:${path}:${id}`;
    const bucket = takeToken(key, r.rule, now);
    if (bucket.count > r.rule.limit) {
      const retry = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      return rateLimitResponse(retry);
    }
  }
};

export const config = {
  path: ['/api/*', '/auth/login', '/ops/login'],
};
