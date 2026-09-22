/**
 * U-7 — THE POLARITY OF ONE WAY, AS ONE NUMBER, WITH ITS CARRIER NAMED.
 *
 * WHAT WAS THERE, MEASURED BEFORE ANYTHING MOVED. Three mechanisms carried a
 * polarity and two of them were applied to the SAME branch in the same sum:
 *
 *   1. the adjustment checkboxes (`inverted`, `midInverted`) ride in
 *      `branchAdj` and reach the sum through `combine`/`combineN`'s adjust;
 *   2. `Driver.inverted` on the netlist part is folded into the branch
 *      transfer by `network.ts` (`d.inverted ? scale(h, -1) : h`);
 *   3. the H-4b textbook rule reads and follows (1) and never touches (2).
 *
 * SO (1) AND (2) COMPOSE, AND THAT IS NOT A BUG — IT IS AN XOR NOBODY PRINTED.
 * The netlist bit is the DESIGN's choice (E-3 folds the design step's polarity
 * into the driver part precisely so everything downstream reads the netlist);
 * the checkbox is the DESIGNER's override on top of it. U-3d's 360° incident
 * was not that both exist, it was that `applyScanCandidate` FED the checkbox
 * from the result — bit XOR the same bit — so a design the tune measured at a
 * few degrees was charted in antiphase. Clearing the box fixed the load path
 * and left the composition, correctly.
 *
 * WHAT WAS ACTUALLY MISSING. Nowhere did the app say what a way's polarity
 * EFFECTIVELY is, and the checkbox's label lies about its own meaning: it
 * reads "invert polarity" and it means "flip relative to whatever the netlist
 * already says". Worse, the EXPORT (.vxp, .adsfilter) reads only carrier (2),
 * so a flip made on carrier (1) is simulated, charted and scored but is not in
 * what a builder solders.
 *
 * THIS MODULE IS THE ONE TRUTH AND NOT A THIRD STORE. It stores nothing: it
 * READS both carriers, reports the effective value and which carrier holds it,
 * and returns a WRITE PLAN as a value — the `selectFromShortlist` shape (UI-1),
 * because the layer between a rule and the app state is exactly where this
 * codebase has paid for `setState` sequences before.
 *
 * THE WRITE ALWAYS NORMALISES, AND NEVER ON ITS OWN. Pressing a way's knob
 * while a netlist drives it writes the netlist part AND clears that way's
 * adjust flag in one undo-able step, chosen so the effective value is the one
 * asked for. Nothing happens on load, on open or on a project restore — the
 * first PRESS on a way is what settles it, and from then on the export carries
 * what the knob shows. That is the whole reason the write is a plan and not a
 * setter: the caller applies both halves together or neither.
 *
 * N-WAY BY CONSTRUCTION (P6). Nothing here names a way. The caller supplies
 * the roles lowest-first and the driver part that drives each way; "mid" and
 * "tweeter" are the three-way READING of the same generic knob.
 *
 * NO ENGINE IMPORT: app-layer vocabulary, same rule as `handoverPolarity.ts`.
 */

/** Versiestring — a behaviour change here is a version bump (A5e.5). */
export const WAY_POLARITY_VERSION = 'way-polarity/1.0';

/** Which layer holds a way's polarity today. */
export type PolarityCarrier = 'netlist' | 'adjust' | 'none';

/** The driver part that drives one way in the live netlist. */
export interface NetlistDriver {
  /**
   * Index into the part list the caller will hand to `setPartProps`, or null
   * when the netlist drives the sum but its parts are not editable here (an
   * imported .vxp variant). The bit is then READ and reported — it is what the
   * sum does — and the knob says why it cannot write it.
   */
  partIndex: number | null;
  inverted: boolean;
}

