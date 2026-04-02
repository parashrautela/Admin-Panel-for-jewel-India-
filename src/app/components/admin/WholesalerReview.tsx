import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router';
import { ArrowLeft, ExternalLink, Check, Pause, RotateCcw, X, Ban, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchWholesalerDetail,
  verifyWholesaler,
  rejectWholesaler,
  putOnHold,
  banWholesaler,
  requestResubmission,
  saveAdminNotes,
  type WholesalerRecord,
  type WholesalerStatus
} from '../../../lib/adminApi';

export function WholesalerReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [wholesaler, setWholesaler] = useState<WholesalerRecord | null>(null);
  const [loading, setLoading] = useState(true);

  const [showResubmission, setShowResubmission] = useState(false);
  const [showRejection, setShowRejection] = useState(false);
  const [showBanModal, setShowBanModal] = useState(false);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [resubmissionReason, setResubmissionReason] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionNotes, setRejectionNotes] = useState('');
  const [adminNotes, setAdminNotes] = useState('');

  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    async function loadWholesaler() {
      if (!id) return;
      setLoading(true);
      try {
        const data = await fetchWholesalerDetail(id);
        setWholesaler(data);
        setAdminNotes(data.admin_notes || '');
      } catch (err) {
        console.error(err);
        toast.error('Failed to load wholesaler details');
      } finally {
        setLoading(false);
      }
    }
    loadWholesaler();
  }, [id]);

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading Wholesaler data...</div>;
  }

  if (!wholesaler) {
    return <div className="p-8 text-center text-red-500">Wholesaler not found</div>;
  }

  const getStatusBadge = (status: WholesalerStatus) => {
    const badges: Record<WholesalerStatus, string> = {
      pending: 'bg-gray-100 text-gray-900',
      on_hold: 'bg-blue-100 text-blue-900',
      verified: 'bg-black text-white',
      resubmission_required: 'bg-yellow-100 text-yellow-900',
      rejected: 'bg-red-100 text-red-900',
      banned: 'bg-black text-white'
    };

    const labels: Record<WholesalerStatus, string> = {
      pending: 'Pending',
      on_hold: 'On Hold',
      verified: 'Verified',
      resubmission_required: 'Resubmission',
      rejected: 'Rejected',
      banned: 'Banned'
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${badges[status]}`}>
        {labels[status]}
      </span>
    );
  };

  const DocumentCard = ({ url, label }: { url: string; label: string }) => (
    <div className="bg-gray-50 rounded-lg p-5 border border-gray-100">
      <div className="font-medium text-sm mb-3 text-gray-900">{label}</div>
      <div className="bg-white rounded-lg p-4 border border-gray-200">
        <div className="h-40 bg-gray-100 rounded-lg mb-3 flex items-center justify-center overflow-hidden">
          {url ? (
            <img src={url} alt={label} className="object-cover w-full h-full" />
          ) : (
            <span className="text-gray-400 text-sm">Not provided</span>
          )}
        </div>
        <div className="text-sm text-gray-900 mb-1 font-medium truncate">{label}.jpg</div>
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-black text-sm flex items-center gap-1.5 hover:text-gray-600 font-medium">
            <ExternalLink className="w-4 h-4" />
            View full size
          </a>
        )}
      </div>
    </div>
  );

  const handleDocumentToggle = (docName: string) => {
    setSelectedDocuments(prev => 
      prev.includes(docName) 
        ? prev.filter(d => d !== docName)
        : [...prev, docName]
    );
  };

  const wrapAction = async (action: () => Promise<void>) => {
    setActionLoading(true);
    try {
      await action();
      toast.success('Status updated successfully');
      navigate('/');
    } catch (err: any) {
      toast.error(err.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-8 py-10">
        <div className="grid grid-cols-3 gap-10">
          {/* Left Column - Wholesaler Info */}
          <div className="col-span-2">
            {/* Header */}
            <Link to="/" className="inline-flex items-center gap-2 text-black hover:text-gray-600 mb-6 font-medium">
              <ArrowLeft className="w-4 h-4" />
              Back
            </Link>

            <div className="mb-10">
              <h1 className="text-3xl font-light mb-3">{wholesaler.full_name}</h1>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span>{new Date(wholesaler.created_at).toLocaleDateString()}</span>
                <span>•</span>
                <span className="truncate max-w-[150px]">{wholesaler.id}</span>
                <span className="ml-2">{getStatusBadge(wholesaler.verification_status)}</span>
              </div>
            </div>

            {/* Personal Details */}
            <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-8 mb-6">
              <h2 className="text-lg font-medium mb-6">Personal Details</h2>
              <div className="bg-gray-50 rounded-lg p-6 mb-6">
                <div className="grid grid-cols-2 gap-6 mb-4">
                  <div>
                    <div className="text-xs text-gray-500 mb-1.5 uppercase tracking-wide">Full Name</div>
                    <div className="font-medium text-gray-900">{wholesaler.full_name}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1.5 uppercase tracking-wide">Aadhaar Number</div>
                    <div className="font-medium text-gray-900">{wholesaler.aadhaar_number || 'N/A'}</div>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1.5 uppercase tracking-wide">Submitted</div>
                  <div className="font-medium text-gray-900">{new Date(wholesaler.created_at).toLocaleString()}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-5">
                <DocumentCard url={wholesaler.aadhaar_front_url} label="Aadhaar Front" />
                <DocumentCard url={wholesaler.aadhaar_back_url} label="Aadhaar Back" />
              </div>
            </div>

            {/* Business Details */}
            <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-8 mb-6">
              <h2 className="text-lg font-medium mb-6">Business Details</h2>
              <div className="bg-gray-50 rounded-lg p-6 mb-6">
                <div className="grid grid-cols-2 gap-6 mb-4">
                  <div>
                    <div className="text-xs text-gray-500 mb-1.5 uppercase tracking-wide">Business Name</div>
                    <div className="font-medium text-gray-900">{wholesaler.business_name}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1.5 uppercase tracking-wide">State</div>
                    <div className="font-medium text-gray-900">{wholesaler.state}</div>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1.5 uppercase tracking-wide">City</div>
                  <div className="font-medium text-gray-900">{wholesaler.city}</div>
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-3 uppercase tracking-wide">Business Logo</div>
                {wholesaler.business_logo_url ? (
                  <div className="flex flex-col items-start gap-3">
                    <img src={wholesaler.business_logo_url} className="w-16 h-16 rounded-full object-cover border" alt="Logo" />
                    <a href={wholesaler.business_logo_url} target="_blank" rel="noopener noreferrer" className="text-black text-sm flex items-center gap-1.5 hover:text-gray-600 font-medium">
                      <ExternalLink className="w-4 h-4" />
                      View full size
                    </a>
                  </div>
                ) : (
                  <div className="w-16 h-16 bg-gray-900 rounded-full flex items-center justify-center text-white text-xl font-medium">
                    {wholesaler.full_name?.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            </div>

            {/* Verification Documents */}
            <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-8">
              <h2 className="text-lg font-medium mb-6">Verification Documents</h2>
              <div className="grid grid-cols-2 gap-5">
                <DocumentCard url={wholesaler.pan_card_url} label="PAN Card" />
                <DocumentCard url={wholesaler.gst_certificate_url} label="GST Certificate" />
              </div>
            </div>
          </div>

          {/* Right Column - Admin Action Panel */}
          <div className="col-span-1">
            <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-6 sticky top-8">
              <h2 className="text-lg font-medium mb-2">Actions</h2>
              <p className="text-sm text-gray-500 mb-8">Review all documents before taking action</p>

              <fieldset disabled={actionLoading} className="space-y-3">
                {/* Verify & Approve */}
                <div>
                  <button 
                    onClick={() => wrapAction(() => verifyWholesaler(wholesaler.id))}
                    className="w-full bg-black hover:bg-gray-800 text-white py-3.5 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    <Check className="w-5 h-5" />
                    Verify & Approve
                  </button>
                  <p className="text-xs text-gray-500 mt-2 px-1">Wholesaler gets immediate access</p>
                </div>

                {/* Put On Hold */}
                <div>
                  <button 
                    onClick={() => wrapAction(() => putOnHold(wholesaler.id, adminNotes))}
                    className="w-full border border-gray-300 text-gray-900 hover:bg-gray-50 py-3.5 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    <Pause className="w-5 h-5" />
                    Put On Hold
                  </button>
                  <p className="text-xs text-gray-500 mt-2 px-1">Flag for further review</p>
                </div>

                {/* Request Resubmission */}
                <div>
                  <button 
                    onClick={() => setShowResubmission(!showResubmission)}
                    className="w-full border border-gray-300 text-gray-900 hover:bg-gray-50 py-3.5 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
                  >
                    <RotateCcw className="w-5 h-5" />
                    Request Resubmission
                  </button>
                  <p className="text-xs text-gray-500 mt-2 px-1">Request specific documents</p>
                  
                  {showResubmission && (
                    <div className="mt-4 p-5 bg-gray-50 rounded-lg border border-gray-200">
                      <p className="text-sm font-medium mb-4">Select documents to resubmit:</p>
                      <div className="space-y-2.5 mb-4">
                        {['Aadhaar Front', 'Aadhaar Back', 'PAN Card', 'GST Certificate'].map(doc => (
                          <label key={doc} className="flex items-center gap-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedDocuments.includes(doc)}
                              onChange={() => handleDocumentToggle(doc)}
                              className="w-4 h-4 rounded border-gray-300"
                            />
                            <span className="text-sm">{doc}</span>
                          </label>
                        ))}
                      </div>
                      <label className="block text-sm font-medium mb-2">
                        Reason (required)
                      </label>
                      <textarea
                        value={resubmissionReason}
                        onChange={(e) => setResubmissionReason(e.target.value)}
                        placeholder="Explain what needs to be corrected..."
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-black"
                        rows={3}
                      />
                      <button 
                        onClick={() => wrapAction(() => requestResubmission(wholesaler.id, selectedDocuments, resubmissionReason))}
                        disabled={!resubmissionReason || selectedDocuments.length === 0}
                        className="w-full mt-4 bg-black hover:bg-gray-800 text-white py-2.5 px-4 rounded-lg font-medium text-sm disabled:opacity-50"
                      >
                        Send Request
                      </button>
                    </div>
                  )}
                </div>

                <div className="border-t border-gray-200 my-5"></div>

                {/* Reject Application */}
                <div>
                  <button 
                    onClick={() => setShowRejection(!showRejection)}
                    className="w-full border border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white py-3.5 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
                  >
                    <X className="w-5 h-5" />
                    Reject Application
                  </button>
                  
                  {showRejection && (
                    <div className="mt-4 p-5 bg-gray-50 rounded-lg border border-gray-200">
                      <p className="text-sm font-medium mb-4">Select rejection reason:</p>
                      <div className="space-y-2.5 mb-4">
                        {[
                          'Documents appear fraudulent or tampered',
                          'Business does not exist or unverifiable',
                          'Aadhaar details do not match business name',
                          'GST number is invalid or expired',
                          'PAN card does not match submitted details',
                          'Incomplete submission — missing documents',
                          'Duplicate account detected',
                          'Other (specify below)'
                        ].map(reason => (
                          <label key={reason} className="flex items-start gap-2.5 cursor-pointer">
                            <input
                              type="radio"
                              name="rejection"
                              value={reason}
                              checked={rejectionReason === reason}
                              onChange={(e) => setRejectionReason(e.target.value)}
                              className="mt-0.5 w-4 h-4"
                            />
                            <span className="text-sm leading-relaxed">{reason}</span>
                          </label>
                        ))}
                      </div>
                      <label className="block text-sm font-medium mb-2">
                        Additional notes (optional)
                      </label>
                      <textarea
                        value={rejectionNotes}
                        onChange={(e) => setRejectionNotes(e.target.value)}
                        placeholder="Add context..."
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-black"
                        rows={3}
                      />
                      <button 
                        onClick={() => wrapAction(() => rejectWholesaler(wholesaler.id, rejectionReason + (rejectionNotes ? ` - ${rejectionNotes}` : '')))}
                        disabled={!rejectionReason}
                        className="w-full mt-4 bg-black hover:bg-gray-800 text-white py-2.5 px-4 rounded-lg font-medium text-sm disabled:opacity-50"
                      >
                        Confirm Rejection
                      </button>
                    </div>
                  )}
                </div>

                {/* Ban Permanently */}
                <div className="text-center pt-3">
                  <button 
                    onClick={() => setShowBanModal(true)}
                    className="text-gray-900 hover:text-gray-600 text-sm font-medium flex items-center justify-center gap-1.5 mx-auto"
                  >
                    <Ban className="w-4 h-4" />
                    Ban Permanently
                  </button>
                </div>

                {/* Admin Notes */}
                <div className="mt-8 pt-6 border-t border-gray-200">
                  <label className="block text-sm font-medium mb-3">
                    Internal notes
                  </label>
                  <textarea
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Add notes (not visible to wholesaler)..."
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-black bg-gray-50"
                    rows={4}
                  />
                  <button 
                    onClick={async () => {
                      setActionLoading(true);
                      try {
                        await saveAdminNotes(wholesaler.id, adminNotes);
                        toast.success("Notes saved");
                      } catch (err: any) {
                        toast.error("Failed to save notes");
                      } finally {
                        setActionLoading(false);
                      }
                    }}
                    className="text-sm text-black hover:text-gray-600 mt-3 font-medium disabled:opacity-50"
                  >
                    Save note
                  </button>
                </div>
              </fieldset>
            </div>
          </div>
        </div>
      </div>

      {/* Ban Confirmation Modal */}
      {showBanModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-6 h-6 text-gray-900" />
              </div>
              <div>
                <h3 className="text-xl font-medium mb-2">Are you sure?</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  This will permanently ban {wholesaler.full_name} from the platform. This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setShowBanModal(false)}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => wrapAction(() => banWholesaler(wholesaler.id))}
                className="flex-1 px-4 py-3 bg-black text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
                disabled={actionLoading}
              >
                Yes, Ban User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}