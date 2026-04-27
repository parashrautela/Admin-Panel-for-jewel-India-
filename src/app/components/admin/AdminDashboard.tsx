import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { Search, User } from 'lucide-react';
import { fetchSubmissions, fetchStatusCounts, type ReviewEntity, type WholesalerStatus, type SubmissionRecord } from '../../../lib/adminApi';

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

  const entityLabel = selectedEntity === 'retailer' ? 'Retailer' : 'Wholesaler';
  const entityLabelLower = entityLabel.toLowerCase();

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      try {
        const counts = await fetchStatusCounts(selectedEntity);
        setStatusCounts({ ...DEFAULT_STATUS_COUNTS, ...counts });

        const { data } = await fetchSubmissions(selectedEntity, selectedFilter, searchQuery, 1, 50);
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
            <span className="text-sm text-gray-600">Admin User</span>
            <div className="w-9 h-9 bg-black rounded-full flex items-center justify-center text-white text-sm">
              <User className="w-5 h-5" />
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-8 py-10">
        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-6 mb-12">
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

        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <h1 className="text-3xl font-light">{entityLabel} submissions</h1>
          <div className="flex items-center bg-gray-100 rounded-full p-1">
            {[
              { value: 'wholesaler', label: 'Wholesalers' },
              { value: 'retailer', label: 'Retailers' }
            ].map((entity) => (
              <button
                key={entity.value}
                onClick={() => setSelectedEntity(entity.value as ReviewEntity)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  selectedEntity === entity.value
                    ? 'bg-black text-white'
                    : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                {entity.label}
              </button>
            ))}
          </div>
        </div>

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
          {['all', 'pending', 'on_hold', 'verified', 'rejected', 'banned'].map((filter) => (
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

        {/* Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">{entityLabel}</th>
                <th className="text-left px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Business</th>
                <th className="text-left px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                <th className="text-left px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Submitted</th>
                <th className="text-left px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                   <td colSpan={6} className="px-6 py-10 text-center text-gray-500">Loading {entityLabelLower}s...</td>
                </tr>
              ) : submissions.length === 0 ? (
                <tr>
                   <td colSpan={6} className="px-6 py-10 text-center text-gray-500">No {entityLabelLower}s found.</td>
                </tr>
              ) : submissions.map((submission) => (
                <tr 
                  key={submission.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gray-900 rounded-full flex items-center justify-center text-white text-sm font-medium">
                        {submission.full_name?.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium">{submission.full_name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-gray-700">{submission.business_name}</td>
                  <td className="px-6 py-5 text-gray-600">{submission.city}, {submission.state}</td>
                  <td className="px-6 py-5 text-gray-600 text-sm">{new Date(submission.created_at).toLocaleDateString()}</td>
                  <td className="px-6 py-5">
                    {getStatusBadge(submission.verification_status)}
                  </td>
                  <td className="px-6 py-5">
                    <Link 
                      to={`/review/${selectedEntity}/${submission.id}`}
                      className="text-black hover:text-gray-600 font-medium text-sm transition-colors"
                    >
                      {submission.verification_status === 'verified' || submission.verification_status === 'banned' ? 'View' : 'Review'}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}