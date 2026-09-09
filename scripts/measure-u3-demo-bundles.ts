/**
 * U-3 STEP 1 — WHAT THE TWO DEMO BUNDLES CARRY, AND WHAT THE APP CAN READ OF IT.
 *
 * Seconds, no chain run and no tune. Two tables, and they answer the two halves
 * of the diagnosis separately, because they have separate causes.
 *
 * TABLE 1 — THE MEASUREMENT FILES. Per file of each bundle (and, beside them,
 * casus 1b's own files): does it state a window a reader can find? Both readers
 * are asked, because the app has two and they matched on nothing until P-1 —
 * `readGateHeader`/`readMergeBlock` (the v1 layer, what `sourceMeta` and hence
 * `refuseIfUnverified` consult) and `parseArtaHeader` (engine2, by field name).
 * A file that answers `absent` to the first is a file the app refuses to
 * optimise on, and a demo that refuses its own route is the bug.
 *
 * TABLE 2 — THE PROJECT STATE. Every row of the I-1 register that a BUNDLE can
 * carry, against what each bundle actually holds. The three-way bundle is a
 * data module and is read directly; the two-way one is inlined in `App.tsx`, so
 * its values are read out of that source (a scan, the UI-1 idiom — there is no
 * other way to read a loader that only exists inside a React component, and
 * that inlining is itself half of the finding).
 *
 * Writes `test-fixtures/demo_u3_bundels.json`. The GUARDS do not read that
 * file: they assert the same two facts straight off the bundles
 * (`demoBundle.test.ts`), so the record here is evidence for the casebook and
 * never the thing a test believes.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrd } from '../src/lib/parsers/frd.ts';
import { parseTabular } from '../src/lib/parsers/tabular.ts';
import { readGateHeader, readMergeBlock, dataFloorFromGateMs, DEFAULT_GATE_TAPER_ALPHA } from '../src/lib/xoWindow.ts';
import { declaredMergeValidity } from '../src/lib/sourceMeta.ts';
import { parseArtaHeader } from '../src/lib/engine2/ingest/manifest.ts';
import { V2_INPUT_REGISTER, rowsOfClass } from '../src/lib/v2InputRegister.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIX = join(ROOT, 'src', 'lib', 'parsers', 'fixtures');
const CASUS1 = join(ROOT, 'test-fixtures', 'casus1');
const OUT = join(ROOT, 'test-fixtures', 'demo_u3_bundels.json');

/** What a single measurement file states about its own validity, both readers. */
export interface FileValidity {
  file: string;
  /** 'parsed' | 'unparseable' | 'absent' — the v1 window reader. */
  v1Gate: string;
  v1GateMs: number | null;
  /** The v1 merge-block reader: the kind, or null when the file declares none. */
  v1Merge: string | null;
  v1ValidFromHz: number | null;
  /** The floor the app would put on this file, and where it came from. */
  floorHz: number | null;
  floorFrom: 'gate' | 'merge-block' | 'none';
  /** engine2, by field name: does it find the same window/merge? */
  e2RefTimeMs: number | null;
  e2RightWindowMs: number | null;
  e2Merge: string | null;
  e2ValidFromHz: number | null;
  points: number;
  rangeHz: [number, number];
}

