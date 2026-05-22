-- 0019 — tasks.status: passage de la todo /ops à un kanban 3 colonnes
--
-- La table `tasks` (0001) avait un bool `done`. On ajoute un enum 3 états
-- (`todo` | `doing` | `done`) pour matérialiser l'étape "En cours". Le bool
-- `done` reste synchronisé via l'API le temps qu'on s'assure que plus rien
-- ne le lit ailleurs ; il sera droppé dans une migration future.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'task_status') then
    create type public.task_status as enum ('todo', 'doing', 'done');
  end if;
end$$;

alter table public.tasks
  add column if not exists status public.task_status not null default 'todo';

-- Backfill depuis le bool existant. Idempotent : on ne touche que les lignes
-- où status est resté au défaut 'todo' alors que done=true.
update public.tasks
set status = 'done'
where done = true and status = 'todo';

create index if not exists tasks_status_idx on public.tasks(status, due_date);

-- RLS déjà active sur tasks (cf 0001). Service role uniquement, rien à ajouter.
