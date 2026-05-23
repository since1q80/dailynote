import type { Note } from './types';

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function renderAnswer(answer: string, notes: Note[]) {
  const parts = answer.split(/(\[\d+\])/g);
  return parts.map((part, i) => {
    const m = part.match(/^\[(\d+)\]$/);
    if (m) {
      const idx = Number(m[1]) - 1;
      const note = notes[idx];
      if (note) {
        const d = new Date(note.created_at);
        const label = `${d.getMonth() + 1}/${d.getDate()}`;
        const preview = note.content.length > 60
          ? note.content.slice(0, 60) + '…'
          : note.content;
        return (
          <span
            key={i}
            title={preview}
            className="mx-0.5 cursor-help rounded bg-canvas px-1.5 py-0.5 align-baseline text-[11px] text-ink-soft"
          >
            {label}
          </span>
        );
      }
    }
    return <span key={i}>{part}</span>;
  });
}
