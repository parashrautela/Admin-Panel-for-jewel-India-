import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Wholesaler } from '../types/wholesaler';
import { Badge } from './Badge';

interface WholesalerDetailProps {
  wholesaler: Wholesaler;
  onBack: () => void;
  onActionComplete: () => void;
}

type ModalType = 'hold' | 'resubmit' | 'reject' | 'ban' | null;

export const WholesalerDetail: React.FC<WholesalerDetailProps> = ({
  wholesaler,
  onBack,
  onActionComplete,
}) => {
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState(wholesaler.admin_notes || '');
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  useEffect(() => {
    setNotes(wholesaler.admin_notes || '');
  }, [wholesaler.admin_notes]);

  const callEdgeFunction = async (functionName: string, body: object) => {
    setIsProcessing(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify(body),
        }
      );

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || `Failed to call ${functionName}`);
      }
      onActionComplete();
      setActiveModal(null);
      setReason('');
    } catch (error) {
      console.error(error);
      alert('Action failed. See console for details.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApprove = () => callEdgeFunction('approve-wholesaler', { id: wholesaler.id });
  const handleHold = () => callEdgeFunction('hold-wholesaler', { id: wholesaler.id, reason });
  const handleResubmit = () => callEdgeFunction('request-resubmission', { id: wholesaler.id, reason });
  const handleReject = () => callEdgeFunction('reject-wholesaler', { id: wholesaler.id, reason });
  const handleBan = () => callEdgeFunction('ban-wholesaler', { id: wholesaler.id });

  const saveNotes = async () => {
    setIsSavingNote(true);
    try {
      const { error } = await supabase
        .from('wholesalers')
        .update({ admin_notes: notes })
        .eq('id', wholesaler.id);
      if (error) throw error;
      alert('Internal notes saved successfully.');
    } catch (error) {
      console.error(error);
      alert('Failed to save notes.');
    } finally {
      setIsSavingNote(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const DocumentImage = ({ url, title }: { url: string; title: string }) => {
    if (!url) return <div className="p-4 bg-gray-50 border border-gray-200 text-sm italic text-gray-500">Not provided</div>;
    return (
      <div className="space-y-2">
        <div 
          className="border border-gray-200 cursor-pointer hover:border-black transition-colors overflow-hidden group relative bg-gray-50"
          onClick={() => setLightboxImage(url)}
        >
          <img src={url} alt={title} className="w-full h-48 object-cover" />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <span className="text-white font-medium text-sm border border-white px-3 py-1 bg-black/50">View</span>
          </div>
        </div>
        <a href={url} target="_blank" rel="noreferrer" className="text-xs text-black border-b border-black font-medium hover:text-gray-600 transition-colors inline-block">
          Open in new tab ↗
        </a>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full w-full max-w-6xl mx-auto p-4 sm:p-8 bg-white min-h-screen">
      <button
        onClick={onBack}
        className="self-start mb-6 text-sm font-semibold uppercase tracking-widest text-black border border-black px-4 py-2 hover:bg-black hover:text-white transition-colors"
      >
        ← Back to List
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Profile & Documents */}
        <div className="lg:col-span-2 space-y-8">
          <div className="p-6 border border-gray-200">
            <div className="flex items-start gap-6">
              <div className="w-24 h-24 shrink-0 bg-gray-100 flex items-center justify-center border border-gray-200 overflow-hidden">
                {wholesaler.business_logo_url ? (
                  <img src={wholesaler.business_logo_url} alt="Logo" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-gray-400 text-xs text-center uppercase font-bold tracking-widest">No<br/>Logo</span>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <h1 className="text-3xl font-bold tracking-tight text-black m-0 leading-none">{wholesaler.business_name}</h1>
                  <Badge status={wholesaler.verification_status} />
                </div>
                <p className="text-gray-600 font-medium">{wholesaler.full_name} • {wholesaler.email}</p>
                <div className="text-sm text-gray-500 space-y-1 mt-2">
                  <p><strong>Location:</strong> {wholesaler.city}, {wholesaler.state}</p>
                  <p><strong>Aadhaar:</strong> {wholesaler.aadhar_number}</p>
                  <p><strong>Submitted:</strong> {formatDate(wholesaler.created_at)}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4 border border-gray-200 p-6">
            <h2 className="text-xl font-bold border-b border-gray-200 pb-2 mb-6">Documents</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div><h3 className="font-semibold text-sm uppercase tracking-wider mb-3">Aadhaar Front</h3><DocumentImage url={wholesaler.aadhaar_front_url} title="Aadhaar Front" /></div>
              <div><h3 className="font-semibold text-sm uppercase tracking-wider mb-3">Aadhaar Back</h3><DocumentImage url={wholesaler.aadhaar_back_url} title="Aadhaar Back" /></div>
              <div><h3 className="font-semibold text-sm uppercase tracking-wider mb-3">PAN Card</h3><DocumentImage url={wholesaler.pan_card_url} title="PAN Card" /></div>
              <div><h3 className="font-semibold text-sm uppercase tracking-wider mb-3">GST Certificate</h3><DocumentImage url={wholesaler.gst_certificate_url} title="GST" /></div>
            </div>
          </div>
        </div>

        {/* Right Column: Actions */}
        <div className="space-y-6">
          <div className="border border-gray-200 p-6 space-y-4 config-panel">
            <h2 className="text-lg font-bold border-b border-gray-200 pb-2 mb-4 uppercase tracking-wider">Actions</h2>
            
            <button
              onClick={handleApprove}
              disabled={isProcessing || wholesaler.verification_status === 'verified'}
              className="w-full text-left px-4 py-3 font-semibold text-white bg-black hover:bg-gray-800 disabled:bg-gray-300 disabled:text-gray-500 transition-colors"
            >
              Verify & Approve
            </button>
            
            <button
              onClick={() => setActiveModal('hold')}
              disabled={isProcessing || wholesaler.verification_status === 'on_hold'}
              className="w-full text-left px-4 py-3 font-semibold text-black border border-black hover:bg-gray-50 disabled:border-gray-300 disabled:text-gray-400 disabled:bg-white transition-colors"
            >
              Put On Hold
            </button>
            
            <button
              onClick={() => setActiveModal('resubmit')}
              disabled={isProcessing}
              className="w-full text-left px-4 py-3 font-semibold text-black border border-black hover:bg-amber-50 disabled:border-gray-300 disabled:text-gray-400 disabled:bg-white transition-colors"
            >
              Request Resubmission
            </button>
            
            <button
              onClick={() => setActiveModal('reject')}
              disabled={isProcessing || wholesaler.verification_status === 'rejected'}
              className="w-full text-left px-4 py-3 font-semibold text-red-700 border border-red-700 hover:bg-red-50 disabled:border-gray-300 disabled:text-gray-400 disabled:bg-white transition-colors"
            >
              Reject Application
            </button>
            
            <button
              onClick={() => setActiveModal('ban')}
              disabled={isProcessing || wholesaler.verification_status === 'banned'}
              className="w-full mt-8 opacity-75 text-left px-4 py-3 font-bold text-white bg-red-600 hover:bg-red-700 hover:opacity-100 transition-all border border-red-800"
            >
              Ban Permanently
            </button>
          </div>

          <div className="border border-gray-200 p-6 space-y-4 bg-gray-50">
            <h2 className="text-lg font-bold uppercase tracking-wider">Internal Notes</h2>
            <p className="text-xs text-gray-500 italic mb-2">Never visible to the wholesaler.</p>
            <textarea
              className="w-full p-3 border border-gray-300 bg-white focus:outline-none focus:border-black resize-y min-h-[150px] text-sm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add investigator notes..."
            />
            <button
              onClick={saveNotes}
              disabled={isSavingNote}
              className="w-full px-4 py-2 text-sm font-semibold uppercase tracking-widest text-black border border-black hover:bg-black hover:text-white transition-colors disabled:opacity-50"
            >
              {isSavingNote ? 'Saving...' : 'Save Note'}
            </button>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxImage && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setLightboxImage(null)}
        >
          <div className="relative max-w-5xl w-full h-full flex items-center justify-center bg-transparent p-4 lg:p-12">
            <button 
              className="absolute top-6 right-6 text-white text-xl font-bold border-2 border-white px-4 py-2 hover:bg-white hover:text-black transition-colors"
              onClick={() => setLightboxImage(null)}
            >
              CLOSE
            </button>
            <img 
              src={lightboxImage} 
              alt="Document full view" 
              className="max-w-full max-h-full object-contain shadow-2xl bg-white p-2"
              onClick={(e) => e.stopPropagation()} 
            />
          </div>
        </div>
      )}

      {/* Action Modals */}
      {activeModal && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white p-8 max-w-md w-full border border-gray-300 shadow-2xl">
            {activeModal === 'hold' && (
              <>
                <h3 className="text-xl font-bold uppercase tracking-wider mb-2">Put On Hold</h3>
                <p className="text-sm text-gray-600 mb-4">You can optionally provide a reason for the hold flag.</p>
                <textarea
                  className="w-full p-3 border border-gray-300 mb-6 min-h-[100px] text-sm focus:outline-none focus:border-black"
                  placeholder="Optional reason..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </>
            )}
            {activeModal === 'resubmit' && (
              <>
                <h3 className="text-xl font-bold uppercase tracking-wider mb-2">Request Resubmission</h3>
                <p className="text-sm text-gray-600 mb-4">Required: Provide clear instructions for what needs to be fixed.</p>
                <textarea
                  className="w-full p-3 border border-red-300 mb-6 min-h-[100px] text-sm focus:outline-none focus:border-red-500"
                  placeholder="E.g. The GST certificate image is blurry..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </>
            )}
            {activeModal === 'reject' && (
              <>
                <h3 className="text-xl font-bold uppercase tracking-wider mb-2 text-red-700">Reject Application</h3>
                <p className="text-sm text-gray-600 mb-4">Required: Provide the rejection reason that will be shown to the user.</p>
                <textarea
                  className="w-full p-3 border border-red-300 mb-6 min-h-[100px] text-sm focus:outline-none focus:border-red-500"
                  placeholder="Rejection reason..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </>
            )}
            {activeModal === 'ban' && (
              <>
                <h3 className="text-xl font-bold uppercase tracking-wider mb-2 text-red-700">Ban Permanently</h3>
                <p className="text-base font-medium text-black mb-6">Are you sure? This will permanently blacklist this user and block all future logins.</p>
              </>
            )}

            <div className="flex justify-end space-x-4 border-t border-gray-200 pt-6">
              <button
                className="px-6 py-2 text-sm font-semibold uppercase tracking-widest text-black border border-gray-300 hover:bg-gray-100 transition-colors"
                onClick={() => {
                  setActiveModal(null);
                  setReason('');
                }}
              >
                Cancel
              </button>
              <button
                className={`px-6 py-2 text-sm font-semibold uppercase tracking-widest transition-colors ${
                  activeModal === 'ban' 
                    ? 'bg-red-600 text-white hover:bg-red-700 border border-red-800' 
                    : 'bg-black text-white hover:bg-gray-800 border border-black'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                disabled={isProcessing || ((activeModal === 'reject' || activeModal === 'resubmit') && !reason.trim())}
                onClick={() => {
                  if (activeModal === 'hold') handleHold();
                  if (activeModal === 'resubmit') handleResubmit();
                  if (activeModal === 'reject') handleReject();
                  if (activeModal === 'ban') handleBan();
                }}
              >
                {isProcessing ? 'Processing' : activeModal === 'ban' ? 'Ban Permanently' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
