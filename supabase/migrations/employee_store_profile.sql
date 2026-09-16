--------------------------------------------------------------------------
-- employee_store_profile(): the store a signed-in employee works for
--------------------------------------------------------------------------
-- Safe to re-run.
--
-- The employee view shows the store's name, logo and claimed theme. The web
-- reads those with the service-role key; the iOS app only has the user's own
-- session, and under that session an employee cannot read their store's
-- `retailers` row at all (the only SELECT policy is `user_id = auth.uid()`).
--
-- A policy letting employees read the row would fix that — and also hand
-- every employee the retailer's Aadhaar, PAN and GST document links, because
-- row security cannot hide columns. So instead: one function that returns
-- exactly the four fields the employee view needs, for exactly one store —
-- the caller's own (a retailer) or the store the caller is an ACTIVE
-- employee of. Nothing else leaves the table.
--------------------------------------------------------------------------

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
   order by (r.user_id = auth.uid()) desc   -- a retailer's own store first
   limit 1;
$$;

revoke all on function public.employee_store_profile() from public;
revoke all on function public.employee_store_profile() from anon;
grant execute on function public.employee_store_profile() to authenticated;

-- Verify (read-only):
-- select has_function_privilege('anon', 'public.employee_store_profile()', 'execute');           -- false
-- select has_function_privilege('authenticated', 'public.employee_store_profile()', 'execute');  -- true
