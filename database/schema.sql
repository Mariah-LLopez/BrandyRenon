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
  user_type   text not null default 'Other' check (user_type in ('Buyer','Seller','Renter','Rental Owner','Renovation Client','Other')),
  status      text not null default 'active' check (status in ('active','inactive')),
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
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
  insert into public.profiles (id, email, full_name, role, user_type, updated_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'client'),
    case
      when coalesce(new.raw_user_meta_data->>'user_type', 'Other') in ('Property Owner', 'Owner', 'Property Management Client')
        then 'Rental Owner'
      else coalesce(new.raw_user_meta_data->>'user_type', 'Other')
    end,
    now()
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
  bucket_name         text not null default 'client-documents',
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
-- Buckets: property-images (public), client-documents (private),
--          maintenance-files (private), account-files (private)
-- -------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values
  ('property-images', 'property-images', true),
  ('client-documents', 'client-documents', false),
  ('maintenance-files', 'maintenance-files', false),
  ('account-files', 'account-files', false)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public;

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
set
  visibility = case
    when visibility is not null and btrim(visibility) <> '' then visibility
    when coalesce(is_public, false) then 'public'
    else 'internal'
  end,
  is_public = case
    when visibility is not null and btrim(visibility) <> '' then visibility = 'public'
    else coalesce(is_public, false)
  end
where
  visibility is null
  or btrim(visibility) = ''
  or is_public is null
  or is_public <> case
    when visibility is not null and btrim(visibility) <> '' then visibility = 'public'
    else coalesce(is_public, false)
  end;
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
  priority text not null default 'Medium',
  transaction_details text,
  internal_notes text,
  client_notes text,
  required_tasks text,
  client_upload_enabled boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (account_type in ('Buyer Account','Seller Account','Rental Account','Rental Owner Account','Renovation Account','Property Management Account','Other')),
  check (priority in ('Low','Medium','High')),
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
alter table public.documents alter column bucket_name set default 'client-documents';
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
  check (priority in ('Low','Medium','High')),
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
  uploaded_by uuid references public.profiles (id) on delete set null,
  file_name text not null,
  file_path text not null,
  bucket_name text not null default 'maintenance-files',
  file_type text,
  file_size bigint,
  category text,
  created_at timestamptz not null default now()
);
alter table public.maintenance_files add column if not exists uploaded_by uuid references public.profiles (id) on delete set null;
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

-- -------------------------------------------------------------------------
-- Task system, messages, document requests, signature requests, task files
-- See database/portal-task-updates.sql for the incremental migration that
-- adds these tables to an existing database.
-- -------------------------------------------------------------------------

-- Extend profiles.role
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'client', 'renter', 'buyer', 'seller'));

-- Extend accounts
alter table public.accounts add column if not exists user_id uuid references public.profiles (id) on delete set null;
alter table public.accounts drop constraint if exists accounts_account_type_check;
alter table public.accounts
  add constraint accounts_account_type_check
  check (account_type in (
    'Buyer Account',
    'Seller Account',
    'Rental Account',
    'Rental Owner Account',
    'Renovation Account',
    'Property Management Account',
    'Other'
  ));

-- Extend maintenance_requests
alter table public.maintenance_requests add column if not exists category text;
alter table public.maintenance_requests drop constraint if exists maintenance_requests_status_check;
alter table public.maintenance_requests
  add constraint maintenance_requests_status_check
  check (status in ('Not Reviewed Yet','In Progress','Completed'));

-- tasks
create table if not exists public.tasks (
  id                 uuid primary key default gen_random_uuid(),
  account_id         uuid references public.accounts (id) on delete set null,
  user_id            uuid references public.profiles (id) on delete set null,
  property_id        uuid references public.properties (id) on delete set null,
  task_type          text not null default 'General Message'
                       check (task_type in (
                         'Maintenance Request',
                         'Property Inquiry',
                         'Showing Request',
                         'Document Upload',
                         'Signature Request',
                         'Seller Task',
                         'Buyer Task',
                         'Admin Follow-Up',
                         'General Message'
                       )),
  title              text not null,
  description        text,
  status             text not null default 'Not Reviewed'
                       check (status in (
                         'Not Reviewed',
                         'In Progress',
                         'Waiting on User',
                         'Waiting on Admin',
                         'Completed',
                         'Archived'
                       )),
  priority           text not null default 'Medium'
                       check (priority in ('Low','Medium','High','Urgent')),
  assigned_admin_id  uuid references public.profiles (id) on delete set null,
  due_date           date,
  user_visible_notes text,
  internal_notes     text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  completed_at       timestamptz
);
alter table public.tasks enable row level security;
drop policy if exists "tasks_admin_all" on public.tasks;
create policy "tasks_admin_all" on public.tasks
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "tasks_client_select" on public.tasks;
create policy "tasks_client_select" on public.tasks
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.account_clients ac
      where ac.account_id = tasks.account_id
        and ac.client_id = auth.uid()
    )
  );