export interface WayPolarityInput {
  /** Way roles, LOWEST FIRST. Only used as labels; never matched on. */
  roles: readonly string[];
  /**
   * The adjustment flags: one per way ABOVE the lowest, relative to it. The
   * lowest way is the reference `combineN` sums against and has no flag,
   * because inverting every way at once changes nothing a sum can hear.
   */
  adjustFlags: readonly boolean[];
  /**
   * The live netlist's driver part per way (index-aligned with `roles`), or
   * null for a way no netlist part drives. `null` for the whole array when no
   * netlist drives the simulation at all.
   */
  netlistDrivers: readonly (NetlistDriver | null)[] | null;
  /**
   * Per-way reason a way's polarity may not be set HERE, even when a carrier
   * exists — index-aligned with `roles`, null where there is none.
   *
   * The one caller is Hybrid mode: the active side's polarity is decided by
   * the reversed-polarity null measurement in the cabinet and typed into the
   * processor (H-1), not chosen on this screen. Reporting it and refusing to
   * write it is the honest answer; hiding the knob would leave the way that
   * matters most looking like it has no polarity at all.
   */
  readOnly?: readonly (string | null)[];
}

export interface WayPolarity {
  role: string;
  /** 0 = the lowest way. */
  index: number;
  /** What the simulation actually applies: `netlist` XOR `adjust`. */
  effective: boolean;
  /** The netlist part's bit, or null when no part drives this way. */
  netlist: boolean | null;
  /** Which part carries it, or null when no part drives this way. */
  partIndex: number | null;
  /** The adjustment flag (always false for the lowest way — it has none). */
  adjust: boolean;
  carrier: PolarityCarrier;
  /** Whether the knob can write this way's polarity anywhere. */
  settable: boolean;
  /** Why not, when it cannot be set. Null when it can. */
  why: string | null;
  /**
   * Both layers carry a bit for this way, so the EXPORT (which reads only the
   * netlist) shows something other than the simulation. Cleared by one press.
   */
  split: boolean;
}

const READ_ONLY_NETLIST_WHY =
  'this network came from the imported .vxp variant, whose parts are not editable here — ' +
  'switch the editor network on to change it';

const NO_CARRIER_WHY =
  'the lowest way is the reference the sum is measured against, and no network drives it — ' +
  'reverse a way above it instead, or draw a network and the part carries it';

/**
 * Read both carriers for every way.
 *
 * `effective` is an XOR and not a precedence: that is what the simulation does
 * today (`network.ts` folds the part's bit into the transfer, `combineN`
 * applies the flag on top of it), and this function reports what happens
 * rather than proposing a new rule.
 */
export function wayPolarities(input: WayPolarityInput): WayPolarity[] {
  const { roles, adjustFlags, netlistDrivers } = input;
  return roles.map((role, index) => {
    const drv = netlistDrivers ? netlistDrivers[index] ?? null : null;
    const netlist = drv ? drv.inverted : null;
    // Way 0 is the reference and has no flag; way i>0 reads flag i-1.
    const adjust = index === 0 ? false : adjustFlags[index - 1] === true;
    const effective = (netlist === true) !== adjust;
    const carrier: PolarityCarrier = drv ? 'netlist' : index === 0 ? 'none' : 'adjust';
    const held = input.readOnly?.[index] ?? null;
    return {
      role,
      index,
      effective,
      netlist,
      partIndex: drv ? drv.partIndex : null,
      adjust,
      carrier,
      settable:
        held === null &&
        (carrier === 'adjust' || (carrier === 'netlist' && drv!.partIndex !== null)),
      why:
        held ??
        (carrier === 'none'
          ? NO_CARRIER_WHY
          : carrier === 'netlist' && drv!.partIndex === null
            ? READ_ONLY_NETLIST_WHY
            : null),
      split: netlist === true && adjust,
    };
  });
}

