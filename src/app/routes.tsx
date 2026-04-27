import { createBrowserRouter } from 'react-router';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { WholesalerReview } from './components/admin/WholesalerReview';
import { AdminProtected } from './components/admin/AdminProtected';
import { StatusPending } from './components/wholesaler/StatusPending';
import { StatusVerified } from './components/wholesaler/StatusVerified';
import { StatusRejected } from './components/wholesaler/StatusRejected';
import { StatusResubmission } from './components/wholesaler/StatusResubmission';
import { StatusOnHold } from './components/wholesaler/StatusOnHold';
import { NotificationBanner } from './components/NotificationBanner';
import { DemoNav } from './components/DemoNav';
import { PhoneAuth } from './components/auth/PhoneAuth';

function AuthPage() {
  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-4 bg-gray-50">
      <PhoneAuth />
    </div>
  );
}

function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">404</h1>
        <p className="text-gray-600">Page not found</p>
      </div>
    </div>
  );
}

// Wholesaler status pages with notification banners
function StatusPendingPage() {
  return (
    <>
      <StatusPending />
      <DemoNav />
    </>
  );
}

function StatusVerifiedPage() {
  return (
    <>
      <NotificationBanner type="verified" onAction={() => console.log('Go to dashboard')} />
      <div className="pt-14">
        <StatusVerified />
      </div>
      <DemoNav />
    </>
  );
}

function StatusRejectedPage() {
  return (
    <>
      <NotificationBanner type="rejected" onAction={() => console.log('See details')} />
      <div className="pt-14">
        <StatusRejected />
      </div>
      <DemoNav />
    </>
  );
}

function StatusResubmissionPage() {
  return (
    <>
      <NotificationBanner type="resubmission" onAction={() => console.log('Review now')} />
      <div className="pt-14">
        <StatusResubmission />
      </div>
      <DemoNav />
    </>
  );
}

function StatusOnHoldPage() {
  return (
    <>
      <StatusOnHold />
      <DemoNav />
    </>
  );
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <AdminProtected>
        <AdminDashboard />
      </AdminProtected>
    ),
  },
  {
    path: '/review/:id',
    element: (
      <AdminProtected>
        <WholesalerReview />
      </AdminProtected>
    ),
  },
  {
    path: '/review/:type/:id',
    element: (
      <AdminProtected>
        <WholesalerReview />
      </AdminProtected>
    ),
  },
  {
    path: '/status/pending',
    Component: StatusPendingPage,
  },
  {
    path: '/status/verified',
    Component: StatusVerifiedPage,
  },
  {
    path: '/status/rejected',
    Component: StatusRejectedPage,
  },
  {
    path: '/status/resubmission',
    Component: StatusResubmissionPage,
  },
  {
    path: '/status/onhold',
    Component: StatusOnHoldPage,
  },
  {
    path: '/auth',
    Component: AuthPage,
  },
  {
    path: '*',
    Component: NotFoundPage,
  },
]);