-- messages
create table if not exists public.messages (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid references public.accounts (id) on delete set null,
  user_id      uuid references public.profiles (id) on delete set null,
  property_id  uuid references public.properties (id) on delete set null,
  message_type text not null default 'General Message'
                 check (message_type in (
                   'General Message',
                   'Property Inquiry',
                   'Showing Request',
                   'Maintenance Follow-Up',
                   'Document Question',
                   'Lease Question',
                   'Offer Question',
                   'Other'
                 )),
  subject      text,
  message_body text not null,
  status       text not null default 'Not Reviewed'
                 check (status in ('Not Reviewed','In Progress','Replied','Closed')),
  admin_notes  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.messages enable row level security;
drop policy if exists "messages_admin_all" on public.messages;
create policy "messages_admin_all" on public.messages
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "messages_client_select" on public.messages;
create policy "messages_client_select" on public.messages
  for select using (user_id = auth.uid());
drop policy if exists "messages_client_insert" on public.messages;
create policy "messages_client_insert" on public.messages
  for insert with check (user_id = auth.uid());

-- document_requests
create table if not exists public.document_requests (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid references public.accounts (id) on delete set null,
  user_id       uuid references public.profiles (id) on delete set null,
  property_id   uuid references public.properties (id) on delete set null,
  document_type text not null,
  status        text not null default 'Requested'
                  check (status in (
                    'Requested',
                    'Submitted',
                    'Under Review',
                    'Approved',
                    'Rejected',
                    'Resubmit Required'
                  )),
  due_date      date,
  admin_notes   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.document_requests enable row level security;
drop policy if exists "document_requests_admin_all" on public.document_requests;
create policy "document_requests_admin_all" on public.document_requests
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "document_requests_client_select" on public.document_requests;
create policy "document_requests_client_select" on public.document_requests
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.account_clients ac
      where ac.account_id = document_requests.account_id
        and ac.client_id = auth.uid()
    )
  );

-- signature_requests
create table if not exists public.signature_requests (
  id                  uuid primary key default gen_random_uuid(),
  account_id          uuid references public.accounts (id) on delete set null,
  user_id             uuid references public.profiles (id) on delete set null,
  property_id         uuid references public.properties (id) on delete set null,
  document_id         uuid references public.documents (id) on delete set null,
  title               text not null,
  provider            text
                        check (provider is null or provider in (
                          'DocuSign','Dropbox Sign','Adobe Acrobat Sign','Manual Upload'
                        )),
  provider_status     text,
  status              text not null default 'Signature Needed'
                        check (status in (
                          'Signature Needed',
                          'Sent for Signature',
                          'Signed',
                          'Declined',
                          'Expired'
                        )),
  signature_url       text,
  signed_document_url text,
  admin_notes         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
alter table public.signature_requests enable row level security;
drop policy if exists "signature_requests_admin_all" on public.signature_requests;
create policy "signature_requests_admin_all" on public.signature_requests
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "signature_requests_client_select" on public.signature_requests;
create policy "signature_requests_client_select" on public.signature_requests
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.account_clients ac
      where ac.account_id = signature_requests.account_id
        and ac.client_id = auth.uid()
    )
  );

-- task_files
create table if not exists public.task_files (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks (id) on delete cascade,
  file_url    text not null,
  file_name   text not null,
  file_type   text,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table public.task_files enable row level security;
drop policy if exists "task_files_admin_all" on public.task_files;
create policy "task_files_admin_all" on public.task_files
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "task_files_client_select" on public.task_files;
create policy "task_files_client_select" on public.task_files
  for select using (
    exists (
      select 1 from public.tasks t
      where t.id = task_files.task_id
        and (
          t.user_id = auth.uid()
          or exists (
            select 1 from public.account_clients ac
            where ac.account_id = t.account_id
              and ac.client_id = auth.uid()
          )
        )
    )
  );
drop policy if exists "task_files_client_insert" on public.task_files;
create policy "task_files_client_insert" on public.task_files
  for insert with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.tasks t
      where t.id = task_files.task_id
        and (
          t.user_id = auth.uid()
          or exists (
            select 1 from public.account_clients ac
            where ac.account_id = t.account_id
              and ac.client_id = auth.uid()
          )
        )
    )
  );

create index if not exists idx_accounts_user_id             on public.accounts (user_id);
create index if not exists idx_tasks_account_id             on public.tasks (account_id);
create index if not exists idx_tasks_user_id                on public.tasks (user_id);
create index if not exists idx_tasks_status                 on public.tasks (status);
create index if not exists idx_tasks_task_type              on public.tasks (task_type);
create index if not exists idx_tasks_assigned_admin         on public.tasks (assigned_admin_id);
create index if not exists idx_messages_account_id          on public.messages (account_id);
create index if not exists idx_messages_user_id             on public.messages (user_id);
create index if not exists idx_messages_status              on public.messages (status);
create index if not exists idx_document_requests_account_id on public.document_requests (account_id);
create index if not exists idx_document_requests_user_id    on public.document_requests (user_id);
create index if not exists idx_signature_requests_account_id on public.signature_requests (account_id);
create index if not exists idx_signature_requests_user_id   on public.signature_requests (user_id);
create index if not exists idx_signature_requests_status    on public.signature_requests (status);
create index if not exists idx_task_files_task_id           on public.task_files (task_id);
