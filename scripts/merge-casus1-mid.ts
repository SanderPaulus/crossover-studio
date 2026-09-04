/**
 * M-1 - DE MID GEMERGED MET DEZELFDE PIPELINE ALS SANDERS WOOFER-MERGE.
 *
 * `npx vite-node scripts/merge-casus1-mid.ts` - seconden, geen ketenrun.
 * Schrijft `test-fixtures/casus1/Koan_M_merged.frd` en drukt de drie controles af.
 *
 * DE STAPPEN, zoals Sander ze voor de woofers gedaan heeft (zijn bestandskop):
 *   1. NF = `mid_near.txt`, op het raster van het ver-veldbestand (log-f
 *      interpolatie, fase uitgevouwen - `resample`, de eigen functie van de app).
 *   2. STEP-MODEL op het NF-deel: shelf 6 dB @ 440 Hz - hetzelfde front als de
 *      woofers, dus dezelfde shelf. De VORM is de eerste-orde shelf die de app
 *      zelf tekent (`baffleStepShelfDb`, A5e.2: 0 dB ver boven de hoek, −6 ver
 *      eronder, −3 OP de hoek). De FASE is de minimum-fase-tegenhanger van die
 *      magnitude (cepstrum op een dicht lineair raster) - een shelf zonder fase
 *      zou de mid tegen de woofers, die een complexe modelstap dragen, tot 20°
 *      uit de fase zetten precies rond de W-M-overname. 440 Hz is Sanders
 *      gestelde getal; de kastafleiding (`baffleStepHz(260)`) geeft 442,3 Hz,
 *      0,008 octaaf verderop en < 0,01 dB verschil in de shelf.
 *   3. GEEN POORT: de mid zit in een gesloten pod. Niets verzonnen (P4).
 *   4. SPLICE gefit in 500–800 Hz: niveau (mediaan) én zuivere vertraging
 *      (kleinste kwadraten op het faseverschil), daarna een raised-cosine-
 *      crossfade in het COMPLEXE domein - `mergeNearFar`, de eigen merge van de
 *      app, met de shelf al op het NF-deel gezet en `baffleStepHz: 0` zodat hij
 *      hem niet nog eens zet. Mid FF geldig vanaf 397 Hz (header), NF tot de
 *      Keele-grens (4311/4″ = 1078 Hz; Sanders ~770 Hz is conservatiever), dus
 *      500–800 ligt binnen beide.
 *   5. GELDIG VANAF: uit de pod. f_c = 88,8 Hz; het script meet waar het NF
 *      ophoudt te dragen (het niveau op zijn tweede-orde flank en de
 *      raggedness van het NF eronder) en schrijft de gestelde vloer met die
 *      getallen in het blok. GELDIG TOT: het einde van de sweep - boven de
 *      splice is het bestand het gepoorte ver veld.
 *
 * DE DRIE CONTROLES (afgedrukt, niet aangenomen):
 *   (1) splice-band: |FF − (NF·shelf + niveau)| over 500–800 Hz, en het
 *       fase-residu van de vertragingsfit;
 *   (2) step-vorm gelijk aan die van de woofers in 150–400 Hz: de EMPIRISCHE
 *       stap van elk woofer-mergebestand (merged − NF − splice-gain uit zijn
 *       eigen kop) naast de shelf die de mid kreeg, gegladd op 1/6 octaaf;
 *   (3) de sweep ongewijzigd: `mid.lim` wordt niet aangeraakt (git-status).
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrd } from '../src/lib/parsers/frd.ts';
import { parseTabular } from '../src/lib/parsers/tabular.ts';
import { parseArtaHeader } from '../src/lib/engine2/ingest/manifest.ts';
import { resample } from '../src/lib/dsp.ts';
import { baffleStepShelfDb, mergeNearFar } from '../src/lib/nearField.ts';
import { baffleStepHz } from '../src/lib/cabinet.ts';
import { fftInPlace, ifftInPlace } from '../src/lib/fft.ts';
import { loadGolden } from '../src/lib/engine2/casus1.fixture.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const CASUS1 = join(HERE, '..', 'test-fixtures', 'casus1');
const NF_FILE = 'mid_near.txt';
const FF_FILE = 'mid_hor_0.txt';
const OUT_FILE = 'Koan_M_merged.frd';

/** Sanders gestelde stap-model, hetzelfde als op de woofers ("zelfde front"). */
const STEP_HZ = 440;
const STEP_DEPTH_DB = 6;
/** De splice-band waarin niveau en vertraging gefit worden. */
const SPLICE_BAND_HZ: [number, number] = [500, 800];
/** De band waarover de stap-vorm met die van de woofers vergeleken wordt. */
const STEP_CHECK_BAND_HZ: [number, number] = [150, 400];
/** Lineair raster voor de minimum-fase-berekening: 2^20 punten tot fs/2. */
const MINPHASE_N = 1 << 20;

