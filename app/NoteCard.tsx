'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ComponentProps } from 'react';
import type { Note } from '@/lib/types';
import { formatDate } from '@/lib/ui';
import { useLanguage } from './LanguageProvider';
import NoteLinks from './NoteLinks';

type Props = {
  note: Note;
  links?: ComponentProps<typeof NoteLinks>['links'];
};

export default function NoteCard({ note, links = [] }: Props) {
  const { t } = useLanguage();
  const router = useRouter();

  // view state
  const [content, setContent] = useState(note.content);
  const [expanded, setExpanded] = useState(false);
  const [concepts, setConcepts] = useState<string[]>(note.concepts ?? []);

  // edit state
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.content);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // tag state
  const [tags, setTags] = useState<string[]>(note.tags ?? []);
  const [adding, setAdding] = useState(false);
  const [newTag, setNewTag] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) {
      setContent(note.content);
      setDraft(note.content);
    }
    setConcepts(note.concepts ?? []);
    setTags(note.tags ?? []);
  }, [editing, note.content, note.concepts, note.tags]);

  const startEdit = () => {
    setDraft(content);
    setEditing(true);
    setExpanded(false);
    setTimeout(() => {
      const ta = textareaRef.current;
      if (ta) { ta.focus(); ta.selectionStart = ta.value.length; }
    }, 0);
  };

  const cancelEdit = () => { setEditing(false); setDraft(content); };

  const saveEdit = async () => {
    const trimmed = draft.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/notes/${note.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: trimmed }),
      });
      if (res.ok) {
        setContent(trimmed);
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); saveEdit(); }
    if (e.key === 'Escape') cancelEdit();
  };

  const saveTags = async (next: string[]) => {
    setTags(next);
    await fetch(`/api/notes/${note.id}/tags`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tags: next }),
    });
  };

  const saveConcepts = async (next: string[]) => {
    setConcepts(next);
    await fetch(`/api/notes/${note.id}/concepts`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ concepts: next }),
    });
  };

  const deleteThisNote = async () => {
    if (deleting) return;
    if (!window.confirm(t('note.deleteConfirm'))) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/notes/${note.id}`, { method: 'DELETE' });
      if (res.ok) router.refresh();
    } finally {
      setDeleting(false);
    }
  };

  const removeTag = (tag: string) => saveTags(tags.filter((t) => t !== tag));

  const commitNewTag = async () => {
    const v = newTag.trim();
    if (v && !tags.includes(v)) await saveTags([...tags, v]);
    setNewTag('');
    setAdding(false);
  };

  return (
    <div className="rounded-xl border border-line bg-paper p-4">
      {/* Header row */}
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <p className="text-[11px] text-ink-faint">{formatDate(note.created_at)}</p>
        <div className="flex items-center gap-2">
          {concepts.length > 0 && (
            <div className="flex flex-wrap justify-end gap-1">
            {concepts.map((c) => (
              <span
                key={c}
                className="group flex items-center gap-0.5 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] text-accent-dark"
              >
                <Link href={`/concepts/${encodeURIComponent(c)}`}>{c}</Link>
                <button
                  onClick={() => saveConcepts(concepts.filter((x) => x !== c))}
                  className="ml-0.5 text-[12px] leading-none opacity-0 transition hover:text-ink group-hover:opacity-100"
                  aria-label={t('note.removeConcept', { concept: c })}
                >
                  ×
                </button>
              </span>
            ))}
            </div>
          )}
          <button
            onClick={deleteThisNote}
            disabled={deleting}
            className="rounded-lg px-2 py-0.5 text-[11px] text-ink-ghost transition hover:bg-canvas hover:text-red-600 disabled:opacity-40"
          >
            {deleting ? t('note.deleting') : t('note.delete')}
          </button>
        </div>
      </div>

      {/* Content — view or edit */}
      {editing ? (
        <div>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={Math.max(4, draft.split('\n').length + 1)}
            className="w-full rounded-lg border border-accent/40 bg-canvas p-2.5 text-[13px] leading-relaxed outline-none"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={saveEdit}
              disabled={saving || !draft.trim()}
              className="rounded-lg bg-accent px-3 py-1 text-[12px] text-white transition hover:bg-accent-dark disabled:opacity-40"
            >
              {saving ? t('note.edit.saving') : t('note.edit.save')}
            </button>
            <button
              onClick={cancelEdit}
              className="rounded-lg px-3 py-1 text-[12px] text-ink-faint transition hover:bg-canvas hover:text-ink"
            >
              {t('note.edit.cancel')}
            </button>
            <span className="ml-auto text-[11px] text-ink-ghost">Cmd/Ctrl + Enter</span>
          </div>
        </div>
      ) : (
        <div>
          <p
            onClick={startEdit}
            className={`cursor-text whitespace-pre-wrap text-[13px] leading-relaxed ${expanded ? '' : 'line-clamp-3'}`}
          >
            {content}
          </p>
          {content.length > 120 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 text-[11px] text-ink-ghost transition hover:text-ink-faint"
            >
              {expanded ? t('note.collapse') : t('note.expand')}
            </button>
          )}
        </div>
      )}

      <NoteLinks noteId={note.id} links={links} />

      {/* Tag row */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="group flex items-center gap-0.5 rounded-full bg-canvas px-2 py-0.5 text-[11px] text-ink-soft"
          >
            #{tag}
            <button
              onClick={() => removeTag(tag)}
              className="ml-0.5 text-[12px] leading-none text-ink-ghost opacity-0 transition hover:text-ink group-hover:opacity-100"
              aria-label={t('note.removeTag', { tag })}
            >
              ×
            </button>
          </span>
        ))}

        {adding ? (
          <input
            ref={inputRef}
            autoFocus
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitNewTag();
              if (e.key === 'Escape') { setAdding(false); setNewTag(''); }
            }}
            onBlur={commitNewTag}
            placeholder={t('note.tagPlaceholder')}
            className="w-20 rounded-full border border-accent/50 bg-transparent px-2 py-0.5 text-[11px] outline-none placeholder:text-ink-ghost"
          />
        ) : (
          <button
            onClick={() => { setAdding(true); setTimeout(() => inputRef.current?.focus(), 0); }}
            className="rounded-full border border-dashed border-line px-2 py-0.5 text-[11px] text-ink-ghost transition hover:border-ink-faint hover:text-ink-faint"
          >
            {t('note.addTag')}
          </button>
        )}
      </div>
    </div>
  );
}
