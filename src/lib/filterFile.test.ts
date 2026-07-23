import { describe, expect, it } from 'vitest';
import { deserializeFilter, serializeFilter } from './filterFile.ts';
import { templateSchematic } from './schematicEdit.ts';

describe('filter file roundtrip', () => {
  it('serializes and restores a design unchanged', () => {
    const parts = templateSchematic(['mid', 'tweeter']).parts;
    const text = serializeFilter({ name: 'KOAN v3', parts });
    const back = deserializeFilter(text);
    expect(back.name).toBe('KOAN v3');
    expect(back.parts).toEqual(parts);
  });

  it('rejects non-JSON, wrong format and newer versions', () => {
    expect(() => deserializeFilter('hello')).toThrow(/JSON/);
    expect(() => deserializeFilter('{"format":"other"}')).toThrow(/filter file/);
    const parts = templateSchematic(['mid']).parts;
    const newer = JSON.parse(serializeFilter({ name: 'x', parts })) as Record<string, unknown>;
    newer.version = 99;
    expect(() => deserializeFilter(JSON.stringify(newer))).toThrow(/newer/);
  });

  it('rejects malformed part lists', () => {
    const bad = {
      format: 'acoustic-design-studio-filter',
      version: 1,
      name: 'x',
      parts: [{ nope: true }],
    };
    expect(() => deserializeFilter(JSON.stringify(bad))).toThrow(/Malformed/);
    expect(() =>
      deserializeFilter(JSON.stringify({ ...bad, parts: [] })),
    ).toThrow(/no parts/);
  });

  it('falls back to a default name', () => {
    const parts = templateSchematic(['mid']).parts;
    const d = JSON.parse(serializeFilter({ name: '  ', parts })) as Record<string, unknown>;
    expect(deserializeFilter(JSON.stringify(d)).name).toBe('Imported filter');
  });
});
