-- 0024 — email_templates : modèles d'email réutilisables pour le CRM /ops
--
-- Deux modèles éditables depuis /ops/parametres : confirmation de démo et
-- démarchage/explicatif. Le corps supporte des placeholders {{prenom}},
-- {{club}}, {{lien_visio}} remplis à la volée depuis la fiche prospect.
-- Accès service_role uniquement (admin /ops via middleware d'auth).

create table if not exists public.email_templates (
  key text primary key,
  name text not null,
  subject text not null default '',
  body text not null default '',
  updated_at timestamptz not null default now()
);

-- Réutilise touch_updated_at() créée en 0001_ops_schema.sql
drop trigger if exists email_templates_updated_at on public.email_templates;
create trigger email_templates_updated_at
  before update on public.email_templates
  for each row execute function public.touch_updated_at();

alter table public.email_templates enable row level security;
-- Aucune policy publique : seul le service_role accède (utilisé par /ops via serviceClient()).

-- Seed des 2 modèles (skeletons à personnaliser dans /ops/parametres).
insert into public.email_templates (key, name, subject, body) values
  (
    'demo_confirmation',
    'Mail de démo',
    'Scluba — démo {{club}}',
    E'Bonjour {{prenom}},\n\nMerci pour votre intérêt pour Scluba. Comme convenu, voici le lien pour notre démo :\n{{lien_visio}}\n\nJe vous présenterai la scorecard digitale et la carte de partie partageable, et comment l''intégrer simplement au {{club}}.\n\nÀ très vite,\nGrégoire — Scluba'
  ),
  (
    'outreach',
    'Mail de démarchage / explicatif',
    'Scluba — la scorecard digitale pour {{club}}',
    E'Bonjour {{prenom}},\n\nJe me permets de vous contacter au sujet du {{club}}. Nous avons développé Scluba, une scorecard digitale que vos golfeurs scannent au départ : ils suivent leur partie en temps réel et repartent avec une carte de partie partageable aux couleurs du club.\n\nLa mise en place est gratuite et sans engagement pour démarrer. Seriez-vous disponible pour un court échange ou une démo de 15 minutes ?\n\nBien à vous,\nGrégoire — Scluba'
  )
on conflict (key) do nothing;
