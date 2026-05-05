# scluba-site

Marketing site (`scluba.golf`) and internal ops dashboard (`scluba.golf/ops`).
Astro + Supabase, deployed on Netlify.

## Stack

- Astro 6 (static for the public pages, on-demand SSR for `/ops/*` and `/api/ops/*` via the Netlify adapter)
- Supabase (auth via magic link + Postgres for the CRM)
- GSAP for the hero animations

## Local dev

```bash
npm install
cp .env.example .env       # fill in Supabase keys + the ops allowlist
npm run dev                # → http://localhost:4321
```

Public pages are at `/`, `/demo`, `/en`, `/variants`. The internal dashboard
is at `/ops` (login via magic link).

## Internal dashboard (`/ops`)

Hidden, noindex, login-gated. Authorized emails are whitelisted via the
`OPS_ALLOWED_EMAILS` env var (comma-separated).

Surfaces:

- `/ops` — KPIs (pipeline, MRR théorique, signups CTA, démos prévues) + todo en cours
- `/ops/prospects` — kanban CRM (8 statuts, filtres, recherche, modale "nouveau club")
- `/ops/prospects/[id]` — fiche club (édition, timeline d'événements, tâches liées)
- `/ops/todo` — todo partagée greg/paul, filtres par owner, dates d'échéance
- `/ops/signups` — leads remontés par le formulaire CTA public, conversion en prospect 1-clic

### First-time setup

1. **Apply the SQL migration** to your Supabase project (SQL editor):

   Copy/paste `supabase/migrations/0001_ops_schema.sql` and run it.
   Creates `prospects`, `prospect_events`, `tasks` (RLS denies all by default —
   the dashboard uses the service role to bypass).

2. **Configure env vars** in Netlify (`Site settings → Environment variables`):

   | Var | Where | Value |
   |---|---|---|
   | `PUBLIC_SUPABASE_URL` | public | Supabase project URL |
   | `PUBLIC_SUPABASE_ANON_KEY` | public | Supabase anon/public key |
   | `SUPABASE_SERVICE_ROLE_KEY` | **server-only** | Supabase service role key |
   | `OPS_ALLOWED_EMAILS` | server-only | `greg@…,paul@…` |

3. **Configure Supabase Auth redirect URLs** (Supabase dashboard →
   Authentication → URL Configuration):

   - Site URL: `https://scluba.golf`
   - Add to redirect allowlist: `https://scluba.golf/ops/auth/callback`
     and `http://localhost:4321/ops/auth/callback` for local dev.

4. **Deploy**: push to `main` → Netlify auto-builds with the SSR adapter.

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

## Build / preview

```bash
npm run build              # → dist/ + .netlify/functions-internal/
npm run preview            # serve the build locally
```
