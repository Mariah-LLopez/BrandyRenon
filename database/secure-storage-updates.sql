-- Incremental updates for secure Supabase storage buckets and portal file metadata

alter table public.documents alter column bucket_name set default 'client-documents';
alter table public.maintenance_files add column if not exists uploaded_by uuid references public.profiles (id) on delete set null;

insert into storage.buckets (id, name, public)
values
  ('property-images', 'property-images', true),
  ('client-documents', 'client-documents', false),
  ('maintenance-files', 'maintenance-files', false),
  ('account-files', 'account-files', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "storage_admin_all" on storage.objects;
create policy "storage_admin_all" on storage.objects
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "property_images_public_select" on storage.objects;
create policy "property_images_public_select" on storage.objects
  for select using (bucket_id = 'property-images');

drop policy if exists "client_documents_client_select" on storage.objects;
create policy "client_documents_client_select" on storage.objects
  for select using (
    bucket_id = 'client-documents'
    and exists (
      select 1
      from public.documents d
      where d.bucket_name = bucket_id
        and d.file_path = name
        and d.client_id = auth.uid()
        and d.can_client_view = true
        and d.hidden = false
    )
  );

drop policy if exists "account_files_client_select" on storage.objects;
create policy "account_files_client_select" on storage.objects
  for select using (
    bucket_id = 'account-files'
    and exists (
      select 1
      from public.documents d
      where d.bucket_name = bucket_id
        and d.file_path = name
        and d.client_id = auth.uid()
        and d.can_client_view = true
        and d.hidden = false
    )
  );

drop policy if exists "legacy_property_documents_client_select" on storage.objects;
create policy "legacy_property_documents_client_select" on storage.objects
  for select using (
    bucket_id = 'property-documents'
    and exists (
      select 1
      from public.documents d
      where d.bucket_name = bucket_id
        and d.file_path = name
        and d.client_id = auth.uid()
        and d.can_client_view = true
        and d.hidden = false
    )
  );

drop policy if exists "maintenance_files_client_select_storage" on storage.objects;
create policy "maintenance_files_client_select_storage" on storage.objects
  for select using (
    bucket_id = 'maintenance-files'
    and exists (
      select 1
      from public.maintenance_files mf
      where mf.bucket_name = bucket_id
        and mf.file_path = name
        and mf.client_id = auth.uid()
    )
  );

drop policy if exists "client_documents_client_insert_storage" on storage.objects;
create policy "client_documents_client_insert_storage" on storage.objects
  for insert with check (
    bucket_id = 'client-documents'
    and split_part(name, '/', 1) = 'clients'
    and split_part(name, '/', 2) = auth.uid()::text
  );

drop policy if exists "account_files_client_insert_storage" on storage.objects;
create policy "account_files_client_insert_storage" on storage.objects
  for insert with check (
    bucket_id = 'account-files'
    and split_part(name, '/', 1) = 'clients'
    and split_part(name, '/', 2) = auth.uid()::text
  );

drop policy if exists "maintenance_files_client_insert_storage" on storage.objects;
create policy "maintenance_files_client_insert_storage" on storage.objects
  for insert with check (
    bucket_id = 'maintenance-files'
    and split_part(name, '/', 1) = 'clients'
    and split_part(name, '/', 2) = auth.uid()::text
  );