/**
 * Which carrier a write may touch.
 *
 * `auto` is the knob: it settles the way into the netlist part when one drives
 * it, so the export carries what the knob shows. `adjust` is for a caller that
 * may NOT edit a drawing — H-4b's textbook follow fires on a change in the
 * BAND FORM, and a form change silently editing a network somebody drew is
 * precisely what UI-2 stopped. It reaches the same effective value through the
 * box, and the resulting split is printed.
 */
export type PolarityVia = 'auto' | 'adjust';

/** What a press has to write. Applied whole or not at all. */
export type PolarityWrite =
  | {
      kind: 'netlist';
      /** The driver part to stamp, and the bit to stamp on it. */
      partIndex: number;
      inverted: boolean;
      /** The adjust flags AFTER the press — this way's is cleared. */
      adjustFlags: boolean[];
      /** True when the press also cleared a flag, i.e. it normalised a split. */
      normalised: boolean;
    }
  | { kind: 'adjust'; adjustFlags: boolean[] }
  | { kind: 'refused'; why: string };

/**
 * The plan for setting one way's EFFECTIVE polarity.
 *
 * With a netlist part driving the way, the bit goes into the PART — so the
 * export and the soldering mark carry it — and that way's adjust flag is
 * cleared in the same step. Both halves are in one returned value because
 * applying one without the other changes the sum by 180°.
 *
 * Without a part, the flag is the only carrier and takes the bit directly.
 */
export function setWayPolarity(
  ways: readonly WayPolarity[],
  adjustFlags: readonly boolean[],
  index: number,
  next: boolean,
  via: PolarityVia = 'auto',
): PolarityWrite {
  const w = ways[index];
  if (!w) return { kind: 'refused', why: `there is no way ${index} in this project` };
  if (via === 'adjust') {
    // The box is the only carrier this caller may touch. Reach `next` THROUGH
    // whatever the netlist already contributes, so the effective value is the
    // one asked for; if that leaves both layers carrying a bit, the split is
    // reported beside the knob rather than hidden.
    //
    // A way that is held elsewhere (Hybrid mode's active side) is refused on
    // THIS path too: "not chosen here" is not a statement about which carrier
    // the caller may use, it is a statement about the way.
    if (!w.settable && w.why) return { kind: 'refused', why: w.why };
    if (index === 0) return { kind: 'refused', why: NO_CARRIER_WHY };
    const f = [...adjustFlags];
    f[index - 1] = next !== (w.netlist === true);
    return { kind: 'adjust', adjustFlags: f };
  }
  if (!w.settable) return { kind: 'refused', why: w.why ?? 'this way has no polarity carrier' };
  const flags = [...adjustFlags];
  if (w.carrier === 'netlist' && w.partIndex !== null) {
    const normalised = index > 0 && flags[index - 1] === true;
    if (index > 0) flags[index - 1] = false;
    // The flag is cleared, so the part alone has to produce `next`.
    return { kind: 'netlist', partIndex: w.partIndex, inverted: next, adjustFlags: flags, normalised };
  }
  if (index === 0) return { kind: 'refused', why: NO_CARRIER_WHY };
  flags[index - 1] = next;
  return { kind: 'adjust', adjustFlags: flags };
}

/**
 * One line describing what a way's polarity is and where it lives — the text
 * beside the knob. Never a verdict: it says what is, and the designer chooses.
 */
export function describeWayPolarity(w: WayPolarity): string {
  const state = w.effective ? 'REVERSED' : 'normal';
  if (!w.settable) return `${w.role}: ${state} — ${w.why}`;
  if (w.carrier === 'netlist') {
    return w.split
      ? `${w.role}: ${state} — the part says ${w.netlist ? 'reversed' : 'normal'} and the adjustment box ` +
          'flips it again, so the export (which reads the part) does not show what you hear. ' +
          'Pressing this settles both into the part.'
      : `${w.role}: ${state} — carried by the driver part, so the export and the soldering mark carry it too.`;
  }
  return `${w.role}: ${state} — carried by the adjustment box. No network drives this way, so there is ` +
    'nothing to export yet.';
}
