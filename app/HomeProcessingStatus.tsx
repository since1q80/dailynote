'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HOME_PENDING_NOTE_KEY } from './HomeFreshness';
import { useLanguage } from './LanguageProvider';
import type { Note, NoteProcessingStatus } from '@/lib/types';
import { formatDate } from '@/lib/ui';

type Payload = {
  note: Note;
  status: NoteProcessingStatus;
};

export default function HomeProcessingStatus() {
  const router = useRouter();
  const { t } = useLanguage();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [noteId, setNoteId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const id =
        window.sessionStorage.getItem(HOME_PENDING_NOTE_KEY) ||
        window.localStorage.getItem(HOME_PENDING_NOTE_KEY);
      if (id) setNoteId(id);
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    if (!noteId) return;
    let cancelled = false;
    let tries = 0;

    const poll = async () => {
      tries += 1;
      try {
        const res = await fetch(`/api/notes/${noteId}/processing`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as Payload;
        if (cancelled) return;
        setPayload(data);
        if (data.status.status === 'done' || data.status.status === 'error') {
          try {
            window.sessionStorage.removeItem(HOME_PENDING_NOTE_KEY);
            window.localStorage.removeItem(HOME_PENDING_NOTE_KEY);
          } catch {
            // no-op
          }
          setNoteId(null);
          router.refresh();
          return;
        }
      } catch {
        if (!cancelled && tries >= 20) {
          setNoteId(null);
        }
      }
    };

    poll();
    const timer = window.setInterval(poll, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [noteId, router]);

  if (!payload && !noteId) return null;

  const status = payload?.status.status ?? 'processing';
  const tags = payload?.status.tags ?? payload?.note.tags ?? [];
  const concepts = payload?.status.concepts ?? payload?.note.concepts ?? [];
  const people = payload?.status.people ?? [];
  const relatedNotes = payload?.status.related_notes ?? [];
  const message = payload?.status.message;
  const hasSignals = tags.length > 0 || concepts.length > 0 || people.length > 0;
  const notePreview = payload?.note.content.trim();
  const title =
    status === 'processing'
      ? t('home.aiOrganizing')
      : status === 'done'
      ? t('home.justOrganized')
      : t('home.aiFailed');
  const subtitle =
    status === 'processing'
      ? t('home.organizingHint')
      : status === 'done'
      ? hasSignals
        ? t('home.organizedSummary', {
            concepts: concepts.length,
            tags: tags.length,
            people: people.length,
          })
        : t('home.organizedEmpty')
      : message || t('home.aiFailed');

  return (
    <section className="mb-6 mt-6 rounded-2xl border border-line bg-canvas p-5">
      <div className="flex items-start gap-3">
        {status === 'processing' ? (
          <span className="mt-1.5 h-3 w-3 shrink-0 animate-pulse rounded-full bg-accent" />
        ) : status === 'done' ? (
          <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full bg-green-500" />
        ) : (
          <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full bg-red-500" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-ink">{title}</p>
              <p className="mt-1 text-[12px] leading-5 text-ink-faint">{subtitle}</p>
            </div>
            {status === 'done' && relatedNotes.length > 0 && (
              <p className="shrink-0 rounded-full bg-paper px-2.5 py-1 text-[11px] text-ink-soft">
                {t('home.relatedCount', { n: relatedNotes.length })}
              </p>
            )}
          </div>
          {message && status === 'done' && (
            <p className="mt-3 line-clamp-2 text-[13px] leading-6 text-ink-soft">{message}</p>
          )}
          {notePreview && (
            <p className="mt-3 line-clamp-2 rounded-xl bg-paper/60 px-3 py-2 text-[12px] leading-5 text-ink-faint">
              {notePreview}
            </p>
          )}
          {hasSignals && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {concepts.map((item) => (
                <span key={`c-${item}`} className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] text-accent-dark">
                  {item}
                </span>
              ))}
              {tags.map((item) => (
                <span key={`t-${item}`} className="rounded-full bg-paper px-2.5 py-1 text-[11px] text-ink-soft">
                  #{item}
                </span>
              ))}
              {people.map((item) => (
                <span key={`p-${item}`} className="rounded-full bg-paper px-2.5 py-1 text-[11px] text-ink-soft">
                  {item}
                </span>
              ))}
            </div>
          )}
          {relatedNotes.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-[11px] uppercase tracking-wider text-ink-ghost">{t('home.relatedOldNotes')}</p>
              {relatedNotes.slice(0, 2).map(({ note, reason }) => (
                <div key={note.id} className="rounded-xl bg-paper/70 px-3 py-2">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <p className="text-[10px] text-ink-ghost">{formatDate(note.created_at)}</p>
                    <p className="truncate text-[10px] text-ink-ghost">{reason}</p>
                  </div>
                  <p className="line-clamp-2 text-[12px] leading-5 text-ink-soft">{note.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
