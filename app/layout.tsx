import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import type { Lang } from '@/lib/i18n';
import LanguageProvider from './LanguageProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'DailyNote',
  description: '你的笔记，自己长出来的知识库',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = (cookies().get('lang')?.value as Lang | undefined) === 'en' ? 'en' : 'zh';
  const settingsLabel = lang === 'en' ? 'Settings' : '设置';

  return (
    <html lang={lang === 'en' ? 'en' : 'zh'}>
      <body className="min-h-screen bg-paper text-ink">
        <LanguageProvider initialLang={lang}>
          <div className="mx-auto max-w-4xl px-5 py-8">
            <div className="mb-6 flex justify-end">
              <Link
                href="/settings"
                className="rounded-lg px-2.5 py-1.5 text-[12px] text-ink-ghost transition hover:bg-canvas hover:text-ink-faint"
              >
                {settingsLabel}
              </Link>
            </div>
            {children}
          </div>
        </LanguageProvider>
      </body>
    </html>
  );
}
