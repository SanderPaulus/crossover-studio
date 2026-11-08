/**
 * REFINE AROUND ONE DESIGN (08-11-2026, Sander). A shortlist row looks
 * promising; the question is what its neighbours on ONE handover do while the
 * others stay where they are. That is three runs, not a new field: the row's
 * own position and one field spacing either side, on the handover asked for,
 * and the row's position on every other. Positions outside that handover's
 * feasible window are dropped and the caller says so — refining is not a way
 * to leave the window.
 *
 * Pure, and no engine import: the caller passes the spacing and the row's
 * crossings as the run export recorded them.
 */
export interface RefineCrossing {
  pair: string;
  hz: number;
  window: readonly [number, number];
}

export interface RefinePlan {
  perAxisHz: number[][];
  /** The positions on the refined handover that lay outside its window. */
  droppedHz: number[];
}

/** Printable to a tenth of a hertz, like every other stated position. */
const tenth = (x: number) => Math.round(x * 10) / 10;

export function refinePlan(
  crossings: readonly RefineCrossing[],
  axis: number,
  spacingOctaves: number,
): RefinePlan | null {
  const c = crossings[axis];
  if (!c || !(spacingOctaves > 0)) return null;
  const step = 2 ** spacingOctaves;
  const wanted = [c.hz / step, c.hz, c.hz * step];
  const kept = wanted.filter((f) => f >= c.window[0] && f <= c.window[1]);
  return {
    perAxisHz: crossings.map((x, i) => (i === axis ? kept.map(tenth) : [tenth(x.hz)])),
    droppedHz: wanted.filter((f) => !kept.includes(f)).map(tenth),
  };
}
