import { describe, it, expect } from 'vitest';
import { applyRateLimit } from './rate-limit';

function makeRequest(opts: {
  url: string;
  method?: string;
  ip?: string | null;
  email?: string;
}): Request {
  const headers = new Headers();
  if (opts.ip) headers.set('cf-connecting-ip', opts.ip);
  // Intentionally do NOT honour x-forwarded-for — it must be ignored.
  if (opts.email !== undefined) {
    headers.set('content-type', 'application/x-www-form-urlencoded');
    const body = new URLSearchParams({ email: opts.email }).toString();
    return new Request(opts.url, { method: opts.method ?? 'POST', headers, body });
  }
  return new Request(opts.url, { method: opts.method ?? 'POST', headers });
}

// The rate-limit module keeps an internal Map; each test uses a unique IP to
// avoid cross-test contamination.
function uniqueIp(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `198.51.${(h >> 8) & 0xff}.${h & 0xff}`;
}

describe('applyRateLimit', () => {
  it('rejects /auth/login mailbomb across rotating emails from same IP after 8 attempts', async () => {
    const ip = uniqueIp('mailbomb');
    let lastStatus = 0;
    for (let i = 0; i < 9; i++) {
      const req = makeRequest({
        url: 'https://scluba.com/auth/login',
        method: 'POST',
        ip,
        email: `victim${i}@target.example`,
      });
      const res = await applyRateLimit(req);
      lastStatus = res?.status ?? 0;
    }
    expect(lastStatus).toBe(429);
  });

  it('normalizes trailing slash so /auth/login/ cannot bypass per-IP cap', async () => {
    const ip = uniqueIp('trailing-slash');
    let lastStatus = 0;
    for (let i = 0; i < 9; i++) {
      const req = makeRequest({
        url: 'https://scluba.com/auth/login/',
        method: 'POST',
        ip,
        email: `slash${i}@target.example`,
      });
      const res = await applyRateLimit(req);
      lastStatus = res?.status ?? 0;
    }
    expect(lastStatus).toBe(429);
  });

  it('ignores x-forwarded-for and falls back to a strict global no-ip bucket', async () => {
    // Forge x-forwarded-for to many different IPs — the limiter must ignore it
    // and collapse all requests into the global `no-ip` bucket which exhausts
    // 10x faster than the per-IP limit.
    let lastStatus = 0;
    for (let i = 0; i < 15; i++) {
      const headers = new Headers();
      headers.set('x-forwarded-for', `203.0.113.${i}`);
      headers.set('content-type', 'application/x-www-form-urlencoded');
      const body = new URLSearchParams({ email: `xff${i}@target.example` }).toString();
      const req = new Request('https://scluba.com/api/rounds', {
        method: 'POST',
        headers,
        body,
      });
      const res = await applyRateLimit(req);
      lastStatus = res?.status ?? 0;
    }
    // /api/rounds POST: per-route 20/min; with 10x penalty -> effective 2/min.
    // Should be rate-limited well before 15 requests.
    expect(lastStatus).toBe(429);
  });

  it('allows GET signout endpoint to pass through rate-limit (handler will 405)', async () => {
    // Rate-limiter skips GET — the endpoint itself rejects GET with 405.
    const ip = uniqueIp('signout-get');
    const req = makeRequest({
      url: 'https://scluba.com/ops/auth/signout',
      method: 'GET',
      ip,
    });
    const res = await applyRateLimit(req);
    expect(res).toBeNull();
  });

  it('importer route is rate-limited at 5/min', async () => {
    const ip = uniqueIp('importer');
    let lastStatus = 0;
    for (let i = 0; i < 7; i++) {
      const req = makeRequest({
        url: 'https://scluba.com/api/ops/clubs/import',
        method: 'POST',
        ip,
      });
      const res = await applyRateLimit(req);
      lastStatus = res?.status ?? 0;
    }
    expect(lastStatus).toBe(429);
  });

  it('carnet-detect route is rate-limited at 30/min (LLM endpoint)', async () => {
    const ip = uniqueIp('carnet-detect');
    let lastStatus = 0;
    for (let i = 0; i < 31; i++) {
      const req = makeRequest({
        url: 'https://scluba.com/api/ops/clubs/abc123/carnet-detect',
        method: 'POST',
        ip,
      });
      const res = await applyRateLimit(req);
      lastStatus = res?.status ?? 0;
    }
    expect(lastStatus).toBe(429);
  });
});