const golden = loadGolden();
const fcHz = (golden.afgeleide_parameters.mid as { fc: number }).fc;
const midDiameterInch = golden.manifest_en_geometrie.geometrie.D_inch.mid;
const cabinetStepHz = baffleStepHz(golden.manifest_en_geometrie.geometrie.baffle_mm!.breedte);

const nfText = readFileSync(join(CASUS1, NF_FILE), 'latin1');
const ffText = readFileSync(join(CASUS1, FF_FILE), 'latin1');
const nf = parseFrd(nfText);
const ff = parseFrd(ffText);
const ffHeader = parseArtaHeader(parseTabular(ffText).comments);
const nfHeader = parseArtaHeader(parseTabular(nfText).comments);
if (ffHeader.effectiveWindowMs === undefined || ffHeader.sampleRateHz === undefined) {
  throw new Error(`${FF_FILE}: no window or sample rate in the header`);
}
const ffFloorHz = 1000 / ffHeader.effectiveWindowMs;
const grid = ff.freq;

/* ---- 1. het NF op het FF-raster ------------------------------------------ */
const nfOnGrid = resample(nf.freq, nf.spl, nf.phase, grid, { clampEdges: true });

/* ---- 2. de shelf, magnitude én minimum-fase ------------------------------ */
const shelfDb = baffleStepShelfDb(grid, STEP_HZ, STEP_DEPTH_DB);
/**
 * Minimum-fase uit de magnitude via het reële cepstrum: log|H| even uitgebreid
 * over de hele cirkel, c = IFFT, gevouwen (c[0], 2c[1..N/2−1], c[N/2], 0), en
 * H_min = exp(FFT(c_gevouwen)). De shelf is analytisch op elk raster te
 * berekenen, dus het raster is vrij te kiezen: fs/2 = 24 kHz in 2^19 stappen
 * van 0,046 Hz.
 */
function minimumPhaseDeg(magDbAt: (f: number) => number, fsHz: number, n: number): (f: number) => number {
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let k = 0; k <= n / 2; k++) {
    const f = (k * fsHz) / n;
    const v = (Math.LN10 / 20) * magDbAt(f);
    re[k] = v;
    if (k > 0 && k < n / 2) re[n - k] = v;
  }
  ifftInPlace(re, im);
  for (let k = 0; k < n; k++) {
    if (k === 0 || k === n / 2) continue;
    if (k < n / 2) re[k] *= 2;
    else re[k] = 0;
    im[k] = 0;
  }
  im[0] = 0;
  im[n / 2] = 0;
  fftInPlace(re, im);
  const phase = new Float64Array(n / 2 + 1);
  for (let k = 0; k <= n / 2; k++) phase[k] = (Math.atan2(im[k], re[k]) * 180) / Math.PI;
  const df = fsHz / n;
  return (f: number): number => {
    const x = f / df;
    const k = Math.min(Math.floor(x), n / 2 - 1);
    const t = x - k;
    return phase[k] + t * (phase[k + 1] - phase[k]);
  };
}
const shelfPhaseAt = minimumPhaseDeg((f) => baffleStepShelfDb([f], STEP_HZ, STEP_DEPTH_DB)[0], ffHeader.sampleRateHz, MINPHASE_N);
const shelfPhaseDeg = grid.map(shelfPhaseAt);
const nearAdjDb = nfOnGrid.spl.map((v, i) => v + shelfDb[i]);
const nearAdjPhase = nfOnGrid.phaseDeg.map((v, i) => v + shelfPhaseDeg[i]);

