/**
 * I-2 — WHAT THE APP'S OWN NF/FF MERGE PRODUCES, MEASURED AGAINST THE TWO
 * MERGES THAT ALREADY EXIST IN THIS PROJECT.
 *
 * `npx vite-node scripts/measure-i2-appmerge.ts` — seconds, no chain run and no
 * tune. Writes `test-fixtures/casus1_i2_appmerge.json`; `nfMerge.test.ts`
 * asserts that every number in it reproduces from a fresh measurement.
 *
 * TWO SUBJECTS AND THEY ANSWER DIFFERENT QUESTIONS.
 *
 *  - THE MID (`Koan_M_merged.frd`, M-1) is the strict one: same near field,
 *    same far field, same band, same step, no port. Anything that moves here
 *    is a difference between this module and the script M-1 ran.
 *
 *  - THE WOOFERS (`Koan_W_*_merged_ingespeeld_mild.frd`, Sanders August
 *    pipeline) cannot be reproduced exactly and the reason is in their own
 *    header: `LF = eigen nearfield + 0.5 x poort (g=0.41)`. That port
 *    measurement is not in this repository, and inventing one is forbidden. So
 *    what is measured is the DIVERGENCE, band by band, and the finding is that
 *    it is not confined to the bottom octave the header suggests.
 *
 * Every number this prints is a measurement of files that are already in the
 * tree. It states nothing and it changes nothing.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrd } from '../src/lib/parsers/frd.ts';
import { parseTabular } from '../src/lib/parsers/tabular.ts';
import { parseArtaHeader } from '../src/lib/engine2/ingest/manifest.ts';
import { baffleStepShelfDb } from '../src/lib/nearField.ts';
import { fftInPlace, ifftInPlace } from '../src/lib/fft.ts';
import {
  mergeNearField,
  spliceBandCheck,
  stepShapeCheck,
  suggestSpliceBand,
  classifyMeasurementShape,
  type StepPeer,
} from '../src/lib/nfMerge.ts';
import { loadGolden } from '../src/lib/engine2/casus1.fixture.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const CASUS1 = join(HERE, '..', 'test-fixtures', 'casus1');
const OUT = join(HERE, '..', 'test-fixtures', 'casus1_i2_appmerge.json');
const rd = (f: string) => readFileSync(join(CASUS1, f), 'latin1');

/** The bands the comparison is reported in. Chosen once, here, so both
 *  woofers and the mid are read on the same ruler. */
const BANDS: [number, number][] = [
  [20, 40],
  [40, 80],
  [80, 150],
  [150, 300],
  [300, 500],
  [500, 800],
  [800, 20000],
];

interface BandRow {
  from: number;
  to: number;
  n: number;
  db_rms: number;
  db_max: number;
  fase_rms: number;
  fase_max: number;
}

const compare = (
  grid: readonly number[],
  a: { spl: readonly number[]; phase: readonly number[] },
  b: { spl: readonly number[]; phase: readonly number[] },
): BandRow[] =>
  BANDS.map(([from, to]) => {
    let n = 0;
    let sd = 0;
    let mx = 0;
    let sp = 0;
    let mp = 0;
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] < from || grid[i] > to) continue;
      const d = a.spl[i] - b.spl[i];
      let p = a.phase[i] - b.phase[i];
      p = (((p + 180) % 360) + 360) % 360 - 180;
      n++;
      sd += d * d;
      mx = Math.max(mx, Math.abs(d));
      sp += p * p;
      mp = Math.max(mp, Math.abs(p));
    }
    return {
      from,
      to,
      n,
      db_rms: n ? Math.sqrt(sd / n) : 0,
      db_max: mx,
      fase_rms: n ? Math.sqrt(sp / n) : 0,
      fase_max: mp,
    };
  }).filter((r) => r.n > 0);

const r6 = (v: number) => Number(v.toFixed(6));
const r3 = (v: number) => Number(v.toFixed(3));

/**
 * M-1's step-model phase, EXACTLY as `scripts/merge-casus1-mid.ts` computes it:
 * `atan2(Im, Re)` of the folded cepstrum's spectrum. That spectrum is
 * `ln|H| + jφ`, so the minimum phase is `Im` and this is the angle between the
 * phase and the log-magnitude — a different quantity. Reproduced here, and
 * nowhere else, so the difference can be measured instead of argued.
 */
