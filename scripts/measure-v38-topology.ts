/**
 * V38 STAP 1 — DE TOPOLOGIE-DIFF: wat bouwt het handwerk dat de keten niet bouwt?
 *
 * `npx vite-node scripts/measure-v38-topology.ts` — seconden, geen ketenrun.
 *
 * Drukt drie dingen af, en de derde is de eigenlijke tabel:
 *  1. de gemeten aanleidingen die de INGEST al aflevert per driver (breakups,
 *     impedantiepieken/kastsoort, de semi-inductantiefit) — dit is de kolom
 *     "gemeten aanleiding" van de diff-tabel, en zij komt uit de metriek­
 *     bibliotheek en niet uit een lezing van het schema;
 *  2. de decompositie van HUIDIG in componentgroepen met hun functie;
 *  3. dezelfde decompositie over het LEVENDE v2-corpus, samengevat als
 *     "hoeveel van deze rolsoort draagt een KAND_V2 gemiddeld", zodat de
 *     kolom "aanwezig in KAND_V2" een telling is en geen indruk.
 *
 * NIETS HIERIN OORDEELT. Er staat geen drempel in, geen rangschikking en geen
 * aanbeveling: dat is stap 4, en die is een lijst voor Sander.
 */

import {
  CASUS1_WOOFER_DC_OHM,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import { deserializeFilter } from '../src/lib/filterFile.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CASUS1_DIR } from '../src/lib/engine2/casus1.fixture.ts';
import { buildReport, type ReportSettings } from '../src/lib/engine2/report.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';
import { FLAT_TARGET } from '../src/lib/engine2/requirements/targetCurve.ts';
import { decompose, groupEffect, type Group, type GroupRole } from './v38-groups.ts';
import { logspace, resampleImpedance } from '../src/lib/dsp.ts';
import type { Complex } from '../src/lib/complex.ts';

/** Punten op het karakteriseringsraster. Een TELLING, geen frequentie (P6):
 *  het bereik komt uit de meetbestanden zelf. Fijner dan het ketenraster,
 *  omdat een val van 0,2 octaaf breed op 96 punten twee punten dik is. */
const CHAR_GRID_POINTS = 600;

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const geometry = casus1Geometry(golden);

const SETTINGS: ReportSettings = {
  amplifierPowerW: 100,
  orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
  reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
  targetCurve: FLAT_TARGET,
};

const report = buildReport({
  manifest,
  files,
  filter: casus1Filter('HUIDIG', manifest, files, golden),
  geometry,
  settings: SETTINGS,
});

/* ---- 1. WAT DE INGEST AL AFLEIDT ---------------------------------------- */
console.log('=== gemeten aanleidingen per driver (uit de opnamepas) ===');
for (const d of report.ingest.drivers) {
  console.log(`\n${d.driver}`);
  console.log(
    `  R_e ${d.re ? `${d.re.ohm.toFixed(3)} Ω (${d.re.source})` : '—'}` +
      `   kast: ${d.impedance?.type ?? '—'}` +
      `   f_s ${d.impedance?.fundamentalHz?.toFixed(1) ?? '—'} Hz`,
  );
  const peaks = d.impedance?.peaks ?? [];
  console.log(
    `  impedantiepieken: ` +
      (peaks.length
        ? peaks
            .map(
              (p) =>
                `${p.fHz.toFixed(1)} Hz ${p.ohm.toFixed(1)} Ω Q${p.q?.toFixed(2) ?? '—'}` +
                `${p.motional ? '' : ' (flank)'}`,
            )
            .join('; ')
        : '—'),
  );
  const si = d.semiInductance;
  console.log(
    `  semi-inductantie: ` +
      (si
        ? `K=${si.k.toExponential(3)} n=${si.n.toFixed(3)} ` +
          `fit ${si.fitBandHz[0].toFixed(0)}–${si.fitBandHz[1].toFixed(0)} Hz ` +
          `${si.valid ? 'GELDIG' : `ONGELDIG — ${si.reason}`}`
        : '—'),
  );
  const b = d.breakups;
  console.log(
    `  breakups (band ${b ? `${b.bandHz[0].toFixed(0)}–${b.bandHz[1].toFixed(0)} Hz` : '—'}): ` +
      (b && b.peaks.length
        ? b.peaks
            .map(
              (p) =>
                `${p.fHz.toFixed(0)} Hz +${p.dB.toFixed(2)} dB Q${p.q?.toFixed(1) ?? '—'}` +
                `${p.belowFineDetailFloor ? '*' : ''}`,
            )
            .join('; ')
        : '—'),
  );
}
console.log(
  '\n(* = onder de fijnstructuurvloer 2/T: het NIVEAU mag geloofd worden, de vorm niet — V8c.)',
);

/* ---- 2. HUIDIG ONTLEED --------------------------------------------------- */
const parts = deserializeFilter(
  readFileSync(join(CASUS1_DIR, golden.manifest_en_geometrie.netlists.HUIDIG), 'utf-8'),
).parts;
const huidig = decompose(parts);

const byBranch = (gs: readonly Group[], b: string) =>
  gs.filter((g) => g.branch === b).sort((x, y) => x.depth - y.depth);

console.log('\n=== HUIDIG, ontleed in groepen ===');
for (const branch of report.driversLowToHigh) {
  console.log(`\n[${branch}]`);
  for (const g of byBranch(huidig, branch)) {
    console.log(
      `  d${g.depth} ${g.position.padEnd(6)} ${g.role.padEnd(12)} ${g.id.padEnd(16)} ` +
        `${g.composition}` +
        (g.fHz !== null ? `   → ${g.fHz.toFixed(0)} Hz${g.q !== null ? ` Q${g.q.toFixed(2)}` : ''}` : ''),
    );
  }
}
/* ---- 2b. WAT ELKE NIET-KERN-GROEP ELEKTRISCH DOET ----------------------- *
 *
 * Gemeten door het netwerk twee keer op te lossen. Alleen de groepen die GEEN
 * filterpool zijn: de vraag van V38 gaat over wat er naast de kern staat. */
const zFiles = manifest.entries
  .filter((e) => e.kind === 'Z')
  .map((e) => ({ driver: e.driver, file: files.find((f) => f.entry.file === e.file) }))
  .filter((x): x is { driver: string; file: NonNullable<typeof x.file> } => !!x.file?.impedance);
const zLo = Math.min(...zFiles.map((x) => x.file.impedance!.freq[0]));
const zHi = Math.max(
  ...zFiles.map((x) => x.file.impedance!.freq[x.file.impedance!.freq.length - 1]),
);
const charGrid = logspace(zLo, zHi, CHAR_GRID_POINTS);
const charZ: Record<string, Complex[]> = {};
for (const x of zFiles) {
  charZ[x.driver] = resampleImpedance(
    x.file.impedance!.freq,
    x.file.impedance!.magnitude,
    x.file.impedance!.phaseDeg,
    charGrid,
  ).z;
}

console.log(
  `\n=== wat elke NIET-KERN-groep in zijn eigen tak doet (raster ` +
    `${zLo.toFixed(0)}–${zHi.toFixed(0)} Hz, ${CHAR_GRID_POINTS} punten) ===`,
);
/**
 * De GEMETEN AANLEIDING naast het gemeten effect.
 *
 * Twee dingen worden opgezocht bij de frequentie waar een groep zijn grootste
 * werking heeft: de dichtstbijzijnde gedetecteerde breakup van dezelfde driver,
 * en de fundamentele impedantieresonantie van diezelfde driver. Beide komen uit
 * de opnamepas; er wordt hier niets gedetecteerd en niets gedrempeld. Een groep
 * waarvan de dichtstbijzijnde aanleiding een halve octaaf verderop ligt, KRIJGT
 * DAT ALS ANTWOORD — dat is precies de rij die stap 4 nodig heeft.
 */
const nearestCause = (
  driver: string,
  hz: number,
): { what: string; hz: number; octaves: number } | null => {
  const d = report.ingest.drivers.find((x) => x.driver === driver);
  if (!d) return null;
  const cands: { what: string; hz: number }[] = [];
  for (const b of d.breakups?.peaks ?? []) {
    cands.push({ what: `breakup +${b.dB.toFixed(2)} dB`, hz: b.fHz });
  }
  for (const pk of d.impedance?.peaks ?? []) {
    cands.push({ what: `Z-piek ${pk.ohm.toFixed(1)} Ω${pk.motional ? '' : ' (flank)'}`, hz: pk.fHz });
  }
  if (!cands.length) return null;
  let best = cands[0];
  for (const c of cands) {
    if (Math.abs(Math.log2(c.hz / hz)) < Math.abs(Math.log2(best.hz / hz))) best = c;
  }
  return { what: best.what, hz: best.hz, octaves: Math.log2(best.hz / hz) };
};

const effectTable = (name: string, ps: readonly typeof parts[number][]) => {
  console.log(`\n--- ${name} ---`);
  console.log(
    '| groep | tak | rol | samenstelling | Δ doorlaatband (dB) | piek Δ (dB) | bij (Hz) | ' +
      'breedte (okt) | dichtstbijzijnde gemeten aanleiding |',
  );
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const g of decompose(ps).filter((x) => x.role !== 'pole').sort((a, b) => a.depth - b.depth)) {
    const eff = groupEffect(ps, g, charGrid, charZ);
    const cause = eff ? nearestCause(g.branch, eff.peakHz) : null;
    console.log(
      `| ${g.id} | ${g.branch} | ${g.role} | ${g.composition} | ` +
        `${eff ? eff.passbandDb.toFixed(2) : '—'} | ${eff ? eff.peakDb.toFixed(2) : '—'} | ` +
        `${eff ? eff.peakHz.toFixed(0) : '—'} | ${eff ? eff.widthOct.toFixed(2) : '—'} | ` +
        `${cause ? `${cause.what} @ ${cause.hz.toFixed(0)} Hz (${cause.octaves >= 0 ? '+' : ''}${cause.octaves.toFixed(2)} okt)` : '—'} |`,
    );
  }
};

