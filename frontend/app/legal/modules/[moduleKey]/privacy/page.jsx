'use client';

import Link from 'next/link';
import { notFound, useParams } from 'next/navigation';
import { MODULE_PRIVACY, resolveModuleLegalKey } from '@/lib/legal/unifiedLegal';

export default function ModulePrivacyPage() {
  const params = useParams();
  const raw = params?.moduleKey;
  const rawKey = Array.isArray(raw) ? raw[0] : raw;
  const moduleKey = resolveModuleLegalKey(rawKey);
  const privacy = MODULE_PRIVACY[moduleKey];

  if (!moduleKey || !privacy) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <p className="text-sm text-gray-600 mb-4">
          <Link href="/legal/privacy" className="text-blue-600 hover:underline font-medium">
            View full privacy policy (all modules)
          </Link>
        </p>
        <h1 className="text-4xl font-bold text-gray-900 mb-8">{privacy.moduleName} — privacy</h1>

        <div className="mb-6 text-sm text-gray-600 bg-white p-4 rounded-lg shadow">
          <p>
            <strong>Module:</strong> {privacy.moduleName}
          </p>
          <p>
            <strong>Version:</strong> {privacy.version}
          </p>
          <p>
            <strong>Last updated:</strong> {new Date().toLocaleDateString()}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-8 space-y-8 text-gray-700">
          {privacy.sections.map((section, index) => (
            <section key={index}>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">{section.title}</h2>
              <div className="space-y-2">{section.content}</div>
            </section>
          ))}
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200 bg-white p-6 rounded-lg shadow">
          <p className="text-sm text-gray-600 mb-4">
            This notice is part of Tavari&apos;s unified{' '}
            <Link href="/legal/privacy" className="text-blue-600 hover:underline">
              Privacy policy
            </Link>
            .
          </p>
          <Link href={`/legal/modules/${rawKey}/terms`} className="text-sm text-blue-600 hover:underline">
            Module terms →
          </Link>
        </div>
      </div>
    </div>
  );
}
