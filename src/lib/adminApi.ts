import { adminInvoke } from './adminSession';

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

export const NO_INVITER_MESSAGE='No invitation code yet — the retailer has to enter their wholesaler invitation before approval.';
export function isRetailerRecord(record:SubmissionRecord):record is RetailerRecord {return 'referred_by' in record;}
export function inviterLabel(retailer:RetailerRecord):string {
 if(!retailer.referred_by)return 'No inviter yet';
 return `Invited by ${retailer.inviter_business_name || 'Wholesaler'} · ${retailer.referral_code || ''}`;
}
export async function fetchStatusCounts(entity:ReviewEntity='wholesaler') {
 return await adminInvoke('admin-fetch-status-counts',{table:ENTITY_TABLES[entity]}) as Record<string,number>;
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
  const rows=await adminInvoke('admin-fetch-submissions',{table:ENTITY_TABLES[entity],statusFilter:statusFilter==='all'?null:statusFilter,searchQuery}) as SubmissionRecord[];
  return {data:pageSize?rows.slice((page-1)*pageSize,page*pageSize):rows,count:rows.length};
}

/**
 * Fetch a single wholesaler record for the detail page.
 */
export async function fetchWholesalerDetail(wholesalerId: string) {
  return await fetchSubmissionDetail('wholesaler', wholesalerId) as WholesalerRecord;
}

export async function fetchRetailerDetail(retailerId: string) {
  return await fetchSubmissionDetail('retailer', retailerId) as RetailerRecord;
}

export async function fetchSubmissionDetail(entity:ReviewEntity,id:string):Promise<SubmissionRecord> {
 return adminInvoke('admin-fetch-submission-detail',{table:ENTITY_TABLES[entity],id});
}
export async function verifySubmission(entity:ReviewEntity,id:string) {await adminInvoke('admin-verify-submission',{table:ENTITY_TABLES[entity],id});}
export async function rejectSubmission(entity:ReviewEntity,id:string,reason:string) {await adminInvoke('admin-reject-submission',{table:ENTITY_TABLES[entity],id,reason});}
export async function requestResubmissionForSubmission(entity:ReviewEntity,id:string,documents:string[],reason:string) {await adminInvoke('admin-request-resubmission',{table:ENTITY_TABLES[entity],id,documents,reason});}
export async function putSubmissionOnHold(entity:ReviewEntity,id:string,notes:string) {await adminInvoke('admin-hold-submission',{table:ENTITY_TABLES[entity],id,notes});}
export async function banSubmission(entity:ReviewEntity,id:string) {await adminInvoke('admin-ban-submission',{table:ENTITY_TABLES[entity],id});}
export async function saveSubmissionNotes(entity:ReviewEntity,id:string,notes:string) {await adminInvoke('admin-save-notes',{table:ENTITY_TABLES[entity],id,notes});}

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

export interface CreditAllowanceItem {
  business_type?: ReviewEntity; business_id?: string;
  wholesaler_id: string; user_id: string; business_name: string; full_name: string; phone: string;
  verification_status: string; daily_allowance: number; is_custom: boolean; policy_version: number;
  last_reason?: string; policy_updated_at?: string; current_allowance: number | null; next_refill_at: string | null;
  recurring_available: number; gift_available: number; paid_available: number; available: number;
  lifetime_spent: number; lifetime_granted: number;
}
export interface CreditAllowanceResult {
  ok: boolean; items: CreditAllowanceItem[]; total_count: number; page: number; page_size: number;
  server_now: string; program_active: boolean; default_allowance: number;
}
export async function fetchCreditAllowances(search = '', page = 0, pageSize = 25, wholesalerId?: string, businessType: ReviewEntity = 'wholesaler') {
  return await adminInvoke('admin-credit-allowances', {
    action: 'list', search, page, pageSize, wholesaler_id: wholesalerId, business_type: businessType,
  }) as CreditAllowanceResult;
}
export interface AllowanceChange {
  business_type?: ReviewEntity; action: 'set_allowance' | 'reset_default'; wholesaler_id: string; daily_allowance?: number;
  reason: string; expected_version: number; request_key: string;
}
export async function saveCreditAllowance(change: AllowanceChange) {
  return await adminInvoke('admin-credit-allowances', change) as {
    ok: boolean; version: number; effective_at: string; next_allowance: number; program_active: boolean; replayed?: boolean;
  };
}
