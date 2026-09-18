--------------------------------------------------------------------------
-- ONBOARDING, REBUILT: one door each for wholesalers, retailers and staff
--------------------------------------------------------------------------
-- Safe to re-run. Replaces sync_role_into_auth_metadata.sql, which must NOT
-- be applied: it stamps 'wholesaler' on every new account, which is the
-- very thing this fixes.
--
-- What was wrong (checked against the live database, 18 Sep 2026)
-- ----------------------------------------------------------------
--  * handle_new_user() wrote COALESCE(role, 'wholesaler'), so nobody was
--    ever asked which door they were coming through, and profiles.role
--    could not even hold "not chosen yet".
--  * Any signed-in user could change their own role: the profiles UPDATE
--    policy does not protect the column, and the role also lives in the
--    account metadata, which the user can write.
--  * A retailer could be created with no invitation, and the column guard
--    left referred_by open, so a retailer could name any wholesaler as
--    their inviter and hand them 1,000 credits on approval.
--  * "Anyone can validate referral links" let anyone read every live code.
--  * "Public profiles are viewable by everyone" exposed every user's email
--    and phone number. Nothing reads another user's row under a session.
--  * employees.password_plain was required, so staff passwords sat in the
--    open, and the web's own "virtual employee" row for a retailer could
--    never be inserted.
--
-- What this does
-- --------------
--  1. Role: nullable, no default; chosen once through set_my_role() and
--     changeable only until an application or employment exists. Guards on
--     profiles and on auth.users pin the role against anything else.
--     Existing users' roles are copied into their metadata (the only place
--     the website reads).
--  2. Retailers: a new row needs a live, unused invitation from a verified
--     wholesaler; the invitation is spent in the same statement, whoever
--     is inserting. A pending retailer can attach a code later. Nobody can
--     be moved to 'verified' without an inviter.
--  3. Staff: password_plain becomes optional (and is cleared), status gains
--     'invited', and a store can invite a Google address which
--     claim_staff_invite() turns into an active employee at sign-in.
--     Password logins are created only by the staff-accounts service.
--  4. Leaks closed: referral_links and profiles are readable only where
--     they must be; validate_referral_code() answers "is this code good
--     and who sent it" and nothing more.
--
-- Trust
-- -----
-- The column guards trust two callers: the service role, and code that has
-- set the transaction-local flag jewel.trusted = 'on'. Only the functions
-- in this file set that flag, and only for the rows they are about.
--------------------------------------------------------------------------

create or replace function public.jewel_trusted()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(auth.role() = 'service_role', false)
      or coalesce(current_setting('jewel.trusted', true) = 'on', false);
$$;

revoke all on function public.jewel_trusted() from public;
grant execute on function public.jewel_trusted() to authenticated, anon, service_role;

--------------------------------------------------------------------------
-- 1. ROLE
--------------------------------------------------------------------------

alter table public.profiles alter column role drop not null;
alter table public.profiles alter column role drop default;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role is null or role in ('wholesaler', 'retailer', 'employee'));

-- A new account starts with no role. Signup metadata may name a door
-- (wholesaler or retailer, which anyone may pick anyway); 'employee' is
-- never taken from it, because a person can put anything in their own
-- signup metadata — staff get that role from the staff-accounts service
-- or from claim_staff_invite().
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := nullif(btrim(new.raw_user_meta_data->>'role'), '');
begin
  if v_role not in ('wholesaler', 'retailer') then
    v_role := null;
  end if;

  insert into public.profiles (id, email, role)
  values (new.id, coalesce(new.email, new.phone), v_role)
  on conflict (id) do nothing;

  return new;
end;
$$;

-- True once the account has an application or a job attached — the point
-- after which the role is fixed.
create or replace function public.account_is_committed(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.wholesalers where user_id = p_user)
      or exists (select 1 from public.retailers   where user_id = p_user)
      or exists (select 1 from public.employees   where auth_user_id = p_user);
