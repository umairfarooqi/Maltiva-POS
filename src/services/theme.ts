import { useSyncExternalStore } from 'react';

export type Theme = 'dark' | 'light';
export const THEME_STORAGE_KEY = 'maltiva-theme';
const listeners = new Set<() => void>();
const normalizeTheme = (value: string | null): Theme => value === 'light' ? 'light' : 'dark';

export function getTheme(): Theme {
  return normalizeTheme(document.documentElement.dataset.theme || null);
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  listeners.forEach(listener => listener());
}

export function setTheme(theme: Theme) {
  applyTheme(theme);
  try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* Current session still switches. */ }
}

export function initializeTheme() {
  try { applyTheme(normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY))); }
  catch { applyTheme('dark'); }
}

window.addEventListener('storage', event => {
  if (event.key === THEME_STORAGE_KEY || event.key === null) applyTheme(normalizeTheme(event.newValue));
});

export function useTheme() {
  const theme = useSyncExternalStore(listener => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, getTheme, () => 'dark');
  return { theme, setTheme };
}
