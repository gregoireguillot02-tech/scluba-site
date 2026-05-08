-- PR C: Supabase Storage bucket for club-uploaded assets (logos, photos).
--
-- Public read so /c/[slug] can render <img src="..."> directly without auth.
-- Writes (upload, replace, delete) go through the service role on
-- /api/ops/clubs/[id]/upload and bypass RLS.

insert into storage.buckets (id, name, public)
values ('club-assets', 'club-assets', true)
on conflict (id) do nothing;

-- Public can read any object in club-assets.
drop policy if exists "club-assets read public" on storage.objects;
create policy "club-assets read public"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'club-assets');
