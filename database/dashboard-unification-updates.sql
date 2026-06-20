-- Dashboard unification incremental migration

alter table public.profiles add column if not exists user_type text;
alter table public.profiles add column if not exists updated_at timestamptz;
update public.profiles set user_type = coalesce(nullif(user_type, ''), 'Other') where user_type is null or btrim(user_type) = '';
update public.profiles set updated_at = coalesce(updated_at, created_at, now()) where updated_at is null;
alter table public.profiles alter column user_type set default 'Other';
alter table public.profiles alter column user_type set not null;
alter table public.profiles alter column updated_at set default now();
alter table public.profiles alter column updated_at set not null;
alter table public.profiles drop constraint if exists profiles_user_type_check;
alter table public.profiles
  add constraint profiles_user_type_check
  check (user_type in ('Buyer','Seller','Renter','Property Owner','Renovation Client','Property Management Client','Other'));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, email, full_name, role, user_type)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'client',
    coalesce(nullif(new.raw_user_meta_data->>'user_type', ''), 'Other')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

alter table public.accounts add column if not exists priority text;
update public.accounts set priority = coalesce(nullif(priority, ''), 'Medium') where priority is null or btrim(priority) = '';
alter table public.accounts alter column priority set default 'Medium';
alter table public.accounts alter column priority set not null;
alter table public.accounts drop constraint if exists accounts_priority_check;
alter table public.accounts add constraint accounts_priority_check check (priority in ('Low','Medium','High'));

alter table public.documents add column if not exists status text;
alter table public.documents add column if not exists priority text;
update public.documents
set status = case
  when coalesce(signed, false) then 'Completed'
  when coalesce(requires_signature, false) then 'In Progress'
  else 'Not Reviewed Yet'
end
where status is null or btrim(status) = '';
update public.documents set priority = coalesce(nullif(priority, ''), 'Medium') where priority is null or btrim(priority) = '';
alter table public.documents alter column status set default 'Not Reviewed Yet';
alter table public.documents alter column status set not null;
alter table public.documents alter column priority set default 'Medium';
alter table public.documents alter column priority set not null;
alter table public.documents drop constraint if exists documents_status_check;
alter table public.documents add constraint documents_status_check check (status in ('Not Reviewed Yet','In Progress','Completed'));
alter table public.documents drop constraint if exists documents_priority_check;
alter table public.documents add constraint documents_priority_check check (priority in ('Low','Medium','High'));

alter table public.messages add column if not exists priority text;
alter table public.messages add column if not exists completed_at timestamptz;
update public.messages
set status = case
  when status in ('Not Reviewed','Open') then 'Not Reviewed Yet'
  when status in ('Replied','Closed') then 'Completed'
  else coalesce(nullif(status, ''), 'Not Reviewed Yet')
end;
update public.messages set priority = coalesce(nullif(priority, ''), 'Medium') where priority is null or btrim(priority) = '';
alter table public.messages alter column status set default 'Not Reviewed Yet';
alter table public.messages alter column priority set default 'Medium';
alter table public.messages alter column priority set not null;
alter table public.messages drop constraint if exists messages_status_check;
alter table public.messages add constraint messages_status_check check (status in ('Not Reviewed Yet','In Progress','Completed'));
alter table public.messages drop constraint if exists messages_priority_check;
alter table public.messages add constraint messages_priority_check check (priority in ('Low','Medium','High'));

alter table public.tasks add column if not exists completed_at timestamptz;
update public.tasks
set status = case
  when status in ('Not Reviewed') then 'Not Reviewed Yet'
  when status in ('Waiting on User','Waiting on Admin') then 'In Progress'
  when status in ('Archived') then 'Completed'
  else coalesce(nullif(status, ''), 'Not Reviewed Yet')
end;
update public.tasks set priority = 'High' where priority = 'Urgent';
alter table public.tasks alter column status set default 'Not Reviewed Yet';
alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add constraint tasks_status_check check (status in ('Not Reviewed Yet','In Progress','Completed'));
alter table public.tasks drop constraint if exists tasks_priority_check;
alter table public.tasks add constraint tasks_priority_check check (priority in ('Low','Medium','High'));

alter table public.maintenance_requests
  drop constraint if exists maintenance_requests_priority_check;
alter table public.maintenance_requests
  add constraint maintenance_requests_priority_check check (priority in ('Low','Medium','High'));
alter table public.maintenance_requests
  drop constraint if exists maintenance_requests_status_check;
alter table public.maintenance_requests
  add constraint maintenance_requests_status_check check (status in ('Not Reviewed Yet','In Progress','Completed'));

alter table public.contact_requests add column if not exists status text;
alter table public.contact_requests add column if not exists priority text;
update public.contact_requests set status = coalesce(nullif(status, ''), admin_status, 'Not Reviewed Yet') where status is null or btrim(status) = '';
update public.contact_requests set priority = coalesce(nullif(priority, ''), 'Medium') where priority is null or btrim(priority) = '';
alter table public.contact_requests alter column status set default 'Not Reviewed Yet';
alter table public.contact_requests alter column priority set default 'Medium';
alter table public.contact_requests alter column priority set not null;
alter table public.contact_requests drop constraint if exists contact_requests_status_check;
alter table public.contact_requests add constraint contact_requests_status_check check (status in ('Not Reviewed Yet','In Progress','Completed'));
alter table public.contact_requests drop constraint if exists contact_requests_priority_check;
alter table public.contact_requests add constraint contact_requests_priority_check check (priority in ('Low','Medium','High'));

alter table public.showing_requests add column if not exists status text;
alter table public.showing_requests add column if not exists priority text;
update public.showing_requests set status = coalesce(nullif(status, ''), admin_status, 'Not Reviewed Yet') where status is null or btrim(status) = '';
update public.showing_requests set priority = coalesce(nullif(priority, ''), 'Medium') where priority is null or btrim(priority) = '';
alter table public.showing_requests alter column status set default 'Not Reviewed Yet';
alter table public.showing_requests alter column priority set default 'Medium';
alter table public.showing_requests alter column priority set not null;
alter table public.showing_requests drop constraint if exists showing_requests_status_check;
alter table public.showing_requests add constraint showing_requests_status_check check (status in ('Not Reviewed Yet','In Progress','Completed'));
alter table public.showing_requests drop constraint if exists showing_requests_priority_check;
alter table public.showing_requests add constraint showing_requests_priority_check check (priority in ('Low','Medium','High'));

alter table public.renovation_clients add column if not exists priority text;
update public.renovation_clients set priority = coalesce(nullif(priority, ''), 'Medium') where priority is null or btrim(priority) = '';
alter table public.renovation_clients alter column priority set default 'Medium';
alter table public.renovation_clients alter column priority set not null;
alter table public.renovation_clients drop constraint if exists renovation_clients_priority_check;
alter table public.renovation_clients add constraint renovation_clients_priority_check check (priority in ('Low','Medium','High'));

-- accounts already support multiple rows per client/property. Keep account_id+client_id uniqueness only.
