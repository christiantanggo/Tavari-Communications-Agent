import { randomUUID } from 'crypto';
import { load as loadHtml } from 'cheerio';
import { supabaseClient } from '../config/database.js';
import { getApiPublicBaseUrl, getFrontendPublicBaseUrl } from '../config/public-urls.js';

const AI_SALES_SCOPE = 'tavari';
const MAIL_SEND_TIMEOUT_MS = 30000;
const WEBSITE_FETCH_TIMEOUT_MS = 10000;
const TRACKING_PIXEL_GIF = Buffer.from(
  'R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==',
  'base64'
);

const GOOGLE_PLACES_API_URL = 'https://places.googleapis.com/v1/places:searchText';
const DEFAULT_FOLLOWUP_SCHEDULE = [
  { step: 'initial', delay_days: 0 },
  { step: 'day2', delay_days: 1 },
  { step: 'day4', delay_days: 3 },
  { step: 'day7', delay_days: 6 },
];

function frontendUrl(path) {
  return `${getFrontendPublicBaseUrl().replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

function nowIso() {
  return new Date().toISOString();
}

function addDays(dateInput, days) {
  const d = new Date(dateInput);
  d.setDate(d.getDate() + Number(days || 0));
  return d;
}

function startOfTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function htmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/[^\d+]/g, '').trim();
  if (!digits) return '';
  return digits.startsWith('+') ? digits : `+${digits}`;
}

function normalizeBusinessName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|co|company)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCity(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeWebsite(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  try {
    const url = new URL(value.startsWith('http') ? value : `https://${value}`);
    url.hash = '';
    url.search = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function getWebsiteHost(raw) {
  const website = normalizeWebsite(raw);
  if (!website) return '';
  try {
    return new URL(website).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

function chooseDedupeKey(candidate) {
  if (candidate.website_host) return `host:${candidate.website_host}`;
  if (candidate.normalized_email) return `email:${candidate.normalized_email}`;
  if (candidate.normalized_phone) return `phone:${candidate.normalized_phone}`;
  return `namecity:${candidate.normalized_name || 'unknown'}:${candidate.city_key || 'unknown'}`;
}

function parseJsonObject(value, fallback = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}

function parseJsonArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}

function uniqStrings(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );
}

function getGooglePlacesApiKey() {
  return (
    String(process.env.GOOGLE_PLACES_API_KEY || '').trim() ||
    String(process.env.GOOGLE_MAPS_API_KEY || '').trim()
  );
}

function getMailSendApiKey() {
  return (
    String(process.env.SUPABASE_ANON_KEY || '').trim() ||
    String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  );
}

function moduleLabel(moduleKey) {
  switch (String(moduleKey || '').trim()) {
    case 'phone-agent':
      return 'Tavari AI Phone Agent';
    case 'emergency-dispatch':
      return 'Tavari AI Dispatch';
    case 'delivery-dispatch':
      return 'Tavari Last-Mile Delivery';
    default:
      return moduleKey || 'Tavari service';
  }
}

function defaultFaqs(moduleKey) {
  const shared = [
    { question: 'How long does setup take?', answer: 'Most businesses can get through setup in under 10 minutes.' },
    { question: 'Is there a contract?', answer: 'We keep it simple. Public terms and billing details are shown on the landing page for this service.' },
    { question: 'Can I cancel?', answer: 'Yes. The public landing page and terms explain the current cancellation policy for this service.' },
  ];
  if (moduleKey === 'phone-agent') {
    return [
      ...shared,
      { question: 'Do I need a new phone number?', answer: 'Not necessarily. The setup flow explains the current phone setup options available for AI Phone Agent.' },
    ];
  }
  if (moduleKey === 'emergency-dispatch') {
    return [
      ...shared,
      { question: 'Who is this for?', answer: 'Emergency Dispatch is aimed at service businesses that need urgent-call intake and dispatch coordination.' },
    ];
  }
  return [
    ...shared,
    { question: 'Who is this for?', answer: 'Delivery is aimed at restaurants and pharmacies that want a simpler dispatch and fulfillment workflow.' },
  ];
}

function defaultModuleConfigs() {
  return {
    'phone-agent': {
      enabled: true,
      service_name: 'Tavari AI Phone Agent',
      industries: ['Plumbers', 'HVAC', 'Electricians', 'Clinics', 'Restaurants'],
      cities: ['London'],
      province: 'Ontario',
      destination_url: frontendUrl('/ai-phone-agent'),
      pricing_summary: 'Current pricing and activation details are shown on the AI Phone Agent landing page.',
      public_faqs: defaultFaqs('phone-agent'),
    },
    'emergency-dispatch': {
      enabled: true,
      service_name: 'Tavari AI Dispatch',
      industries: ['Plumbers', 'Restoration', 'Locksmiths', 'Electricians'],
      cities: ['London'],
      province: 'Ontario',
      destination_url: frontendUrl('/ai-dispatch'),
      pricing_summary: 'Current pricing and activation details are shown on the AI Dispatch landing page.',
      public_faqs: defaultFaqs('emergency-dispatch'),
    },
    'delivery-dispatch': {
      enabled: true,
      service_name: 'Tavari Last-Mile Delivery',
      industries: ['Pharmacies', 'Restaurants'],
      cities: ['London'],
      province: 'Ontario',
      destination_url: frontendUrl('/delivery'),
      pricing_summary: 'Current pricing and activation details are shown on the Delivery landing page.',
      public_faqs: defaultFaqs('delivery-dispatch'),
    },
  };
}

function defaultSettingsShape() {
  return {
    scope: AI_SALES_SCOPE,
    is_enabled: true,
    sender_email: 'noreply@tavarios.ca',
    fallback_persona_name: 'Tavari AI',
    reply_to_email: process.env.AI_SALES_REPLY_TO_EMAIL || 'noreply@tavarios.ca',
    alert_email: process.env.AI_SALES_ALERT_EMAIL || '',
    refresh_after_days: 14,
    cooldown_days: 90,
    inbox_daily_cap: 20,
    domain_daily_cap: 50,
    auto_pause_on_degraded: false,
    module_configs: defaultModuleConfigs(),
  };
}

function defaultCampaignDefinitions(settings) {
  const moduleConfigs = parseJsonObject(settings?.module_configs);
  return [
    {
      module_key: 'phone-agent',
      name: 'AI Phone Agent - Ontario SMB Outreach',
      status: 'active',
      cta_url: moduleConfigs['phone-agent']?.destination_url || frontendUrl('/ai-phone-agent'),
      sender_display_name: settings?.fallback_persona_name || 'Tavari AI',
      subject_lines: [
        'A quick way to stop missing calls',
        'Question about after-hours call coverage',
        'Could Tavari help {{business_name}} answer more calls?',
      ],
      body_templates: [
        `Hi,\n\nI was looking at {{business_name}} and noticed you serve {{city}} businesses in {{category}}.\n\nTavari AI Phone Agent helps service businesses answer every call, handle FAQs, and move people into setup without needing a live receptionist.\n\nIf you want, you can see the public details and start setup here:\n{{cta_url}}\n\nIf you reply with questions, I can answer common setup and pricing questions right in this thread.\n\n{{sender_name}}`,
        `Hi,\n\n{{service_name}} is built for businesses like {{business_name}} that need better coverage when staff are busy or after hours.\n\nThe public page explains what it does, what setup looks like, and how to get live quickly:\n{{cta_url}}\n\nIf you'd like, I can also answer questions about pricing, setup time, or whether it's a fit.\n\n{{sender_name}}`,
      ],
      reply_faqs: moduleConfigs['phone-agent']?.public_faqs || defaultFaqs('phone-agent'),
    },
    {
      module_key: 'emergency-dispatch',
      name: 'AI Dispatch - Emergency Service Outreach',
      status: 'active',
      cta_url: moduleConfigs['emergency-dispatch']?.destination_url || frontendUrl('/ai-dispatch'),
      sender_display_name: settings?.fallback_persona_name || 'Tavari AI',
      subject_lines: [
        'A faster way to handle urgent dispatch calls',
        'Question about emergency dispatch intake',
        'Dispatch coverage for {{business_name}}',
      ],
      body_templates: [
        `Hi,\n\nTavari AI Dispatch is designed for businesses that handle urgent inbound requests and need a cleaner dispatch intake workflow.\n\nIf {{business_name}} is actively handling emergency or urgent service calls, this page shows the public details:\n{{cta_url}}\n\nIf you reply here, I can answer common setup and pricing questions.\n\n{{sender_name}}`,
      ],
      reply_faqs: moduleConfigs['emergency-dispatch']?.public_faqs || defaultFaqs('emergency-dispatch'),
    },
    {
      module_key: 'delivery-dispatch',
      name: 'Last-Mile Delivery - Pharmacy & Restaurant Outreach',
      status: 'active',
      cta_url: moduleConfigs['delivery-dispatch']?.destination_url || frontendUrl('/delivery'),
      sender_display_name: settings?.fallback_persona_name || 'Tavari AI',
      subject_lines: [
        'A simpler local delivery workflow',
        'Question about last-mile delivery setup',
        'Could this help {{business_name}} with local delivery?',
      ],
      body_templates: [
        `Hi,\n\nWe built {{service_name}} for pharmacies and restaurants that need a simpler way to manage local delivery requests.\n\nIf that’s relevant for {{business_name}}, the public page is here:\n{{cta_url}}\n\nIf you reply with questions, I can share the public pricing/setup details that are already on the site.\n\n{{sender_name}}`,
      ],
      reply_faqs: moduleConfigs['delivery-dispatch']?.public_faqs || defaultFaqs('delivery-dispatch'),
    },
  ];
}

function mergeSettings(row) {
  const defaults = defaultSettingsShape();
  const merged = {
    ...defaults,
    ...(row || {}),
  };
  merged.module_configs = {
    ...defaults.module_configs,
    ...parseJsonObject(row?.module_configs),
  };
  return merged;
}

function renderTemplate(template, vars) {
  return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => {
    const value = vars[key];
    return value == null ? '' : String(value);
  });
}

