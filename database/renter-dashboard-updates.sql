-- =============================================================================
-- Renter Dashboard Updates
-- Run in the Supabase SQL editor to add property detail fields, owner role,
-- and the get_account_members security-definer function.
-- =============================================================================

-- -------------------------------------------------------------------------
-- Add 'owner' to allowed profile roles
-- -------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'client', 'renter', 'buyer', 'seller', 'owner'));

-- -------------------------------------------------------------------------
-- Add property detail columns used by the renter dashboard
-- -------------------------------------------------------------------------
alter table public.properties add column if not exists property_type   text;
alter table public.properties add column if not exists bedrooms        numeric(2,1);
alter table public.properties add column if not exists bathrooms       numeric(2,1);
alter table public.properties add column if not exists square_footage  integer;
alter table public.properties add column if not exists parking         text;

-- -------------------------------------------------------------------------
-- get_account_members
-- Returns the profiles of every client linked to the given account,
-- but ONLY when the calling user is also a member of that account.
-- security definer lets us bypass the "users only see their own profile"
-- RLS restriction so co-tenants can see each other's basic contact info.
-- -------------------------------------------------------------------------
create or replace function public.get_account_members(p_account_id uuid)
returns table (
  id         uuid,
  full_name  text,
  email      text,
  phone      text,
  role       text,
  status     text
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.email, p.phone, p.role, p.status
  from   public.account_clients ac
  join   public.profiles p on p.id = ac.client_id
  where  ac.account_id = p_account_id
    -- caller must themselves be a member of this account
    and  exists (
           select 1
           from   public.account_clients ac2
           where  ac2.account_id = p_account_id
             and  ac2.client_id  = auth.uid()
         );
$$;

grant execute on function public.get_account_members(uuid) to authenticated;

-- -------------------------------------------------------------------------
-- Performance index for new property detail queries
-- -------------------------------------------------------------------------
create index if not exists idx_properties_property_type on public.properties (property_type);
