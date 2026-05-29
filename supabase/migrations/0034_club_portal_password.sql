-- Portail Club v3 — accès = EMAIL AUTORISÉ + MOT DE PASSE PARTAGÉ par club.
-- On GARDE l'allowlist club_members (email → rôle, cf. 0031). On ajoute un mot
-- de passe unique par club (clubs.portal_code) : le membre se connecte sur /club
-- avec son email autorisé + ce mot de passe (fini le magic-link Supabase ici).
-- L'email décide du rôle/dashboard (gérant vs jardinier), le mot de passe est le
-- secret partagé du club, généré + ré-affichable depuis /ops.

-- Mot de passe partagé du club (NULL tant que /ops ne l'a pas généré).
alter table public.clubs add column if not exists portal_code text;

-- resolved_by pointait vers auth.users(id) (modèle magic-link). Sans session
-- Supabase côté portail, on y stocke désormais l'EMAIL du membre qui a traité le
-- signalement. On retire donc la FK vers auth.users et on passe la colonne en text.
alter table public.course_reports drop constraint if exists course_reports_resolved_by_fkey;
alter table public.course_reports alter column resolved_by type text using resolved_by::text;

-- NB : les policies RLS de course_reports (0031, basées sur auth.jwt() -> email)
-- deviennent inertes — il n'y a plus de JWT Supabase côté portail. Toutes les
-- lectures/écritures portail passent par le service-role (serviceClient, bypass
-- RLS). RLS reste donc en deny-by-default pour anon/auth : defense-in-depth.
