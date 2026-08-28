/**
 * V38 STAP 3 — DE TRANSPLANTATIE: is de topologie het, of is het de zoektocht?
 *
 * `npx vite-node scripts/measure-v38-transplant.ts` — zes waardetunes op de
 * topologie van HUIDIG, elk uit een ander ZAAD. Gemeten ~790 s per stuk.
 * `V38_LIMIT=n` als rookproef.
 *
 * DE VRAAG. Stap 2 verdeelt het gat over de groepen die HUIDIG heeft en het
 * levende corpus niet. Dat zegt nog niet of de kandidaatgeneratie die groepen
 * MOET leren voorstellen: als de tuner de topologie van HUIDIG krijgt en er
 * met vrije waarden niet in de buurt van 0,60 dB komt, dan ontbreekt de
 * topologie niet — dan haalt de zoektocht haar niet.
 *
 * DE ZADEN. `waarden vanaf nul` bestaat niet als getal, dus het is hier een
 * verzameling:
 *   - `warm`   — HUIDIG's eigen waarden. De bovengrens van wat een zoektocht
 *                op deze topologie kan bereiken vanaf het beste bekende punt.
 *   - `koud`   — elk element op het MEETKUNDIG MIDDEN van de buildability-
 *                grenzen van de app voor zijn soort. Een topologie zonder
 *                enige waarde-informatie, en niets erin komt uit casus 1.
 *   - `koud-1..4` — dezelfde grenzen, log-uniform gejitterd door een
 *                tellergebaseerde generator met (seed, slotnaam) als volledige
 *                invoer (A5e.4: geen klok, geen entropie). Vier starts, want
 *                één koude start die vastloopt is een anekdote en geen meting.
 *
 * ALLE ZADEN DRAAIEN ONDER DEZELFDE KOOI als de ablatiereeks (HUIDIG's eigen
 * overnames ± 2 %): anders meet dit óók nog de vrijheid om de overname te
 * verplaatsen, en die is in stap 2 al apart gemeten.
 *
 * OVER HET SYNTHESE-FASEVERLIES. De horizonpost vroeg om deze meting alleen
 * "als er een rest blijft". Zij kan hem niet verklaren en dat is al vastgesteld
 * vóór deze sessie: de hypothese *de ontwerpstap modelleert zijn EQ-banden
 * fase-vrij* is WEERLEGD — `evalEqBand` is een complexe analoge biquad, peak
 * en beide shelves, dus de ontwerpstap rekent met volledige minimumfase. Dat is
 * bij V38 nagelezen in `src/lib/filters.ts` en het staat er nog steeds zo.
 * Bovendien komt er in dit script geen ontwerpstap en geen EQ-band voorbij: de
 * topologie is gegeven en alleen waarden bewegen. Een rest die hier overblijft
 * kán dus niet van een synthese-faseverlies komen.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReport } from '../src/lib/engine2/report.ts';
import { optimizeNetworkValues } from '../src/lib/netOptimizer.ts';
import { casus1FilterFromParts } from '../src/lib/engine2/casus1.fixture.ts';
import {
  FLOOR,
  SETTINGS,
  TUNE_OPTS,
  chain,
  countParts,
  files,
  geometry,
  manifest,
  measure,
  partsOf,
  r2,
  tunerVectorOf,
  type Measured,
  type TunerVector,
} from './v38-bench.ts';
import type { VxpPart } from '../src/lib/parsers/vxp.ts';

/** Speling rond een vastgehouden overname — zie `measure-v38-ablation.ts`. */
const PIN_SLACK = 0.02;
/**
 * Aantal gejitterde koude starts naast de ongejitterde. Een TELLING.
 *
 * Twee en niet meer, en de reden is een MEETRESULTAAT en geen budget: de warme
 * arm start ÓP HUIDIG en loopt er vrijwillig vandaan, dus deze doelfunctie
 * rangschikt het geleverde netwerk bóven HUIDIG. Een koude start kan die
 * ordening niet omkeren; wat hij nog toevoegt is de SPREIDING — het verschil
 * tussen "de zoektocht vindt het niet" en "deze ene start had pech".
 */
