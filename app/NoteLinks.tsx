'use client';

import type { Note, NoteLink } from '@/lib/types';
import { formatDate } from '@/lib/ui';
import { useLanguage } from './LanguageProvider';

type EnrichedLink = NoteLink & { from_note: Note | null; to_note: Note | null };

export default function NoteLinks({ noteId, links }: { noteId: string; links: EnrichedLink[] }) {
  const { t } = useLanguage();
  if (links.length === 0) return null;

  return (
    <div className="mt-3 space-y-1.5">
      {links.map((link) => {
        const isOutcome = link.to_note_id === noteId;
        const other = isOutcome ? link.from_note : link.to_note;
        const label = t(`note.link.${link.type}`);
        return (
          <div
            key={link.id}
            className="rounded-xl border border-accent/20 bg-accent-soft/50 px-3 py-2 text-[12px] leading-5 text-accent-dark"
          >
            <div className="mb-0.5 flex items-center justify-between gap-2">
              <span className="font-medium">
                {isOutcome ? `${label} · 回应旧笔记` : `${label} · 后续结果`}
              </span>
              {other && <span className="shrink-0 text-[10px] opacity-70">{formatDate(other.created_at)}</span>}
            </div>
            <p>{link.reason}</p>
            {other && <p className="mt-0.5 line-clamp-1 opacity-70">{other.content}</p>}
          </div>
        );
      })}
    </div>
  );
}
