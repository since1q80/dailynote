'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { AskResult, Note } from '@/lib/types';
import { renderAnswer } from '@/lib/ui';
import { useLanguage } from '@/app/LanguageProvider';

type Props = { params: { title: string } };

export default function AskPage({ params }: Props) {
  const { t } = useLanguage();
  const conceptTitle = decodeURIComponent(params.title);

  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [answered, setAnswered] = useState<
    { q: string; r: AskResult; notes: Note[] } | null
  >(null);

  const ask = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: conceptTitle, question: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'unknown' }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as AskResult & { notes: Note[] };
      setAnswered({ q: trimmed, r: data, notes: data.notes });
      setQuestion('');
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      ask(question);
    }
  };

  const examples = [t('ask.example1'), t('ask.example2'), t('ask.example3')];

  return (
    <main>
      <div className="mb-5 flex items-center gap-3">
        <Link
          href={`/concepts/${encodeURIComponent(conceptTitle)}`}
          className="text-sm text-ink-soft hover:text-ink"
        >
          {t('common.back')}
        </Link>
        <span className="rounded-full bg-accent-soft px-3 py-1 text-[12px]">
          <span className="text-accent">{t('ask.about')}</span>
          <span className="font-medium text-accent-dark">{conceptTitle}</span>
        </span>
      </div>

      {!answered && !loading && (
        <div className="mt-4 space-y-5">
          <p className="text-[14px] leading-6 text-ink-faint">
            {t('ask.intro', { title: conceptTitle }).split('\n').map((line, i) => (
              <span key={i}>{line}{i === 0 && <br />}</span>
            ))}
          </p>
          <div>
            <p className="mb-2 text-[11px] uppercase tracking-wider text-ink-faint">
              {t('ask.examples')}
            </p>
            <div className="space-y-1.5">
              {examples.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="block w-full rounded-xl border border-line p-3 text-left text-[13px] text-ink-soft transition hover:border-accent/40 hover:text-ink"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="mt-10 text-center text-[13px] text-ink-faint">
          <p>{t('ask.loading')}</p>
        </div>
      )}

      {err && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {t('common.error', { msg: err })}
        </div>
      )}

      {answered && !loading && (
        <div className="mt-4">
          <p className="mb-1.5 text-[11px] uppercase tracking-wider text-ink-faint">
            {t('common.yourQuestion')}
          </p>
          <p className="mb-6 text-[15px] font-medium leading-6">{answered.q}</p>

          <div className="whitespace-pre-wrap text-[14px] leading-7">
            {renderAnswer(answered.r.answer, answered.notes)}
          </div>

          {answered.r.what_you_havent_written.length > 0 && (
            <div className="mt-6 rounded-xl border border-dashed border-ink-ghost p-4">
              <p className="mb-2 text-[11px] uppercase tracking-wider text-ink-faint">
                {t('common.haventWritten')}
              </p>
              <ul className="space-y-1">
                {answered.r.what_you_havent_written.map((g, i) => (
                  <li key={i} className="text-[13px] leading-6 text-ink-soft">
                    — {g}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {answered.r.follow_ups.length > 0 && (
            <div className="mt-6">
              <p className="mb-2 text-[11px] uppercase tracking-wider text-ink-faint">
                {t('common.followUp')}
              </p>
              <div className="space-y-1.5">
                {answered.r.follow_ups.map((f, i) => (
                  <button
                    key={i}
                    onClick={() => ask(f)}
                    className="block w-full rounded-xl border border-line p-3 text-left text-[13px] transition hover:border-accent/40"
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="sticky bottom-4 mt-8 flex items-end gap-2 rounded-2xl border border-line bg-paper p-2 shadow-sm">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t('ask.placeholder')}
          rows={2}
          className="flex-1 bg-transparent p-2 text-[14px] leading-6 outline-none placeholder:text-ink-ghost"
          disabled={loading}
        />
        <button
          onClick={() => ask(question)}
          disabled={loading || !question.trim()}
          className="rounded-full bg-accent-dark px-4 py-2 text-[13px] font-medium text-paper transition disabled:opacity-30"
        >
          {t('common.ask')}
        </button>
      </div>
    </main>
  );
}
