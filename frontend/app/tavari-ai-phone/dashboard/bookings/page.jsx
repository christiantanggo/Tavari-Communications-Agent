'use client';

import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import PhoneAgentV2ActionCards from '@/components/PhoneAgentV2ActionCards';
import BookingsWorkspace from '@/components/BookingsWorkspace';

function BookingsPage() {
  return (
    <AuthGuard>
      <V2AppShell>
        <div className="w-full max-w-none p-4 sm:p-6 md:p-8 lg:px-10">
          <BookingsWorkspace topContent={<PhoneAgentV2ActionCards />} />
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}

export default BookingsPage;
