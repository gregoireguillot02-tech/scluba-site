-- PR: Carnet de parcours — un visuel (image) par trou, fourni par le club.
-- Stocke une map { "<numéro de trou canonique>": "<url image publique>" } sur
-- la table clubs. Les images vivent dans le bucket Storage public `club-assets`
-- (déjà créé en 0006), path {club_id}/hole-{n}-{ts}.{ext} — donc pas de nouvelle
-- policy Storage ni RLS : la row clubs est déjà lisible et le bucket public.

alter table clubs
  add column if not exists hole_guides jsonb not null default '{}'::jsonb;

comment on column clubs.hole_guides is
  'Carnet de parcours : map { hole_number(text) : public image url }. Vide = pas de carnet.';
