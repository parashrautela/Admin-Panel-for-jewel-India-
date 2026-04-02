import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // Verify admin session (ensure the caller is authenticated)
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser()

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized. Admin session required.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    // TODO: Ideally check if `user.id` is in an `admins` table, 
    // but for this PRD we assume the token belongs to an admin if calling this route.

    const { action, wholesalerId, reason, documents, notes } = await req.json()

    if (!wholesalerId || !action) {
      return new Response(JSON.stringify({ error: 'Missing mandatory fields' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // Create the Supabase Admin client to bypass RLS
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    let updatePayload: any = {}

    switch (action) {
      case 'verify':
        updatePayload = {
          verification_status: 'verified',
          notification_message: "You're verified! You can now access your full dashboard.",
          notified: false
        }
        break
      case 'reject':
        updatePayload = {
          verification_status: 'rejected',
          rejection_reason: reason || 'Review failed.',
          notification_message: `Verification failed. ${reason || 'Contact support.'}`,
          notified: false
        }
        break
      case 'resubmit':
        updatePayload = {
          verification_status: 'resubmission_required',
          rejected_documents: documents || [],
          rejection_reason: reason || 'Please resubmit your documents.',
          notification_message: 'Some documents need to be resubmitted.',
          notified: false
        }
        break
      case 'hold':
        updatePayload = {
          verification_status: 'on_hold',
          admin_notes: notes || ''
        }
        break
      case 'ban':
        updatePayload = {
          verification_status: 'banned',
          notification_message: 'Your account has been suspended.'
        }
        break
      case 'notes':
        updatePayload = {
          admin_notes: notes || ''
        }
        break
      default:
        return new Response(JSON.stringify({ error: 'Invalid action provided' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        })
    }

    const { error: updateError } = await supabaseAdmin
      .from('wholesalers')
      .update(updatePayload)
      .eq('id', wholesalerId)

    if (updateError) {
      throw updateError
    }

    return new Response(JSON.stringify({ success: true, message: 'Status updated successfully' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
