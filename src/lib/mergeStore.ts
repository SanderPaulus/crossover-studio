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

/** Bumped when the record shape changes; an older record opens with what it has and says so. */
export const MERGE_STORE_VERSION = 1;
const DB_NAME = 'crossover-studio-merge';
const STORE = 'sessions';

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
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
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
