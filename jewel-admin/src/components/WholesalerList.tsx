import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Wholesaler, VerificationStatus } from '../types/wholesaler';
import { Badge } from './Badge';

interface WholesalerListProps {
  onReview: (wholesaler: Wholesaler) => void;
}

type FilterTab = 'all' | VerificationStatus;

export const WholesalerList: React.FC<WholesalerListProps> = ({ onReview }) => {
  const [wholesalers, setWholesalers] = useState<Wholesaler[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('pending');

  const fetchWholesalers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('wholesalers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setWholesalers(data || []);
    } catch (error) {
      console.error('Error fetching wholesalers:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWholesalers();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wholesalers',
        },
        () => {
          fetchWholesalers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const pendingCount = wholesalers.filter((w) => w.verification_status === 'pending').length;

  const filteredWholesalers = wholesalers.filter((w) => {
    if (activeFilter === 'all') return true;
    return w.verification_status === activeFilter;
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const TABS: { label: string; value: FilterTab }[] = [
    { label: 'All', value: 'all' },
    { label: 'Pending', value: 'pending' },
    { label: 'On Hold', value: 'on_hold' },
    { label: 'Rejected', value: 'rejected' },
    { label: 'Verified', value: 'verified' },
    { label: 'Banned', value: 'banned' },
  ];

  return (
    <div className="flex flex-col h-full w-full max-w-6xl mx-auto p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-black m-0">Wholesaler Applications</h1>
      </div>

      <div className="flex space-x-2 border-b border-gray-200 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveFilter(tab.value)}
            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors duration-150 ${
              activeFilter === tab.value
                ? 'border-black text-black'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.label}
            {tab.value === 'pending' && pendingCount > 0 && (
              <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto border border-gray-200 bg-white">
        <table className="w-full text-left text-sm text-gray-500">
          <thead className="bg-gray-50 text-xs uppercase text-gray-700 border-b border-gray-200">
            <tr>
              <th scope="col" className="px-6 py-4 font-semibold">Business Name</th>
              <th scope="col" className="px-6 py-4 font-semibold">Full Name</th>
              <th scope="col" className="px-6 py-4 font-semibold">Location</th>
              <th scope="col" className="px-6 py-4 font-semibold">Submitted</th>
              <th scope="col" className="px-6 py-4 font-semibold">Status</th>
              <th scope="col" className="px-6 py-4 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  Loading wholesalers...
                </td>
              </tr>
            ) : filteredWholesalers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  No applications found for this filter.
                </td>
              </tr>
            ) : (
              filteredWholesalers.map((wholesaler) => (
                <tr
                  key={wholesaler.id}
                  className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => onReview(wholesaler)}
                >
                  <td className="px-6 py-4 font-medium text-black">
                    {wholesaler.business_name}
                  </td>
                  <td className="px-6 py-4">{wholesaler.full_name}</td>
                  <td className="px-6 py-4">
                    {wholesaler.city}, {wholesaler.state}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {formatDate(wholesaler.created_at)}
                  </td>
                  <td className="px-6 py-4">
                    <Badge status={wholesaler.verification_status} />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      className="text-xs font-semibold uppercase tracking-wider text-black border border-black px-3 py-1.5 hover:bg-black hover:text-white transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        onReview(wholesaler);
                      }}
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
