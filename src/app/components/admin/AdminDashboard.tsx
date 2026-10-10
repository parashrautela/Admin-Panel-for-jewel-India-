import { CreditAllowancesPanel } from './CreditAllowances';
import { ReferralPanel } from './Referrals';
import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { Search, User, ExternalLink } from 'lucide-react';
import {
  fetchSubmissions,
  fetchStatusCounts,
  isRetailerRecord,
  inviterLabel,
  type ReviewEntity,
  type WholesalerStatus,
  type SubmissionRecord
} from '../../../lib/adminApi';
import nanoBananaLogo from '../../../assets/nano-banana-logo.png';

const DEFAULT_STATUS_COUNTS = {
  pending: 0,
  on_hold: 0,
  verified: 0,
  banned: 0,
  rejected: 0,
  resubmission_required: 0
};

export function AdminDashboard() {
  const [selectedEntity, setSelectedEntity] = useState<ReviewEntity>('wholesaler');
  const [selectedFilter, setSelectedFilter] = useState<WholesalerStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>(DEFAULT_STATUS_COUNTS);
  const [loading, setLoading] = useState(true);
  const [showApiPanel, setShowApiPanel] = useState(false);
  const [expandedBusiness,setExpandedBusiness]=useState<string|null>(null);

  const activeTab = showApiPanel ? 'api_backend' : selectedEntity;

  const entityLabel = selectedEntity === 'retailer' ? 'Retailer' : 'Wholesaler';
  const entityLabelLower = entityLabel.toLowerCase();

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      try {
        const counts = await fetchStatusCounts(selectedEntity);
        setStatusCounts({ ...DEFAULT_STATUS_COUNTS, ...counts });

        const { data } = await fetchSubmissions(selectedEntity, selectedFilter, searchQuery);
        setSubmissions(data as SubmissionRecord[]);
      } catch (err) {
        console.error("Failed to fetch dashboard data:", err);
      } finally {
        setLoading(false);
      }
    }

    const delayDebounce = setTimeout(() => {
      loadDashboard();
    }, 300); // debounce search typing

    return () => clearTimeout(delayDebounce);
  }, [selectedEntity, selectedFilter, searchQuery]);

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

  // Retailers only: who invited them, or a marker that they still have to enter a code.
  const renderInviter = (submission: SubmissionRecord) => {
    if (!isRetailerRecord(submission)) return null;
    return submission.referred_by ? (
      <div className="text-xs text-gray-500 mt-1">{inviterLabel(submission)}</div>
    ) : (
      <div className="mt-1">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-800">
          {inviterLabel(submission)}
        </span>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Top Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-black rounded-sm"></div>
            <span className="font-semibold text-xl">Admin</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/wishlist-controls" className="text-sm underline">Wishlist controls</Link>
            <span className="text-sm text-gray-600">Admin User</span>
            <div className="w-9 h-9 bg-black rounded-full flex items-center justify-center text-white text-sm">
              <User className="w-5 h-5" />
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8">
        {/* Stats Row */}
        {!showApiPanel && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <div className="text-4xl font-light mb-2">{statusCounts.pending || 0}</div>
            <div className="text-sm text-gray-600">Pending review</div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <div className="text-4xl font-light mb-2">{statusCounts.on_hold || 0}</div>
            <div className="text-sm text-gray-600">On Hold</div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <div className="text-4xl font-light mb-2">{statusCounts.verified || 0}</div>
            <div className="text-sm text-gray-600">Verified total</div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <div className="text-4xl font-light mb-2">{statusCounts.banned || 0}</div>
            <div className="text-sm text-gray-600">Banned</div>
          </div>
        </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <h1 className="text-3xl font-light">{showApiPanel ? 'API Keys & Backend' : entityLabel + ' submissions'}</h1>
          <div className="flex items-center bg-gray-100 rounded-full p-1">
            {[
              { value: 'wholesaler', label: 'Wholesalers' },
              { value: 'retailer', label: 'Retailers' },
              { value: 'api_backend', label: 'API Key & Backend' }
            ].map((tab) => (
              <button
                key={tab.value}
                onClick={() => {
                  if (tab.value === 'api_backend') {
                    setShowApiPanel(true);
                  } else {
                    setShowApiPanel(false);
                    setSelectedEntity(tab.value as ReviewEntity);
                  }
                }}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  activeTab === tab.value
                    ? 'bg-black text-white'
                    : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {showApiPanel ? (
          <div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Service</th>
                    <th className="text-left px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                    <th className="text-left px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="text-left px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[
                    { name: 'Supabase', description: 'Database, Authentication & Storage', url: 'https://supabase.com/', initial: 'S', logoUrl: 'https://cdn.simpleicons.org/supabase/3FCF8E', cover: false },
                    { name: 'Railway', description: 'Backend Infrastructure & Deployment', url: 'https://railway.com/dashboard', initial: 'R', logoUrl: 'https://cdn.simpleicons.org/railway/0B0D0E', cover: false },
                    { name: 'Vercel', description: 'Frontend Hosting & Edge Network', url: 'https://vercel.com/', initial: 'V', logoUrl: 'https://cdn.simpleicons.org/vercel/000000', cover: false },
                    { name: 'Nano Banana', description: 'Service Integration', url: 'https://nanobananaapi.ai/dashboard', initial: 'N', logoUrl: nanoBananaLogo, cover: true },
                  ].map((service) => (
                    <tr key={service.name} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          {service.logoUrl ? (
                            <div className={`w-10 h-10 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 ${service.cover ? 'bg-gray-100' : 'bg-white border border-gray-200 p-2'}`}>
                              <img src={service.logoUrl} alt={service.name} className={service.cover ? 'w-full h-full object-cover' : 'w-5 h-5 object-contain'} />
                            </div>
                          ) : (
                            <div className="w-10 h-10 bg-gray-900 rounded-full flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                              {service.initial}
                            </div>
                          )}
                          <span className="font-medium">{service.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-gray-600 text-sm">{service.description}</td>
                      <td className="px-6 py-5">
                        {service.url === '#' ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-900">Not configured</span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-black text-white">Active</span>
                        )}
                      </td>
                      <td className="px-6 py-5">
                        <a
                          href={service.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-black hover:text-gray-600 font-medium text-sm transition-colors inline-flex items-center gap-1.5"
                        >
                          Open
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
        <>
        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder={`Search ${entityLabelLower}s...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-gray-50 rounded-lg focus:outline-none focus:bg-white focus:shadow-md border border-transparent focus:border-gray-200 transition-all"
            />
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex gap-3 mb-8 flex-wrap">
          {['all', 'pending', 'on_hold', 'verified', 'rejected', 'resubmission_required', 'banned'].map((filter) => (
            <button
              key={filter}
              onClick={() => setSelectedFilter(filter as WholesalerStatus | 'all')}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                selectedFilter === filter
                  ? 'bg-black text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {filter.charAt(0).toUpperCase() + filter.slice(1).replace('_', ' ')}
              {filter !== 'all' && <span className="ml-1.5">{statusCounts[filter] || 0}</span>}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {loading?<p className="text-gray-500 p-6">Loading businesses…</p>:submissions.length===0?<p className="text-gray-500 p-6">No businesses found.</p>:submissions.map(submission=>{
            const key=selectedEntity+':'+submission.id;
            const expanded=expandedBusiness===key;
            const retailer=isRetailerRecord(submission)?submission:null;
            return <article key={key} className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h2 className="font-semibold text-lg">{submission.business_name||submission.full_name}</h2><p className="text-sm text-gray-500 mt-1">{submission.full_name} · {submission.city}, {submission.state}</p>{renderInviter(submission)}</div>
                {getStatusBadge(submission.verification_status)}
              </div>
              <div className="flex flex-wrap gap-3 items-center">
                <button aria-expanded={expanded} onClick={()=>setExpandedBusiness(expanded?null:key)} className="bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-medium">{expanded?'Hide credits & referrals':'Credits & referrals'}</button>
                <Link to={`/review/${selectedEntity}/${submission.id}`} className="border rounded-lg px-4 py-2 text-sm">{submission.verification_status==='verified'?'View documents':'Review application'}</Link>
              </div>
              {expanded&&<div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
                <CreditAllowancesPanel wholesalerId={submission.id} businessType={selectedEntity}/>
                <ReferralPanel wholesalerId={retailer?undefined:submission.id} retailerId={retailer?submission.id:undefined} inviterName={retailer?.inviter_business_name||undefined}/>
              </div>}
            </article>;
          })}
        </div>
        </>
        )}
      </div>
    </div>
  );
}