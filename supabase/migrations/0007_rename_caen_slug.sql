-- Rename the development seed slug from `scluba-test` to `golf-de-caen` so
-- the public URL printed on the Caen-La-Mer pitch QR is professional and
-- memorable (scluba.com/c/golf-de-caen). All references in code keep using
-- the slug column, so this is a pure data migration.

update public.clubs
set slug = 'golf-de-caen'
where slug = 'scluba-test';