const COLD_STARTS = 2;
/** De seed van deze meting. Gerapporteerd, nooit impliciet (A5e.4-amendement). */
const SEED = 20260828;

/**
 * De buildability-grenzen van de app per soort, in SI.
 *
 * OVERGESCHREVEN UIT `netOptimizer.ts` (`BOUNDS`), dat ze niet exporteert, en
 * dat is een tweede exemplaar met alle risico's van dien. Waarom het hier toch
 * mag: dit is een MEETSCRIPT en geen engine, het getal wordt nergens in een
 * oordeel gebruikt, en het zaad hoeft alleen binnen de doos te liggen — loopt
 * de doos van de tuner ooit uiteen met deze, dan verschuift het zaad en niet
 * de uitkomst waar hij naartoe zoekt. Een export toevoegen zou `src/lib/`
 * raken, en deze sessie raakt `src/lib/` niet.
 */
const SEED_BOUNDS: Record<'C' | 'L' | 'R', [number, number]> = {
  C: [0.33e-6, 100e-6],
  L: [0.05e-3, 15e-3],
  R: [0.22, 47],
};

/** Tellergebaseerde 32-bits menger: (seed, naam, index) → [0,1). */
function unitOf(seed: number, name: string, index: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  const s = `${name}#${index}`;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2545f491) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 0x100000000;
}

const KIND_OF: Record<string, 'C' | 'L' | 'R'> = {
  Capacitor: 'C',
  Inductor: 'L',
  Resistor: 'R',
};
/** Welke parameter de WAARDE draagt, per soort — de andere is de parasiet. */
const VALUE_PARAM: Record<'C' | 'L' | 'R', string> = { C: 'C', L: 'L', R: 'R' };
/** Eenheidsconversie van SI naar de eenheid waarin de partslijst schrijft. */
const FROM_SI: Record<'C' | 'L' | 'R', number> = { C: 1e6, L: 1e3, R: 1 };

/**
 * Vervang elke vrije componentwaarde door een zaadwaarde.
 *
 * `jitter = 0` geeft het meetkundig midden van de grenzen; daarboven een
 * log-uniforme trekking over de volle doos. De PARASIETEN (DCR/ESR) blijven
 * staan zoals ze zijn: die zijn bij P5 afhankelijke variabelen van de waarde en
 * ze opnieuw verzinnen zou een tweede model naast het catalogusmodel zetten.
 * Wel wordt de `catalog`-attributie gewist — een SKU-nummer naast een waarde
 * die er niet meer bij hoort is een BOM die liegt.
 */
function seedParts(parts: readonly VxpPart[], label: string, jitter: boolean): VxpPart[] {
  return parts.map((p, i) => {
    const kind = p.partId !== undefined ? KIND_OF[p.type] : undefined;
    if (!kind || p.locked === true) return p;
    const [lo, hi] = SEED_BOUNDS[kind];
    const u = jitter ? unitOf(SEED, `${label}:${p.partId ?? p.type}`, i) : 0.5;
    const si = Math.exp(Math.log(lo) + u * (Math.log(hi) - Math.log(lo)));
    const name = VALUE_PARAM[kind];
    const { catalog: _dropped, ...rest } = p;
    return {
      ...rest,
      params: p.params.map((q) => (q.name === name ? { ...q, value: si * FROM_SI[kind] } : q)),
    };
  });
}

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'test-fixtures', 'casus1_v38_transplantatie.json');

const base = partsOf('HUIDIG');
const report = buildReport({
  manifest,
  files,
  filter: casus1FilterFromParts('HUIDIG', base, manifest, files),
  geometry,
  settings: SETTINGS,
});
const huidigXo = report.crossings.map((c) => c.fHz);
const cage: ([number, number] | null)[] = huidigXo.map((f) => [
  f * (1 - PIN_SLACK),
  f * (1 + PIN_SLACK),
]);

