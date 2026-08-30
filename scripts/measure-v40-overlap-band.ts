/**
 * V40 — WAARÓM DE TWEE FASEMATEN VERSCHILLEN: HET OVERLAPVENSTER, PUNT VOOR PUNT.
 *
 * `npx vite-node scripts/measure-v40-overlap-band.ts [SLEUTEL ...]` — seconden,
 * geen ketenrun en geen enkele tune. Zonder argumenten élke netlist die het
 * casusboek noemt. `V40_POINTS=1` drukt ook de puntentabel per paar af.
 *
 * DE VRAAG, EN ZIJ IS DE VOLGENDE STAP NA `measure-v40-phase.ts`. Dat blad
 * stelde vast WAAR het gat zit: de twee maten zijn dezelfde formule, het raster
 * draagt hooguit anderhalve graad, en al het overige is de BAND. Dit blad zegt
 * waaróm die band is wat hij is — welke PUNTEN de tuner meetelt die het rapport
 * niet meetelt, wat zij dragen, en waardoor zij binnenkomen. Een maat vervangen
 * zonder de afwijking te begrijpen is de V36-fout; dit is het materiaal dat dat
 * voorkomt.
 *
 * WAT DE POORT VAN DE TUNER IS. `computeIntegration` laat een rasterpunt toe
 * wanneer de twee takken binnen `overlapWindowDb` van ELKAAR liggen. Dat is een
 * RELATIEVE toets en er staat geen absolute vloer naast, en ook geen knip op
 * meetgeldigheid. Twee gevolgen, allebei hieronder gemeten en niet beredeneerd:
 *
 *   ONDERKANT — punten onder de meetgeldigheidsvloer. De vloer van casus 1 komt
 *   uit de KOP van de meetbestanden (alle drie de wegen), en de keten krijgt de
 *   ONGEKNIPTE som (`onAxisFull`), dus daar staat gewoon data. Het rapport knipt
 *   erop, de tuner niet. Op de netlist waar de twee maten het verst uiteenlopen
 *   is dat de helft van de steekproef.
 *
 *   BOVENKANT — dode punten. Buiten de gemeten uitgestrektheid zet de fixture de
 *   tak op `SILENT_GHOST_DB` met fase 0; het netwerk verzwakt die stilte verder.
 *   Twee even dode takken liggen per definitie binnen elk relatief venster, dus
 *   zo'n punt telt MEE, en wat het bijdraagt is uitsluitend het faseverschil van
 *   de FILTERS — er zit geen meting in. Dit is de stille geest van V38-fix, één
 *   metriek verderop.
 *
 * GEEN ENKEL GETAL WORDT HIER GESTELD. Het overlapvenster wordt aan
 * `computeIntegration` GEVRAAGD (`cls === null` is precies wat zij buitensluit),
 * de rapportband komt uit `system.phaseTracking[].bandHz`, en de
 * meetgeldigheidsvloer met haar herkomst uit de opnamepas.
 *
 * Zie casusboek V40. `measure-v40-phase.ts` is het blad ernaast: dat legt de
 * twee maten naast elkaar, dit legt uit waar hun verschil vandaan komt.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CASUS1_DIR,
  CASUS1_WOOFER_DC_OHM,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import { casus1ChainInput } from '../src/lib/engine2/casus1V2.fixture.ts';
import { runIngest } from '../src/lib/engine2/ingest/derive.ts';
import { buildReport, type ReportSettings } from '../src/lib/engine2/report.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';
import { FLAT_TARGET } from '../src/lib/engine2/requirements/targetCurve.ts';
import { deserializeFilter } from '../src/lib/filterFile.ts';
import { applyTransfer, combine, wrapDeg, type GriddedResponse } from '../src/lib/dsp.ts';
import { computeIntegration } from '../src/lib/integration.ts';
import { solveNetwork } from '../src/lib/network.ts';
import { crossoverToNetlist } from '../src/lib/vxpNetwork.ts';
import type { VxpCrossover, VxpPart } from '../src/lib/parsers/vxp.ts';

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const geometry = casus1Geometry(golden);
const netlists = (golden.manifest_en_geometrie as { netlists: Record<string, string> }).netlists;

const SETTINGS: ReportSettings = {
  amplifierPowerW: 100,
  orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
  reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
  targetCurve: FLAT_TARGET,
};

const chain = casus1ChainInput(manifest, files, golden);

/**
 * De gefilterde taktransfers op het ketenraster — dezelfde twee functies
 * waarmee de worker zijn som bouwt (`measure-v40-phase.ts` doet het zo, en om
 * dezelfde reden: een eigen vermenigvuldiging van magnitude en fase zou een
 * tweede implementatie van hetzelfde antwoord zijn).
 */
function branchResponses(parts: readonly VxpPart[]): Record<string, GriddedResponse> {
  const { netlist } = crossoverToNetlist({ name: 'v40b', parts: [...parts] } as VxpCrossover);
  const sol = solveNetwork(netlist, [...chain.grid], chain.driverZ);
  const base: Record<string, GriddedResponse> = {
    woofer: chain.w,
    mid: chain.m,
    tweeter: chain.t,
  };
  const out: Record<string, GriddedResponse> = {};
  for (const model of Object.keys(base)) {
    const d = sol.drivers.find((x) => x.model === model);
    const h = d ? sol.transfers[d.id] : null;
    if (h) out[model] = applyTransfer(base[model], h);
  }
  return out;
}

