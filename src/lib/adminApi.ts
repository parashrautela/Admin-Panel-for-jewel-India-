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
  aadhar_number: string;
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
  /** `wholesalers.business_name` of `referred_by`; null while unattributed or if that row is unreadable. */
  inviter_business_name: string | null;
}

export type SubmissionRecord = WholesalerRecord | RetailerRecord;

const LIST_COLUMNS = 'id, full_name, business_name, city, state, created_at, verification_status';
const RETAILER_LIST_COLUMNS = `${LIST_COLUMNS}, referred_by, referral_code`;

/**
 * The database refuses to move a retailer to 'verified' while `referred_by` is null
 * (see supabase/migrations/onboarding_three_doors.sql). This is what the admin sees instead.
 */
export const NO_INVITER_MESSAGE =
  'No invitation code yet — the retailer has to enter the code a wholesaler gave them before they can be approved.';
const NO_INVITER_DB_ERROR = 'RETAILER_HAS_NO_INVITER';

/** Retailer rows carry `referred_by` (null or a wholesaler id); wholesaler rows have no such column. */
export function isRetailerRecord(record: SubmissionRecord): record is RetailerRecord {
  return 'referred_by' in record;
}

/** "Invited by <Business name> · <CODE>", or a clear marker when no code has been entered yet. */
export function inviterLabel(retailer: RetailerRecord): string {
  if (!retailer.referred_by) return 'No inviter yet';
  const name = retailer.inviter_business_name || 'Unknown wholesaler';
  return retailer.referral_code ? `Invited by ${name} · ${retailer.referral_code}` : `Invited by ${name}`;
}

function getEntityTable(entity: ReviewEntity) {
  return ENTITY_TABLES[entity];
}

/**
 * Resolves each retailer's inviting wholesaler. A second query by id rather than an
 * embedded join, so it does not depend on the foreign key's name.
 */
async function attachInviters(retailers: RetailerRecord[]): Promise<RetailerRecord[]> {
  const ids = Array.from(new Set(
    retailers.map((retailer) => retailer.referred_by).filter((id): id is string => !!id)
  ));
  const names = new Map<string, string | null>();

  if (ids.length > 0) {
    const { data, error } = await supabase
      .from('wholesalers')
      .select('id, business_name')
      .in('id', ids);
    if (error) throw error;
    for (const wholesaler of data ?? []) {
      names.set(wholesaler.id, wholesaler.business_name ?? null);
    }
  }

  return retailers.map((retailer) => ({
    ...retailer,
    inviter_business_name: retailer.referred_by ? names.get(retailer.referred_by) ?? null : null
  }));
}

/**
 * Fetch stats counts for all statuses.
 * The PRD specifies counts for 'pending', 'on_hold', 'verified', 'banned'.
 */
export async function fetchStatusCounts(entity: ReviewEntity = 'wholesaler') {
  const statuses = ['pending', 'on_hold', 'verified', 'rejected', 'resubmission_required', 'banned'] as const;
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
  pageSize?: number
) {
  return fetchSubmissions('wholesaler', statusFilter, searchQuery, page, pageSize);
}

export async function fetchRetailers(
  statusFilter: string = 'all',
  searchQuery: string = '',
  page: number = 1,
  pageSize?: number
) {
  return fetchSubmissions('retailer', statusFilter, searchQuery, page, pageSize);
}

export async function fetchSubmissions(
  entity: ReviewEntity,
  statusFilter: string = 'all',
  searchQuery: string = '',
  page: number = 1,
  pageSize?: number
) {
  const table = getEntityTable(entity);
  // One literal per select(): supabase-js derives the row type from the column string.
  let query = (entity === 'retailer'
    ? supabase.from(table).select(RETAILER_LIST_COLUMNS, { count: 'exact' })
    : supabase.from(table).select(LIST_COLUMNS, { count: 'exact' })
  ).order('created_at', { ascending: false });

  if (pageSize && pageSize > 0) {
    query = query.range((page - 1) * pageSize, page * pageSize - 1);
  }

  if (statusFilter !== 'all') {
    query = query.eq('verification_status', statusFilter);
  }

  if (searchQuery) {
    query = query.or(`full_name.ilike.%${searchQuery}%,business_name.ilike.%${searchQuery}%`);
  }

  const { data, count, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as SubmissionRecord[];
  if (entity === 'retailer') {
    return { data: await attachInviters(rows as RetailerRecord[]), count };
  }
  return { data: rows, count };
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
  if (entity === 'retailer') {
    const [retailer] = await attachInviters([data as RetailerRecord]);
    return retailer;
  }
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
    if (error.message.includes(NO_INVITER_DB_ERROR)) {
      throw new Error(NO_INVITER_MESSAGE);
    }
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
