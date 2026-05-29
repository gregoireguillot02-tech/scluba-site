-- 0033_clubs_icon_url.sql
-- Icône carrée (512x512 PNG) dérivée du logo, pour l'écran d'accueil iOS/Android.
-- Générée côté navigateur à l'upload du logo dans /ops, stockée dans le bucket
-- club-assets. NULL = pas encore d'icône → repli sur logo_url côté front.
alter table clubs add column icon_url text;
