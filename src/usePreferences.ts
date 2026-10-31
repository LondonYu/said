import { useEffect, useState } from 'react';
import type { Language } from './i18n';

export type Theme = 'dark' | 'light' | 'system';
type Preferences = { theme: Theme; lang: Language };
const STORAGE_KEY = 'said-preferences';

function readPreferences(): Preferences {
  const fallback: Preferences = { theme: 'dark', lang: 'zh-CN' };
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    if (typeof value !== 'object' || value === null) return fallback;
    const saved = value as Record<string, unknown>;
    return {
      theme: saved.theme === 'light' || saved.theme === 'system' ? saved.theme : 'dark',
      lang: saved.lang === 'zh-TW' || saved.lang === 'en' ? saved.lang : 'zh-CN',
    };
  } catch {
    return fallback;
  }
}

export function usePreferences() {
  const [preferences, setPreferences] = useState(readPreferences);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true);
  const [storageAvailable, setStorageAvailable] = useState(true);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return;
    const change = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme === 'system'
      ? systemDark ? 'dark' : 'light'
      : preferences.theme;
    document.documentElement.lang = preferences.lang;
  }, [preferences, systemDark]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
      setStorageAvailable(true);
    } catch {
      setStorageAvailable(false);
    }
  }, [preferences]);

  return { preferences, setPreferences, storageAvailable };
}