function plainTextToHtml(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .map((block) => `<p>${htmlEscape(block).replace(/\n/g, '<br />')}</p>`)
    .join('');
}

function selectVariant(list, seedValue = '') {
  const values = uniqStrings(list);
  if (!values.length) return { value: '', index: 0 };
  const seed = String(seedValue || '');
  let total = 0;
  for (let i = 0; i < seed.length; i += 1) total += seed.charCodeAt(i);
  const index = total % values.length;
  return { value: values[index], index };
}

function normalizeLeadRow(row) {
  return {
    ...row,
    module_scores: parseJsonObject(row?.module_scores),
    qualified_modules: parseJsonArray(row?.qualified_modules),
    source_payload: parseJsonObject(row?.source_payload),
  };
}

function computeLeadPriority(moduleScores) {
  const values = Object.values(parseJsonObject(moduleScores));
  if (values.some((entry) => entry?.priority === 'high')) return 'high';
  if (values.some((entry) => entry?.priority === 'medium')) return 'medium';
  return 'low';
}

function getQualifiedModules(moduleScores) {
  return Object.entries(parseJsonObject(moduleScores))
    .filter(([, value]) => value?.qualified)
    .map(([key]) => key);
}

function scoreLeadForModule(candidate, moduleKey, moduleConfig) {
  const targetIndustries = (moduleConfig?.industries || []).map((value) => String(value || '').toLowerCase());
  const targetCities = (moduleConfig?.cities || []).map((value) => String(value || '').toLowerCase());
  const leadCategory = String(candidate.category || '').toLowerCase();
  const leadCity = String(candidate.city || '').toLowerCase();

  let score = 0;
  const reasons = [];

  const industryMatch = targetIndustries.some((industry) => leadCategory.includes(industry.toLowerCase()));
  if (industryMatch) {
    score += 35;
    reasons.push('Industry matches the configured target list.');
  } else {
    reasons.push('Industry is outside the configured target list.');
  }

  if (candidate.website) {
    score += 15;
    reasons.push('Business has a website.');
  } else {
    reasons.push('No website found.');
  }

  if (candidate.phone) {
    score += 10;
    reasons.push('Business phone number found.');
  } else {
    reasons.push('No phone number found.');
  }

  if (candidate.verified_email) {
    score += 25;
    reasons.push('Verified email was found on a public source.');
  } else {
    reasons.push('No verified email found yet.');
  }

  if (!targetCities.length || targetCities.includes(leadCity)) {
    score += 15;
    reasons.push('Lead is inside the configured target location.');
  } else {
    reasons.push('Lead is outside the configured target location.');
  }

  if (candidate.source_provider === 'google-places') {
    score += 5;
    reasons.push('Lead came from a high-signal public source.');
  }

  const qualified = Boolean(candidate.verified_email) && score >= 60 && industryMatch;
  const priority = score >= 80 ? 'high' : score >= 60 ? 'medium' : 'low';

  return {
    module_key: moduleKey,
    score,
    qualified,
    priority,
    reasons,
    industry_match: industryMatch,
    city_match: !targetCities.length || targetCities.includes(leadCity),
    updated_at: nowIso(),
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = WEBSITE_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

function pickBestEmail(candidates, websiteHost = '') {
  const normalized = uniqStrings(candidates.map(normalizeEmail).filter(Boolean));
  if (!normalized.length) return '';
  const host = String(websiteHost || '').trim().toLowerCase();
  const ranked = normalized
    .map((email) => {
      const [local = '', domain = ''] = email.split('@');
      let score = 0;
      if (host && domain === host) score += 30;
      if (local === 'info' || local === 'hello' || local === 'contact' || local === 'office' || local === 'sales') score += 20;
      if (local === 'support') score += 10;
      if (local.startsWith('no-reply') || local.startsWith('noreply')) score -= 50;
      return { email, score };
    })
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.email || '';
}

function collectEmailsFromText(text) {
  const matches = String(text || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return matches.map((email) => email.replace(/[),.;]+$/g, ''));
}

async function discoverWebsiteEmail(website) {
  const normalized = normalizeWebsite(website);
  if (!normalized) return '';

  const host = getWebsiteHost(normalized);
  const pagesToVisit = [normalized];
  const visited = new Set();
  const discoveredEmails = [];

  while (pagesToVisit.length > 0 && visited.size < 3) {
    const url = pagesToVisit.shift();
    if (!url || visited.has(url)) continue;
    visited.add(url);

    try {
      const res = await fetchWithTimeout(url, {
        headers: { 'User-Agent': 'Tavari AI Sales Agent/1.0 (+https://www.tavarios.com)' },
      });
      if (!res.ok) continue;
      const html = await res.text();
      discoveredEmails.push(...collectEmailsFromText(html));

      const $ = loadHtml(html);
      $('a[href^="mailto:"]').each((_, node) => {
        const href = $(node).attr('href') || '';
        const email = href.replace(/^mailto:/i, '').split('?')[0];
        if (email) discoveredEmails.push(email);
      });

      const interestingLinks = [];
      $('a[href]').each((_, node) => {
        const href = $(node).attr('href') || '';
        const label = `${$(node).text() || ''} ${href}`.toLowerCase();
        if (!/(contact|about|support|team)/i.test(label)) return;
        try {
          const absolute = new URL(href, normalized).toString();
          if (getWebsiteHost(absolute) === host) interestingLinks.push(absolute);
        } catch {
          // Ignore malformed hrefs.
        }
      });

      for (const link of interestingLinks.slice(0, 2)) {
        if (!visited.has(link)) pagesToVisit.push(link);
      }
    } catch {
      // Ignore website fetch failures for lead enrichment.
    }
  }

  return pickBestEmail(discoveredEmails, host);
}

async function searchGooglePlaces(moduleKey, moduleConfig) {
  const apiKey = getGooglePlacesApiKey();
  if (!apiKey) {
    return [];
  }

  const industries = uniqStrings(moduleConfig?.industries || []);
  const cities = uniqStrings(moduleConfig?.cities || []);
  const province = String(moduleConfig?.province || 'Ontario').trim();
  const results = [];

  for (const city of cities) {
    for (const industry of industries) {
      try {
        const query = `${industry} in ${city}, ${province}, Canada`;
        const res = await fetchWithTimeout(
          GOOGLE_PLACES_API_URL,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': apiKey,
              'X-Goog-FieldMask':
                'places.id,places.displayName,places.formattedAddress,places.shortFormattedAddress,places.googleMapsUri,places.websiteUri,places.nationalPhoneNumber,places.primaryTypeDisplayName',
            },
            body: JSON.stringify({
              textQuery: query,
              maxResultCount: 10,
              regionCode: 'CA',
            }),
          },
          20000
        );

        if (!res.ok) {
          continue;
        }

        const json = await res.json().catch(() => ({}));
        const places = Array.isArray(json?.places) ? json.places : [];
        for (const place of places) {
          results.push({
            module_key: moduleKey,
            business_name: place?.displayName?.text || '',
            city,
            province,
            category: place?.primaryTypeDisplayName?.text || industry,
            website: place?.websiteUri || '',
            phone: place?.nationalPhoneNumber || '',
            source_provider: 'google-places',
            source_url: place?.googleMapsUri || '',
            source_payload: {
              place_id: place?.id || null,
              formatted_address: place?.formattedAddress || '',
              short_address: place?.shortFormattedAddress || '',
            },
          });
        }
      } catch (error) {
        console.warn('[AI Sales] Google Places query failed for', moduleKey, city, industry, error?.message || error);
      }
    }
  }

  return results;
}

