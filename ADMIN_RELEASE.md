# Admin production release — 10 October 2026

The repository-root Vite app includes the wholesaler credit allocations page, a dashboard link and the embedded wholesaler review panel. Current grants, scheduled allowances, refill deadlines and recurring/gift/purchased balances have distinct fields. Changes require a reason, version and replay key; zero schedules a pause and reset restores default inheritance.

`vercel.json` builds this root app and serves SPA deep links, including `/credits` and `/review/wholesaler/:id`. The older `jewel-admin` directory is not this release's application root. Supabase calls use the public anon client and the existing server-validated admin password. No service-role key is bundled.

## Validation

- `node --experimental-vm-modules --test tests/credit-allowance-admin.test.mjs tests/referral-admin.test.mjs`: 12 tests pass.
- `npm run build`: passes; generated bundle checked against configured service-role secrets.
- The changed admin-credit-allowances/admin-wishlist-shares handlers use per-function gateway settings and validate the admin password before database access. Existing production handler authentication settings are not modified by their deployment.

## Database readiness

The production database is still missing the shared credit-program/allowance migrations. This admin release does not activate that financial program or change customer credits. Until the coordinated database cutover, credit controls report that the database release is pending rather than reporting a successful save. The 24-hour wallet refill is not live through this admin-only release.

The shared cutover requires reviewed migrations 015 → 017 → 018 → 023, purchased-credit preservation, compatible customer/backend releases and authenticated wallet/accounting verification. Apply one canonical copy of 023, not both repository copies. The detailed handoff remains `../plans/wholesaler-credit-sprint-release.md` in the workspace.

Invitation/referral reporting and the newer atomic review handlers also depend on that shared database release. Do not deploy those database-dependent review handlers over the existing production review path before its prerequisite RPCs exist. Existing production review handlers remain in place for this admin-only release.

## Deployment

Publish this source to the existing GitHub production branch `main` and verify the resulting Vercel Production deployment. Deploy only the two changed admin credit/wishlist handlers by name from this repository. Do not use a broad/global JWT override or a bulk deploy of payment/staff/review functions.

After deployment, verify `/credits` returns the admin login, a compiled bundle contains the new credit UI, and missing/incorrect admin passwords receive 401 from both Edge handlers. Real mutations require the shared database release and designated test accounts.