for (const key of ['HUIDIG', 'KAND_A', 'KAND_B']) {
  const ps =
    key === 'HUIDIG'
      ? parts
      : deserializeFilter(
          readFileSync(join(CASUS1_DIR, golden.manifest_en_geometrie.netlists[key]), 'utf-8'),
        ).parts;
  effectTable(key, ps);
}

const orphan = huidig.filter((g) => !report.driversLowToHigh.includes(g.branch));
if (orphan.length) {
  console.log('\n[geen tak toegewezen]');
  for (const g of orphan) console.log(`  ${g.id} ${g.role} ${g.composition}`);
}

/* ---- 3. HETZELFDE OVER HET LEVENDE v2-CORPUS ----------------------------- */
const liveKeys = Object.keys(golden.manifest_en_geometrie.netlists).filter((k) =>
  /^KAND_V2_\d+$/.test(k),
);
console.log(`\n=== rolverdeling: HUIDIG naast het levende corpus (${liveKeys.length} netlists) ===`);

const ROLES: GroupRole[] = [
  'pole',
  'trap',
  'damped-trap',
  'zobel',
  'shunt-shelf',
  'series-pad',
  'shunt-pad',
  'other',
];

const countRoles = (gs: readonly Group[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const r of ROLES) out[r] = 0;
  for (const g of gs) out[g.role] = (out[g.role] ?? 0) + 1;
  return out;
};

