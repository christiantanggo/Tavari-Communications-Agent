import { redirect } from 'next/navigation';
import { normalizeAffiliateCodeParam, sanitizeInternalNextPath } from '@/lib/affiliateCookie';

export const dynamic = 'force-dynamic';

/** Legacy URL: /affiliate/ref/CODE → full partner landing. */
export default function AffiliateRefLegacyRedirect({ params, searchParams }) {
  const code = normalizeAffiliateCodeParam(params?.code);
  if (!code) redirect('/');
  const rawNext = searchParams?.next;
  const nextPath = sanitizeInternalNextPath(typeof rawNext === 'string' ? rawNext : null);
  const dest = nextPath ? `/r/${code}?next=${encodeURIComponent(nextPath)}` : `/r/${code}`;
  redirect(dest);
}
