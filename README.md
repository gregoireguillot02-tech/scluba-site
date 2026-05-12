# scluba-site

Marketing site (`scluba.com`), public scorecard app (`/r/[shortCode]/*`) and
internal ops dashboard (`/ops`). Astro + Supabase, deployed on **Cloudflare
Workers** (Static Assets + on-demand SSR via `@astrojs/cloudflare`).

## Stack

- Astro 6 (static for the public pages, on-demand SSR for `/ops/*`, `/api/*`
  and `/r/*` via the Cloudflare adapter)
- Supabase (auth via magic link + Postgres for the CRM and rounds)
- GSAP for the hero animations, Lenis for smooth scroll
- Sentry (optional) for error monitoring

## Local dev

```bash
npm install
cp .env.example .env       # fill in Supabase keys + the ops allowlist
npm run dev                # → http://localhost:4321
```

For Workers-bound bindings (KV `SESSION`, etc.) during local dev, mirror your
prod secrets into `.dev.vars` (gitignored) — `wrangler dev` will pick them up.

Public pages live at `/`, `/demo`, `/en`, `/variants`. The scorecard app is at
`/r/[shortCode]/*` and the internal dashboard at `/ops` (magic-link login).

## Internal dashboard (`/ops`)

Hidden, noindex, login-gated. Authorized emails are whitelisted via the
`OPS_ALLOWED_EMAILS` env var (comma-separated).

Surfaces:

- `/ops` — KPIs (pipeline, MRR théorique, signups CTA, démos prévues) + todo
- `/ops/prospects` — kanban CRM (8 statuts, filtres, recherche, modale)
- `/ops/prospects/[id]` — fiche club (édition, timeline d'événements, tâches)
- `/ops/todo` — todo partagée greg/paul, filtres par owner, dates d'échéance
- `/ops/signups` — leads du CTA public, conversion en prospect 1-clic
- `/ops/clubs/[id]/print` — feuille A4 imprimable (QR + flyers)

### First-time setup

1. **Apply the SQL migrations** to your Supabase project (SQL editor):

   Run every file in `supabase/migrations/` in order. RLS denies all by
   default — the dashboard and API use the service role to bypass.

2. **Configure Cloudflare Workers env vars** (Dashboard → Workers & Pages →
   `scluba-site` → Settings → Variables and Secrets):

   | Var | Type | Value |
   |---|---|---|
   | `PUBLIC_SUPABASE_URL` | Variable (plain) | Supabase project URL |
   | `PUBLIC_SUPABASE_ANON_KEY` | Variable (plain) | Supabase anon/public key |
   | `PUBLIC_DEMO_URL` | Variable (plain) | `https://scluba.com/demo` |
   | `SUPABASE_SERVICE_ROLE_KEY` | **Secret (encrypted)** | Supabase service role key |
   | `OPS_ALLOWED_EMAILS` | **Secret (encrypted)** | `greg@…,paul@…` |
   | `SENTRY_DSN` | **Secret (encrypted)** | (optional) Sentry DSN |
   | `PUBLIC_SENTRY_DSN` | Variable (plain) | (optional) same Sentry DSN |

   Equivalent via CLI:

   ```bash
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   npx wrangler secret put OPS_ALLOWED_EMAILS
   npx wrangler secret put SENTRY_DSN          # optional
   # Plain vars go via the dashboard or `[vars]` in wrangler.toml — never
   # put secrets in wrangler.toml (it gets committed).
   ```

3. **Create the KV namespace** for sessions (Dashboard → Storage & Databases
   → KV → Create namespace "SESSION"), then bind it under Settings → Bindings
   on the `scluba-site` Worker.

4. **Configure Supabase Auth redirect URLs** (Supabase dashboard →
   Authentication → URL Configuration):

   - Site URL: `https://scluba.com`
   - Redirect allowlist: `https://scluba.com/ops/auth/callback` and
     `http://localhost:4321/ops/auth/callback` for local dev.

5. **Deploy**: push to `main` → CI builds the Worker. Manual deploy from a
   local build:

   ```bash
   npm run build                              # → dist/server/wrangler.json
   npx wrangler deploy -c dist/server/wrangler.json
   ```

### Auth flow

1. User goes to `/ops/login`, enters email
2. We check the email is in `OPS_ALLOWED_EMAILS` *before* asking Supabase for an OTP
3. Supabase emails a magic link → click → `/ops/auth/callback?code=…`
4. Callback exchanges the code for a session cookie (`sb-…`)
5. Astro middleware re-checks the allowlist on every `/ops/*` request — even if
   someone else's email got into auth.users, they'll get a 403

## Public CTA form

The form on the homepage writes to the existing `leads` table in Supabase
(direct REST POST from the browser, anon key). Leads show up in `/ops/signups`
where they can be promoted to a CRM prospect in one click.

## Tests

```bash
npm test                   # vitest run
npm run test:watch
```

## Build / preview

```bash
npm run build              # → dist/ + dist/server/wrangler.json
npm run preview            # serve the build locally
```

## Security

See [`SECURITY.md`](SECURITY.md) for vulnerability reporting. A `gitleaks`
GitHub Action scans every PR and push to `main` for accidentally committed
secrets.