/* ---- 4. de splice, door de eigen merge van de app ------------------------ */
const merged = mergeNearFar({
  freq: grid,
  farSpl: ff.spl,
  farPhaseDeg: ff.phase,
  nearSpl: nearAdjDb,
  nearPhaseDeg: nearAdjPhase,
  transitionHz: Math.sqrt(SPLICE_BAND_HZ[0] * SPLICE_BAND_HZ[1]),
  blendOctaves: Math.log2(SPLICE_BAND_HZ[1] / SPLICE_BAND_HZ[0]),
  baffleStepHz: 0,
});
if (!merged) throw new Error('mergeNearFar refused - too few points in the splice band?');

/* ---- 5. waar het NF ophoudt te dragen: de gestelde vloer ----------------- */
const smoothDb = (f: readonly number[], y: readonly number[], octaves: number, at: number): number => {
  const lo = at * 2 ** (-octaves / 2);
  const hi = at * 2 ** (octaves / 2);
  let s = 0;
  let c = 0;
  for (let i = 0; i < f.length; i++) if (f[i] >= lo && f[i] <= hi) { s += y[i]; c++; }
  return c ? s / c : NaN;
};
const raggedness = (f: readonly number[], y: readonly number[], at: number): number => {
  const lo = at * 2 ** (-1 / 24);
  const hi = at * 2 ** (1 / 24);
  const v: number[] = [];
  for (let i = 0; i < f.length; i++) if (f[i] >= lo && f[i] <= hi) v.push(y[i]);
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
};
const nfRef = (() => {
  let s = 0;
  let c = 0;
  for (let i = 0; i < nf.freq.length; i++) if (nf.freq[i] >= 300 && nf.freq[i] <= 700) { s += nf.spl[i]; c++; }
  return s / c;
})();
const nfRel = (at: number) => smoothDb(nf.freq, nf.spl, 1 / 12, at) - nfRef;
/** De vloer: waar de mid op zijn tweede-orde flank ~7 dB onder zijn doorlaatband
 *  zit en de NF-raggedness eronder begint op te lopen - Sanders "~60 Hz". */
const VALID_FROM_HZ = 60;
const floorFacts = {
  relAt60: nfRel(VALID_FROM_HZ),
  relAtFc: nfRel(fcHz),
  ragAbove: raggedness(nf.freq, nf.spl, 120),
  ragAt: raggedness(nf.freq, nf.spl, VALID_FROM_HZ),
  ragBelow: raggedness(nf.freq, nf.spl, 30),
};
const keeleHz = 4311 / midDiameterInch;

/* ---- controle (1): de splice-band ---------------------------------------- */
const spliceResid: number[] = [];
for (let i = 0; i < grid.length; i++) {
  if (grid[i] >= SPLICE_BAND_HZ[0] && grid[i] <= SPLICE_BAND_HZ[1]) spliceResid.push(ff.spl[i] - (nearAdjDb[i] + merged.levelDb));
}
const sortedAbs = spliceResid.map(Math.abs).sort((a, b) => a - b);
const spliceCheck = {
  median: sortedAbs[sortedAbs.length >> 1],
  p95: sortedAbs[Math.floor(sortedAbs.length * 0.95)],
  max: sortedAbs[sortedAbs.length - 1],
  min: Math.min(...spliceResid),
  maxSigned: Math.max(...spliceResid),
};

