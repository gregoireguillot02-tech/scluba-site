# scluba-site

Scluba — scorecard digitale pour clubs de golf. Ce repo contient le site marketing
(`scluba.com`), l'expérience scorecard côté golfeur, et le dashboard ops interne
(`scluba.com/ops`).

**Stack : Astro 6 (SSR) + Supabase + Cloudflare Workers.**

> Hébergement = **Cloudflare Workers** (Workers Builds). Le repo a un historique
> Netlify : les checks CI Netlify dans les PRs sont des **zombies**, à ignorer.

## Stack

- **Astro 6.2** — `output: server`, SSR à la demande via `@astrojs/cloudflare`
- **Supabase** — Postgres + Auth (magic link) + RLS + Storage (`@supabase/ssr`)
- **Cloudflare Workers** — runtime de prod (`wrangler.toml`, flag `nodejs_compat`)
- **GSAP + Lenis** — animations hero / recap, smooth scroll
- **Anthropic SDK** — import automatisé de clubs (`/ops/clubs/import`)
- **Sentry** (optionnel) — monitoring d'erreurs
- **Vitest** — tests unitaires
- i18n `fr` (défaut) / `en`

## Surfaces

### Public (marketing)
- `/`, `/en` — landing FR / EN
- `/demo` — démo interactive
- `/c/[slug]`, `/[slug]` — page club

### Joueur
- `/r/[shortCode]/` — lobby (attente des joueurs)
- `/r/[shortCode]/join` — inscription joueur
- `/r/[shortCode]/play` — scorecard live (temps réel)
- `/r/[shortCode]/recap` — récap + leaderboard + share card PNG

### Ops (interne, noindex, login-gated)
- `/ops` — KPIs (pipeline, MRR théorique, signups, démos) + todo
- `/ops/prospects` — kanban CRM (8 statuts) + fiche + timeline d'événements
- `/ops/reseau` — réseau FFGolf (chaînes, ligues, asso pros)
- `/ops/clubs` — clubs : édition, kit imprimable (`/print`), QR (`/qr`), import (`/import`)
- `/ops/signups` — leads remontés par le formulaire CTA public
- `/ops/todo` — todo partagée greg / paul

### API — `/api/*`
REST joueur (`/api/rounds/[shortCode]/{join,start,finish,claim,scores,comment,players}`)
et ops (`/api/ops/{clubs,prospects,network,tasks}`).

## Features livrées

- Scorecard **multi-joueurs temps réel** (Supabase realtime), 9 ou 18 trous
- Modes de scoring `self` (chacun saisit) / `host` (l'organisateur valide)
- Météo (snapshot Open-Meteo à la création), carte-photo de partie (Storage)
- 4 sponsors club affichés sur le recap + la share card PNG
- Kit QR imprimable (2 pages A4, 18 stickers) via `window.print()`
- CRM ops, réseau FFGolf, import LLM de clubs (scrape + Anthropic)

## Dev local

```bash
npm install
cp .env.example .env   # remplir les clés Supabase + l'allowlist ops
npm run dev            # → http://localhost:4321
```

Scripts : `dev`, `build`, `preview`, `test`, `test:watch`, `test:import`.

## Variables d'environnement

| Var | Visibilité | Rôle |
|---|---|---|
| `PUBLIC_SUPABASE_URL` | public | URL du projet Supabase |
| `PUBLIC_SUPABASE_ANON_KEY` | public | clé anon Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | **server** | clé service role (dashboard ops, bypass RLS) |
| `OPS_ALLOWED_EMAILS` | server | emails autorisés `/ops`, séparés par des virgules |
| `PUBLIC_DEMO_URL` | public | (opt) cible du bouton démo, défaut `/demo` |
| `ANTHROPIC_API_KEY` | server | (opt) import LLM de clubs |
| `PUBLIC_SENTRY_DSN` / `SENTRY_DSN` | public / server | (opt) monitoring Sentry |
| `SENTRY_ENVIRONMENT` | server | (opt) environnement Sentry |

## Base de données

Migrations dans `supabase/migrations/` (`0001` → `0021`, dernière =
`0021_club_sponsors.sql`). À appliquer dans l'ordre via le SQL editor Supabase.
RLS activé (deny-all par défaut ; le dashboard ops passe par le service role).

Storage buckets : `club-assets` (logos / photos club), `round-share-photos`
(photos de partie, compressées 1080×1350 JPEG).

## Auth

Magic link uniquement (`signInWithOtp`).

Flow **ops** (`/ops/login`) :

1. L'utilisateur entre son email
2. On vérifie qu'il est dans `OPS_ALLOWED_EMAILS` *avant* de demander l'OTP à Supabase
3. Supabase envoie un magic link → `/ops/auth/callback?code=…`
4. Le callback échange le code contre un cookie de session (`sb-…`)
5. Le middleware Astro re-vérifie l'allowlist sur **chaque** requête `/ops/*` (403 sinon)

Config Supabase (Authentication → URL Configuration) :
- Site URL : `https://scluba.com`
- Redirect allowlist : `https://scluba.com/ops/auth/callback` +
  `http://localhost:4321/ops/auth/callback` (dev local)

## Déploiement (Cloudflare Workers)

**Le déploiement est automatique : Cloudflare Workers Builds rebuild et déploie la
prod à chaque merge sur `main`** (la CI a les secrets `PUBLIC_*` / service role).

⚠️ **Ne jamais lancer `npm run build` en local pour déployer.** Sans `.env`, les
`PUBLIC_*` sont inlinées à `undefined` dans le bundle → prod cassée. Le build de
prod passe obligatoirement par la CI Cloudflare.

Config : `wrangler.toml` (`compatibility_date`, `nodejs_compat`). Le build Astro
produit `dist/server/wrangler.json`. Le namespace KV `SESSION` est à créer
manuellement dans le dashboard Cloudflare.

## Roadmap

Pistes à venir (auth OAuth/OTP, app mobile/PWA, dashboard stats club, timer de
partie, tracés / carnet de parcours, avis fin de partie, commentaire jardinier,
balle connectée) : voir la section **Roadmap** du `CLAUDE.md` à la racine du projet.

## Sécurité

Voir `SECURITY.md` (CSP, CSRF, RLS, rate-limit, magic link, Sentry) — politique de
rapport de vulnérabilités incluse.
