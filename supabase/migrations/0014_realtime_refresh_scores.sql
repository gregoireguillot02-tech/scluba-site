-- 0014_realtime_refresh_scores.sql
-- Force Supabase Realtime à re-scanner les colonnes de la table `scores`
-- pour inclure `picked_up` (ajoutée par 0012 le 14 mai 2026, après la
-- création de la publication par 0005 le 11 mai 2026).
--
-- PostgreSQL ne refresh PAS automatiquement la liste des colonnes
-- publiées par une publication lorsqu'on ajoute une colonne à une table
-- qui en fait déjà partie. Du coup les events Realtime pour `scores`
-- ne contenaient que les colonnes d'avant la migration 0012, et le
-- live-board sur `play.astro` voyait `picked_up = undefined` lors des
-- saisies pickup des autres joueurs en multi-host mode.
--
-- Le drop + add force Realtime à re-scanner le schéma complet de la
-- table et à inclure la nouvelle colonne. Mini-fenêtre de ~ms pendant
-- laquelle les saisies de scores ne sont pas broadcastées en temps réel,
-- mais sans impact persistant.

alter publication supabase_realtime drop table public.scores;
alter publication supabase_realtime add table public.scores;
