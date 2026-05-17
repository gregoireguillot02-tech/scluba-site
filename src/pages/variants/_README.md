# /variants/ — pages éphémères de validation visuelle

Ces pages sont des **prototypes throwaway** pour valider une direction visuelle.
Elles ne sont **pas connectées à la DB**, n'ont pas d'auth, pas de realtime,
juste du markup statique avec des mock data (`_fixture.ts`).

## URLs (deploy preview Cloudflare)

- `/variants/play-a` — Whoop-style (data-dense, mono caps, fond near-black, honey vif)
- `/variants/play-b` — Strava-style (energetic orange-honey, body Inter + titres Sora)
- `/variants/play-c` — Arc'teryx-style (premium minimal techwear, fond noir, accents honey subtils)

Toutes ont `<meta name="robots" content="noindex,nofollow">` pour ne pas polluer les SEO.

## Cycle de vie

1. PR #74 : ces 3 pages sont créées et déployées en preview.
2. Le creator (Grégoire) choisit la direction qui lui parle le plus.
3. PR #75 industrialise la direction choisie dans `tokens.css` + crée `DESIGN_SYSTEM.md`.
4. PRs ultérieures refondent les 4 vrais écrans player (play, lobby, join, recap).
5. **Une fois la direction validée et appliquée, ce dossier `/variants/` est supprimé.**

## Non-buts

- Pas de saisie réelle (les boutons sont inactifs, pas de JS de soumission).
- Pas de realtime, pas de Supabase.
- Pas d'a11y poussée (c'est du proto).
- Pas de tests.
