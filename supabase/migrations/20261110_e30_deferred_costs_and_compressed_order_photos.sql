alter table public.ordenes
  add column if not exists costo_repuesto numeric(12,2) not null default 0,
  add column if not exists costo_mano_obra numeric(12,2) not null default 0,
  add column if not exists costo_otros numeric(12,2) not null default 0,
  add column if not exists costos_cargados boolean not null default false,
  add column if not exists foto_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ordenes-fotos', 'ordenes-fotos', false, 262144, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 262144, allowed_mime_types = array['image/jpeg'];

drop policy if exists "E30 users read own order photos" on storage.objects;
create policy "E30 users read own order photos" on storage.objects
for select to authenticated
using (bucket_id = 'ordenes-fotos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "E30 users upload own order photos" on storage.objects;
create policy "E30 users upload own order photos" on storage.objects
for insert to authenticated
with check (bucket_id = 'ordenes-fotos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "E30 users update own order photos" on storage.objects;
create policy "E30 users update own order photos" on storage.objects
for update to authenticated
using (bucket_id = 'ordenes-fotos' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'ordenes-fotos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "E30 users delete own order photos" on storage.objects;
create policy "E30 users delete own order photos" on storage.objects
for delete to authenticated
using (bucket_id = 'ordenes-fotos' and (storage.foldername(name))[1] = auth.uid()::text);