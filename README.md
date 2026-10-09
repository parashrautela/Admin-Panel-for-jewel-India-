
  # Build this feature

  This is a code bundle for Build this feature. The original project is available at https://www.figma.com/design/LIS5QVUi1OwJQp1tjKoJgt/Build-this-feature.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

## Invitation reporting and review

The repository-root Vite app and native admin use the shared protected referral report and review RPCs. Deploy `admin-referrals` and the updated verification/rejection/submission Edge Functions after migrations 017/018; both review clients must use those paths for atomic gift/reward settlement. The browser uses the public Supabase anon key and server-validated admin authorization; no service-role key belongs in the browser.

See [the shared release handoff](../plans/invitation-referrals-release.md) for exact deployment order, review outcomes, expiry and accounting reconciliation. The production invitation route and new database schema are currently missing; reporting and generation are not live just because the local build passes. The user selected non-expiring purchased-credit preservation on 3 October 2026; migration 018 retains original paid lots/receipts, with a distinct audit entry, and performs no historical referral backfill.
