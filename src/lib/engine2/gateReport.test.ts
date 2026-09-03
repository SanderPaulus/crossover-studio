/**
 * P4's VISIBLE HALF, on the report the panel renders.
 *
 * Deliverable 2 asks for something easy to get wrong in exactly one way:
 * "Inactieve poorten worden in het rapportpaneel wél getoond als waarde, met
 * de vermelding 'geen grens gesteld'." An inactive gate that is hidden and an
 * inactive gate rendered as a pass are both wrong, and both look fine on a
 * screenshot. So the report is asserted on directly: every gate present,
 * every value present, and the sentence that says nothing judged it.
 *
 * Run on casus 1 rather than a synthetic network, because the interesting
 * claim is about a real filter — including which ways M-C turns out to apply
 * to once the branches are asked rather than named.
 */

import { describe, expect, it } from 'vitest';
import { casus1Files, casus1Filter, casus1Geometry, casus1Manifest, loadGolden } from './casus1.fixture.ts';
import { buildReport, type ReportSettings } from './report.ts';
import { ctcKey } from './metrics/types.ts';

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const geometry = casus1Geometry(golden);

const BASE: ReportSettings = {
  amplifierPowerW: 100,
  orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
  /* V50 — the amplifier peak, so M-L can read a current (in amperes) to
   * report; it states no LIMIT, which is what this file is about. */
  amplifierPeakPowerW: 160,
  amplifierNominalLoadOhm: 8,
};

const report = (settings: ReportSettings) =>
  buildReport({
    manifest,
    files,
    filter: casus1Filter('HUIDIG', manifest, files, golden),
    geometry,
    settings,
  });

describe('the report shows every gate, active or not', () => {
  const off = report(BASE);

  it('with no limit stated: every gate is shown, with its value and "no limit set"', () => {
    expect(off.gates.anyActive).toBe(false);
    expect(off.gates.violation).toBeNull();
    const gates = off.gates.verdicts.map((v) => v.gate);
    expect(gates).toContain('M-A');
    expect(gates).toContain('M-B/EPDR');
    expect(gates).toContain('M-B/|Z|');
    for (const v of off.gates.verdicts) {
      expect(v.active).toBe(false);
      expect(v.limit).toBeNull();
      expect(v.value).not.toBeNull();
      expect(v.reason).toContain('no limit set');
      expect(v.specRef).toMatch(/^A4/);
    }
  });

  it('the gate values are the METRIC values - not a second computation of them', () => {
    const ma = off.gates.verdicts.find((v) => v.gate === 'M-A')!;
    expect(ma.value).toBe(off.metrics.dissipation!.totalFraction);
    const epdr = off.gates.verdicts.find((v) => v.gate === 'M-B/EPDR')!;
    expect(epdr.value).toBe(off.metrics.epdr!.minOhm);
    const z = off.gates.verdicts.find((v) => v.gate === 'M-B/|Z|')!;
    expect(z.value).toBe(off.metrics.epdr!.minZOhm);
    for (const mc of off.gates.verdicts.filter((v) => v.gate === 'M-C')) {
      const m = off.metrics.driveVoltage.find((d) => d.driver === mc.subject)!;
      expect(mc.value).toBe(m.db);
    }
  });

  it('M-C appears for the ways this filter actually high-passes', () => {
    // Derived from each branch's own transfer, so it follows the circuit. On
    // casus 1's three-way that is the mid and the tweeter; the woofer's branch
    // is a low pass and gets no M-C row.
    expect(off.gates.highPassProtected.length).toBeGreaterThan(0);
    expect(off.gates.highPassProtected).not.toContain('woofer');
    const subjects = off.gates.verdicts.filter((v) => v.gate === 'M-C').map((v) => v.subject);
    expect(subjects).toEqual(off.gates.highPassProtected);
    for (const v of off.gates.verdicts.filter((v) => v.gate === 'M-C')) {
      // The band a limit would be judged against travels with the row.
      expect(String(v.parameters!.passband)).toContain('Hz');
      expect(String(v.parameters!.f_s)).toContain('Hz');
    }
  });

  it('a stated limit turns exactly that gate on, and leaves the others off', () => {
    const on = report({ ...BASE, minEpdrOhm: 1.6 });
    expect(on.gates.anyActive).toBe(true);
    for (const v of on.gates.verdicts) {
      expect(v.active).toBe(v.gate === 'M-B/EPDR');
      if (!v.active) expect(v.reason).toContain('no limit set');
    }
    // Casus 1's EPDR minimum is 1.73 ohm, so a 1.6 floor passes and a 2.0 one
    // does not — the gate reads the design rather than agreeing with itself.
    expect(on.gates.violation).toBeNull();
    expect(report({ ...BASE, minEpdrOhm: 2.0 }).gates.violation).toContain('EPDR');
  });

  it('an absent budget leaves the search box untouched; a stated one shows its inversion', () => {
    expect(off.predesign.bounds).toEqual([]);
    const bounded = report({ ...BASE, qesMultiplierMax: 1.5 });
    const qes = bounded.predesign.bounds.find((b) => b.rule === 'qes-series-r');
    expect(qes).toBeTruthy();
    expect(qes!.slack).toBe(false);
    // Every parameter that produced the number travels with it (V15).
    expect(qes!.parameters.R_e_ohm).toBeGreaterThan(0);
    expect(String(qes!.parameters.R_e_source).length).toBeGreaterThan(10);
    expect(qes!.parameters.q_max).toBe(1.5);
  });
});
