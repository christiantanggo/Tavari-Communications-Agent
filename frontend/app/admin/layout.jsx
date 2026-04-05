'use client';

import { Suspense, useLayoutEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';

function readEmbedQuery() {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('embed') === '1';
  } catch {
    return false;
  }
}

function AdminRouteLayoutInner({ children }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isLogin = pathname === '/admin/login';
  const queryEmbed = searchParams.get('embed') === '1';
  const [windowEmbed, setWindowEmbed] = useState(readEmbedQuery);

  useLayoutEffect(() => {
    setWindowEmbed(readEmbedQuery());
  }, [pathname, searchParams]);

  const isEmbed = queryEmbed || windowEmbed;

  if (isLogin || isEmbed) {
    return <>{children}</>;
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
