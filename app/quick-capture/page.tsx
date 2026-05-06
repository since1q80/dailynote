'use client';

import { useEffect, useRef, useState } from 'react';

export default function QuickCapturePage() {
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const save = async () => {
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await window.dailyNote?.noteSaved();
      setSaved(true);
      setContent('');
      setTimeout(() => window.dailyNote?.closeQuickCapture(), 650);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="flex h-screen min-h-[440px] flex-col bg-paper p-6">
      <div className="mb-4 flex shrink-0 items-center justify-between">
        <p className="text-[12px] uppercase tracking-wider text-ink-faint">Quick Note</p>
        <button
          onClick={() => window.dailyNote?.closeQuickCapture()}
          className="rounded-lg px-2 py-1 text-[12px] text-ink-ghost hover:bg-canvas"
        >
          Esc
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <textarea
          ref={ref}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              save();
            }
            if (e.key === 'Escape') window.dailyNote?.closeQuickCapture();
          }}
          placeholder="写下这一刻... Cmd/Ctrl + Enter 保存"
          className="h-full min-h-[300px] w-full resize-none rounded-2xl border border-line bg-canvas p-4 text-[16px] leading-8 outline-none placeholder:text-ink-ghost"
        />
      </div>
      {error && <p className="mt-2 shrink-0 text-[12px] text-red-700">{error}</p>}
      <div className="mt-4 flex shrink-0 items-center justify-between border-t border-line pt-4">
        <p className="min-w-0 text-[12px] text-ink-faint">
          {saved ? '已收下，正在整理...' : content.length > 0 ? `${content.length} 字` : ''}
        </p>
        <button
          onClick={save}
          disabled={saving || !content.trim()}
          className="shrink-0 rounded-full bg-accent-dark px-6 py-2.5 text-[14px] font-medium text-paper transition hover:bg-accent disabled:opacity-40"
        >
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </main>
  );
}
