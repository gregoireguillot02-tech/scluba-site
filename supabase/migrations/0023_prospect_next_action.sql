-- 0023 — prospects.next_action : suivi des relances ("prochaine action")
--
-- Ajoute une date de prochaine action explicite + une note libre sur chaque
-- prospect. La home /ops ("À faire") liste les prospects dont next_action_at
-- est due (en retard / aujourd'hui / cette semaine). Colonnes nullables :
-- additif, la prod ignore ces colonnes tant qu'elle ne les lit pas, aucune
-- perte de données.

alter table public.prospects
  add column if not exists next_action_at date,
  add column if not exists next_action_note text;

-- Index partiel : seuls les prospects avec une action programmée sont
-- interrogés/triés par la home, ça garde l'index petit.
create index if not exists prospects_next_action_idx
  on public.prospects(next_action_at)
  where next_action_at is not null;

-- RLS déjà active sur prospects (cf 0001). Service role uniquement, rien à ajouter.
