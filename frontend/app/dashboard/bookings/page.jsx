'use client';

import AuthGuard from '@/components/AuthGuard';
import DashboardHeader from '@/components/DashboardHeader';
import BookingsWorkspace from '@/components/BookingsWorkspace';

function BookingsPage() {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <DashboardHeader />

        <div className="mx-auto w-full max-w-none px-4 py-8 sm:px-6 lg:px-10 xl:px-14">
          <BookingsWorkspace />
        </div>
      </div>
    </AuthGuard>
  );
}

export default BookingsPage;
