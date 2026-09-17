/**
 * M-4 — WAT DE FASEGRADEN KOSTTEN: de vier netlists naast elkaar.
 *
 * `npx vite-node scripts/measure-m4-comparison.ts [SLEUTEL ...]` — seconden,
 * GEEN ketenrun en GEEN tune. Schrijft `test-fixtures/casus1_m4_vergelijking.json`;
 * `m4PhasePriority.test.ts` reproduceert elk getal eruit uit een verse meting.
 *
 * DE OPZET IS EEN AFTREKKING EN VERDER NIETS. Twee gestelde woofer→mid-posities
 * (362,3 en 518,8 Hz) × twee standen van één schuif (50/50 en 25/75), alle vier
 * door ÉÉN meetbank (`corpusBank`, de standaardset) en dus door exact dezelfde
 * instellingen. Het enige verschil tussen de kolommen van een paar is
 * `phasePriority`; het enige verschil tussen de PAREN is het kruispunt.
 *
 * WAT ER GEMETEN WORDT, en waarom elk van de vier er staat:
 *
 *  · M-K per paar — de maat die de sessie wilde verbeteren (V44). Plus de twee
 *    controlekolommen, want M-K is een GEMIDDELDE |faseverschil| over een
 *    puntenverzameling, en een lezer die het ziet bewegen hoort te kunnen zien
 *    of de verzameling meebewoog.
 *
 *  · HET FASESPOOR, ±1 octaaf rond elke overname — waar de graden zitten. Een
 *    gemiddelde dat van 13 naar 9 gaat kan een vlak spoor zijn dat zakt of een
 *    scheef spoor dat kantelt, en dat zijn verschillende luidsprekers.
 *
 *  · DE NULDIEPTE MET OMGEPOOLDE MID — de klassieke controle, en de enige hier
 *    die niet van onze eigen conventies afhangt: draai één weg om en de som
 *    hoort in te storten waar de twee in fase liepen. Eén omkering levert
 *    BEIDE nullen op, want de mid zit in beide paren. Een LEZING en geen
 *    metriek: geen versiestring, geen poort, geen eis (P4) — zij staat naast
 *    M-K als onafhankelijke kijk op hetzelfde en niet als tweede oordeel.
 *
 *  · RIMPEL, RMS, OPSLINGERING, min |Z| EN DE BOM — de rekening. Een strakkere
 *    fase is gratis of hij is het niet, en dit zijn de assen waarop hij
 *    betaald wordt.
 *
 * DE BRANCHES KOMEN UIT HET RAPPORT (`system.branches`, M-4) en worden hier
 * niet opnieuw afgeleid: het spoor en de nuldiepte gaan daarmee over dezelfde
 * takken als het M-K-oordeel ernaast. Een tweede afleiding zou een tweede ding
 * zijn dat het oneens kan worden met het oordeel dat ernaast staat (de
 * V32-vorm).
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { corpusBank } from '../src/lib/engine2/casus1Corpora.fixture.ts';
import {
  CASUS1_DIR,
  casus1CoilCatalogPath,
  casus1FilePath,
  loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import { deserializeFilter } from '../src/lib/filterFile.ts';
import { readFileSync } from 'node:fs';
import type { EngineV2Report } from '../src/lib/engine2/report.ts';
import type { VxpPart } from '../src/lib/parsers/vxp.ts';
import { judgeResponse } from '../src/lib/engine2/requirements/response.ts';
import {
  CASUS1_COIL_DCR,
  CASUS1_COIL_FAMILY_BY_DRIVER,
  CASUS1_M4_PHASE_PRIORITY,
  CASUS1_TARGET_CURVE,
  CASUS1_V2_BAND_HZ,
  CASUS1_V2_SETTINGS,
} from '../src/lib/engine2/casus1V2.fixture.ts';
import { coilDcrInventory } from '../src/lib/coilDcr.ts';
import { bomOf, loadCoilCatalog } from './bomColumn.ts';
import { wrapDeg } from '../src/lib/dsp.ts';
import { parseArtaHeader, type MergeBlock } from '../src/lib/engine2/ingest/manifest.ts';
import { MID_M1_FILE, MID_M3_FILE } from '../src/lib/engine2/midM3.fixture.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'test-fixtures', 'casus1_m4_vergelijking.json');

/**
 * De PAREN: elke gestelde positie, met zijn 50/50-netlist en zijn 25/75-netlist.
 *
 * GELEZEN UIT DE M-4-HERKOMST en hier niet uitgeschreven. De koppeling is daar
 * gemaakt (`register-m4-candidates.ts` paart op KRUISPUNT, want een volgnummer
 * is een shortlistplaats en geen eigenschap van een ontwerp), en twee plekken
 * die het over een paring eens moeten zijn is precies het soort kopie dat in
 * dit project uiteenloopt — de V33-les over `compare-corpora.ts`.
 */