const d2 = (v: number) => v.toFixed(2);
const hz = (v: number) => v.toFixed(1);

/* ------------------------------------------------------------------ *
 * TABEL 1 — waar het rapport op knipt, en wat de keten krijgt
 * ------------------------------------------------------------------ */

const ingest = runIngest(manifest, files);

console.log('## 1. Meetgeldigheid tegen ongeknipte uitgestrektheid, per weg');
console.log('');
console.log(
  '| weg | `onAxis.bandHz` — waar het RAPPORT op knipt | herkomst van de vloer | ' +
    '`onAxisFull` — wat de KETEN krijgt |',
);
console.log('|---|---|---|---|');
for (const d of ingest.drivers) {
  const a = d.onAxis;
  const f = d.onAxisFull;
  const ext = f ? `${hz(f.grid[0])}–${hz(f.grid[f.grid.length - 1])}` : '—';
  console.log(
    `| ${d.driver} | ${a ? `${hz(a.bandHz[0])}–${hz(a.bandHz[1])}` : '—'} | ` +
      `${a ? a.bandFloorProvenance : '—'} | ${ext} |`,
  );
}
console.log('');
console.log(
  'De vloer is een uitspraak van de MEETBESTANDEN zelf en geen app-heuristiek. De keten leest de ' +
    'ongeknipte som (V13: de woofer is één weg gemeten als twee bestanden, en waar twee takken ' +
    'KRUISEN is een eigenschap van het ontwerp), dus onder die vloer staat daar gewoon data — het ' +
    'rapport knipt erop, de tuner niet.',
);
console.log('');

/* ------------------------------------------------------------------ *
 * TABEL 2 — de ontleding per paar
 * ------------------------------------------------------------------ */

/**
 * De meetgeldigheidsvloer van het SYSTEEM: de hoogste per-weg vloer, wat
 * `commonBand` in `report.ts` doet. Afgeleid uit de opnamepas, nooit gesteld.
 */
const validFloorHz: number | null = ingest.drivers.reduce<number | null>((acc, d) => {
  const lo = d.onAxis?.bandHz[0];
  if (lo === undefined) return acc;
  return acc === null ? lo : Math.max(acc, lo);
}, null);

const SHOW_POINTS = process.env.V40_POINTS === '1';
const keys = process.argv.slice(2).length > 0 ? process.argv.slice(2) : Object.keys(netlists);

interface Split {
  n: number;
  sum: number;
  /** Punten onder de meetgeldigheidsvloer van de opnamepas. */
  loBelowFloor: number;
  /** Punten waar BEIDE ruwe takken de stille geest dragen. */
  deadPoints: number;
  /** Geldige, levende punten die alleen buiten het octaafvenster vallen. */
  outsideOctave: number;
}
const empty = (): Split => ({
  n: 0,
  sum: 0,
  loBelowFloor: 0,
  deadPoints: 0,
  outsideOctave: 0,
});
const mean = (s: Split) => (s.n > 0 ? s.sum / s.n : null);
const show = (v: number | null) => (v === null ? '—' : d2(v));

console.log('## 2. Waar de tunermaat vandaan komt, per netlist en per paar');
console.log('');
console.log(
  '| netlist | paar | TUNER ° | alleen-tuner pt | ° daarop | gedeeld pt | ° daarop | ' +
    'alleen-rapport pt | ° daarop | RAPPORT op ketenraster ° | <vloer | dood | buiten ±1 oct |',
);
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');

const detail: string[] = [];

