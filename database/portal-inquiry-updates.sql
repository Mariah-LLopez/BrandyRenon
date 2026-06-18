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
alter table public.contact_requests add column if not exists admin_status text not null default 'not_viewed';
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
      check (inquiry_type in ('general_inquiry','rental_help','buyer_agent_request','property_inquiry','showing_request','renovation_help','maintenance_request','seller_help'));
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

alter table public.showing_requests add column if not exists admin_status text not null default 'not_viewed';
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

alter table public.house_flip_inquiries add column if not exists admin_status text not null default 'not_viewed';
alter table public.house_flip_inquiries add column if not exists admin_notes text;
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'house_flip_inquiries_admin_status_check'
  ) then
    alter table public.house_flip_inquiries
      add constraint house_flip_inquiries_admin_status_check
      check (admin_status in ('not_viewed','in_progress','complete'));
  end if;
end
$$;

update public.house_flip_inquiries
set admin_status = 'not_viewed'
where admin_status is null or btrim(admin_status) = '';

alter table public.contractor_inquiries add column if not exists admin_status text not null default 'not_viewed';
alter table public.contractor_inquiries add column if not exists admin_notes text;
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'contractor_inquiries_admin_status_check'
  ) then
    alter table public.contractor_inquiries
      add constraint contractor_inquiries_admin_status_check
      check (admin_status in ('not_viewed','in_progress','complete'));
  end if;
end
$$;

update public.contractor_inquiries
set admin_status = 'not_viewed'
where admin_status is null or btrim(admin_status) = '';
