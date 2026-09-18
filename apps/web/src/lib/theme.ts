/**
 * Theme resolution, shared by the account popover and the settings page.
 *
 * Three states, not two: "system" is a real choice and has to be storable,
 * otherwise following the OS is only ever the default you cannot get back to.
 * Nothing stored means light — jlog is a light app, and a dark desktop is not
 * by itself a request for a dark jlog. Layout.astro's pre-paint script reads
 * the same key with the same rule; the two must not drift.
 */
export type ThemeChoice = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_KEY = 'jlog_theme';

export function readThemeChoice(): ThemeChoice {
  if (typeof localStorage === 'undefined') return 'light';
  const stored = localStorage.getItem(THEME_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'light';
}

export function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  return choice === 'system' ? systemTheme() : choice;
}

export function applyThemeChoice(choice: ThemeChoice) {
  localStorage.setItem(THEME_KEY, choice);
  document.documentElement.setAttribute('data-theme', resolveTheme(choice));
}

/**
 * Keeps "system" honest: without this, picking system and then changing the OS
 * appearance leaves jlog on whatever it happened to resolve to at load.
 */
export function watchSystemTheme(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
