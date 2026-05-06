'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function SettingsLink({ label }: { label: string }) {
  const pathname = usePathname();
  if (pathname === '/quick-capture') return null;

  return (
    <div className="mb-6 flex justify-end">
      <Link
        href="/settings"
        className="rounded-lg px-2.5 py-1.5 text-[12px] text-ink-ghost transition hover:bg-canvas hover:text-ink-faint"
      >
        {label}
      </Link>
    </div>
  );
}
