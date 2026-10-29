/**
 * E-7 (V53) — waar het ±venster van de worker vandaan kwam.
 *
 *   npx vite-node scripts/measure-e7-window.ts
 *
 * Seconden, geen ketenrun. Op casus 1b's bevroren netlists (KAND-V2-1 draagt de
 * omgekeerde tweeter in het Driver-onderdeel, HUIDIG-MT niets) dezelfde som die
 * de worker bouwt (`solveNetwork` → `applyTransfer` → `combineN` op het
 * ketenraster) en het venster in vijf lezingen: (a) zoals `judgeResponse` hem
 * leest, (b) met de tweeter-polariteit omgedraaid, (d) alleen bandpunten, (e)
 * alleen het dode toppunt weggelaten, (c) via `buildReport`. Vóór E-7 las (a)
 * ±70,53 en (d) ±1,18; sinds `response-judgement/1.1` zijn (a), (d) en (e) gelijk.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyTransfer, combineN } from '../src/lib/dsp.ts';
import { solveNetwork } from '../src/lib/network.ts';
import { crossoverToNetlist } from '../src/lib/vxpNetwork.ts';
import { judgeResponse } from '../src/lib/engine2/requirements/response.ts';
import { FLAT_TARGET } from '../src/lib/engine2/requirements/targetCurve.ts';
import { CASUS1B_DIR, casus1bManifest, casus1bFiles, casus1bChainInput, CASUS1B_V2_BAND_HZ, casus1bReport, loadGolden1b } from '../src/lib/engine2/casus1b.fixture.ts';

const m = casus1bManifest(loadGolden1b());
const files = casus1bFiles(m);
const g = casus1bChainInput(m, files);
for (const name of ['KAND-V2-1', 'HUIDIG-MT']) {
  const parts = JSON.parse(readFileSync(join(CASUS1B_DIR, `${name}.adsfilter.json`), 'utf-8')).parts;
  const run = (flipTweeter: boolean) => {
    const ps = parts.map((p: any) => p.type === 'Driver' && p.model === 'tweeter' && flipTweeter ? { ...p, inverted: !p.inverted } : p);
    const net = crossoverToNetlist({ name: 'x', parts: ps } as any).netlist;
    const sol = solveNetwork(net, g.grid, g.driverZ);
    const br = [{ model: 'mid', response: g.w }, { model: 'tweeter', response: g.t }]
      .map((b) => { const d = sol.drivers.find((x) => x.model === b.model)!; return { response: applyTransfer(b.response, sol.transfers[d.id]) }; });
    const c = combineN(br);
    const j = judgeResponse(c.freq, c.combinedSpl, FLAT_TARGET, CASUS1B_V2_BAND_HZ)!;
    // same, but only band points
    const idx = c.freq.map((_f, i) => i).filter((i) => c.freq[i] >= CASUS1B_V2_BAND_HZ[0] && c.freq[i] <= CASUS1B_V2_BAND_HZ[1]);
    const jIn = judgeResponse(idx.map((i) => c.freq[i]), idx.map((i) => c.combinedSpl[i]), FLAT_TARGET, CASUS1B_V2_BAND_HZ)!;
    const live = c.freq.map((_, i) => i).filter((i) => c.combinedSpl[i] > -300);
    const jLive = judgeResponse(live.map((i) => c.freq[i]), live.map((i) => c.combinedSpl[i]), FLAT_TARGET, CASUS1B_V2_BAND_HZ)!;
    return { j, jIn, jLive, c };
  };
  const a = run(false), b = run(true);
  console.log(name, 'inverted parts:', parts.filter((p: any) => p.type === 'Driver').map((p: any) => `${p.model}:${!!p.inverted}`).join(' '));
  console.log('  (a) as worker: ±', a.j.windowPlusMinusDb.toFixed(3), 'rms', a.j.rmsDeviationDb.toFixed(3), 'max@', a.j.windowMaxAtHz.toFixed(1), 'min@', a.j.windowMinAtHz.toFixed(1));
  console.log('  (b) tweeter flipped: ±', b.j.windowPlusMinusDb.toFixed(3), 'rms', b.j.rmsDeviationDb.toFixed(3));
  console.log('  (d) band points only: ±', a.jIn.windowPlusMinusDb.toFixed(3), 'rms', a.jIn.rmsDeviationDb.toFixed(3));
  console.log('  (e) ghost point dropped only: ±', a.jLive.windowPlusMinusDb.toFixed(3));
  console.log('  grid', g.grid[0].toFixed(2), '..', g.grid[g.grid.length - 1], 'n', g.grid.length, 'band', CASUS1B_V2_BAND_HZ);
  const out = a.c.freq.map((f, i) => [f, a.c.combinedSpl[i]]).filter(([f]) => f < CASUS1B_V2_BAND_HZ[0] || f > CASUS1B_V2_BAND_HZ[1]);
  console.log('  out-of-band points:', out.map(([f, v]) => `${f.toFixed(1)}:${v.toFixed(1)}`).join(' '));
  const r = casus1bReport(name === 'KAND-V2-1' ? 'KAND_V2_1' : 'HUIDIG_MT');
  const rr = r.system.response;
  console.log('  (c) buildReport: ±', rr?.windowPlusMinusDb.toFixed(3), 'rms', rr?.rmsDeviationDb.toFixed(3), 'band', rr?.bandHz);
}
