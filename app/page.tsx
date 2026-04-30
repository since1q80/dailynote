import Link from 'next/link';
import { getHomeData } from '@/lib/compile';
import { getLang } from '@/lib/lang';
import { createT } from '@/lib/i18n';
import SearchBox from './SearchBox';
import NoteCard from './NoteCard';
import PeopleSidebar from './PeopleSidebar';

export const dynamic = 'force-dynamic';

function greeting(lang: 'zh' | 'en') {
  const h = new Date().getHours();
  const key =
    h < 5 ? 'greeting.lateNight' :
    h < 11 ? 'greeting.morning' :
    h < 14 ? 'greeting.noon' :
    h < 18 ? 'greeting.afternoon' :
    'greeting.evening';
  return createT(lang)(key);
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1);
  const { concepts, recent_notes, people, tags, total_notes, total_pages } = await getHomeData(page);
  const lang = getLang();
  const t = createT(lang);

  return (
    <div className="flex gap-8">
      <PeopleSidebar people={people} tags={tags} />

      {/* 右主区 */}
      <main className="min-w-0 flex-1">
        <div className="mb-6 flex items-baseline justify-between">
          <h1 className="text-2xl font-medium">{greeting(lang)}</h1>
          <span className="text-xs text-ink-faint">
            {t('home.stats', { notes: total_notes, concepts: concepts.length })}
          </span>
        </div>

        <Link
          href="/capture"
          className="block rounded-2xl bg-canvas px-5 py-5 transition hover:bg-[#EFECE4]"
        >
          <p className="text-[15px] text-ink-faint">{t('home.prompt')}</p>
        </Link>

        <div className="mt-4">
          <SearchBox />
        </div>

        {concepts.length > 0 && (
          <section className="mt-10">
            <p className="mb-3 text-[11px] uppercase tracking-wider text-ink-faint">{t('home.topics')}</p>
            <div className="grid grid-cols-3 gap-2">
              {concepts.map((c) => (
                <Link
                  key={c.title}
                  href={`/concepts/${encodeURIComponent(c.title)}`}
                  className="group relative aspect-square rounded-2xl bg-canvas p-4 transition hover:bg-[#EFECE4]"
                >
                  <p className="text-[11px] text-ink-ghost">{t('home.noteCount', { n: c.note_count })}</p>
                  <p className="mt-auto pt-6 text-[15px] font-medium leading-snug">{c.title}</p>
                  {c.synthesis && (
                    <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-ink-faint">
                      {c.synthesis}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}

        {recent_notes.length > 0 && (
          <section className="mt-10">
            <div className="mb-3 flex items-baseline justify-between">
              <p className="text-[11px] uppercase tracking-wider text-ink-faint">{t('home.recent')}</p>
              <p className="text-[11px] text-ink-ghost">{total_notes}</p>
            </div>
            <div className="space-y-2">
              {recent_notes.map((n) => (
                <NoteCard key={n.id} note={n} />
              ))}
            </div>

            {total_pages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-1">
                {page > 1 && (
                  <Link
                    href={`/?page=${page - 1}`}
                    className="rounded-lg px-3 py-1.5 text-[13px] text-ink-soft transition hover:bg-canvas"
                  >
                    ←
                  </Link>
                )}
                {Array.from({ length: total_pages }, (_, i) => i + 1).map((p) => (
                  <Link
                    key={p}
                    href={`/?page=${p}`}
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
                    href={`/?page=${page + 1}`}
                    className="rounded-lg px-3 py-1.5 text-[13px] text-ink-soft transition hover:bg-canvas"
                  >
                    →
                  </Link>
                )}
              </div>
            )}
          </section>
        )}

        {concepts.length === 0 && recent_notes.length === 0 && (
          <div className="mt-20 text-center text-sm text-ink-faint">
            {t('home.empty').split('\n').map((line, i) => (
              <span key={i}>{line}{i === 0 && <br />}</span>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
