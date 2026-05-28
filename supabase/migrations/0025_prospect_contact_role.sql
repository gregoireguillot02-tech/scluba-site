-- 0025 — prospects.contact_role : fonction du contact (ex. "Directeur")
--
-- Colonne nullable, additive : la prod ignore la colonne tant qu'elle ne la lit
-- pas, aucune perte de données.

alter table public.prospects
  add column if not exists contact_role text;
