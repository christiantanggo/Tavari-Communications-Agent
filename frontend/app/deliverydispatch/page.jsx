'use client';

/**
 * Public last-mile delivery landing: delivery config (branding + CMS), form → POST /delivery-network/request, chat → delivery web intake.
 */
import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://api.tavarios.com').replace(/\/$/, '');
const CHAT_REPLY_DELAY_MS = 1100;

function getAffiliateRefFromCookie() {
  if (typeof document === 'undefined') return null;
  try {
    const cookies = document.cookie.split(';');
    const row = cookies.find((c) => c.trim().startsWith('tavari_affiliate_ref='));
    if (!row) return null;
    const v = decodeURIComponent(row.split('=').slice(1).join('=').trim());
    return v || null;
  } catch {
    return null;
  }
}
const CHAT_SESSION_STORAGE_KEY = 'delivery_dispatch_chat_session_id';

function getStoredChatSessionId() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(CHAT_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function setStoredChatSessionId(id) {
  if (typeof window === 'undefined' || !id) return;
  try {
    window.localStorage.setItem(CHAT_SESSION_STORAGE_KEY, id);
  } catch (_) {}
}

/** Human-readable NANP display; keeps tel: href as E.164. */
function formatPhoneForDisplay(e164) {
  if (!e164 || typeof e164 !== 'string') return '';
  const digits = e164.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    const r = digits.slice(1);
    return `+1 (${r.slice(0, 3)}) ${r.slice(3, 6)}-${r.slice(6)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return e164.trim();
}

async function chatIntake(sessionId, message) {
  const res = await fetch(`${API_URL}/api/v2/delivery-network/public/intake/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      message === undefined || message === ''
        ? sessionId
          ? { session_id: sessionId }
          : {}
        : { session_id: sessionId, message },
    ),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function useDeliveryPhone() {
  const [phone, setPhone] = useState('');
  useEffect(() => {
    fetch(`${API_URL}/api/v2/delivery-network/public/phone`)
      .then((r) => r.json())
      .then((d) => {
        const p = d?.phone && String(d.phone).trim() ? String(d.phone).trim() : '';
        if (p) setPhone(p);
      })
      .catch(() => {});
  }, []);
  const clean = phone.replace(/[^0-9+]/g, '');
  const e164 = clean.startsWith('+') ? clean : clean ? `+${clean}` : '';
  return {
    phone: e164,
    phoneDisplay: formatPhoneForDisplay(e164),
    telLink: e164 ? `tel:${e164}` : '#',
  };
}

function useWebsitePageContent(pageKey) {
  const [content, setContent] = useState(null);
  useEffect(() => {
    fetch(`${API_URL}/api/v2/delivery-network/public/website-page/${pageKey}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const raw = d && typeof d === 'object' ? d : null;
        const contentObj = raw && raw.content !== undefined ? raw.content : raw;
        setContent(contentObj && typeof contentObj === 'object' ? contentObj : null);
      })
      .catch(() => setContent(null));
  }, [pageKey]);
  return content;
}

const SITE_BRAND = 'Tavari Delivery Dispatch';
const FALLBACK_HEADER = SITE_BRAND;
const FALLBACK_SUB =
  'Reliable local package pickup and delivery in our service area only—not province-wide, statewide, Canada-wide, or international. Start with the online request when you can—we schedule fastest that way—or call us anytime.';

function DeliveryDispatchContent() {
  const searchParams = useSearchParams();
  const businessIdParam = searchParams.get('business_id')?.trim() || '';

  const { phone, phoneDisplay, telLink } = useDeliveryPhone();
  const pageContent = useWebsitePageContent('delivery-main');

  const [heroImageError, setHeroImageError] = useState(false);
  const contentRef = useRef(null);
  const formRef = useRef(null);

  const [chatOpen, setChatOpen] = useState(false);
  const [chatSessionId, setChatSessionId] = useState(() => getStoredChatSessionId());
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);
  const chatInputRef = useRef(null);
  const chatDelayTimerRef = useRef(null);
  const chatOverlayRef = useRef(null);

  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPickup, setFormPickup] = useState('');
  const [formPickupCity, setFormPickupCity] = useState('');
  const [formPickupProvince, setFormPickupProvince] = useState('');
  const [formPickupPostal, setFormPickupPostal] = useState('');
  const [formDelivery, setFormDelivery] = useState('');
  const [formCity, setFormCity] = useState('');
  const [formProvince, setFormProvince] = useState('');
  const [formPostal, setFormPostal] = useState('');
  const [formRecipient, setFormRecipient] = useState('');
  const [formRecipientPhone, setFormRecipientPhone] = useState('');
  const [formPackage, setFormPackage] = useState('');
  const [formPriority, setFormPriority] = useState('Schedule');
  const [formDate, setFormDate] = useState('');
  const [formTime, setFormTime] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState(null);
  const [formError, setFormError] = useState(null);
  const [formExpanded, setFormExpanded] = useState(false);

  const paidRef = searchParams.get('ref');
  const paidOk = searchParams.get('paid') === '1';
  const cancelled = searchParams.get('cancel') === '1';
  const itFromParams = (searchParams.get('it') || '').trim();
  const [intakeToken, setIntakeToken] = useState(itFromParams);

  const [phoneLockedFromSms, setPhoneLockedFromSms] = useState(false);
  const [intakeTokenStatus, setIntakeTokenStatus] = useState('idle'); // idle | loading | ok | error

  // Prefer Next searchParams; fall back to window (some clients/hydration edge cases drop `it` from hooks only).
  useEffect(() => {
    const fromWindow =
      typeof window === 'undefined' ? '' : (new URLSearchParams(window.location.search).get('it') || '').trim();
    setIntakeToken((itFromParams || fromWindow).trim());
  }, [itFromParams]);

  const heroImage = (pageContent?.hero_image_url && String(pageContent.hero_image_url).trim()) || null;
  const apiHeader = (pageContent?.hero_header && String(pageContent.hero_header).trim()) || '';
  const apiSubtext = (pageContent?.hero_subtext && String(pageContent.hero_subtext).trim()) || '';
  const heroHeader = apiHeader || FALLBACK_HEADER;
  const heroSubtext = apiSubtext || FALLBACK_SUB;
  const defaultButtons = [
    { label: 'Start here', url: '#form' },
    { label: 'Call now', url: 'tel' },
  ];
  const buttonsRaw = Array.isArray(pageContent?.buttons) && pageContent.buttons.length > 0 ? pageContent.buttons : defaultButtons;
  const buttons = buttonsRaw.filter((b) => {
    const u = (b.url || '').trim().toLowerCase();
    const lab = (b.label || '').trim().toLowerCase();
    if (u === 'sms' || lab === 'text us' || lab.startsWith('text us') || /^text\b/.test(lab)) return false;
    return true;
  });

  const expandFormAndScroll = useCallback(() => {
    setFormExpanded(true);
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  const isFormLinkButton = (btn) => {
    const u = (btn.url || '').trim().toLowerCase();
    return u === '#form' || u.endsWith('#form');
  };

  const isChatTriggerButton = (btn) => {
    if (isFormLinkButton(btn)) return false;
    const url = (btn.url || '').trim().toLowerCase();
    if (url === 'tel' || url === 'sms') return false;
    const label = (btn.label || '').trim();
    return /^(chat|message us|live chat)/i.test(label) || /\bchat\b/i.test(label);
  };

  const applyReplyAfterDelay = (reply, sessionId) => {
    if (chatDelayTimerRef.current) clearTimeout(chatDelayTimerRef.current);
    chatDelayTimerRef.current = setTimeout(() => {
      chatDelayTimerRef.current = null;
      setChatMessages((prev) => [...prev, { role: 'assistant', content: reply || '' }]);
      if (sessionId != null) {
        setChatSessionId(sessionId);
        setStoredChatSessionId(sessionId);
      }
      setChatLoading(false);
    }, CHAT_REPLY_DELAY_MS);
  };

  const startChatSession = () => {
    setChatLoading(true);
    const sid = chatSessionId || getStoredChatSessionId() || null;
    chatIntake(sid)
      .then((data) => {
        applyReplyAfterDelay(data.reply || '', data.session_id ?? sid);
      })
      .catch(() => {
        applyReplyAfterDelay("Sorry, we couldn't start chat. Call us or use the online request form on this page.", null);
      });
  };

  const openChat = () => {
    setChatOpen(true);
    if (chatMessages.length === 0) startChatSession();
  };

  const closeChat = (e) => {
    if (e && e.target !== chatOverlayRef.current) return;
    setChatOpen(false);
  };

  const sendChatMessage = (e) => {
    e.preventDefault();
    const text = (chatInput || '').trim();
    if (!text || chatLoading || !chatSessionId) return;
    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', content: text }]);
    setChatLoading(true);
    chatIntake(chatSessionId, text)
      .then((data) => {
        applyReplyAfterDelay(data.reply || '', data.session_id ?? chatSessionId);
      })
      .catch(() => {
        applyReplyAfterDelay('Something went wrong. Please try again or use the form.', chatSessionId);
      });
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    if (!chatOpen && chatDelayTimerRef.current) {
      clearTimeout(chatDelayTimerRef.current);
      chatDelayTimerRef.current = null;
    }
  }, [chatOpen]);

  useEffect(() => {
    if (chatOpen && !chatLoading) {
      const t = setTimeout(() => chatInputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [chatOpen, chatLoading, chatMessages]);

  useEffect(() => {
    if (!intakeToken) {
      setPhoneLockedFromSms(false);
      setIntakeTokenStatus('idle');
      return;
    }
    let cancelled = false;
    setIntakeTokenStatus('loading');
    fetch('/api/delivery-intake/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: intakeToken }),
    })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        return { ok: r.ok, j };
      })
      .then(({ ok, j }) => {
        if (cancelled) return;
        if (ok && j.phone_e164 && String(j.phone_e164).trim()) {
          setFormPhone(String(j.phone_e164).trim());
          setPhoneLockedFromSms(true);
          setIntakeTokenStatus('ok');
          setFormExpanded(true);
          setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
        } else {
          setPhoneLockedFromSms(false);
          setIntakeTokenStatus('error');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPhoneLockedFromSms(false);
          setIntakeTokenStatus('error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [intakeToken]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash === '#form') {
      expandFormAndScroll();
    }
  }, [expandFormAndScroll]);

  const submitForm = async (e) => {
    e.preventDefault();
    setFormError(null);
    setFormMessage(null);
    if (!formDelivery.trim()) {
      setFormError('Delivery street address is required.');
      return;
    }
    if (!formCity.trim() || !formProvince.trim() || !formPostal.trim()) {
      setFormError('Delivery city, province, and postal code are required.');
      return;
    }
    setFormSubmitting(true);
    try {
      const body = {
        phone: formPhone.trim(),
        callback_phone: formPhone.trim(),
        pickup_address: formPickup.trim() || null,
        pickup_city: formPickupCity.trim() || null,
        pickup_province: formPickupProvince.trim() || null,
        pickup_postal_code: formPickupPostal.trim() || null,
        delivery_address: formDelivery.trim(),
        delivery_city: formCity.trim(),
        delivery_province: formProvince.trim(),
        delivery_postal_code: formPostal.trim(),
        recipient_name: formRecipient.trim() || null,
        recipient_phone: formRecipientPhone.trim() || null,
        package_description: formPackage.trim() || null,
        special_instructions: formNotes.trim() || null,
        priority: formPriority,
        scheduled_date: formDate.trim() || null,
        scheduled_time: formTime.trim() || null,
        email: formEmail.trim() || null,
      };
      if (businessIdParam) body.business_id = businessIdParam;
      if (intakeToken && intakeTokenStatus === 'ok') {
        body.sms_intake_token = intakeToken;
      }
      const affiliateRef = getAffiliateRefFromCookie();
      if (affiliateRef) body.affiliate_code = affiliateRef;

      const res = await fetch(`${API_URL}/api/v2/delivery-network/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || res.statusText || 'Request failed');
      }
      if (data.payment_required && data.payment_link_url) {
        setFormMessage({
          type: 'pay',
          text: data.message || 'Complete payment to confirm your delivery.',
          ref: data.reference_number,
          url: data.payment_link_url,
          manageUrl: data.customer_manage_url || null,
          amountCents: typeof data.amount_quoted_cents === 'number' ? data.amount_quoted_cents : null,
          priceDisclaimer: data.price_disclaimer || null,
          quoteSource: data.quote_source || null,
        });
      } else {
        setFormMessage({
          type: 'ok',
          text: data.message || 'Thanks — we are scheduling your delivery.',
          ref: data.reference_number,
        });
        setFormDelivery('');
        setFormCity('');
        setFormProvince('');
        setFormPostal('');
        setFormPickup('');
        setFormPickupCity('');
        setFormPickupProvince('');
        setFormPickupPostal('');
        setFormPackage('');
        setFormNotes('');
      }
    } catch (err) {
      setFormError(err?.message || 'Could not submit. Please try again or call us.');
    } finally {
      setFormSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased">
      <header className="bg-slate-900 text-white">
        <div className="max-w-[900px] mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <span className="font-semibold text-base sm:text-lg tracking-tight">{SITE_BRAND}</span>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {phone && phoneDisplay && (
              <a
                href={telLink}
                className="text-lg sm:text-xl font-bold text-emerald-300 hover:text-emerald-200 tabular-nums whitespace-nowrap"
              >
                {phoneDisplay}
              </a>
            )}
            <Link href="/termsofservice" className="text-slate-400 text-sm hover:text-white transition-colors">
              Terms of Service
            </Link>
            <Link href="/" className="text-slate-400 text-sm hover:text-white transition-colors">
              Home
            </Link>
          </div>
        </div>
      </header>

      {paidOk && paidRef && (
        <div className="bg-emerald-50 border-b border-emerald-200 text-emerald-900 text-center text-sm py-3 px-4">
          Payment received. Your reference: <strong className="font-mono">{paidRef}</strong>. We will schedule your delivery shortly.
        </div>
      )}
      {cancelled && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 text-center text-sm py-3 px-4">
          Payment was cancelled. You can submit again when ready.
        </div>
      )}

      <section className="relative min-h-[260px] w-full flex items-center justify-center">
        <div className="absolute inset-0 z-0 bg-slate-900">
          {heroImage && !heroImageError && (
            <img
              src={heroImage}
              alt=""
              role="presentation"
              className="w-full h-full object-cover object-center"
              loading="eager"
              fetchPriority="high"
              onError={() => setHeroImageError(true)}
            />
          )}
        </div>
        <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/55 to-black/25 pointer-events-none" />
        <div className="relative z-20 w-full max-w-[900px] mx-auto px-4 py-12 text-center">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white drop-shadow-sm mb-3">{heroHeader}</h1>
          <p className="text-lg sm:text-xl text-white/95 max-w-2xl mx-auto mb-8 leading-relaxed">{heroSubtext}</p>
          {phone && phoneDisplay && (
            <div className="mb-8">
              <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300/95 mb-3">Call Tavari Delivery Dispatch</p>
              <a
                href={telLink}
                className="inline-block text-3xl sm:text-4xl md:text-5xl font-bold text-white tracking-wide drop-shadow-md hover:text-emerald-200 transition-colors break-words"
              >
                {phoneDisplay}
              </a>
            </div>
          )}
          {(phone || buttons.length > 0) && (
            <div className="flex flex-col items-center gap-4">
              {buttons.some((b) => (b.url || '').trim().toLowerCase() === 'tel') && phone && (
                <a
                  href={telLink}
                  className="inline-flex justify-center py-4 px-10 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold text-lg shadow-lg ring-2 ring-white/20 md:hidden"
                >
                  Tap to call now
                </a>
              )}
              <div className="flex flex-wrap gap-3 justify-center">
                {buttons.map((btn, i) => {
                  const url = (btn.url || '').trim().toLowerCase();
                  if (url === 'tel' || url === 'sms') return null;
                  const label = (btn.label || '').trim();
                  if (isFormLinkButton(btn)) {
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          expandFormAndScroll();
                        }}
                        className="inline-flex justify-center py-3 px-6 rounded-lg border-2 border-white/90 font-semibold text-white text-base hover:bg-white/10 transition-colors min-w-[200px]"
                      >
                        {label || 'Start here'}
                      </button>
                    );
                  }
                  if (isChatTriggerButton(btn)) {
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          openChat();
                        }}
                        className="inline-flex justify-center py-3 px-6 rounded-lg border-2 border-white/90 font-semibold text-white text-base hover:bg-white/10 transition-colors min-w-[200px]"
                      >
                        {label || 'Chat'}
                      </button>
                    );
                  }
                  return (
                    <a
                      key={i}
                      href={btn.url || '#'}
                      className="inline-flex justify-center py-3 px-6 rounded-lg border-2 border-white/90 font-semibold text-white text-base hover:bg-white/10 transition-colors min-w-[200px]"
                    >
                      {label || 'Link'}
                    </a>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      <section ref={contentRef} className="py-10 px-4">
        <div className="max-w-[720px] mx-auto">
          <div className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden ring-1 ring-emerald-600/15">
            <div id="form" ref={formRef}>
              <button
                type="button"
                onClick={() => setFormExpanded((x) => !x)}
                aria-expanded={formExpanded}
                aria-controls="delivery-request-form-panel"
                className="w-full flex items-center justify-between gap-4 p-5 sm:p-6 text-left hover:bg-emerald-50/40 transition-colors"
              >
                <span className="min-w-0 text-lg font-bold text-slate-900">Start here for your delivery</span>
                <span
                  className={`text-slate-400 text-xl shrink-0 transition-transform duration-200 ${formExpanded ? 'rotate-180' : ''}`}
                  aria-hidden
                >
                  ▼
                </span>
              </button>
              {formExpanded && (
                <div id="delivery-request-form-panel" className="px-6 pb-6 sm:px-8 sm:pb-8 pt-2 border-t border-slate-100">
                  <p className="text-sm text-slate-600 mb-6">
                    {businessIdParam
                      ? 'Submitting for your business account. We coordinate local deliveries in our service area only (not long-distance or cross-border).'
                      : 'Individuals: you will complete payment online before we dispatch. Businesses: dispatch starts after submit. Service is local in our area—not province-wide, statewide, or international.'}
                  </p>
                  <form onSubmit={submitForm} className="space-y-4">
              {intakeToken && intakeTokenStatus === 'loading' && (
                <p className="text-sm text-slate-600 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                  Confirming your number from the text link…
                </p>
              )}
              {intakeToken && intakeTokenStatus === 'error' && (
                <p className="text-sm text-amber-900 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                  This scheduling link is invalid or expired. Enter your phone below, or text us again for a new link.
                </p>
              )}
              <div>
                <label htmlFor="dd-phone" className="block text-sm font-medium text-slate-700 mb-1">
                  Your phone <span className="text-red-600">*</span>
                  {phoneLockedFromSms && (
                    <span className="ml-2 text-xs font-normal text-emerald-700">(from your SMS — cannot be changed)</span>
                  )}
                </label>
                <input
                  id="dd-phone"
                  type="tel"
                  required
                  readOnly={phoneLockedFromSms}
                  value={formPhone}
                  onChange={(e) => {
                    if (!phoneLockedFromSms) setFormPhone(e.target.value);
                  }}
                  className={`w-full rounded-lg border px-3 py-2 text-sm ${
                    phoneLockedFromSms
                      ? 'border-slate-200 bg-slate-100 text-slate-700 cursor-not-allowed'
                      : 'border-slate-300'
                  }`}
                  placeholder="+1…"
                  autoComplete="tel"
                  aria-readonly={phoneLockedFromSms || undefined}
                />
              </div>
              {!businessIdParam && (
                <div>
                  <label htmlFor="dd-email" className="block text-sm font-medium text-slate-700 mb-1">
                    Email (for payment link)
                  </label>
                  <input
                    id="dd-email"
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </div>
              )}
              <fieldset className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                <legend className="text-sm font-semibold text-slate-800 px-1">Pickup location (optional)</legend>
                <p className="text-xs text-slate-600 -mt-1 mb-1">
                  If different from your phone callback location; leave blank if we pick up from you in person.
                </p>
                <div>
                  <label htmlFor="dd-pickup-street" className="block text-sm font-medium text-slate-700 mb-1">
                    Street address
                  </label>
                  <input
                    id="dd-pickup-street"
                    type="text"
                    value={formPickup}
                    onChange={(e) => setFormPickup(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                    placeholder="Number and street"
                    autoComplete="street-address"
                  />
                </div>
                <div className="grid sm:grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="dd-pickup-city" className="block text-sm font-medium text-slate-700 mb-1">
                      City
                    </label>
                    <input
                      id="dd-pickup-city"
                      type="text"
                      value={formPickupCity}
                      onChange={(e) => setFormPickupCity(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                      autoComplete="address-level2"
                    />
                  </div>
                  <div>
                    <label htmlFor="dd-pickup-province" className="block text-sm font-medium text-slate-700 mb-1">
                      Province
                    </label>
                    <input
                      id="dd-pickup-province"
                      type="text"
                      value={formPickupProvince}
                      onChange={(e) => setFormPickupProvince(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                      placeholder="ON"
                      autoComplete="address-level1"
                    />
                  </div>
                  <div>
                    <label htmlFor="dd-pickup-postal" className="block text-sm font-medium text-slate-700 mb-1">
                      Postal code
                    </label>
                    <input
                      id="dd-pickup-postal"
                      type="text"
                      value={formPickupPostal}
                      onChange={(e) => setFormPickupPostal(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                      autoComplete="postal-code"
                    />
                  </div>
                </div>
              </fieldset>

              <fieldset className="space-y-3 rounded-lg border border-slate-200 p-4">
                <legend className="text-sm font-semibold text-slate-800 px-1">
                  Delivery location <span className="text-red-600 font-semibold">*</span>
                </legend>
                <div>
                  <label htmlFor="dd-delivery" className="block text-sm font-medium text-slate-700 mb-1">
                    Street address <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="dd-delivery"
                    type="text"
                    required
                    value={formDelivery}
                    onChange={(e) => setFormDelivery(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="Number and street"
                    autoComplete="street-address"
                  />
                </div>
                <div className="grid sm:grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="dd-city" className="block text-sm font-medium text-slate-700 mb-1">
                      City <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="dd-city"
                      type="text"
                      required
                      value={formCity}
                      onChange={(e) => setFormCity(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      autoComplete="address-level2"
                    />
                  </div>
                  <div>
                    <label htmlFor="dd-province" className="block text-sm font-medium text-slate-700 mb-1">
                      Province <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="dd-province"
                      type="text"
                      required
                      value={formProvince}
                      onChange={(e) => setFormProvince(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      placeholder="ON"
                      autoComplete="address-level1"
                    />
                  </div>
                  <div>
                    <label htmlFor="dd-postal" className="block text-sm font-medium text-slate-700 mb-1">
                      Postal code <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="dd-postal"
                      type="text"
                      required
                      value={formPostal}
                      onChange={(e) => setFormPostal(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      autoComplete="postal-code"
                    />
                  </div>
                </div>
              </fieldset>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="dd-recipient" className="block text-sm font-medium text-slate-700 mb-1">
                    Recipient name
                  </label>
                  <input
                    id="dd-recipient"
                    type="text"
                    value={formRecipient}
                    onChange={(e) => setFormRecipient(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="dd-recipient-phone" className="block text-sm font-medium text-slate-700 mb-1">
                    Recipient phone
                  </label>
                  <input
                    id="dd-recipient-phone"
                    type="tel"
                    value={formRecipientPhone}
                    onChange={(e) => setFormRecipientPhone(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="dd-pkg" className="block text-sm font-medium text-slate-700 mb-1">
                  Package / contents
                </label>
                <input
                  id="dd-pkg"
                  type="text"
                  value={formPackage}
                  onChange={(e) => setFormPackage(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="What we are moving"
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="dd-priority" className="block text-sm font-medium text-slate-700 mb-1">
                    Priority
                  </label>
                  <select
                    id="dd-priority"
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                  >
                    <option value="Schedule">Schedule</option>
                    <option value="Same Day">Same day</option>
                    <option value="Immediate">Immediate</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="dd-date" className="block text-sm font-medium text-slate-700 mb-1">
                      Date
                    </label>
                    <input
                      id="dd-date"
                      type="date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="dd-time" className="block text-sm font-medium text-slate-700 mb-1">
                      Time
                    </label>
                    <input
                      id="dd-time"
                      type="time"
                      value={formTime}
                      onChange={(e) => setFormTime(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label htmlFor="dd-notes" className="block text-sm font-medium text-slate-700 mb-1">
                  Special instructions
                </label>
                <textarea
                  id="dd-notes"
                  rows={3}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Door codes, fragile, etc."
                />
              </div>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              {formMessage?.type === 'ok' && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm p-4 space-y-2">
                  <p>
                    {formMessage.text}{' '}
                    {formMessage.ref && (
                      <span>
                        Reference: <strong className="font-mono">{formMessage.ref}</strong>
                      </span>
                    )}
                  </p>
                  {formMessage.manageUrl && (
                    <p className="text-slate-700 pt-1 border-t border-emerald-200/80">
                      If we need you to confirm a price or carrier, keep this link:{' '}
                      <a href={formMessage.manageUrl} className="font-semibold text-emerald-800 underline break-all">
                        open your delivery page
                      </a>
                      .
                    </p>
                  )}
                </div>
              )}
              {formMessage?.type === 'pay' && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-950 text-sm p-4 space-y-2">
                  <p>{formMessage.text}</p>
                  {formMessage.amountCents != null && Number.isFinite(formMessage.amountCents) && (
                    <p className="text-base font-semibold tabular-nums">
                      Total due:{' '}
                      ${(formMessage.amountCents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                      CAD
                    </p>
                  )}
                  {formMessage.priceDisclaimer && (
                    <p className="text-xs text-amber-900/80">{formMessage.priceDisclaimer}</p>
                  )}
                  {formMessage.ref && (
                    <p>
                      Reference: <strong className="font-mono">{formMessage.ref}</strong>
                    </p>
                  )}
                  {formMessage.url && (
                    <a
                      href={formMessage.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center py-2.5 px-4 rounded-lg bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700"
                    >
                      Pay securely
                    </a>
                  )}
                  {formMessage.manageUrl && (
                    <p className="text-amber-950/90 pt-2 border-t border-amber-200/80">
                      After paying, if we need a price or carrier confirmation, open:{' '}
                      <a href={formMessage.manageUrl} className="font-semibold text-emerald-800 underline break-all">
                        your delivery page
                      </a>
                      .
                    </p>
                  )}
                </div>
              )}
              <button
                type="submit"
                disabled={formSubmitting}
                className="w-full sm:w-auto py-3 px-8 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50"
              >
                {formSubmitting ? 'Submitting…' : 'Submit request'}
              </button>
            </form>
                </div>
              )}
            </div>
          </div>

          <p className="text-center text-slate-600 text-[15px] mt-6">
            Questions while you book?{' '}
            <button
              type="button"
              className="text-emerald-700 font-semibold underline underline-offset-2 hover:text-emerald-800"
              onClick={openChat}
            >
              Open chat
            </button>
          </p>
        </div>
      </section>

      <section className="bg-white border-t border-slate-200 py-10 px-4">
        <div className="max-w-[720px] mx-auto">
          <h2 className="text-lg font-bold text-slate-900 mb-4 text-center">How it works</h2>
          <ol className="list-decimal list-inside space-y-2 text-[15px] text-slate-700 leading-relaxed">
            <li>
              Start with the booking form, or call or chat. Pickup and drop-off must be in our local service area.
            </li>
            <li>We create your request and coordinate with our delivery partners for same-day or scheduled local routes.</li>
            <li>You receive updates by SMS/email when enabled, plus a tracking link when the carrier provides one.</li>
          </ol>
          <p className="mt-4 text-sm text-slate-600 text-center max-w-lg mx-auto">
            We do not offer province-wide, statewide, national, or international shipping—only local last-mile delivery.
          </p>
        </div>
      </section>

      <section className="border-t border-slate-200 py-10 px-4 bg-slate-50">
        <div className="max-w-[720px] mx-auto text-center text-[15px] text-slate-700">
          <h2 className="text-lg font-bold text-slate-900 mb-3">Need to cancel?</h2>
          <p className="leading-relaxed mb-2">
            Use the same phone number and delivery address you used when booking, plus the date you placed the request. Contact us if you need help locating your reference number.
          </p>
          <p className="text-slate-500 text-sm">Cancellation uses our automated matching; have your reference handy if possible.</p>
        </div>
      </section>

      <section className="border-t border-slate-200 py-10 px-4 bg-white">
        <div className="max-w-[720px] mx-auto">
          <h2 className="text-lg font-bold text-slate-900 mb-4 text-center">Questions</h2>
          <dl className="space-y-4 text-[15px] text-slate-700">
            <div>
              <dt className="font-semibold text-slate-900 mb-1">Who performs the delivery?</dt>
              <dd>Licensed third-party carriers (for example via Shipday or DoorDash Drive) may fulfill your route. Tavari coordinates the request.</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-900 mb-1">Can I track my package?</dt>
              <dd>When your carrier provides a tracking link, we include it in your notifications and delivery status page when available.</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="bg-slate-900 text-white py-6 px-4" aria-label="Delivery disclaimer">
        <div className="max-w-[900px] mx-auto text-center">
          <p className="text-[13px] text-slate-400 leading-relaxed">
            {SITE_BRAND} coordinates <strong className="text-slate-300 font-semibold">local</strong> last-mile deliveries only—not provincial, state-wide, national, or international. Carriers are independent third parties. Pricing and final terms may be confirmed before dispatch.
          </p>
        </div>
      </section>

      {chatOpen && (
        <div
          ref={chatOverlayRef}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40"
          onClick={closeChat}
          role="dialog"
          aria-modal="true"
          aria-label="Delivery chat"
        >
          <div
            className="w-full max-h-[90vh] sm:max-w-md sm:rounded-xl bg-white shadow-xl flex flex-col border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
              <span className="font-semibold text-slate-900">{SITE_BRAND}</span>
              <button type="button" onClick={() => setChatOpen(false)} className="p-1 rounded hover:bg-slate-200 text-slate-600" aria-label="Close">
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px] max-h-[50vh]">
              {chatMessages.map((msg, i) => (
                <div key={i} className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                      msg.role === 'user' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-800'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="rounded-lg px-3 py-2.5 bg-slate-100 text-slate-800 text-sm" aria-label="Typing">
                    <span className="inline-flex gap-1">
                      <span className="w-2 h-2 rounded-full bg-slate-400 animate-pulse" />
                      <span className="w-2 h-2 rounded-full bg-slate-400 animate-pulse" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 rounded-full bg-slate-400 animate-pulse" style={{ animationDelay: '300ms' }} />
                    </span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={sendChatMessage} className="p-4 border-t border-slate-200">
              <div className="flex gap-2">
                <input
                  ref={chatInputRef}
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Type your message…"
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={chatLoading || !chatSessionId}
                  aria-label="Chat message"
                />
                <button
                  type="submit"
                  disabled={chatLoading || !chatSessionId || !chatInput?.trim()}
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-medium text-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DeliveryDispatchPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-600 text-sm">Loading…</div>
      }
    >
      <DeliveryDispatchContent />
    </Suspense>
  );
}