function validityOf(file: string, text: string): FileValidity {
  const frd = parseFrd(text);
  const { comments } = parseTabular(text);
  const gr = readGateHeader(text);
  const mb = readMergeBlock(text);
  const top = frd.freq[frd.freq.length - 1];
  const bottom = frd.freq[0];
  const h = parseArtaHeader(comments);

  let floorHz: number | null = null;
  let floorFrom: FileValidity['floorFrom'] = 'none';
  if (mb) {
    const mv = declaredMergeValidity(mb, { fromHz: bottom, toHz: top }).validity;
    if (mv.fromHz !== null) {
      floorHz = mv.fromHz;
      floorFrom = 'merge-block';
    }
  }
  if (floorHz === null && gr.kind === 'parsed') {
    floorHz = dataFloorFromGateMs(gr.gateMs, gr.alpha ?? DEFAULT_GATE_TAPER_ALPHA);
    floorFrom = 'gate';
  }

  return {
    file,
    v1Gate: gr.kind,
    v1GateMs: gr.kind === 'parsed' ? gr.gateMs : null,
    v1Merge: mb ? mb.kind : null,
    v1ValidFromHz: mb ? mb.validFromHz : null,
    floorHz,
    floorFrom,
    e2RefTimeMs: h.referenceTimeMs ?? null,
    e2RightWindowMs: h.rightWindowMs ?? null,
    e2Merge: h.merge ? h.merge.kind : null,
    e2ValidFromHz: h.statedValidity?.fromHz ?? null,
    points: frd.freq.length,
    rangeHz: [bottom, top],
  };
}

const read = (p: string) => readFileSync(p, 'utf-8');

/* ---------------------------------------------------------------- *
 * Table 1
 * ---------------------------------------------------------------- */

/** The two-way demo's far fields, as `App.tsx` imports them today. */
const TWO_WAY_TODAY = [
  'mid_hor0_mettape.txt', 'mid_hor15_mettape.txt', 'mid_hor30_mettape.txt',
  'mid_hor45_mettape.txt', 'mid_hor60_mettape.txt', 'mid_hor75_mettape.txt',
  'tweet_hor0_mettape.txt', 'tweet_hor15_mettape.txt', 'tweet_hor30_mettape.txt',
  'tweet_hor45_mettape.txt', 'tweet_hor60_mettape.txt', 'tweet_hor75_mettape.txt',
];

/** The three-way demo's far fields and near fields (its impedances are ZMA). */
const THREE_WAY = [
  'woofer-pair-hor0.frd', 'woofer-pair-hor15.frd', 'woofer-pair-hor30.frd',
  'woofer-pair-hor45.frd', 'woofer-pair-hor60.frd',
  'mid-hor0.txt', 'mid-hor15.txt', 'mid-hor30.txt', 'mid-hor45.txt', 'mid-hor60.txt',
  'tweeter-hor0.txt', 'tweeter-hor15.txt', 'tweeter-hor30.txt', 'tweeter-hor45.txt', 'tweeter-hor60.txt',
  'woofer-near.txt', 'mid-near.txt', 'port-near.txt',
];

/** Casus 1b's own measurement files (its manifest, merged set). */
const CASUS1B = ['Koan_M_merged.frd', 'mid_hor_30.txt', 'tweeter_hor_0.txt', 'mid_near.txt', 'mid_hor_0.txt'];

/** The two-way bundle as U-3 rebuilt it. */
const TWO_WAY_NOW = ['mid-merged-hor0.frd', 'mid-hor30.txt', 'tweeter-hor0.txt', 'mid-near.txt'];

const table1 = {
  tweeweg_demo_voor_U3: TWO_WAY_TODAY.map((f) => validityOf(f, read(join(FIX, f)))),
  tweeweg_demo_na_U3: TWO_WAY_NOW.map((f) => validityOf(f, read(join(FIX, 'koan-2way', f)))),
  drieweg_demo: THREE_WAY.map((f) => validityOf(f, read(join(FIX, 'koan-3way', f)))),
  casus1b: CASUS1B.map((f) => validityOf(f, read(join(CASUS1, f)))),
};

/* ---------------------------------------------------------------- *
 * Table 2
 * ---------------------------------------------------------------- */

/**
 * The register rows a demo BUNDLE can carry at all. The rest are either the
 * viewer's own preference, a run control with a published default, or a v1
 * knob — none of them belongs in a measurement session.
 */
