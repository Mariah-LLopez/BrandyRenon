-- =============================================================================
-- Portal Task & Account Sub-task Updates
-- Incremental migration — run after schema.sql to add task system, messages,
-- document requests, signature requests, and task files tables.
-- =============================================================================

-- -------------------------------------------------------------------------
-- Extend profiles.role to support renter / buyer / seller sub-roles
-- -------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'client', 'renter', 'buyer', 'seller'));

-- -------------------------------------------------------------------------
-- Extend accounts: add user_id column, expand account_type values
-- -------------------------------------------------------------------------
alter table public.accounts add column if not exists user_id uuid references public.profiles (id) on delete set null;
create index if not exists idx_accounts_user_id on public.accounts (user_id);

alter table public.accounts drop constraint if exists accounts_account_type_check;
alter table public.accounts
  add constraint accounts_account_type_check
  check (account_type in (
    'Buyer','Seller','Rental','Lease','Property Management','Renovation','Other',
    'Renter','Owner','Contractor'
  ));

-- -------------------------------------------------------------------------
-- Extend maintenance_requests: add category column
-- -------------------------------------------------------------------------
alter table public.maintenance_requests add column if not exists category text;
alter table public.maintenance_requests drop constraint if exists maintenance_requests_status_check;
alter table public.maintenance_requests
  add constraint maintenance_requests_status_check
  check (status in ('Not Reviewed Yet','In Progress','Waiting on Contractor','Completed'));

-- -------------------------------------------------------------------------
-- tasks
-- Central task hub linking accounts, users, properties to admin work items.
-- -------------------------------------------------------------------------
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

-- Clients see tasks linked to their accounts (non-internal tasks only)
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

create index if not exists idx_tasks_account_id     on public.tasks (account_id);
create index if not exists idx_tasks_user_id        on public.tasks (user_id);
create index if not exists idx_tasks_status         on public.tasks (status);
create index if not exists idx_tasks_task_type      on public.tasks (task_type);
create index if not exists idx_tasks_assigned_admin on public.tasks (assigned_admin_id);

-- -------------------------------------------------------------------------
-- messages
-- Portal messages from users (renter/buyer/seller) to admin.
-- Separate from public contact_requests; requires authentication.
-- -------------------------------------------------------------------------
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

create index if not exists idx_messages_account_id  on public.messages (account_id);
create index if not exists idx_messages_user_id     on public.messages (user_id);
create index if not exists idx_messages_status      on public.messages (status);

-- -------------------------------------------------------------------------
-- document_requests
-- Admin requests a specific document type from a user.
-- -------------------------------------------------------------------------
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

create index if not exists idx_document_requests_account_id on public.document_requests (account_id);
create index if not exists idx_document_requests_user_id    on public.document_requests (user_id);

-- -------------------------------------------------------------------------
-- signature_requests
-- Tracks e-signature workflows (DocuSign, Dropbox Sign, etc.)
-- -------------------------------------------------------------------------
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

create index if not exists idx_signature_requests_account_id on public.signature_requests (account_id);
create index if not exists idx_signature_requests_user_id    on public.signature_requests (user_id);
create index if not exists idx_signature_requests_status     on public.signature_requests (status);

-- -------------------------------------------------------------------------
-- task_files
-- Files attached to tasks (photos, receipts, etc.)
-- -------------------------------------------------------------------------
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

create index if not exists idx_task_files_task_id on public.task_files (task_id);
