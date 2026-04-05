/** Human-readable product line for invoices, billing, and admin tables. */
export function moduleKeyInvoiceLabel(moduleKey) {
  if (moduleKey == null || String(moduleKey).trim() === '') return '—';
  const k = String(moduleKey).trim();
  switch (k) {
    case 'phone-agent':
      return 'AI Phone Agent';
    case 'reviews':
      return 'Review Reply';
    case 'delivery-dispatch':
      return 'Delivery Dispatch';
    default:
      return k;
  }
}
