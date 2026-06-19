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
-- contact_requests  (public — no auth required to insert)
-- -------------------------------------------------------------------------
create table if not exists public.contact_requests (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  email             text not null,
  phone             text,
  inquiry_type      text not null default 'general_inquiry'
                      check (inquiry_type in ('general_question','general_inquiry','property_inquiry','showing_request','renovation_client_inquiry','rental_help','buyer_agent_request','renovation_help','maintenance_request','seller_help')),
  property_interest text,
  message           text not null,
  admin_status      text not null default 'not_viewed'
                      check (admin_status in ('not_viewed','in_progress','complete')),
  admin_notes       text,
  created_at        timestamptz not null default now()
);

alter table public.contact_requests enable row level security;

create policy "contact_requests_insert_public" on public.contact_requests
  for insert with check (true);

create policy "contact_requests_admin_all" on public.contact_requests
  for all using (public.is_admin());

-- Backwards-compatible additions for databases created before these fields existed.
alter table public.contact_requests add column if not exists inquiry_type text;
alter table public.contact_requests add column if not exists property_interest text;
alter table public.contact_requests add column if not exists admin_status text default 'not_viewed';
alter table public.contact_requests add column if not exists admin_notes text;
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'contact_requests_inquiry_type_check'
  ) then
    alter table public.contact_requests
      add constraint contact_requests_inquiry_type_check
      check (inquiry_type in ('general_question','general_inquiry','property_inquiry','showing_request','renovation_client_inquiry','rental_help','buyer_agent_request','renovation_help','maintenance_request','seller_help'));
  end if;
end
$$;
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'contact_requests_admin_status_check'
  ) then
    alter table public.contact_requests
      add constraint contact_requests_admin_status_check
      check (admin_status in ('not_viewed','in_progress','complete'));
  end if;
end
$$;
update public.contact_requests
set inquiry_type = 'general_inquiry'
where inquiry_type is null or btrim(inquiry_type) = '';
update public.contact_requests
set admin_status = 'not_viewed'
where admin_status is null or btrim(admin_status) = '';
alter table public.contact_requests alter column admin_status set default 'not_viewed';
alter table public.contact_requests alter column admin_status set not null;

-- -------------------------------------------------------------------------
-- showing_requests  (public — no auth required to insert)
-- -------------------------------------------------------------------------
create table if not exists public.showing_requests (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  email            text not null,
  phone            text,
  property_address text,
  preferred_date   text,
  preferred_time   text,
  message          text not null,
  admin_status     text not null default 'not_viewed'
                     check (admin_status in ('not_viewed','in_progress','complete')),
  admin_notes      text,
  created_at       timestamptz not null default now()
);

alter table public.showing_requests enable row level security;

create policy "showing_requests_insert_public" on public.showing_requests
  for insert with check (true);

create policy "showing_requests_admin_all" on public.showing_requests
  for all using (public.is_admin());

-- Backwards-compatible additions for databases created before these fields existed.
alter table public.showing_requests add column if not exists admin_status text default 'not_viewed';
alter table public.showing_requests add column if not exists admin_notes text;
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'showing_requests_admin_status_check'
  ) then
    alter table public.showing_requests
      add constraint showing_requests_admin_status_check
      check (admin_status in ('not_viewed','in_progress','complete'));
  end if;
end
$$;
update public.showing_requests
set admin_status = 'not_viewed'
where admin_status is null or btrim(admin_status) = '';
alter table public.showing_requests alter column admin_status set default 'not_viewed';
alter table public.showing_requests alter column admin_status set not null;

-- -------------------------------------------------------------------------
-- renovation_clients  (public — no auth required to insert)
-- -------------------------------------------------------------------------
create table if not exists public.renovation_clients (
  id                  uuid primary key default gen_random_uuid(),
  full_name           text not null,
  email               text not null,
  phone               text,
  property_address    text,
  service_needed      text,
  project_type        text,
  project_description text,
  timeline            text,
  budget_range        text,
  status              text not null default 'not_viewed'
                        check (status in ('not_viewed','in_progress','complete')),
  created_at          timestamptz not null default now()
);

alter table public.renovation_clients enable row level security;

create policy "renovation_clients_insert_public" on public.renovation_clients
  for insert with check (true);

