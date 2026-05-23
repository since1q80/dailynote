import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getNotesForTag } from '@/lib/storage';
import { getLang } from '@/lib/lang';
import { createT } from '@/lib/i18n';
import NoteCard from '@/app/NoteCard';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 10;

export default async function TagPage({
  params,
  searchParams,
}: {
  params: { name: string };
  searchParams: { page?: string };
}) {
  const tag = decodeURIComponent(params.name);
  const notes = await getNotesForTag(tag);
  if (notes.length === 0) notFound();

  const t = createT(getLang());
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1);
  const total_pages = Math.max(1, Math.ceil(notes.length / PAGE_SIZE));
  const paged = notes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <main>
      <div className="mb-6">
        <Link href="/" className="text-sm text-ink-soft hover:text-ink">
          {t('common.home')}
        </Link>
      </div>

      <header className="mb-6">
        <h1 className="text-3xl font-medium tracking-tight">#{tag}</h1>
        <p className="mt-1 text-xs text-ink-faint">{t('tag.notes', { n: notes.length })}</p>
      </header>

      <div className="space-y-2">
        {paged.map((n) => (
          <NoteCard key={n.id} note={n} />
        ))}
      </div>

      {total_pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-1">
          {page > 1 && (
            <Link
              href={`/tags/${encodeURIComponent(tag)}?page=${page - 1}`}
              className="rounded-lg px-3 py-1.5 text-[13px] text-ink-soft transition hover:bg-canvas"
            >
              ←
            </Link>
          )}
          {Array.from({ length: total_pages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/tags/${encodeURIComponent(tag)}?page=${p}`}
              className={`rounded-lg px-3 py-1.5 text-[13px] transition ${
                p === page
                  ? 'bg-canvas font-medium text-ink'
                  : 'text-ink-faint hover:bg-canvas hover:text-ink-soft'
              }`}
            >
              {p}
            </Link>
          ))}
          {page < total_pages && (
            <Link
              href={`/tags/${encodeURIComponent(tag)}?page=${page + 1}`}
              className="rounded-lg px-3 py-1.5 text-[13px] text-ink-soft transition hover:bg-canvas"
            >
              →
            </Link>
          )}
        </div>
      )}
    </main>
  );
}
