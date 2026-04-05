/** Labels for sales onboarding — keep keys aligned with config/sales-onboard-modules.js */

export const SALES_ONBOARD_PRODUCT_CHOICES = [
  { key: 'phone-agent', label: 'Tavari AI Phone Agent' },
  { key: 'delivery-dispatch', label: 'Last-mile delivery dispatch' },
  { key: 'reviews', label: 'Review Reply AI' },
  { key: 'emergency-dispatch', label: 'Emergency dispatch' },
  { key: 'orbix-network', label: 'Orbix Network' },
  { key: 'movie-review', label: 'Movie Review' },
];

export function labelForSalesModuleKey(key) {
  const row = SALES_ONBOARD_PRODUCT_CHOICES.find((o) => o.key === key);
  return row?.label || key || '—';
}
