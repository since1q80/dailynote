'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from './LanguageProvider';

type Person = { name: string; note_ids: string[] };
type Tag = { name: string; count: number };

function PeopleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M3 13c0-2.761 2.239-4 5-4s5 1.239 5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 2h5.5l6.5 6.5-5.5 5.5L2 7.5V2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <circle cx="5.5" cy="5.5" r="1" fill="currentColor" />
    </svg>
  );
}

export default function PeopleSidebar({
  people,
  tags,
}: {
  people: Person[];
  tags: Tag[];
}) {
  const { t } = useLanguage();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(true);
  const [tagsOpen, setTagsOpen] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setSidebarCollapsed(localStorage.getItem('sidebar-collapsed') === 'true');
    setPeopleOpen(localStorage.getItem('sidebar-people-open') !== 'false');
    setTagsOpen(localStorage.getItem('sidebar-tags-open') !== 'false');
  }, []);

  const toggleSidebar = () =>
    setSidebarCollapsed((v) => {
      localStorage.setItem('sidebar-collapsed', String(!v));
      return !v;
    });

  const togglePeople = () =>
    setPeopleOpen((v) => {
      localStorage.setItem('sidebar-people-open', String(!v));
      return !v;
    });

  const toggleTags = () =>
    setTagsOpen((v) => {
      localStorage.setItem('sidebar-tags-open', String(!v));
      return !v;
    });

  const isCollapsed = mounted && sidebarCollapsed;

  return (
    <aside
      className={`shrink-0 pt-1 transition-all duration-200 ${isCollapsed ? 'w-8' : 'w-36'}`}
    >
      {/* Collapsed: icon strip */}
      {isCollapsed ? (
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={toggleSidebar}
            title={t('sidebar.expand')}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-ghost transition hover:bg-canvas hover:text-ink-faint"
          >
            <PeopleIcon />
          </button>
          <button
            onClick={toggleSidebar}
            title={t('sidebar.expand')}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-ghost transition hover:bg-canvas hover:text-ink-faint"
          >
            <TagIcon />
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* People section */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <button
                onClick={togglePeople}
                className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-ink-faint transition hover:text-ink-soft"
              >
                <PeopleIcon />
                {t('home.people')}
              </button>
              <button
                onClick={toggleSidebar}
                title={t('sidebar.collapse')}
                className="flex h-5 w-5 items-center justify-center rounded text-[12px] text-ink-ghost transition hover:bg-canvas hover:text-ink-faint"
              >
                ‹
              </button>
            </div>
            {peopleOpen && (
              <div className="space-y-0.5">
                {people.length === 0 ? (
                  <p className="text-[12px] text-ink-ghost">{t('home.noPeople')}</p>
                ) : (
                  people.map((p) => (
                    <Link
                      key={p.name}
                      href={`/people/${encodeURIComponent(p.name)}`}
                      className="flex items-baseline justify-between rounded-lg px-2 py-1 text-[13px] transition hover:bg-canvas"
                    >
                      <span className="truncate">{p.name}</span>
                      <span className="ml-1 shrink-0 text-[11px] text-ink-ghost">{p.note_ids.length}</span>
                    </Link>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Tags section */}
          <div>
            <button
              onClick={toggleTags}
              className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-ink-faint transition hover:text-ink-soft"
            >
              <TagIcon />
              {t('home.tags')}
            </button>
            {tagsOpen && (
              <div className="space-y-0.5">
                {tags.length === 0 ? (
                  <p className="text-[12px] text-ink-ghost">{t('home.noTags')}</p>
                ) : (
                  tags.map((tag) => (
                    <Link
                      key={tag.name}
                      href={`/tags/${encodeURIComponent(tag.name)}`}
                      className="flex items-baseline justify-between rounded-lg px-2 py-1 text-[13px] transition hover:bg-canvas"
                    >
                      <span className="truncate text-ink-soft">#{tag.name}</span>
                      <span className="ml-1 shrink-0 text-[11px] text-ink-ghost">{tag.count}</span>
                    </Link>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
