/**
 * WHAT ±dB WINDOW DO THE DRIVERS THEMSELVES ALLOW? (08-11-2026, measurement only)
 *
 * The guided "What do you want to build?" profiles state a fixed SPL window
 * (±3 / ±2 / ±1.5 dB). Sander: those were reachable because the Koan drivers
 * are unusually smooth; not every driver gets to ±3. This script measures, per
 * driver, the fine structure a passive network cannot remove — the 1/6-octave
 * response (what the window judges, `judgeResponse`) minus a broad trend (what
 * slopes, shelves and a trap or two can follow) — over the band that driver
 * plays in, and reports half its peak-to-peak as an achievable-± estimate.
 *
 * Arms: the trend width (1/2, 1 and 2 octaves). Nothing is chosen here; the
 * numbers are set next to what the Koan route actually delivered.
 *
 *   npx vite-node scripts/measure-achievable-window.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parseFrd } from '../src/lib/parsers/frd.ts';
import { logspace, resample, combineN, type GriddedResponse } from '../src/lib/dsp.ts';
import { roughnessPlusMinusDb, FINE_SMOOTHING_OCT } from '../src/lib/achievableWindow.ts';
import { casus1FilePath, casus1Manifest, loadGolden } from '../src/lib/engine2/casus1.fixture.ts';

const TREND_ARMS_OCT = [0.5, 1, 2];
/** How far a driver's judged band reaches past each of its crossings, octaves. */
const OVERLAP_OCT = 0.5;

type Resp = GriddedResponse;

function load(path: string): Resp {
  const m = parseFrd(readFileSync(path, 'utf-8'));
  return { freq: m.freq, spl: m.spl, phaseDeg: m.phase };
}

function sumComplex(a: Resp, b: Resp): Resp {
  const lo = Math.max(a.freq[0], b.freq[0]);
  const hi = Math.min(a.freq[a.freq.length - 1], b.freq[b.freq.length - 1]);
  const g = logspace(lo, hi, 2000);
  const ra = resample(a.freq, a.spl, a.phaseDeg, g);
  const rb = resample(b.freq, b.spl, b.phaseDeg, g);
  const c = combineN([{ response: ra }, { response: rb }]);
  return { freq: g, spl: c.combinedSpl, phaseDeg: c.combinedPhaseDeg };
}

/** ± estimate on [lo, hi] for one trend width — the app's own estimator. */
const achievable = (r: Resp, lo: number, hi: number, trendOct: number) =>
  roughnessPlusMinusDb(r.freq, r.spl, lo, hi, trendOct);

interface Driver { name: string; resp: Resp; lo: number; hi: number }
const sets: { name: string; xo: number[]; drivers: Driver[] }[] = [];

/* KOAN — casus 1 on the current measurement basis ('m3'): woofer pair summed. */
{
  const golden = loadGolden();
  const man = casus1Manifest(golden);
  const ff = (driver: string) =>
    man.entries.filter((e) => e.driver === driver && e.kind === 'FF' && (e.angleDeg ?? 0) === 0).map((e) => e.file);
  const p = (f: string) => casus1FilePath(f, man, golden);
  const [wu, wd] = ff('woofer');
  const woofer = sumComplex(load(p(wu)), load(p(wd)));
  const xo = [362.3, 2251.4]; // the live corpus's KAND_V2_2, a delivered design
  const up = (f: number) => f * 2 ** OVERLAP_OCT;
  const dn = (f: number) => f / 2 ** OVERLAP_OCT;
  sets.push({
    name: 'Koan (casus 1, m3)',
    xo,
    drivers: [
      { name: 'woofer pair', resp: woofer, lo: 52.4, hi: up(xo[0]) },
      { name: 'mid', resp: load(p(ff('mid')[0])), lo: dn(xo[0]), hi: up(xo[1]) },
      { name: 'tweeter', resp: load(p(ff('tweeter')[0])), lo: dn(xo[1]), hi: 19500 },
    ],
  });
}

/* ROBBERT — the three-way in ~/Downloads/3-weg, at the crossings its own
   project file names (411 / 2520 Hz). On-axis = hor 0°, vertical 10°. */
{
  const d = join(homedir(), 'Downloads', '3-weg');
  const xo = [411, 2520];
  const up = (f: number) => f * 2 ** OVERLAP_OCT;
  const dn = (f: number) => f / 2 ** OVERLAP_OCT;
  sets.push({
    name: 'Robbert 3-weg',
    xo,
    drivers: [
      { name: 'woofer', resp: load(join(d, 'woofer_ver10_hor_deg0.frd')), lo: 60, hi: up(xo[0]) },
      { name: 'mid', resp: load(join(d, 'mid_ver10_hor_deg0.frd')), lo: dn(xo[0]), hi: up(xo[1]) },
      { name: 'tweeter', resp: load(join(d, 'tweeter_ver10_hor_deg0.frd')), lo: dn(xo[1]), hi: 19500 },
    ],
  });
}

/* ROBBERT — the two-way in ~/Downloads/Speaker Robbert (Scan 12W + R2604). The
   crossing is not in a file this script can read; 2500 Hz is an ASSUMPTION for
   this measurement only, and the row says so. */
{
  const d = join(homedir(), 'Downloads', 'Speaker Robbert');
  const xo = [2500];
  sets.push({
    name: 'Robbert 2-weg (12W + R2604, xo assumed 2500)',
    xo,
    drivers: [
      { name: 'woofer 12W', resp: load(join(d, '12w_ver0_hor_deg0.frd')), lo: 60, hi: xo[0] * 2 ** OVERLAP_OCT },
      { name: 'tweeter R2604', resp: load(join(d, 'r2604_ver0_hor_deg0.frd')), lo: xo[0] / 2 ** OVERLAP_OCT, hi: 19500 },
    ],
  });
}

const out: unknown[] = [];
for (const s of sets) {
  console.log(`\n${s.name}  (crossings ${s.xo.join(' / ')} Hz)`);
  console.log(`  driver            band Hz          ${TREND_ARMS_OCT.map((t) => `±@${t}oct`.padStart(9)).join('')}`);
  const rows = s.drivers.map((d) => {
    const v = TREND_ARMS_OCT.map((t) => achievable(d.resp, d.lo, d.hi, t));
    console.log(
      `  ${d.name.padEnd(16)}  ${`${d.lo.toFixed(0)}–${d.hi.toFixed(0)}`.padEnd(15)}  ${v
        .map((x) => (x === null ? '—' : x.toFixed(2)).padStart(9))
        .join('')}`,
    );
    return { driver: d.name, band: [d.lo, d.hi], v, plusMinusDb: Object.fromEntries(TREND_ARMS_OCT.map((t, i) => [t, v[i]])) };
  });
  const worst = TREND_ARMS_OCT.map((_, i) => Math.max(...rows.map((r) => r.v[i] ?? 0)));
  console.log(`  worst driver                       ${worst.map((x) => x.toFixed(2).padStart(9)).join('')}`);
  out.push({ set: s.name, crossingsHz: s.xo, rows, worst: Object.fromEntries(TREND_ARMS_OCT.map((t, i) => [t, worst[i]])) });
}
writeFileSync(
  join(process.cwd(), 'test-fixtures', 'achievable_window.json'),
  JSON.stringify({ measuredOn: '2026-11-08', smoothingOct: FINE_SMOOTHING_OCT, overlapOct: OVERLAP_OCT, sets: out }, null, 1) + '\n',
);
