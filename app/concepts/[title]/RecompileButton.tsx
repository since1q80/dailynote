'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useLanguage } from '@/app/LanguageProvider';

export default function RecompileButton({ title }: { title: string }) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/concepts/${encodeURIComponent(title)}/recompile`,
        { method: 'POST' }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'unknown' }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {err && <span className="text-[11px] text-red-600">{err}</span>}
      <button
        onClick={go}
        disabled={busy}
        className="text-xs text-ink-faint transition hover:text-accent disabled:opacity-40"
      >
        {busy ? t('recompile.analyzing') : t('recompile.button')}
      </button>
    </div>
  );
}
