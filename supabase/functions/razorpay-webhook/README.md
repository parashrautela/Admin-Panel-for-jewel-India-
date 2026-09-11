# razorpay-webhook

Turns a paid Razorpay Payment Link into Treasure Chest credits.

The Jewel India team creates the link by hand in the Razorpay Dashboard, sends it to the wholesaler (WhatsApp, SMS, email), and the wholesaler pays. Razorpay then calls this function, which checks Razorpay's signature, works out who paid and for how many credits, and grants them. It does all of that in one database transaction, deduplicated on the Razorpay payment id.

Every paid payment ends up in exactly one of these states:

| Outcome | Response |
|---|---|
| Credits granted | 200 |
| Already granted (Razorpay retried) | 200, nothing granted twice |
| Needs a person: recorded in `credit_purchase_issues` | 200 |
| Temporary failure (database unreachable) | 500, Razorpay retries |

A payment is never silently dropped.

## For the team: creating a payment link

Razorpay Dashboard → **Payment Links → Create Payment Link**.

**The amount decides the credits.** Credits = the amount paid excluding GST × `CREDITS_PER_RUPEE`, which is **10 credits per ₹1**. A Fusion costs 200 credits (₹20).

| Link amount (incl. 18% GST) | Excluding GST | Credits | Fusions |
|---:|---:|---:|---:|
| ₹590 | ₹500 | 5,000 | 25 |
| ₹1,180 | ₹1,000 | 10,000 | 50 |
| ₹5,900 | ₹5,000 | 50,000 | 250 |

- **Amount:** the GST-inclusive total the wholesaler pays. To sell ₹X of credits, charge ₹X × 1.18.
- **Customer:** the wholesaler's registered phone and/or email. These double-check who paid.
- **Partial payments:** leave **off**.
- **Notes (key → value).** Keys can be typed in any case, with spaces or dashes.

| Key | Value | Required |
|---|---|---|
| `wholesaler_id` | The wholesaler's ID from the admin panel | Recommended. Without it, the phone/email must match exactly one wholesaler. |
| `credits` | A number, only for a special deal (e.g. a bonus) | Optional. Must be between half and double what the amount buys. |
| `pack` | A label such as `starter` | Optional, for your own records. It doesn't change the credits. |
| `gstin` | The buyer's GSTIN | Optional, used for the invoice |
| `state` | The buyer's state | Optional; the wholesaler's own state is used if blank |

### What sends a payment to manual handling instead of granting

- **Wrong wholesaler or none:**
  - No wholesaler matches the ID, phone or email.
  - More than one wholesaler matches.
  - The ID and the phone/email point at different wholesalers. This is what pasting the wrong ID looks like.
- **A `credits` note far from the amount:** less than half, or more than double, what the amount buys. An extra or missing zero looks exactly like this.
- **An amount too small to buy a single credit.**
- **Not rupees:** any currency other than INR.

To see and resolve them, open the Supabase SQL editor:

```sql
-- Open issues
select razorpay_payment_id, reason, created_at, raw_payload->'payload'->'payment_link'->'entity'->'notes' as notes
  from credit_purchase_issues where resolved_at is null order by created_at desc;

-- Grant by hand once you know who paid and for what. This also marks the
-- issue resolved.
select record_razorpay_purchase(
  p_user       => '<wholesalers.user_id>',
  p_payment_id => 'pay_…',
  p_credits    => 5000,       -- ₹500 excluding GST × 10
  p_pack_key   => 'amount',
  p_amount_inr => 500.00,     -- taxable value (excluding GST)
  p_gst_inr    => 90.00
);
```

## Deploying

Secrets. The function reads these two; `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically by Supabase. If either one is missing, the function answers every webhook with 500. Razorpay then keeps retrying, so no payment is lost while you fix it.

| Secret | Value |
|---|---|
| `RAZORPAY_WEBHOOK_SECRET` | The secret you type into the Razorpay webhook |
| `CREDITS_PER_RUPEE` | `10`: credits granted per ₹1 paid, excluding GST |

```bash
supabase secrets set RAZORPAY_WEBHOOK_SECRET=<secret> CREDITS_PER_RUPEE=10 --project-ref ljxgwiuvdpuarvdszjts
```

To change the rate later, set `CREDITS_PER_RUPEE` again. It applies to every payment from then on. Update the rate card (`credit_prices`) to match, so a Fusion still costs what you intend.

Deploy. **Always pass `--no-verify-jwt`.** Razorpay cannot send a Supabase JWT, so a deploy without the flag answers every webhook with 401 and no payment gets credited. The signature check in `index.ts` is the authentication.

```bash
supabase functions deploy razorpay-webhook --no-verify-jwt --project-ref ljxgwiuvdpuarvdszjts
```

In the Razorpay Dashboard → **Settings → Webhooks → Add New Webhook**:

- **URL:** `https://ljxgwiuvdpuarvdszjts.supabase.co/functions/v1/razorpay-webhook`
- **Secret:** the same value as `RAZORPAY_WEBHOOK_SECRET`.
- **Active events:** tick only **`payment_link.paid`**.

Set it up in **Test Mode** first and pay a test link. Test Mode and Live Mode have separate webhook settings.

The database side is migrations `ai-pipeline/migrations/006_razorpay_purchases.sql` and `007_rupee_denominated_credits.sql`. Both must be applied before the first webhook arrives.

## Tests

`lib.ts` is pure logic with no Deno or network dependencies, and is tested with Node's built-in runner:

```bash
node --experimental-strip-types --test supabase/functions/razorpay-webhook/lib.test.ts
```

## Later: web self-serve checkout

When the web dashboard creates Razorpay Orders (with the same notes), add a `payment.captured` handler. The note in `index.ts` shows where. The payment-id dedupe already stops a Payment Link payment from being granted twice.
