-- Multi-loop golf courses: a single club can expose several formats (e.g. 18
-- holes Plaine+Vallon, or any single 9-hole loop). The round records which
-- format was chosen so play/recap can render the right hole list.
--
-- Backward compat: `clubs.course_data.holes` (flat 18-hole array) is kept.
-- Rounds with `format_id IS NULL` continue to play that flat array exactly
-- like before this migration.

alter table public.rounds
  add column if not exists format_id text;

-- Caen actually has 3 nine-hole loops with their own pars:
--   La Plaine (par 36): 4-4-3-4-5-3-4-4-5
--   Le Vallon (par 35): 4-5-3-4-3-4-5-3-4
--   Le Bois   (par 37): 5-4-4-4-3-4-5-4-4
-- The 18-hole composite is La Plaine + Le Vallon (par 71). The remaining
-- 9-hole formats stand on their own.
update public.clubs
set course_data = jsonb_build_object(
  'holes', course_data->'holes',
  'loops', jsonb_build_array(
    jsonb_build_object(
      'id', 'plaine', 'name', 'La Plaine',
      'holes', jsonb_build_array(
        jsonb_build_object('number', 1, 'par', 4),
        jsonb_build_object('number', 2, 'par', 4),
        jsonb_build_object('number', 3, 'par', 3),
        jsonb_build_object('number', 4, 'par', 4),
        jsonb_build_object('number', 5, 'par', 5),
        jsonb_build_object('number', 6, 'par', 3),
        jsonb_build_object('number', 7, 'par', 4),
        jsonb_build_object('number', 8, 'par', 4),
        jsonb_build_object('number', 9, 'par', 5)
      )
    ),
    jsonb_build_object(
      'id', 'vallon', 'name', 'Le Vallon',
      'holes', jsonb_build_array(
        jsonb_build_object('number', 1, 'par', 4),
        jsonb_build_object('number', 2, 'par', 5),
        jsonb_build_object('number', 3, 'par', 3),
        jsonb_build_object('number', 4, 'par', 4),
        jsonb_build_object('number', 5, 'par', 3),
        jsonb_build_object('number', 6, 'par', 4),
        jsonb_build_object('number', 7, 'par', 5),
        jsonb_build_object('number', 8, 'par', 3),
        jsonb_build_object('number', 9, 'par', 4)
      )
    ),
    jsonb_build_object(
      'id', 'bois', 'name', 'Le Bois',
      'holes', jsonb_build_array(
        jsonb_build_object('number', 1, 'par', 5),
        jsonb_build_object('number', 2, 'par', 4),
        jsonb_build_object('number', 3, 'par', 4),
        jsonb_build_object('number', 4, 'par', 4),
        jsonb_build_object('number', 5, 'par', 3),
        jsonb_build_object('number', 6, 'par', 4),
        jsonb_build_object('number', 7, 'par', 5),
        jsonb_build_object('number', 8, 'par', 4),
        jsonb_build_object('number', 9, 'par', 4)
      )
    )
  ),
  'formats', jsonb_build_array(
    jsonb_build_object('id', '18',       'label', '18 trous · Plaine + Vallon', 'loop_ids', jsonb_build_array('plaine', 'vallon')),
    jsonb_build_object('id', '9-plaine', 'label', '9 trous · La Plaine',         'loop_ids', jsonb_build_array('plaine')),
    jsonb_build_object('id', '9-vallon', 'label', '9 trous · Le Vallon',         'loop_ids', jsonb_build_array('vallon')),
    jsonb_build_object('id', '9-bois',   'label', '9 trous · Le Bois',           'loop_ids', jsonb_build_array('bois'))
  )
)
where slug = 'caen-la-mer';