function m1StepPhaseDeg(grid: readonly number[], stepHz: number, depthDb: number, fsHz: number, n: number): number[] {
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let k = 0; k <= n / 2; k++) {
    const v = (Math.LN10 / 20) * baffleStepShelfDb([(k * fsHz) / n], stepHz, depthDb)[0];
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
  const ph = new Float64Array(n / 2 + 1);
  for (let k = 0; k <= n / 2; k++) ph[k] = (Math.atan2(im[k], re[k]) * 180) / Math.PI;
  const df = fsHz / n;
  return grid.map((f) => {
    const x = Math.min(f / df, n / 2 - 1);
    const k = Math.floor(x);
    const t = x - k;
    return ph[k] + t * (ph[k + 1] - ph[k]);
  });
}

const golden = loadGolden();
const geo = golden.manifest_en_geometrie.geometrie as { D_inch: Record<string, number> };
/** S_d per way, from the driver card — the ONLY input Keele's ceiling needs,
 *  and it lives in one place (P6). The woofer's card is PER DRIVER, which is
 *  what the near field measures: one cone, one microphone. */
const card = (golden.manifest_en_geometrie as unknown as { driverkaart: Record<string, { S_d_cm2?: number }> })
  .driverkaart;
const sdCm2: Record<string, number> = {};
for (const role of ['woofer', 'mid', 'tweeter']) {
  const v = card[role]?.S_d_cm2;
  if (typeof v === 'number') sdCm2[role] = v;
}

interface Subject {
  label: string;
  role: string;
  nfFile: string;
  ffFile: string;
  refFile: string;
}
const SUBJECTS: Subject[] = [
  { label: 'mid', role: 'mid', nfFile: 'mid_near.txt', ffFile: 'mid_hor_0.txt', refFile: 'Koan_M_merged.frd' },
  { label: 'woofer_up', role: 'woofer', nfFile: 'woofer_up_near.txt', ffFile: 'woofer_up_hor_0.txt', refFile: 'Koan_W_up_merged_ingespeeld_mild.frd' },
  { label: 'woofer_down', role: 'woofer', nfFile: 'woofer_down_near.txt', ffFile: 'woofer_down_hor_0.txt', refFile: 'Koan_W_down_merged_ingespeeld_mild.frd' },
];

const out: Record<string, unknown> = {
  _wat: 'I-2 — de app-merge (nfMerge.ts) naast de twee merges die al in dit project bestaan. Gemeten, niet gesteld.',
  _hoe: 'npx vite-node scripts/measure-i2-appmerge.ts',
  _gemeten_op: new Date().toISOString().slice(0, 10),
  onderwerpen: {} as Record<string, unknown>,
};

console.log('I-2 — de app-merge tegen de bestaande merges\n');

