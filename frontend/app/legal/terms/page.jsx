'use client';

import Link from 'next/link';
import {
  GENERAL_TERMS_SECTIONS,
  MODULE_TERMS,
  UNIFIED_MODULE_ORDER,
} from '@/lib/legal/unifiedLegal';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Terms &amp; Conditions</h1>
        <p className="text-gray-600 mb-8">
          Platform terms and module-specific terms in one document. Last updated: {new Date().toLocaleDateString()}
        </p>

        <div id="platform-general" className="bg-white rounded-lg shadow p-8 space-y-8 text-gray-700 mb-10">
          <h2 className="text-2xl font-semibold text-gray-900 border-b border-gray-200 pb-2">
            Tavari AI — general terms
          </h2>
          {GENERAL_TERMS_SECTIONS.map((section, index) => (
            <section key={index}>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">{section.title}</h3>
              <div className="space-y-2">{section.content}</div>
            </section>
          ))}
        </div>

        {UNIFIED_MODULE_ORDER.map((key) => {
          const mod = MODULE_TERMS[key];
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
