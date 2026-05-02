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

      {prompts.length === 0 ? (
        <p className="text-sm text-ink-faint">{t('common.loading')}</p>
      ) : (
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
      )}
    </div>
  );
}
