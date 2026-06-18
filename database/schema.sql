-- =============================================================================
-- Brandy Renon Real Estate Portal — Full Database Schema
-- Run in the Supabase SQL editor to set up all tables, functions, and RLS.
-- =============================================================================

-- -------------------------------------------------------------------------
-- Helper: is_admin()
-- Returns true when the calling user has role = 'admin' in profiles.
-- SECURITY DEFINER lets it read the profiles table even under strict RLS.
-- -------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

-- -------------------------------------------------------------------------
-- profiles
-- Mirrors auth.users; role decides which dashboard the user sees.
-- -------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  role        text not null default 'client' check (role in ('admin','client')),
  phone       text,
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Admins see everyone; clients see only themselves.
create policy "profiles_select" on public.profiles
  for select using (
    auth.uid() = id or public.is_admin()
  );

-- Each user may update their own profile; admins may update any.
create policy "profiles_update" on public.profiles
  for update using (
    auth.uid() = id or public.is_admin()
  );

-- Only admins may insert profiles directly (normal sign-up uses the trigger below).
create policy "profiles_insert" on public.profiles
  for insert with check (public.is_admin());

-- Only admins may delete profiles.
create policy "profiles_delete" on public.profiles
  for delete using (public.is_admin());

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'client')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -------------------------------------------------------------------------
-- properties
-- -------------------------------------------------------------------------
create table if not exists public.properties (
  id               uuid primary key default gen_random_uuid(),
  property_address text not null,
  property_status  text not null default 'Active'
                     check (property_status in ('Active','Pending','Sold','Coming Soon')),
  purchase_price   numeric(14,2),
  sale_price       numeric(14,2),
  notes            text,
  created_at       timestamptz not null default now()
);

alter table public.properties enable row level security;

-- Admins have full access.
create policy "properties_admin_all" on public.properties
  for all using (public.is_admin());

-- Clients may see properties linked to their transactions.
create policy "properties_client_select" on public.properties
  for select using (
    exists (
      select 1 from public.transactions t
      where t.property_id = properties.id
        and t.client_id   = auth.uid()
    )
  );

-- -------------------------------------------------------------------------
-- transactions
-- -------------------------------------------------------------------------
create table if not exists public.transactions (
  id               uuid primary key default gen_random_uuid(),
  property_id      uuid references public.properties (id) on delete set null,
  client_id        uuid references public.profiles (id) on delete set null,
  transaction_type text not null default 'purchase'
                     check (transaction_type in ('purchase','sale','flip','rental')),
  status           text not null default 'Pending'
                     check (status in ('Active','Pending','Closed','Cancelled')),
  notes            text,
  created_at       timestamptz not null default now()
);

alter table public.transactions enable row level security;

create policy "transactions_admin_all" on public.transactions
  for all using (public.is_admin());

create policy "transactions_client_select" on public.transactions
  for select using (client_id = auth.uid());

-- -------------------------------------------------------------------------
-- documents
-- -------------------------------------------------------------------------
create table if not exists public.documents (
  id                  uuid primary key default gen_random_uuid(),
  property_id         uuid references public.properties (id) on delete set null,
  client_id           uuid references public.profiles (id) on delete set null,
  uploaded_by         uuid references public.profiles (id) on delete set null,
  file_name           text not null,
  file_path           text not null,
  bucket_name         text not null default 'property-documents',
  file_type           text,
  file_size           bigint,
  category            text,
  visibility          text not null default 'admin_only'
                        check (visibility in ('admin_only','client_visible','client_downloadable')),
  requires_signature  boolean not null default false,
  signed              boolean not null default false,
  signed_at           timestamptz,
  signed_by           uuid references public.profiles (id) on delete set null,
  hidden              boolean not null default false,
  notes               text,
  created_at          timestamptz not null default now()
);

alter table public.documents enable row level security;

create policy "documents_admin_all" on public.documents
  for all using (public.is_admin());

-- Clients may view documents assigned to them that are not admin-only.
create policy "documents_client_select" on public.documents
  for select using (
    client_id = auth.uid()
    and visibility in ('client_visible','client_downloadable')
    and hidden = false
  );

