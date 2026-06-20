-- Incremental Supabase update for portal inquiry tracking and contact form fields.
-- Run this on an existing database that already has the base schema installed.

create table if not exists public.contact_requests (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  email             text not null,
  phone             text,
  inquiry_type      text not null default 'general_inquiry',
  property_interest text,
  message           text not null,
  admin_status      text not null default 'not_viewed',
  admin_notes       text,
  created_at        timestamptz not null default now()
);

alter table public.contact_requests enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'contact_requests'
      and policyname = 'contact_requests_insert_public'
  ) then
    create policy "contact_requests_insert_public" on public.contact_requests
      for insert with check (true);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'contact_requests'
      and policyname = 'contact_requests_admin_all'
  ) then
    create policy "contact_requests_admin_all" on public.contact_requests
      for all using (public.is_admin());
  end if;
end
$$;

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

create table if not exists public.showing_requests (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  email            text not null,
  phone            text,
  property_address text,
  preferred_date   text,
  preferred_time   text,
  message          text not null,
  admin_status     text not null default 'not_viewed',
  admin_notes      text,
  created_at       timestamptz not null default now()
);

alter table public.showing_requests enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'showing_requests'
      and policyname = 'showing_requests_insert_public'
  ) then
    create policy "showing_requests_insert_public" on public.showing_requests
      for insert with check (true);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'showing_requests'
      and policyname = 'showing_requests_admin_all'
  ) then
    create policy "showing_requests_admin_all" on public.showing_requests
      for all using (public.is_admin());
  end if;
end
$$;

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
  status              text not null default 'not_viewed',
  created_at          timestamptz not null default now()
);

alter table public.renovation_clients enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'renovation_clients'
      and policyname = 'renovation_clients_insert_public'
  ) then
    create policy "renovation_clients_insert_public" on public.renovation_clients
      for insert with check (true);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'renovation_clients'
      and policyname = 'renovation_clients_admin_all'
  ) then
    create policy "renovation_clients_admin_all" on public.renovation_clients
      for all using (public.is_admin());
  end if;
end
$$;

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

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'house_flip_inquiries'
  ) then
    insert into public.renovation_clients (
      full_name, email, phone, property_address, service_needed, project_type, project_description, timeline, budget_range, status, created_at
    )
    select
      hf.full_name,
      hf.email,
      hf.phone,
      hf.property_address,
      coalesce(hf.property_condition, 'Renovation Support'),
      'Renovation Projects',
      hf.project_description,
      null,
      hf.estimated_value,
      coalesce(hf.admin_status, 'not_viewed'),
      hf.created_at
    from public.house_flip_inquiries hf
    where not exists (
      select 1
      from public.renovation_clients rc
      where rc.full_name = hf.full_name
        and rc.email = hf.email
        and coalesce(rc.project_description, '') = coalesce(hf.project_description, '')
        and date_trunc('second', rc.created_at) = date_trunc('second', hf.created_at)
    );
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'contractor_inquiries'
  ) then
    insert into public.renovation_clients (
      full_name, email, phone, property_address, service_needed, project_type, project_description, timeline, budget_range, status, created_at
    )
    select
      ci.full_name,
      ci.email,
      ci.phone,
      null,
      coalesce(ci.service_type, 'Renovation Support'),
      'Renovation Projects',
      concat_ws(E'\n\n', nullif(concat('Company: ', ci.company_name), 'Company: '), nullif(concat('Service Area: ', ci.service_area), 'Service Area: '), nullif(ci.project_description, '')),
      null,
      null,
      coalesce(ci.admin_status, 'not_viewed'),
      ci.created_at
    from public.contractor_inquiries ci
    where not exists (
      select 1
      from public.renovation_clients rc
      where rc.full_name = ci.full_name
        and rc.email = ci.email
        and coalesce(rc.project_description, '') = coalesce(concat_ws(E'\n\n', nullif(concat('Company: ', ci.company_name), 'Company: '), nullif(concat('Service Area: ', ci.service_area), 'Service Area: '), nullif(ci.project_description, '')), '')
        and date_trunc('second', rc.created_at) = date_trunc('second', ci.created_at)
    );
  end if;
end
$$;

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
alter table public.properties add column if not exists photo_urls text[];
alter table public.properties add column if not exists photo_paths text[];
alter table public.properties add column if not exists photo_bucket text;
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
update public.properties
set
  photo_urls = coalesce(photo_urls, '{}'::text[]),
  photo_paths = coalesce(photo_paths, '{}'::text[]),
  photo_bucket = coalesce(nullif(photo_bucket, ''), 'property-images')
where photo_urls is null
   or photo_paths is null
   or photo_bucket is null
   or photo_bucket = '';
alter table public.properties alter column visibility set default 'internal';
alter table public.properties alter column visibility set not null;
alter table public.properties alter column is_public set default false;
alter table public.properties alter column is_public set not null;
alter table public.properties alter column updated_at set default now();
alter table public.properties alter column updated_at set not null;
alter table public.properties alter column photo_urls set default '{}';
alter table public.properties alter column photo_urls set not null;
alter table public.properties alter column photo_paths set default '{}';
alter table public.properties alter column photo_paths set not null;
alter table public.properties alter column photo_bucket set default 'property-images';
alter table public.properties alter column photo_bucket set not null;
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
