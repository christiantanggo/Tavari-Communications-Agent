/**
 * Stripe Checkout success_url / cancel_url by package module and flow (join funnel, sales invite, default).
 */

/** Cancel when user backs out of Checkout (not join funnel, not sales-specific page). */
export function defaultCancelPathForModule(moduleKey) {
  const k = String(moduleKey || '').trim() || 'phone-agent';
  switch (k) {
    case 'reviews':
      return '/dashboard/v2/settings/modules';
    case 'delivery-dispatch':
      return '/dashboard/v2/modules/delivery-dispatch';
    case 'emergency-dispatch':
      return '/dashboard/v2/modules/emergency-dispatch';
    case 'phone-agent':
    default:
      return '/dashboard/setup';
  }
}

/**
 * Client path after successful verify on /dashboard/billing/success (see frontend).
 * @param {string} moduleKey
 * @param {{ fromSetup?: boolean }} opts
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

/**
 * @param {string} feOrigin - Frontend origin, no trailing slash
 * @param {string} packageId - Package UUID
 * @param {string} pkgModuleKey - pricing_packages.module_key
 * @param {object} [options]
 * @param {'sales_invite'|undefined} [options.context] - sales rep checkout / email invite
 * @param {string|null} [options.joinFunnel] - 'phone-agent' | 'reviews'
 * @param {string|null} [options.joinCode] - normalized affiliate code (for join URLs)
 * @param {string|null} [options.salesRepCode] - normalized rep affiliate_code (sales invite join-style URLs)
 */
export function buildStripeCheckoutReturnUrls(feOrigin, packageId, pkgModuleKey, options = {}) {
  const origin = String(feOrigin || '').replace(/\/$/, '');
  const mod = String(pkgModuleKey || '').trim() || 'phone-agent';
  const pkgQ = `package_id=${encodeURIComponent(packageId)}`;
  const sessionQ = 'session_id={CHECKOUT_SESSION_ID}';
  const salesFlag = options.context === 'sales_invite' ? '&from_sales_invite=1' : '';
  const moduleQ = `&module_key=${encodeURIComponent(mod)}`;

  const joinFunnel = options.joinFunnel || null;
  const joinCode = options.joinCode || null;
  const repCode = options.salesRepCode || null;

  if (joinFunnel === 'phone-agent' && joinCode && mod === 'phone-agent') {
    return {
      successUrl: `${origin}/join/phone-agent/${joinCode}?checkout=success&${pkgQ}&${sessionQ}${salesFlag}`,
      cancelUrl: `${origin}/join/phone-agent/${joinCode}`,
    };
  }

  if (joinFunnel === 'reviews' && mod === 'reviews') {
    const base = joinCode ? `/join/reviews/${joinCode}` : '/join/reviews';
    return {
      successUrl: `${origin}${base}?checkout=success&${pkgQ}&${sessionQ}${salesFlag}`,
      cancelUrl: `${origin}${base}`,
    };
  }

  if (options.context === 'sales_invite' && repCode) {
    if (mod === 'phone-agent') {
      return {
        successUrl: `${origin}/join/phone-agent/${repCode}?checkout=success&${pkgQ}&${sessionQ}&from_sales_invite=1`,
        cancelUrl: `${origin}/join/phone-agent/${repCode}`,
      };
    }
    if (mod === 'reviews') {
      return {
        successUrl: `${origin}/join/reviews/${repCode}?checkout=success&${pkgQ}&${sessionQ}&from_sales_invite=1`,
        cancelUrl: `${origin}/join/reviews/${repCode}`,
      };
    }
  }

  const cancelUrl =
    options.context === 'sales_invite'
      ? `${origin}/sales/payment-cancelled`
      : `${origin}${defaultCancelPathForModule(mod)}`;

  const successUrl = `${origin}/dashboard/billing/success?${pkgQ}&from_setup=true${moduleQ}&${sessionQ}${salesFlag}`;

  return { successUrl, cancelUrl };
}
