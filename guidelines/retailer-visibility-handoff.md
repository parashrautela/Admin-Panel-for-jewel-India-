# Retailer/Wholesaler Visibility Handoff

## What was verified in this workspace

1. The root admin app is the one under src/app (this matches your screenshot UI).
2. The code now supports both entities in the dashboard and review pages.
3. Direct DB checks against the configured project in .env returned:
   - wholesalers: 13 rows
   - retailers: 1 row
4. The retailers row currently has empty profile fields:
   - full_name: ""
   - business_name: ""
   - state: ""
   - city: ""
5. Anon-key visibility check on the same project returned:
   - wholesalers: 0 rows
   - retailers: 0 rows

This strongly indicates RLS is hiding data when the app runs without service-role access or without a backend admin proxy.

## Root-cause hypothesis to prioritize

Primary likely cause:
- The deployed/admin runtime is using VITE_SUPABASE_ANON_KEY (or no service role), so selects are filtered by RLS and return empty/partial lists.

Secondary data issue:
- Retailer onboarding data exists, but at least one retailer row has blank full_name/business_name/state/city. The list is not wrong for that row; the source row is incomplete.

## Changes already applied here

1. Removed default list cap so dashboard fetches full result set unless a page size is explicitly passed.
2. Status counts now include all statuses:
   - pending
   - on_hold
   - verified
   - rejected
   - resubmission_required
   - banned
3. Dashboard now includes resubmission_required in the filter chips.

## What the other agent should check in the target admin codebase

1. Confirm which app is deployed (root app vs any secondary admin app).
2. Confirm Supabase client config at runtime:
   - SUPABASE URL
   - Key actually used in production build
3. If frontend uses anon key, do not rely on direct table selects for admin listing.
   - Implement a backend/edge endpoint with service role
   - Keep admin auth check on that endpoint
4. Verify retailer select columns match onboarding writes:
   - full_name
   - business_name
   - state
   - city
   - created_at
   - verification_status
5. Verify status updates route to the selected table:
   - wholesalers when type=wholesaler
   - retailers when type=retailer

## SQL checks to run in Supabase SQL Editor

Use these exact checks:

select count(*) from wholesalers;
select count(*) from retailers;

select id, full_name, business_name, state, city, verification_status, created_at
from wholesalers
order by created_at desc
limit 20;

select id, full_name, business_name, state, city, verification_status, created_at, referred_by, referral_code
from retailers
order by created_at desc
limit 20;

## Expected end state

1. Wholesaler tab shows all wholesaler rows.
2. Retailer tab shows all retailer rows.
3. Counts match the active entity tab.
4. Verify/Reject/Hold/Ban actions update the correct table.
5. No silent empty list caused by anon+RLS in admin runtime.
