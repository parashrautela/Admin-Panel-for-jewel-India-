// @ts-ignore: Deno import
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { checkAdminAuth } from "../_shared/adminAuth.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-password',
}

// Login-only endpoint: does no data work, just confirms the password is
// correct so the app can show the dashboard.
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const authError = checkAdminAuth(req, corsHeaders)
  if (authError) return authError

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
