-- Replace the placeholder seed (Club de test Scluba, Caen, no media) with a
-- realistic example club. Reuses the existing golf-du-soleil.* assets in /public
-- as a placeholder until PR C ships the admin upload flow.

update public.clubs
set
  name = 'Golf de Caen',
  city = 'Caen',
  logo_url = '/logos/golf-du-soleil.svg',
  photo_url = '/photos/golf-du-soleil.jpg',
  primary_color = '#1B4332'
where slug = 'scluba-test';
