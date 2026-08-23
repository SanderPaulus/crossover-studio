/**
 * FINISHED SCAN CANDIDATES SURVIVE THE PAGE.
 *
 * Measured cost of not having this (Sander, aug 2026): a 23-candidate
 * axis-by-axis scan reached 18 finished candidates in 55 minutes, the laptop
 * idled into sleep, and every one of them was gone. Each was a COMPLETE
 * design — designed, synthesised, tuned, audited — sitting in a React state
 * object and nowhere else. The card even offered "use the 18 finished
 * results"; the results themselves lived one reload away from nothing.
 *
 * So each candidate is written the moment it lands. An interrupted run then
 * costs the ONE chain that was in flight, not the hour behind it.
 *
 * WHY IndexedDB and not localStorage: a Chain3Result carries the tuned parts,
 * the specs, the part audit and the per-branch synthesis curves — around
 * 85 kB of JSON each, so a full scan is ~2 MB. The autosave already occupies
 * 3.5 MB of the ~5 MB localStorage budget; adding this there would evict the
 * user's project to save a scratch scan, which is the wrong thing to lose.
 * IndexedDB also takes structured clone, so a result that already crossed the
 * worker boundary stores as-is — no lossy slimming, no schema to keep in sync.
 *
 * Everything here degrades to a no-op when IndexedDB is unavailable or the
 * quota is full: losing scan history is a nuisance, refusing to run a scan
 * over it would be worse.
 */

const DB_NAME = 'ads-scan';
const DB_VERSION = 1;
const ROWS = 'rows';
const RUNS = 'runs';

export interface ScanRunRecord {
  runId: string;
  /** ms since epoch, stamped by the caller — this module keeps no clock. */
  at: number;
  /** 'running' until the scan commits its result; a run left 'running' was
   *  interrupted, which is exactly what makes it worth offering back. */
  status: 'running' | 'done';
  /** How many candidates the scan intends to run, when known. */
  planned: number | null;
  label: string;
}

export interface ScanRowRecord<T = unknown> {
  key: string;
  runId: string;
  seq: number;
  row: T;
}

function idb(): IDBFactory | null {
  try {
    return typeof indexedDB !== 'undefined' ? indexedDB : null;
  } catch {
    return null;
  }
}

function open(): Promise<IDBDatabase | null> {
  const f = idb();
  if (!f) return Promise.resolve(null);
  return new Promise((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = f.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ROWS)) {
        const s = db.createObjectStore(ROWS, { keyPath: 'key' });
        s.createIndex('runId', 'runId', { unique: false });
      }
      if (!db.objectStoreNames.contains(RUNS)) db.createObjectStore(RUNS, { keyPath: 'runId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

function done<T>(req: IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

/** Start a run: records it as `running` so an interruption is detectable. */
export async function beginScanRun(rec: ScanRunRecord): Promise<void> {
  const db = await open();
  if (!db) return;
  try {
    await done(db.transaction(RUNS, 'readwrite').objectStore(RUNS).put(rec));
  } catch {
    /* quota or a closing db: the scan matters more than its history */
  }
  db.close();
}

/** One finished candidate. Called per landing, never batched — the point is
 *  that the row is safe before the next one starts. */
export async function putScanRow<T>(runId: string, seq: number, row: T): Promise<void> {
  const db = await open();
  if (!db) return;
  try {
    const rec: ScanRowRecord<T> = { key: `${runId}#${String(seq).padStart(4, '0')}`, runId, seq, row };
    await done(db.transaction(ROWS, 'readwrite').objectStore(ROWS).put(rec));
  } catch {
    /* see above */
  }
  db.close();
}

/** Mark the run finished — a run that reaches this was not interrupted. */
export async function endScanRun(runId: string): Promise<void> {
  const db = await open();
  if (!db) return;
  try {
    const store = db.transaction(RUNS, 'readwrite').objectStore(RUNS);
    const rec = (await done(store.get(runId))) as ScanRunRecord | null;
    if (rec) await done(store.put({ ...rec, status: 'done' }));
  } catch {
    /* ignore */
  }
  db.close();
}

export async function listScanRuns(): Promise<ScanRunRecord[]> {
  const db = await open();
  if (!db) return [];
  const all = ((await done(db.transaction(RUNS, 'readonly').objectStore(RUNS).getAll())) ??
    []) as ScanRunRecord[];
  db.close();
  return all;
}

export async function listScanRows<T>(runId: string): Promise<T[]> {
  const db = await open();
  if (!db) return [];
  const idx = db.transaction(ROWS, 'readonly').objectStore(ROWS).index('runId');
  const all = ((await done(idx.getAll(runId))) ?? []) as ScanRowRecord<T>[];
  db.close();
  return all.sort((a, b) => a.seq - b.seq).map((r) => r.row);
}

/** Drop a run and its rows. */
export async function dropScanRun(runId: string): Promise<void> {
  const db = await open();
  if (!db) return;
  try {
    const tx = db.transaction([ROWS, RUNS], 'readwrite');
    const idx = tx.objectStore(ROWS).index('runId');
    const keys = ((await done(idx.getAllKeys(runId))) ?? []) as IDBValidKey[];
    for (const k of keys) tx.objectStore(ROWS).delete(k);
    tx.objectStore(RUNS).delete(runId);
  } catch {
    /* ignore */
  }
  db.close();
}

/**
 * Which stored run is worth offering back, and which are just history.
 *
 * PURE ON PURPOSE — this is the decision, and it is the part worth testing;
 * everything above it is IndexedDB plumbing. A run is resumable when it was
 * left `running` (so it never committed) and actually has candidates. The
 * newest such run wins; everything older is stale and is dropped, because a
 * scan history nobody asked for is a slow leak.
 */
export function pickResumable(
  runs: readonly ScanRunRecord[],
  counts: Readonly<Record<string, number>>,
): { resume: ScanRunRecord | null; drop: string[] } {
  const interrupted = runs
    .filter((r) => r.status === 'running' && (counts[r.runId] ?? 0) > 0)
    .sort((a, b) => b.at - a.at);
  const resume = interrupted[0] ?? null;
  const drop = runs.filter((r) => r.runId !== resume?.runId).map((r) => r.runId);
  return { resume, drop };
}
