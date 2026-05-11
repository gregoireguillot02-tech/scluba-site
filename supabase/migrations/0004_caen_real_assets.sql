-- Use the real Golf de Caen-La-Mer assets (downloaded from golf-caenlamer.fr)
-- and brand colors (extracted from the official SVG).
-- Navy #004899 = primary, Gold #CBA43D matches Scluba's honey accent already.

update public.clubs
set
  name = 'Golf de Caen-La-Mer',
  city = 'Bieville-Beuville',
  logo_url = '/logos/golf-de-caen.svg',
  photo_url = '/photos/golf-du-soleil.jpg',
  primary_color = '#004899'
where slug = 'scluba-test';
