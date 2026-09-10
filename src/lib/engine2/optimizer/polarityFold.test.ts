/**
 * U-3d — THE POLARITY LIVES IN THE NETLIST, AND NOBODY MAY APPLY IT TWICE.
 *
 * E-3 folded the polarity the design step chooses into the `Driver` part on
 * both chain routes, so that every reader outside the chain — the shortlist's
 * own summed response, the report on a frozen file, every guard — sees the
 * network the tune actually judged. Its note says the chain's adjust "never
 * leaves the chain".
 *
 * It did leave it. `applyScanCandidate` in `App.tsx` still fed the app's
 * polarity checkbox from `r.vf.inverted` (and the two three-way ones from
 * `r.midInverted` / `r.tweeterInverted`), and the two COMPOSE: `network.ts`
 * applies `Driver.inverted` to the branch transfer, `combine`/`combineN`
 * applies the checkbox on top. A loaded candidate whose design inverted a way
 * was therefore simulated, charted and scored 360° out.
 *
 * MEASURED IN THE RUNNING APP (Sander, 09-09-2026): one two-way design read
 * 6.4° in the shortlist and 173.6° average in the phase chart, with the
 * checkbox on. Casus 1 never showed it — its delivered field is LR4-only since
 * A5e.3-veld and its design step never inverts, so the fold is the identity,
 * which is also why the corpus reproduces byte for byte.
 *
 * Two halves, and the second is the one that can rot: what the netlist DOES,
 * measured on the frozen casus-1b candidate; and that the app no longer adds a
 * second inversion, as a source scan (the UI-1 idiom — a function test cannot
 * reach whether the screen does it).
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { foldDriverPolarity } from './worker.ts';
import type { VxpPart } from '../../parsers/vxp.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const APP = readFileSync(join(ROOT, 'src', 'App.tsx'), 'utf-8');

/** The frozen casus-1b candidate — the one whose design step DID invert. */
const KAND = JSON.parse(
  readFileSync(join(ROOT, 'test-fixtures', 'casus1b', 'KAND-V2-1.adsfilter.json'), 'utf-8'),
) as { parts: VxpPart[] };

const driverOf = (parts: readonly VxpPart[], model: string): VxpPart =>
  parts.find((p) => p.type === 'Driver' && p.model === model)!;

describe('U-3d — the fold is in the parts', () => {
  it('the frozen casus-1b candidate carries its inversion in the tweeter driver', () => {
    /* The premise of everything below, and it is a fact about a file on disk
     * rather than about a run: if this ever reads false the fold stopped
     * happening and the app's checkbox would be the carrier again. */
    expect(driverOf(KAND.parts, 'tweeter').inverted).toBe(true);
    expect(driverOf(KAND.parts, 'mid').inverted ?? false).toBe(false);
  });

  it('the fold is an XOR, so applying it twice returns the un-inverted part', () => {
    /* This is exactly what the app was doing, one layer up: a second
     * application of the same polarity is the identity on the SIGN and a
     * catastrophe on the SUM. */
    const once = foldDriverPolarity({ parts: KAND.parts, net: {} }, { tweeter: true });
    expect(driverOf(once.parts, 'tweeter').inverted).toBe(false);
    const twice = foldDriverPolarity(once, { tweeter: true });
    expect(driverOf(twice.parts, 'tweeter').inverted).toBe(true);
    // …and a design that inverted nothing is the identity, byte for byte.
    expect(foldDriverPolarity({ parts: KAND.parts, net: {} }, {}).parts).toBe(KAND.parts);
    expect(foldDriverPolarity({ parts: KAND.parts, net: {} }, { tweeter: false }).parts).toBe(KAND.parts);
  });
});

describe('U-3d — the app does not apply it a second time', () => {
  /* COMMENTS STRIPPED, and that is not a detail: the note this fix left behind
   * QUOTES the three calls it removed, so a scan over raw source would find
   * them in the explanation of why they are gone. Same discipline as
   * `noWeights.test.ts` — the claim is about CODE. */
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
  const body = stripComments(
    APP.slice(APP.indexOf('function applyScanCandidate('), APP.indexOf('function applyScanCandidate(') + 4000),
  );

  it('applyScanCandidate clears the polarity checkboxes instead of feeding them', () => {
    expect(body.length).toBeGreaterThan(500);
    expect(body).toContain('setInverted(false)');
    expect(body).toContain('setMidInverted(false)');
    /* THE THREE READS THAT CAUSED IT, by name. A test that only checked for
     * `setInverted(false)` would stay green next to a second call that fed the
     * result — which is how this arrived in the first place. */
    for (const read of ['setInverted(r.vf.inverted)', 'setInverted(r.tweeterInverted)', 'setMidInverted(r.midInverted)']) {
      expect(body, read).not.toContain(read);
    }
  });

  /* AND NOT OVER-FIXED. Four other sites feed a polarity into the app state,
   * and all four are correct because their result is NOT folded: the two v1
   * scans (`runChainScan`, and the no-shortlist branch of the three-way run),
   * the virtual-filter optimiser (no parts exist at all there) and the vxp
   * import (it reads the polarity off the imported file). Since U-1 the first
   * two are unreachable from the interface, which is why they were left alone
   * rather than deleted — the same rule U-1 applied to the v1 engine itself.
   * Named here so a later reader does not "fix" them too. */
  it('the v1 feeds are untouched: on those routes the checkbox IS the carrier', () => {
    const app = stripComments(APP);
    expect(app).toContain('setInverted(win.vf.inverted)');
    expect(app).toContain('setInverted(win.tweeterInverted)');
    expect(app).toContain('setInverted(best.inverted)');
  });

  it('the two places that DO apply a polarity are still exactly two, and neither is this one', () => {
    /* The solver reads the part; the summing core reads the adjust. Both are
     * correct and both must stay — what may not happen is one result feeding
     * both. */
    const solver = readFileSync(join(ROOT, 'src', 'lib', 'network.ts'), 'utf-8');
    expect(solver).toContain('d.inverted ? scale(h, -1) : h');
    const dsp = readFileSync(join(ROOT, 'src', 'lib', 'dsp.ts'), 'utf-8');
    expect(dsp).toContain('(adj.inverted ? 180 : 0)');
    // The app's own polarity state is still reachable — it is the designer's
    // control, and U-3d took away only the automatic feed from a folded result.
    expect(APP).toContain('setInverted(e.target.checked)');
  });
});
