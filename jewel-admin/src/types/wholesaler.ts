export type VerificationStatus =
  | 'pending'
  | 'verified'
  | 'rejected'
  | 'on_hold'
  | 'resubmission_required'
  | 'banned';

export interface Wholesaler {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  business_name: string;
  state: string;
  city: string;
  aadhar_number: string;
  aadhaar_front_url: string;
  aadhaar_back_url: string;
  pan_card_url: string;
  gst_certificate_url: string;
  business_logo_url: string;
  verification_status: VerificationStatus;
  rejection_reason: string | null;
  rejected_documents: string[] | null;
  admin_notes: string | null;
  notification_message: string | null;
  notified: boolean;
  created_at: string;
  updated_at: string;
}
