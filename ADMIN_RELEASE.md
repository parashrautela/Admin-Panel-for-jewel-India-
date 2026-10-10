# Admin credits and referrals release — 10 October 2026

Credits and referrals appear inside both wholesaler and retailer business cards. Open **Credits & referrals**, choose **Change credits**, enter an amount and reason, then save. Pause schedules zero; Use default restores inheritance. Changes apply at the next refill and do not alter an issued grant. Verification is required before allocation changes. Retailer staff share their store owner’s balance.

Each card shows available credits, allowance per 24 hours, next refill and referral reward status. Technical balance details and invitation history are collapsed. The business review page has the same controls. Other admin features remain outside this update.

## Production backend

Canonical migrations 015, 017, 018, 023 and 024 were applied atomically after a successful production rollback rehearsal. Purchased-credit preservation, daily credits and referrals were activated. Both business types use issuance-based rolling 24-hour windows. New credit purchases are disabled by the selected daily-credit program; existing purchased balances and payment callbacks are preserved. Three purchased lots containing 68 credits were preserved.

The six credit/referral/report/review Edge handlers use their existing per-function gateway settings and validate the server admin password before database access. Deploy them by name; do not use a global JWT override. The customer application release is 2ac2a6a on https://app.jewelindia.shop, with the invitation API returning authenticated JSON responses.

## Validation

- Admin authorization and request validation: 13 tests pass.
- Actual dashboard/review browser fixture: wholesaler and retailer inline editing, pause/default, referral copy and mobile layout pass.
- Production Vite build passes; no server credential is bundled.
- SQL accounting suite: 17 grouped scenarios pass; referral/purchased-credit suite: 27 scenarios pass.
- Production rehearsal checks all 14 verified business wallets, full 24-hour windows, immutable current grants and unchanged purchased balances.
- Live invitation readiness checks pass, including daily/referral activation and new-payment disablement.

`vercel.json` builds the repository-root Vite application and supports SPA links. Publish to production branch `main` and verify the exact Vercel deployment. The public client contains only public Supabase configuration. Full authenticated admin UI verification requires an admin session; browser fixtures exercise the controls without adding a production authentication bypass.

## Immediate credits follow-up

**Give credits now** sends a one-time, non-expiring bonus to a verified wholesaler or retailer immediately. The amount (1–100,000) and reason are required. This does not change recurring allowances or refill anchors. SQL stores a dedicated admin bonus lot, ledger entry and immutable audit record; request keys prevent duplicate delivery across concurrent retries. The bonus participates in wallet totals, spend/refund accounting and retailer staff sharing, with a separate balance subtotal.

Canonical migration 026 is required before deploying the updated admin-credit-allowances handler. A protected backup and rolled-back production rehearsal confirmed correct immediate balances and unchanged cycle counts for all 16 currently verified businesses. Local accounting tests pass 21 grouped scenarios and the existing 27 referral/paid scenarios; admin tests pass 14 cases. The maintained browser fixture covers a 700-credit immediate send without changing the recurring allowance or policy version.
