import { Link } from 'react-router';

export function DemoNav() {
  return (
    <div className="fixed bottom-4 right-4 bg-white border-2 border-gray-300 rounded-lg shadow-lg p-4 z-50 max-w-xs">
      <div className="text-xs font-semibold text-gray-500 mb-2 uppercase">Demo Navigation</div>
      <div className="space-y-1 text-sm">
        <div className="font-medium text-gray-700 mb-1">Admin Panel:</div>
        <Link to="/" className="block text-blue-600 hover:underline pl-2">
          • Dashboard
        </Link>
        <Link to="/review/1" className="block text-blue-600 hover:underline pl-2">
          • Review Page
        </Link>
        
        <div className="font-medium text-gray-700 mt-3 mb-1">Wholesaler Status:</div>
        <Link to="/status/pending" className="block text-blue-600 hover:underline pl-2">
          • Pending
        </Link>
        <Link to="/status/verified" className="block text-blue-600 hover:underline pl-2">
          • Verified
        </Link>
        <Link to="/status/rejected" className="block text-blue-600 hover:underline pl-2">
          • Rejected
        </Link>
        <Link to="/status/resubmission" className="block text-blue-600 hover:underline pl-2">
          • Resubmission
        </Link>
        <Link to="/status/onhold" className="block text-blue-600 hover:underline pl-2">
          • On Hold
        </Link>
      </div>
    </div>
  );
}
