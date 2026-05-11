-- PR B: enable multi-player rounds with live sync.
--
-- Anon clients need to subscribe to round_players and scores via Supabase
-- Realtime, which uses the public anon key and is therefore subject to RLS.
-- Loosen reads to public for those three tables (the data is anonymous game
-- state — display names + golf strokes, no PII, no tokens). Writes still go
-- through the service role on /api/rounds/* endpoints, so this stays safe.

drop policy if exists "rounds read public" on public.rounds;
create policy "rounds read public"
  on public.rounds for select
  to anon, authenticated
  using (true);

drop policy if exists "round_players read public" on public.round_players;
create policy "round_players read public"
  on public.round_players for select
  to anon, authenticated
  using (true);

drop policy if exists "scores read public" on public.scores;
create policy "scores read public"
  on public.scores for select
  to anon, authenticated
  using (true);

-- Add the tables to the supabase_realtime publication so anon clients
-- receive INSERT/UPDATE/DELETE events on them. (No-op if already added.)
do $$
begin
  begin
    alter publication supabase_realtime add table public.rounds;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.round_players;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.scores;
  exception when duplicate_object then null;
  end;
end $$;

-- Required for UPDATE events to deliver the full new row to subscribers.
alter table public.rounds replica identity full;
alter table public.round_players replica identity full;
alter table public.scores replica identity full;