export const BUNDLE_BEARABLE: readonly string[] = [
  'responses', 'validity', 'impedance', 'ways', 'positions', 'sd', 'baffle-width',
  'blTm', 'mmsG', 'xmaxMm', 'driveVoltageV', 'coilFamily',
  'nearFieldCone', 'nearFieldPort', 'spliceBand', 'mergeValidFrom', 'measuredRe',
  'rotSym', 'acousticCentre', 'wiring', 'nominalSize',
  'ampMinLoadOhm', 'maxDriveOnFsDb', 'driveOnFsMaxDb-per-way',
  'amplifierPeakPowerW', 'amplifierNominalLoadOhm', 'xmaxMarginFraction',
  'amplifierPowerW', 'resistorClassW', 'resistorPowerMargin', 'coilClassA',
  'resistorThermalPowerW', 'lowestWayLevelWork', 'lowestWaySeriesRMaxOhm',
  'targetCurve', 'plateauDepthDb',
];

/**
 * WHAT THE TWO-WAY LOADER SET BEFORE U-3, recorded once. It cannot be measured
 * again: that loader was forty lines of `setState` inlined in `App.tsx` and it
 * is gone. The numbers below are what the first run of this script read out of
 * that source on 09-09-2026, and they are the "before" half of every count in
 * casebook U-3.
 */
const TWO_WAY_BEFORE_U3: Record<string, string> = {
  responses: '12 files, 2 ways',
  validity: 'NONE — no header on any file',
  impedance: '2 ZMA (through a vxp project)',
  ways: '2',
  positions: 'yes',
  sd: '2/3',
  'baffle-width': '260 mm',
  xmaxMm: '2/3',
  acousticCentre: 'depthMm on the cabinet form',
};

/** What a bundle carries today, in the register's own vocabulary. */
async function carriedNow(): Promise<Record<string, Record<string, boolean>>> {
  const [two, three, bundle] = await Promise.all([
    import('../src/demo2way.ts'),
    import('../src/demo3way.ts'),
    import('../src/lib/demoBundle.ts'),
  ]);
  return {
    tweeweg: bundle.bundleCarries(two.KOAN_2WAY_DEMO),
    drieweg: bundle.bundleCarries(three.KOAN_3WAY_BUNDLE),
  };
}

/* ---------------------------------------------------------------- *
 * Print
 * ---------------------------------------------------------------- */

const pad = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
const num = (v: number | null, d = 1) => (v === null ? '—' : v.toFixed(d));

function printTable1(name: string, rows: FileValidity[]): void {
  console.log(`\n### ${name}`);
  console.log(
    pad('file', 32) + pad('v1 window', 13) + pad('v1 merge', 10) +
    pad('floor Hz', 10) + pad('from', 13) + pad('e2 ref/right ms', 18) + pad('e2 merge', 10) + 'pts / range',
  );
  for (const r of rows) {
    console.log(
      pad(r.file, 32) + pad(r.v1Gate, 13) + pad(r.v1Merge ?? '—', 10) +
      pad(num(r.floorHz), 10) + pad(r.floorFrom, 13) +
      pad(`${num(r.e2RefTimeMs, 3)} / ${num(r.e2RightWindowMs, 3)}`, 18) +
      pad(r.e2Merge ?? '—', 10) +
      `${r.points} / ${r.rangeHz[0].toFixed(1)}–${r.rangeHz[1].toFixed(0)}`,
    );
  }
}

