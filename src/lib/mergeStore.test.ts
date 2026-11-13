import { describe, expect, it } from 'vitest';
import { asStoredSession, newSessionId } from './mergeStore.ts';

describe('I-4 B-4 — the merge tool keeps its own sessions', () => {
  it('a stored record reads back with its files as bytes', () => {
    const rec = { id: 'a-1', name: 'a', savedAt: '2026-11-13T10:00:00Z', version: 1, files: [{ name: 'x.pir', bytes: new Uint8Array([1, 2]) }], state: { rig: {} } };
    expect(asStoredSession(rec)).toEqual(rec);
  });
  it('a foreign or damaged entry is skipped, not trusted', () => {
    expect(asStoredSession(null)).toBeNull();
    expect(asStoredSession({ id: 'a', name: 'a', savedAt: 'x', files: [{ name: 'x', bytes: 'not bytes' }] })).toBeNull();
    expect(asStoredSession({ id: 'a', name: 'a', files: [] })).toBeNull();
  });
  it('an older record without a version opens as version 0', () => {
    expect(asStoredSession({ id: 'a', name: 'a', savedAt: 's', files: [] })?.version).toBe(0);
  });
  it('a session id is readable in an address and unique per moment', () => {
    const now = new Date(Date.UTC(2026, 10, 13));
    expect(newSessionId('Augustus sessie', now)).toBe(`augustus-sessie-${now.getTime().toString(36)}`);
    expect(newSessionId('', now)).toMatch(/^session-/);
  });
});
