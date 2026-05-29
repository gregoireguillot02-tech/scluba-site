-- 0034_round_tee_time.sql
-- Heure de départ "officielle" d'une partie, pour la feature rythme de jeu.
--
-- Contexte : `started_at` est (ré)écrit au clic "C'est parti" (transition
-- lobby→playing, cf. api/rounds/[shortCode]/start.ts). Ça suffit pour la plupart
-- des départs, mais on veut laisser le créateur renseigner une heure de départ
-- explicite au lobby (ex : ils ont teeté avant d'ouvrir l'app, ou départ réservé
-- au starter).
--
-- `tee_time` est la référence du calcul de cadence (src/lib/pace.ts). S'il est
-- null, le calcul retombe sur `started_at`. Nullable + pas de défaut → rétro-compat
-- totale : les parties existantes et celles créées sans saisie restent sur le
-- fallback `started_at`.

alter table public.rounds
  add column if not exists tee_time timestamptz;

comment on column public.rounds.tee_time is
  'Heure de départ saisie au lobby (référence cadence/rythme de jeu). Null = fallback sur started_at.';
