-- 0012_weather_and_comment.sql
-- Support météo + commentaire joueur sur les cartes partagées (#9).
--
-- Météo : snapshot Open-Meteo récupéré à la création de la partie. Stocké
-- en jsonb pour garder de la flexibilité sans schéma rigide. Un fetch
-- éphémère côté serveur, jamais ré-interrogé après création (la carte
-- partagée reflète la météo du tee-off, pas l'instant de partage).
--
-- Commentaire : texte libre saisi par le joueur sur la page recap. Affiché
-- sur le PNG partagé. Une row par round (chaque joueur ne peut commenter
-- qu'une fois sa propre carte).
--
-- Coords clubs : Open-Meteo a besoin de lat/lon. Stockés sur clubs (pas
-- sur rounds) puisque le club ne bouge pas. Nullable parce qu'on peut
-- créer un club sans coords (la météo sera juste skip).

alter table public.rounds
  add column if not exists weather jsonb,
  add column if not exists comment text;

alter table public.clubs
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

-- Backfill : Golf de Caen-la-Mer (Biéville-Beuville). Coords approximatives
-- du clubhouse. Si le slug a été renommé, adapter à la main avant prod.
update public.clubs
  set latitude = 49.2155,
      longitude = -0.3697
  where slug in ('caen-la-mer', 'caen', 'golf-caen-la-mer')
    and (latitude is null or longitude is null);
