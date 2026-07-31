import { describe, expect, it } from 'vitest';
import { fileSafeName } from './filenames.ts';

describe('fileSafeName', () => {
  it('keeps a dot in the middle — the case that started this', () => {
    // "20260731.1" used to export as "202607311": two fields silently merged.
    expect(fileSafeName('20260731.1', 'filter')).toBe('20260731.1');
    expect(fileSafeName('v2.3 kruising', 'filter')).toBe('v2.3 kruising');
  });

  it('keeps the punctuation a designer actually types', () => {
    expect(fileSafeName('KOAN (var 3) [LR4] #2 + notch', 'x')).toBe('KOAN (var 3) [LR4] #2 + notch');
    expect(fileSafeName("Sander's mid_hoog-filter", 'x')).toBe("Sander's mid_hoog-filter");
    expect(fileSafeName('Übergang 2,4 kHz', 'x')).toBe('Übergang 2,4 kHz');
  });

  it('drops what breaks a path or Windows', () => {
    expect(fileSafeName('a/b\\c:d*e?f"g<h>i|j', 'x')).toBe('abcdefghij');
    expect(fileSafeName('tab\tname\nhere', 'x')).toBe('tab name here');
  });

  it('refuses to produce a hidden file, a dot-directory or a trailing dot', () => {
    expect(fileSafeName('..', 'fallback')).toBe('fallback');
    expect(fileSafeName('../../etc/passwd', 'x')).toBe('etcpasswd');
    expect(fileSafeName('.hidden', 'x')).toBe('hidden');
    // Windows strips a trailing dot/space, so the name would not round-trip.
    expect(fileSafeName('naam.', 'x')).toBe('naam');
    expect(fileSafeName('naam ', 'x')).toBe('naam');
  });

  it('falls back when nothing usable is left', () => {
    expect(fileSafeName('', 'filter')).toBe('filter');
    expect(fileSafeName('   ', 'filter')).toBe('filter');
    expect(fileSafeName('///', 'design')).toBe('design');
  });
});
