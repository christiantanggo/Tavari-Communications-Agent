import { Suspense } from 'react';
import { APP_DISPLAY_NAME } from '@/lib/appBrand';
import ReviewReplyAffiliateFunnel from '@/components/join/ReviewReplyAffiliateFunnel';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return {
    title: `Review Reply AI · ${APP_DISPLAY_NAME}`,
    robots: { index: false, follow: false },
  };
}

/** Stripe checkout funnel (no partner code). ClickBank retail, when used, stays on /review-reply-ai/landing. */
export default function JoinReviewsOrganicPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" aria-hidden />}>
      <ReviewReplyAffiliateFunnel affiliateCode={null} />
    </Suspense>
  );
}