$$;

revoke all on function public.account_is_committed(uuid) from public;

-- The one way for a person to choose their own door.
create or replace function public.set_my_role(p_role text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_current text;
  v_contact text;
begin
  if v_uid is null then
    raise exception 'NOT_SIGNED_IN' using errcode = '28000';
  end if;
  if p_role not in ('wholesaler', 'retailer') then
    raise exception 'ROLE_NOT_ALLOWED' using errcode = '22023',
      hint = 'Staff accounts are created by the store, not chosen.';
  end if;

  select role into v_current from public.profiles where id = v_uid for update;

  if found and v_current is not null and v_current <> p_role
     and public.account_is_committed(v_uid) then
    raise exception 'ROLE_ALREADY_SET' using errcode = '23514',
      hint = 'This account already has an application or a job attached.';
  end if;

  perform set_config('jewel.trusted', 'on', true);

  if found then
    update public.profiles set role = p_role, updated_at = now() where id = v_uid;
  else
    select coalesce(email, phone) into v_contact from auth.users where id = v_uid;
    insert into public.profiles (id, email, role) values (v_uid, v_contact, p_role);
  end if;

  update auth.users
     set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                            || jsonb_build_object('role', p_role)
   where id = v_uid;

  return p_role;
end;
$$;

revoke all on function public.set_my_role(text) from public;
grant execute on function public.set_my_role(text) to authenticated;

-- profiles.role: a person may fill an empty role with wholesaler or
-- retailer (that is what set_my_role does too); anything else outside a
-- trusted caller is pinned to what it was.
create or replace function public.guard_profile_role()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.role is not distinct from old.role or public.jewel_trusted() then
    return new;
  end if;
  if old.role is null and new.role in ('wholesaler', 'retailer') then
    return new;
  end if;
  new.role := old.role;
  return new;
end;
$$;

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
  before update of role on public.profiles
  for each row
  execute function public.guard_profile_role();

-- The same on a fresh row: signup makes it, but the insert policy would let
-- a person write one with any role if theirs had gone missing.
create or replace function public.guard_profile_role_on_insert()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not public.jewel_trusted() and new.role not in ('wholesaler', 'retailer') then
    new.role := null;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_role_on_insert on public.profiles;
create trigger profiles_guard_role_on_insert
  before insert on public.profiles
  for each row
  execute function public.guard_profile_role_on_insert();

-- Whatever lands in profiles.role is copied into the account metadata,
-- which is where the website reads it.
create or replace function public.sync_role_to_auth_metadata()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role is null then
    return new;
  end if;
  perform set_config('jewel.trusted', 'on', true);
  update auth.users
     set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                            || jsonb_build_object('role', new.role)
   where id = new.id
     and (raw_user_meta_data->>'role') is distinct from new.role;
  return new;
end;
$$;

drop trigger if exists profiles_sync_role_to_auth_metadata on public.profiles;
create trigger profiles_sync_role_to_auth_metadata
  after insert or update of role on public.profiles
  for each row
  execute function public.sync_role_to_auth_metadata();

-- The metadata copy of the role only changes through the functions above.
-- Everything else — a sign-in refreshing Google's name and picture, a
-- password change, a user writing their own metadata — keeps the old value.
create or replace function public.guard_auth_role_metadata()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_old text := old.raw_user_meta_data->>'role';
  v_new text := new.raw_user_meta_data->>'role';
begin
  if v_new is not distinct from v_old
     or coalesce(current_setting('jewel.trusted', true) = 'on', false) then
    return new;
  end if;
  if v_old is null then
    new.raw_user_meta_data := coalesce(new.raw_user_meta_data, '{}'::jsonb) - 'role';
  else
    new.raw_user_meta_data := coalesce(new.raw_user_meta_data, '{}'::jsonb)
                              || jsonb_build_object('role', v_old);
  end if;
  return new;
end;
$$;

drop trigger if exists users_guard_role_metadata on auth.users;
create trigger users_guard_role_metadata
  before update of raw_user_meta_data on auth.users
  for each row
  execute function public.guard_auth_role_metadata();

-- Existing accounts: give the website the role the app already knows.
do $$
begin
  perform set_config('jewel.trusted', 'on', true);
  update auth.users u
     set raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb)
                            || jsonb_build_object('role', p.role)
    from public.profiles p
   where p.id = u.id
     and p.role is not null
     and (u.raw_user_meta_data->>'role') is null;
