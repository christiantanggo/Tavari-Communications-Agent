'use client';

/**
 * Public link (customer_notify_token): confirm staged on-demand quote or pick a carrier after online form intake.
 * Dashboard uses authenticated routes; this page is for anonymous customers from /deliverydispatch.
 */
import { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://api.tavarios.com').replace(/\/$/, '');

const POLL_MS = 2800;
const POLL_MAX = 50;

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText || 'Request failed');
  return data;
}

function ConfirmDeliveryContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token')?.trim() || '';
  const paid = searchParams.get('paid') === '1';
  const refParam = searchParams.get('ref')?.trim() || '';

  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [estimates, setEstimates] = useState([]);
  const [optionsDisclaimer, setOptionsDisclaimer] = useState('');
  const [fleetAvailable, setFleetAvailable] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pollCount, setPollCount] = useState(0);

  const loadStatus = useCallback(async () => {
    if (!token) return;
    const j = await fetchJson(`${API_URL}/api/v2/delivery-network/public/delivery-actions/${encodeURIComponent(token)}`);
    setState(j);
    setLoadError(null);
    return j;
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        await loadStatus();
      } catch (e) {
        if (!cancelled) setLoadError(e?.message || 'Could not load delivery');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, loadStatus]);

  useEffect(() => {
    if (!token || !state) return;
    const s = state.status;
    if (s !== 'New' && s !== 'Contacting') return;
    if (pollCount >= POLL_MAX) return;
    const t = setTimeout(() => {
      setPollCount((c) => c + 1);
      loadStatus().catch((e) => setLoadError(e?.message || 'Refresh failed'));
    }, POLL_MS);
    return () => clearTimeout(t);
  }, [token, state, pollCount, loadStatus]);

  useEffect(() => {
    if (!token || !state || state.status !== 'ChoosingCarrier') return;
    let cancelled = false;
    setOptionsLoading(true);
    setActionError(null);
    fetchJson(`${API_URL}/api/v2/delivery-network/public/delivery-actions/${encodeURIComponent(token)}/carrier-options`)
      .then((j) => {
        if (cancelled) return;
        setEstimates(Array.isArray(j.estimates) ? j.estimates : []);
        setOptionsDisclaimer(j.disclaimer || '');
        setFleetAvailable(!!j.fleet_fallback_available);
      })
      .catch((e) => {
        if (!cancelled) setActionError(e?.message || 'Could not load carrier options');
      })
      .finally(() => {
        if (!cancelled) setOptionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, state?.status]);

  const postAction = async (path, body) => {
    setBusy(true);
    setActionError(null);
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 120000);
    try {
      await fetchJson(`${API_URL}/api/v2/delivery-network/public/delivery-actions/${encodeURIComponent(token)}${path}`, {
        method: 'POST',
        body: JSON.stringify(body || {}),
        signal: controller.signal,
      });
      await loadStatus();
    } catch (e) {
      setActionError(e?.message || 'Action failed');
    } finally {
      clearTimeout(tid);
      setBusy(false);
    }
  };

  const trackPageUrl = token ? `${API_URL}/api/v2/delivery-network/public/delivery/${encodeURIComponent(token)}` : '';

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-4">
          <p className="text-slate-600">This page needs a valid link from your booking confirmation.</p>
          <Link href="/deliverydispatch" className="text-emerald-700 font-semibold underline">
            Back to delivery request
          </Link>
        </div>
      </div>
    );
  }

  if (loadError && !state) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-4">
          <p className="text-red-600">{loadError}</p>
          <button
            type="button"
            onClick={() => {
              setLoadError(null);
              loadStatus().catch((e) => setLoadError(e?.message));
            }}
            className="text-emerald-700 font-semibold underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-600 text-sm">Loading…</div>
    );
  }

  const ref = state.reference_number || refParam || '—';
  const status = state.status;
  const doneIsh = ['Dispatched', 'Assigned', 'PickedUp', 'Completed', 'Failed', 'Cancelled'].includes(status);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased">
      <header className="bg-slate-900 text-white">
        <div className="max-w-[720px] mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <span className="font-semibold">Confirm your delivery</span>
          <Link href="/deliverydispatch" className="text-slate-400 text-sm hover:text-white">
            Request form
          </Link>
        </div>
      </header>

      <main className="max-w-[720px] mx-auto px-4 py-8 space-y-6">
        {paid && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm p-4">
            Payment received{refParam ? ` — reference ${refParam}` : ''}. We are finalizing your delivery; if a price or carrier
            needs your OK, use the buttons below.
          </div>
        )}

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500 mb-1">Reference</p>
          <p className="font-mono text-lg font-semibold text-slate-900">{ref}</p>
          <p className="mt-3 text-sm text-slate-600">
            Status: <strong className="text-slate-900">{status}</strong>
          </p>
        </div>

        {(status === 'New' || status === 'Contacting') && (
          <div className="rounded-lg bg-slate-100 border border-slate-200 text-slate-700 text-sm p-4">
            Scheduling your delivery with our partners… This page updates automatically. If nothing changes after a few minutes, call
            the number on the main delivery page.
            {pollCount >= POLL_MAX && (
              <span className="block mt-2 text-amber-800">Still working on it — refresh this page or contact us.</span>
            )}
          </div>
        )}

        {status === 'ConfirmingDelivery' && state.confirming_delivery && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 space-y-4">
            <h2 className="font-semibold text-amber-950">Confirm delivery price</h2>
            <p className="text-sm text-amber-950">
              {state.confirming_delivery.provider_label && (
                <span className="block mb-1">
                  Option: <strong>{state.confirming_delivery.provider_label}</strong>
                </span>
              )}
              {state.confirming_delivery.final_price_cad && (
                <span className="text-lg font-bold block">{state.confirming_delivery.final_price_cad}</span>
              )}
            </p>
            {state.confirming_delivery.disclaimer && (
              <p className="text-xs text-amber-900/90 leading-relaxed">{state.confirming_delivery.disclaimer}</p>
            )}
            {actionError && <p className="text-sm text-red-600">{actionError}</p>}
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => postAction('/confirm-quote', {})}
                className="py-2.5 px-5 rounded-lg bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy ? 'Confirming…' : 'Accept and dispatch'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => postAction('/reject-quote', {})}
                className="py-2.5 px-5 rounded-lg border border-slate-400 text-slate-800 font-medium text-sm hover:bg-slate-100 disabled:opacity-50"
              >
                Decline and cancel
              </button>
            </div>
          </div>
        )}

        {status === 'ChoosingCarrier' && (
          <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
            <h2 className="font-semibold text-slate-900">Choose a carrier</h2>
            {optionsDisclaimer && <p className="text-xs text-slate-600 leading-relaxed">{optionsDisclaimer}</p>}
            {optionsLoading && <p className="text-sm text-slate-600">Loading options…</p>}
            {actionError && <p className="text-sm text-red-600">{actionError}</p>}
            {!optionsLoading && estimates.length === 0 && !fleetAvailable && (
              <p className="text-sm text-slate-600">No third-party quotes are available right now. Try again shortly or call us.</p>
            )}
            <ul className="space-y-2">
              {estimates.map((e) => (
                <li key={`${e.estimate_id}-${e.provider_name}`}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      postAction('/confirm-carrier', {
                        provider_name: e.provider_name,
                        estimate_id: e.estimate_id || undefined,
                      })
                    }
                    className="w-full text-left rounded-lg border border-slate-200 px-4 py-3 hover:border-emerald-400 hover:bg-emerald-50/50 disabled:opacity-50"
                  >
                    <span className="font-medium text-slate-900">{e.provider_name}</span>
                    {e.price_cad && <span className="block text-sm text-slate-600">{e.price_cad}</span>}
                  </button>
                </li>
              ))}
            </ul>
            {fleetAvailable && (
              <button
                type="button"
                disabled={busy}
                onClick={() => postAction('/confirm-carrier', { mode: 'fleet' })}
                className="w-full sm:w-auto py-2.5 px-5 rounded-lg border border-slate-300 text-slate-800 font-medium text-sm hover:bg-slate-50 disabled:opacity-50"
              >
                Use our fleet instead
              </button>
            )}
          </div>
        )}

        {doneIsh && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm p-4 space-y-3">
            <p>
              {status === 'Cancelled'
                ? 'This delivery was cancelled.'
                : status === 'Failed'
                  ? 'This delivery could not be completed. Contact us if you need help.'
                  : 'Your delivery is moving. You can open the status page for tracking and proof of delivery when available.'}
            </p>
            {trackPageUrl && status !== 'Cancelled' && (
              <a
                href={trackPageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block font-semibold text-emerald-800 underline"
              >
                Open delivery status page
              </a>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default function ConfirmDeliveryPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-600 text-sm">Loading…</div>
      }
    >
      <ConfirmDeliveryContent />
    </Suspense>
  );
}