for (const key of keys) {
  const name = netlists[key];
  if (!name) continue;
  const parts: VxpPart[] = deserializeFilter(readFileSync(join(CASUS1_DIR, name), 'utf-8')).parts;
  const rep = buildReport({
    manifest,
    files,
    filter: casus1Filter(key, manifest, files, golden),
    geometry,
    settings: SETTINGS,
  });
  const branches = branchResponses(parts);

  for (const pt of rep.system.phaseTracking) {
    const a = branches[pt.lower];
    const b = branches[pt.upper];
    if (!a || !b) continue;

    /* Het overlapvenster wordt GEVRAAGD, niet nagebouwd: `cls === null` is
     * precies wat `computeIntegration` buiten de overlap legt. */
    const integ = computeIntegration(combine(a, b, { offsetMm: 0, trimDb: 0, inverted: false }));

    /* DE RAPPORTBAND IS DIE VAN DE HISTORISCHE MAAT, en dat moet expliciet
     * staan sinds V44. `pt.bandHz` is nu de band van M-K — de toegelaten punten
     * — en dit blad vergelijkt juist de twee VERVANGEN verzamelingen met
     * elkaar. Zou het `pt.bandHz` lezen, dan zou het stilletjes "tuner tegen
     * M-K" gaan meten onder een kop die "tuner tegen rapport" zegt, en precies
     * dat soort stille betekeniswissel is wat dit blad bestaat om te vangen. */
    const reportBand = pt.control.octaveClipped.bandHz;

    /* "Dood" betekent: allebei de takken dragen de stille geest. Die drempel
     * wordt hier niet gesteld maar AFGELEID uit de ruwe tak — een punt is dood
     * wanneer de ONGEFILTERDE tak er al de geestwaarde draagt, want dan zit er
     * geen meting in wat het netwerk vervolgens verzwakt. */
    const ghost = (i: number, driver: string): boolean => {
      const raw =
        driver === 'woofer' ? chain.w : driver === 'mid' ? chain.m : chain.t;
      return raw.spl[i] <= Math.min(...raw.spl) + 1e-9;
    };

    const tunerOnly = empty();
    const shared = empty();
    const reportOnly = empty();
    const rows: string[] = [];

    for (let i = 0; i < chain.grid.length; i++) {
      const f = chain.grid[i];
      const inOverlap = integ.points[i].cls !== null;
      const inReport =
        reportBand !== null && f >= reportBand[0] && f <= reportBand[1];
      if (!inOverlap && !inReport) continue;
      const phase = Math.abs(wrapDeg(a.phaseDeg[i] - b.phaseDeg[i]));
      const bucket = inOverlap && inReport ? shared : inOverlap ? tunerOnly : reportOnly;
      bucket.n++;
      bucket.sum += phase;
      if (inOverlap && !inReport) {
        /* Drie soorten, in deze volgorde, want zij sluiten elkaar uit: een dood
         * punt is dood ongeacht waar het ligt; daarna telt de meetgeldigheid;
         * wat dan overblijft is ECHTE, GELDIGE data die alleen buiten het
         * octaafvenster van het rapport valt. Die derde soort is geen defect
         * van de tuner — zij is het antwoord op een andere vraag. */
        if (ghost(i, pt.lower) && ghost(i, pt.upper)) tunerOnly.deadPoints++;
        else if (validFloorHz !== null && f < validFloorHz) tunerOnly.loBelowFloor++;
        else tunerOnly.outsideOctave++;
      }
      if (SHOW_POINTS) {
        const mark =
          inOverlap && inReport ? 'beide' : inOverlap ? '**ALLEEN TUNER**' : 'alleen rapport';
        rows.push(
          `| ${hz(f)} | ${d2(a.spl[i])} | ${d2(b.spl[i])} | ${d2(Math.abs(a.spl[i] - b.spl[i]))} | ` +
            `${d2(phase)} | ${mark} |`,
        );
      }
    }

    const tunerN = tunerOnly.n + shared.n;
    const reportN = shared.n + reportOnly.n;
    console.log(
      `| ${key} | ${pt.lower}→${pt.upper} | ${show(tunerN > 0 ? (tunerOnly.sum + shared.sum) / tunerN : null)} | ` +
        `${tunerOnly.n} | ${show(mean(tunerOnly))} | ${shared.n} | ${show(mean(shared))} | ` +
        `${reportOnly.n} | ${show(mean(reportOnly))} | ` +
        `${show(reportN > 0 ? (shared.sum + reportOnly.sum) / reportN : null)} | ` +
        `${tunerOnly.loBelowFloor} | ${tunerOnly.deadPoints} | ${tunerOnly.outsideOctave} |`,
    );

    if (SHOW_POINTS) {
      detail.push('');
      detail.push(
        `### ${key} — ${pt.lower}→${pt.upper}, kruispunt ${hz(pt.crossingHz)} Hz, ` +
          `rapportband ${reportBand ? `${hz(reportBand[0])}–${hz(reportBand[1])}` : '—'} Hz`,
      );
      detail.push('');
      detail.push('| Hz | onder dB | boven dB | Δ dB | \\|Δfase\\| ° | telt mee bij |');
      detail.push('|---|---|---|---|---|---|');
      detail.push(...rows);
    }
  }
}

if (SHOW_POINTS) console.log(detail.join('\n'));

console.log('');
console.log(
  'HOE DIT TE LEZEN. `TUNER °` is het gewogen gemiddelde van de kolommen `alleen-tuner` en ' +
    '`gedeeld`; `RAPPORT op ketenraster °` dat van `gedeeld` en `alleen-rapport`. Staan die twee ' +
    'ver uiteen, dan zegt de kolom `alleen-tuner ° daarop` waarom — dat zijn de punten die ALLEEN ' +
    'de tuner meetelt. De laatste drie kolommen splitsen ze, en zij sluiten elkaar uit. `<vloer`: ' +
    'onder de meetgeldigheidsvloer — data die de MEETBESTANDEN zelf buiten hun geldige band ' +
    'leggen. `dood`: beide ruwe takken dragen de stille geest, dus het faseverschil komt ' +
    'uitsluitend van de FILTERS en er zit geen meting in. `buiten ±1 oct`: echte, GELDIGE data ' +
    'die alleen buiten het octaafvenster van het rapport valt — dat is geen defect maar een ' +
    'andere vraag, en het hoort apart geteld te worden.',
);