end;
$$;

drop policy if exists "Public profiles are viewable by everyone" on public.profiles;
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

--------------------------------------------------------------------------
-- 2. RETAILERS AND INVITATIONS
--------------------------------------------------------------------------

-- Reads one code and says whether it can still be used, and by which
-- wholesaler. Callable before sign-in: the retailer door asks for the code
-- first. Reveals nothing about codes that are not live.
create or replace function public.validate_referral_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text := upper(btrim(p_code));
  v_link public.referral_links%rowtype;
  v_ws   record;
begin
  if v_code is null or v_code = '' then
    return jsonb_build_object('valid', false, 'reason', 'no_code');
  end if;

  select * into v_link from public.referral_links where upper(code) = v_code;
  if not found then
    return jsonb_build_object('valid', false, 'reason', 'not_found');
  end if;
  if v_link.accepted_by is not null or coalesce(v_link.uses_count, 0) >= coalesce(v_link.max_uses, 1) then
    return jsonb_build_object('valid', false, 'reason', 'used');
  end if;
  if v_link.expires_at is null or v_link.expires_at <= now() then
    return jsonb_build_object('valid', false, 'reason', 'expired');
  end if;
  if not coalesce(v_link.is_active, false) then
    return jsonb_build_object('valid', false, 'reason', 'inactive');
  end if;

  select business_name, business_logo_url, verification_status
    into v_ws
    from public.wholesalers
   where id = v_link.wholesaler_id;
  if not found or v_ws.verification_status is distinct from 'verified' then
    return jsonb_build_object('valid', false, 'reason', 'inactive');
  end if;

  update public.referral_links
     set opened_at = now(), updated_at = now()
   where id = v_link.id and opened_at is null;

  return jsonb_build_object(
    'valid', true,
    'code', v_link.code,
    'wholesaler_name', v_ws.business_name,
    'wholesaler_logo_url', v_ws.business_logo_url,
    'expires_at', v_link.expires_at
  );
end;
$$;

revoke all on function public.validate_referral_code(text) from public;
grant execute on function public.validate_referral_code(text) to anon, authenticated;

-- Locks a code, checks it the same way, marks it used by this retailer and
-- returns the inviting wholesaler. Raises rather than returns, so it can
-- sit inside a trigger and abort the insert.
create or replace function public.spend_referral_code(p_code text, p_retailer_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text := upper(btrim(p_code));
  v_link public.referral_links%rowtype;
begin
  if v_code is null or v_code = '' then
    raise exception 'INVITE_CODE_REQUIRED' using errcode = '23514',
      hint = 'Retailers join with an invitation from a wholesaler.';
  end if;

  select * into v_link from public.referral_links where upper(code) = v_code for update;
  if not found then
    raise exception 'INVITE_CODE_NOT_FOUND' using errcode = '23514';
  end if;
  if v_link.accepted_by is not null or coalesce(v_link.uses_count, 0) >= coalesce(v_link.max_uses, 1) then
    raise exception 'INVITE_CODE_USED' using errcode = '23514';
  end if;
  if v_link.expires_at is null or v_link.expires_at <= now() then
    raise exception 'INVITE_CODE_EXPIRED' using errcode = '23514';
  end if;
  if not coalesce(v_link.is_active, false) then
    raise exception 'INVITE_CODE_INACTIVE' using errcode = '23514';
  end if;
  if not exists (select 1 from public.wholesalers
                  where id = v_link.wholesaler_id and verification_status = 'verified') then
    raise exception 'INVITE_CODE_INACTIVE' using errcode = '23514';
  end if;

  update public.referral_links
     set uses_count  = coalesce(uses_count, 0) + 1,
         max_uses    = 1,
         is_active   = false,
         accepted_at = now(),
         accepted_by = p_retailer_user,
         updated_at  = now()
   where id = v_link.id;

  return v_link.wholesaler_id;
end;
$$;

revoke all on function public.spend_referral_code(text, uuid) from public;

-- Every new retailer row goes through the invitation, whoever inserts it.
-- An upsert for a retailer that already exists skips this (its BEFORE
-- INSERT fires before the conflict is found) and lands in the UPDATE guard.
create or replace function public.gate_retailer_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.retailers where user_id = new.user_id) then
    return new;
  end if;
  new.referred_by   := public.spend_referral_code(new.referral_code, new.user_id);
  new.referral_code := upper(btrim(new.referral_code));
  return new;
