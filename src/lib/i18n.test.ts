import { describe, expect, it } from 'vitest';
import { t, setLang, currentLang, registerDict, subscribeLang, LANGS } from './i18n.ts';

describe('i18n (english-as-key, fallback to source)', () => {
  it('starts in English in a node environment and translates nothing', () => {
    expect(currentLang()).toBe('en');
    expect(t('Open the studio')).toBe('Open the studio');
  });

  it('translates via a registered dictionary and FALLS BACK per string', () => {
    registerDict('nl', { 'Open the studio': 'Open de studio' });
    try {
      setLang('nl');
      expect(t('Open the studio')).toBe('Open de studio');
      // The whole point of english-as-key: an untranslated string is the
      // English string, never a raw key or an error.
      expect(t('Not translated yet')).toBe('Not translated yet');
    } finally {
      setLang('en');
      registerDict('nl', {});
    }
  });

  it('substitutes {params} after translation, so word order is free', () => {
    registerDict('nl', { '{n} files loaded': '{n} bestanden geladen' });
    try {
      expect(t('{n} files loaded', { n: 3 })).toBe('3 files loaded');
      setLang('nl');
      expect(t('{n} files loaded', { n: 3 })).toBe('3 bestanden geladen');
    } finally {
      setLang('en');
      registerDict('nl', {});
    }
  });

  it('notifies subscribers exactly on a change, not on a no-op set', () => {
    let calls = 0;
    const off = subscribeLang(() => {
      calls += 1;
    });
    try {
      setLang('en'); // already en — must not notify
      expect(calls).toBe(0);
      setLang('nl');
      expect(calls).toBe(1);
      setLang('nl'); // no-op
      expect(calls).toBe(1);
    } finally {
      setLang('en');
      off();
    }
  });

  it('ships every LANGS entry with a distinct id and label', () => {
    expect(new Set(LANGS.map((l) => l.id)).size).toBe(LANGS.length);
    expect(new Set(LANGS.map((l) => l.label)).size).toBe(LANGS.length);
  });
});
