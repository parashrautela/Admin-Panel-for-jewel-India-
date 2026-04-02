// @ts-ignore: Deno import
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
// @ts-ignore: Deno import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      // @ts-ignore: Deno global
      Deno.env.get('SUPABASE_URL') ?? '',
      // @ts-ignore: Deno global
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { id } = await req.json()
    if (!id) throw new Error('Missing wholesaler ID')

    const { error } = await supabaseClient
      .from('wholesalers')
      .update({
        verification_status: 'banned',
        notified: false,
        notification_message: 'Your account has been permanently suspended.',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

    if (error) throw error

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const error = err as Error;
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
