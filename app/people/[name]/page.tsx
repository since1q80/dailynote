'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { AskResult, Note } from '@/lib/types';
import { formatDate, renderAnswer } from '@/lib/ui';
import { useLanguage } from '@/app/LanguageProvider';

export default function PersonPage({ params }: { params: { name: string } }) {
  const { t } = useLanguage();
  const personName = decodeURIComponent(params.name);

  const [notes, setNotes] = useState<Note[] | null>(null);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [answered, setAnswered] = useState<{ q: string; r: AskResult; notes: Note[] } | null>(null);

  useEffect(() => {
    if (notes !== null || loadingNotes) return;
    setLoadingNotes(true);
    fetch(`/api/people/${encodeURIComponent(personName)}/notes`)
      .then((r) => r.json())
      .then((d) => { setNotes(d.notes || []); setLoadingNotes(false); })
      .catch(() => { setNotes([]); setLoadingNotes(false); });
  }, [loadingNotes, notes, personName]);

  const removeMention = async (noteId: string) => {
    setNotes((prev) => prev ? prev.filter((n) => n.id !== noteId) : prev);
    await fetch(`/api/people/${encodeURIComponent(personName)}/notes`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ note_id: noteId }),
    });
  };

  const ask = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || asking) return;
    setAsking(true);
    setErr(null);
    try {
      const res = await fetch(`/api/people/${encodeURIComponent(personName)}/ask`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: trimmed }),
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
      setAsking(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/" className="text-sm text-ink-soft hover:text-ink">{t('common.home')}</Link>
        <h1 className="text-2xl font-medium">{personName}</h1>
        {notes && <span className="text-xs text-ink-faint">{t('person.mentions', { n: notes.length })}</span>}
      </div>

      {loadingNotes && (
        <p className="text-[13px] text-ink-faint">{t('common.loading')}</p>
      )}

      {notes && notes.length > 0 && (
        <section className="mb-8">
          <p className="mb-3 text-[11px] uppercase tracking-wider text-ink-faint">{t('person.notes')}</p>
          <div className="space-y-2">
            {notes.map((n) => (
              <div key={n.id} className="rounded-xl border border-line bg-paper p-4">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-[11px] text-ink-faint">{formatDate(n.created_at)}</p>
                  <button
                    onClick={() => removeMention(n.id)}
                    className="text-[11px] text-ink-ghost transition hover:text-ink"
                  >
                    ×
                  </button>
                </div>
                <p className="whitespace-pre-wrap text-[13px] leading-6">{n.content}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {err && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {t('common.error', { msg: err })}
        </div>
      )}

      {answered && !asking && (
        <div className="mb-6">
          <p className="mb-1 text-[11px] uppercase tracking-wider text-ink-faint">{t('common.yourQuestion')}</p>
          <p className="mb-4 text-[15px] font-medium leading-6">{answered.q}</p>
          <div className="whitespace-pre-wrap text-[14px] leading-7">
            {renderAnswer(answered.r.answer, answered.notes)}
          </div>
          {answered.r.what_you_havent_written.length > 0 && (
            <div className="mt-4 rounded-xl border border-dashed border-ink-ghost p-4">
              <p className="mb-2 text-[11px] uppercase tracking-wider text-ink-faint">{t('common.haventWritten')}</p>
              <ul className="space-y-1">
                {answered.r.what_you_havent_written.map((g, i) => (
                  <li key={i} className="text-[13px] leading-6 text-ink-soft">— {g}</li>
                ))}
              </ul>
            </div>
          )}
          {answered.r.follow_ups.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-[11px] uppercase tracking-wider text-ink-faint">{t('common.followUp')}</p>
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

      <div className="sticky bottom-4 flex items-end gap-2 rounded-2xl border border-line bg-paper p-2 shadow-sm">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); ask(question); } }}
          placeholder={t('person.askPlaceholder', { name: personName })}
          rows={2}
          className="flex-1 bg-transparent p-2 text-[14px] leading-6 outline-none placeholder:text-ink-ghost"
          disabled={asking}
        />
        <button
          onClick={() => ask(question)}
          disabled={asking || !question.trim()}
          className="rounded-full bg-accent-dark px-4 py-2 text-[13px] font-medium text-paper transition disabled:opacity-30"
        >
          {asking ? '...' : t('common.ask')}
        </button>
      </div>
    </div>
  );
}