-- Clients may upload documents assigned to themselves.
create policy "documents_client_insert" on public.documents
  for insert with check (
    client_id = auth.uid()
    and uploaded_by = auth.uid()
  );

-- Clients may sign their own documents.
create policy "documents_client_sign" on public.documents
  for update using (
    client_id = auth.uid()
    and visibility in ('client_visible','client_downloadable')
  )
  with check (
    client_id = auth.uid()
  );

-- -------------------------------------------------------------------------
-- document_permissions  (per-client overrides)
-- -------------------------------------------------------------------------
create table if not exists public.document_permissions (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references public.documents (id) on delete cascade,
  client_id    uuid not null references public.profiles (id) on delete cascade,
  can_view     boolean not null default true,
  can_download boolean not null default false,
  can_upload   boolean not null default false,
  unique (document_id, client_id)
);

alter table public.document_permissions enable row level security;

create policy "doc_perms_admin_all" on public.document_permissions
  for all using (public.is_admin());

create policy "doc_perms_client_select" on public.document_permissions
  for select using (client_id = auth.uid());

-- -------------------------------------------------------------------------
-- house_flip_inquiries  (public — no auth required to insert)
-- -------------------------------------------------------------------------
create table if not exists public.house_flip_inquiries (
  id                  uuid primary key default gen_random_uuid(),
  full_name           text not null,
  email               text not null,
  phone               text,
  property_address    text,
  estimated_value     text,
  property_condition  text,
  project_description text,
  created_at          timestamptz not null default now()
);

alter table public.house_flip_inquiries enable row level security;

create policy "flip_insert_public" on public.house_flip_inquiries
  for insert with check (true);

create policy "flip_admin_all" on public.house_flip_inquiries
  for all using (public.is_admin());

-- -------------------------------------------------------------------------
-- contractor_inquiries  (public — no auth required to insert)
-- -------------------------------------------------------------------------
create table if not exists public.contractor_inquiries (
  id                  uuid primary key default gen_random_uuid(),
  full_name           text not null,
  company_name        text,
  email               text not null,
  phone               text,
  service_type        text,
  service_area        text,
  project_description text,
  created_at          timestamptz not null default now()
);

alter table public.contractor_inquiries enable row level security;

create policy "contractor_insert_public" on public.contractor_inquiries
  for insert with check (true);

create policy "contractor_admin_all" on public.contractor_inquiries
  for all using (public.is_admin());

-- -------------------------------------------------------------------------
-- Storage bucket setup instructions
--
-- Create these two buckets in the Supabase console (Storage > New bucket),
-- then uncomment and run the policy statements below.
--
-- Bucket: property-documents  (private)
-- Bucket: property-images     (public)
-- -------------------------------------------------------------------------

-- insert into storage.buckets (id, name, public) values ('property-documents', 'property-documents', false) on conflict do nothing;
-- insert into storage.buckets (id, name, public) values ('property-images', 'property-images', true) on conflict do nothing;

-- -- property-documents: clients can read files in their own folder (auth.uid as first path segment)
-- create policy "doc_storage_client_select" on storage.objects
--   for select using (
--     bucket_id = 'property-documents'
--     and auth.uid()::text = (string_to_array(name, '/'))[1]
--   );

-- -- property-documents: clients can upload to their own folder
-- create policy "doc_storage_client_insert" on storage.objects
--   for insert with check (
--     bucket_id = 'property-documents'
--     and auth.uid()::text = (string_to_array(name, '/'))[1]
--   );

-- -- property-documents: admins have full access
-- create policy "doc_storage_admin_all" on storage.objects
--   for all using (
--     bucket_id = 'property-documents'
--     and public.is_admin()
--   );

-- -- property-images: anyone can read
-- create policy "img_storage_public_select" on storage.objects
--   for select using (bucket_id = 'property-images');

-- -- property-images: only admins can write
-- create policy "img_storage_admin_write" on storage.objects
--   for insert with check (
--     bucket_id = 'property-images'
--     and public.is_admin()
--   );