end;
$$;

drop trigger if exists retailers_gate_invite on public.retailers;
create trigger retailers_gate_invite
  before insert on public.retailers
  for each row
  execute function public.gate_retailer_insert();

-- The admin columns stay an admin's decision (as before), and the inviter
-- can only be set by the functions in this file.
create or replace function public.guard_retailer_privileged_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not public.jewel_trusted() then
    new.verification_status  := old.verification_status;
    new.admin_notes          := old.admin_notes;
    new.rejection_reason     := old.rejection_reason;
    new.rejected_documents   := old.rejected_documents;
    new.notified             := old.notified;
    new.notification_message := old.notification_message;
  end if;
  if not coalesce(current_setting('jewel.trusted', true) = 'on', false) then
    new.referred_by   := old.referred_by;
    new.referral_code := old.referral_code;
  end if;
  return new;
end;
$$;

drop trigger if exists retailers_guard_privileged_columns on public.retailers;
create trigger retailers_guard_privileged_columns
  before update on public.retailers
  for each row
  execute function public.guard_retailer_privileged_columns();

-- Nobody reaches 'verified' without an inviter — not even the admin panel.
-- Retailers verified before this change are left exactly as they are.
create or replace function public.require_inviter_to_verify()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.verification_status = 'verified'
     and old.verification_status is distinct from 'verified'
     and new.referred_by is null then
    raise exception 'RETAILER_HAS_NO_INVITER' using errcode = '23514',
      hint = 'Ask the retailer to enter their invitation code first.';
  end if;
  return new;
end;
$$;

drop trigger if exists retailers_require_inviter_to_verify on public.retailers;
create trigger retailers_require_inviter_to_verify
  before update of verification_status on public.retailers
  for each row
  execute function public.require_inviter_to_verify();

-- A retailer who applied before this change adds their code afterwards.
create or replace function public.attach_referral_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.retailers%rowtype;
  v_ws  uuid;
begin
  if v_uid is null then
    raise exception 'NOT_SIGNED_IN' using errcode = '28000';
  end if;

  select * into v_row from public.retailers where user_id = v_uid for update;
  if not found then
    raise exception 'RETAILER_NOT_FOUND' using errcode = '23514';
  end if;
  if v_row.referred_by is not null then
    if upper(v_row.referral_code) = upper(btrim(p_code)) then
      return jsonb_build_object('ok', true, 'replayed', true, 'wholesaler_id', v_row.referred_by);
    end if;
    raise exception 'RETAILER_ALREADY_ATTRIBUTED' using errcode = '23514';
  end if;
  if v_row.verification_status = 'verified' then
    raise exception 'RETAILER_ALREADY_VERIFIED' using errcode = '23514';
  end if;

  v_ws := public.spend_referral_code(p_code, v_uid);

  perform set_config('jewel.trusted', 'on', true);
  update public.retailers
     set referred_by = v_ws, referral_code = upper(btrim(p_code)), updated_at = now()
   where id = v_row.id;

  return jsonb_build_object('ok', true, 'wholesaler_id', v_ws);
