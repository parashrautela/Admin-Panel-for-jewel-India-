import { supabase } from './supabase';

export type WholesalerStatus = 'pending' | 'verified' | 'rejected' | 'on_hold' | 'resubmission_required' | 'banned';

export interface WholesalerRecord {
  id: string;
  full_name: string;
  business_name: string;
  city: string;
  state: string;
  verification_status: WholesalerStatus;
  created_at: string;
  aadhaar_number: string;
  aadhaar_front_url: string;
  aadhaar_back_url: string;
  business_logo_url: string;
  pan_card_url: string;
  gst_certificate_url: string;
  admin_notes: string;
  rejection_reason: string;
  rejected_documents: string[];
}

/**
 * Fetch stats counts for all statuses.
 * The PRD specifies counts for 'pending', 'on_hold', 'verified', 'banned'.
 */
export async function fetchStatusCounts() {
  const statuses = ['pending', 'on_hold', 'verified', 'banned'] as const;
  
  const counts = await Promise.all(
    statuses.map(async (status) => {
      const { count, error } = await supabase
        .from('wholesalers')
        .select('*', { count: 'exact', head: true })
        .eq('verification_status', status);
      
      if (error) throw new Error(`Could not fetch stats for ${status}`);
      return { status, count: count || 0 };
    })
  );

  return counts.reduce((acc, { status, count }) => {
    acc[status] = count;
    return acc;
  }, {} as Record<string, number>);
}

/**
 * Fetch all wholesalers for the dashboard with optional filter & search.
 */
export async function fetchWholesalers(
  statusFilter: string = 'all',
  searchQuery: string = '',
  page: number = 1,
  pageSize: number = 20
) {
  let query = supabase
    .from('wholesalers')
    .select(`
      id,
      full_name,
      business_name,
      city,
      state,
      created_at,
      verification_status
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (statusFilter !== 'all') {
    query = query.eq('verification_status', statusFilter);
  }

  if (searchQuery) {
    query = query.or(`full_name.ilike.%${searchQuery}%,business_name.ilike.%${searchQuery}%`);
  }

  const { data, count, error } = await query;
  if (error) throw error;
  
  return { data, count };
}

/**
 * Fetch a single wholesaler record for the detail page.
 */
export async function fetchWholesalerDetail(wholesalerId: string) {
  const { data, error } = await supabase
    .from('wholesalers')
    .select('*')
    .eq('id', wholesalerId)
    .single();

  if (error) throw error;
  return data as WholesalerRecord;
}

/**
 * Helper to update a wholesaler directly via the Superuser client.
 * This bypasses the need for the Edge Function and JWT auth for local testing.
 */
async function updateWholesalerStatus(wholesalerId: string, payload: any) {
  const { error } = await supabase
    .from('wholesalers')
    .update(payload)
    .eq('id', wholesalerId);

  if (error) {
    throw new Error(`Update failed: ${error.message}`);
  }
}

// === ADMIN ACTIONS ===

export async function verifyWholesaler(wholesalerId: string) {
  await updateWholesalerStatus(wholesalerId, {
    verification_status: 'verified',
    notification_message: "You're verified! You can now access your full dashboard.",
    notified: false
  });
}

export async function rejectWholesaler(wholesalerId: string, reason: string) {
  await updateWholesalerStatus(wholesalerId, {
    verification_status: 'rejected',
    rejection_reason: reason || 'Review failed.',
    notification_message: `Verification failed. ${reason || 'Contact support.'}`,
    notified: false
  });
}

export async function requestResubmission(
  wholesalerId: string,
  documents: string[],
  reason: string
) {
  await updateWholesalerStatus(wholesalerId, {
    verification_status: 'resubmission_required',
    rejected_documents: documents || [],
    rejection_reason: reason || 'Please resubmit your documents.',
    notification_message: 'Some documents need to be resubmitted.',
    notified: false
  });
}

export async function putOnHold(wholesalerId: string, notes: string) {
  await updateWholesalerStatus(wholesalerId, {
    verification_status: 'on_hold',
    admin_notes: notes || ''
  });
}

export async function banWholesaler(wholesalerId: string) {
  await updateWholesalerStatus(wholesalerId, {
    verification_status: 'banned',
    notification_message: 'Your account has been suspended.'
  });
}

export async function saveAdminNotes(wholesalerId: string, notes: string) {
  await updateWholesalerStatus(wholesalerId, {
    admin_notes: notes || ''
  });
}
