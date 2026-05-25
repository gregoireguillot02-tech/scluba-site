-- PR: Sponsors sur la scorecard.
--
-- Ajoute 4 emplacements sponsors (image + lien optionnel) sur clubs.
-- Affichés flanquant le score sur la page recap publique et sur la share
-- card PNG. Slots vides invisibles. Upload via /api/ops/clubs/[id]/upload
-- avec kind=sponsor1..sponsor4 dans le bucket existant `club-assets`.

alter table clubs
  add column if not exists sponsor_1_url  text,
  add column if not exists sponsor_2_url  text,
  add column if not exists sponsor_3_url  text,
  add column if not exists sponsor_4_url  text,
  add column if not exists sponsor_1_link text,
  add column if not exists sponsor_2_link text,
  add column if not exists sponsor_3_link text,
  add column if not exists sponsor_4_link text;