create policy "renovation_clients_admin_all" on public.renovation_clients
  for all using (public.is_admin());

-- Backwards-compatible additions for databases created before these fields existed.
alter table public.renovation_clients add column if not exists status text default 'not_viewed';
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'renovation_clients_status_check'
  ) then
    alter table public.renovation_clients
      add constraint renovation_clients_status_check
      check (status in ('not_viewed','in_progress','complete'));
  end if;
end
$$;
update public.renovation_clients
set status = 'not_viewed'
where status is null or btrim(status) = '';
alter table public.renovation_clients alter column status set default 'not_viewed';
alter table public.renovation_clients alter column status set not null;

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

-- -- property-documents: clients can read files in their own folder.
-- -- Covers two path structures:
-- --   {client_id}/{uuid}-{file}            ← client self-uploads
-- --   admin/users/{client_id}/{uuid}-{file} ← admin uploads to a client
-- create policy "doc_storage_client_select" on storage.objects
--   for select using (
--     bucket_id = 'property-documents'
--     and (
--       auth.uid()::text = (string_to_array(name, '/'))[1]
--       or (
--         (string_to_array(name, '/'))[1] = 'admin'
--         and (string_to_array(name, '/'))[2] = 'users'
--         and auth.uid()::text = (string_to_array(name, '/'))[3]
--       )
--     )
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

-- -------------------------------------------------------------------------
-- Performance indexes
-- -------------------------------------------------------------------------
create index if not exists idx_transactions_client_id    on public.transactions (client_id);
create index if not exists idx_transactions_property_id  on public.transactions (property_id);
create index if not exists idx_documents_client_id       on public.documents (client_id);
create index if not exists idx_documents_property_id     on public.documents (property_id);
create index if not exists idx_profiles_role             on public.profiles (role);

-- -------------------------------------------------------------------------
-- 2026 portal enhancements
-- -------------------------------------------------------------------------

alter table public.profiles add column if not exists status text;
update public.profiles
set status = 'active'
where status is null or btrim(status) = '';
alter table public.profiles alter column status set default 'active';
alter table public.profiles alter column status set not null;
alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles
  add constraint profiles_status_check
  check (status in ('active', 'inactive'));

create or replace function public.get_admin_user_profiles()
returns table (
  id uuid,
  email text,
  full_name text,
  phone text,
  role text,
  status text,
  created_at timestamptz,
  last_login_at timestamptz
)
language sql
security definer
set search_path = public, auth
as $$
  select p.id, p.email, p.full_name, p.phone, p.role, p.status, p.created_at, u.last_sign_in_at
  from public.profiles p
  left join auth.users u on u.id = p.id
  where public.is_admin()
  order by p.created_at desc;
$$;

grant execute on function public.get_admin_user_profiles() to authenticated;

create table if not exists public.client_property_assignments (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.profiles (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (client_id, property_id)
);

alter table public.client_property_assignments enable row level security;
drop policy if exists "client_property_assignments_admin_all" on public.client_property_assignments;
create policy "client_property_assignments_admin_all" on public.client_property_assignments
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "client_property_assignments_client_select" on public.client_property_assignments;
create policy "client_property_assignments_client_select" on public.client_property_assignments
  for select using (client_id = auth.uid());
drop policy if exists "properties_client_select_assigned" on public.properties;
create policy "properties_client_select_assigned" on public.properties
  for select using (
    exists (
      select 1
      from public.client_property_assignments cpa
      where cpa.property_id = properties.id
        and cpa.client_id = auth.uid()
    )
  );

alter table public.documents add column if not exists can_client_view boolean;
alter table public.documents add column if not exists can_client_edit boolean;
update public.documents
set can_client_view = case when visibility in ('client_visible', 'client_downloadable') then true else false end
where can_client_view is null;
update public.documents
set can_client_edit = case when uploaded_by = client_id or requires_signature then true else false end
where can_client_edit is null;
alter table public.documents alter column can_client_view set default false;
alter table public.documents alter column can_client_view set not null;
alter table public.documents alter column can_client_edit set default false;
alter table public.documents alter column can_client_edit set not null;
drop policy if exists "documents_client_select" on public.documents;
create policy "documents_client_select" on public.documents
  for select using (
    client_id = auth.uid()
    and can_client_view = true
    and hidden = false
  );
drop policy if exists "documents_client_insert" on public.documents;
create policy "documents_client_insert" on public.documents
  for insert with check (
    client_id = auth.uid()
    and uploaded_by = auth.uid()
    and can_client_view = true
    and can_client_edit = true
  );
drop policy if exists "documents_client_sign" on public.documents;

create or replace function public.client_acknowledge_document(target_document_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update public.documents
  set signed = true,
      signed_at = now(),
      signed_by = auth.uid()
  where id = target_document_id
    and client_id = auth.uid()
    and can_client_view = true
    and can_client_edit = true
    and hidden = false
    and requires_signature = true
    and signed = false;

  if not found then
    raise exception 'Document is not available for acknowledgement';
  end if;
end;
$$;

grant execute on function public.client_acknowledge_document(uuid) to authenticated;

alter table public.contact_requests alter column inquiry_type set default 'general_question';
update public.contact_requests
set inquiry_type = 'general_question'
where inquiry_type is null or btrim(inquiry_type) = '';
update public.contact_requests
set inquiry_type = 'renovation_client_inquiry'
where inquiry_type in ('contractor_inquiry', 'house_flip_inquiry');
alter table public.contact_requests drop constraint if exists contact_requests_inquiry_type_check;
alter table public.contact_requests
  add constraint contact_requests_inquiry_type_check
  check (inquiry_type in ('general_question', 'general_inquiry', 'property_inquiry', 'showing_request', 'renovation_client_inquiry', 'rental_help', 'buyer_agent_request', 'renovation_help', 'maintenance_request', 'seller_help'));

alter table public.showing_requests add column if not exists request_type text;
update public.showing_requests
set request_type = 'showing_request'
where request_type is null or btrim(request_type) = '';
alter table public.showing_requests alter column request_type set default 'showing_request';
alter table public.showing_requests alter column request_type set not null;
alter table public.showing_requests drop constraint if exists showing_requests_request_type_check;
alter table public.showing_requests
  add constraint showing_requests_request_type_check
  check (request_type in ('showing_request', 'property_inquiry'));

create index if not exists idx_profiles_status on public.profiles (status);
create index if not exists idx_client_property_assignments_client_id on public.client_property_assignments (client_id);
create index if not exists idx_client_property_assignments_property_id on public.client_property_assignments (property_id);

-- -------------------------------------------------------------------------
-- Portal architecture updates: accounts, maintenance, property visibility
-- -------------------------------------------------------------------------

alter table public.properties add column if not exists visibility text;
alter table public.properties add column if not exists is_public boolean;
alter table public.properties add column if not exists updated_at timestamptz;
update public.properties
set visibility = case when coalesce(is_public, false) then 'public' else 'internal' end
where visibility is null or btrim(visibility) = '';
update public.properties
set is_public = (visibility = 'public')
where is_public is null;
update public.properties
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;
alter table public.properties alter column visibility set default 'internal';
alter table public.properties alter column visibility set not null;
alter table public.properties alter column is_public set default false;
alter table public.properties alter column is_public set not null;
alter table public.properties alter column updated_at set default now();
alter table public.properties alter column updated_at set not null;
alter table public.properties drop constraint if exists properties_visibility_check;
alter table public.properties
  add constraint properties_visibility_check
  check (visibility in ('public', 'internal'));
drop policy if exists "properties_public_select" on public.properties;
create policy "properties_public_select" on public.properties
  for select using (is_public = true);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  account_name text not null,
  property_id uuid references public.properties (id) on delete set null,
  account_type text not null default 'Other',
  status text not null default 'Not Reviewed Yet',
  transaction_details text,
  internal_notes text,
  client_notes text,
  required_tasks text,
  client_upload_enabled boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (account_type in ('Buyer','Seller','Rental','Lease','Property Management','Renovation','Other')),
  check (status in ('Not Reviewed Yet','In Progress','Active','Pending Signature','Completed','Archived'))
);
alter table public.accounts enable row level security;
drop policy if exists "accounts_admin_all" on public.accounts;
create policy "accounts_admin_all" on public.accounts
  for all using (public.is_admin()) with check (public.is_admin());

create table if not exists public.account_clients (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (account_id, client_id)
);
alter table public.account_clients enable row level security;
drop policy if exists "account_clients_admin_all" on public.account_clients;
create policy "account_clients_admin_all" on public.account_clients
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "account_clients_client_select" on public.account_clients;
create policy "account_clients_client_select" on public.account_clients
  for select using (client_id = auth.uid());
drop policy if exists "accounts_client_select" on public.accounts;
create policy "accounts_client_select" on public.accounts
  for select using (
    exists (
      select 1 from public.account_clients ac
      where ac.account_id = accounts.id
        and ac.client_id = auth.uid()
    )
  );
drop policy if exists "properties_client_select_assigned" on public.properties;
create policy "properties_client_select_assigned" on public.properties
  for select using (
    exists (
      select 1
      from public.client_property_assignments cpa
      where cpa.property_id = properties.id
        and cpa.client_id = auth.uid()
    )
    or exists (
      select 1
      from public.accounts a
      join public.account_clients ac on ac.account_id = a.id
      where a.property_id = properties.id
        and ac.client_id = auth.uid()
    )
  );

alter table public.documents add column if not exists account_id uuid references public.accounts (id) on delete set null;
alter table public.documents add column if not exists signature_provider text;
alter table public.documents add column if not exists signature_url text;
alter table public.documents add column if not exists signature_status text;
alter table public.documents add column if not exists updated_at timestamptz;
alter table public.documents add column if not exists completed_at timestamptz;
update public.documents
set signature_status = case
  when coalesce(signed, false) then 'signed'
  when coalesce(requires_signature, false) then 'pending_signature'
  else 'available'
end
where signature_status is null or btrim(signature_status) = '';
update public.documents
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;
alter table public.documents alter column signature_status set default 'available';
alter table public.documents alter column signature_status set not null;
alter table public.documents alter column updated_at set default now();
alter table public.documents alter column updated_at set not null;
alter table public.documents drop constraint if exists documents_signature_provider_check;
alter table public.documents
  add constraint documents_signature_provider_check
  check (signature_provider is null or signature_provider in ('DocuSign','Dropbox Sign','Adobe Acrobat Sign','Manual Upload'));
alter table public.documents drop constraint if exists documents_signature_status_check;
alter table public.documents
  add constraint documents_signature_status_check
  check (signature_status in ('available','pending_signature','signed','uploaded'));

drop policy if exists "documents_client_select" on public.documents;
create policy "documents_client_select" on public.documents
  for select using (
    client_id = auth.uid()
    and can_client_view = true
    and hidden = false
  );
drop policy if exists "documents_client_insert" on public.documents;
create policy "documents_client_insert" on public.documents
  for insert with check (
    client_id = auth.uid()
    and uploaded_by = auth.uid()
    and can_client_view = true
    and (
      can_client_edit = true
      or exists (
        select 1 from public.accounts a
        join public.account_clients ac on ac.account_id = a.id
        where a.id = documents.account_id
          and a.client_upload_enabled = true
          and ac.client_id = auth.uid()
      )
    )
  );

create table if not exists public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  property_id uuid references public.properties (id) on delete set null,
  account_id uuid references public.accounts (id) on delete set null,
  title text not null,
  description text not null,
  priority text not null default 'Medium',
  status text not null default 'Not Reviewed Yet',
  admin_comments text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (priority in ('Low','Medium','High','Emergency')),
  check (status in ('Not Reviewed Yet','In Progress','Completed'))
);
alter table public.maintenance_requests enable row level security;
drop policy if exists "maintenance_requests_admin_all" on public.maintenance_requests;
create policy "maintenance_requests_admin_all" on public.maintenance_requests
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "maintenance_requests_client_select" on public.maintenance_requests;
create policy "maintenance_requests_client_select" on public.maintenance_requests
  for select using (client_id = auth.uid());
drop policy if exists "maintenance_requests_client_insert" on public.maintenance_requests;
create policy "maintenance_requests_client_insert" on public.maintenance_requests
  for insert with check (client_id = auth.uid());

create table if not exists public.maintenance_files (
  id uuid primary key default gen_random_uuid(),
  maintenance_request_id uuid not null references public.maintenance_requests (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  account_id uuid references public.accounts (id) on delete set null,
  property_id uuid references public.properties (id) on delete set null,
  file_name text not null,
  file_path text not null,
  bucket_name text not null default 'maintenance-files',
  file_type text,
  file_size bigint,
  category text,
  created_at timestamptz not null default now()
);
alter table public.maintenance_files enable row level security;
drop policy if exists "maintenance_files_admin_all" on public.maintenance_files;
create policy "maintenance_files_admin_all" on public.maintenance_files
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "maintenance_files_client_select" on public.maintenance_files;
create policy "maintenance_files_client_select" on public.maintenance_files
  for select using (client_id = auth.uid());
drop policy if exists "maintenance_files_client_insert" on public.maintenance_files;
create policy "maintenance_files_client_insert" on public.maintenance_files
  for insert with check (
    exists (
      select 1 from public.maintenance_requests mr
      where mr.id = maintenance_files.maintenance_request_id
        and mr.client_id = auth.uid()
    )
  );

alter table public.contact_requests alter column admin_status drop default;
update public.contact_requests
set admin_status = case
  when admin_status in ('not_viewed', 'Not Viewed Yet') then 'Not Reviewed Yet'
  when admin_status in ('in_progress', 'In Progress') then 'In Progress'
  when admin_status in ('complete', 'Completed', 'Complete') then 'Completed'
  else coalesce(nullif(admin_status, ''), 'Not Reviewed Yet')
end;
alter table public.contact_requests alter column admin_status set default 'Not Reviewed Yet';
alter table public.contact_requests drop constraint if exists contact_requests_admin_status_check;
alter table public.contact_requests
  add constraint contact_requests_admin_status_check
  check (admin_status in ('Not Reviewed Yet','In Progress','Completed'));
alter table public.contact_requests add column if not exists completed_at timestamptz;
alter table public.contact_requests add column if not exists updated_at timestamptz;
update public.contact_requests set updated_at = coalesce(updated_at, created_at, now()) where updated_at is null;

alter table public.showing_requests alter column admin_status drop default;
update public.showing_requests
set admin_status = case
  when admin_status in ('not_viewed', 'Not Viewed Yet') then 'Not Reviewed Yet'
  when admin_status in ('in_progress', 'In Progress') then 'In Progress'
  when admin_status in ('complete', 'Completed', 'Complete') then 'Completed'
  else coalesce(nullif(admin_status, ''), 'Not Reviewed Yet')
end;
alter table public.showing_requests alter column admin_status set default 'Not Reviewed Yet';
alter table public.showing_requests drop constraint if exists showing_requests_admin_status_check;
alter table public.showing_requests
  add constraint showing_requests_admin_status_check
  check (admin_status in ('Not Reviewed Yet','In Progress','Completed'));
alter table public.showing_requests add column if not exists completed_at timestamptz;
alter table public.showing_requests add column if not exists updated_at timestamptz;
update public.showing_requests set updated_at = coalesce(updated_at, created_at, now()) where updated_at is null;

alter table public.renovation_clients add column if not exists admin_notes text;
alter table public.renovation_clients add column if not exists completed_at timestamptz;
alter table public.renovation_clients add column if not exists updated_at timestamptz;
update public.renovation_clients
set status = case
  when status in ('not_viewed', 'Not Viewed Yet') then 'Not Reviewed Yet'
  when status in ('in_progress', 'In Progress') then 'In Progress'
  when status in ('complete', 'Completed', 'Complete') then 'Completed'
  else coalesce(nullif(status, ''), 'Not Reviewed Yet')
end;
update public.renovation_clients set updated_at = coalesce(updated_at, created_at, now()) where updated_at is null;
alter table public.renovation_clients alter column status set default 'Not Reviewed Yet';
alter table public.renovation_clients drop constraint if exists renovation_clients_status_check;
alter table public.renovation_clients
  add constraint renovation_clients_status_check
  check (status in ('Not Reviewed Yet','In Progress','Completed'));

create index if not exists idx_accounts_property_id on public.accounts (property_id);
create index if not exists idx_account_clients_client_id on public.account_clients (client_id);
create index if not exists idx_documents_account_id on public.documents (account_id);
create index if not exists idx_maintenance_requests_client_id on public.maintenance_requests (client_id);
create index if not exists idx_maintenance_files_request_id on public.maintenance_files (maintenance_request_id);
