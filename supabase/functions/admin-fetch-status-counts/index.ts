// @ts-ignore: Deno import
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
// @ts-ignore: Deno import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { checkAdminAuth, requireAllowedTable } from "../_shared/adminAuth.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-password',
}

const STATUSES = ['pending', 'on_hold', 'verified', 'resubmission_required', 'rejected', 'banned']

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const authError = checkAdminAuth(req, corsHeaders)
  if (authError) return authError

  try {
    const { table } = await req.json()
    const safeTable = requireAllowedTable(table)

    const supabaseClient = createClient(
      // @ts-ignore: Deno global
      Deno.env.get('SUPABASE_URL') ?? '',
      // @ts-ignore: Deno global
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const counts: Record<string, number> = {}
    await Promise.all(
      STATUSES.map(async (status) => {
        const { count, error } = await supabaseClient
          .from(safeTable)
          .select('*', { head: true, count: 'exact' })
          .eq('verification_status', status)
        if (error) throw error
        counts[status] = count ?? 0
      })
    )

    return new Response(JSON.stringify(counts), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const error = err as Error
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
