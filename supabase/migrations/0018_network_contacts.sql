-- 0018 — network_contacts: annuaire écosystème FFGolf (chaînes, ligues, asso pros)
--
-- Suivi de 21 contacts d'intro institutionnelle, séparé des prospects-clubs (table
-- `prospects` créée en 0001). Pipeline simple à 4 statuts, log des intros faites
-- en text[]. Accès service_role uniquement (admin /ops via middleware d'auth).

-- Postgres n'a pas de "create type if not exists" — wrapper en DO block pour idempotence.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'network_org_type') then
    create type public.network_org_type as enum ('chaine', 'ligue', 'asso');
  end if;
  if not exists (select 1 from pg_type where typname = 'network_status') then
    create type public.network_status as enum ('to_contact', 'contacted', 'intro_done', 'dead');
  end if;
end $$;

create table if not exists public.network_contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  org text not null,
  org_type public.network_org_type not null,
  region text,
  email text,
  phone text,
  website text,
  status public.network_status not null default 'to_contact',
  notes text,
  intros_made text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists network_contacts_org_type_idx on public.network_contacts(org_type);
create index if not exists network_contacts_status_idx on public.network_contacts(status);
create index if not exists network_contacts_region_idx on public.network_contacts(region);

-- Réutilise la fonction touch_updated_at() créée en 0001_ops_schema.sql
drop trigger if exists network_contacts_updated_at on public.network_contacts;
create trigger network_contacts_updated_at
  before update on public.network_contacts
  for each row execute function public.touch_updated_at();

alter table public.network_contacts enable row level security;
-- Aucune policy publique : seul le service_role accède (utilisé par /ops via serviceClient()).

-- ============================================================================
-- Seed : 21 contacts FFGolf (4 chaînes + 13 ligues métropole + 4 asso pros)
-- Source : "CONTACTS V11072024.pdf" (FFGolf, données 2021).
-- DOM-TOM volontairement exclus (hors marché Scluba).
-- ============================================================================

insert into public.network_contacts (name, role, org, org_type, region, email, phone, website) values
  -- Chaînes (4)
  ('Pierre-André Uhlen', 'Référent', 'UGolf / Blue Green', 'chaine', null, 'contact@ugolf.eu', '01 41 18 65 50', 'https://www.ugolf.eu'),
  ('Alexis Davet', 'Référent', 'Resonnance / Open Golf Club', 'chaine', null, 'adavet@opengolfclub.com', '01 42 89 18 72', 'https://www.opengolfclub.com'),
  ('Thierry Flipo', 'Référent', 'Gaia Concept', 'chaine', null, 'flipo.thierry@orange.fr', '09 63 26 17 71', 'https://www.gaiaconcept.fr'),
  ('Matthieu Briol', 'Référent', 'UCPA', 'chaine', null, 'mbriol@ucpa.asso.fr', '01 45 87 46 80', 'https://www.ucpa.com'),

  -- Ligues métropole (13)
  ('Thierry Peysson', 'Président', 'Ligue Auvergne Rhône Alpes', 'ligue', 'Auvergne Rhône Alpes', 'contact@liguegolfaura.com', '04 78 24 76 61', 'https://www.liguegolfaura.com'),
  ('Claude Schatz', 'Président', 'Ligue Bourgogne Franche Comté', 'ligue', 'Bourgogne Franche Comté', 'contact@liguegolfbfc.fr', '03 80 25 09 72', 'https://www.liguegolfbfc.fr'),
  ('Jean-Luc Poulain', 'Président', 'Ligue Bretagne', 'ligue', 'Bretagne', 'ligue.bretagne.golf@wanadoo.fr', '02 99 31 68 80', 'https://www.liguebretagnegolf.org'),
  ('Christophe Dorise', 'Président', 'Ligue Centre Val de Loire', 'ligue', 'Centre Val de Loire', 'contact@golf-centre.fr', '06 66 08 47 79', 'https://www.golf-centre.fr'),
  ('Richard Bertolucci', 'Président', 'Ligue Corse', 'ligue', 'Corse', 'contact@liguecorsedegolf.org', '04 95 32 54 53', 'https://www.liguecorsedegolf.org'),
  ('Philippe Pinceloup', 'Président', 'Ligue Grand Est', 'ligue', 'Grand Est', 'contact@ligue-golfgrandest.org', '03 83 18 95 34', 'http://ligue-golfgrandest.org'),
  ('Jean-Louis Lignier', 'Président', 'Ligue Hauts de France', 'ligue', 'Hauts de France', 'golfhautsdefrance@gmail.com', '03 20 98 96 58', 'https://www.golfhautsdefrance.com'),
  ('Pierre Lordereau', 'Président', 'Ligue Normandie', 'ligue', 'Normandie', 'contact@liguegolfnormandie.fr', '02 32 65 26 39', 'http://liguegolfnormandie.fr'),
  ('Anne Ridoux', 'Président', 'Ligue Nouvelle Aquitaine', 'ligue', 'Nouvelle Aquitaine', 'contact@ligolfna.com', '05 56 57 61 83', 'https://www.ligue-golfna.org'),
  ('Véronique Branover', 'Président', 'Ligue Occitanie', 'ligue', 'Occitanie', 'contact@liguegolfoccitanie.fr', '05 31 61 91 05', 'https://www.liguegolfoccitanie.fr'),
  ('Bertrand Mayer', 'Président', 'Ligue Paris-Île de France', 'ligue', 'Paris-Île de France', 'contact@lgpidf.com', '01 30 43 30 32', 'https://www.lgpidf.com'),
  ('Alain Vallet', 'Président', 'Ligue Pays de Loire', 'ligue', 'Pays de Loire', 'golfpdl@wanadoo.fr', '02 40 08 05 06', 'https://www.ligue-golf-paysdelaloire.asso.fr'),
  ('Jean-Yves Ortega', 'Président', 'Ligue Provence Alpes Côte d''Azur', 'ligue', 'Provence Alpes Côte d''Azur', 'contact@liguegolfpaca.org', '04 42 76 35 22', 'https://www.liguegolfpaca.com'),

  -- Associations professionnelles (4)
  ('Jean-Franck Burou', 'Président', 'ADGF (Asso Directeurs de Golf de France)', 'asso', null, 'adgfmail@gmail.com', null, 'https://www.adgf.org'),
  ('Remi Dorbeau', 'Président', 'AGREF (Entretien Terrains de Golf)', 'asso', null, 'agref.golf@wanadoo.fr', '05 59 52 86 52', 'https://www.agref.org'),
  ('Eric Douenelle', 'Président', 'PGA France', 'asso', null, 'contact@pgafrance.org', '01 34 52 08 46', 'https://www.pgafrance.org'),
  ('Yves Rochereau', 'Président', 'GFGA (Groupement Français des Golfs Associatifs)', 'asso', null, 'gfga@ffgolf.org', '01 41 49 80 10', 'https://www.gfga.fr');
