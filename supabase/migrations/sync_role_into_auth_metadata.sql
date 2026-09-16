--------------------------------------------------------------------------
-- Keep a user's role in BOTH places it is read from
--------------------------------------------------------------------------
-- Safe to re-run.
--
-- The problem
-- -----------
-- A user's role is read from two different places:
--
--   * the iOS app  — auth metadata, falling back to profiles.role
--     (JewelIndia/Sources/Core/AuthRouter.swift, resolveRole)
--   * the web API  — auth metadata ONLY, in ~20 routes
--     (Jewel-India-Frontend: retailer/marketplace, orders, chat, designs…)
--
-- Signing up with Google writes no role into auth metadata: Supabase stores
-- Google's own claims there, and handle_new_user only ever wrote the role
-- into `profiles`. So a Google user is routed correctly by the app and then
-- refused by every API route it calls — which is exactly how a verified
-- retailer ended up looking at "Couldn't load catalogue — Retailer access
-- required" on the Discover tab.
--
-- The fix
-- -------
-- One rule, applied in both directions:
--
--   1. handle_new_user, on signup, writes the role into auth metadata as
--      well as into profiles — the same value, from the same COALESCE.
--   2. A new trigger on profiles keeps auth metadata in step whenever the
--      role is changed later (an admin fixing a mis-signup, say).
--
-- Both run as SECURITY DEFINER owned by postgres, which is what lets them
-- write to auth.users. Metadata is merged with `||`, never replaced, so
-- Google's name/picture claims survive — and so does the role when Google
-- refreshes those claims on a later sign-in.
--
-- Existing users were backfilled separately with the equivalent UPDATE.
--------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(new.raw_user_meta_data->>'role', 'wholesaler');
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    coalesce(new.email, new.phone),  -- phone users have no email
    v_role
  )
  on conflict (id) do nothing;

  -- The web API reads the role from here and nowhere else.
  if (new.raw_user_meta_data->>'role') is null then
    update auth.users
       set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                              || jsonb_build_object('role', v_role)
     where id = new.id;
  end if;

  return new;
end;
$$;

-- Role changed after the fact: carry it across so the two never drift.
create or replace function public.sync_role_to_auth_metadata()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is not null and new.role is distinct from old.role then
    update auth.users
       set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                              || jsonb_build_object('role', new.role)
     where id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_sync_role_to_auth_metadata on public.profiles;
create trigger profiles_sync_role_to_auth_metadata
  after update of role on public.profiles
  for each row
  execute function public.sync_role_to_auth_metadata();

-- Verify (read-only): nobody should have a role in one place and not the other.
-- select count(*) as out_of_step
--   from auth.users u join public.profiles p on p.id = u.id
--  where coalesce(u.raw_user_meta_data->>'role','') is distinct from coalesce(p.role,'');
