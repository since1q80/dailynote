import Link from 'next/link';
import { getHomeData } from '@/lib/compile';
import { getLang } from '@/lib/lang';
import { createT } from '@/lib/i18n';
import SearchBox from './SearchBox';
import NoteCard from './NoteCard';
import PeopleSidebar from './PeopleSidebar';
import DemoSeedButton from './DemoSeedButton';
import RefreshButton from './RefreshButton';
import ReviewQueue from './ReviewQueue';
import HomeFreshness from './HomeFreshness';
import HomeProcessingStatus from './HomeProcessingStatus';

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

function insightSentence(
  insights: Awaited<ReturnType<typeof getHomeData>>['insights'],
  t: ReturnType<typeof createT>,
  lang: 'zh' | 'en'
) {
  const joiner = lang === 'zh' ? '、' : ', ';
  if (insights.recent_links.length > 0) return insights.recent_links[0].reason;
  if (insights.new_concepts.length > 0) {
    return t('home.insightSummaryTopics', { topics: insights.new_concepts.slice(0, 3).join(joiner) });
  }
  if (insights.top_tags.length > 0) {
    return t('home.insightSummaryTags', { tags: insights.top_tags.slice(0, 3).map((x) => `#${x.name}`).join(' ') });
  }
  return t('home.insightSummaryEmpty');
}

function dailyBriefItems(
  insights: Awaited<ReturnType<typeof getHomeData>>['insights'],
  t: ReturnType<typeof createT>,
  lang: 'zh' | 'en'
) {
  const joiner = lang === 'zh' ? '、' : ', ';
  const items: string[] = [];
  if (insights.top_tags.length > 0) {
    items.push(t('home.briefTags', {
      tags: insights.top_tags.slice(0, 3).map((x) => `#${x.name}`).join(' '),
    }));
  }
  if (insights.top_people.length > 0) {
    items.push(t('home.briefPeople', {
      people: insights.top_people.slice(0, 3).map((x) => x.name).join(joiner),
    }));
  }
  if (insights.resurfaced_note) {
    items.push(t('home.briefResurface'));
  }
  if (insights.recent_links.length > 0) {
    items.push(t('home.briefLink'));
  }
  return items.slice(0, 3);
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1);
  const {
    concepts,
    recent_notes,
    people,
    tags,
    total_notes,
    total_pages,
    insights,
    review_items,
    note_links_by_note_id,
  } = await getHomeData(page);
  const lang = getLang();
  const t = createT(lang);
  const visibleNotes = recent_notes.slice(0, 5);
  const visibleConcepts = concepts.slice(0, 8);
  const summary = insightSentence(insights, t, lang);
  const briefItems = dailyBriefItems(insights, t, lang);

  return (
    <div className="flex gap-8">
      <HomeFreshness />
      <PeopleSidebar people={people} tags={tags} />

      {/* 右主区 */}
      <main className="min-w-0 flex-1">
        <div className="mb-8">
          <div className="mb-5 flex items-baseline justify-between">
            <div>
              <h1 className="text-2xl font-medium">{greeting(lang)}</h1>
              {total_notes > 0 && (
                <p className="mt-1 text-[12px] text-ink-faint">
                  {t('home.quietStats', { notes: total_notes, concepts: concepts.length })}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <RefreshButton />
            </div>
          </div>

          <Link
            href="/capture"
            className="block rounded-2xl bg-canvas px-6 py-7 transition hover:bg-[#EFECE4]"
          >
            <p className="text-[22px] text-ink-faint">{t('home.prompt')}</p>
          </Link>

          <HomeProcessingStatus />

          {total_notes > 0 && (
            <section className="mt-5 rounded-2xl border border-line bg-paper px-5 py-5">
              <div className="flex items-start justify-between gap-5">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wider text-ink-faint">{t('home.dailyBrief')}</p>
                  <p className="mt-2 text-[15px] leading-7 text-ink">{summary}</p>
                </div>
                <p className="shrink-0 rounded-full bg-canvas px-3 py-1 text-[12px] text-ink-soft">
                  {t('home.insightNotes', { n: insights.note_count_7d })}
                </p>
              </div>
              {briefItems.length > 0 && (
                <div className="mt-4 grid gap-2">
                  {briefItems.map((item) => (
                    <p key={item} className="rounded-xl bg-canvas px-3 py-2 text-[12px] leading-5 text-ink-soft">
                      {item}
                    </p>
                  ))}
                </div>
              )}
              {insights.resurfaced_note && (
                <div className="mt-4 border-t border-line pt-4">
                  <p className="mb-1 text-[11px] uppercase tracking-wider text-ink-ghost">{t('home.worthRevisiting')}</p>
                  <p className="line-clamp-2 text-[13px] leading-6 text-ink-faint">{insights.resurfaced_note.content}</p>
                </div>
              )}
            </section>
          )}

          <ReviewQueue initialItems={review_items} />
        </div>

        {visibleConcepts.length > 0 && (
          <section className="mb-8">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <p className="text-[11px] uppercase tracking-wider text-ink-faint">{t('home.topics')}</p>
              <p className="text-[11px] text-ink-ghost">{concepts.length}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {visibleConcepts.map((c) => (
                <Link
                  key={c.title}
                  href={`/concepts/${encodeURIComponent(c.title)}`}
                  className="rounded-full bg-canvas px-3 py-1.5 text-[13px] text-ink-soft transition hover:bg-[#EFECE4] hover:text-ink"
                >
                  {c.title}
                </Link>
              ))}
            </div>
          </section>
        )}

        {visibleNotes.length > 0 && (
          <section className="mt-8">
            <div className="mb-3 flex items-baseline justify-between">
              <p className="text-[11px] uppercase tracking-wider text-ink-faint">{t('home.recent')}</p>
              <p className="text-[11px] text-ink-ghost">{total_notes}</p>
            </div>
            <div className="space-y-2">
              {visibleNotes.map((n) => (
                <NoteCard key={n.id} note={n} links={note_links_by_note_id[n.id] || []} />
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

        {total_notes > 0 && (
          <div className="mt-8">
            <SearchBox />
          </div>
        )}

        {concepts.length === 0 && recent_notes.length === 0 && (
          <div className="mt-14 rounded-2xl border border-dashed border-line p-6 text-center">
            <p className="text-sm text-ink-faint">
              {t('home.empty').split('\n').map((line, i) => (
                <span key={i}>{line}{i === 0 && <br />}</span>
              ))}
            </p>
            <div className="mx-auto mt-5 max-w-md space-y-2 text-left text-[13px] leading-6 text-ink-soft">
              <p>{t('home.emptyHint1')}</p>
              <p>{t('home.emptyHint2')}</p>
              <p>{t('home.emptyHint3')}</p>
            </div>
            <div className="mt-6 flex items-center justify-center gap-2">
              <Link
                href="/capture"
                className="rounded-full bg-accent-dark px-4 py-2 text-[13px] font-medium text-paper transition hover:bg-accent"
              >
                {t('home.prompt')}
              </Link>
              <DemoSeedButton />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
