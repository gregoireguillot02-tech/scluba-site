-- Shorter, more pronounceable seed slug for the Caen-La-Mer pitch.
-- The /c/ prefix is also dropped at the route layer in the same change,
-- so the public URL becomes scluba.com/caen-la-mer (was /c/golf-de-caen).

update public.clubs
set slug = 'caen-la-mer'
where slug in ('golf-de-caen', 'scluba-test');
