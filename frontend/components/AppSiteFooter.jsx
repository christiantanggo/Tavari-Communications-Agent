'use client';

import Link from 'next/link';
import Image from 'next/image';
import { APP_DISPLAY_NAME } from '@/lib/appBrand';
import { trackLinkClick } from '@/lib/analytics';

const IS_DEFAULT_TAVARI_BRAND = APP_DISPLAY_NAME === 'Tavari Ai';

export default function AppSiteFooter() {
  return (
    <footer
      className="mt-auto border-t border-gray-200 bg-gray-50 py-4 sm:py-5"
      style={{ borderColor: 'var(--color-border, #e5e7eb)' }}
    >
      <div className="container mx-auto px-3 sm:px-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex justify-center sm:justify-start">
          <Link
            href="/admin/login"
            className="inline-flex items-center hover:opacity-90 transition-opacity"
            onClick={() => trackLinkClick('footer_logo_admin', '/admin/login', 'footer')}
            aria-label="Admin login"
          >
            {IS_DEFAULT_TAVARI_BRAND ? (
              <Image
                src="/tavari-logo.png"
                alt={APP_DISPLAY_NAME}
                width={320}
                height={91}
                className="h-10 sm:h-12 w-auto opacity-90"
              />
            ) : (
              <span className="text-lg font-bold text-blue-600">{APP_DISPLAY_NAME}</span>
            )}
          </Link>
        </div>
        <nav
          className="flex flex-wrap items-center justify-center sm:justify-end gap-x-6 gap-y-2 text-sm text-gray-600"
          aria-label="Legal and programs"
        >
          <Link
            href="/legal/terms"
            className="hover:text-blue-600 transition-colors font-medium"
            onClick={() => trackLinkClick('terms_conditions', '/legal/terms', 'footer')}
          >
            Terms &amp; Conditions
          </Link>
          <Link
            href="/legal/privacy"
            className="hover:text-blue-600 transition-colors font-medium"
            onClick={() => trackLinkClick('privacy_policy', '/legal/privacy', 'footer')}
          >
            Privacy policy
          </Link>
          <Link
            href="/affiliates"
            className="hover:text-blue-600 transition-colors font-medium"
            onClick={() => trackLinkClick('affiliate_program', '/affiliates', 'footer')}
          >
            Affiliate Program
          </Link>
          <Link
            href="/affiliate/dashboard"
            className="hover:text-blue-600 transition-colors font-medium"
            onClick={() => trackLinkClick('affiliate_login', '/affiliate/dashboard', 'footer')}
          >
            Affiliate Login
          </Link>
        </nav>
      </div>
    </footer>
  );
}