interface M4Pair {
  lowHz: number;
  base: string;
  phase: string;
}

function m4Pairs(): M4Pair[] {
  const h = JSON.parse(
    readFileSync(join(HERE, '..', 'test-fixtures', 'casus1_m4_herkomst.json'), 'utf-8'),
  ) as {
    bestanden: { key: string; tegenhanger: string; label: string }[];
    kandidaat_uitkomst: Record<string, { kruispunt_hz?: [number, number] }>;
  };
  return h.bestanden.map((b) => ({
    lowHz: h.kandidaat_uitkomst[b.key]?.kruispunt_hz?.[0] ?? NaN,
    base: b.tegenhanger,
    phase: b.key,
  }));
}

/**
 * De tweede RMS-band: vanaf de gate-vloer van de TWEETER.
 *
 * Dezelfde tweede kolom die `measure-a5e3c-field.ts` draagt en om dezelfde
 * reden: de volle oordeelband begint op f_p en daar draagt alleen de woofer,
 * dus een RMS over de volle band en een RMS over de band waarin alle drie de
 * wegen meedoen zijn verschillende vragen. Uit het manifest gelezen, nooit
 * getypt (P6).
 */
function tweeterGateFloorHz(rep: EngineV2Report): number | null {
  const t = rep.ingest.drivers.find((d) => d.driver === 'tweeter');
  return t?.onAxis?.bandHz?.[0] ?? null;
}

const r2 = (v: number | null | undefined): number | null =>
  v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(2));
const r3 = (v: number | null | undefined): number | null =>
  v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(3));

/* ------------------------------------------------------------------ *
 * Het fasespoor en de nuldiepte, allebei uit `system.branches`
 * ------------------------------------------------------------------ */

interface TracePoint {
  hz: number;
  /** phi(upper) − phi(lower), gewikkeld naar (−180, 180]. */
  relDeg: number;
  /** Het niveauverschil op datzelfde punt — zegt of de fase er nog toe doet. */
  levelDb: number;
}

/** Het relatieve-fasespoor van één paar, ±`octaves` rond zijn overname. */
function traceOf(
  rep: EngineV2Report,
  lower: string,
  upper: string,
  crossingHz: number,
  octaves: number,
): TracePoint[] {
  const grid = rep.analysisGrid;
  const lo = rep.system.branches?.find((b) => b.driver === lower);
  const hi = rep.system.branches?.find((b) => b.driver === upper);
  if (!grid || !lo || !hi) return [];
  const f0 = crossingHz / 2 ** octaves;
  const f1 = crossingHz * 2 ** octaves;
  /* Log-gelijkmatig uitgedund: de octaafafstanden tussen de getoonde punten
   * zijn gelijk, zoals elke spreiding in dit project (`candidates.ts`). Snapt
   * naar het DICHTSTBIJZIJNDE rasterpunt en ontdubbelt, zodat een grof raster
   * minder rijen geeft in plaats van dezelfde rij twee keer. */
  const seen = new Set<number>();
  const out: TracePoint[] = [];
  for (let k = 0; k < TRACE_POINTS; k++) {
    const want = f0 * (f1 / f0) ** (k / (TRACE_POINTS - 1));
    let i = 0;
    for (let j = 0; j < grid.length; j++) {
      if (grid[j] < f0 || grid[j] > f1) continue;
      if (seen.size === 0 && i === 0) i = j;
      if (Math.abs(grid[j] - want) < Math.abs(grid[i] - want)) i = j;
    }
    if (grid[i] < f0 || grid[i] > f1 || seen.has(i)) continue;
    seen.add(i);
    out.push({
      hz: grid[i],
      relDeg: wrapDeg(hi.phaseDeg[i] - lo.phaseDeg[i]),
      levelDb: hi.db[i] - lo.db[i],
    });
  }
  return out;
}

