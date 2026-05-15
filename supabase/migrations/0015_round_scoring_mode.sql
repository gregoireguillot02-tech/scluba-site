-- 0015_round_scoring_mode.sql
-- Ajoute `scoring_mode` aux parties pour distinguer le pattern de saisie :
--   * 'self' (défaut) : chaque joueur saisit ses scores sur son propre tel
--   * 'host'          : un seul scoreur dans le flight (le host) tient la
--                       carte pour tout le monde ; les autres joueurs ont
--                       une vue spectateur centrée sur le classement live,
--                       avec un bouton "Corriger mon score" en exception.
--
-- Le défaut 'self' préserve le comportement actuel pour les parties
-- existantes et les parties créées sans ce champ (rétro-compat).
-- L'UI de création offre le choix uniquement en mode "À plusieurs" ;
-- les parties solo restent implicitement en 'self'.

alter table rounds
  add column scoring_mode text not null default 'self'
    check (scoring_mode in ('self', 'host'));

comment on column rounds.scoring_mode is
  'self = chaque joueur sur son tel; host = host saisit pour tous, spectateur read-only pour les autres';
