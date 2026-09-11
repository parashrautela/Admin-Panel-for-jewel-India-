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

- **Amount:** the GST-inclusive total the wholesaler pays. For example, Starter is ₹499 + 18% = **₹588.82**.
- **Customer:** the wholesaler's registered phone and/or email. These double-check who paid.
- **Partial payments:** leave **off**.
- **Notes (key → value).** Keys can be typed in any case, with spaces or dashes.

| Key | Value | Required |
|---|---|---|
| `wholesaler_id` | The wholesaler's ID from the admin panel | Recommended. Without it, the phone/email must match exactly one wholesaler. |
| `pack` | `starter`, `popular`, `pro` or `bulk` | Either `pack` or `credits` |
| `credits` | A number, for a custom deal (e.g. `650`) | Either `pack` or `credits` |
| `gstin` | The buyer's GSTIN | Optional, used for the invoice |
| `state` | The buyer's state | Optional; the wholesaler's own state is used if blank |

Packs (from the `credit_packs` table; prices exclude GST):

| Pack | Credits | Price | Link amount incl. 18% GST |
|---|---:|---:|---:|
| starter | 50 | ₹499 | ₹588.82 |
| popular | 220 | ₹1,999 | ₹2,358.82 |
| pro | 600 | ₹4,999 | ₹5,898.82 |
| bulk | 1,300 | ₹9,999 | ₹11,798.82 |

### What sends a payment to manual handling instead of granting

- **Wrong wholesaler or none:**
  - No wholesaler matches the ID, phone or email.
  - More than one wholesaler matches.
  - The ID and the phone/email point at different wholesalers. This is what pasting the wrong ID looks like.
- **Unclear credits:**
  - No `pack` and no `credits` in the notes.
  - An unknown pack name.
  - `pack` and `credits` disagree.
  - A custom deal over 5,000 credits.
- **Too little paid:** less than half of what those credits cost at list price. For example, `pack = bulk` on a ₹589 link. Normal discounts grant automatically; anything below half the value is almost certainly a typo.
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
  p_credits    => 220,
  p_pack_key   => 'popular',
  p_amount_inr => 1999.00,   -- taxable value (excluding GST)
  p_gst_inr    => 359.82
);
```

## Deploying

Secrets. This function reads only these; `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically by Supabase.

```bash
supabase secrets set RAZORPAY_WEBHOOK_SECRET=<the secret you type into the Razorpay webhook> --project-ref ljxgwiuvdpuarvdszjts
```

Deploy. **Always pass `--no-verify-jwt`.** Razorpay cannot send a Supabase JWT, so a deploy without the flag answers every webhook with 401 and no payment gets credited. The signature check in `index.ts` is the authentication.

```bash
supabase functions deploy razorpay-webhook --no-verify-jwt --project-ref ljxgwiuvdpuarvdszjts
```

In the Razorpay Dashboard → **Settings → Webhooks → Add New Webhook**:

- **URL:** `https://ljxgwiuvdpuarvdszjts.supabase.co/functions/v1/razorpay-webhook`
- **Secret:** the same value as `RAZORPAY_WEBHOOK_SECRET`.
- **Active events:** tick only **`payment_link.paid`**.

Set it up in **Test Mode** first and pay a test link. Test Mode and Live Mode have separate webhook settings.

The database side is migration `ai-pipeline/migrations/006_razorpay_purchases.sql`. It must be applied before the first webhook arrives.

## Tests

`lib.ts` is pure logic with no Deno or network dependencies, and is tested with Node's built-in runner:

```bash
node --experimental-strip-types --test supabase/functions/razorpay-webhook/lib.test.ts
```

## Later: web self-serve checkout

When the web dashboard creates Razorpay Orders (with the same notes), add a `payment.captured` handler. The note in `index.ts` shows where. The payment-id dedupe already stops a Payment Link payment from being granted twice.