end;
$$;

revoke all on function public.attach_referral_code(text) from public;
grant execute on function public.attach_referral_code(text) to authenticated;

drop policy if exists "Anyone can validate referral links" on public.referral_links;

--------------------------------------------------------------------------
-- 3. STAFF
--------------------------------------------------------------------------

alter table public.employees alter column password_plain drop not null;
alter table public.employees add column if not exists invite_email        text;
alter table public.employees add column if not exists join_method         text not null default 'password';
alter table public.employees add column if not exists is_system_generated boolean not null default false;
alter table public.employees add column if not exists created_by          uuid;
alter table public.employees add column if not exists invited_at          timestamptz;
alter table public.employees add column if not exists activated_at        timestamptz;

alter table public.employees drop constraint if exists employees_status_check;
alter table public.employees
  add constraint employees_status_check
  check (status in ('active', 'inactive', 'invited'));
alter table public.employees drop constraint if exists employees_join_method_check;
alter table public.employees
  add constraint employees_join_method_check
  check (join_method in ('password', 'google'));

-- One invitation per Google address: an account is one person at one store.
create unique index if not exists employees_invite_email_key
  on public.employees (lower(invite_email))
  where invite_email is not null;

-- A store may write its own rows, but only Google invitations — password
-- logins need an auth user, which only the staff-accounts service can
-- create. Identity columns are never a store's to edit afterwards.
create or replace function public.guard_employee_insert()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.jewel_trusted() then
    return new;
  end if;
  if new.join_method is distinct from 'google' or new.invite_email is null then
    raise exception 'USE_STAFF_ACCOUNTS_SERVICE' using errcode = '42501',
      hint = 'Password logins are created through the staff-accounts service.';
  end if;
  new.invite_email        := lower(btrim(new.invite_email));
  new.email               := coalesce(nullif(new.email, ''), new.invite_email);
  new.auth_user_id        := null;
  new.status              := 'invited';
  new.password_plain      := null;
  new.is_system_generated := false;
  new.created_by          := auth.uid();
  new.invited_at          := coalesce(new.invited_at, now());
  new.activated_at        := null;
  return new;
end;
$$;

drop trigger if exists employees_guard_insert on public.employees;
create trigger employees_guard_insert
  before insert on public.employees
  for each row
  execute function public.guard_employee_insert();

create or replace function public.guard_employee_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.jewel_trusted() then
    return new;
  end if;
  new.auth_user_id        := old.auth_user_id;
  new.email               := old.email;
  new.invite_email        := old.invite_email;
  new.join_method         := old.join_method;
  new.is_system_generated := old.is_system_generated;
  new.created_by          := old.created_by;
  new.password_plain      := null;
  new.activated_at        := old.activated_at;
  -- A store may switch someone between active and inactive; 'invited' is
  -- only ever set by the insert guard and cleared by the claim.
  if new.status is distinct from old.status
     and (old.status = 'invited' or new.status = 'invited') then
    new.status := old.status;
  end if;
  return new;
end;
$$;

drop trigger if exists employees_guard_update on public.employees;
create trigger employees_guard_update
  before update on public.employees
  for each row
  execute function public.guard_employee_update();

-- The store's own "Admin" row is the retailer themself; deleting it must
-- never delete the retailer. A cascade from the account itself going away
-- (trigger depth > 1) is the one legitimate path.
create or replace function public.guard_employee_delete()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.is_system_generated
     and pg_trigger_depth() <= 1
     and not coalesce(current_setting('jewel.trusted', true) = 'on', false) then
    raise exception 'CANNOT_DELETE_STORE_OWNER_ROW' using errcode = '42501';
  end if;
  return old;
end;
$$;

