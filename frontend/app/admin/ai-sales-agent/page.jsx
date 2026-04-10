'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getApiBaseUrl } from '@/lib/api';

const TABS = ['dashboard', 'settings', 'campaigns', 'leads', 'replies'];
const MODULE_OPTIONS = [
  { key: 'phone-agent', label: 'AI Phone Agent' },
  { key: 'emergency-dispatch', label: 'AI Dispatch' },
  { key: 'delivery-dispatch', label: 'Last-Mile Delivery' },
];

function getAdminToken() {
  if (typeof document === 'undefined') return '';
  return document.cookie
    .split(';')
    .find((row) => row.trim().startsWith('admin_token='))
    ?.split('=')[1]
    ?.trim() || '';
}

function csvToList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function listToCsv(list) {
  return (Array.isArray(list) ? list : []).join(', ');
}

function jsonListToTextarea(list) {
  return (Array.isArray(list) ? list : []).map((row) => String(row || '')).join('\n---\n');
}

function textareaToJsonList(value) {
  return String(value || '')
    .split(/\n---\n/g)
    .map((row) => row.trim())
    .filter(Boolean);
}

function faqListToTextarea(list) {
  return (Array.isArray(list) ? list : [])
    .map((row) => `${row.question || ''} :: ${row.answer || ''}`)
    .join('\n');
}

function textareaToFaqList(value) {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [question, ...rest] = line.split('::');
      return {
        question: question?.trim() || '',
        answer: rest.join('::').trim(),
      };
    })
    .filter((row) => row.question && row.answer);
}

function StatCard({ label, value, tone = 'blue' }) {
  const toneMap = {
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    violet: 'bg-violet-50 text-violet-700 border-violet-100',
    slate: 'bg-slate-50 text-slate-700 border-slate-100',
  };
  return (
    <div className={`rounded-xl border p-5 ${toneMap[tone] || toneMap.blue}`}>
      <div className="text-sm font-medium opacity-80">{label}</div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
    </div>
  );
}

