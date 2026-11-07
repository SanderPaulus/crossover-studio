/**
 * WHICH ERRORS A SEARCH MAY SWALLOW (07-11-2026).
 *
 * The tuner and the minimiser catch errors on purpose: a candidate network that
 * cannot be solved (`NetworkError`), cannot be built (`VxpNetworkError`) or
 * cannot be resampled (a plain `Error` from `dsp.ts`) is a candidate the search
 * steers away from, and the catch is how it does that.
 *
 * What they must NOT swallow is an error that is not a statement about the
 * candidate at all: a built-in JavaScript error. A `RangeError` is an
 * allocation or stack failure, a `TypeError`/`ReferenceError` is a bug — none
 * of them is thrown on purpose anywhere in this codebase (checked). Swallowed,
 * such an error does not fail the run: it sends the search down a DIFFERENT
 * PATH and the run still delivers. That breaks A5e.4 (one seed, one result)
 * without anyone seeing it, which is the suspected mechanism behind a byte
 * test that once read 9930 evaluations where it always reads 9742.
 *
 * So every catch in the search calls this first: a built-in error is thrown on,
 * loud; a domain error is handled exactly as before.
 */
export function isPlatformError(e: unknown): boolean {
  return (
    e instanceof RangeError ||
    e instanceof TypeError ||
    e instanceof ReferenceError ||
    e instanceof SyntaxError ||
    e instanceof EvalError ||
    e instanceof URIError
  );
}

/** Throw `e` on if it is a built-in JavaScript error; otherwise return. */
export function rethrowIfPlatformError(e: unknown): void {
  if (isPlatformError(e)) throw e;
}