interface NullRead {
  pair: string;
  crossingHz: number;
  /** Waar de omgepoolde som het diepst zakt binnen ±`octaves` van de overname. */
  atHz: number | null;
  /** De diepte: normale som − omgepoolde som op datzelfde punt, dB. */
  depthDb: number | null;
}

/**
 * De nuldiepte van één paar, met de MID omgepoold.
 *
 * De omkering is een teken en verder niets: een tak met omgekeerde polariteit
 * is dezelfde tak met 180° erbij, dus `−(re, im)`. De som wordt over ALLE wegen
 * genomen en niet over het paar alleen — dat is wat de luidspreker doet, en de
 * derde weg is daar zo ver onder dat hij de diepte alleen kan VERKLEINEN. Dat
 * is de eerlijke kant: een diepte die met de derde tak erbij nog 16 dB is, is
 * 16 dB.
 */
function nullOf(
  rep: EngineV2Report,
  inverted: string,
  pair: { lower: string; upper: string; crossingHz: number },
  octaves: number,
): NullRead {
  const grid = rep.analysisGrid;
  const branches = rep.system.branches;
  if (!grid || !branches) {
    return { pair: `${pair.lower}→${pair.upper}`, crossingHz: pair.crossingHz, atHz: null, depthDb: null };
  }
  const toRe = (db: number, deg: number) => Math.pow(10, db / 20) * Math.cos((deg * Math.PI) / 180);
  const toIm = (db: number, deg: number) => Math.pow(10, db / 20) * Math.sin((deg * Math.PI) / 180);
  const f0 = pair.crossingHz / 2 ** octaves;
  const f1 = pair.crossingHz * 2 ** octaves;
  let best: { hz: number; depth: number } | null = null;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] < f0 || grid[i] > f1) continue;
    let nRe = 0;
    let nIm = 0;
    let iRe = 0;
    let iIm = 0;
    for (const b of branches) {
      const re = toRe(b.db[i], b.phaseDeg[i]);
      const im = toIm(b.db[i], b.phaseDeg[i]);
      nRe += re;
      nIm += im;
      const s = b.driver === inverted ? -1 : 1;
      iRe += s * re;
      iIm += s * im;
    }
    const normal = 20 * Math.log10(Math.hypot(nRe, nIm));
    const flipped = 20 * Math.log10(Math.hypot(iRe, iIm));
    const depth = normal - flipped;
    if (!Number.isFinite(depth)) continue;
    if (!best || depth > best.depth) best = { hz: grid[i], depth };
  }
  return {
    pair: `${pair.lower}→${pair.upper}`,
    crossingHz: pair.crossingHz,
    atHz: best ? r2(best.hz) : null,
    depthDb: best ? r2(best.depth) : null,
  };
}

/* ------------------------------------------------------------------ *
 * Eén netlist, volledig gelezen
 * ------------------------------------------------------------------ */

const golden = loadGolden();
const bank = corpusBank(golden, 'm3');
const catalog = loadCoilCatalog(casus1CoilCatalogPath(golden));

/** ±1 octaaf: het spoor dat de opdracht vraagt, en de zoekband van de nul. */
const TRACE_OCTAVES = 1;
/**
 * Hoeveel punten het SPOOR toont.
 *
 * Het analyseraster draagt 1600 punten en ±1 octaaf daarvan zijn er honderden —
 * een plot die niemand kan lezen is geen plot. Log-gelijkmatig uitgedund tot
 * een leesbaar aantal, en de UITDUNNING IS ALLEEN DE WEERGAVE: de nuldiepte en
 * elk getal in de tabel lezen het volle raster. Een telling en geen frequentie
 * (P6).
 */
const TRACE_POINTS = 25;

interface Read {
  key: string;
  file: string;
  phasePriority: number | null;
  crossings: { pair: string; hz: number }[];
  mk: { pair: string; hz: number; deg: number; n: number; band: [number, number]; octaveControlDeg: number | null; overlapControlDeg: number | null }[];
  nulls: NullRead[];
  traces: { pair: string; points: TracePoint[] }[];
  rmsFullDb: number | null;
  windowFullDb: number | null;
  rmsFromTweeterGateDb: number | null;
  windowFromTweeterGateDb: number | null;
  resonantDb: number | null;
  liftDb: number | null;
  minZOhm: number | null;
  partCount: number;
  bomEur: number | null;
  bomUnrealised: string[];
  bomItems: { id: string; label: string; eur: number }[];
  verdicts: { gate: string; subject: string; active: boolean; pass: boolean; value: number | null; limit: number | null }[];
}

