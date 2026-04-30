'use client';

import { createContext, useCallback, useContext } from 'react';
import { useRouter } from 'next/navigation';
import { type Lang, createT } from '@/lib/i18n';

type T = ReturnType<typeof createT>;

type Ctx = {
  lang: Lang;
  t: T;
  setLang: (lang: Lang) => void;
};

const LanguageContext = createContext<Ctx>({
  lang: 'zh',
  t: createT('zh'),
  setLang: () => {},
});

export function useLanguage() {
  return useContext(LanguageContext);
}

export default function LanguageProvider({
  initialLang,
  children,
}: {
  initialLang: Lang;
  children: React.ReactNode;
}) {
  const router = useRouter();

  const setLang = useCallback(
    (lang: Lang) => {
      document.cookie = `lang=${lang}; path=/; max-age=31536000; SameSite=Lax`;
      router.refresh();
    },
    [router]
  );

  return (
    <LanguageContext.Provider value={{ lang: initialLang, t: createT(initialLang), setLang }}>
      {children}
    </LanguageContext.Provider>
  );
}
