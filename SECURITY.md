# Security Policy

## Reporting a vulnerability

If you think you've found a security issue in Scluba, please **do not** open a
public GitHub issue. Email us at **security@scluba.com** with:

- A clear description of the vulnerability
- Steps to reproduce (proof-of-concept welcome)
- Affected URLs / endpoints
- Your suggested severity

We'll acknowledge within 72 hours and aim to ship a fix within 7 days for
high-severity issues. You'll be credited in the fix release notes unless you
prefer to stay anonymous.

## Scope

In scope:
- `scluba.com` and `*.scluba.com`
- The `gregoireguillot02-tech/scluba-site` repository

Out of scope:
- Supabase-hosted infrastructure (report to Supabase directly)
- Cloudflare Workers infrastructure (report to Cloudflare directly)
- Social engineering of the team

## Hardening overview

- HTTP security headers (CSP, HSTS, X-Frame-Options, Referrer-Policy,
  Permissions-Policy, COOP) — set programmatically in `src/middleware.ts`
  so they apply on every Worker response. `public/_headers` is kept as a
  fallback / documentation but is NOT honored by `@astrojs/cloudflare`.
- CSRF defense-in-depth: same-origin check via `Origin` + `Sec-Fetch-Site`
  on state-changing requests to `/api/ops/*`, `/api/rounds/*`, `/api/clubs/*`
  in `src/middleware.ts`.
- Row Level Security enabled on every Supabase table
- Internal `/ops` dashboard restricted by email allowlist via middleware
- Magic-link auth via Supabase OTP (no passwords)
- Rate limiting via Astro middleware — see `src/lib/rate-limit.ts`,
  wired in `src/middleware.ts`.
- Error tracking via Sentry (PII disabled, source maps not uploaded)
- Honeypot + length caps on every public form
- Player cookies are `httpOnly` + `SameSite=lax` + `Secure` in production

## Out-of-scope known issues

- The marketing CTA form POSTs directly to the Supabase REST endpoint with
  the public anon key. Defense in depth lives at the DB level (RLS +
  `CHECK` constraints in migration `0002_leads_hardening.sql`). Moving the
  submission behind an Astro API route with server-side rate limiting is
  tracked as a follow-up.
- Supabase Storage `club-assets` bucket is currently served from the same
  origin as the site. SVG logo uploads have therefore been removed from the
  allowlist (PNG/JPEG/WEBP only) until the bucket is moved to a separate
  origin or a sanitizer is added.
- CSP `script-src` and `style-src` still include `'unsafe-inline'` —
  required by existing inline scripts (Lenis bootstrap, animations) and
  inline `onclick` handlers in `/ops` pages. Tightening is tracked as
  a follow-up (move inline scripts to external files, switch handlers to
  `addEventListener`, then drop `'unsafe-inline'`).
- Dev-only transitive dependencies (`ws`, `yaml` via wrangler/miniflare/
  `@astrojs/check`) have moderate CVEs that cannot be auto-fixed without
  downgrading `@astrojs/cloudflare` to v12 (a breaking change). Not
  deployed to production — monitor upstream for patched releases.
