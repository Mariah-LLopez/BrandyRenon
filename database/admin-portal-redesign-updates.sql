-- Admin portal redesign incremental migration
-- Run this after database/schema.sql (or on an existing deployment) before using
-- the redesigned admin and client portals.

alter table public.profiles add column if not exists user_type text;
alter table public.profiles add column if not exists updated_at timestamptz;
update public.profiles
set user_type = case
  when nullif(user_type, '') in ('Property Owner', 'Owner', 'Property Management Client') then 'Rental Owner'
  when coalesce(user_type, '') = '' then 'Other'
  else user_type
end,
updated_at = coalesce(updated_at, created_at, now());
alter table public.profiles alter column user_type set default 'Other';
alter table public.profiles alter column user_type set not null;
alter table public.profiles alter column updated_at set default now();
alter table public.profiles alter column updated_at set not null;
alter table public.profiles drop constraint if exists profiles_user_type_check;
alter table public.profiles
  add constraint profiles_user_type_check
  check (user_type in ('Buyer','Seller','Renter','Rental Owner','Renovation Client','Other'));

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
    'client',
    case
      when coalesce(nullif(new.raw_user_meta_data->>'user_type', ''), 'Other') in ('Property Owner', 'Owner', 'Property Management Client')
        then 'Rental Owner'
      else coalesce(nullif(new.raw_user_meta_data->>'user_type', ''), 'Other')
    end,
    now()
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

alter table public.accounts add column if not exists priority text;
update public.accounts
set account_type = case
  when account_type in ('Buyer') then 'Buyer Account'
  when account_type in ('Seller') then 'Seller Account'
  when account_type in ('Rental', 'Renter', 'Lease') then 'Rental Account'
  when account_type in ('Owner') then 'Rental Owner Account'
  when account_type in ('Renovation', 'Contractor') then 'Renovation Account'
  when account_type in ('Property Management') then 'Property Management Account'
  else coalesce(nullif(account_type, ''), 'Other')
end,
priority = coalesce(nullif(priority, ''), 'Medium');
alter table public.accounts alter column priority set default 'Medium';
alter table public.accounts alter column priority set not null;
alter table public.accounts drop constraint if exists accounts_priority_check;
alter table public.accounts add constraint accounts_priority_check check (priority in ('Low','Medium','High'));
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

alter table public.documents add column if not exists status text;
alter table public.documents add column if not exists priority text;
update public.documents
set status = coalesce(nullif(status, ''), 'Not Reviewed Yet'),
    priority = coalesce(nullif(priority, ''), 'Medium');
alter table public.documents alter column status set default 'Not Reviewed Yet';
alter table public.documents alter column status set not null;
alter table public.documents alter column priority set default 'Medium';
alter table public.documents alter column priority set not null;
alter table public.documents drop constraint if exists documents_status_check;
alter table public.documents add constraint documents_status_check check (status in ('Not Reviewed Yet','In Progress','Completed'));
alter table public.documents drop constraint if exists documents_priority_check;
alter table public.documents add constraint documents_priority_check check (priority in ('Low','Medium','High'));

alter table public.maintenance_requests drop constraint if exists maintenance_requests_priority_check;
update public.maintenance_requests
set priority = case when priority in ('Emergency', 'Urgent') then 'High' else coalesce(nullif(priority, ''), 'Medium') end,
    status = case
      when status in ('Waiting on Contractor') then 'In Progress'
      else coalesce(nullif(status, ''), 'Not Reviewed Yet')
    end;
alter table public.maintenance_requests
  add constraint maintenance_requests_priority_check check (priority in ('Low','Medium','High'));
alter table public.maintenance_requests drop constraint if exists maintenance_requests_status_check;
alter table public.maintenance_requests
  add constraint maintenance_requests_status_check check (status in ('Not Reviewed Yet','In Progress','Completed'));

alter table public.contact_requests add column if not exists status text;
alter table public.contact_requests add column if not exists priority text;
alter table public.contact_requests add column if not exists completed_at timestamptz;
alter table public.contact_requests add column if not exists updated_at timestamptz;
update public.contact_requests
set status = coalesce(nullif(status, ''), admin_status, 'Not Reviewed Yet'),
    priority = coalesce(nullif(priority, ''), 'Medium'),
    updated_at = coalesce(updated_at, created_at, now());
alter table public.contact_requests alter column status set default 'Not Reviewed Yet';
alter table public.contact_requests alter column priority set default 'Medium';
alter table public.contact_requests alter column priority set not null;
alter table public.contact_requests drop constraint if exists contact_requests_status_check;
alter table public.contact_requests add constraint contact_requests_status_check check (status in ('Not Reviewed Yet','In Progress','Completed'));
alter table public.contact_requests drop constraint if exists contact_requests_priority_check;
alter table public.contact_requests add constraint contact_requests_priority_check check (priority in ('Low','Medium','High'));

alter table public.showing_requests add column if not exists status text;
alter table public.showing_requests add column if not exists priority text;
alter table public.showing_requests add column if not exists completed_at timestamptz;
alter table public.showing_requests add column if not exists updated_at timestamptz;
update public.showing_requests
set status = coalesce(nullif(status, ''), admin_status, 'Not Reviewed Yet'),
    priority = coalesce(nullif(priority, ''), 'Medium'),
    updated_at = coalesce(updated_at, created_at, now());
alter table public.showing_requests alter column status set default 'Not Reviewed Yet';
alter table public.showing_requests alter column priority set default 'Medium';
alter table public.showing_requests alter column priority set not null;
alter table public.showing_requests drop constraint if exists showing_requests_status_check;
alter table public.showing_requests add constraint showing_requests_status_check check (status in ('Not Reviewed Yet','In Progress','Completed'));
alter table public.showing_requests drop constraint if exists showing_requests_priority_check;
alter table public.showing_requests add constraint showing_requests_priority_check check (priority in ('Low','Medium','High'));

alter table public.renovation_clients add column if not exists admin_notes text;
alter table public.renovation_clients add column if not exists priority text;
alter table public.renovation_clients add column if not exists completed_at timestamptz;
alter table public.renovation_clients add column if not exists updated_at timestamptz;
update public.renovation_clients
set status = coalesce(nullif(status, ''), 'Not Reviewed Yet'),
    priority = coalesce(nullif(priority, ''), 'Medium'),
    updated_at = coalesce(updated_at, created_at, now());
alter table public.renovation_clients alter column status set default 'Not Reviewed Yet';
alter table public.renovation_clients alter column priority set default 'Medium';
alter table public.renovation_clients alter column priority set not null;
alter table public.renovation_clients drop constraint if exists renovation_clients_status_check;
alter table public.renovation_clients add constraint renovation_clients_status_check check (status in ('Not Reviewed Yet','In Progress','Completed'));
alter table public.renovation_clients drop constraint if exists renovation_clients_priority_check;
alter table public.renovation_clients add constraint renovation_clients_priority_check check (priority in ('Low','Medium','High'));
