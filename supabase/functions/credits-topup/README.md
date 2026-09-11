# credits-topup

Lets a wholesaler buy credits from inside the app. The app asks this function for a Razorpay payment page and opens it. When the wholesaler pays, [`razorpay-webhook`](../razorpay-webhook/README.md) grants the credits, exactly as it does for a link the team makes by hand.

```
app ──options──▶ credits-topup ──▶ credit_packs            (what to show)
app ──create───▶ credits-topup ──▶ Razorpay: new Payment Link
app opens the link, wholesaler pays
Razorpay ──payment_link.paid──▶ razorpay-webhook ──▶ credits granted
app sees its new credit_purchases row (matched on the link id) and says "done"
```

## Requests

Both are `POST` with the signed-in user's Supabase JWT. The app's Supabase client sends it automatically.

| Body | Returns |
|---|---|
| `{"action":"options"}` | `{ok, credits_per_rupee, gst_percent, packs:[{key, label, price_inr, gst_inr, total_inr, total_paise, credits}]}` |
| `{"action":"create","pack_key":"starter"}` | `{ok, link_id, url, pack_key, total_inr, credits, expires_at}` |

Errors come back as `{ok:false, error, message}`. `message` is safe to show the user.

## What the app cannot change

- **Whose wallet.** `notes.wholesaler_id` is the caller's own auth id, taken from their JWT. Nothing in the request body is read for it.
- **The price and the credits.** The app only names a pack. The amount comes from `credit_packs`, and the webhook grants from the amount actually paid.
- **Who can buy.** Only wholesalers whose `verification_status` is `verified`.

## Packs

Packs are the active rows of `credit_packs`, in `sort` order. Prices exclude GST, and the buyer pays price × 1.18. Credits shown = price × `CREDITS_PER_RUPEE`, computed the same way the webhook computes them (tested in `lib.test.ts`). The current set is in `ai-pipeline/migrations/009_round_packs.sql`.

## Deploying

Secrets. `CREDITS_PER_RUPEE` is shared with `razorpay-webhook` and is already set. The Razorpay API keys come from Razorpay Dashboard → **Account & Settings → API Keys**, in **Live** mode.

| Secret | Value |
|---|---|
| `RAZORPAY_KEY_ID` | `rzp_live_…` |
| `RAZORPAY_KEY_SECRET` | The key secret Razorpay shows once, when the key is generated |
| `CREDITS_PER_RUPEE` | `10` (shared with the webhook) |

Without the Razorpay keys, `options` still works but `create` answers 503. Without `CREDITS_PER_RUPEE`, everything answers 503.

Deploy **with** JWT verification, which is the default. Never pass `--no-verify-jwt` here.

```bash
supabase functions deploy credits-topup --project-ref ljxgwiuvdpuarvdszjts
```

## Tests

```bash
node --experimental-strip-types --test supabase/functions/credits-topup/*.test.ts
```

`handler.ts` holds the whole request flow with Supabase, Razorpay and the clock passed in, so the tests run it end to end without Deno. `index.ts` only wires in the real services.

## Before the App Store

Apple requires in-app purchase for digital credits bought inside an iOS app (guideline 3.1.1). This Razorpay flow is for TestFlight. Switch the iOS purchase to IAP before submitting for review.
