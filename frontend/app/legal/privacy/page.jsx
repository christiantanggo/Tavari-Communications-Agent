'use client';

import Link from 'next/link';
import {
  GENERAL_PRIVACY_SECTIONS,
  MODULE_PRIVACY,
  UNIFIED_MODULE_ORDER,
} from '@/lib/legal/unifiedLegal';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Privacy policy</h1>
        <p className="text-gray-600 mb-8">
          Platform privacy and module-specific notices in one document. Last updated:{' '}
          {new Date().toLocaleDateString()}
        </p>

        <div id="platform-general-privacy" className="bg-white rounded-lg shadow p-8 space-y-8 text-gray-700 mb-10">
          <h2 className="text-2xl font-semibold text-gray-900 border-b border-gray-200 pb-2">
            Tavari AI — general privacy policy
          </h2>
          {GENERAL_PRIVACY_SECTIONS.map((section, index) => (
            <section key={index}>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">{section.title}</h3>
              <div className="space-y-2">{section.content}</div>
            </section>
          ))}
        </div>

        {UNIFIED_MODULE_ORDER.map((key) => {
          const mod = MODULE_PRIVACY[key];
          if (!mod) return null;
          return (
            <div key={key} id={mod.id} className="bg-white rounded-lg shadow p-8 space-y-8 text-gray-700 mb-10">
              <h2 className="text-2xl font-semibold text-gray-900 border-b border-gray-200 pb-2">{mod.title}</h2>
              <p className="text-sm text-gray-500">
                Module: {mod.moduleName} · Version {mod.version}
              </p>
              {mod.sections.map((section, index) => (
                <section key={index}>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">{section.title}</h3>
                  <div className="space-y-2">{section.content}</div>
                </section>
              ))}
            </div>
          );
        })}

        <div className="mt-8">
          <Link href="/" className="text-blue-600 hover:underline">
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