async function findLeadByField(field, value) {
  if (!value) return null;
  const { data, error } = await supabaseClient
    .from('ai_sales_leads')
    .select('*')
    .eq(field, value)
    .limit(1);
  if (error) throw error;
  return data?.[0] ? normalizeLeadRow(data[0]) : null;
}

async function findLeadById(id) {
  if (!id) return null;
  const { data, error } = await supabaseClient
    .from('ai_sales_leads')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeLeadRow(data) : null;
}

async function findThreadById(id) {
  if (!id) return null;
  const { data, error } = await supabaseClient
    .from('ai_sales_threads')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function findExistingLead(candidate) {
  return (
    (await findLeadByField('website_host', candidate.website_host)) ||
    (await findLeadByField('normalized_email', candidate.normalized_email)) ||
    (await findLeadByField('normalized_phone', candidate.normalized_phone)) ||
    (candidate.normalized_name && candidate.city_key
      ? await supabaseClient
          .from('ai_sales_leads')
          .select('*')
          .eq('normalized_name', candidate.normalized_name)
          .eq('city', candidate.city)
          .limit(1)
          .then(({ data, error }) => {
            if (error) throw error;
            return data?.[0] ? normalizeLeadRow(data[0]) : null;
          })
      : null)
  );
}

function buildLeadCandidate(raw) {
  const website = normalizeWebsite(raw.website);
  const verifiedEmail = normalizeEmail(raw.verified_email);
  const city = String(raw.city || '').trim();
  return {
    scope: AI_SALES_SCOPE,
    business_name: String(raw.business_name || '').trim(),
    normalized_name: normalizeBusinessName(raw.business_name),
    city,
    city_key: normalizeCity(city),
    province: String(raw.province || 'Ontario').trim(),
    category: String(raw.category || '').trim(),
    website,
    website_host: getWebsiteHost(website),
    verified_email: verifiedEmail,
    normalized_email: verifiedEmail,
    phone: String(raw.phone || '').trim(),
    normalized_phone: normalizePhone(raw.phone),
    source_provider: String(raw.source_provider || '').trim(),
    source_url: String(raw.source_url || '').trim(),
    source_payload: parseJsonObject(raw.source_payload),
  };
}

function shouldRefreshLead(existing, settings) {
  if (!existing?.outreach_locked) return true;
  if (['replied', 'converted', 'suppressed'].includes(existing.overall_status)) return false;
  const refreshAfter = existing.refresh_after_at ? new Date(existing.refresh_after_at) : null;
  if (!refreshAfter || Number.isNaN(refreshAfter.getTime())) {
    return false;
  }
  return refreshAfter <= new Date();
}

async function upsertLeadCandidate(rawCandidate, moduleKey, settings) {
  const moduleConfig = parseJsonObject(settings?.module_configs)?.[moduleKey];
  const candidate = buildLeadCandidate(rawCandidate);
  if (!candidate.business_name) return { created: false, updated: false, lead: null };

  if (!candidate.verified_email && candidate.website) {
    candidate.verified_email = await discoverWebsiteEmail(candidate.website);
    candidate.normalized_email = normalizeEmail(candidate.verified_email);
  }

  candidate.dedupe_key = chooseDedupeKey(candidate);

  const scoreEntry = scoreLeadForModule(candidate, moduleKey, moduleConfig || {});
  const existing = await findExistingLead(candidate);
  const timestamp = nowIso();

  if (!existing) {
    const moduleScores = { [moduleKey]: scoreEntry };
    const insertPayload = {
      scope: AI_SALES_SCOPE,
      business_name: candidate.business_name,
      normalized_name: candidate.normalized_name,
      dedupe_key: candidate.dedupe_key,
      city: candidate.city,
      province: candidate.province,
      category: candidate.category,
      website: candidate.website,
      website_host: candidate.website_host,
      verified_email: candidate.verified_email || null,
      normalized_email: candidate.normalized_email || null,
      phone: candidate.phone || null,
      normalized_phone: candidate.normalized_phone || null,
      source_provider: candidate.source_provider || null,
      source_url: candidate.source_url || null,
      source_payload: candidate.source_payload,
      module_scores: moduleScores,
      qualified_modules: getQualifiedModules(moduleScores),
      overall_status: scoreEntry.qualified ? 'qualified' : 'discovered',
      qualification_priority: computeLeadPriority(moduleScores),
      refresh_after_at: addDays(timestamp, Number(settings?.refresh_after_days || 14)).toISOString(),
      created_at: timestamp,
      updated_at: timestamp,
    };
    const { data, error } = await supabaseClient
      .from('ai_sales_leads')
      .insert(insertPayload)
      .select()
      .single();
    if (error) throw error;
    return { created: true, updated: false, lead: normalizeLeadRow(data) };
  }

  const existingScores = parseJsonObject(existing.module_scores);
  const mergedScores = { ...existingScores, [moduleKey]: scoreEntry };
  const basePatch = {
    module_scores: mergedScores,
    qualified_modules: getQualifiedModules(mergedScores),
    qualification_priority: computeLeadPriority(mergedScores),
    updated_at: timestamp,
  };

  if (shouldRefreshLead(existing, settings)) {
    Object.assign(basePatch, {
      business_name: candidate.business_name || existing.business_name,
      normalized_name: candidate.normalized_name || existing.normalized_name,
      city: candidate.city || existing.city,
      province: candidate.province || existing.province,
      category: candidate.category || existing.category,
      website: candidate.website || existing.website,
      website_host: candidate.website_host || existing.website_host,
      verified_email: candidate.verified_email || existing.verified_email,
      normalized_email: candidate.normalized_email || existing.normalized_email,
      phone: candidate.phone || existing.phone,
      normalized_phone: candidate.normalized_phone || existing.normalized_phone,
      source_provider: candidate.source_provider || existing.source_provider,
      source_url: candidate.source_url || existing.source_url,
      source_payload: {
        ...parseJsonObject(existing.source_payload),
        ...candidate.source_payload,
      },
      refresh_after_at: addDays(timestamp, Number(settings?.refresh_after_days || 14)).toISOString(),
    });
  }

  if (existing.overall_status === 'discovered' && scoreEntry.qualified) {
    basePatch.overall_status = 'qualified';
  }

  const { data, error } = await supabaseClient
    .from('ai_sales_leads')
    .update(basePatch)
    .eq('id', existing.id)
    .select()
    .single();
  if (error) throw error;
  return { created: false, updated: true, lead: normalizeLeadRow(data) };
}

async function loadSettingsRow() {
  const { data, error } = await supabaseClient
    .from('ai_sales_settings')
    .select('*')
    .eq('scope', AI_SALES_SCOPE)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function ensureAISalesSettings() {
  let row = await loadSettingsRow();
  if (!row) {
    const defaults = defaultSettingsShape();
    const { data, error } = await supabaseClient
      .from('ai_sales_settings')
      .insert(defaults)
      .select()
      .single();
    if (error) throw error;
    row = data;
  }
  const settings = mergeSettings(row);
  await ensureDefaultAISalesCampaigns(settings);
  return settings;
}

export async function updateAISalesSettings(patch) {
  const current = await ensureAISalesSettings();
  const moduleConfigs = {
    ...current.module_configs,
    ...parseJsonObject(patch?.module_configs),
  };
  const updatePayload = {
    is_enabled: patch?.is_enabled ?? current.is_enabled,
    sender_email: String(patch?.sender_email || current.sender_email || '').trim() || current.sender_email,
    fallback_persona_name:
      String(patch?.fallback_persona_name || current.fallback_persona_name || '').trim() || current.fallback_persona_name,
    reply_to_email: String(patch?.reply_to_email || current.reply_to_email || '').trim() || null,
    alert_email: String(patch?.alert_email || current.alert_email || '').trim() || null,
    refresh_after_days: Number(patch?.refresh_after_days ?? current.refresh_after_days ?? 14),
    cooldown_days: Number(patch?.cooldown_days ?? current.cooldown_days ?? 90),
    inbox_daily_cap: Number(patch?.inbox_daily_cap ?? current.inbox_daily_cap ?? 20),
    domain_daily_cap: Number(patch?.domain_daily_cap ?? current.domain_daily_cap ?? 50),
    auto_pause_on_degraded: patch?.auto_pause_on_degraded ?? current.auto_pause_on_degraded ?? false,
    module_configs: moduleConfigs,
    updated_at: nowIso(),
  };

  const { data, error } = await supabaseClient
    .from('ai_sales_settings')
    .update(updatePayload)
    .eq('scope', AI_SALES_SCOPE)
    .select()
    .single();
  if (error) throw error;
  await ensureDefaultAISalesCampaigns(mergeSettings(data));
  return mergeSettings(data);
}

export async function ensureDefaultAISalesCampaigns(settingsInput = null) {
  const settings = settingsInput || (await ensureAISalesSettings());
  const defaults = defaultCampaignDefinitions(settings);
  const { data, error } = await supabaseClient
    .from('ai_sales_campaigns')
    .select('id, module_key')
    .eq('scope', AI_SALES_SCOPE);
  if (error) throw error;

  const existingByModule = new Set((data || []).map((row) => String(row.module_key || '').trim()));
  const inserts = defaults
    .filter((campaign) => !existingByModule.has(campaign.module_key))
    .map((campaign) => ({
      scope: AI_SALES_SCOPE,
      module_key: campaign.module_key,
      name: campaign.name,
      status: campaign.status,
      cta_url: campaign.cta_url,
      sender_display_name: campaign.sender_display_name,
      subject_lines: campaign.subject_lines,
      body_templates: campaign.body_templates,
      filters: {
        cities: settings.module_configs[campaign.module_key]?.cities || [],
        industries: settings.module_configs[campaign.module_key]?.industries || [],
      },
      followup_schedule: DEFAULT_FOLLOWUP_SCHEDULE,
      reply_faqs: campaign.reply_faqs,
      settings: { module_key: campaign.module_key },
    }));

  if (inserts.length) {
    const result = await supabaseClient.from('ai_sales_campaigns').insert(inserts);
    if (result.error) throw result.error;
  }
}

export async function listAISalesCampaigns() {
  const { data, error } = await supabaseClient
    .from('ai_sales_campaigns')
    .select('*')
    .eq('scope', AI_SALES_SCOPE)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map((row) => ({
    ...row,
    subject_lines: parseJsonArray(row.subject_lines),
    body_templates: parseJsonArray(row.body_templates),
    filters: parseJsonObject(row.filters),
    followup_schedule: parseJsonArray(row.followup_schedule, DEFAULT_FOLLOWUP_SCHEDULE),
    reply_faqs: parseJsonArray(row.reply_faqs),
    settings: parseJsonObject(row.settings),
  }));
}

export async function upsertAISalesCampaign(payload) {
  const insertPayload = {
    scope: AI_SALES_SCOPE,
    module_key: String(payload?.module_key || '').trim(),
    name: String(payload?.name || '').trim(),
    status: String(payload?.status || 'active').trim() || 'active',
    cta_url: String(payload?.cta_url || '').trim() || null,
    sender_display_name: String(payload?.sender_display_name || '').trim() || null,
    subject_lines: uniqStrings(payload?.subject_lines),
    body_templates: uniqStrings(payload?.body_templates),
    filters: parseJsonObject(payload?.filters),
    followup_schedule: parseJsonArray(payload?.followup_schedule, DEFAULT_FOLLOWUP_SCHEDULE),
    reply_faqs: parseJsonArray(payload?.reply_faqs),
    settings: parseJsonObject(payload?.settings),
    updated_at: nowIso(),
  };

  if (!insertPayload.module_key || !insertPayload.name) {
    const error = new Error('module_key and name are required');
    error.statusCode = 400;
    throw error;
  }

  if (!insertPayload.subject_lines.length || !insertPayload.body_templates.length) {
    const error = new Error('At least one subject line and one body template are required');
    error.statusCode = 400;
    throw error;
  }

  if (payload?.id) {
    const { data, error } = await supabaseClient
      .from('ai_sales_campaigns')
      .update(insertPayload)
      .eq('id', payload.id)
      .eq('scope', AI_SALES_SCOPE)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabaseClient
    .from('ai_sales_campaigns')
    .insert(insertPayload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateAISalesCampaignStatus(id, status) {
  const { data, error } = await supabaseClient
    .from('ai_sales_campaigns')
    .update({ status, updated_at: nowIso() })
    .eq('id', id)
    .eq('scope', AI_SALES_SCOPE)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listAISalesLeads() {
  const { data, error } = await supabaseClient
    .from('ai_sales_leads')
    .select('*')
    .eq('scope', AI_SALES_SCOPE)
    .order('updated_at', { ascending: false })
    .limit(1000);
  if (error) throw error;
  return (data || []).map(normalizeLeadRow);
}

export async function listAISalesThreads() {
  const { data, error } = await supabaseClient
    .from('ai_sales_threads')
    .select('*')
    .eq('scope', AI_SALES_SCOPE)
    .order('updated_at', { ascending: false })
    .limit(250);
  if (error) throw error;
  return (data || []).map((row) => ({
    ...row,
    metadata: parseJsonObject(row.metadata),
  }));
}

async function listTouchpointsForStats() {
  const { data, error } = await supabaseClient
    .from('ai_sales_touchpoints')
    .select('*')
    .eq('scope', AI_SALES_SCOPE)
    .order('created_at', { ascending: false })
    .limit(5000);
  if (error) throw error;
  return data || [];
}

async function loadConvertedLeadEmailSet() {
  const leads = await listAISalesLeads();
  const emails = leads.map((lead) => normalizeEmail(lead.verified_email)).filter(Boolean);
  if (!emails.length) return new Set();
  const { data, error } = await supabaseClient
    .from('businesses')
    .select('email, package_id, stripe_subscription_id, stripe_customer_id')
    .in('email', emails);
  if (error) throw error;
  return new Set(
    (data || [])
      .filter(
        (row) =>
          normalizeEmail(row.email) &&
          (row.package_id || row.stripe_subscription_id || row.stripe_customer_id)
      )
      .map((row) => normalizeEmail(row.email))
  );
}

export async function getAISalesOverview() {
  const [settings, campaigns, leads, threads, touchpoints, convertedEmailSet] = await Promise.all([
    ensureAISalesSettings(),
    listAISalesCampaigns(),
    listAISalesLeads(),
    listAISalesThreads(),
    listTouchpointsForStats(),
    loadConvertedLeadEmailSet(),
  ]);

  const stats = {
    total_leads: leads.length,
    qualified_leads: leads.filter((lead) => lead.qualified_modules.length > 0).length,
    sent: touchpoints.filter((row) => row.sent_at).length,
    opened: touchpoints.filter((row) => row.opened_at).length,
    clicked: touchpoints.filter((row) => row.clicked_at).length,
    replied: threads.filter((row) => ['replied', 'escalated', 'closed'].includes(row.status)).length,
    conversions: leads.filter((lead) => convertedEmailSet.has(normalizeEmail(lead.verified_email))).length,
  };

  const campaignPerformance = campaigns.map((campaign) => {
    const rows = touchpoints.filter((touchpoint) => touchpoint.campaign_id === campaign.id);
    const sent = rows.filter((row) => row.sent_at).length;
    const opened = rows.filter((row) => row.opened_at).length;
    const clicked = rows.filter((row) => row.clicked_at).length;
    const replied = rows.filter((row) => row.replied_at).length;
    return {
      campaign_id: campaign.id,
      name: campaign.name,
      module_key: campaign.module_key,
      status: campaign.status,
      sent,
      opened,
      clicked,
      replied,
      open_rate: sent ? Number(((opened / sent) * 100).toFixed(1)) : 0,
      click_rate: sent ? Number(((clicked / sent) * 100).toFixed(1)) : 0,
      reply_rate: sent ? Number(((replied / sent) * 100).toFixed(1)) : 0,
    };
  });

  return {
    settings,
    stats,
    campaigns,
    leads,
    threads,
    campaign_performance: campaignPerformance,
  };
}

async function createRun(runType, details = {}) {
  const { data, error } = await supabaseClient
    .from('ai_sales_runs')
    .insert({
      scope: AI_SALES_SCOPE,
      run_type: runType,
      status: 'running',
      details,
      started_at: nowIso(),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function hasCompletedRunToday(runType) {
  const { count, error } = await supabaseClient
    .from('ai_sales_runs')
    .select('id', { count: 'exact', head: true })
    .eq('scope', AI_SALES_SCOPE)
    .eq('run_type', runType)
    .eq('status', 'completed')
    .gte('started_at', startOfTodayIso());
  if (error) throw error;
  return Number(count || 0) > 0;
}

async function completeRun(runId, status, details = {}) {
  const { error } = await supabaseClient
    .from('ai_sales_runs')
    .update({
      status,
      details,
      finished_at: nowIso(),
    })
    .eq('id', runId);
  if (error) throw error;
}

function applyCampaignFilters(lead, campaign) {
  const filters = parseJsonObject(campaign?.filters);
  const cityFilters = (filters.cities || []).map((value) => String(value || '').toLowerCase());
  const industryFilters = (filters.industries || []).map((value) => String(value || '').toLowerCase());
  if (cityFilters.length && !cityFilters.includes(String(lead.city || '').toLowerCase())) return false;
  if (
    industryFilters.length &&
    !industryFilters.some((value) => String(lead.category || '').toLowerCase().includes(value))
  ) {
    return false;
  }
  return true;
}

async function getTouchpointsSentToday(campaignId = null) {
  let query = supabaseClient
    .from('ai_sales_touchpoints')
    .select('id', { count: 'exact', head: true })
    .eq('scope', AI_SALES_SCOPE)
    .gte('sent_at', startOfTodayIso());
  if (campaignId) query = query.eq('campaign_id', campaignId);
  const { count, error } = await query;
  if (error) throw error;
  return Number(count || 0);
}

async function getExistingCampaignTouchpoint(leadId, campaignId, stepKey) {
  const { data, error } = await supabaseClient
    .from('ai_sales_touchpoints')
    .select('*')
    .eq('scope', AI_SALES_SCOPE)
    .eq('lead_id', leadId)
    .eq('campaign_id', campaignId)
    .eq('step_key', stepKey)
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

async function getOrCreateThread(lead, campaign) {
  const { data, error } = await supabaseClient
    .from('ai_sales_threads')
    .select('*')
    .eq('scope', AI_SALES_SCOPE)
    .eq('lead_id', lead.id)
    .eq('campaign_id', campaign.id)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  const existing = data?.[0];
  if (existing) return existing;

  const insert = await supabaseClient
    .from('ai_sales_threads')
    .insert({
      scope: AI_SALES_SCOPE,
      lead_id: lead.id,
      campaign_id: campaign.id,
      module_key: campaign.module_key,
      status: 'active',
      created_at: nowIso(),
      updated_at: nowIso(),
    })
    .select()
    .single();
  if (insert.error) throw insert.error;
  return insert.data;
}

async function invokeMailSend(payload) {
  const baseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const url = `${baseUrl}/functions/v1/mail-send`;
  const apiKey = getMailSendApiKey();
  if (!baseUrl || !apiKey) {
    throw new Error('Supabase mail-send environment is not configured');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MAIL_SEND_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(json?.error || `mail-send failed with ${response.status}`);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

function buildOutboundContent({ lead, campaign, settings, moduleConfig, touchpoint, stepKey }) {
  const senderName = campaign.sender_display_name || settings.fallback_persona_name || 'Tavari AI';
  const subjectVariant = selectVariant(campaign.subject_lines, `${lead.id}:${stepKey}`);
  const bodyVariant = selectVariant(campaign.body_templates, `${lead.id}:${stepKey}:body`);
  const baseCtaUrl = String(campaign.cta_url || moduleConfig?.destination_url || '').trim();
  const trackedCtaUrl = baseCtaUrl
    ? `${getApiPublicBaseUrl().replace(/\/$/, '')}/api/ai-sales-agent/t/${touchpoint.click_token}/click`
    : '';

  let followupNote = '';
  if (stepKey !== 'initial') {
    if (touchpoint.metadata?.prior_opened && !touchpoint.metadata?.prior_clicked) {
      followupNote = '\n\nI noticed you opened the earlier note. If it helps, I can answer the common setup questions right here instead of sending you elsewhere.';
    } else if (touchpoint.metadata?.prior_clicked) {
      followupNote = '\n\nSince you already looked at the page, the fastest next step is to continue here if the service looks relevant.';
    } else {
      followupNote = '\n\nWanted to follow up in case this is something your team has been meaning to tighten up.';
    }
  }

  const vars = {
    business_name: lead.business_name,
    category: lead.category || 'your industry',
    city: lead.city || 'your area',
    service_name: moduleConfig?.service_name || moduleLabel(campaign.module_key),
    cta_url: trackedCtaUrl || baseCtaUrl,
    sender_name: senderName,
  };

  const subject = renderTemplate(subjectVariant.value, vars).trim();
  const bodyTextCore = renderTemplate(bodyVariant.value, vars).trim() + followupNote;
  const unsubscribeLine = '\n\nIf this is not relevant, just reply and I will stop the follow-up sequence.';
  const bodyText = `${bodyTextCore}${unsubscribeLine}`.trim();
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #111827;">
      ${plainTextToHtml(bodyText)}
      ${
        trackedCtaUrl
          ? `<p style="margin-top: 24px;"><a href="${htmlEscape(
              trackedCtaUrl
            )}" style="display:inline-block;background:#0d9488;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">Start Setup</a></p>`
          : ''
      }
      <img src="${htmlEscape(
        `${getApiPublicBaseUrl().replace(/\/$/, '')}/api/ai-sales-agent/t/${touchpoint.tracking_token}/open.gif`
      )}" alt="" width="1" height="1" style="display:block;border:0;outline:none;" />
    </div>
  `.trim();

  return {
    senderName,
    subject,
    bodyText,
    bodyHtml: htmlBody,
    ctaUrl: baseCtaUrl,
    trackedCtaUrl,
    subjectVariantIndex: subjectVariant.index,
    bodyVariantIndex: bodyVariant.index,
  };
}

async function sendTouchpointEmail({ lead, campaign, settings, stepKey, priorTouchpoint = null }) {
  const moduleConfig = parseJsonObject(settings.module_configs)?.[campaign.module_key] || {};
  const thread = await getOrCreateThread(lead, campaign);
  const insertTouchpoint = await supabaseClient
    .from('ai_sales_touchpoints')
    .insert({
      scope: AI_SALES_SCOPE,
      lead_id: lead.id,
      campaign_id: campaign.id,
      thread_id: thread.id,
      step_key: stepKey,
      status: 'queued',
      metadata: {
        cta_url: campaign.cta_url || moduleConfig.destination_url || null,
        prior_opened: Boolean(priorTouchpoint?.opened_at),
        prior_clicked: Boolean(priorTouchpoint?.clicked_at),
      },
      created_at: nowIso(),
      updated_at: nowIso(),
    })
    .select()
    .single();
  if (insertTouchpoint.error) throw insertTouchpoint.error;
  const touchpoint = insertTouchpoint.data;

  const content = buildOutboundContent({ lead, campaign, settings, moduleConfig, touchpoint, stepKey });
  const mailPayload = {
    businessId: 'system',
    campaignId: campaign.id,
    contactId: lead.id,
    to: lead.verified_email,
    fromEmail: settings.sender_email,
    fromName: content.senderName,
    subject: content.subject,
    html: content.bodyHtml,
    text: content.bodyText,
    ...(settings.reply_to_email ? { replyTo: settings.reply_to_email } : {}),
  };

  const result = await invokeMailSend(mailPayload);
  const sentAt = nowIso();

  const updateTouchpoint = await supabaseClient
    .from('ai_sales_touchpoints')
    .update({
      status: 'sent',
      subject: content.subject,
      body_text: content.bodyText,
      body_html: content.bodyHtml,
      variant_index: content.bodyVariantIndex,
      provider_message_id: result.messageId || null,
      sent_at: sentAt,
      updated_at: sentAt,
      metadata: {
        ...parseJsonObject(touchpoint.metadata),
        cta_url: content.ctaUrl,
        tracked_cta_url: content.trackedCtaUrl,
      },
    })
    .eq('id', touchpoint.id);
  if (updateTouchpoint.error) throw updateTouchpoint.error;

  const messageInsert = await supabaseClient.from('ai_sales_messages').insert({
    scope: AI_SALES_SCOPE,
    thread_id: thread.id,
    lead_id: lead.id,
    campaign_id: campaign.id,
    direction: 'outbound',
    sender_email: settings.sender_email,
    recipient_email: lead.verified_email,
    subject: content.subject,
    body_text: content.bodyText,
    body_html: content.bodyHtml,
    provider_message_id: result.messageId || randomUUID(),
    created_at: sentAt,
  });
  if (messageInsert.error) throw messageInsert.error;

  const leadPatch = {
    last_outreach_module_key: campaign.module_key,
    last_outreach_at: sentAt,
    cooldown_until: addDays(sentAt, Number(settings.cooldown_days || 90)).toISOString(),
    refresh_after_at: addDays(sentAt, Number(settings.refresh_after_days || 14)).toISOString(),
    outreach_locked: true,
    overall_status: 'contacted',
    updated_at: sentAt,
  };
  const leadUpdate = await supabaseClient.from('ai_sales_leads').update(leadPatch).eq('id', lead.id);
  if (leadUpdate.error) throw leadUpdate.error;

  const threadUpdate = await supabaseClient
    .from('ai_sales_threads')
    .update({
      status: 'active',
      last_message_at: sentAt,
      updated_at: sentAt,
    })
    .eq('id', thread.id);
  if (threadUpdate.error) throw threadUpdate.error;

  return { touchpointId: touchpoint.id, messageId: result.messageId || null };
}

async function selectEligibleLeadsForCampaign(campaign, _settings, limit) {
  const leads = await listAISalesLeads();
  const now = new Date();
  return leads
    .filter((lead) => {
      const moduleEntry = parseJsonObject(lead.module_scores)?.[campaign.module_key];
      if (!lead.verified_email || !moduleEntry?.qualified) return false;
      if (['suppressed', 'converted'].includes(lead.overall_status)) return false;
      if (!applyCampaignFilters(lead, campaign)) return false;
      if (lead.cooldown_until && new Date(lead.cooldown_until) > now) return false;
      return true;
    })
    .slice(0, limit);
}

async function sendInitialOutreachForCampaign(campaign, settings) {
  if (campaign.status !== 'active') return { sent: 0 };
  const sentToday = await getTouchpointsSentToday(campaign.id);
  const remaining = Math.max(0, Number(settings.inbox_daily_cap || 20) - sentToday);
  if (remaining <= 0) return { sent: 0 };

  const leads = await selectEligibleLeadsForCampaign(campaign, settings, remaining);
  let sent = 0;

  for (const lead of leads) {
    const existing = await getExistingCampaignTouchpoint(lead.id, campaign.id, 'initial');
    if (existing) continue;
    await sendTouchpointEmail({ lead, campaign, settings, stepKey: 'initial' });
    sent += 1;
  }
  return { sent };
}

async function sendDueFollowups(campaign, settings) {
  const { data, error } = await supabaseClient
    .from('ai_sales_touchpoints')
    .select('*')
    .eq('scope', AI_SALES_SCOPE)
    .eq('campaign_id', campaign.id)
    .eq('step_key', 'initial')
    .not('sent_at', 'is', null)
    .limit(500);
  if (error) throw error;

  let sent = 0;
  const schedule = parseJsonArray(campaign.followup_schedule, DEFAULT_FOLLOWUP_SCHEDULE).filter(
    (row) => row.step !== 'initial'
  );

  for (const row of data || []) {
    const [lead, thread] = await Promise.all([findLeadById(row.lead_id), findThreadById(row.thread_id)]);
    if (!lead?.id || ['suppressed', 'converted'].includes(lead.overall_status)) continue;
    if (thread && ['replied', 'closed', 'escalated'].includes(thread.status)) continue;

    for (const item of schedule) {
      const existingStep = await getExistingCampaignTouchpoint(lead.id, campaign.id, item.step);
      if (existingStep) continue;
      const sentAt = row.sent_at ? new Date(row.sent_at) : null;
      if (!sentAt) continue;
      const dueAt = addDays(sentAt, Number(item.delay_days || 0));
      if (dueAt > new Date()) continue;
      await sendTouchpointEmail({
        lead,
        campaign,
        settings,
        stepKey: item.step,
        priorTouchpoint: row,
      });
      sent += 1;
      break;
    }
  }

  return { sent };
}

export async function runAISalesLeadGeneration({ moduleKey } = {}) {
  const settings = await ensureAISalesSettings();
  const run = await createRun('lead_generation', { moduleKey: moduleKey || null });
  try {
    const modulesToRun = moduleKey
      ? [String(moduleKey).trim()]
      : Object.entries(parseJsonObject(settings.module_configs))
          .filter(([, config]) => config?.enabled !== false)
          .map(([key]) => key);

    const summary = {
      modules: {},
      total_created: 0,
      total_updated: 0,
      total_examined: 0,
    };

    for (const currentModuleKey of modulesToRun) {
      const moduleConfig = parseJsonObject(settings.module_configs)[currentModuleKey];
      const candidates = await searchGooglePlaces(currentModuleKey, moduleConfig);
      const moduleSummary = { created: 0, updated: 0, examined: candidates.length };
      for (const candidate of candidates) {
        const result = await upsertLeadCandidate(candidate, currentModuleKey, settings);
        if (result.created) moduleSummary.created += 1;
        if (result.updated) moduleSummary.updated += 1;
      }
      summary.modules[currentModuleKey] = moduleSummary;
      summary.total_created += moduleSummary.created;
      summary.total_updated += moduleSummary.updated;
      summary.total_examined += moduleSummary.examined;
    }

    await completeRun(run.id, 'completed', summary);
    return summary;
  } catch (error) {
    await completeRun(run.id, 'failed', { error: error.message });
    throw error;
  }
}

export async function runAISalesDailyCycle() {
  const settings = await ensureAISalesSettings();
  const run = await createRun('daily_cycle', {});
  try {
    if (!settings.is_enabled) {
      const result = { skipped: true, reason: 'AI Sales Agent is disabled' };
      await completeRun(run.id, 'completed', result);
      return result;
    }

    const alreadyRanLeadGeneration = await hasCompletedRunToday('lead_generation');
    const leadGeneration = alreadyRanLeadGeneration
      ? { skipped: true, reason: 'lead generation already completed today' }
      : await runAISalesLeadGeneration({});
    const campaigns = await listAISalesCampaigns();
    const outreachSummary = {};
    const followupSummary = {};

    for (const campaign of campaigns.filter((row) => row.status === 'active')) {
      outreachSummary[campaign.id] = await sendInitialOutreachForCampaign(campaign, settings);
      followupSummary[campaign.id] = await sendDueFollowups(campaign, settings);
    }

    const result = {
      lead_generation: leadGeneration,
      outreach: outreachSummary,
      followups: followupSummary,
    };
    await completeRun(run.id, 'completed', result);
    return result;
  } catch (error) {
    await completeRun(run.id, 'failed', { error: error.message });
    throw error;
  }
}

function classifyInboundIntent(text) {
  const body = String(text || '').toLowerCase();
  const notInterested = /(not interested|stop|unsubscribe|remove me|leave me alone|no thanks|do not contact)/i.test(body);
  if (notInterested) return 'not_interested';
  const escalate = /(legal|privacy|security|enterprise|partnership|angry|lawsuit|complaint|contract|integration|custom)/i.test(
    body
  );
  if (escalate) return 'escalate';
  if (/\?/.test(body) || /(price|pricing|cost|how does|how long|what does|can you)/i.test(body)) {
    return 'question';
  }
  if (/(interested|let's do it|sounds good|sign me up|ready|book|start)/i.test(body)) {
    return 'interested';
  }
  return 'question';
}

async function sendAlertEmail(settings, subject, text, html) {
  if (!settings.alert_email) return;
  await invokeMailSend({
    businessId: 'system',
    campaignId: 'ai-sales-agent-alert',
    contactId: 'admin-alert',
    to: settings.alert_email,
    fromEmail: settings.sender_email,
    fromName: 'Tavari AI Sales Agent',
    subject,
    html: html || plainTextToHtml(text),
    text,
    ...(settings.reply_to_email ? { replyTo: settings.reply_to_email } : {}),
  });
}

async function autoRespondToInbound({ settings, lead, campaign, thread, bodyText, intent }) {
  const moduleKey = campaign?.module_key || thread?.module_key || lead?.last_outreach_module_key || 'phone-agent';
  const moduleConfig = parseJsonObject(settings.module_configs)?.[moduleKey] || {};
  const ctaUrl = campaign?.cta_url || moduleConfig.destination_url || '';
  const senderName = campaign?.sender_display_name || settings.fallback_persona_name || 'Tavari AI';
  const faqList = parseJsonArray(campaign?.reply_faqs, moduleConfig.public_faqs || []);
  const askedPricing = /price|pricing|cost|monthly|setup/i.test(String(bodyText || ''));
  const faqSection = faqList
    .slice(0, 3)
    .map((row) => `- ${row.question}: ${row.answer}`)
    .join('\n');

  const bodyTextOut =
    intent === 'interested'
      ? `Thanks for the reply.\n\nIf you want to move forward, the fastest path is the public setup flow here:\n${ctaUrl}\n\nIf you want me to clarify anything before that, reply here and I can help with the public details.`
      : `Thanks for the reply.\n\nHere are the public details I can share right away:\n${
          askedPricing ? `${moduleConfig.pricing_summary || 'Pricing is shown on the public landing page.'}\n\n` : ''
        }${faqSection}\n\nYou can review the public page and start setup here:\n${ctaUrl}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
      ${plainTextToHtml(bodyTextOut)}
      ${
        ctaUrl
          ? `<p style="margin-top:24px;"><a href="${htmlEscape(
              ctaUrl
            )}" style="display:inline-block;background:#0d9488;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">Start Setup</a></p>`
          : ''
      }
    </div>
  `;

  const sendResult = await invokeMailSend({
    businessId: 'system',
    campaignId: campaign?.id || 'ai-sales-agent-reply',
    contactId: lead.id,
    to: lead.verified_email,
    fromEmail: settings.sender_email,
    fromName: senderName,
    subject: `Re: ${campaign?.name || moduleLabel(moduleKey)}`,
    html,
    text: bodyTextOut,
    ...(settings.reply_to_email ? { replyTo: settings.reply_to_email } : {}),
  });

  await supabaseClient.from('ai_sales_messages').insert({
    scope: AI_SALES_SCOPE,
    thread_id: thread.id,
    lead_id: lead.id,
    campaign_id: campaign?.id || null,
    direction: 'outbound',
    sender_email: settings.sender_email,
    recipient_email: lead.verified_email,
    subject: `Re: ${campaign?.name || moduleLabel(moduleKey)}`,
    body_text: bodyTextOut,
    body_html: html,
    provider_message_id: sendResult.messageId || randomUUID(),
    created_at: nowIso(),
  });
}

async function findCampaignById(id) {
  if (!id) return null;
  const { data, error } = await supabaseClient
    .from('ai_sales_campaigns')
    .select('*')
    .eq('id', id)
    .eq('scope', AI_SALES_SCOPE)
    .maybeSingle();
  if (error) throw error;
  return data
    ? {
        ...data,
        subject_lines: parseJsonArray(data.subject_lines),
        body_templates: parseJsonArray(data.body_templates),
        filters: parseJsonObject(data.filters),
        followup_schedule: parseJsonArray(data.followup_schedule, DEFAULT_FOLLOWUP_SCHEDULE),
        reply_faqs: parseJsonArray(data.reply_faqs),
        settings: parseJsonObject(data.settings),
      }
    : null;
}

async function findThreadByMessageReference(messageIds) {
  const refs = uniqStrings(messageIds);
  if (!refs.length) return null;
  const { data, error } = await supabaseClient
    .from('ai_sales_messages')
    .select('thread_id')
    .in('provider_message_id', refs)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  const threadId = data?.[0]?.thread_id;
  if (!threadId) return null;
  const threadResult = await supabaseClient
    .from('ai_sales_threads')
    .select('*')
    .eq('id', threadId)
    .maybeSingle();
  if (threadResult.error) throw threadResult.error;
  return threadResult.data;
}

export async function ingestAISalesInboundEmail(payload = {}) {
  const settings = await ensureAISalesSettings();
  const fromEmail = normalizeEmail(payload.from || payload.email || payload.sender_email);
  if (!fromEmail) {
    const error = new Error('from email is required');
    error.statusCode = 400;
    throw error;
  }

  const references = uniqStrings([
    payload.in_reply_to,
    ...(Array.isArray(payload.references) ? payload.references : []),
  ]);

  let thread = await findThreadByMessageReference(references);
  let lead = null;
  let campaign = null;

  if (thread) {
    const leadResult = await supabaseClient
      .from('ai_sales_leads')
      .select('*')
      .eq('id', thread.lead_id)
      .maybeSingle();
    if (leadResult.error) throw leadResult.error;
    lead = normalizeLeadRow(leadResult.data);
    campaign = await findCampaignById(thread.campaign_id);
  } else {
    lead = await findLeadByField('normalized_email', fromEmail);
    if (!lead) {
      const inserted = await supabaseClient
        .from('ai_sales_leads')
        .insert({
          scope: AI_SALES_SCOPE,
          business_name: fromEmail.split('@')[0],
          normalized_name: normalizeBusinessName(fromEmail.split('@')[0]),
          dedupe_key: `email:${fromEmail}`,
          verified_email: fromEmail,
          normalized_email: fromEmail,
          overall_status: 'replied',
          created_at: nowIso(),
          updated_at: nowIso(),
        })
        .select()
        .single();
      if (inserted.error) throw inserted.error;
      lead = normalizeLeadRow(inserted.data);
    }

    if (payload.campaign_id) {
      campaign = await findCampaignById(payload.campaign_id);
    }

    const insertedThread = await supabaseClient
      .from('ai_sales_threads')
      .insert({
        scope: AI_SALES_SCOPE,
        lead_id: lead.id,
        campaign_id: campaign?.id || null,
        module_key: campaign?.module_key || lead.last_outreach_module_key || null,
        status: 'active',
        last_message_at: nowIso(),
        updated_at: nowIso(),
      })
      .select()
      .single();
    if (insertedThread.error) throw insertedThread.error;
    thread = insertedThread.data;
  }

  const bodyText = String(payload.text || payload.body_text || payload.body || '').trim();
  const bodyHtml = String(payload.html || payload.body_html || '').trim();
  const intent = classifyInboundIntent(bodyText || bodyHtml);
  const createdAt = nowIso();

  const insertMessage = await supabaseClient.from('ai_sales_messages').insert({
    scope: AI_SALES_SCOPE,
    thread_id: thread.id,
    lead_id: lead.id,
    campaign_id: campaign?.id || null,
    direction: 'inbound',
    sender_email: fromEmail,
    recipient_email: settings.reply_to_email || settings.sender_email,
    subject: String(payload.subject || '').trim() || null,
    body_text: bodyText || null,
    body_html: bodyHtml || null,
    provider_message_id: String(payload.message_id || randomUUID()),
    in_reply_to: String(payload.in_reply_to || '').trim() || null,
    message_references: references,
    intent,
    metadata: parseJsonObject(payload.metadata),
    created_at: createdAt,
  });
  if (insertMessage.error) throw insertMessage.error;

  let leadStatus = 'replied';
  let threadStatus = 'replied';
  if (intent === 'not_interested') {
    leadStatus = 'suppressed';
    threadStatus = 'closed';
  } else if (intent === 'escalate') {
    threadStatus = 'escalated';
  }

  const leadUpdate = await supabaseClient
    .from('ai_sales_leads')
    .update({
      overall_status: leadStatus,
      last_engagement_at: createdAt,
      updated_at: createdAt,
    })
    .eq('id', lead.id);
  if (leadUpdate.error) throw leadUpdate.error;

  const threadUpdate = await supabaseClient
    .from('ai_sales_threads')
    .update({
      status: threadStatus,
      last_message_at: createdAt,
      stopped_at: intent === 'not_interested' ? createdAt : null,
      updated_at: createdAt,
    })
    .eq('id', thread.id);
  if (threadUpdate.error) throw threadUpdate.error;

  const touchpointUpdate = await supabaseClient
    .from('ai_sales_touchpoints')
    .update({
      status: 'replied',
      replied_at: createdAt,
      updated_at: createdAt,
    })
    .eq('thread_id', thread.id)
    .eq('scope', AI_SALES_SCOPE)
    .is('replied_at', null);
  if (touchpointUpdate.error) throw touchpointUpdate.error;

  if (intent === 'escalate') {
    await sendAlertEmail(
      settings,
      `AI Sales Agent escalation: ${lead.business_name || fromEmail}`,
      `A lead reply needs manual follow-up.\n\nLead: ${lead.business_name || fromEmail}\nEmail: ${fromEmail}\nIntent: ${intent}\n\nMessage:\n${bodyText || '(no body)'}`,
      null
    );
  } else if (intent === 'interested' || intent === 'question') {
    await autoRespondToInbound({ settings, lead, campaign, thread, bodyText, intent });
  }

  return {
    success: true,
    lead_id: lead.id,
    thread_id: thread.id,
    intent,
    thread_status: threadStatus,
  };
}

export async function trackAISalesOpen(token) {
  const { data, error } = await supabaseClient
    .from('ai_sales_touchpoints')
    .select('*')
    .eq('tracking_token', token)
    .maybeSingle();
  if (error) throw error;
  if (!data) return false;
  const openedAt = data.opened_at || nowIso();
  const updateTouchpoint = await supabaseClient
    .from('ai_sales_touchpoints')
    .update({
      status: data.status === 'clicked' ? 'clicked' : 'opened',
      opened_at: openedAt,
      updated_at: nowIso(),
    })
    .eq('id', data.id);
  if (updateTouchpoint.error) throw updateTouchpoint.error;

  const leadUpdate = await supabaseClient
    .from('ai_sales_leads')
    .update({ last_engagement_at: nowIso(), updated_at: nowIso() })
    .eq('id', data.lead_id);
  if (leadUpdate.error) throw leadUpdate.error;
  return true;
}

export async function trackAISalesClick(token) {
  const { data, error } = await supabaseClient
    .from('ai_sales_touchpoints')
    .select('*')
    .eq('click_token', token)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const clickedAt = data.clicked_at || nowIso();
  const updateTouchpoint = await supabaseClient
    .from('ai_sales_touchpoints')
    .update({
      status: 'clicked',
      clicked_at: clickedAt,
      updated_at: nowIso(),
    })
    .eq('id', data.id);
  if (updateTouchpoint.error) throw updateTouchpoint.error;

  const leadUpdate = await supabaseClient
    .from('ai_sales_leads')
    .update({
      last_engagement_at: nowIso(),
      overall_status: 'contacted',
      updated_at: nowIso(),
    })
    .eq('id', data.lead_id);
  if (leadUpdate.error) throw leadUpdate.error;

  const ctaUrl = parseJsonObject(data.metadata).cta_url || frontendUrl('/sales');
  return ctaUrl;
}

export function getAISalesTrackingPixel() {
  return TRACKING_PIXEL_GIF;
}