/* ---- het bestand ---------------------------------------------------------- */
const fmt = (v: number, d: number, w: number) => v.toFixed(d).padStart(w);
const rows = grid.map((f, i) => `${fmt(f, 4, 12)}${fmt(merged.spl[i], 3, 10)}${fmt(merged.phaseDeg[i], 3, 10)}`);
const header = [
  `* Koan 2951 - mid (M1), NF/FF-merge zoals Sanders woofer-merge (M-1, 04-09-2026)`,
  `* basis: ${NF_FILE} (nabij veld, gesloten pod, geen poort) + ${FF_FILE} (gepoort ver veld); GEEN inspeel-predictie op de mid`,
  `* status: PLACEHOLDER tot groundplane/hermeting; geen meting onder de splice maar NF + modelstap`,
  `* Merge = NF/FF`,
  `* Valid from = ${VALID_FROM_HZ} Hz`,
  `* Valid to = ${Math.round(grid[grid.length - 1])} Hz`,
  `* Merge NF source = ${NF_FILE}`,
  `* Merge FF source = ${FF_FILE}`,
  `* Merge FF window = reference ${ffHeader.referenceTimeMs} ms, right ${ffHeader.rightWindowMs} ms${ffHeader.rightTaper ? `, ${ffHeader.rightTaper.kind} ${ffHeader.rightTaper.alpha}` : ''}`,
  `* Merge splice band = ${SPLICE_BAND_HZ[0]}-${SPLICE_BAND_HZ[1]} Hz`,
  `* Merge splice fit = gain ${merged.levelDb.toFixed(2)} dB, delay ${(merged.delayUs / 1000).toFixed(4)} ms, offset ${merged.offsetDeg.toFixed(1)} deg, phase residual ${merged.residualDeg.toFixed(1)} deg rms`,
  `* Merge step model = shelf ${STEP_DEPTH_DB} dB @ ${STEP_HZ} Hz, first order (baffleStepShelfDb), minimum phase; cabinet derivation ${cabinetStepHz === null ? "n/a" : cabinetStepHz.toFixed(1)} Hz`,
  `* Merge port model = none (closed pod)`,
  `* Merge usable ceiling = not applicable (the mid's crossover ceilings come from its breakups, above the splice)`,
  `* Merge prediction = none (no break-in prediction applied to the mid)`,
  `* Merge floor reason = sealed pod f_c ${fcHz} Hz: at ${VALID_FROM_HZ} Hz the near field reads ${floorFacts.relAt60.toFixed(1)} dB below its passband on the second-order slope (${floorFacts.relAtFc.toFixed(1)} dB at f_c) and its 1/12-octave raggedness rises from ${floorFacts.ragAbove.toFixed(2)} dB above 120 Hz to ${floorFacts.ragAt.toFixed(2)} at ${VALID_FROM_HZ} Hz and ${floorFacts.ragBelow.toFixed(2)} at 30 Hz - where the near field stops carrying; NF Keele limit ${keeleHz.toFixed(0)} Hz, FF gate floor ${ffFloorHz.toFixed(1)} Hz`,
  `* Merge status = PLACEHOLDER tot groundplane / hermeting`,
  `Freq[Hz]  dBSPL  Phase[Deg]`,
];
writeFileSync(join(CASUS1, OUT_FILE), [...header, ...rows].join('\n') + '\n', 'latin1');

/* ---- nacontrole: de parser leest het blok terug -------------------------- */
const back = parseArtaHeader(parseTabular(readFileSync(join(CASUS1, OUT_FILE), 'latin1')).comments);
if (!back.merge || back.statedValidity?.fromHz !== VALID_FROM_HZ) throw new Error('the block does not read back');

