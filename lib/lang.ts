import { cookies } from 'next/headers';
import type { Lang } from './i18n';

export function getLang(): Lang {
  try {
    const val = cookies().get('lang')?.value;
    if (val === 'en') return 'en';
  } catch {
    // outside of request context (e.g. build time)
  }
  return 'zh';
}
