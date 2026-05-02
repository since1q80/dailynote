'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from './LanguageProvider';

export default function DemoSeedButton() {
  const { t } = useLanguage();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const seed = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/demo-seed', { method: 'POST' });
      if (res.ok) router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={seed}
      disabled={loading}
      className="rounded-full border border-line px-4 py-2 text-[13px] text-ink-soft transition hover:border-accent/40 hover:text-accent-dark disabled:opacity-50"
    >
      {loading ? t('home.seeding') : t('home.seedDemo')}
    </button>
  );
}
