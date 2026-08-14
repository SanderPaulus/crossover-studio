/**
 * Tiny i18n layer, gettext-style: the ENGLISH source string is the key.
 *
 * Why not key-based (`t('topbar.measure.title')`)? Because with thousands of
 * strings across one 13k-line component, invented key names are a second
 * vocabulary to maintain, and a missing key breaks the UI. With English-as-key
 * a missing translation IS the English string — the app can never show a raw
 * key, and migration can proceed string by string without a big bang.
 *
 * ADDING A LANGUAGE is three steps, all mechanical:
 *   1. create `src/i18n/de.ts` exporting `Record<string, string>` (copy nl.ts
 *      as the template — its keys are the strings that need translating),
 *   2. add the language to `LANGS` below (id + native label),
 *   3. register it in main.tsx: `registerDict('de', de)`.
 * Untranslated strings simply stay English until the dictionary catches up.
 *
 * The store is module-level with a subscribe function (the crosshair-store
 * pattern) so React binds via useSyncExternalStore; App re-renders wholesale
 * on a switch, which is exactly what a language switch should do.
 */

export type Lang = 'en' | 'nl';

/** The switcher renders from this list — adding a language here is what makes
 *  it selectable. Labels are the language's own name, never a flag (flags are
 *  countries, not languages). */
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'EN' },
  { id: 'nl', label: 'NL' },
];

const STORAGE_KEY = 'ads-lang';

function initialLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (LANGS.some((l) => l.id === stored)) return stored as Lang;
    // First visit: follow the browser. Only auto-pick a language we ship.
    const nav = navigator.language?.toLowerCase() ?? '';
    if (nav.startsWith('nl')) return 'nl';
  } catch {
    // Node/test environment or blocked storage — English source language.
  }
  return 'en';
}

let lang: Lang = initialLang();
const listeners = new Set<() => void>();

export function currentLang(): Lang {
  return lang;
}

export function setLang(next: Lang): void {
  if (next === lang) return;
  lang = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Session-only in private mode.
  }
  for (const fn of listeners) fn();
}

/** For useSyncExternalStore. */
export function subscribeLang(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const dicts: Partial<Record<Lang, Record<string, string>>> = {};

/** Register a language's dictionary (called once, at app startup). */
export function registerDict(l: Lang, dict: Record<string, string>): void {
  dicts[l] = dict;
}

/**
 * Translate. `en` is both the English text and the lookup key; `params`
 * substitutes `{name}` placeholders AFTER translation, so dictionaries carry
 * the placeholders verbatim and word order stays free per language.
 */
export function t(en: string, params?: Record<string, string | number>): string {
  let s = lang === 'en' ? en : (dicts[lang]?.[en] ?? en);
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}