const seeds: { label: string; parts: VxpPart[] }[] = [
  { label: 'warm (HUIDIG zelf)', parts: base },
  { label: 'koud (midden van de doos)', parts: seedParts(base, 'koud', false) },
];
for (let k = 1; k <= COLD_STARTS; k++) {
  seeds.push({ label: `koud-${k} (log-uniform)`, parts: seedParts(base, `koud-${k}`, true) });
}

interface Row extends Measured {
  zaad: string;
  /** De volle vector van het ZAAD, niet alleen zijn RMS. */
  zaad_meting: Measured;
  onderdelen: number;
  vrij: number;
  evaluaties: number;
  kruispuntenHz: (number | null)[];
  tuner_voor: TunerVector;
  tuner_na: TunerVector;
  bandNote: string;
  infeasible: string | null;
  parts: unknown;
  seconden: number;
}

console.log(`topologie: HUIDIG (${countParts(base)} onderdelen)`);
console.log(`kooi: ${cage.map((c) => (c ? `${c[0].toFixed(0)}–${c[1].toFixed(0)}` : '—')).join(' | ')} Hz`);
console.log(`seed: ${SEED}   koude starts: 1 + ${COLD_STARTS}`);
const frozen = measure('HUIDIG-bevroren', base);
console.log(`bevroren HUIDIG: RMS ${frozen.rms} dB, ±${frozen.venster} dB`);

const LIMIT = Number(process.env.V38_LIMIT ?? '0');
const rows: Row[] = [];
for (const s of seeds) {
  if (LIMIT > 0 && rows.length >= LIMIT) break;
  const seedMetrics = measure(`${s.label} (zaad)`, s.parts);
  const t0 = Date.now();
  const net = optimizeNetworkValues(
    s.parts,
    [...chain.grid],
    chain.w,
    chain.t,
    chain.driverZ,
    { offsetMm: 0, trimDb: 0, inverted: false },
    { ...TUNE_OPTS, xoRangePairs: cage },
  );
  const seconds = (Date.now() - t0) / 1000;
  const row: Row = {
    zaad: s.label,
    zaad_meting: seedMetrics,
    onderdelen: countParts(net.parts),
    vrij: net.tuned,
    evaluaties: net.evaluations,
    ...measure(s.label, net.parts),
    kruispuntenHz: (net.after.xoHzPairs ?? []).map((v) => r2(v)),
    tuner_voor: tunerVectorOf(net.before),
    tuner_na: tunerVectorOf(net.after),
    bandNote: net.bandNote,
    infeasible: net.infeasible ?? null,
    parts: net.parts,
    seconden: Number(seconds.toFixed(0)),
  };
  rows.push(row);
  console.log(
    `${s.label.padEnd(28)} zaad-RMS ${String(row.zaad_meting.rms).padStart(7)} → geleverd ${row.rms}  ` +
      `±${row.venster}  W-M ${row.wmFase}°  M-T ${row.mtFase}°  min|Z| ${row.minZ} Ω  ` +
      `EPDR ${row.epdr} Ω  diss ${row.dissipatiePct} %  Qes× ${row.qesMult}  ` +
      `xo ${row.kruispuntenHz.join('/')}  (${row.seconden} s)`,
  );
  console.log(
    `${' '.repeat(30)}tuner: rippelpiek ${row.tuner_voor.rippelPiekDb} → ${row.tuner_na.rippelPiekDb} dB ` +
      `(gegladd ${row.tuner_na.rippelPiekGegladdDb}); gem.afw ${row.tuner_voor.gemAfwDb} → ${row.tuner_na.gemAfwDb}; ` +
      `fase ${row.tuner_voor.faseDeg} → ${row.tuner_na.faseDeg}°; dissRatio ${row.tuner_na.dissRatio}`,
  );
}

