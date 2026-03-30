import fs from 'fs';
import path from 'path';
import { APP_DISPLAY_NAME } from '@/lib/appBrand';

const PAGE_PATH = '/tavari-ai-phone/landing';

function devFrontendPortFromConfig() {
  try {
    const configPath = path.join(process.cwd(), '..', 'config', 'dev-ports.json');
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const n = Number(parsed.frontend);
    return Number.isFinite(n) && n > 0 ? n : 3005;
  } catch {
    return 3005;
  }
}

function siteOrigin() {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || process.env.FRONTEND_URL || '').trim().replace(/\/$/, '');
  if (raw) {
    const withProto = raw.startsWith('http') ? raw : raw.includes('localhost') ? `http://${raw}` : `https://${raw}`;
    return withProto;
  }
  if (process.env.VERCEL_URL) {
    return `https://${String(process.env.VERCEL_URL).replace(/\/$/, '')}`;
  }
  if (process.env.NODE_ENV === 'development') {
    return `http://localhost:${devFrontendPortFromConfig()}`;
  }
  return 'https://www.tavarios.com';
}

const base = siteOrigin();
const pageUrl = `${base.replace(/\/$/, '')}${PAGE_PATH}`;

const title = `AI Phone Answering for Small Business — 24/7 | ${APP_DISPLAY_NAME}`;
const description =
  'Never miss a call. Tavari AI answers as your business 24/7, captures bookings and messages, and flags urgent calls — live in about 10 minutes, no credit card to try the demo.';

const ogImage = '/SMB-owner-photo.jpg';

export const metadata = {
  metadataBase: new URL(`${base}/`),
  title,
  description,
  keywords: [
    'AI phone answering',
    'AI receptionist',
    'virtual receptionist',
    '24/7 call answering',
    'small business phone',
    'missed calls',
    'after hours answering',
    'AI phone agent',
    'automated phone answering',
  ],
  alternates: {
    canonical: PAGE_PATH,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  openGraph: {
    title,
    description,
    url: pageUrl,
    siteName: APP_DISPLAY_NAME,
    locale: 'en_US',
    type: 'website',
    images: [
      {
        url: ogImage,
        width: 1200,
        height: 600,
        alt: 'Small business owner — AI phone agent testimonial about bookings and missed calls',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: [ogImage],
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebPage',
      '@id': `${pageUrl}#webpage`,
      url: pageUrl,
      name: title,
      description,
      isPartOf: {
        '@type': 'WebSite',
        name: APP_DISPLAY_NAME,
        url: base.endsWith('/') ? base.slice(0, -1) : base,
      },
    },
    {
      '@type': 'SoftwareApplication',
      name: 'Tavari AI Phone Agent',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description,
      url: pageUrl,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        description: 'Free demo available; paid plans on signup',
      },
      provider: {
        '@type': 'Organization',
        name: APP_DISPLAY_NAME,
        url: base.endsWith('/') ? base.slice(0, -1) : base,
      },
    },
  ],
};

export default function PhoneAgentLandingLayout({ children }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
    </>
  );
}
