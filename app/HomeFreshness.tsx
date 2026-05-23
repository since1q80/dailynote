'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export const HOME_NEEDS_REFRESH_KEY = 'dailynote:home-needs-refresh';
export const HOME_PENDING_NOTE_KEY = 'dailynote:pending-note-id';

export function markHomeNeedsRefresh(noteId?: string) {
  try {
    window.sessionStorage.setItem(HOME_NEEDS_REFRESH_KEY, '1');
    if (noteId) {
      window.sessionStorage.setItem(HOME_PENDING_NOTE_KEY, noteId);
      window.localStorage.setItem(HOME_PENDING_NOTE_KEY, noteId);
    }
  } catch {
    // Ignore storage failures; the API route still invalidates the server path.
  }
}

export default function HomeFreshness() {
  const router = useRouter();

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(HOME_NEEDS_REFRESH_KEY) !== '1') return;
      window.sessionStorage.removeItem(HOME_NEEDS_REFRESH_KEY);
      router.refresh();
    } catch {
      router.refresh();
    }
  }, [router]);

  return null;
}
