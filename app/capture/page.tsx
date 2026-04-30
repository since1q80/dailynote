'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/app/LanguageProvider';

export default function CapturePage() {
  const { t } = useLanguage();
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const onSave = async () => {
    const trimmed = content.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'unknown' }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      router.push('/');
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  const onPolish = async () => {
    const trimmed = content.trim();
    if (!trimmed || polishing) return;
    setPolishing(true);
    setError(null);
    try {
      const res = await fetch('/api/polish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: trimmed }),
      });
      const data = await res.json().catch(() => ({ error: 'unknown' }));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setContent(data.polished);
      setTimeout(() => textareaRef.current?.focus(), 0);
    } catch (e: unknown) {
      setError(t('capture.polishFailed', { msg: e instanceof Error ? e.message : String(e) }));
    } finally {
      setPolishing(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      onSave();
    }
  };

  return (
    <main className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/" className="text-sm text-ink-soft hover:text-ink">
          {t('capture.cancel')}
        </Link>
        <span className="text-[11px] text-ink-faint">{t('capture.justNow')}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={onPolish}
            disabled={polishing || saving || !content.trim()}
            className="rounded-full bg-ink-soft px-4 py-1.5 text-sm font-medium text-paper transition hover:bg-ink disabled:opacity-30"
          >
            {polishing ? t('capture.polishing') : t('capture.polish')}
          </button>
          <button
            onClick={onSave}
            disabled={saving || polishing || !content.trim()}
            className="rounded-full bg-accent-dark px-4 py-1.5 text-sm font-medium text-paper transition hover:bg-accent disabled:opacity-30"
          >
            {saving ? t('capture.saving') : t('capture.save')}
          </button>
        </div>
      </div>

      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={t('capture.placeholder')}
        className="flex-1 w-full rounded-2xl border-none bg-transparent p-2 text-[17px] leading-8 outline-none placeholder:text-ink-ghost"
        autoFocus
      />

      {error && (
        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {error}
        </div>
      )}

      <p className="mt-2 text-right text-[11px] text-ink-faint">
        {content.length > 0 && t('capture.charCount', { n: content.length })}
      </p>
    </main>
  );
}
