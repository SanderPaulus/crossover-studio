import { describe, expect, it } from 'vitest';
import { HELP_SECTIONS, helpSectionForTab, searchHelp, sectionText } from './help';

describe('help content integrity', () => {
  it('has unique ids and non-empty sections', () => {
    const ids = HELP_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of HELP_SECTIONS) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.blocks.length).toBeGreaterThan(0);
      for (const b of s.blocks) {
        if (b.t === 'ul' || b.t === 'steps') expect(b.items.length).toBeGreaterThan(0);
        else expect(b.text.length).toBeGreaterThan(0);
      }
    }
  });

  it('uses only balanced inline markup (** and ` come in pairs)', () => {
    const texts: string[] = [];
    for (const s of HELP_SECTIONS) {
      for (const b of s.blocks) {
        if (b.t === 'ul' || b.t === 'steps') texts.push(...b.items);
        else texts.push(b.text);
      }
    }
    for (const t of texts) {
      expect((t.match(/\*\*/g) ?? []).length % 2, t).toBe(0);
      expect((t.match(/`/g) ?? []).length % 2, t).toBe(0);
      // No stray single asterisks outside ** pairs — the renderer ignores them.
      expect(t.replace(/\*\*/g, ''), t).not.toContain('*');
    }
  });

  it('covers every design tab with a valid section id', () => {
    const ids = new Set(HELP_SECTIONS.map((s) => s.id));
    for (const tab of ['import', 'data', 'filters', 'network'] as const) {
      expect(ids.has(helpSectionForTab(tab)), tab).toBe(true);
    }
  });
});

describe('searchHelp', () => {
  it('returns everything for an empty or blank query', () => {
    expect(searchHelp('')).toHaveLength(HELP_SECTIONS.length);
    expect(searchHelp('   ')).toHaveLength(HELP_SECTIONS.length);
  });

  it('finds sections case-insensitively via title, keywords and body', () => {
    const byExport = searchHelp('VituixCAD export');
    expect(byExport.some((s) => s.id === 'vituixcad')).toBe(true);
    // Keyword-only hit: "notch" is a keyword of the network section.
    expect(searchHelp('notch').some((s) => s.id === 'network')).toBe(true);
    // Markup must not block matching: **gemeten fase** should match plain words.
    expect(searchHelp('gemeten fase').some((s) => s.id === 'concepts')).toBe(true);
    // The optimizer internals section is findable on its doctrine terms.
    expect(searchHelp('vuistregels').some((s) => s.id === 'optimizer')).toBe(true);
    expect(searchHelp('vangnetten').some((s) => s.id === 'optimizer')).toBe(true);
    expect(searchHelp('zobel').some((s) => s.id === 'optimizer')).toBe(true);
  });

  it('requires all words to match (AND semantics) and can return nothing', () => {
    const both = searchHelp('excess delay');
    for (const s of both) {
      expect(sectionText(s)).toContain('excess');
      expect(sectionText(s)).toContain('delay');
    }
    expect(searchHelp('xyzzy-niet-bestaand')).toHaveLength(0);
  });

  it('strips markup from the searchable text', () => {
    for (const s of HELP_SECTIONS) {
      expect(sectionText(s)).not.toContain('**');
    }
  });
});