const n = (v: number | null) => (v === null ? '—' : v.toFixed(2));
console.log('\n=== transplantatie: HUIDIG-topologie, waarden uit verschillende zaden ===');
console.log(
  '| zaad | RMS zaad | RMS geleverd | SPL ± | smalste piek (dB @ Hz) | W-M fase (°) | ' +
    'M-T fase (°) | min \\|Z\\| (Ω) | vloer | EPDR (Ω) | dissipatie (%) | grootste R (W) | ' +
    'Q_es× | overnames (Hz) |',
);
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
const line = (label: string, zaadRms: number | null, m: Measured, overnames: string) =>
  console.log(
    `| ${label} | ${n(zaadRms)} | ${n(m.rms)} | ${n(m.venster)} | ` +
      `${m.smallePiekDb === null ? '—' : `${n(m.smallePiekDb)} @ ${n(m.smallePiekHz)}`} | ` +
      `${n(m.wmFase)} | ${n(m.mtFase)} | ${n(m.minZ)} | ` +
      `${m.haaltVloer === null ? '—' : m.haaltVloer ? 'ja' : '**nee**'} | ${n(m.epdr)} | ` +
      `${n(m.dissipatiePct)} | ${n(m.grootsteRW)} | ${n(m.qesMult)} | ${overnames} |`,
  );
line(
  'HUIDIG, bevroren (geen tune)',
  frozen.rms,
  frozen,
  huidigXo.map((f) => f.toFixed(0)).join('/'),
);
for (const r of rows) {
  line(
    r.zaad,
    r.zaad_meting.rms,
    r,
    r.kruispuntenHz.map((x) => (x === null ? '—' : x.toFixed(0))).join('/'),
  );
}

console.log('\n=== dezelfde zaden in de EENHEDEN VAN DE TUNER ===');
console.log(
  '| zaad | rippelpiek voor → na (dB) | gegladd na (dB) | gem. afw. voor → na (dB) | ' +
    'fase voor → na (°) | min \\|Z\\| voor → na (Ω) | R_source na (Ω) | dissRatio na |',
);
console.log('|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  const a = r.tuner_voor;
  const b = r.tuner_na;
  console.log(
    `| ${r.zaad} | ${n(a.rippelPiekDb)} → ${n(b.rippelPiekDb)} | ${n(b.rippelPiekGegladdDb)} | ` +
      `${n(a.gemAfwDb)} → ${n(b.gemAfwDb)} | ${n(a.faseDeg)} → ${n(b.faseDeg)} | ` +
      `${n(a.zMinOhm)} → ${n(b.zMinOhm)} | ${n(b.rSourceOhm)} | ${n(b.dissRatio)} |`,
  );
}

const delivered = rows.map((r) => r.rms).filter((x): x is number => x !== null);
if (delivered.length > 0 && frozen.rms !== null) {
  const best = Math.min(...delivered);
  console.log(
    `\nbeste geleverde RMS op deze topologie: ${best.toFixed(2)} dB tegen ${frozen.rms.toFixed(2)} dB ` +
      `voor de bevroren netlist — REST ${(best - frozen.rms).toFixed(2)} dB.`,
  );
}

writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      _: 'V38 stap 3 — de transplantatie. Documentatie, geen acceptatiewaarde.',
      opzet: {
        topologie: 'HUIDIG',
        tuner: 'optimizeNetworkValues, WAARDEN-only (geen `staged`)',
        kooi: cage,
        seed: SEED,
        zaadgrenzen: SEED_BOUNDS,
        raster: [chain.grid[0], chain.grid[chain.grid.length - 1], chain.grid.length],
        vloer_ohm: FLOOR,
        opties: Object.keys(TUNE_OPTS).sort(),
      },
      bevroren_huidig: frozen,
      zaden: rows,
    },
    null,
    1,
  )}\n`,
  'utf-8',
);
console.log(`\ngeschreven: ${OUT}`);
