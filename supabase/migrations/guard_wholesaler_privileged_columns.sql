--------------------------------------------------------------------------
-- GUARD: privileged wholesaler columns can only be changed by service_role
--------------------------------------------------------------------------
-- Context / vulnerability being fixed
-- -------------------------------------
-- supabase_schema.sql defines:
--
--   create policy "Wholesalers update own row"
--     on wholesalers for update
--     using (auth.uid() = id);
--
-- This policy has no WITH CHECK clause and no column restriction. Because
-- Postgres reuses the USING clause as the check when WITH CHECK is absent,
-- and the predicate is pure row-identity (auth.uid() = id), a wholesaler's
-- own authenticated (anon-key) session is allowed to UPDATE every column on
-- their own row - including the columns that exist solely to record the
-- *admin* approval decision:
--
--   verification_status, admin_notes, rejection_reason,
--   rejected_documents, notified, notification_message
--
-- That fully bypasses the admin review workflow this schema exists to
-- enforce (e.g. a wholesaler could set verification_status = 'verified'
-- directly from the client).
--
-- Fix
-- ---
-- This migration is additive: it does NOT touch supabase_schema.sql or the
-- existing RLS policies. Instead it adds a BEFORE UPDATE trigger that, for
-- any update NOT made by the service_role, silently forces the six
-- privileged columns above back to their previous (OLD) values - no matter
-- what the incoming UPDATE tries to set them to. Every other column
-- (full_name, aadhar_number, aadhaar_front_url, aadhaar_back_url,
-- business_name, state, city, business_logo_url, pan_card_url,
-- gst_certificate_url, onboarding_step_completed) is left completely alone,
-- so the legitimate wholesaler self-service onboarding flow in
-- src/lib/onboardingApi.ts (saveStep1 / saveStep2 / saveStep3) keeps
-- working exactly as before.
--
-- "service_role" is detected via auth.role(), the standard Supabase helper
-- that reads the `role` claim PostgREST attaches to the current request's
-- JWT (this mirrors the existing auth.uid() usage in supabase_schema.sql's
-- RLS policies). Requests made with the service_role key - i.e. this
-- repo's admin Edge Functions in supabase/functions/
-- (approve-wholesaler, reject-wholesaler, hold-wholesaler, ban-wholesaler,
-- request-resubmission, mark-notified, admin-action) and the admin panel's
-- privileged Supabase client - report auth.role() = 'service_role' and are
-- left free to change these columns. Any other caller (anon/authenticated,
-- i.e. a wholesaler's own session) has its writes to these columns reverted.

create or replace function guard_wholesaler_privileged_columns()
returns trigger as $$
begin
  if auth.role() is distinct from 'service_role' then
    new.verification_status  := old.verification_status;
    new.admin_notes           := old.admin_notes;
    new.rejection_reason      := old.rejection_reason;
    new.rejected_documents    := old.rejected_documents;
    new.notified              := old.notified;
    new.notification_message  := old.notification_message;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists wholesalers_guard_privileged_columns on wholesalers;

create trigger wholesalers_guard_privileged_columns
  before update on wholesalers
  for each row
  execute function guard_wholesaler_privileged_columns();