function readOne(
  key: string,
  phasePriority: number | null,
  /** De kruispunten waarop het SPOOR gecentreerd wordt, per paar. Absent = de
   *  eigen kruispunten van deze netlist (wat de 50/50-helft doet). */
  centreHz?: readonly number[],
): Read {
  const file = golden.manifest_en_geometrie.netlists[key];
  if (!file) throw new Error(`casus 1 has no netlist called ${key}`);
  const parts: VxpPart[] = deserializeFilter(readFileSync(join(CASUS1_DIR, file), 'utf-8')).parts;
  const rep = bank.report(key);
  const inv = coilDcrInventory(parts, CASUS1_COIL_DCR.model);
  const familyOfCoil = (id: string): string | null => {
    const c = inv.coils.find((x) => x.id === id);
    const way = c?.ways[0];
    return way ? CASUS1_COIL_FAMILY_BY_DRIVER[way] ?? null : null;
  };
  const gateFloor = tweeterGateFloorHz(rep);
  const fromGate =
    rep.analysisGrid && rep.system.sumDb && gateFloor !== null
      ? judgeResponse(rep.analysisGrid, rep.system.sumDb, CASUS1_TARGET_CURVE, [gateFloor, CASUS1_V2_BAND_HZ[1]])
      : null;
  const bom = catalog.length ? bomOf(catalog, parts, familyOfCoil) : null;
  const lf = rep.metrics.lfBump?.[0] ?? null;
  return {
    key,
    file,
    phasePriority,
    crossings: rep.crossings.map((c) => ({ pair: `${c.lower}→${c.upper}`, hz: r2(c.fHz)! })),
    mk: rep.system.phaseTracking.map((p) => ({
      pair: `${p.lower}→${p.upper}`,
      hz: r2(p.crossingHz)!,
      deg: r2(p.meanAbsDeg)!,
      n: p.n,
      band: [r2(p.bandHz[0])!, r2(p.bandHz[1])!],
      octaveControlDeg: r2(p.control?.octaveClipped?.meanAbsDeg ?? null),
      overlapControlDeg: r2(p.control?.overlapWindow?.meanAbsDeg ?? null),
    })),
    nulls: rep.crossings
      .filter((c) => Number.isFinite(c.fHz))
      .map((c) => nullOf(rep, 'mid', { lower: c.lower, upper: c.upper, crossingHz: c.fHz }, TRACE_OCTAVES)),
    /* HET SPOOR OP EEN GEMEENSCHAPPELIJKE AS, en dat is geen opmaak maar de
     * meting. De tune VERPLAATST het akoestische kruispunt — bij M-4 met
     * tientallen hertz — dus twee sporen die elk rond hun EIGEN kruispunt
     * lopen delen geen enkele frequentie en kunnen niet afgetrokken worden.
     * Het venster komt daarom van de 50/50-netlist (`centreHz`) en beide
     * netlists worden op diezelfde rasterpunten gelezen. Waar hún kruispunt
     * ligt staat in de tabel erboven. */
    traces: rep.crossings
      .filter((c) => Number.isFinite(c.fHz))
      .map((c, i) => ({
        pair: `${c.lower}→${c.upper}`,
        points: traceOf(rep, c.lower, c.upper, centreHz?.[i] ?? c.fHz, TRACE_OCTAVES).map((p) => ({
          hz: r2(p.hz)!,
          relDeg: r2(p.relDeg)!,
          levelDb: r2(p.levelDb)!,
        })),
      })),
    rmsFullDb: r3(rep.system.response?.rmsDeviationDb),
    windowFullDb: r3(rep.system.response?.windowPlusMinusDb),
    rmsFromTweeterGateDb: r3(fromGate?.rmsDeviationDb),
    windowFromTweeterGateDb: r3(fromGate?.windowPlusMinusDb),
    resonantDb: r3(lf?.result.resonantDb ?? null),
    liftDb: r3(lf?.result.liftDb ?? null),
    minZOhm: r3(rep.metrics.epdr?.minZOhm),
    partCount: parts.filter(
      (p) => p.partId !== undefined && !p.open && !p.shorted && (p.type === 'Inductor' || p.type === 'Capacitor' || p.type === 'Resistor'),
    ).length,
    bomEur: bom ? Number(bom.eur.toFixed(2)) : null,
    bomUnrealised: bom?.unrealised ?? [],
    bomItems: bom?.items.map((i) => ({ id: i.id, label: i.label, eur: Number(i.eur.toFixed(2)) })) ?? [],
    verdicts: rep.gates.verdicts.map((v) => ({
      gate: v.gate,
      subject: v.subject,
      active: v.active,
      pass: v.pass,
      value: r3(v.value),
      limit: r3(v.limit),
    })),
  };
}

