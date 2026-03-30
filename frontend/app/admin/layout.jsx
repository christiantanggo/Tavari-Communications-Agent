'use client';

import { Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';

function AdminRouteLayoutInner({ children }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isLogin = pathname === '/admin/login';
  const isEmbed = searchParams.get('embed') === '1';

  if (isLogin || isEmbed) {
    return children;
  }
  return <AdminLayout>{children}</AdminLayout>;
}

export default function AdminRouteLayout({ children }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50">{children}</div>}>
      <AdminRouteLayoutInner>{children}</AdminRouteLayoutInner>
    </Suspense>
  );
}
