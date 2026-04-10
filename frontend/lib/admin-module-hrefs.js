/**
 * “Manage” links from Tavari staff admin UI → module admin or v2 dashboard entry.
 */
export function getAdminModuleManageHref(moduleKey) {
  const key = String(moduleKey || '').trim();
  switch (key) {
    case 'phone-agent':
      return '/tavari-ai-phone/admin-dashboard';
    case 'reviews':
      return '/review-reply-ai/admin-dashboard';
    case 'delivery-dispatch':
      return '/admin/delivery-operator';
    case 'emergency-dispatch':
      return '/dashboard/v2/modules/emergency-dispatch';
    case 'ai-sales-agent':
      return '/admin/ai-sales-agent';
    case 'movie-review':
    case 'orbix-network':
      return `/dashboard/v2/modules/${key}/dashboard`;
    default:
      return `/${key}/admin-dashboard`;
  }
}
