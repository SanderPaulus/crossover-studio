/**
 * I-4 B-4 — the NF/FF-merge tool keeps its OWN sessions, apart from any project.
 *
 * A measuring session is a folder of impulses and exports plus what the designer stated about the
 * set-up; it is worth keeping on its own, and it is far too large for localStorage (a casus-1 session
 * is ~15 files, several megabytes). IndexedDB holds it as raw bytes. The project only ever receives
 * the merged FRD files the tool hands it ("Use in project…"), exactly as an import of the export
 * package would.
 *
 * The record shape and its check are pure and tested; the IndexedDB calls are a thin shell around
 * them and are exercised in the browser.
 */
import type { DroppedFile } from './mergeSession.ts';
import type { MicCal } from './micCal.ts';

/** Bumped when the record shape changes; an older record opens with what it has and says so. */
/** 2 (I-4 PIR-only): a second store, `calibrations` — a microphone file uploaded once, chosen per session. */
export const MERGE_STORE_VERSION = 3;
/* 3 (I-4 B-4 guide): a third store, `setups` — a measuring set-up (A–D and the planes answer), named and chosen again. */
const DB_NAME = 'crossover-studio-merge';
const STORE = 'sessions';
const CAL_STORE = 'calibrations';
const SETUP_STORE = 'setups';

export interface StoredMergeSession<State = unknown> {
  id: string;
  name: string;
  savedAt: string;
  version: number;
  files: DroppedFile[];
  /** What the designer stated in the tool (set-up, planes, object, per-source settings, accepted merges). */
  state: State;
}
export interface MergeSessionSummary {
  id: string;
  name: string;
  savedAt: string;
  files: number;
}

/** A record as read back, or null when it is not one (a foreign or damaged entry is skipped, not trusted). */
export function asStoredSession(x: unknown): StoredMergeSession | null {
  if (!x || typeof x !== 'object') return null;
  const r = x as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.name !== 'string' || typeof r.savedAt !== 'string') return null;
  if (!Array.isArray(r.files)) return null;
  const files: DroppedFile[] = [];
  for (const f of r.files) {
    if (!f || typeof f !== 'object') return null;
    const ff = f as Record<string, unknown>;
    if (typeof ff.name !== 'string' || !(ff.bytes instanceof Uint8Array)) return null;
    files.push({ name: ff.name, bytes: ff.bytes });
  }
  return { id: r.id, name: r.name, savedAt: r.savedAt, version: typeof r.version === 'number' ? r.version : 0, files, state: r.state ?? null };
}

/** A new session id: the name plus the time it was first saved, readable in a URL. */
export function newSessionId(name: string, now: Date): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'session';
  return `${slug}-${now.getTime().toString(36)}`;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, MERGE_STORE_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
      if (!req.result.objectStoreNames.contains(CAL_STORE)) req.result.createObjectStore(CAL_STORE, { keyPath: 'id' });
      if (!req.result.objectStoreNames.contains(SETUP_STORE)) req.result.createObjectStore(SETUP_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>, store: string = STORE): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

export async function saveMergeSession(rec: StoredMergeSession): Promise<void> {
  await tx('readwrite', (s) => s.put({ ...rec, version: MERGE_STORE_VERSION }));
}
export async function loadMergeSession(id: string): Promise<StoredMergeSession | null> {
  return asStoredSession(await tx('readonly', (s) => s.get(id)));
}
export async function deleteMergeSession(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id));
}
export async function listMergeSessions(): Promise<MergeSessionSummary[]> {
  const all = (await tx('readonly', (s) => s.getAll())) as unknown[];
  return all
    .map(asStoredSession)
    .filter((r): r is StoredMergeSession => r !== null)
    .map((r) => ({ id: r.id, name: r.name, savedAt: r.savedAt, files: r.files.length }))
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/* ---- microphone calibration files (I-4 PIR-only) ---- */

/** A stored calibration as read back, or null when it is not one. */
export function asStoredCal(x: unknown): MicCal | null {
  if (!x || typeof x !== 'object') return null;
  const r = x as Record<string, unknown>;
  const nums = (v: unknown) => Array.isArray(v) && v.every((n) => typeof n === 'number');
  if (typeof r.id !== 'string' || typeof r.name !== 'string' || !nums(r.freq) || !nums(r.db)) return null;
  if ((r.freq as number[]).length !== (r.db as number[]).length) return null;
  return {
    id: r.id,
    name: r.name,
    title: typeof r.title === 'string' ? r.title : null,
    format: r.format === 'justoct' ? 'justoct' : 'arta-rew',
    freq: r.freq as number[],
    db: r.db as number[],
    phaseDeg: nums(r.phaseDeg) ? (r.phaseDeg as number[]) : null,
    sensitivityNote: typeof r.sensitivityNote === 'string' ? r.sensitivityNote : null,
  };
}
export async function saveMicCal(c: MicCal): Promise<void> {
  await tx('readwrite', (s) => s.put(c), CAL_STORE);
}
export async function listMicCals(): Promise<MicCal[]> {
  const all = (await tx('readonly', (s) => s.getAll(), CAL_STORE)) as unknown[];
  return all.map(asStoredCal).filter((c): c is MicCal => c !== null).sort((a, b) => a.name.localeCompare(b.name));
}
export async function deleteMicCal(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id), CAL_STORE);
}

/* ---- measuring set-ups (I-4 B-4 guide, step 2) ---- */

export interface StoredSetup<D = unknown> {
  id: string;
  name: string;
  savedAt: string;
  data: D;
}
export function asStoredSetup(x: unknown): StoredSetup | null {
  if (!x || typeof x !== 'object') return null;
  const r = x as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.name !== 'string' || typeof r.savedAt !== 'string' || !r.data || typeof r.data !== 'object') return null;
  return { id: r.id, name: r.name, savedAt: r.savedAt, data: r.data };
}
export async function saveSetup(x: StoredSetup): Promise<void> {
  await tx('readwrite', (s) => s.put(x), SETUP_STORE);
}
export async function listSetups(): Promise<StoredSetup[]> {
  const all = (await tx('readonly', (s) => s.getAll(), SETUP_STORE)) as unknown[];
  return all.map(asStoredSetup).filter((c): c is StoredSetup => c !== null).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}
export async function deleteSetup(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id), SETUP_STORE);
}
