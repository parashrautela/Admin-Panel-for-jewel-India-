import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { fetchVerificationStatus, markNotificationAsRead } from '../../../lib/onboardingApi';
import { StatusPending } from './StatusPending';
import { StatusVerified } from './StatusVerified';
import { StatusRejected } from './StatusRejected';
import { StatusResubmission } from './StatusResubmission';
import { StatusOnHold } from './StatusOnHold';
import { NotificationBanner } from '../NotificationBanner';
import { WholesalerStatus } from '../../../lib/adminApi';

export function VerificationStatusWrapper({ userId }: { userId: string }) {
  const [status, setStatus] = useState<WholesalerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<{ message: string; type: WholesalerStatus } | null>(null);

  useEffect(() => {
    async function loadStatus() {
      try {
        const data = await fetchVerificationStatus(userId);
        setStatus(data.verification_status);
        if (data.notification_message && data.verification_status !== 'pending' && data.verification_status !== 'on_hold') {
          setNotification({ message: data.notification_message, type: data.verification_status });
        }
      } catch (err) {
        console.error("Failed to load status", err);
      } finally {
        setLoading(false);
      }
    }

    loadStatus();

    // Supabase Realtime Listener
    const channel = supabase
      .channel('wholesaler-status')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'wholesalers',
          filter: `id=eq.${userId}`,
        },
        async (payload) => {
          const { verification_status, notification_message } = payload.new;
          
          setStatus(verification_status);

          if (notification_message) {
            setNotification({ message: notification_message, type: verification_status });
            await markNotificationAsRead(userId);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  if (loading) return <div className="p-8 text-center">Loading status...</div>;

  const handleDismissBanner = () => {
    setNotification(null);
  };

  const renderStatusScreen = () => {
    switch (status) {
      case 'verified':
        return <StatusVerified />;
      case 'rejected':
      case 'banned':
        return <StatusRejected />;
      case 'resubmission_required':
        return <StatusResubmission />;
      case 'on_hold':
        return <StatusOnHold />;
      case 'pending':
      default:
        return <StatusPending />;
    }
  };

  return (
    <>
      {notification && (
        <NotificationBanner 
          type={notification.type as any} 
          onAction={handleDismissBanner} 
        />
      )}
      <div className={notification ? "pt-14" : ""}>
        {renderStatusScreen()}
      </div>
    </>
  );
}