const main = async () => {
  console.log('U-3 — DE TWEE DEMOBUNDELS GEMETEN\n');
  console.log('TABEL 1 — WAT ELK MEETBESTAND OVER ZIJN EIGEN GELDIGHEID ZEGT');
  printTable1('tweeweg-demo VÓÓR U-3 (het KOAN-prototype van 2023)', table1.tweeweg_demo_voor_U3);
  printTable1('tweeweg-demo NÁ U-3 (casus 1b)', table1.tweeweg_demo_na_U3);
  printTable1('drieweg-demo', table1.drieweg_demo);
  printTable1('casus 1b (de bron voor de herbouw)', table1.casus1b);

  const refused = table1.tweeweg_demo_voor_U3.filter((r) => r.floorFrom === 'none');
  console.log(
    `\n  → tweeweg VÓÓR: ${refused.length} van ${table1.tweeweg_demo_voor_U3.length} bestanden zonder leesbare geldigheid; ` +
      `de Filter-sectie weigerde de run zolang er één in een gevulde rol zat.`,
  );
  const okNow = table1.tweeweg_demo_na_U3.filter((r) => r.floorFrom !== 'none').length;
  console.log(`  → tweeweg NÁ: ${okNow} van ${table1.tweeweg_demo_na_U3.length} met een leesbare geldigheid.`);
  const ok3 = table1.drieweg_demo.filter((r) => r.floorFrom !== 'none').length;
  console.log(`  → drieweg: ${ok3} van ${table1.drieweg_demo.length} met een leesbare geldigheid.`);

  const now = await carriedNow();
  console.log('\n\nTABEL 2 — I-1-REGISTERVELD × BUNDEL (wat de bundel DRAAGT, niet wat de app toont)');
  console.log(
    pad('register-rij', 26) + pad('klasse', 11) + pad('tweeweg vóór U-3', 32) + pad('tweeweg ná U-3', 16) + 'drieweg',
  );
  for (const id of BUNDLE_BEARABLE) {
    const row = V2_INPUT_REGISTER.find((r) => r.id === id);
    console.log(
      pad(id, 26) +
        pad(row?.cls ?? '(not a row)', 11) +
        pad(TWO_WAY_BEFORE_U3[id] ?? 'no', 32) +
        pad(now.tweeweg[id] ? 'yes' : 'no', 16) +
        (now.drieweg[id] ? 'yes' : 'no'),
    );
  }
  const count = (m: Record<string, boolean>, ids: readonly string[]) => ids.filter((i) => m[i]).length;
  const before = BUNDLE_BEARABLE.filter((id) => (TWO_WAY_BEFORE_U3[id] ?? 'no') !== 'no').length;
  console.log(
    `\n  → draagbare registervelden: tweeweg ${before} → ${count(now.tweeweg, BUNDLE_BEARABLE)} van ${BUNDLE_BEARABLE.length}; ` +
      `drieweg ${count(now.drieweg, BUNDLE_BEARABLE)}.`,
  );
  for (const cls of ['required', 'judgement', 'nice'] as const) {
    const ids = rowsOfClass(cls)
      .map((r) => r.id)
      .filter((id) => BUNDLE_BEARABLE.includes(id));
    const b = ids.filter((id) => (TWO_WAY_BEFORE_U3[id] ?? 'no') !== 'no').length;
    console.log(
      `     ${pad(cls, 10)} tweeweg ${b}/${ids.length} → ${count(now.tweeweg, ids)}/${ids.length}   drieweg ${count(now.drieweg, ids)}/${ids.length}`,
    );
  }

  writeFileSync(
    OUT,
    JSON.stringify(
      {
        _: 'U-3 — geschreven door scripts/measure-u3-demo-bundles.ts. Tabel 1: wat elk meetbestand van elke demobundel over zijn eigen geldigheid zegt, door beide lezers van de app. Tabel 2: welke I-1-registervelden een bundel kan dragen en welke elke bundel draagt. De kolom "tweeweg vóór U-3" is een GEDATEERD record (09-09-2026): die loader bestond uit setState-regels in App.tsx en is bij U-3 vervangen, dus zij is niet opnieuw te meten.',
        gemeten_op: new Date().toISOString().slice(0, 10),
        tabel_1_bestanden: table1,
        tabel_2_registervelden: {
          draagbaar: BUNDLE_BEARABLE,
          tweeweg_voor_U3: TWO_WAY_BEFORE_U3,
          tweeweg_na_U3: now.tweeweg,
          drieweg: now.drieweg,
        },
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`\nGeschreven: ${OUT}`);
};

await main();