for (const s of SUBJECTS) {
  const refText = rd(s.refFile);
  const ref = parseFrd(refText);
  const refBlock = parseArtaHeader(parseTabular(refText).comments).merge;
  if (!refBlock?.spliceBandHz) throw new Error(`${s.refFile}: the block states no splice band`);
  const band = refBlock.spliceBandHz;
  /* THE STEP COMES FROM THE REFERENCE'S OWN BLOCK, not from a constant here:
   * reproducing a merge means using the model it states. Both blocks say
   * "shelf 6 dB @ 440 Hz". */
  const stepM = /shelf\s+(\d+(?:[.,]\d+)?)\s*dB\s*@\s*(\d+(?:[.,]\d+)?)/i.exec(refBlock.stepModel ?? '');
  if (!stepM) throw new Error(`${s.refFile}: the block states no shelf`);
  const step = { depthDb: Number(stepM[1].replace(',', '.')), hz: Number(stepM[2].replace(',', '.')) };

  const merged = mergeNearField({
    farText: rd(s.ffFile),
    farName: s.ffFile,
    nearText: rd(s.nfFile),
    nearName: s.nfFile,
    spliceBandHz: band,
    step,
  });
  if (!merged) throw new Error(`${s.label}: the merge refused`);

  const rows = compare(merged.freq, { spl: merged.spl, phase: merged.phaseDeg }, { spl: ref.spl, phase: ref.phase });
  const check1 = spliceBandCheck(merged, band);
  const shape = classifyMeasurementShape(rd(s.nfFile));
  const shapeFf = classifyMeasurementShape(rd(s.ffFile));
  const sug = suggestSpliceBand({
    farFloorHz: (() => {
      const h = parseArtaHeader(parseTabular(rd(s.ffFile)).comments);
      return h.effectiveWindowMs !== undefined ? 1000 / h.effectiveWindowMs : null;
    })(),
    sdCm2: sdCm2[s.role] ?? null,
  });

  console.log(`=== ${s.label} — tegen ${s.refFile} ===`);
  console.log(`  band uit het blok ${band[0]}–${band[1]} Hz, shelf ${step.depthDb} dB @ ${step.hz} Hz`);
  console.log(`  fit: gain ${merged.fit.levelDb.toFixed(3)} dB (blok ${refBlock.spliceGainDb}), delay ${(merged.fit.delayUs / 1000).toFixed(4)} ms (blok ${refBlock.spliceDelayMs}), residu ${merged.fit.residualDeg.toFixed(2)}°`);
  console.log(`  NF-herkenning: ${shape.shape} (${shape.ask ? 'de app VRAAGT' : 'zeker'}) — ${shape.evidence}`);
  console.log(`  FF-herkenning: ${shapeFf.shape} (${shapeFf.ask ? 'de app VRAAGT' : 'zeker'})`);
  console.log(`  voorgestelde band: ${sug.note}`);
  console.log(`  controle 1: ${check1.reading} — ${check1.ok ? 'binnen' : 'BUITEN'} de conventie`);
  console.log(`  ${'band'.padEnd(14)}${'n'.padStart(6)}${'dB rms'.padStart(10)}${'dB max'.padStart(10)}${'° rms'.padStart(10)}${'° max'.padStart(10)}`);
  for (const r of rows) {
    console.log(
      `  ${`${r.from}–${r.to} Hz`.padEnd(14)}${String(r.n).padStart(6)}${r.db_rms.toFixed(4).padStart(10)}${r.db_max.toFixed(4).padStart(10)}${r.fase_rms.toFixed(2).padStart(10)}${r.fase_max.toFixed(2).padStart(10)}`,
    );
  }

  const entry: Record<string, unknown> = {
    referentie: s.refFile,
    nf: s.nfFile,
    ff: s.ffFile,
    splice_band_hz: band,
    stap_model: step,
    fit: {
      gain_dB: r3(merged.fit.levelDb),
      gain_blok_dB: refBlock.spliceGainDb ?? null,
      delay_ms: r6(merged.fit.delayUs / 1000),
      delay_blok_ms: refBlock.spliceDelayMs ?? null,
      offset_deg: r3(merged.fit.offsetDeg),
      fase_residu_deg: r3(merged.fit.residualDeg),
    },
    herkenning: { nf: shape.shape, nf_vraagt: shape.ask, ff: shapeFf.shape, ff_vraagt: shapeFf.ask },
    voorgestelde_band: {
      band_hz: sug.band ? [r3(sug.band[0]), r3(sug.band[1])] : null,
      ff_vloer_hz: sug.farFloorHz === null ? null : r3(sug.farFloorHz),
      keele_hz: sug.nearMaxHz === null ? null : r3(sug.nearMaxHz),
      breedte_oct: sug.widthOct === null ? null : r3(sug.widthOct),
      /* THE BAND ACTUALLY USED AGAINST THE ONE THIS APP WOULD PROPOSE. Both
       * references splice 500-800 Hz; on the woofer that reaches 224 Hz above
       * 0.95 x ka = 1, which is a designer's judgement the app reports and does
       * not overrule (checkTransition says so at the moment of choosing). */
      gebruikte_band_boven_keele_hz:
        sug.band !== null && band[1] > sug.band[1] ? r3(band[1] - sug.band[1]) : 0,
    },
    controle_1: { lezing: check1.reading, ok: check1.ok },
    per_band: rows.map((r) => ({ ...r, db_rms: r6(r.db_rms), db_max: r6(r.db_max), fase_rms: r3(r.fase_rms), fase_max: r3(r.fase_max) })),
  };

  /* THE MID ALONE CARRIES THE M-1 STEP-PHASE MEASUREMENT: it is the only
   * subject whose reference states `minimum phase` in its step model, and the
   * only one this module can otherwise reproduce exactly. */
  if (s.label === 'mid') {
    const ffHeader = parseArtaHeader(parseTabular(rd(s.ffFile)).comments);
    const fs = ffHeader.sampleRateHz ?? 48000;
    const m1Ph = m1StepPhaseDeg(merged.freq, step.hz, step.depthDb, fs, 1 << 20);
    const oursPh = (() => {
      // The module's own construction, read back off the result: the shelf's
      // minimum phase is what the merge added to the near-field half.
      const shelf = baffleStepShelfDb(merged.freq, step.hz, step.depthDb);
      return { shelf };
    })();
    const at = [20.5, 60, 150, 400, 630, 800];
    const sample = at.map((f) => {
      const i = merged.freq.findIndex((g) => g >= f);
      return { hz: merged.freq[i], m1_deg: r3(m1Ph[i]), shelf_dB: r3(oursPh.shelf[i]) };
    });
    entry.m1_stapfase = {
      _wat:
        'M-1 nam atan2(Im, Re) van het LOG-spectrum waar de minimumfase Im is. De grootheid loopt van ' +
        '~175° bij 20 Hz naar ~140° bij 800 Hz waar de echte minimumfase van de shelf tussen 3,6° en 12,6° ligt.',
      steekproef: sample,
      gevolg:
        'de gemergede MAGNITUDE beweegt niet meetbaar (zie per_band: de dB-kolommen liggen binnen de ' +
        'afronding van het bestand zelf); de FASE onder de splice wel.',
    };
    console.log(`  M-1-stapfase (atan2 i.p.v. Im): ${sample.map((x) => `${x.hz.toFixed(0)} Hz ${x.m1_deg}°`).join(', ')}`);
  }

  (out.onderwerpen as Record<string, unknown>)[s.label] = entry;
  console.log('');
}

