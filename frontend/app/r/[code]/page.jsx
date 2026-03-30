import { redirect } from 'next/navigation';
import { APP_DISPLAY_NAME } from '@/lib/appBrand';
import { normalizeAffiliateCodeParam, sanitizeInternalNextPath } from '@/lib/affiliateCookie';
import { fetchPublicAffiliatePartner } from '@/lib/fetchPublicAffiliatePartner';
import PartnerReferralLanding from '@/components/PartnerReferralLanding';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return {
    title: APP_DISPLAY_NAME,
    robots: { index: false, follow: false },
  };
}

/** Customer-facing short URL: /r/CODE (no “affiliate” in the path). */
export default async function ReferralLandingPage({ params, searchParams }) {
  const code = normalizeAffiliateCodeParam(params?.code);
  if (!code) redirect('/');

  const data = await fetchPublicAffiliatePartner(code);
  if (!data) redirect('/');

  const rawNext = searchParams?.next;
  const nextPath = sanitizeInternalNextPath(typeof rawNext === 'string' ? rawNext : null);

  return <PartnerReferralLanding code={code} initial={data} nextPath={nextPath} />;
}
