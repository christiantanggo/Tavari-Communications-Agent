'use client';

import AppSiteFooter from '@/components/AppSiteFooter';

export default function AppChrome({ children }) {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex flex-col">{children}</div>
      <AppSiteFooter />
    </div>
  );
}
