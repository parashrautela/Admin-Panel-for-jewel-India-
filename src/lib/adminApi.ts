import { supabase } from './supabase';

export type ReviewEntity = 'wholesaler' | 'retailer';
export type WholesalerStatus = 'pending' | 'verified' | 'rejected' | 'on_hold' | 'resubmission_required' | 'banned';

const ENTITY_TABLES: Record<ReviewEntity, string> = {
  wholesaler: 'wholesalers',
  retailer: 'retailers'
};

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

export interface RetailerRecord extends WholesalerRecord {
  referred_by: string | null;
  referral_code: string | null;
}

export type SubmissionRecord = WholesalerRecord | RetailerRecord;

function getEntityTable(entity: ReviewEntity) {
  return ENTITY_TABLES[entity];
}

/**
 * Fetch stats counts for all statuses.
 * The PRD specifies counts for 'pending', 'on_hold', 'verified', 'banned'.
 */
export async function fetchStatusCounts(entity: ReviewEntity = 'wholesaler') {
  const statuses = ['pending', 'on_hold', 'verified', 'banned'] as const;
  const table = getEntityTable(entity);
  
  const counts = await Promise.all(
    statuses.map(async (status) => {
      const { count, error } = await supabase
        .from(table)
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
  return fetchSubmissions('wholesaler', statusFilter, searchQuery, page, pageSize);
}

export async function fetchRetailers(
  statusFilter: string = 'all',
  searchQuery: string = '',
  page: number = 1,
  pageSize: number = 20
) {
  return fetchSubmissions('retailer', statusFilter, searchQuery, page, pageSize);
}

export async function fetchSubmissions(
  entity: ReviewEntity,
  statusFilter: string = 'all',
  searchQuery: string = '',
  page: number = 1,
  pageSize: number = 20
) {
  const table = getEntityTable(entity);
  let query = supabase
    .from(table)
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
  return fetchSubmissionDetail('wholesaler', wholesalerId) as WholesalerRecord;
}

export async function fetchRetailerDetail(retailerId: string) {
  return fetchSubmissionDetail('retailer', retailerId) as RetailerRecord;
}

export async function fetchSubmissionDetail(entity: ReviewEntity, submissionId: string) {
  const table = getEntityTable(entity);
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('id', submissionId)
    .single();

  if (error) throw error;
  return data as SubmissionRecord;
}

/**
 * Helper to update a wholesaler directly via the Superuser client.
 * This bypasses the need for the Edge Function and JWT auth for local testing.
 */
async function updateSubmissionStatus(entity: ReviewEntity, submissionId: string, payload: any) {
  const table = getEntityTable(entity);
  const { error } = await supabase
    .from(table)
    .update(payload)
    .eq('id', submissionId);

  if (error) {
    throw new Error(`Update failed: ${error.message}`);
  }
}

// === ADMIN ACTIONS ===

export async function verifySubmission(entity: ReviewEntity, submissionId: string) {
  await updateSubmissionStatus(entity, submissionId, {
    verification_status: 'verified',
    notification_message: "You're verified! You can now access your full dashboard.",
    notified: false
  });
}

export async function rejectSubmission(entity: ReviewEntity, submissionId: string, reason: string) {
  await updateSubmissionStatus(entity, submissionId, {
    verification_status: 'rejected',
    rejection_reason: reason || 'Review failed.',
    notification_message: `Verification failed. ${reason || 'Contact support.'}`,
    notified: false
  });
}

export async function requestResubmissionForSubmission(
  entity: ReviewEntity,
  submissionId: string,
  documents: string[],
  reason: string
) {
  await updateSubmissionStatus(entity, submissionId, {
    verification_status: 'resubmission_required',
    rejected_documents: documents || [],
    rejection_reason: reason || 'Please resubmit your documents.',
    notification_message: 'Some documents need to be resubmitted.',
    notified: false
  });
}

export async function putSubmissionOnHold(entity: ReviewEntity, submissionId: string, notes: string) {
  await updateSubmissionStatus(entity, submissionId, {
    verification_status: 'on_hold',
    admin_notes: notes || ''
  });
}

export async function banSubmission(entity: ReviewEntity, submissionId: string) {
  await updateSubmissionStatus(entity, submissionId, {
    verification_status: 'banned',
    notification_message: 'Your account has been suspended.'
  });
}

export async function saveSubmissionNotes(entity: ReviewEntity, submissionId: string, notes: string) {
  await updateSubmissionStatus(entity, submissionId, {
    admin_notes: notes || ''
  });
}

export async function verifyWholesaler(wholesalerId: string) {
  await verifySubmission('wholesaler', wholesalerId);
}

export async function verifyRetailer(retailerId: string) {
  await verifySubmission('retailer', retailerId);
}

export async function rejectWholesaler(wholesalerId: string, reason: string) {
  await rejectSubmission('wholesaler', wholesalerId, reason);
}

export async function rejectRetailer(retailerId: string, reason: string) {
  await rejectSubmission('retailer', retailerId, reason);
}

export async function requestResubmission(
  wholesalerId: string,
  documents: string[],
  reason: string
) {
  await requestResubmissionForSubmission('wholesaler', wholesalerId, documents, reason);
}

export async function requestRetailerResubmission(
  retailerId: string,
  documents: string[],
  reason: string
) {
  await requestResubmissionForSubmission('retailer', retailerId, documents, reason);
}

export async function putOnHold(wholesalerId: string, notes: string) {
  await putSubmissionOnHold('wholesaler', wholesalerId, notes);
}

export async function putRetailerOnHold(retailerId: string, notes: string) {
  await putSubmissionOnHold('retailer', retailerId, notes);
}

export async function banWholesaler(wholesalerId: string) {
  await banSubmission('wholesaler', wholesalerId);
}

export async function banRetailer(retailerId: string) {
  await banSubmission('retailer', retailerId);
}

export async function saveAdminNotes(wholesalerId: string, notes: string) {
  await saveSubmissionNotes('wholesaler', wholesalerId, notes);
}

export async function saveRetailerNotes(retailerId: string, notes: string) {
  await saveSubmissionNotes('retailer', retailerId, notes);
}
