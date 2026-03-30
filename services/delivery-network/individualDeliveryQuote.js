/**
 * Server-side price for public individual delivery checkout (no business_id).
 * Uses the same Shipday path as admin quote (create temp order → on-demand estimates or costing → delete).
 * Falls back to global delivery pricing config (flat + fees) if Shipday cannot quote.
 */
import { getQuoteFromShipday } from './shipdayQuote.js';
import { calculateDeliveryPrice } from './pricingEngine.js';
import { getQuote as getConfigFlatQuote } from './pricing.js';

function buildFullAddressLine(street, city, province, postalCode) {
  const s = street && String(street).trim();
  const c = city && String(city).trim();
  const p = province && String(province).trim();
  const z = postalCode && String(postalCode).trim();
  if (s && (c || p || z)) {
    const rest = [c, [p, z].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    return rest ? `${s}, ${rest}` : s;
  }
  return s || null;
}

/**
 * @param {Object} p
 * @param {string|null} p.pickup_address
 * @param {string|null} p.pickup_city
 * @param {string|null} p.pickup_province
 * @param {string|null} p.pickup_postal_code
 * @param {string} p.delivery_address
 * @param {string} p.delivery_city
 * @param {string} p.delivery_province
 * @param {string} p.delivery_postal_code
 * @param {string} p.callback_phone
 * @param {string|null} p.recipient_name
 * @param {string|null} p.email
 * @returns {Promise<{
 *   amount_cents: number,
 *   final_price_cad: number,
 *   disclaimer: string,
 *   quote_source: 'shipday' | 'config',
 *   quoted_on_demand_provider: string | null,
 * }>}
 */
export async function getIndividualDeliveryCheckoutQuote(p) {
  const delivery = buildFullAddressLine(
    p.delivery_address,
    p.delivery_city,
    p.delivery_province,
    p.delivery_postal_code
  );
  if (!delivery) {
    const flat = await getConfigFlatQuote(null);
    return {
      amount_cents: flat.amount_cents,
      final_price_cad: Math.ceil(flat.amount_cents / 100),
      disclaimer: flat.disclaimer,
      quote_source: 'config',
      quoted_on_demand_provider: null,
    };
  }

  let pickup = buildFullAddressLine(
    p.pickup_address,
    p.pickup_city,
    p.pickup_province,
    p.pickup_postal_code
  );
  if (!pickup) {
    pickup = 'Pickup address TBD';
  }

  const shipday = await getQuoteFromShipday({
    pickup_address: pickup,
    delivery_address: delivery,
    pickup_phone: p.callback_phone,
    customer_phone: p.callback_phone,
    recipient_name: p.recipient_name,
    customer_email: p.email,
  });

  if (shipday && shipday.cost_usd != null && Number(shipday.cost_usd) > 0) {
    const pricing = await calculateDeliveryPrice({
      cost_usd: Number(shipday.cost_usd),
      business_id: null,
    });
    const cents = Math.max(50, Math.round(Number(pricing.amount_cents) || 0));
    return {
      amount_cents: cents,
      final_price_cad: pricing.final_price_cad,
      disclaimer: pricing.disclaimer,
      quote_source: 'shipday',
      quoted_on_demand_provider: shipday.provider_name ? String(shipday.provider_name).trim().slice(0, 50) : null,
    };
  }

  const flat = await getConfigFlatQuote(null);
  return {
    amount_cents: Math.max(50, flat.amount_cents),
    final_price_cad: Math.ceil(flat.amount_cents / 100),
    disclaimer: flat.disclaimer,
    quote_source: 'config',
    quoted_on_demand_provider: null,
  };
}
