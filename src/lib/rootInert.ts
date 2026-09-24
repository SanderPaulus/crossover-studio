/**
 * U-8 — WHO OWNS `#root`'s `inert` ATTRIBUTE, and why there can be only one.
 *
 * Two surfaces need the app behind them to stop existing for the pointer and
 * the keyboard: a base-ui modal (`Modal.tsx`, which has done this since F3b)
 * and, since U-8, the run overlay. Both did it the obvious way — set the
 * attribute on mount, remove it on unmount — and two owners of one boolean
 * attribute is a bug waiting for the first overlap: whichever unmounts FIRST
 * removes the attribute the other still wants, and the page underneath comes
 * back to life beneath a dialog that is still up.
 *
 * So the attribute has one owner and a count. `hold()` returns its own
 * release; releasing twice is a no-op, which matters because React runs an
 * effect cleanup exactly once but a caller can be unmounted in mid-flight.
 *
 * WHAT `inert` BUYS, MEASURED (24-09-2026, Chrome, on the live app):
 *   hit test on the Wizard button, no inert  → the button
 *   hit test on the Wizard button, inert     → NOT the button
 *   `btn.matches(':hover')` while inert      → still true
 * So an inert subtree is out of hit-testing — the browser can no longer
 * resolve a `title` tooltip from anything beneath — while a `:hover` that was
 * ALREADY set survives until the pointer next moves. That boundary is the
 * whole reason this is applied when the overlay OPENS and not later: the v2
 * solver blocks the main thread, hit-testing goes stale for the duration, and
 * the browser keeps painting whichever tooltip it last resolved. Resolved
 * against an inert page, that is none.
 *
 * It is NOT a claim that a tooltip already painted at that instant is erased.
 * Nothing in the page can do that: a `title` tooltip is browser UI drawn above
 * every layer the page owns, which is exactly why z-order was never the fix.
 */

/** How many surfaces currently want the app behind them inert. */
let holders = 0;

/** The element the attribute goes on — the app's mount point, `#root`. */
function rootEl(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.getElementById('root');
}

/**
 * Make `#root` inert until the returned release is called.
 *
 * Returns a no-op release when there is no `#root` (tests, SSR), so a caller
 * never has to branch on it.
 */
export function holdRootInert(): () => void {
  const root = rootEl();
  if (!root) return () => {};
  holders += 1;
  if (holders === 1) root.setAttribute('inert', '');
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders -= 1;
    /* The LAST holder removes it, and it re-reads `#root` rather than closing
       over the node: base-ui restores focus to the opener right after this
       runs, and that element must not be inert at that moment or the `focus()`
       is a silent no-op (the reason `Modal.tsx` wrote this in the first
       place). */
    if (holders === 0) rootEl()?.removeAttribute('inert');
  };
}

/** Test-only: how many surfaces hold it right now. */
export function rootInertHolders(): number {
  return holders;
}
