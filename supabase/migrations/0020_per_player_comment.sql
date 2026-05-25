-- 0020_per_player_comment.sql
-- Commentaire perso par joueur sur la carte recap.
--
-- Avant : commentaire sur `rounds` (1 par partie) + check `is_creator` côté
-- API. Conséquence : seul l'organisateur pouvait écrire un commentaire, les
-- joueurs invités voyaient "Seul l'organisateur peut modifier le commentaire"
-- en essayant de personnaliser leur propre carte perso.
-- Le check is_creator avait été mis en mitigation d'un audit HIGH ("n'importe
-- qui dans la partie peut overwrite le commentaire partagé sur le PNG").
--
-- Après : commentaire sur `round_players` (1 par joueur). Chaque carte perso
-- affiche le commentaire du joueur dont c'est la carte. L'overwrite n'est
-- plus possible — chacun n'a accès qu'à sa propre row (vérifié via cookie).
--
-- `rounds.comment` reste en place pour cette release (rollback safety +
-- backfill ci-dessous). À droper dans une migration future une fois la
-- prod stable.

alter table public.round_players
  add column if not exists comment text;

-- Backfill : recopier le commentaire existant (round-wide) sur le row de
-- l'organisateur, pour ne pas perdre les commentaires saisis avant cette
-- migration. Les autres joueurs partent sur null (état attendu : ils
-- n'avaient jamais pu en saisir).
update public.round_players rp
  set comment = r.comment
  from public.rounds r
  where rp.round_id = r.id
    and rp.is_creator = true
    and r.comment is not null
    and rp.comment is null;