/* ------------------------------------------------------------------ *
 * Het ASCII-spoor
 * ------------------------------------------------------------------ */

/**
 * Twee sporen op één as, want de vraag is het VERSCHIL.
 *
 * `.` is de 50/50-lezing, `#` de 25/75-lezing, `+` waar zij op deze resolutie
 * samenvallen. De schaal staat eronder afgedrukt in plaats van vast te liggen:
 * een plot met een vaste as verbergt precies het geval waarin er iets groots
 * gebeurt.
 */
function asciiTrace(base: TracePoint[], phase: TracePoint[], width: number): string[] {
  const all = [...base, ...phase];
  if (all.length === 0) return ['(geen spoor)'];
  const lo = Math.min(...all.map((p) => p.relDeg));
  const hi = Math.max(...all.map((p) => p.relDeg));
  const span = hi - lo || 1;
  const col = (deg: number) => Math.max(0, Math.min(width - 1, Math.round(((deg - lo) / span) * (width - 1))));
  const rows: string[] = [];
  for (let i = 0; i < base.length; i++) {
    const b = base[i];
    const p = phase.find((x) => Math.abs(x.hz - b.hz) < 1e-9) ?? null;
    const line = Array.from({ length: width }, () => ' ');
    const zero = lo <= 0 && hi >= 0 ? col(0) : null;
    if (zero !== null) line[zero] = '|';
    const cb = col(b.relDeg);
    line[cb] = '.';
    if (p) {
      const cp = col(p.relDeg);
      line[cp] = line[cp] === '.' ? '+' : '#';
    }
    rows.push(
      `${b.hz.toFixed(1).padStart(8)} Hz  ${b.relDeg.toFixed(1).padStart(7)}° ${(p ? p.relDeg.toFixed(1) : '—').padStart(7)}°  ` +
        `${(p ? (p.relDeg - b.relDeg).toFixed(1) : '—').padStart(7)}  |${line.join('')}|`,
    );
  }
  rows.push(`${' '.repeat(43)} schaal ${lo.toFixed(0)}° … ${hi.toFixed(0)}°, '.' = 50/50, '#' = 25/75, '+' = gelijk, '|' = 0°`);
  return rows;
}


/* ------------------------------------------------------------------ *
 * De FIT-ONZEKERHEID — hoeveel van een restfasefout kan de merge zijn?
 * ------------------------------------------------------------------ */

/**
 * WAAROM DIT BLOK ER STAAT, en het is verwachtingsmanagement met getallen.
 *
 * De fase waarop M-K oordeelt komt ONDER de splice uit een MERGE, en een merge
 * plakt zijn nabije veld aan zijn verre veld met drie gefitte parameters: een
 * niveau, een PURE VERTRAGING en een offset. Die vertraging is geen gemeten
 * aankomsttijd — de twee helften stellen verschillende referentietijden en de
 * fit draagt dat verschil (M-2) — dus zij is een MODELparameter met een
 * onzekerheid, en een restfasefout van een paar graden bij de overname kan
 * daar net zo goed vandaan komen als uit het filter.
 *
 * TWEE ONAFHANKELIJKE SCHATTINGEN VAN DIE ONZEKERHEID, allebei uit de
 * bestanden zelf en geen van beide getypt:
 *
 *  (a) DE GEMETEN GEVOELIGHEID. M-1 en M-3 zijn DEZELFDE merge van DEZELFDE
 *      twee metingen met precies één factor anders: de fasewiskunde van het
 *      stapmodel (I-2's bevinding). Er is geen nieuwe meting tussen, dus het
 *      verschil tussen hun gefitte vertragingen is wat een MODELKEUZE alleen al
 *      aan die parameter verzet. Dit is de scherpste van de twee, want het is
 *      een waarneming en geen afleiding.
 *
 *  (b) DE EIGEN RESIDU VAN DE FIT. Eén vertraging beschrijft de splice-band tot
 *      op `phase residual` graden rms. Over een band van breedte Δf is de
 *      vertraging die daarmee overeenkomt ruwweg `residu / (360 · Δf)` — de
 *      helling die het residu nog zou kunnen verbergen.
 *
 * WAT HET BLOK NIET IS: een foutbalk op M-K. Het zegt wat een IN-KAST-METING
 * moet beslechten, niet wat M-K werkelijk is.
 */
