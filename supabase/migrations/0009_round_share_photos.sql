-- PR: Carte personnalisée avec photo.
--
-- Ajoute une colonne share_photo_url sur rounds (URL Supabase Storage)
-- et crée le bucket round-share-photos.
-- Public read (la page recap est publique).
-- Écriture anon autorisée pour MVP (à durcir lors de la passe sécu pre-launch).

alter table rounds
  add column if not exists share_photo_url text;

insert into storage.buckets (id, name, public, file_size_limit)
values ('round-share-photos', 'round-share-photos', true, 5242880)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

drop policy if exists "round-share-photos read public" on storage.objects;
create policy "round-share-photos read public"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'round-share-photos');

drop policy if exists "round-share-photos write anon" on storage.objects;
create policy "round-share-photos write anon"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'round-share-photos');

drop policy if exists "round-share-photos update anon" on storage.objects;
create policy "round-share-photos update anon"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'round-share-photos')
  with check (bucket_id = 'round-share-photos');
