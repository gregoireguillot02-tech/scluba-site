-- 0027 — démo : créneau (date+heure) + lien visio + modèles d'email démo
--
-- demo_at en text ('YYYY-MM-DDTHH:MM', issu d'un <input datetime-local>) pour
-- éviter toute conversion de fuseau (champ affiché + diff de date pour le rappel
-- J-1). Ajoute 3 modèles : démo prospect, démo pilote (approches différentes),
-- et rappel de démo. Colonnes nullables, additif.

alter table public.prospects
  add column if not exists demo_at text,
  add column if not exists demo_link text;

insert into public.email_templates (key, name, subject, body) values
  ('demo_prospect', 'Mail démo — prospect', 'Scluba — démo {{club}}',
   E'Bonjour {{prenom}},\n\nMerci pour votre intérêt. Comme convenu, voici le lien pour notre démo {{demo_quand}} :\n{{lien_visio}}\n\nJe vous montrerai concrètement la scorecard digitale et la carte de partie partageable, et comment l''intégrer simplement au {{club}}.\n\nÀ très vite,\nGrégoire — Scluba'),
  ('demo_pilote', 'Mail démo — pilote', 'Scluba — prise en main au {{club}}',
   E'Bonjour {{prenom}},\n\nRavi de démarrer avec le {{club}} ! On se cale {{demo_quand}} pour la prise en main :\n{{lien_visio}}\n\nJe vous guiderai sur l''installation du QR au comptoir, la page club et le suivi des parties.\n\nÀ très vite,\nGrégoire — Scluba'),
  ('demo_reminder', 'Mail de rappel démo', 'Rappel — notre démo Scluba {{demo_quand}}',
   E'Bonjour {{prenom}},\n\nPetit rappel pour notre démo Scluba {{demo_quand}}.\nLien : {{lien_visio}}\n\nÀ tout de suite,\nGrégoire — Scluba')
on conflict (key) do nothing;

notify pgrst, 'reload schema';
