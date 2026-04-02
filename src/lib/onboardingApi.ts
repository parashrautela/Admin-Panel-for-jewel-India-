import { supabase } from './supabase';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png'];

/**
 * Validates a file before upload.
 * Throws an error if invalid.
 */
function validateFile(file: File) {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File ${file.name} is too large. Max size is 10MB.`);
  }
  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    throw new Error(`File ${file.name} has wrong file type. Please upload a JPG or PNG.`);
  }
}

/**
 * Uploads a validated file to a specific Supabase storage bucket.
 * Uses upsert to overwrite existing files if user resubmits.
 */
async function uploadFileToSupabase(
  bucket: string,
  userId: string,
  fileName: string,
  file: File
): Promise<string> {
  validateFile(file);

  const filePath = `${userId}/${fileName}`;

  const { error } = await supabase.storage.from(bucket).upload(filePath, file, {
    upsert: true,
  });

  if (error) {
    throw new Error(`Upload failed for ${file.name}: ${error.message}`);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(filePath);

  return publicUrl;
}

/**
 * Step 1: Personal Details
 * Uploads Aadhaar Front and Back and creates the initial wholesaler DB record.
 */
export async function saveStep1(
  fullName: string,
  aadhaarNumber: string,
  aadhaarFront: File,
  aadhaarBack: File,
  userId: string
) {
  const frontUrl = await uploadFileToSupabase('aadhaar-documents', userId, 'aadhaar_front.jpg', aadhaarFront);
  const backUrl = await uploadFileToSupabase('aadhaar-documents', userId, 'aadhaar_back.jpg', aadhaarBack);

  const { error } = await supabase.from('wholesalers').upsert({
    id: userId,
    full_name: fullName,
    aadhaar_number: aadhaarNumber,
    aadhaar_front_url: frontUrl,
    aadhaar_back_url: backUrl,
    verification_status: 'pending',
    onboarding_step_completed: 1, // Track completion
  });

  if (error) throw new Error(`Database error saving Step 1: ${error.message}`);
}

/**
 * Step 2: Business Details
 * Uploads Logo and updates the existing wholesaler DB record.
 */
export async function saveStep2(
  businessName: string,
  state: string,
  city: string,
  businessLogo: File,
  userId: string
) {
  const logoUrl = await uploadFileToSupabase('business-logos', userId, 'logo.jpg', businessLogo);

  const { error } = await supabase
    .from('wholesalers')
    .update({
      business_name: businessName,
      state,
      city,
      business_logo_url: logoUrl,
      onboarding_step_completed: 2, // Track completion
    })
    .eq('id', userId);

  if (error) throw new Error(`Database error saving Step 2: ${error.message}`);
}

/**
 * Step 3: Verification Documents
 * Uploads PAN and GST cert and sets final status to pending.
 */
export async function saveStep3(
  panCard: File,
  gstCertificate: File,
  userId: string
) {
  const panUrl = await uploadFileToSupabase('pan-documents', userId, 'pan.jpg', panCard);
  const gstUrl = await uploadFileToSupabase('gst-documents', userId, 'gst.jpg', gstCertificate);

  const { error } = await supabase
    .from('wholesalers')
    .update({
      pan_card_url: panUrl,
      gst_certificate_url: gstUrl,
      verification_status: 'pending', // Re-assert in case it was rejected before
      onboarding_step_completed: 3, // Complete!
    })
    .eq('id', userId);

  if (error) throw new Error(`Database error saving Step 3: ${error.message}`);
}

/**
 * Fetches the specific Wholesaler's Verification Status for the Frontend Realtime screen.
 */
export async function fetchVerificationStatus(userId: string) {
  const { data, error } = await supabase
    .from('wholesalers')
    .select(`
      verification_status,
      notification_message,
      rejection_reason,
      rejected_documents,
      onboarding_step_completed
    `)
    .eq('id', userId)
    .single();

  if (error) throw new Error(`Could not fetch status: ${error.message}`);
  return data;
}

/**
 * Marks a notification banner as read for the user.
 */
export async function markNotificationAsRead(userId: string) {
  const { error } = await supabase
    .from('wholesalers')
    .update({ notified: true })
    .eq('id', userId);

  if (error) throw new Error(`Could not mark notification read: ${error.message}`);
}
