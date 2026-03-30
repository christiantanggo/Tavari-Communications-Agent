import { redirect } from 'next/navigation';
import { normalizeAffiliateCodeParam, sanitizeInternalNextPath } from '@/lib/affiliateCookie';

export const dynamic = 'force-dynamic';

/** Old path; canonical customer URL is /r/[code]. */
export default function LegacyAffiliatePartnerPathRedirect({ params, searchParams }) {
  const code = normalizeAffiliateCodeParam(params?.code);
  if (!code) redirect('/');
  const rawNext = searchParams?.next;
  const nextPath = sanitizeInternalNextPath(typeof rawNext === 'string' ? rawNext : null);
  redirect(nextPath ? `/r/${code}?next=${encodeURIComponent(nextPath)}` : `/r/${code}`);
}