interface FitRead {
  driver: string;
  file: string;
  spliceBandHz: [number, number] | null;
  gainDb: number | null;
  delayMs: number | null;
  residualDeg: number | null;
  /** (b): de vertraging die het residu over de fitband nog kan verbergen, ms. */
  residualDelayMs: number | null;
}

/**
 * De commentaarregels van een meetbestand, ontdaan van hun `*`.
 *
 * `parseArtaHeader` matcht op VELDNAAM aan het begin van de regel (P-1), dus de
 * markering moet eraf voordat hij kijkt — precies wat de opnamepas ook doet.
 * Het lezen zelf blijft die ene parser; dit is alleen het afpellen.
 */
function commentsOf(path: string): string[] {
  return readFileSync(path, 'utf-8')
    .split(/\r?\n/)
    .filter((l) => /^\s*[*;#]/.test(l))
    .map((l) => l.replace(/^\s*[*;#]+\s?/, ''));
}

function mergeOf(path: string): MergeBlock | null {
  try {
    return parseArtaHeader(commentsOf(path)).merge ?? null;
  } catch {
    return null;
  }
}

function fitReadOf(driver: string, file: string, path: string): FitRead | null {
  const m = mergeOf(path);
  if (!m) return null;
  const band = m.spliceBandHz ?? null;
  const residual = m.splicePhaseResidualDeg ?? null;
  return {
    driver,
    file,
    spliceBandHz: band,
    gainDb: m.spliceGainDb ?? null,
    delayMs: m.spliceDelayMs ?? null,
    residualDeg: residual,
    residualDelayMs:
      residual !== null && band !== null && band[1] > band[0]
        ? Number((residual / (360 * (band[1] - band[0])) * 1e3).toFixed(4))
        : null,
  };
}

/** Een vertraging omgerekend naar graden bij één frequentie. */
const degOf = (delayMs: number, hz: number): number => 360 * hz * (delayMs / 1e3);

/* ------------------------------------------------------------------ *
 * main
 * ------------------------------------------------------------------ */

const PLOT_WIDTH = 60;

function main(): void {
  const asked = process.argv.slice(2);
  const all = m4Pairs();
  const pairs = asked.length > 0 ? all.filter((p) => asked.includes(p.base) || asked.includes(p.phase)) : all;
  if (pairs.length === 0) throw new Error('no M-4 pairs — has register-m4-candidates.ts run?');
  const rows: { lowHz: number; base: Read; phase: Read }[] = [];
  for (const p of pairs) {
    const base = readOne(p.base, CASUS1_V2_SETTINGS.phasePriority);
    /* De fase-arm leest zijn spoor op de vensters van de BASIS, zodat de twee
     * sporen aftrekbaar zijn. */
    const phase = readOne(p.phase, CASUS1_M4_PHASE_PRIORITY, base.crossings.map((c) => c.hz));
    rows.push({ lowHz: p.lowHz, base, phase });
  }

  console.log('M-4 — twee gestelde kruispunten, 50/50 tegen 25/75 respons/fase');
  console.log('='.repeat(110));
  console.log("  één meetbank ('m3', de standaard), één verschil per paar: phasePriority.\n");

  const f = (v: number | null, d = 2) => (v === null ? '—' : v.toFixed(d));
  console.log(
    '| kruispunt | netlist | schuif | M-K W→M ° | M-K M→T ° | nul W→M dB @ Hz | nul M→T dB @ Hz | ' +
      'tuner-rimpel dB | RMS volle band | RMS vanaf gate | ±venster | opslingering dB | min |Z| Ω | onderdelen | BOM € |',
  );
  for (const r of rows) {
    for (const side of [r.base, r.phase] as const) {
      const mkLow = side.mk[0] ?? null;
      const mkHigh = side.mk[1] ?? null;
      const nLow = side.nulls[0] ?? null;
      const nHigh = side.nulls[1] ?? null;
      console.log(
        `| ${r.lowHz.toFixed(1)} | ${side.key} | ${side.phasePriority === null ? '—' : `${Math.round((1 - side.phasePriority) * 100)}/${Math.round(side.phasePriority * 100)}`} | ` +
          `${f(mkLow?.deg ?? null)} | ${f(mkHigh?.deg ?? null)} | ` +
          `${f(nLow?.depthDb ?? null, 1)} @ ${f(nLow?.atHz ?? null, 0)} | ${f(nHigh?.depthDb ?? null, 1)} @ ${f(nHigh?.atHz ?? null, 0)} | ` +
          `${f(side.rmsFullDb, 3)} | ${f(side.rmsFromTweeterGateDb, 3)} | ${f(side.windowFullDb, 3)} | ` +
          `${f(side.resonantDb)} | ${f(side.minZOhm)} | ${side.partCount} | ${f(side.bomEur)} |`,
      );
    }
  }

  for (const r of rows) {
    for (let i = 0; i < r.base.traces.length; i++) {
      const bt = r.base.traces[i];
      const pt = r.phase.traces.find((x) => x.pair === bt.pair);
      console.log(`\nRELATIEF FASESPOOR — ${bt.pair}, ±${TRACE_OCTAVES} octaaf rond de overname van ${r.base.key} / ${r.phase.key}`);
      console.log('       Hz     50/50    25/75    delta');
      for (const line of asciiTrace(bt.points, pt?.points ?? [], PLOT_WIDTH)) console.log('  ' + line);
    }
  }

  /* ---- de fit-onzekerheid ------------------------------------------------ */
  const fits: FitRead[] = [];
  for (const e of bank.manifest.entries) {
    if (String(e.kind) !== 'FF') continue;
    const f = fitReadOf(String(e.driver), e.file, casus1FilePath(e.file, bank.manifest, golden));
    if (f) fits.push(f);
  }
  /* De GEDATEERDE tegenhanger van de mid-merge: dezelfde twee metingen, één
   * modelfactor anders (M-1 tegen M-3). Hij staat in `CASUS1_DIR` en niet in de
   * set, want hij IS de vorige set. */
  const midM1 = fitReadOf('mid (M-1)', MID_M1_FILE, join(CASUS1_DIR, MID_M1_FILE));
  const midM3 = fits.find((f) => f.file === MID_M3_FILE) ?? null;
  const modelSensitivityMs =
    midM1?.delayMs !== undefined && midM1?.delayMs !== null && midM3?.delayMs !== undefined && midM3?.delayMs !== null
      ? Number(Math.abs(midM3.delayMs - midM1.delayMs).toFixed(4))
      : null;

  console.log('\n\nDE FIT-ONZEKERHEID — hoeveel van een restfasefout kan de MERGE zijn?');
  console.log('='.repeat(110));
  console.log('| bestand | weg | splice-band Hz | gain dB | vertraging ms | residu ° rms | residu → ms |');
  for (const f of [...fits, ...(midM1 ? [midM1] : [])]) {
    console.log(
      `| ${f.file} | ${f.driver} | ${f.spliceBandHz?.join('–') ?? '—'} | ${f.gainDb ?? '—'} | ` +
        `${f.delayMs ?? '—'} | ${f.residualDeg ?? '—'} | ${f.residualDelayMs ?? '—'} |`,
    );
  }
  const crossings = rows[0]?.base.crossings ?? [];
  /**
   * BOVEN DE SPLICE DRAAGT EEN MERGE-FIT NIETS, en dat weglaten zou het
   * gevaarlijkste soort getal opleveren dat dit project kent: een plausibel
   * verkeerd getal (A3h). Boven de bovenkant van zijn splice-band IS de merge
   * het verre veld zelf — M-3 mat dat exact (0,00° boven 800 Hz) — dus de
   * gefitte vertraging raakt daar geen enkele graad. De omrekening geldt dus
   * alleen voor een overname die ONDER de splice van minstens één van zijn twee
   * wegen ligt.
   */
  const spliceTopOf = (driver: string): number | null => {
    const tops = fits.filter((f) => f.driver === driver).map((f) => f.spliceBandHz?.[1] ?? 0);
    return tops.length > 0 ? Math.max(...tops) : null;
  };
  const appliesAt = (pair: string, hz: number): boolean =>
    pair.split('→').some((d) => {
      const top = spliceTopOf(d);
      return top !== null && hz < top;
    });
  const say = (label: string, ms: number, why: string): void => {
    console.log(`\n${label}${why}`);
    for (const c of crossings) {
      console.log(
        appliesAt(c.pair, c.hz)
          ? `      → ${degOf(ms, c.hz).toFixed(1)}° relatieve fase bij ${c.hz.toFixed(0)} Hz (${c.pair})`
          : `      → ${c.pair} @ ${c.hz.toFixed(0)} Hz: NIET VAN TOEPASSING — boven de splice van beide ` +
              'wegen is de merge het verre veld zelf, dus de fit draagt daar geen enkele graad',
      );
    }
  };
  if (modelSensitivityMs !== null) {
    say(
      '(a) GEMETEN GEVOELIGHEID: ',
      modelSensitivityMs,
      `de mid-merge van M-1 en die van M-3 zijn dezelfde twee metingen met één modelfactor anders, ` +
        `en hun gefitte vertraging verschilt ${modelSensitivityMs} ms.`,
    );
  }
  const residualMs = Math.max(...fits.map((f) => f.residualDelayMs ?? 0));
  if (residualMs > 0) {
    say(
      '(b) EIGEN RESIDU: ',
      residualMs,
      `de slechtste splice-fit laat ${residualMs} ms vertraging onverklaard (residu gedeeld door de bandbreedte).`,
    );
  }

  writeFileSync(
    OUT,
    JSON.stringify(
      {
        _:
          'M-4 — de vergelijkingstabel. Klasse B: elk getal is een functie van de meetset en een ' +
          'netlist-bestand, gemeten door één bank. Geen zoektocht erin. Zie ' +
          'scripts/measure-m4-comparison.ts.',
        gemeten_op: new Date().toISOString().slice(0, 10),
        meetset: 'm3',
        spoor_octaven: TRACE_OCTAVES,
        paren: rows.map((r) => ({ kruispunt_hz: r.lowHz, basis: r.base, fase: r.phase })),
        fit_onzekerheid: {
          _:
            'De fase onder de splice komt uit een MERGE, en een merge fit een niveau, een PURE ' +
            'VERTRAGING en een offset. Die vertraging is een modelparameter en geen gemeten ' +
            'aankomsttijd, dus een restfasefout van een paar graden bij de overname kan er ' +
            'vandaan komen. Twee onafhankelijke schattingen, allebei uit de bestandskoppen.',
          merges: [...fits, ...(midM1 ? [midM1] : [])],
          model_gevoeligheid_ms: modelSensitivityMs,
          model_gevoeligheid_waarom:
            `${MID_M1_FILE} (M-1) en ${MID_M3_FILE} (M-3) zijn dezelfde NF en dezelfde FF met ` +
            'precies één factor anders: de fasewiskunde van het stapmodel. Er is geen nieuwe ' +
            'meting tussen, dus dit verschil is wat een MODELKEUZE alleen al aan de gefitte ' +
            'vertraging verzet.',
          residu_gevoeligheid_ms: residualMs > 0 ? residualMs : null,
          graden_bij_overname: crossings.map((c) => {
            const applies = appliesAt(c.pair, c.hz);
            return {
              paar: c.pair,
              hz: c.hz,
              van_toepassing: applies,
              van_toepassing_waarom: applies
                ? 'de overname ligt ONDER de splice van minstens één van haar twee wegen, dus de gefitte vertraging draagt er fase'
                : 'de overname ligt BOVEN de splice van beide wegen; daar IS de merge het verre veld zelf (M-3 mat 0,00°), dus de fit draagt er niets',
              model_graden:
                applies && modelSensitivityMs !== null
                  ? Number(degOf(modelSensitivityMs, c.hz).toFixed(1))
                  : null,
              residu_graden: applies && residualMs > 0 ? Number(degOf(residualMs, c.hz).toFixed(1)) : null,
            };
          }),
        },
      },
      null,
      1,
    ),
  );
  console.log(`\nwritten to ${OUT}`);
}

main();
