-- 0026 — prospect_actions : plusieurs "prochaines actions" (relances) par prospect
--
-- Remplace le champ unique prospects.next_action_at/note (0023) par une liste :
-- on peut ajouter, modifier, terminer et supprimer des actions datées. La home
-- "À faire" agrège les actions non terminées, triées par date.

create table if not exists public.prospect_actions (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  due_on date not null,
  note text,
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists prospect_actions_due_idx
  on public.prospect_actions(due_on) where done = false;
create index if not exists prospect_actions_prospect_idx
  on public.prospect_actions(prospect_id);

alter table public.prospect_actions enable row level security;
-- service_role uniquement (cf 0001), aucune policy publique.

-- Reprend l'éventuelle prochaine action unique déjà saisie (Phase 1, colonne
-- prospects.next_action_at). Idempotent : ne réinsère pas si déjà migré.
insert into public.prospect_actions (prospect_id, due_on, note)
select p.id, p.next_action_at, p.next_action_note
from public.prospects p
where p.next_action_at is not null
  and not exists (select 1 from public.prospect_actions pa where pa.prospect_id = p.id);
