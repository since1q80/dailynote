'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from './LanguageProvider';

export default function RefreshButton() {
  const router = useRouter();
  const { t } = useLanguage();
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    const off = window.dailyNote?.onNoteSaved(() => {
      setFlash(true);
      router.refresh();
      setTimeout(() => setFlash(false), 1200);
    });
    return () => off?.();
  }, [router]);

  return (
    <button
      onClick={() => router.refresh()}
      className="rounded-lg px-2.5 py-1.5 text-[12px] text-ink-ghost transition hover:bg-canvas hover:text-ink-faint"
    >
      {flash ? t('home.updated') : t('home.refresh')}
    </button>
  );
}
