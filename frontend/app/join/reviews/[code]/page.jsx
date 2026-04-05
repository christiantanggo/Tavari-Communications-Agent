import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { APP_DISPLAY_NAME } from '@/lib/appBrand';
import { normalizeAffiliateCodeParam } from '@/lib/affiliateCookie';
import { fetchPublicAffiliatePartner } from '@/lib/fetchPublicAffiliatePartner';
import ReviewReplyAffiliateFunnel from '@/components/join/ReviewReplyAffiliateFunnel';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return {
    title: `Review Reply AI · ${APP_DISPLAY_NAME}`,
    robots: { index: false, follow: false },
  };
}

export default async function JoinReviewsAffiliatePage({ params }) {
  const code = normalizeAffiliateCodeParam(params?.code);
  if (!code) redirect('/join/reviews');

  const data = await fetchPublicAffiliatePartner(code);
  if (!data) redirect('/join/reviews');

  return (
    <Suspense fallback={<div className="min-h-screen bg-white" aria-hidden />}>
      <ReviewReplyAffiliateFunnel affiliateCode={code} />
    </Suspense>
  );
}
