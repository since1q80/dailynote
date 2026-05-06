import Link from 'next/link';
import { notFound } from 'next/navigation';
import { readConcept, getNotesForConcept } from '@/lib/storage';
import { getLang } from '@/lib/lang';
import { createT } from '@/lib/i18n';
import RecompileButton from './RecompileButton';

export const dynamic = 'force-dynamic';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default async function ConceptDetailPage({
  params,
}: {
  params: { title: string };
}) {
  const title = decodeURIComponent(params.title);
  const concept = await readConcept(title);
  if (!concept) notFound();

  const notes = await getNotesForConcept(title);
  const t = createT(getLang());
  const noteById = new Map(notes.map((n) => [n.id, n]));

  return (
    <main>
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-sm text-ink-soft hover:text-ink">
          {t('common.home')}
        </Link>
        <RecompileButton title={title} />
      </div>

      <header className="mb-6">
        <h1 className="text-3xl font-medium tracking-tight">{concept.title}</h1>
        <p className="mt-1 text-xs text-ink-faint">{t('concept.notes', { n: notes.length })}</p>
      </header>

      {concept.synthesis ? (
        <section className="mb-8 rounded-2xl bg-accent-soft p-5">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-accent">
            {t('concept.synthesis')}
          </p>
          <p className="whitespace-pre-wrap text-[14px] leading-7 text-accent-dark">
            {concept.synthesis}
          </p>
        </section>
      ) : (
        <section className="mb-8 rounded-2xl border border-dashed border-line p-5 text-center">
          <p className="text-[13px] text-ink-faint">
            {t('concept.noSynthesis')}
            {notes.length < 2 ? ` ${t('concept.noSynthesisFew')}` : ` ${t('concept.noSynthesisTrigger')}`}
          </p>
        </section>
      )}

      {concept.evolution && (
        <section className="mb-6 flex items-start gap-2 rounded-xl border border-line bg-paper px-4 py-3">
          <span className="mt-0.5 shrink-0 text-[11px] text-ink-faint">{t('concept.evolution')}</span>
          <p className="text-[13px] leading-6 text-ink-soft">{concept.evolution}</p>
        </section>
      )}

      {concept.contradictions.length > 0 && (
        <section className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="mb-2 text-[11px] uppercase tracking-wider text-amber-600">{t('concept.contradictions')}</p>
          <ul className="space-y-1">
            {concept.contradictions.map((c, i) => (
              <li key={i} className="text-[13px] leading-6 text-amber-900">— {c}</li>
            ))}
          </ul>
        </section>
      )}

      {concept.patterns.length > 0 && (
        <section className="mb-8">
          <p className="mb-3 text-[11px] uppercase tracking-wider text-ink-faint">
            {t('concept.patterns')}
          </p>
          <div className="divide-y divide-line">
            {concept.patterns.map((p, i) => (
              <div key={i} className="py-2.5">
                <span className="text-[14px] leading-6">{p}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {concept.evidence.length > 0 && (
        <section className="mb-8">
          <p className="mb-3 text-[11px] uppercase tracking-wider text-ink-faint">
            {t('concept.evidence')}
          </p>
          <div className="space-y-2">
            {concept.evidence.slice(0, 6).map((item) => {
              const note = noteById.get(item.note_id);
              return (
                <div key={item.note_id} className="rounded-xl border border-line bg-paper p-3">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <p className="text-[11px] text-ink-faint">
                      {note ? formatDate(note.created_at) : item.note_id}
                    </p>
                  </div>
                  <p className="text-[12px] leading-5 text-ink-soft">{item.reason}</p>
                  {note && (
                    <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-ink-faint">
                      {note.content}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {concept.related.length > 0 && (
        <section className="mb-8">
          <p className="mb-3 text-[11px] uppercase tracking-wider text-ink-faint">
            {t('concept.related')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {concept.related.map((r) => (
              <Link
                key={r}
                href={`/concepts/${encodeURIComponent(r)}`}
                className="rounded-full border border-line px-3 py-1 text-[12px] text-ink-soft transition hover:border-accent/40 hover:text-accent-dark"
              >
                {r}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mb-8">
        <p className="mb-3 text-[11px] uppercase tracking-wider text-ink-faint">
          {t('concept.yourWords')}
        </p>
        <div className="space-y-2">
          {notes.map((n) => (
            <div key={n.id} className="rounded-xl border border-line p-4">
              <p className="mb-1 text-[11px] text-ink-faint">{formatDate(n.created_at)}</p>
              <p className="whitespace-pre-wrap text-[13px] leading-6">{n.content}</p>
            </div>
          ))}
        </div>
      </section>

      <Link
        href={`/concepts/${encodeURIComponent(title)}/ask`}
        className="block rounded-2xl border border-accent bg-accent-soft p-4 text-center text-[14px] font-medium text-accent-dark transition hover:bg-[#E5E3FB]"
      >
        {t('concept.askLink', { title })}
      </Link>
    </main>
  );
}
