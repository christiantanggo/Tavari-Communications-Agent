/** Avoid throwing on bad env (e.g. missing scheme); metadataBase must be a valid absolute URL. */
function resolveSiteOrigin() {
  const fallback = 'https://www.tavarios.com';
  const raw = String(process.env.NEXT_PUBLIC_SITE_URL || '').trim();
  if (!raw) return fallback.replace(/\/$/, '');
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withScheme).origin;
  } catch {
    return new URL(fallback).origin;
  }
}
const siteOrigin = resolveSiteOrigin();

/** Static SEO; phone in JSON-LD should match your public delivery line (update if it differs). */
const deliveryLineE164 = process.env.NEXT_PUBLIC_DELIVERY_SEO_PHONE || '';

const localBusinessSchema = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  name: 'Tavari Delivery Dispatch',
  description:
    'Professional last-mile package pickup and delivery coordination. Call for same-day or scheduled local delivery; request online when you prefer.',
    url: `${siteOrigin}/deliverydispatch`,
  ...(deliveryLineE164 ? { telephone: deliveryLineE164 } : {}),
  areaServed: {
    '@type': 'AdministrativeArea',
    name: 'Canada',
  },
  priceRange: '$$',
};

export const metadata = {
  metadataBase: new URL(siteOrigin),
  title: 'Tavari Delivery Dispatch | Local Package Pickup & Delivery',
  description:
    'Local package pickup and delivery in our service area only—not province-wide, statewide, or international. Call or request online; reference number and status updates included.',
  keywords: [
    'Tavari Delivery Dispatch',
    'local delivery',
    'package delivery',
    'pickup and delivery',
    'same day delivery',
    'last mile delivery',
  ],
  openGraph: {
    title: 'Tavari Delivery Dispatch | Local Package Pickup & Delivery',
    description:
      'Schedule package pickup and delivery by phone or online. Fast coordination with trusted carrier partners.',
    url: `${siteOrigin}/deliverydispatch`,
    siteName: 'Tavari',
    locale: 'en_CA',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tavari Delivery Dispatch',
    description: 'Local deliveries only in our area—call or request online. Not long-distance or international.',
  },
  alternates: {
    canonical: '/deliverydispatch',
  },
};

export default function DeliveryDispatchLayout({ children }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }}
      />
      {children}
    </>
  );
}
