// @ts-ignore: Deno import
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
// @ts-ignore: Deno import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { checkAdminAuth, requireAllowedTable } from "../_shared/adminAuth.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-password',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const authError = checkAdminAuth(req, corsHeaders)
  if (authError) return authError

  try {
    const { table, statusFilter, searchQuery } = await req.json()
    const safeTable = requireAllowedTable(table)

    const supabaseClient = createClient(
      // @ts-ignore: Deno global
      Deno.env.get('SUPABASE_URL') ?? '',
      // @ts-ignore: Deno global
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    let query = supabaseClient
      .from(safeTable)
      .select('id, full_name, business_name, city, state, created_at, verification_status')

    if (statusFilter) {
      query = query.eq('verification_status', statusFilter)
    }

    const search = typeof searchQuery === 'string' ? searchQuery.trim() : ''
    if (search) {
      query = query.or(`full_name.ilike.%${search}%,business_name.ilike.%${search}%`)
    }

    const { data, error } = await query.order('created_at', { ascending: false })
    if (error) throw error

    return new Response(JSON.stringify(data ?? []), {
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
