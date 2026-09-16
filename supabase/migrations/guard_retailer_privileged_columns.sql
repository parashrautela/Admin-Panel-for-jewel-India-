--------------------------------------------------------------------------
-- GUARD: a retailer cannot verify itself
--------------------------------------------------------------------------
-- The retailers equivalent of guard_wholesaler_privileged_columns.sql and
-- guard_wholesaler_insert_privileged_columns.sql, which deliberately left
-- this table alone. Covers INSERT and UPDATE. Safe to re-run.
--
-- Vulnerability being fixed
-- -------------------------
-- The retailers policies check ownership and nothing else:
--
--   "Users can insert own retailer record"  with check (auth.uid() = user_id)
--   "Users can update own retailer record"  using      (auth.uid() = user_id)
--
-- so a retailer's own session can write any value into the columns that are
-- supposed to be an admin's decision — including
-- verification_status = 'verified'. A modified app binary, or one REST call
-- made with any signed-in retailer's token, skips admin review entirely and
-- lands straight in the retailer dashboard: the app routes on exactly that
-- column (`AuthRouter.retailerDestination`).
--
-- Nobody has exploited it — the retailers table is empty — but the whole
-- retailer flow is about to be used for the first time, so it is worth
-- closing before there is anything to protect.
--
-- Fix
-- ---
-- Two BEFORE triggers. On INSERT, anything not coming from the service_role
-- is forced to 'pending' with the other admin columns blanked. On UPDATE,
-- those columns are pinned to their existing values, so a retailer may still
-- edit their own profile (name, city, documents) and nothing else.
--
-- The admin panel is unaffected: it reviews submissions through the
-- admin-* Edge Functions, which use the service-role key.
--------------------------------------------------------------------------

create or replace function guard_retailer_privileged_columns_on_insert()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.role() is distinct from 'service_role' then
    new.verification_status  := 'pending';
    new.admin_notes          := null;
    new.rejection_reason     := null;
    new.rejected_documents   := '{}';
    new.notified             := false;
    new.notification_message := null;
  end if;

  return new;
end;
$$;

create or replace function guard_retailer_privileged_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.role() is distinct from 'service_role' then
    new.verification_status  := old.verification_status;
    new.admin_notes          := old.admin_notes;
    new.rejection_reason     := old.rejection_reason;
    new.rejected_documents   := old.rejected_documents;
    new.notified             := old.notified;
    new.notification_message := old.notification_message;
  end if;

  return new;
end;
$$;

drop trigger if exists retailers_guard_privileged_columns_on_insert on retailers;
create trigger retailers_guard_privileged_columns_on_insert
  before insert on retailers
  for each row
  execute function guard_retailer_privileged_columns_on_insert();

drop trigger if exists retailers_guard_privileged_columns on retailers;
create trigger retailers_guard_privileged_columns
  before update on retailers
  for each row
  execute function guard_retailer_privileged_columns();

-- Verify (read-only): both guards listed, both enabled ('O').
-- select tgname, tgenabled from pg_trigger
--  where tgrelid = 'public.retailers'::regclass and not tgisinternal
--  order by tgname;