const liveCounts = liveKeys.map((k) => {
  const p = deserializeFilter(
    readFileSync(join(CASUS1_DIR, golden.manifest_en_geometrie.netlists[k]), 'utf-8'),
  ).parts;
  return { key: k, groups: decompose(p) };
});

const hCount = countRoles(huidig);
console.log('| rol | HUIDIG | KAND_V2 min–max | KAND_V2 gemiddeld | netlists met ≥1 |');
console.log('|---|---|---|---|---|');
for (const r of ROLES) {
  const per = liveCounts.map((c) => countRoles(c.groups)[r]);
  const withAny = per.filter((n) => n > 0).length;
  const avg = per.reduce((a, b) => a + b, 0) / per.length;
  console.log(
    `| ${r} | ${hCount[r]} | ${Math.min(...per)}–${Math.max(...per)} | ${avg.toFixed(1)} | ` +
      `${withAny} van ${per.length} |`,
  );
}

/* De vallen apart, want hun FREQUENTIE is de hele vraag: een val die niet op
 * een gemeten aanleiding staat, staat nergens op. */
console.log('\n=== elke (gedempte) val in het corpus, met zijn frequentie ===');
for (const { key, groups } of [{ key: 'HUIDIG', groups: huidig }, ...liveCounts]) {
  const traps = groups.filter((g) => g.role === 'trap' || g.role === 'damped-trap');
  console.log(
    `  ${key.padEnd(12)} ${
      traps.length
        ? traps
            .map(
              (t) =>
                `${t.branch}:${t.fHz?.toFixed(0)} Hz` +
                `${t.q !== null ? ` Q${t.q.toFixed(2)}` : ''}`,
            )
            .join('; ')
        : '—'
    }`,
  );
}

console.log(`\nonderdelen: HUIDIG ${parts.filter((p) => p.partId && p.type !== 'Driver' && p.type !== 'Generator').length}`);
for (const { key } of liveCounts) {
  const p = deserializeFilter(
    readFileSync(join(CASUS1_DIR, golden.manifest_en_geometrie.netlists[key]), 'utf-8'),
  ).parts;
  console.log(
    `            ${key} ${p.filter((x) => x.partId && x.type !== 'Driver' && x.type !== 'Generator').length}`,
  );
}
