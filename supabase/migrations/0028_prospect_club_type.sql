-- 0028 — prospects.club_type : type d'exploitation du golf
--
-- Pour la prospection à froid : UGolf, Bluegreen, Resort, Indépendant,
-- Municipal, Associatif, Autre. Colonne text nullable, additive — la prod
-- ignore la colonne tant qu'elle ne la lit/écrit pas, aucune perte de données.

alter table public.prospects
  add column if not exists club_type text;

notify pgrst, 'reload schema';
