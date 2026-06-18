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
