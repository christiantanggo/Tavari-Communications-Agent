'use client';

import { useState, useEffect } from 'react';
import { X, Lock } from 'lucide-react';
import { constructionAPI } from '@/lib/api';

export default function ConstructionUnlockModal({ open, onClose, onUnlocked }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setPin('');
      setError('');
      setSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const p = String(pin).replace(/\D/g, '').slice(0, 8);
    if (p.length < 4) {
      setError('Enter the team PIN.');
      return;
    }
    setSubmitting(true);
    try {
      await constructionAPI.unlock(p);
      onUnlocked?.();
      onClose?.();
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Unlock failed';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
      <div
        className="relative w-full max-w-md shadow-lg"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--card-radius)',
          border: '1px solid var(--color-border)',
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="construction-unlock-title"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 p-1 rounded transition-colors"
          style={{ color: 'var(--color-text-muted)' }}
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
        <form onSubmit={submit} className="p-6 pt-8">
          <div className="flex items-center gap-2 mb-2" style={{ color: 'var(--color-text-main)' }}>
            <Lock className="w-5 h-5" />
            <h2 id="construction-unlock-title" className="text-lg font-semibold">
              Construction dashboard
            </h2>
          </div>
          <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
            Enter the team PIN to open in-development modules. This session lasts about eight hours on this browser.
          </p>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-main)' }}>
            PIN
          </label>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            className="w-full px-3 py-2 text-lg tracking-widest mb-3"
            style={{
              borderRadius: 'var(--button-radius)',
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-background)',
              color: 'var(--color-text-main)',
            }}
            placeholder="••••"
            autoFocus
          />
          {error ? (
            <p className="text-sm mb-3" style={{ color: 'var(--color-danger)' }}>
              {error}
            </p>
          ) : null}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50"
              style={{
                backgroundColor: 'var(--color-accent)',
                borderRadius: 'var(--button-radius)',
              }}
            >
              {submitting ? 'Checking…' : 'Unlock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