/* ---- controle (2): de stap-vorm tegen die van de woofers ----------------- */
console.log(`geschreven: ${OUT_FILE} (${rows.length} rijen, ${grid[0]}–${grid[grid.length - 1]} Hz)`);
console.log(`NF-vloer: ${VALID_FROM_HZ} Hz - ${floorFacts.relAt60.toFixed(2)} dB onder de doorlaatband (f_c ${fcHz}: ${floorFacts.relAtFc.toFixed(2)} dB); raggedness 120 Hz ${floorFacts.ragAbove.toFixed(3)}, ${VALID_FROM_HZ} Hz ${floorFacts.ragAt.toFixed(3)}, 30 Hz ${floorFacts.ragBelow.toFixed(3)} dB; Keele ${keeleHz.toFixed(0)} Hz; FF-vloer ${ffFloorHz.toFixed(1)} Hz; NF-header venster ${nfHeader.rightWindowMs} − ${nfHeader.referenceTimeMs} ms`);
console.log(`splice: niveau ${merged.levelDb.toFixed(3)} dB, vertraging ${(merged.delayUs / 1000).toFixed(4)} ms, offset ${merged.offsetDeg.toFixed(1)}°, fase-residu ${merged.residualDeg.toFixed(2)}° rms, blend ${merged.blend[0].toFixed(1)}–${merged.blend[1].toFixed(1)} Hz`);
console.log(`CONTROLE 1 - splice-band |FF − (NF·shelf + niveau)| over ${SPLICE_BAND_HZ[0]}–${SPLICE_BAND_HZ[1]} Hz: mediaan ${spliceCheck.median.toFixed(3)} dB, p95 ${spliceCheck.p95.toFixed(3)}, max ${spliceCheck.max.toFixed(3)} (bereik ${spliceCheck.min.toFixed(2)}..+${spliceCheck.maxSigned.toFixed(2)} dB) - ${spliceCheck.p95 <= 0.5 ? 'p95 binnen ±0,5 dB' : 'p95 BUITEN ±0,5 dB'}`);

console.log(`CONTROLE 2 - stap-vorm in ${STEP_CHECK_BAND_HZ[0]}–${STEP_CHECK_BAND_HZ[1]} Hz (1/6-octaaf gegladd), de shelf van de mid tegen de empirische stap van elke woofer-merge (merged − NF − splice-gain uit zijn eigen kop):`);
const checkFreqs = [150, 175, 200, 250, 300, 350, 400];
console.log(`  f Hz      shelf mid  ${['woofer_up', 'woofer_down'].map((w) => w.padStart(12)).join('')}`);
const stepRows: Record<string, number[]> = {};
for (const w of ['up', 'down'] as const) {
  const mergedPath = join(CASUS1, `Koan_W_${w}_merged_ingespeeld_mild.frd`);
  const text = readFileSync(mergedPath, 'latin1');
  const m = parseFrd(text);
  const h = parseArtaHeader(parseTabular(text).comments);
  const gain = h.merge?.spliceGainDb;
  if (gain === undefined) throw new Error(`${mergedPath}: no splice gain in the block`);
  const n = parseFrd(readFileSync(join(CASUS1, `woofer_${w}_near.txt`), 'latin1'));
  const nOn = resample(n.freq, n.spl, n.phase, m.freq, { clampEdges: true });
  const emp = m.spl.map((v, i) => v - nOn.spl[i] - gain);
  stepRows[w] = checkFreqs.map((f) => smoothDb(m.freq, emp, 1 / 6, f));
}
const shelfAt = checkFreqs.map((f) => baffleStepShelfDb([f], STEP_HZ, STEP_DEPTH_DB)[0]);
checkFreqs.forEach((f, i) => {
  console.log(`  ${String(f).padStart(4)}     ${shelfAt[i].toFixed(2).padStart(8)}  ${stepRows.up[i].toFixed(2).padStart(12)}${stepRows.down[i].toFixed(2).padStart(12)}`);
});
for (const w of ['up', 'down'] as const) {
  const d = stepRows[w].map((v, i) => v - shelfAt[i]);
  const mean = d.reduce((a, b) => a + b, 0) / d.length;
  const spread = Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / d.length);
  console.log(`  woofer_${w}: empirische stap − shelf: gemiddeld ${mean >= 0 ? '+' : ''}${mean.toFixed(2)} dB, spreiding ${spread.toFixed(2)} dB, max |verschil| ${Math.max(...d.map(Math.abs)).toFixed(2)} dB - ${Math.max(...d.map(Math.abs)) <= 0.5 ? 'binnen ±0,5 dB' : 'NIET binnen ±0,5 dB'}`);
}

/* ---- controle (3): de sweep ongewijzigd ---------------------------------- */
const status = execSync('git status --porcelain -- test-fixtures/casus1/mid.lim', { cwd: join(HERE, '..') }).toString().trim();
console.log(`CONTROLE 3 - mid.lim: ${status === '' ? 'ongewijzigd (git status schoon)' : `GEWIJZIGD: ${status}`}`);
