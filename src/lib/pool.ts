/**
 * Work-queue helpers for the optimizer worker pool. Pure (no Worker imports)
 * so the scheduling itself is unit-testable.
 */

/** Worker pool size: every core minus two (UI thread + the browser itself),
 *  at least 1, at most 16. The old cap of 4 left most of a modern CPU idle
 *  during a scan (Sanders: "de tune lijkt de volle rekenkracht niet te
 *  gebruiken"). NB Apple Silicon efficiency cores are slower than the
 *  performance cores, so 8 workers is not 2× four — but idle is idle. */
export function poolSize(): number {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 4;
  return Math.max(1, Math.min(16, (cores || 4) - 2));
}

/**
 * Run `items` through `fn` with at most `size` in flight — a REAL work queue:
 * the next free worker slot takes the next item. The old static assignment
 * (`item i → slot i % size`) queued each slot's items behind each other, so a
 * candidate could sit "queued" behind a slow one while other slots had already
 * finished and stood idle (Sanders: "staat er 1 queued terwijl deze gewoon
 * bezig had kunnen zijn"). Results keep the input order.
 *
 * `shouldStop` lets a lane stop TAKING work — "stop and keep what finished".
 * It is checked before each item, never mid-item: whatever is already running
 * is the caller's business (the scan aborts those through the worker), and a
 * queued item that never starts leaves its slot in the result array untouched.
 */
export function runPooled<T, R>(
  items: readonly T[],
  size: number,
  fn: (item: T, slot: number, index: number) => Promise<R>,
  shouldStop?: () => boolean,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const lane = async (slot: number): Promise<void> => {
    for (;;) {
      if (shouldStop?.()) return;
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], slot, i);
    }
  };
  const lanes = Array.from({ length: Math.min(size, items.length) }, (_, slot) => lane(slot));
  return Promise.all(lanes).then(() => results);
}
