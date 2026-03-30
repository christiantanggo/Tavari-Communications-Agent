import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { APP_DISPLAY_NAME } from '@/lib/appBrand';
import { normalizeAffiliateCodeParam } from '@/lib/affiliateCookie';
import { fetchPublicAffiliatePartner } from '@/lib/fetchPublicAffiliatePartner';
import PhoneAgentAffiliateFunnel from '@/components/join/PhoneAgentAffiliateFunnel';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return {
    title: `AI phone agent · ${APP_DISPLAY_NAME}`,
    robots: { index: false, follow: false },
  };
}

export default async function JoinPhoneAgentAffiliatePage({ params }) {
  const code = normalizeAffiliateCodeParam(params?.code);
  if (!code) redirect('/tavari-ai-phone/landing');

  const data = await fetchPublicAffiliatePartner(code);
  if (!data) redirect('/tavari-ai-phone/landing');

  return (
    <Suspense fallback={<div className="min-h-screen bg-white" aria-hidden />}>
      <PhoneAgentAffiliateFunnel affiliateCode={code} />
    </Suspense>
  );
}