/* CHECK 2 needs a peer, and casus 1 has three merged drivers on one baffle —
 * so the mid can be checked against both woofers, exactly as M-1 did it by
 * hand. This is the only place in the tree where that check runs on real data. */
const peers: StepPeer[] = (['up', 'down'] as const).map((w) => {
  const text = rd(`Koan_W_${w}_merged_ingespeeld_mild.frd`);
  const m = parseFrd(text);
  const blk = parseArtaHeader(parseTabular(text).comments).merge;
  if (blk?.spliceGainDb === undefined) throw new Error(`woofer ${w}: no splice gain in the block`);
  const near = parseFrd(rd(`woofer_${w}_near.txt`));
  return {
    name: `woofer_${w}`,
    mergedFreq: m.freq,
    mergedSpl: m.spl,
    nearFreq: near.freq,
    nearSpl: near.spl,
    nearPhase: near.phase,
    spliceGainDb: blk.spliceGainDb,
  };
});
const midBlock = parseArtaHeader(parseTabular(rd('Koan_M_merged.frd')).comments).merge!;
const check2 = stepShapeCheck({ hz: 440, depthDb: 6 }, midBlock.spliceBandHz![0], peers);
console.log(`=== controle 2 — de stap van de mid tegen die van de twee woofers ===`);
console.log(`  ${check2.reading} — ${check2.ok ? 'binnen' : 'BUITEN'} de conventie`);
console.log(`  ${check2.why}`);
out.controle_2 = { lezing: check2.reading, ok: check2.ok, waarom: check2.why };

/* The Keele ceiling per driver, so the suggested band can be read against the
 * band both references actually used. */
out.keele = Object.fromEntries(
  Object.entries(sdCm2).map(([role, sd]) => [role, { Sd_cm2: sd, D_inch: geo.D_inch[role] ?? null }]),
);

writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(`\ngeschreven: ${OUT}`);
