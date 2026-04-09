'use client';

import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import PhoneAgentV2ActionCards from '@/components/PhoneAgentV2ActionCards';

function SmsAdvertisingPage() {
  return (
    <AuthGuard>
      <V2AppShell>
        <div className="p-6 md:p-8">
          <PhoneAgentV2ActionCards />

          <div
            className="max-w-3xl rounded-2xl border p-8 shadow-sm"
            style={{
              backgroundColor: 'var(--color-surface)',
              borderColor: 'var(--color-border)',
            }}
          >
            <p
              className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide"
              style={{
                backgroundColor: 'rgba(245, 158, 11, 0.12)',
                color: '#b45309',
              }}
            >
              Coming Soon
            </p>
            <h1 className="mt-4 text-2xl font-semibold" style={{ color: 'var(--color-text-main)' }}>
              SMS Advertising
            </h1>
            <p className="mt-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
              The SMS advertising workspace is under construction. Tavari staff can unlock this feature for internal testing, but it is not ready for business use yet.
            </p>
          </div>
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}

export default SmsAdvertisingPage;