drop trigger if exists employees_guard_delete on public.employees;
create trigger employees_guard_delete
  before delete on public.employees
  for each row
  execute function public.guard_employee_delete();

-- Signed in with Google and on a store's list? Then this is that employee.
create or replace function public.claim_staff_invite()
returns table (employee_id uuid, retailer_id uuid, business_name text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_row   public.employees%rowtype;
begin
  if v_uid is null then
    raise exception 'NOT_SIGNED_IN' using errcode = '28000';
  end if;

  -- Already staff: nothing to claim.
  select * into v_row from public.employees where auth_user_id = v_uid;
  if found then
    return query
      select v_row.id, v_row.retailer_id, r.business_name
        from public.retailers r where r.id = v_row.retailer_id;
    return;
  end if;

  -- The address has to come from Google itself, not be typed in.
  select lower(i.identity_data->>'email') into v_email
    from auth.identities i
   where i.user_id = v_uid and i.provider = 'google'
   limit 1;
  if v_email is null then
    raise exception 'GOOGLE_SIGN_IN_REQUIRED' using errcode = '28000',
      hint = 'Staff invited by email sign in with Google.';
  end if;

  if public.account_is_committed(v_uid) then
    raise exception 'ACCOUNT_HAS_ANOTHER_ROLE' using errcode = '23514',
      hint = 'This Google account is already a wholesaler or a retailer here.';
  end if;

  select * into v_row
    from public.employees
   where lower(invite_email) = v_email
     and status = 'invited'
     and auth_user_id is null
     for update;
  if not found then
    raise exception 'NOT_INVITED' using errcode = '23514',
      hint = 'Ask your store owner to add this address.';
  end if;

  perform set_config('jewel.trusted', 'on', true);

  update public.employees
     set auth_user_id = v_uid,
         status       = 'active',
         activated_at = now(),
         updated_at   = now()
   where id = v_row.id;

  insert into public.profiles (id, email, role)
  values (v_uid, v_email, 'employee')
  on conflict (id) do update set role = 'employee', updated_at = now();

  update auth.users
     set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                            || jsonb_build_object('role', 'employee')
   where id = v_uid;

  return query
    select v_row.id, v_row.retailer_id, r.business_name
      from public.retailers r where r.id = v_row.retailer_id;
end;
$$;

revoke all on function public.claim_staff_invite() from public;
grant execute on function public.claim_staff_invite() to authenticated;

-- The store an employee works for, without the store's documents
-- (written earlier as employee_store_profile.sql, never applied).
create or replace function public.employee_store_profile()
returns table (
  retailer_id       uuid,
  business_name     text,
  business_logo_url text,
  selected_theme    text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id, r.business_name, r.business_logo_url, r.selected_theme
    from public.retailers r
   where r.user_id = auth.uid()
      or r.id in (
           select e.retailer_id
             from public.employees e
            where e.auth_user_id = auth.uid()
              and e.status = 'active'
         )
   order by (r.user_id = auth.uid()) desc
   limit 1;
$$;

revoke all on function public.employee_store_profile() from public;
grant execute on function public.employee_store_profile() to authenticated;

-- Stored passwords go. Staff who forget theirs get a new one from the store.
do $$
begin
  perform set_config('jewel.trusted', 'on', true);
  update public.employees set password_plain = null where password_plain is not null;
end;
$$;

--------------------------------------------------------------------------
-- Verify (read-only)
--------------------------------------------------------------------------
-- Roles now copied into metadata (expect 0 left behind):
--   select count(*) from public.profiles p join auth.users u on u.id = p.id
--    where p.role is not null and (u.raw_user_meta_data->>'role') is null;
-- Pending retailers who will need to add a code:
--   select id, business_name from public.retailers
--    where referred_by is null and verification_status <> 'verified';
-- The public read rules are gone (expect no rows):
--   select tablename, policyname from pg_policies
--    where policyname in ('Anyone can validate referral links',
--                         'Public profiles are viewable by everyone');
