'use client';

import { useCallback, useState } from 'react';
import type { GlobalAskResult, Note } from '@/lib/types';
import { formatDate, renderAnswer } from '@/lib/ui';
import { useLanguage } from './LanguageProvider';

type SearchResult = GlobalAskResult & { notes: Note[] };

export default function SearchBox() {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);

  const search = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setErr(null);
    setResult(null);
    try {
      const res = await fetch('/api/ask-global', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'unknown' }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setResult(await res.json());
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [loading]);

  const clear = () => { setResult(null); setErr(null); setQuery(''); };

  const relevantNotes = result
    ? (result.relevant_note_ids || [])
        .map((i) => result.notes[i - 1])
        .filter((n): n is Note => !!n)
    : [];

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 rounded-2xl border border-line bg-paper p-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') search(query); }}
          placeholder={t('search.placeholder')}
          className="flex-1 bg-transparent px-2 py-1.5 text-[14px] outline-none placeholder:text-ink-ghost"
        />
        {result && !loading && (
          <button
            onClick={clear}
            className="shrink-0 text-[18px] leading-none text-ink-ghost transition hover:text-ink"
            aria-label={t('search.clear')}
          >
            ×
          </button>
        )}
        <button
          onClick={() => search(query)}
          disabled={loading || !query.trim()}
          className="shrink-0 rounded-full bg-accent-dark px-4 py-1.5 text-[13px] font-medium text-paper transition disabled:opacity-30"
        >
          {loading ? <span className="inline-block animate-pulse">{t('search.searching')}</span> : t('search.go')}
        </button>
      </div>

      {err && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {t('common.error', { msg: err })}
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-2xl border border-line bg-paper p-5">
          <div className="mb-4 whitespace-pre-wrap text-[14px] leading-7">
            {renderAnswer(result.answer, result.notes)}
          </div>

          {relevantNotes.length > 0 && (
            <div className="mb-4 space-y-2">
              <p className="text-[11px] uppercase tracking-wider text-ink-faint">{t('search.relatedNotes')}</p>
              {relevantNotes.map((n) => (
                <div key={n.id} className="rounded-xl border border-line p-3">
                  <p className="mb-1 text-[11px] text-ink-faint">{formatDate(n.created_at)}</p>
                  <p className="whitespace-pre-wrap text-[13px] leading-6">{n.content}</p>
                </div>
              ))}
            </div>
          )}

          {result.follow_ups.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] uppercase tracking-wider text-ink-faint">{t('search.followUp')}</p>
              {result.follow_ups.map((f, i) => (
                <button
                  key={i}
                  onClick={() => { setQuery(f); search(f); }}
                  className="block w-full rounded-xl border border-line p-3 text-left text-[13px] text-ink-soft transition hover:border-accent/40 hover:text-ink"
                >
                  {f}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
