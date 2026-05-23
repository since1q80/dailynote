'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Note, ReviewItem } from '@/lib/types';
import { useLanguage } from './LanguageProvider';
import { formatDate } from '@/lib/ui';

type ReviewItemWithNote = ReviewItem & { note?: Note | null };

export default function ReviewQueue({ initialItems }: { initialItems: ReviewItemWithNote[] }) {
  const { t } = useLanguage();
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [busyId, setBusyId] = useState<string | null>(null);

  const act = async (id: string, action: 'accept' | 'dismiss') => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/review-queue/${encodeURIComponent(id)}/${action}`, {
        method: 'POST',
      });
      if (res.ok) {
        setItems((prev) => prev.filter((item) => item.id !== id));
        router.refresh();
      }
    } finally {
      setBusyId(null);
    }
  };

  if (items.length === 0) return null;

  return (
    <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[12px] font-medium text-amber-900">{t('review.title')}</p>
          <p className="mt-0.5 text-[11px] text-amber-700">
            {t('home.reviewCount', { n: items.length })}
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="rounded-xl border border-amber-200 bg-paper p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[11px] text-ink-faint">
                {item.note ? formatDate(item.note.created_at) : item.note_id}
              </p>
              <p className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] text-accent-dark">
                {t('review.suggestConcept')} · {item.suggestion}
              </p>
            </div>
            {item.note && (
              <p className="line-clamp-2 text-[13px] leading-6 text-ink-soft">{item.note.content}</p>
            )}
            <p className="mt-2 text-[12px] leading-5 text-amber-800">{item.reason}</p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => act(item.id, 'dismiss')}
                disabled={busyId === item.id}
                className="rounded-lg border border-line px-3 py-1 text-[12px] text-ink-soft disabled:opacity-40"
              >
                {t('review.dismiss')}
              </button>
              <button
                onClick={() => act(item.id, 'accept')}
                disabled={busyId === item.id}
                className="rounded-lg bg-accent px-3 py-1 text-[12px] text-white disabled:opacity-40"
              >
                {t('review.accept')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
