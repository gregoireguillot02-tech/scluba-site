-- Multiplayer flow: organizer types party member names upfront, which create
-- "placeholder" rows in round_players. Other players scan the QR, pick their
-- name from the list (or add themselves), which "claims" the row.
--
-- claimed_at is the marker:
--   NULL     → placeholder, waiting for a device to claim it
--   not NULL → a device has scanned + selected this name (cookie issued)
--
-- Start gating: the round can only transition to 'playing' when no row in
-- round_players has claimed_at IS NULL.

alter table public.round_players
  add column if not exists claimed_at timestamptz;

-- Backfill: every existing row was created by an act of joining (creator or
-- typed-code join), so they are all claimed at their joined_at timestamp.
update public.round_players
  set claimed_at = joined_at
  where claimed_at is null;

create index if not exists round_players_round_claimed_idx
  on public.round_players(round_id, claimed_at);
