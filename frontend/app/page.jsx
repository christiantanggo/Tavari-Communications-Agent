'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { trackPageView, trackLinkClick, trackButtonClick } from '@/lib/analytics';
import { APP_DISPLAY_NAME } from '@/lib/appBrand';

const IS_DEFAULT_TAVARI_BRAND = APP_DISPLAY_NAME === 'Tavari Ai';

export default function TavariAILandingPage() {
  const [pageStartTime] = useState(Date.now());

  useEffect(() => {
    trackPageView('tavari-ai-homepage');
  }, []);

  // Get app logo path for module
  const getModuleLogo = (moduleKey) => {
    const logoMap = {
      'phone-agent': '/App-Logos/Tavari-Phone-Agent.png',
      'reviews': '/App-Logos/Tavari-Review-Reply-AI.png',
      // Add more modules as logo files are added
    };
    return logoMap[moduleKey] || null;
  };

  const modules = [
    {
      key: 'phone-agent',
      name: 'Tavari AI Phone Agent',
      slug: 'tavari-ai-phone',
      description: 'AI that answers your phone 24/7. Never miss a call, never lose a sale.',
      icon: '📞',
      color: 'blue',
      features: [
        '24/7 phone answering',
        'Answers FAQs automatically',
        'Captures messages instantly',
        'Setup in 10 minutes'
      ],
      cta: 'Try Free Demo',
      landingUrl: '/tavari-ai-phone/landing',
      ctaClassName: 'bg-blue-600 hover:bg-blue-700 text-white',
    },
    {
      key: 'last-mile-delivery',
      name: 'Tavari AI Last Mile Delivery',
      slug: 'delivery-dispatch',
      description:
        'Schedule pickups and deliveries by phone, SMS, or online form — with live tracking, carrier coordination, and proof of delivery.',
      icon: '🚚',
      color: 'emerald',
      features: [
        'Public booking page and SMS intake',
        'Shipday quotes and third-party carriers',
        'Status updates for your customers',
        'Proof of delivery when the stop completes',
      ],
      cta: 'Learn more',
      landingUrl: '/deliverydispatch',
      ctaClassName: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    },
    {
      key: 'reviews',
      name: 'Tavari AI Review Reply',
      slug: 'review-reply-ai',
      description: 'AI-powered review response generation. Respond to every review professionally and quickly.',
      icon: '⭐',
      color: 'yellow',
      features: [
        'Generate professional responses',
        'Multiple reply options',
        'Sentiment analysis',
        'Legal compliance checks'
      ],
      cta: 'Get Started',
      landingUrl: '/review-reply-ai/landing',
      ctaClassName: 'bg-amber-500 hover:bg-amber-600 text-gray-900',
    },
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="border-b border-gray-200 bg-white sticky top-0 z-50">
        <div className="container mx-auto px-3 sm:px-4 py-2 sm:py-4">
          <div className="flex justify-between items-center gap-2">
            <Link href="/" className="flex items-center min-w-0 shrink">
              {IS_DEFAULT_TAVARI_BRAND ? (
                <Image
                  src="/tavari-logo.png"
                  alt={APP_DISPLAY_NAME}
                  width={400}
                  height={114}
                  className="h-11 w-auto sm:h-16 md:h-24 lg:h-28"
                  priority
                />
              ) : (
                <span className="text-lg sm:text-2xl md:text-3xl font-bold text-blue-600 tracking-tight truncate">{APP_DISPLAY_NAME}</span>
              )}
            </Link>
            <div className="flex items-center shrink-0 space-x-3 sm:space-x-6">
              <Link 
                href="/login" 
                className="text-sm sm:text-base text-gray-700 hover:text-blue-600 font-medium transition-colors"
                onClick={() => trackLinkClick('login', '/login', 'navigation')}
              >
                Login
              </Link>
              <Link
                href="/signup"
                className="bg-blue-600 text-white text-sm sm:text-base px-3 py-2 sm:px-6 sm:py-2.5 rounded-lg hover:bg-blue-700 font-semibold transition-all shadow-sm hover:shadow-md whitespace-nowrap"
                onClick={() => trackButtonClick('get_started', 'navigation')}
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-3 sm:px-4">
        {/* Hero Section — short on phones (fixed 500px was ~75% of small viewports) */}
        <section className="relative w-full max-w-7xl mx-auto mb-10 sm:mb-14 md:mb-20 rounded-xl md:rounded-2xl overflow-hidden shadow-sm md:shadow-none">
          <div
            className="relative w-full min-h-[180px] h-[min(38vh,260px)] sm:min-h-[240px] sm:h-[min(42vh,340px)] md:min-h-[320px] md:h-[min(52vh,480px)] lg:h-[560px] xl:h-[600px]"
          >
            {IS_DEFAULT_TAVARI_BRAND ? (
              <Image
                src="/Tavari-AI-Hero-Image.png"
                alt={APP_DISPLAY_NAME}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1280px) min(100vw, 1280px), 1280px"
                className="object-cover object-[50%_22%] sm:object-[50%_28%] md:object-center"
                priority
              />
            ) : (
              <div
                className="absolute inset-0 bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700"
                aria-hidden
              />
            )}
            {/* Readability scrim + overlay CTAs only sm+; mobile CTAs sit in the row below */}
            <div
              className="absolute inset-x-0 bottom-0 hidden sm:block bg-gradient-to-t from-black/55 via-black/20 to-transparent pointer-events-none h-1/3"
              aria-hidden
            />
            <div className="absolute bottom-0 left-0 right-0 hidden sm:flex flex-row gap-4 justify-center items-center pb-8 md:pb-12 px-4">
              <Link
                href="/signup"
                className="bg-white text-gray-900 px-10 py-4 rounded-lg text-lg font-semibold hover:bg-gray-100 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 z-10 text-center"
                onClick={() => trackButtonClick('get_started_hero', 'hero_section')}
              >
                Get Started
              </Link>
              <Link
                href="#modules"
                className="bg-white text-gray-900 px-10 py-4 rounded-lg text-lg font-semibold hover:bg-gray-100 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 z-10 text-center"
                onClick={() => trackButtonClick('explore_modules', 'hero_section')}
              >
                Explore Modules
              </Link>
            </div>
          </div>
          {/* Mobile: one row under the hero image (no overlay on the photo) */}
          <div className="flex sm:hidden flex-row gap-2 px-3 py-3 bg-gray-50 border-t border-gray-200/80">
            <Link
              href="/signup"
              className="flex-1 min-w-0 text-center bg-white text-gray-900 px-3 py-3 rounded-lg text-sm font-semibold border border-gray-200 shadow-sm hover:bg-gray-50 transition-colors"
              onClick={() => trackButtonClick('get_started_hero', 'hero_section')}
            >
              Get Started
            </Link>
            <Link
              href="#modules"
              className="flex-1 min-w-0 text-center bg-white text-gray-900 px-3 py-3 rounded-lg text-sm font-semibold border border-gray-200 shadow-sm hover:bg-gray-50 transition-colors"
              onClick={() => trackButtonClick('explore_modules', 'hero_section')}
            >
              Explore Modules
            </Link>
          </div>
        </section>

        {/* Modules Section */}
        <section id="modules" className="py-12 sm:py-16 md:py-20">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-3 sm:mb-4 text-center px-1">
              Our AI Modules
            </h2>
            <p className="text-center text-gray-600 mb-12 max-w-2xl mx-auto">
              Choose the AI tools that fit your business needs. Each module is designed to solve specific communication challenges.
            </p>
            
            <div className="grid md:grid-cols-2 gap-8">
              {modules.map((module) => {
                const logoPath = getModuleLogo(module.key);
                return (
                  <div
                    key={module.key}
                    className="bg-white border-2 border-gray-200 rounded-2xl overflow-hidden hover:border-blue-500 transition-all hover:shadow-xl flex flex-col"
                  >
                    {/* App Logo at Top */}
                    {logoPath && (
                      <div className="w-full h-36 sm:h-48 flex items-center justify-center bg-gray-50">
                        <Image
                          src={logoPath}
                          alt={module.name}
                          width={400}
                          height={200}
                          className="w-full h-full object-contain"
                          style={{ padding: '1rem' }}
                        />
                      </div>
                    )}
                    
                    {/* Card Content */}
                    <div className="flex flex-col flex-1 p-5 sm:p-8">
                      <div className="mb-6">
                        <h3 className="text-2xl font-bold text-gray-900 mb-2">
                          {module.name}
                        </h3>
                        <p className="text-gray-600 mb-4">
                          {module.description}
                        </p>
                      </div>
                      
                      <ul className="space-y-2 mb-6 flex-1">
                        {module.features.map((feature, index) => (
                          <li key={index} className="flex items-center text-gray-700">
                            <svg className="w-5 h-5 text-blue-600 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            {feature}
                          </li>
                        ))}
                      </ul>
                      
                      <Link
                        href={module.landingUrl}
                        className={`block w-full text-center px-6 py-3 rounded-lg font-semibold transition-colors ${module.ctaClassName}`}
                        onClick={() => trackButtonClick(`explore_${module.key}`, 'modules_section')}
                      >
                        {module.cta} →
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Why Tavari Section */}
        <section className="py-12 sm:py-16 md:py-20 bg-gray-50 rounded-xl sm:rounded-2xl mb-10 sm:mb-14 md:mb-16">
          <div className="max-w-4xl mx-auto text-center px-4 sm:px-8">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-4 sm:mb-6">
              Why Choose {APP_DISPLAY_NAME}?
            </h2>
            <div className="grid md:grid-cols-3 gap-8 mt-12">
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Fast Setup</h3>
                <p className="text-gray-600">Get started in minutes, not days. No complex integrations required.</p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Secure & Reliable</h3>
                <p className="text-gray-600">Enterprise-grade security with 99.9% uptime guarantee.</p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Built for Small Business</h3>
                <p className="text-gray-600">Designed specifically for small businesses, not enterprise corporations.</p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-12 sm:py-16 md:py-20">
          <div className="max-w-4xl mx-auto text-center bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl sm:rounded-2xl p-6 sm:p-10 md:p-12 text-white">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 sm:mb-8">
              Ready to Get Started?
            </h2>
            <p className="text-base sm:text-lg md:text-xl mb-6 sm:mb-8 opacity-90 px-1">
              Choose a module and start automating your customer communications today.
            </p>
            <Link
              href="/signup"
              className="inline-block w-full max-w-sm sm:max-w-none sm:w-auto bg-white text-blue-600 px-6 py-3.5 sm:px-10 sm:py-4 rounded-lg text-base sm:text-lg font-semibold hover:bg-gray-100 transition-all shadow-lg hover:shadow-xl sm:transform sm:hover:-translate-y-0.5"
              onClick={() => trackButtonClick('get_started_final', 'final_cta_section')}
            >
              Get Started Now
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
