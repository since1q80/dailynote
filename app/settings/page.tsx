'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/app/LanguageProvider';
import type { Lang } from '@/lib/i18n';

type PromptEntry = {
  key: string;
  label: string;
  default: string;
  current: string;
  modified: boolean;
};

const PROVIDER_DEFAULT_BASE_URL: Record<string, string> = {
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  minimax: 'https://api.minimax.chat/v1',
};

export default function SettingsPage() {
  const { t, lang, setLang } = useLanguage();
  const [prompts, setPrompts] = useState<PromptEntry[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string>('');
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [desktopConfig, setDesktopConfig] = useState<Awaited<ReturnType<NonNullable<typeof window.dailyNote>['getConfig']>> | null>(null);
  const [providerKey, setProviderKey] = useState('');
  const [providerUrl, setProviderUrl] = useState('');
  const [modelFast, setModelFast] = useState('');
  const [modelSmart, setModelSmart] = useState('');
  const [llmProvider, setLlmProvider] = useState('openai');
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [purpose, setPurpose] = useState('');
  const [purposeSaved, setPurposeSaved] = useState(false);
  const [healthChecking, setHealthChecking] = useState(false);
  const [healthIssues, setHealthIssues] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/prompts')
      .then((r) => r.json())
      .then(({ prompts }: { prompts: PromptEntry[] }) => {
        setPrompts(prompts);
        const d: Record<string, string> = {};
        for (const p of prompts) d[p.key] = p.current;
        setDrafts(d);
        setActiveKey((prev) => prev || (prompts.length > 0 ? prompts[0].key : ''));
      });
  }, [lang]);

  useEffect(() => {
    fetch('/api/app-status').then((r) => r.json()).then(setStatus).catch(() => {});
    fetch('/api/purpose')
      .then((r) => r.json())
      .then(({ purpose }) => setPurpose(purpose?.content ?? ''))
      .catch(() => {});
    window.dailyNote?.getConfig().then((cfg) => {
      setDesktopConfig(cfg);
      const provider = cfg.llmProvider || 'openai';
      setLlmProvider(provider);
      setProviderKey(provider === 'openai'
        ? (cfg.hasProviderKey || cfg.hasOpenAIKey ? '********' : '')
        : (cfg.hasProviderKey ? '********' : ''));
      setProviderUrl(cfg.providerBaseUrl || '');
      setModelFast(cfg.modelFastOverride || '');
      setModelSmart(cfg.modelSmartOverride || '');
    });
  }, []);

  const save = useCallback(
    async (key: string) => {
      setSaving(key);
      await fetch('/api/prompts', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ [key]: drafts[key] }),
      });
      setPrompts((prev) =>
        prev.map((p) =>
          p.key === key
            ? { ...p, current: drafts[key], modified: drafts[key] !== p.default }
            : p
        )
      );
      setSaving(null);
      setSaved(key);
      setTimeout(() => setSaved(null), 1800);
    },
    [drafts]
  );

  const reset = useCallback(
    async (key: string) => {
      const entry = prompts.find((p) => p.key === key);
      if (!entry) return;
      setDrafts((d) => ({ ...d, [key]: entry.default }));
      setSaving(key);
      await fetch('/api/prompts', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ [key]: entry.default }),
      });
      setPrompts((prev) =>
        prev.map((p) => (p.key === key ? { ...p, current: entry.default, modified: false } : p))
      );
      setSaving(null);
      setSaved(key);
      setTimeout(() => setSaved(null), 1800);
    },
    [prompts]
  );

  const active = prompts.find((p) => p.key === activeKey);

  const saveDesktopConfig = useCallback(async () => {
    if (!desktopConfig || !window.dailyNote) return;
    setStatusMessage(t('settings.savingMacSettings'));
    await window.dailyNote.saveConfig({
      ...desktopConfig,
      llmProvider,
      providerApiKey: providerKey,
      providerBaseUrl: providerUrl,
      modelFastOverride: modelFast,
      modelSmartOverride: modelSmart,
      httpsProxy: desktopConfig.httpsProxy,
      globalShortcut: desktopConfig.globalShortcut,
      hasCompletedOnboarding: desktopConfig.hasCompletedOnboarding,
    });
    const nextStatus = await fetch('/api/app-status').then((r) => r.json());
    setStatus(nextStatus);
    setStatusMessage(t('common.saved'));
    setTimeout(() => setStatusMessage(null), 1600);
  }, [desktopConfig, llmProvider, providerKey, providerUrl, modelFast, modelSmart, t]);

  const testOpenAI = useCallback(async () => {
    if (desktopConfig && window.dailyNote) {
      await window.dailyNote.saveConfig({
        ...desktopConfig,
        llmProvider,
        providerApiKey: providerKey,
        providerBaseUrl: providerUrl,
        modelFastOverride: modelFast,
        modelSmartOverride: modelSmart,
        httpsProxy: desktopConfig.httpsProxy,
        globalShortcut: desktopConfig.globalShortcut,
        hasCompletedOnboarding: desktopConfig.hasCompletedOnboarding,
      });
    }
    setStatusMessage(t('settings.testingAI'));
    const res = await fetch('/api/app-status/test-openai', { method: 'POST' });
    const data = await res.json();
    setStatusMessage(data.ok ? t('settings.aiConnected', { n: data.modelCount }) : `${data.error} ${data.hint ?? ''}`);
  }, [desktopConfig, llmProvider, providerKey, providerUrl, modelFast, modelSmart, t]);

  const savePurpose = useCallback(async () => {
    await fetch('/api/purpose', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: purpose }),
    });
    setPurposeSaved(true);
    setTimeout(() => setPurposeSaved(false), 1800);
  }, [purpose]);

  const backup = useCallback(async () => {
    setStatusMessage(t('settings.backingUp'));
    const res = await fetch('/api/backup', { method: 'POST' });
    const data = await res.json();
    setStatusMessage(data.ok ? t('settings.backedUpTo', { path: data.path }) : t('settings.backupFailed', { error: data.error }));
  }, [t]);

  const runHealth = useCallback(async () => {
    setHealthChecking(true);
    try {
      const res = await fetch('/api/health', { method: 'POST' });
      const data = await res.json();
      if (res.ok) setHealthIssues(data.report?.issues?.length ?? 0);
    } finally {
      setHealthChecking(false);
    }
  }, []);

  const importNotes = useCallback(async () => {
    const text = importText.trim();
    if (!text || importing) return;
    setImporting(true);
    setImportedCount(null);
    try {
      const res = await fetch('/api/import-notes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (res.ok) {
        setImportedCount(data.count ?? 0);
        setImportText('');
      }
    } finally {
      setImporting(false);
    }
  }, [importText, importing]);

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/" className="text-[13px] text-ink-faint transition hover:text-ink">
          {t('common.back')}
        </Link>
        <h1 className="text-xl font-medium">{t('settings.title')}</h1>
      </div>

      {/* Language switcher */}
      <div className="mb-6 flex items-center gap-3 rounded-2xl bg-canvas px-4 py-3">
        <p className="text-[13px] text-ink-soft">{t('settings.language')}</p>
        <div className="flex gap-1">
          {(['zh', 'en'] as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`rounded-lg px-3 py-1 text-[13px] transition ${
                lang === l
                  ? 'bg-paper font-medium text-ink shadow-sm'
                  : 'text-ink-faint hover:text-ink-soft'
              }`}
            >
              {l === 'zh' ? '中文' : 'English'}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-line bg-paper p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="font-medium">{t('settings.purpose')}</p>
            <p className="mt-1 text-[12px] text-ink-faint">{t('settings.purposeHelp')}</p>
          </div>
          <button
            onClick={savePurpose}
            className="rounded-lg bg-accent px-4 py-1.5 text-[13px] text-white transition hover:bg-accent-dark"
          >
            {purposeSaved ? t('common.saved') : t('common.save')}
          </button>
        </div>
        <textarea
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          placeholder={t('settings.purposePlaceholder')}
          className="h-24 w-full rounded-xl border border-line bg-canvas p-3 text-[13px] leading-6 outline-none placeholder:text-ink-ghost focus:border-accent/40"
        />
      </div>

      <div className="mb-6 rounded-2xl border border-line bg-paper p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium">{t('settings.wikiMaintenance')}</p>
            <p className="mt-1 text-[12px] text-ink-faint">{t('settings.wikiMaintenanceHelp')}</p>
            {healthIssues !== null && (
              <p className="mt-2 text-[12px] text-ink-soft">
                {t('settings.healthResult', { n: healthIssues })}
              </p>
            )}
          </div>
          <button
            onClick={runHealth}
            disabled={healthChecking}
            className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-[12px] text-ink-soft transition hover:border-accent/40 disabled:opacity-50"
          >
            {healthChecking ? t('settings.healthChecking') : t('settings.healthCheck')}
          </button>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-line bg-paper p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="font-medium">Mac App</p>
            <p className="mt-1 text-[12px] text-ink-faint">
              {status?.desktop ? t('settings.desktopRunning') : t('settings.browserMode')}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={testOpenAI}
              className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-ink-soft transition hover:border-accent/40"
            >
              {t('settings.testAI')}
            </button>
          </div>
        </div>

        {desktopConfig ? (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[11px] text-ink-ghost">{t('settings.dataDir')}</label>
              <div className="flex gap-2">
                <input
                  value={desktopConfig.dataDir}
                  onChange={(e) => setDesktopConfig({ ...desktopConfig, dataDir: e.target.value })}
                  className="min-w-0 flex-1 rounded-xl border border-line bg-canvas px-3 py-2 text-[13px] outline-none"
                />
                <button
                  onClick={async () => {
                    const dir = await window.dailyNote?.chooseDataDir();
                    if (dir) setDesktopConfig({ ...desktopConfig, dataDir: dir });
                  }}
                  className="rounded-xl border border-line px-3 py-2 text-[12px] text-ink-soft"
                >
                  {t('settings.choose')}
                </button>
                <button
                  onClick={() => window.dailyNote?.openDataDir()}
                  className="rounded-xl border border-line px-3 py-2 text-[12px] text-ink-soft"
                >
                  {t('settings.open')}
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] text-ink-ghost">{t('settings.llmProvider')}</label>
              <p className="mb-1 text-[11px] text-ink-faint">{t('settings.llmProviderHelp')}</p>
              <select
                value={llmProvider}
                onChange={(e) => {
                  const next = e.target.value;
                  setLlmProvider(next);
                  setProviderKey('');
                  setModelFast('');
                  setModelSmart('');
                  setStatusMessage(null);
                  setProviderUrl(PROVIDER_DEFAULT_BASE_URL[next] ?? '');
                }}
                className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-[13px] outline-none"
              >
                <option value="openai">{t('settings.llmProviderOpenAI')}</option>
                <option value="anthropic">{t('settings.llmProviderAnthropic')}</option>
                <option value="qwen">{t('settings.llmProviderQwen')}</option>
                <option value="zhipu">{t('settings.llmProviderZhipu')}</option>
                <option value="minimax">{t('settings.llmProviderMinimax')}</option>
                <option value="openai_compatible">{t('settings.llmProviderOllama')}</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] text-ink-ghost">{t('settings.apiKey')}</label>
                <input
                  value={providerKey}
                  onChange={(e) => setProviderKey(e.target.value)}
                  type="password"
                  className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-[13px] outline-none"
                />
              </div>
              {(llmProvider === 'openai_compatible' || llmProvider === 'openai' || llmProvider === 'qwen' || llmProvider === 'zhipu' || llmProvider === 'minimax') && (
                <div>
                  <label className="mb-1 block text-[11px] text-ink-ghost">{t('settings.baseUrl')}</label>
                  <input
                    value={providerUrl}
                    onChange={(e) => setProviderUrl(e.target.value)}
                    placeholder={t('settings.baseUrlPlaceholder')}
                    className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-[13px] outline-none"
                  />
                </div>
              )}
            </div>

            {(llmProvider === 'openai_compatible' || llmProvider === 'anthropic') && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] text-ink-ghost">{t('settings.fastModel')}</label>
                  <input
                    value={modelFast}
                    onChange={(e) => setModelFast(e.target.value)}
                    placeholder={llmProvider === 'openai_compatible' ? 'qwen2.5:7b' : 'claude-sonnet-4-20250514'}
                    className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-[13px] outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-ink-ghost">{t('settings.smartModel')}</label>
                  <input
                    value={modelSmart}
                    onChange={(e) => setModelSmart(e.target.value)}
                    placeholder={llmProvider === 'openai_compatible' ? 'qwen2.5:14b' : 'claude-sonnet-4-20250514'}
                    className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-[13px] outline-none"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] text-ink-ghost">HTTPS_PROXY</label>
                <input
                  value={desktopConfig.httpsProxy}
                  onChange={(e) => setDesktopConfig({ ...desktopConfig, httpsProxy: e.target.value })}
                  placeholder="http://127.0.0.1:1087"
                  className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-[13px] outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-ink-ghost">{t('settings.globalShortcut')}</label>
                <input
                  value={desktopConfig.globalShortcut}
                  onChange={(e) => setDesktopConfig({ ...desktopConfig, globalShortcut: e.target.value })}
                  className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-[13px] outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-[12px] text-ink-faint">{statusMessage}</p>
              <div className="flex gap-2">
                <button onClick={backup} className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-ink-soft">
                  {t('settings.backup')}
                </button>
                <button onClick={saveDesktopConfig} className="rounded-lg bg-accent px-4 py-1.5 text-[13px] text-white">
                  {t('settings.saveMacSettings')}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-[12px] leading-6 text-ink-faint">
            {t('settings.desktopUnavailable')}
          </p>
        )}
      </div>

      <div className="mb-6 rounded-2xl border border-line bg-paper p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="font-medium">{t('settings.import')}</p>
            <p className="mt-1 text-[12px] text-ink-faint">{t('settings.importHelp')}</p>
          </div>
          <button
            onClick={importNotes}
            disabled={importing || !importText.trim()}
            className="shrink-0 rounded-lg bg-accent px-4 py-1.5 text-[13px] text-white transition hover:bg-accent-dark disabled:opacity-50"
          >
            {importing
              ? t('settings.importing')
              : importedCount !== null
              ? t('settings.imported', { n: importedCount })
              : t('settings.importButton')}
          </button>
        </div>
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder={t('settings.importPlaceholder')}
          className="h-28 w-full rounded-xl border border-line bg-canvas p-3 text-[13px] leading-6 outline-none placeholder:text-ink-ghost focus:border-accent/40"
        />
      </div>

      <div className="mb-4">
        <button
          onClick={() => setAdvancedOpen((v) => !v)}
          className="rounded-lg px-2.5 py-1.5 text-[12px] text-ink-ghost transition hover:bg-canvas hover:text-ink-faint"
        >
          {advancedOpen ? t('settings.advancedClose') : t('settings.advancedOpen')}
        </button>
      </div>

      {advancedOpen && prompts.length === 0 ? (
        <p className="text-sm text-ink-faint">{t('common.loading')}</p>
      ) : advancedOpen ? (
        <div className="flex gap-6">
          {/* Sidebar */}
          <aside className="w-28 shrink-0">
            <p className="mb-2 text-[11px] uppercase tracking-wider text-ink-ghost">{t('settings.prompts')}</p>
            <div className="space-y-0.5">
              {prompts.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setActiveKey(p.key)}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[13px] transition ${
                    p.key === activeKey
                      ? 'bg-canvas font-medium text-ink'
                      : 'text-ink-soft hover:bg-canvas/60'
                  }`}
                >
                  <span>{t(`prompt.${p.key}`)}</span>
                  {p.modified && (
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  )}
                </button>
              ))}
            </div>
          </aside>

          {/* Editor */}
          {active && (
            <div className="min-w-0 flex-1">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{t(`prompt.${activeKey}`)}</p>
                  {active.modified && (
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] text-accent-dark">
                      {t('settings.modified')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {active.modified && (
                    <button
                      onClick={() => reset(activeKey)}
                      disabled={saving === activeKey}
                      className="rounded-lg px-3 py-1.5 text-[12px] text-ink-faint transition hover:bg-canvas hover:text-ink"
                    >
                      {t('settings.resetToDefault')}
                    </button>
                  )}
                  <button
                    onClick={() => save(activeKey)}
                    disabled={saving === activeKey}
                    className="rounded-lg bg-accent px-4 py-1.5 text-[13px] text-white transition hover:bg-accent-dark disabled:opacity-50"
                  >
                    {saving === activeKey
                      ? t('common.saving')
                      : saved === activeKey
                      ? t('common.saved')
                      : t('common.save')}
                  </button>
                </div>
              </div>

              <textarea
                value={drafts[activeKey] ?? ''}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [activeKey]: e.target.value }))
                }
                spellCheck={false}
                className="h-[60vh] w-full rounded-2xl border border-line bg-paper p-4 font-mono text-[13px] leading-relaxed text-ink outline-none transition focus:border-accent/40"
              />

              <p className="mt-2 text-[11px] text-ink-ghost">
                {t('settings.charCount', { n: drafts[activeKey]?.length ?? 0 })}
              </p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
