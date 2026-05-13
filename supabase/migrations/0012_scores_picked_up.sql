-- 0012_scores_picked_up.sql
-- Support pour les trous abandonnés (chablis / "C").
--
-- Règle officielle Rules of Golf 2023 ("Maximum Score") : un trou non terminé
-- compte par défaut comme par(trou) + 2 coups. C'est ce qui est appliqué côté
-- application lors du calcul du total et de l'écart au par.
--
-- En base on ne stocke que le marqueur `picked_up = true`, le coup effectif
-- est calculé à la volée (pour pouvoir changer la règle plus tard sans
-- migration). Quand `picked_up = true`, `strokes` peut être null.

alter table public.scores
  add column if not exists picked_up boolean not null default false;

-- strokes devient nullable : un trou abandonné a strokes = null + picked_up = true.
alter table public.scores
  alter column strokes drop not null;

-- Invariant : exactement une des deux situations doit être vraie :
--   (a) trou joué normalement : strokes IS NOT NULL AND picked_up = false
--   (b) trou abandonné        : strokes IS NULL     AND picked_up = true
alter table public.scores
  drop constraint if exists scores_state_consistent;
alter table public.scores
  add constraint scores_state_consistent
  check (
    (strokes is not null and picked_up = false)
    or
    (strokes is null and picked_up = true)
  );
