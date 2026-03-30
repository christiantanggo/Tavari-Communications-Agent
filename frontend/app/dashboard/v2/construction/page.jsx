'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import { ArrowRight, CheckCircle2, Lock } from 'lucide-react';
import { constructionAPI } from '@/lib/api';

function moduleHref(module) {
  if (module.subscribed) {
    if (module.key === 'phone-agent') return '/tavari-ai-phone/dashboard';
    if (module.key === 'reviews') return '/review-reply-ai/dashboard';
    if (module.key === 'delivery-dispatch' || module.key === 'emergency-dispatch') {
      return `/dashboard/v2/modules/${module.key}`;
    }
    return `/dashboard/v2/modules/${module.key}/dashboard`;
  }
  return `/dashboard/v2/modules/${module.key}`;
}

function getModuleLogo(moduleKey) {
  const logoMap = {
    'phone-agent': '/App-Logos/Tavari-Phone-Agent.png',
    reviews: '/App-Logos/Tavari-Review-Reply-AI.png',
  };
  return logoMap[moduleKey] || null;
}

function StatusBadge({ subscribed }) {
  if (subscribed) {
    return (
      <span
        className="px-2 py-1 text-xs font-medium flex items-center gap-1"
        style={{
          backgroundColor: 'rgba(20, 184, 166, 0.1)',
          color: 'var(--color-accent)',
          borderRadius: 'var(--button-radius)',
        }}
      >
        <CheckCircle2 className="w-3 h-3" /> Active
      </span>
    );
  }
  return (
    <span
      className="px-2 py-1 text-xs font-medium flex items-center gap-1"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.05)',
        color: 'var(--color-text-muted)',
        borderRadius: 'var(--button-radius)',
      }}
    >
      <Lock className="w-3 h-3" /> Available
    </span>
  );
}

function ModuleCard({ module }) {
  const logoPath = getModuleLogo(module.key);
  return (
    <div
      className="shadow transition-shadow overflow-hidden flex flex-col"
      style={{
        backgroundColor: 'var(--color-background)',
        borderRadius: 'var(--card-radius)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 10px 15px rgba(0,0,0,0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
      }}
    >
      {logoPath && (
        <div className="w-full h-48 flex items-center justify-center" style={{ backgroundColor: 'var(--color-background)' }}>
          <img src={logoPath} alt={module.name} className="w-full h-full object-contain" style={{ padding: '1rem' }} />
        </div>
      )}
      <div className="flex flex-col flex-1" style={{ padding: 'var(--padding-base)' }}>
        <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>
          {module.name}
        </h3>
        <div className="mb-3">
          <StatusBadge subscribed={module.subscribed} />
        </div>
        {module.description && (
          <p className="text-sm mb-4 flex-1" style={{ color: 'var(--color-text-muted)' }}>
            {module.description}
          </p>
        )}
        <div className="mt-auto">
          <Link
            href={moduleHref(module)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition-colors rounded w-full"
            style={{
              backgroundColor: 'var(--color-accent)',
              color: 'white',
              borderRadius: 'var(--button-radius)',
            }}
          >
            {module.subscribed ? (
              <>
                Open dashboard <ArrowRight className="w-4 h-4" />
              </>
            ) : (
              <>
                Learn more <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ConstructionDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [modules, setModules] = useState([]);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    setLocked(false);
    try {
      const { data } = await constructionAPI.getModules();
      setModules(data.modules || []);
    } catch (err) {
      if (err?.response?.status === 403 && err?.response?.data?.code === 'CONSTRUCTION_LOCKED') {
        setLocked(true);
      } else {
        setError(err?.response?.data?.error || err?.message || 'Failed to load');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const lockAndLeave = async () => {
    try {
      await constructionAPI.lock();
    } catch (_) {
      /* still navigate away */
    }
    router.push('/dashboard');
  };

  const activeModules = modules.filter((m) => m.subscribed && m.health_status !== 'offline');
  const availableModules = modules.filter((m) => !m.subscribed);

  return (
    <AuthGuard>
      <V2AppShell>
        <div className="mx-auto py-8" style={{ maxWidth: 'var(--max-content-width)', padding: 'var(--padding-base)' }}>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold mb-2" style={{ color: 'var(--color-text-main)' }}>
                Construction dashboard
              </h1>
              <p style={{ color: 'var(--color-text-muted)' }}>
                In-development modules (hidden from the main marketplace). Same subscriptions and routes as production.
              </p>
            </div>
            <button
              type="button"
              onClick={lockAndLeave}
              className="px-4 py-2 text-sm font-medium border transition-colors"
              style={{
                borderColor: 'var(--color-border)',
                borderRadius: 'var(--button-radius)',
                color: 'var(--color-text-muted)',
              }}
            >
              Lock &amp; leave
            </button>
          </div>

          <div
            className="mb-8 px-4 py-3 text-sm"
            style={{
              backgroundColor: 'rgba(250, 204, 21, 0.12)',
              border: '1px solid rgba(250, 204, 21, 0.35)',
              borderRadius: 'var(--card-radius)',
              color: 'var(--color-text-main)',
            }}
          >
            These modules are omitted from the standard module list until you release them (remove{' '}
            <code className="text-xs">CONSTRUCTION_MODULE_KEYS</code> or clear{' '}
            <code className="text-xs">metadata.construction_only</code> on the row).
          </div>

          {loading && (
            <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
          )}

          {!loading && locked && (
            <div
              className="p-8 text-center shadow"
              style={{ backgroundColor: 'var(--color-surface)', borderRadius: 'var(--card-radius)' }}
            >
              <Lock className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--color-text-muted)' }} />
              <p className="mb-4" style={{ color: 'var(--color-text-main)' }}>
                This area is locked. Tap the deployment line at the bottom of the sidebar and enter the team PIN.
              </p>
              <Link
                href="/dashboard"
                className="inline-block px-4 py-2 text-sm font-medium text-white"
                style={{ backgroundColor: 'var(--color-accent)', borderRadius: 'var(--button-radius)' }}
              >
                Back to marketplace
              </Link>
            </div>
          )}

          {!loading && !locked && error && (
            <div
              className="px-4 py-3 mb-6"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                color: 'var(--color-danger)',
                borderRadius: 'var(--card-radius)',
              }}
            >
              {error}
            </div>
          )}

          {!loading && !locked && !error && modules.length === 0 && (
            <div
              className="p-8 text-center shadow"
              style={{ backgroundColor: 'var(--color-surface)', borderRadius: 'var(--card-radius)' }}
            >
              <p style={{ color: 'var(--color-text-muted)' }}>
                No construction modules are configured. Set environment variable{' '}
                <code className="text-xs">CONSTRUCTION_MODULE_KEYS</code> (comma-separated keys) or mark a module with{' '}
                <code className="text-xs">metadata.construction_only: true</code>.
              </p>
            </div>
          )}

          {!loading && !locked && activeModules.length > 0 && (
            <div className="mb-10">
              <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--color-text-main)' }}>
                Active ({activeModules.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeModules.map((m) => (
                  <ModuleCard key={m.key} module={m} />
                ))}
              </div>
            </div>
          )}

          {!loading && !locked && availableModules.length > 0 && (
            <div className="mb-10">
              <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--color-text-main)' }}>
                Available ({availableModules.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {availableModules.map((m) => (
                  <ModuleCard key={m.key} module={m} />
                ))}
              </div>
            </div>
          )}
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}
