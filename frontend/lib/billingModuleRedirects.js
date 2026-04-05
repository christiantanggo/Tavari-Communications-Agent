/**
 * Keep in sync with `billingSuccessClientRedirectPath` in services/billingCheckoutReturnUrls.js
 * (post–Stripe verify redirect targets).
 */
export function billingSuccessClientRedirectPath(moduleKey, opts = {}) {
  const k = String(moduleKey || '').trim() || 'phone-agent';
  const fromSetup = !!opts.fromSetup;
  switch (k) {
    case 'reviews':
      return '/review-reply-ai/dashboard';
    case 'delivery-dispatch':
      return '/dashboard/v2/modules/delivery-dispatch';
    case 'emergency-dispatch':
      return '/dashboard/v2/modules/emergency-dispatch';
    case 'phone-agent':
    default:
      if (fromSetup) return '/dashboard/setup?step=6&payment_completed=true';
      return '/dashboard/billing';
  }
}
