--------------------------------------------------------------------------
-- GUARD: a client cannot INSERT itself as an already-verified wholesaler
--------------------------------------------------------------------------
-- Companion to guard_wholesaler_privileged_columns.sql, which covers UPDATE
-- only. Run it after that file. Safe to re-run.
--
-- Vulnerability being fixed
-- -------------------------
-- The insert policy only checks ownership:
--
--   create policy "Users can insert own wholesaler record"
--     on wholesalers for insert with check (auth.uid() = user_id);
--
-- so a wholesaler's own session can INSERT its row with any value in the
-- admin-decision columns, e.g. verification_status = 'verified'. The UPDATE
-- guard never sees an INSERT. And the Treasure Chest welcome-credits trigger
-- (ai-pipeline migrations 004c: trg_credits_welcome, AFTER INSERT OR UPDATE OF
-- verification_status) pays 100 credits the moment a row arrives 'verified' —
-- so a tampered client could skip admin review AND mint itself credits with a
-- single request. The iOS onboarding upserts `wholesalers` with the user's own
-- session, so this is reachable from a modified app binary or a direct REST
-- call made with any signed-in user's token.
--
-- Fix
-- ---
-- A BEFORE INSERT trigger that, for any insert NOT made by the service_role,
-- forces verification_status to 'pending' and blanks the other five columns
-- the UPDATE guard protects (admin_notes, rejection_reason,
-- rejected_documents, notified, notification_message). BEFORE triggers run
-- before AFTER triggers, so trg_credits_welcome only ever sees 'pending' on a
-- client insert and grants nothing; the welcome grant still fires when an
-- admin later verifies the row (a service-role UPDATE).
--
-- Upserts are covered too: for INSERT ... ON CONFLICT DO UPDATE (the iOS
-- `.upsert(row, onConflict: "user_id")`), this trigger rewrites the proposed
-- row first, and if the row already exists the UPDATE guard then keeps the
-- existing admin decision.
--
-- Service-role detection is the same as the UPDATE guard: auth.role(), which
-- reads the `role` claim of the request's JWT. The web onboarding
-- (/api/onboard/submit, service-role client) and the admin Edge Functions are
-- unaffected. Like the UPDATE guard, a session with no JWT at all — e.g. the
-- Supabase SQL editor — is treated as a client; to insert a pre-verified row
-- by hand, first run
--   select set_config('request.jwt.claims', '{"role":"service_role"}', true);
-- inside the same transaction.
--
-- retailers: the existing guard does not cover the retailers table (neither
-- INSERT nor UPDATE), so neither does this one. No credits trigger fires on
-- retailers.

create or replace function guard_wholesaler_privileged_columns_on_insert()
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

drop trigger if exists wholesalers_guard_privileged_columns_on_insert on wholesalers;

create trigger wholesalers_guard_privileged_columns_on_insert
  before insert on wholesalers
  for each row
  execute function guard_wholesaler_privileged_columns_on_insert();

-- Verify (read-only): both guards should be listed, both enabled ('O').
-- select tgname, tgenabled from pg_trigger
--  where tgrelid = 'public.wholesalers'::regclass and not tgisinternal
--  order by tgname;
