# /variants — prototypes du flow de saisie (Couche 2B)

⚠️ **ÉPHÉMÈRE.** Pages de prototypage pour **choisir le flow de saisie multijoueur**
(refonte ergonomie — spec `docs/specs/2026-05-31-refonte-scorecard-multijoueur.md`).
À **supprimer** une fois la direction tranchée, puis industrialiser le flow retenu
dans `src/pages/r/[shortCode]/play.astro`.

## URLs (deploy preview, noindex)
- `/variants` → index (liens + descriptions)
- `/variants/play-b` → **B « Assisté »** (défaut proposé) : 1 joueur plein écran, tap → ✓ → joueur suivant ; CTA « Trou suivant » quand le trou est complet.
- `/variants/play-c` → **C « Ultra-rapide »** : chrome minimal, tap qui enchaîne joueur→joueur→trou en continu, swipe pour changer de trou.
- `/variants/play-a` → **A « Grille »** : tous les joueurs du trou empilés, tape une ligne + un score, CTA « Trou suivant » toujours dispo.

## Caractéristiques
- **Interactifs** : données mock (`_fixture.ts`) + store framework-free (`_mock-store.ts`, logique scoring/nav **identique** à `play.astro`). **Aucun backend / auth / realtime.**
- **Pas de `PlayerLayout`** → pas de `<ClientRouter>` (sinon les scripts inline re-bindent sur navigation entre variantes). Chaque page a son propre `<html>` via `_Shell.astro` ; les liens du switch = full load.
- `noindex,nofollow`. `output: server` → les routes `/variants/*` sont live en preview (et prod) **jusqu'à suppression** → ne pas linker depuis l'app.
- Réutilisent les vrais **tokens** (`tokens.css` `body[data-player-flow]`), **fonts** (Sora/Inter/JetBrains), `avatar.ts`, `animations/play.ts`, et **`lib/leaderboard.ts`** (format des chiffres identique au vrai flow).

## Cycle de vie
1. PR : ces pages déployées en preview.
2. Grégoire teste **B / C / A** sur son tel → choisit la direction.
3. PR d'industrialisation : appliquer le flow retenu dans `play.astro`.
4. **Supprimer `src/pages/variants/`.**

## Fichiers
- `_Shell.astro` — wrapper (html/head/body, tokens, fonts, noindex, switch B/C/A), sans ClientRouter.
- `_fixture.ts` — données mock (club, 4 joueurs, 18 trous, mi-partie trou 6).
- `_mock-store.ts` — store + nav (createMockStore).
- `_proto.css` — styles partagés (boutons par-relatifs jusqu'au Triple, glass, leaderboard, CTA, toast).
- `play-a|b|c.astro` — les 3 flows.
- `index.astro` — menu.
