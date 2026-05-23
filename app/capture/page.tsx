'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/app/LanguageProvider';
import type { EchoResult, InstantInsight, RelatedNote } from '@/lib/types';
import { formatDate } from '@/lib/ui';
import { markHomeNeedsRefresh } from '@/app/HomeFreshness';

export default function CapturePage() {
  const { t } = useLanguage();
  const router = useRouter();
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [echoes, setEchoes] = useState<RelatedNote[]>([]);
  const [insight, setInsight] = useState<InstantInsight | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    if (insight || content.trim().length < 12) {
      setEchoes([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/echo', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ content }),
          signal: controller.signal,
        });
        if (res.ok) {
          const data = (await res.json()) as EchoResult;
          setEchoes(data.notes || []);
        }
      } catch {
        if (!controller.signal.aborted) setEchoes([]);
      }
    }, 500);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [content, insight]);

  useEffect(() => {
    if (!insight || !analyzing) return;
    let cancelled = false;
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      try {
        const res = await fetch(`/api/notes/${insight.note.id}/insight`);
        if (res.ok) {
          const data = (await res.json()) as { insight: InstantInsight };
          if (!cancelled) setInsight(data.insight);
          const hasResult =
            data.insight.tags.length > 0 ||
            data.insight.people.length > 0 ||
            data.insight.possible_concepts.length > 0;
          if (hasResult || tries >= 12) {
            clearInterval(timer);
            if (!cancelled) setAnalyzing(false);
          }
        }
      } catch {
        if (tries >= 12) {
          clearInterval(timer);
          if (!cancelled) setAnalyzing(false);
        }
      }
    }, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [analyzing, insight]);

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
      const data = await res.json();
      markHomeNeedsRefresh(data.note?.id);
      setContent('');
      setEchoes([]);
      router.push('/');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
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

  if (insight) {
    const hasInsight =
      insight.tags.length > 0 ||
      insight.people.length > 0 ||
      insight.possible_concepts.length > 0 ||
      insight.related_notes.length > 0;

    return (
      <main>
        <div className="mb-6 flex items-center justify-between">
          <Link href="/" className="text-sm text-ink-soft hover:text-ink">
            {t('capture.backHome')}
          </Link>
          <button
            onClick={() => {
              setInsight(null);
              setAnalyzing(false);
              setTimeout(() => textareaRef.current?.focus(), 0);
            }}
            className="rounded-full bg-accent-dark px-4 py-1.5 text-sm font-medium text-paper transition hover:bg-accent"
          >
            {t('capture.writeAnother')}
          </button>
        </div>

        <section className="rounded-2xl bg-canvas p-5">
          <p className="mb-4 text-[11px] uppercase tracking-wider text-ink-faint">
            {analyzing ? t('capture.analyzing') : t('capture.insightTitle')}
          </p>
          {!hasInsight && <p className="text-[14px] text-ink-soft">{t('capture.noInsight')}</p>}

          <InsightRow title={t('capture.insightTags')} items={insight.tags.map((x) => `#${x}`)} />
          <InsightRow title={t('capture.insightPeople')} items={insight.people} />
          <InsightRow title={t('capture.insightConcepts')} items={insight.possible_concepts} />

          {insight.related_notes.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-[11px] text-ink-ghost">{t('capture.related')}</p>
              <RelatedList notes={insight.related_notes} />
            </div>
          )}
        </section>
      </main>
    );
  }

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

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_220px] gap-5">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t('capture.placeholder')}
          className="h-full w-full rounded-2xl border-none bg-transparent p-2 text-[17px] leading-8 outline-none placeholder:text-ink-ghost"
          autoFocus
        />

        <aside className="min-h-0 overflow-auto border-l border-line pl-4">
          <p className="mb-3 text-[11px] uppercase tracking-wider text-ink-faint">{t('capture.echo')}</p>
          {echoes.length > 0 ? (
            <RelatedList notes={echoes} />
          ) : (
            <p className="text-[12px] leading-5 text-ink-ghost">{t('capture.noInsight')}</p>
          )}
        </aside>
      </div>

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

function InsightRow({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mb-3">
      <p className="mb-1 text-[11px] text-ink-ghost">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span key={item} className="rounded-full bg-paper px-2.5 py-1 text-[12px] text-ink-soft">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function RelatedList({ notes }: { notes: RelatedNote[] }) {
  return (
    <div className="space-y-2">
      {notes.map(({ note, reason }) => (
        <div key={note.id} className="rounded-xl border border-line bg-paper p-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="text-[10px] text-ink-ghost">{formatDate(note.created_at)}</p>
            <p className="truncate text-[10px] text-accent">{reason}</p>
          </div>
          <p className="line-clamp-4 whitespace-pre-wrap text-[12px] leading-5 text-ink-soft">
            {note.content}
          </p>
        </div>
      ))}
    </div>
  );
}
