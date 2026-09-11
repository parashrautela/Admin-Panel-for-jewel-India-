// credits-topup: the in-app "Buy credits" backend.
//
// Deployed WITH Supabase JWT verification (the default — never pass
// --no-verify-jwt), so only signed-in users reach this code, and handler.ts
// takes who is buying from that session. The app never says whose wallet to
// fill or what anything costs.
//
//   POST { "action": "options" }                   → packs, priced, with credits
//   POST { "action": "create", "pack_key": "…" }   → a Razorpay Payment Link
//
// The link carries notes.wholesaler_id = the buyer's auth uid, so when it is
// paid, razorpay-webhook grants the credits exactly as for a link made by hand.
// Deploy/config steps: README.md next to this file.

// @ts-ignore: Deno import
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
// @ts-ignore: Deno import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import type { Pack } from "../razorpay-webhook/lib.ts"
import { handleTopUp, type RazorpayResult } from "./handler.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RAZORPAY_TIMEOUT_MS = 15_000

function env(name: string): string {
  // @ts-ignore: Deno global
  return Deno.env.get(name) ?? ''
}

function log(level: 'info' | 'warn' | 'error', message: string, extra: Record<string, unknown> = {}) {
  console[level](JSON.stringify({ fn: 'credits-topup', level, message, ...extra }))
}

const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function createPaymentLink(body: unknown, keyId: string, keySecret: string): Promise<RazorpayResult> {
  try {
    const res = await fetch('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${keyId}:${keySecret}`)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(RAZORPAY_TIMEOUT_MS),
    })
    const data = await res.json().catch(() => null)
    if (res.ok && typeof data?.id === 'string' && typeof data?.short_url === 'string') {
      return { ok: true, id: data.id, shortUrl: data.short_url }
    }
    return { ok: false, status: res.status, description: String(data?.error?.description ?? 'no description') }
  } catch (err) {
    return { ok: false, status: 0, description: err instanceof Error ? err.message : String(err) }
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let reply
  try {
    reply = await handleTopUp(req.method, req.headers.get('Authorization'), await req.text(), {
      env,
      userFromJwt: async (jwt) => {
        const { data, error } = await admin.auth.getUser(jwt)
        return error || !data?.user ? null : data.user
      },
      activePacks: async () => {
        const { data, error } = await admin
          .from('credit_packs')
          .select('key, label, credits, price_inr_ex_gst, active')
          .eq('active', true)
          .order('sort')
        if (error) throw new Error(error.message)
        return (data ?? []) as Pack[]
      },
      wholesalerOf: async (userId) => {
        const { data, error } = await admin
          .from('wholesalers')
          .select('business_name, full_name, verification_status')
          .eq('user_id', userId)
          .maybeSingle()
        if (error) throw new Error(error.message)
        return data
      },
      createPaymentLink,
      nowSeconds: () => Math.floor(Date.now() / 1000),
      log,
    })
  } catch (err) {
    log('error', 'Unhandled error', { error: err instanceof Error ? err.message : String(err) })
    reply = { status: 500, body: { ok: false, error: 'unavailable', message: 'Something went wrong. Please try again.' } }
  }

  return new Response(JSON.stringify(reply.body), {
    status: reply.status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