export default function AdminAISalesAgentPage() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [overview, setOverview] = useState(null);
  const [settingsForm, setSettingsForm] = useState(null);
  const [campaignForm, setCampaignForm] = useState({
    id: '',
    module_key: 'phone-agent',
    name: '',
    status: 'active',
    cta_url: '',
    sender_display_name: '',
    subject_lines_text: '',
    body_templates_text: '',
    filters_cities: '',
    filters_industries: '',
    reply_faqs_text: '',
  });
  const [messagesByThread, setMessagesByThread] = useState({});
  const [selectedThreadId, setSelectedThreadId] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [runningLeadGen, setRunningLeadGen] = useState(false);
  const [runningDaily, setRunningDaily] = useState(false);

  const headers = useMemo(() => {
    const token = getAdminToken();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }, []);

  const loadOverview = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch(`${getApiBaseUrl()}/api/v2/admin/ai-sales-agent/overview`, {
        headers,
        cache: 'no-store',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to load AI Sales Agent');
      setOverview(json);
      setSettingsForm({
        is_enabled: json.settings?.is_enabled ?? true,
        sender_email: json.settings?.sender_email || 'noreply@tavarios.ca',
        fallback_persona_name: json.settings?.fallback_persona_name || 'Tavari AI',
        reply_to_email: json.settings?.reply_to_email || '',
        alert_email: json.settings?.alert_email || '',
        refresh_after_days: json.settings?.refresh_after_days ?? 14,
        cooldown_days: json.settings?.cooldown_days ?? 90,
        inbox_daily_cap: json.settings?.inbox_daily_cap ?? 20,
        domain_daily_cap: json.settings?.domain_daily_cap ?? 50,
        auto_pause_on_degraded: json.settings?.auto_pause_on_degraded ?? false,
        module_configs: json.settings?.module_configs || {},
      });
    } catch (loadError) {
      setError(loadError.message || 'Failed to load AI Sales Agent');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadThreadMessages = async (threadId) => {
    if (!threadId || messagesByThread[threadId]) return;
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v2/admin/ai-sales-agent/threads/${threadId}/messages`, {
        headers,
        cache: 'no-store',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to load thread messages');
      setMessagesByThread((prev) => ({ ...prev, [threadId]: json.messages || [] }));
    } catch (threadError) {
      setError(threadError.message || 'Failed to load thread messages');
    }
  };

  useEffect(() => {
    if (selectedThreadId) {
      loadThreadMessages(selectedThreadId);
    }
  }, [selectedThreadId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSettingsModuleChange = (moduleKey, field, value) => {
    setSettingsForm((prev) => ({
      ...prev,
      module_configs: {
        ...(prev?.module_configs || {}),
        [moduleKey]: {
          ...(prev?.module_configs?.[moduleKey] || {}),
          [field]: value,
        },
      },
    }));
  };

  const saveSettings = async () => {
    if (!settingsForm) return;
    try {
      setSavingSettings(true);
      const moduleConfigs = {};
      for (const opt of MODULE_OPTIONS) {
        const current = settingsForm.module_configs?.[opt.key] || {};
        moduleConfigs[opt.key] = {
          ...current,
          industries:
            current.industries_text !== undefined
              ? csvToList(current.industries_text)
              : Array.isArray(current.industries)
                ? current.industries
                : [],
          cities:
            current.cities_text !== undefined
              ? csvToList(current.cities_text)
              : Array.isArray(current.cities)
                ? current.cities
                : [],
          public_faqs:
            current.public_faqs_text !== undefined
              ? textareaToFaqList(current.public_faqs_text)
              : Array.isArray(current.public_faqs)
                ? current.public_faqs
                : [],
        };
        delete moduleConfigs[opt.key].industries_text;
        delete moduleConfigs[opt.key].cities_text;
        delete moduleConfigs[opt.key].public_faqs_text;
      }

      const payload = {
        ...settingsForm,
        module_configs: moduleConfigs,
      };

      const res = await fetch(`${getApiBaseUrl()}/api/v2/admin/ai-sales-agent/settings`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to save settings');
      await loadOverview();
    } catch (saveError) {
      setError(saveError.message || 'Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const startCampaignEdit = (campaign) => {
    setCampaignForm({
      id: campaign.id || '',
      module_key: campaign.module_key || 'phone-agent',
      name: campaign.name || '',
      status: campaign.status || 'active',
      cta_url: campaign.cta_url || '',
      sender_display_name: campaign.sender_display_name || '',
      subject_lines_text: (campaign.subject_lines || []).join('\n'),
      body_templates_text: jsonListToTextarea(campaign.body_templates || []),
      filters_cities: listToCsv(campaign.filters?.cities || []),
      filters_industries: listToCsv(campaign.filters?.industries || []),
      reply_faqs_text: faqListToTextarea(campaign.reply_faqs || []),
    });
    setActiveTab('campaigns');
  };

  const saveCampaign = async () => {
    try {
      setSavingCampaign(true);
      const payload = {
        id: campaignForm.id || undefined,
        module_key: campaignForm.module_key,
        name: campaignForm.name,
        status: campaignForm.status,
        cta_url: campaignForm.cta_url,
        sender_display_name: campaignForm.sender_display_name,
        subject_lines: campaignForm.subject_lines_text
          .split('\n')
          .map((row) => row.trim())
          .filter(Boolean),
        body_templates: textareaToJsonList(campaignForm.body_templates_text),
        filters: {
          cities: csvToList(campaignForm.filters_cities),
          industries: csvToList(campaignForm.filters_industries),
        },
        reply_faqs: textareaToFaqList(campaignForm.reply_faqs_text),
      };

      const url = campaignForm.id
        ? `${getApiBaseUrl()}/api/v2/admin/ai-sales-agent/campaigns/${campaignForm.id}`
        : `${getApiBaseUrl()}/api/v2/admin/ai-sales-agent/campaigns`;
      const method = campaignForm.id ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to save campaign');

      setCampaignForm({
        id: '',
        module_key: 'phone-agent',
        name: '',
        status: 'active',
        cta_url: '',
        sender_display_name: '',
        subject_lines_text: '',
        body_templates_text: '',
        filters_cities: '',
        filters_industries: '',
        reply_faqs_text: '',
      });
      await loadOverview();
    } catch (campaignError) {
      setError(campaignError.message || 'Failed to save campaign');
    } finally {
      setSavingCampaign(false);
    }
  };

  const updateCampaignStatus = async (campaignId, status) => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v2/admin/ai-sales-agent/campaigns/${campaignId}/status`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ status }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to update campaign status');
      await loadOverview();
    } catch (statusError) {
      setError(statusError.message || 'Failed to update campaign status');
    }
  };

  const runLeadGeneration = async () => {
    try {
      setRunningLeadGen(true);
      const res = await fetch(`${getApiBaseUrl()}/api/v2/admin/ai-sales-agent/run/lead-generation`, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to run lead generation');
      await loadOverview();
    } catch (runError) {
      setError(runError.message || 'Failed to run lead generation');
    } finally {
      setRunningLeadGen(false);
    }
  };

  const runDailyCycle = async () => {
    try {
      setRunningDaily(true);
      const res = await fetch(`${getApiBaseUrl()}/api/v2/admin/ai-sales-agent/run/daily`, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to run the daily cycle');
      await loadOverview();
    } catch (runError) {
      setError(runError.message || 'Failed to run the daily cycle');
    } finally {
      setRunningDaily(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 px-6 py-10">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-slate-600">Loading AI Sales Agent…</div>
        </div>
      </div>
    );
  }

  const selectedThreadMessages = selectedThreadId ? messagesByThread[selectedThreadId] || [] : [];

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/admin-dashboard" className="text-sm text-slate-500 hover:text-slate-900">
              ← Back to admin dashboard
            </Link>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">AI Sales Agent</h1>
            <p className="mt-1 text-sm text-slate-600">
              Tavari admin module for automated lead generation, outreach, follow-up, and reply handling.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={runLeadGeneration}
              disabled={runningLeadGen}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {runningLeadGen ? 'Running lead generation…' : 'Run lead generation'}
            </button>
            <button
              onClick={runDailyCycle}
              disabled={runningDaily}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {runningDaily ? 'Running automation…' : 'Run daily automation'}
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                activeTab === tab ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border border-slate-200'
              }`}
            >
              {tab === 'dashboard'
                ? 'Dashboard'
                : tab === 'settings'
                  ? 'Settings'
                  : tab === 'campaigns'
                    ? 'Campaigns'
                    : tab === 'leads'
                      ? 'Leads'
                      : 'Replies'}
            </button>
          ))}
        </div>

        {activeTab === 'dashboard' ? (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Total leads" value={overview?.stats?.total_leads || 0} tone="blue" />
              <StatCard label="Qualified leads" value={overview?.stats?.qualified_leads || 0} tone="emerald" />
              <StatCard label="Emails sent" value={overview?.stats?.sent || 0} tone="violet" />
              <StatCard label="Conversions" value={overview?.stats?.conversions || 0} tone="amber" />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <StatCard label="Opened" value={overview?.stats?.opened || 0} tone="slate" />
              <StatCard label="Clicked" value={overview?.stats?.clicked || 0} tone="slate" />
              <StatCard label="Replied" value={overview?.stats?.replied || 0} tone="slate" />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Campaign performance</h2>
                  <p className="mt-1 text-sm text-slate-600">Open, click, and reply performance by campaign.</p>
                </div>
              </div>
              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500">
                      <th className="pb-3 pr-4">Campaign</th>
                      <th className="pb-3 pr-4">Module</th>
                      <th className="pb-3 pr-4">Status</th>
                      <th className="pb-3 pr-4">Sent</th>
                      <th className="pb-3 pr-4">Open rate</th>
                      <th className="pb-3 pr-4">Click rate</th>
                      <th className="pb-3">Reply rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(overview?.campaign_performance || []).map((campaign) => (
                      <tr key={campaign.campaign_id} className="border-b border-slate-100 text-slate-700">
                        <td className="py-3 pr-4 font-medium">{campaign.name}</td>
                        <td className="py-3 pr-4">{campaign.module_key}</td>
                        <td className="py-3 pr-4 capitalize">{campaign.status}</td>
                        <td className="py-3 pr-4">{campaign.sent}</td>
                        <td className="py-3 pr-4">{campaign.open_rate}%</td>
                        <td className="py-3 pr-4">{campaign.click_rate}%</td>
                        <td className="py-3">{campaign.reply_rate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === 'settings' && settingsForm ? (
          <div className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="text-lg font-semibold text-slate-900">Global settings</h2>
              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <label className="space-y-2 text-sm text-slate-700">
                  <span>Enabled</span>
                  <select
                    value={settingsForm.is_enabled ? 'true' : 'false'}
                    onChange={(e) => setSettingsForm((prev) => ({ ...prev, is_enabled: e.target.value === 'true' }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option value="true">Enabled</option>
                    <option value="false">Disabled</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm text-slate-700">
                  <span>Sender email</span>
                  <input
                    value={settingsForm.sender_email}
                    onChange={(e) => setSettingsForm((prev) => ({ ...prev, sender_email: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-700">
                  <span>Fallback persona</span>
                  <input
                    value={settingsForm.fallback_persona_name}
                    onChange={(e) =>
                      setSettingsForm((prev) => ({ ...prev, fallback_persona_name: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-700">
                  <span>Reply-to email</span>
                  <input
                    value={settingsForm.reply_to_email}
                    onChange={(e) => setSettingsForm((prev) => ({ ...prev, reply_to_email: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-700">
                  <span>Alert email</span>
                  <input
                    value={settingsForm.alert_email}
                    onChange={(e) => setSettingsForm((prev) => ({ ...prev, alert_email: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-700">
                  <span>Refresh-after days</span>
                  <input
                    type="number"
                    value={settingsForm.refresh_after_days}
                    onChange={(e) =>
                      setSettingsForm((prev) => ({ ...prev, refresh_after_days: Number(e.target.value || 14) }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-700">
                  <span>Cooldown days</span>
                  <input
                    type="number"
                    value={settingsForm.cooldown_days}
                    onChange={(e) =>
                      setSettingsForm((prev) => ({ ...prev, cooldown_days: Number(e.target.value || 90) }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-700">
                  <span>Inbox daily cap</span>
                  <input
                    type="number"
                    value={settingsForm.inbox_daily_cap}
                    onChange={(e) =>
                      setSettingsForm((prev) => ({ ...prev, inbox_daily_cap: Number(e.target.value || 20) }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-700">
                  <span>Domain daily cap</span>
                  <input
                    type="number"
                    value={settingsForm.domain_daily_cap}
                    onChange={(e) =>
                      setSettingsForm((prev) => ({ ...prev, domain_daily_cap: Number(e.target.value || 50) }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
              </div>
              <label className="mt-4 flex items-center gap-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={settingsForm.auto_pause_on_degraded}
                  onChange={(e) =>
                    setSettingsForm((prev) => ({ ...prev, auto_pause_on_degraded: e.target.checked }))
                  }
                />
                Auto-pause when deliverability is degraded
              </label>
            </div>

            {MODULE_OPTIONS.map((module) => {
              const config = settingsForm.module_configs?.[module.key] || {};
              return (
                <div key={module.key} className="rounded-xl border border-slate-200 bg-white p-6">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">{module.label}</h3>
                      <p className="mt-1 text-sm text-slate-600">Location, industry, and CTA settings for this module.</p>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={config.enabled !== false}
                        onChange={(e) => handleSettingsModuleChange(module.key, 'enabled', e.target.checked)}
                      />
                      Enabled
                    </label>
                  </div>
                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <label className="space-y-2 text-sm text-slate-700">
                      <span>Industries (comma separated)</span>
                      <input
                        value={config.industries_text !== undefined ? config.industries_text : listToCsv(config.industries)}
                        onChange={(e) => handleSettingsModuleChange(module.key, 'industries_text', e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </label>
                    <label className="space-y-2 text-sm text-slate-700">
                      <span>Cities (comma separated)</span>
                      <input
                        value={config.cities_text !== undefined ? config.cities_text : listToCsv(config.cities)}
                        onChange={(e) => handleSettingsModuleChange(module.key, 'cities_text', e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </label>
                    <label className="space-y-2 text-sm text-slate-700">
                      <span>Province</span>
                      <input
                        value={config.province || ''}
                        onChange={(e) => handleSettingsModuleChange(module.key, 'province', e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </label>
                    <label className="space-y-2 text-sm text-slate-700">
                      <span>Destination URL</span>
                      <input
                        value={config.destination_url || ''}
                        onChange={(e) => handleSettingsModuleChange(module.key, 'destination_url', e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </label>
                  </div>
                  <label className="mt-4 block space-y-2 text-sm text-slate-700">
                    <span>Public pricing summary</span>
                    <textarea
                      value={config.pricing_summary || ''}
                      onChange={(e) => handleSettingsModuleChange(module.key, 'pricing_summary', e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </label>
                  <label className="mt-4 block space-y-2 text-sm text-slate-700">
                    <span>Public FAQs (`Question :: Answer`, one per line)</span>
                    <textarea
                      value={config.public_faqs_text !== undefined ? config.public_faqs_text : faqListToTextarea(config.public_faqs)}
                      onChange={(e) => handleSettingsModuleChange(module.key, 'public_faqs_text', e.target.value)}
                      rows={5}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </label>
                </div>
              );
            })}

            <div className="flex justify-end">
              <button
                onClick={saveSettings}
                disabled={savingSettings}
                className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {savingSettings ? 'Saving…' : 'Save settings'}
              </button>
            </div>
          </div>
        ) : null}

        {activeTab === 'campaigns' ? (
          <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="text-lg font-semibold text-slate-900">Campaigns</h2>
              <div className="mt-6 space-y-4">
                {(overview?.campaigns || []).map((campaign) => (
                  <div key={campaign.id} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-900">{campaign.name}</div>
                        <div className="mt-1 text-sm text-slate-500">{campaign.module_key}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => startCampaignEdit(campaign)}
                          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() =>
                            updateCampaignStatus(campaign.id, campaign.status === 'active' ? 'paused' : 'active')
                          }
                          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800"
                        >
                          {campaign.status === 'active' ? 'Pause' : 'Resume'}
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 text-sm text-slate-600">
                      Status: <span className="font-medium capitalize">{campaign.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="text-lg font-semibold text-slate-900">{campaignForm.id ? 'Edit campaign' : 'New campaign'}</h2>
              <div className="mt-6 space-y-4">
                <label className="block space-y-2 text-sm text-slate-700">
                  <span>Module</span>
                  <select
                    value={campaignForm.module_key}
                    onChange={(e) => setCampaignForm((prev) => ({ ...prev, module_key: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    {MODULE_OPTIONS.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-2 text-sm text-slate-700">
                  <span>Name</span>
                  <input
                    value={campaignForm.name}
                    onChange={(e) => setCampaignForm((prev) => ({ ...prev, name: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="block space-y-2 text-sm text-slate-700">
                  <span>Status</span>
                  <select
                    value={campaignForm.status}
                    onChange={(e) => setCampaignForm((prev) => ({ ...prev, status: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="draft">Draft</option>
                  </select>
                </label>
                <label className="block space-y-2 text-sm text-slate-700">
                  <span>CTA URL</span>
                  <input
                    value={campaignForm.cta_url}
                    onChange={(e) => setCampaignForm((prev) => ({ ...prev, cta_url: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="block space-y-2 text-sm text-slate-700">
                  <span>Sender display name</span>
                  <input
                    value={campaignForm.sender_display_name}
                    onChange={(e) => setCampaignForm((prev) => ({ ...prev, sender_display_name: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="block space-y-2 text-sm text-slate-700">
                  <span>Subject lines (one per line)</span>
                  <textarea
                    value={campaignForm.subject_lines_text}
                    onChange={(e) => setCampaignForm((prev) => ({ ...prev, subject_lines_text: e.target.value }))}
                    rows={4}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="block space-y-2 text-sm text-slate-700">
                  <span>Body templates (separate variants with `---` on its own line)</span>
                  <textarea
                    value={campaignForm.body_templates_text}
                    onChange={(e) => setCampaignForm((prev) => ({ ...prev, body_templates_text: e.target.value }))}
                    rows={10}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block space-y-2 text-sm text-slate-700">
                    <span>City filters</span>
                    <input
                      value={campaignForm.filters_cities}
                      onChange={(e) => setCampaignForm((prev) => ({ ...prev, filters_cities: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </label>
                  <label className="block space-y-2 text-sm text-slate-700">
                    <span>Industry filters</span>
                    <input
                      value={campaignForm.filters_industries}
                      onChange={(e) =>
                        setCampaignForm((prev) => ({ ...prev, filters_industries: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </label>
                </div>
                <label className="block space-y-2 text-sm text-slate-700">
                  <span>Reply FAQs (`Question :: Answer`)</span>
                  <textarea
                    value={campaignForm.reply_faqs_text}
                    onChange={(e) => setCampaignForm((prev) => ({ ...prev, reply_faqs_text: e.target.value }))}
                    rows={6}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <div className="flex justify-between gap-3">
                  <button
                    onClick={() =>
                      setCampaignForm({
                        id: '',
                        module_key: 'phone-agent',
                        name: '',
                        status: 'active',
                        cta_url: '',
                        sender_display_name: '',
                        subject_lines_text: '',
                        body_templates_text: '',
                        filters_cities: '',
                        filters_industries: '',
                        reply_faqs_text: '',
                      })
                    }
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Clear
                  </button>
                  <button
                    onClick={saveCampaign}
                    disabled={savingCampaign}
                    className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {savingCampaign ? 'Saving…' : campaignForm.id ? 'Update campaign' : 'Create campaign'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === 'leads' ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">Leads</h2>
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="pb-3 pr-4">Business</th>
                    <th className="pb-3 pr-4">Category</th>
                    <th className="pb-3 pr-4">City</th>
                    <th className="pb-3 pr-4">Email</th>
                    <th className="pb-3 pr-4">Status</th>
                    <th className="pb-3 pr-4">Priority</th>
                    <th className="pb-3">Qualified modules</th>
                  </tr>
                </thead>
                <tbody>
                  {(overview?.leads || []).map((lead) => (
                    <tr key={lead.id} className="border-b border-slate-100 text-slate-700">
                      <td className="py-3 pr-4 font-medium">{lead.business_name}</td>
                      <td className="py-3 pr-4">{lead.category || '—'}</td>
                      <td className="py-3 pr-4">{lead.city || '—'}</td>
                      <td className="py-3 pr-4">{lead.verified_email || '—'}</td>
                      <td className="py-3 pr-4 capitalize">{lead.overall_status}</td>
                      <td className="py-3 pr-4 capitalize">{lead.qualification_priority}</td>
                      <td className="py-3">{(lead.qualified_modules || []).join(', ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {activeTab === 'replies' ? (
          <div className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="text-lg font-semibold text-slate-900">Threads</h2>
              <div className="mt-6 space-y-3">
                {(overview?.threads || []).map((thread) => (
                  <button
                    key={thread.id}
                    onClick={() => setSelectedThreadId(thread.id)}
                    className={`w-full rounded-lg border p-4 text-left ${
                      selectedThreadId === thread.id
                        ? 'border-slate-900 bg-slate-50'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-slate-900">{thread.module_key || 'Unknown module'}</div>
                      <div className="text-xs uppercase tracking-wide text-slate-500">{thread.status}</div>
                    </div>
                    <div className="mt-2 text-xs text-slate-500">Lead ID: {thread.lead_id}</div>
                    <div className="mt-1 text-xs text-slate-500">Updated: {thread.updated_at}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="text-lg font-semibold text-slate-900">Conversation</h2>
              {!selectedThreadId ? (
                <p className="mt-6 text-sm text-slate-500">Select a thread to inspect the message history.</p>
              ) : (
                <div className="mt-6 space-y-4">
                  {selectedThreadMessages.map((message) => (
                    <div
                      key={message.id}
                      className={`rounded-lg border p-4 ${
                        message.direction === 'outbound'
                          ? 'border-emerald-200 bg-emerald-50'
                          : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-slate-900 capitalize">{message.direction}</div>
                        <div className="text-xs text-slate-500">{message.created_at}</div>
                      </div>
                      <div className="mt-2 text-sm text-slate-700">{message.subject || 'No subject'}</div>
                      <pre className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{message.body_text || '—'}</pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
