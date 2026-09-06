/**
 * A5e.3c — DE TABEL PER KANDIDAAT OP HET VELD ONDER DE A5e.3b-GRENZEN, GEPAARD
 * TEGEN HET BEVROREN A5e.3-VELD, MET DE ABLATIE-ARM EN HUIDIG ERNAAST.
 *
 * `npx vite-node scripts/measure-a5e3c-field.ts` — seconden, geen ketenrun en
 * geen enkele tune. Élke rij door dezelfde meetbank (`corpusBank(golden,
 * 'merged')`: de gemergede set, de doelcurve van het ontwerp, de gestelde
 * eisen, het gestelde DCR-model), zodat élke kolom hetzelfde meet ongeacht uit
 * welke run een netlist kwam. Vier soorten rijen:
 *
 *   · het LEVENDE corpus (A5e.3c): élke kandidaat van het veld in de volgorde
 *     van de generator — GELEVERD met de volle vector, of GEWEIGERD met de
 *     grond en wat de geweigerde tune nog mat (min |Z|, RMS, M-C, Y, en de
 *     spoelen van het geweigerde netwerk: de vraag van deze sessie is of er
 *     lage W-M-kruisingen met BOUWBARE spoelen bestaan, en het antwoord staat
 *     ook in wat geweigerd is). GELEVERD MAAR NIET BEVROREN is een derde
 *     toestand, en A5e.3c is de eerste regeneratie waarin zij voorkomt: de
 *     shortlist houdt `DEFAULT_SHORTLIST_SIZE` ontwerpen en kiest die op
 *     spreiding (`selectDiverse`), dus een veld dat er méér levert laat er
 *     liggen — geen weigering, geen poort, alleen de grootte van de lijst. Die
 *     netwerken bestaan alleen in de shards van de generator
 *     (`test-fixtures/.casus1-v2-shards/`, niet in de repo); zijn zij er, dan
 *     staan zij hier als volle rij en reist hun vector mee in het JSON, zodat
 *     de tabel ook zonder de shards leesbaar blijft;
 *   · het GEDATEERDE A5e.3-veld (`A5E3VELD_KAND_*`, de "vóór"-helft);
 *   · de A5e.3b-ablatie-arm "bouwbare val" (354,9 · 1994,6 met L op de
 *     spanwijdte 22,0 mH geklemd), uit `casus1_a5e3b_ablatie/bouwbaar.json` —
 *     het netwerk dat Sanders keuze voor deze regeneratie voorspelde;
 *   · HUIDIG, "met pad", op zijn eigen kruispunt.
 *
 * PER KANDIDAAT (de opdracht van de sessie): geleverd/geweigerd met grond;
 * kruispunt gesteld → geleverd; min |Z| met tak en frequentie; twee
 * RMS-kolommen (volle oordeelband vanaf f_p / vanaf de tweeter-gate op 397 Hz);
 * M-K per paar; M-C per weg met grens; opslingering en lift; dissipatie en de
 * heetste weerstand bij 10 W; KOPER PER WEG en de DCR per spoel; de VAL
 * (L/C/f₀/demping); de lobing-synthese; het aantal onderdelen; de BOM uit de
 * catalogus die de families stellen.
 *
 * DE BOM IS EEN KOLOM EN GEEN OORDEEL: de goedkoopste catalogusrealisatie
 * binnen ±5 % per onderdeel — spoelen uit de GESTELDE familie van hun weg (één
 * onderdeel, anders een stapel van twee en dan zegt de kolom dat), condensatoren
 * uit élke serie (parallel tot drie), weerstanden (één, anders twee in serie).
 * Dezelfde regels als `measure-a5e3b-ablatie.ts`, nu over het hele netwerk.
 *
 * GEPAARD TEGEN A5e.3-veld OP LABEL WAAR DAT KAN, ANDERS OP HET DICHTSTBIJZIJNDE
 * KRUISPUNT MET DE AFSTAND ERBIJ. De M-T-as verhuisde (1294–2304 → 1647–2304)
 * en de W-M-as kreeg acht posities in plaats van vier, dus een label-paar is
 * de uitzondering; de gepaarde lezing van `corpusPairing` zegt n op label en
 * wat hier "gepaard" heet is per rij zo gelabeld — een anekdote per rij, geen
 * corpusdelta.
 *
 * Schrijft `test-fixtures/casus1_a5e3c_veld_tabel.json`. Stelt niets, wijzigt
 * niets.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logspace, resampleImpedance } from '../src/lib/dsp.ts';
import type { Complex } from '../src/lib/complex.ts';
import { solveNetwork } from '../src/lib/network.ts';
import { meetsAmpFloor } from '../src/lib/impedanceFloor.ts';
import { crossoverToNetlist } from '../src/lib/vxpNetwork.ts';
import type { VxpCrossover, VxpPart } from '../src/lib/parsers/vxp.ts';
import { deserializeFilter } from '../src/lib/filterFile.ts';
import { coilDcrInventory } from '../src/lib/coilDcr.ts';
import { judgeResponse } from '../src/lib/engine2/requirements/response.ts';
import { buildReport, type EngineV2Report } from '../src/lib/engine2/report.ts';
import { decompose, type Group } from './v38-groups.ts';
import { CASUS1_DIR, casus1CoilCatalogPath, casus1FilterFromParts, loadGolden } from '../src/lib/engine2/casus1.fixture.ts';
import {
  CASUS1_COIL_DCR,
  CASUS1_COIL_FAMILY_BY_DRIVER,
  CASUS1_LOWEST_WAY_COIL_SPAN_H,
  CASUS1_TARGET_CURVE,
  CASUS1_THERMAL_DESIGN_POWER_W,
  CASUS1_V2_BAND_HZ,
} from '../src/lib/engine2/casus1V2.fixture.ts';
import { corpusBank, corpusOf, round2 } from '../src/lib/engine2/casus1Corpora.fixture.ts';
import { DEFAULT_SHORTLIST_SIZE } from '../src/lib/engine2/constants.ts';

/** Het raster van de takanalyse: het hele hoorbare bereik, fijn genoeg voor een smalle dip (M-1-diagnose). */
const DIAG_GRID_HZ: [number, number] = [20, 20000]; // P6-OK: audiobereik, geen projectgetal
const DIAG_GRID_POINTS = 600;
/** Tolerantie waarbinnen een BOM-realisatie de waarde moet dekken (dezelfde als de ablatie). */
const BOM_TOLERANCE = 0.05;
/** Een val zit in het reflexgebied van de woofer: een shunt-L+C op de wooferbus onder deze frequentie (dezelfde regel als de ablatie). */
const TRAP_BELOW_HZ = 100; // P6-OK: scriptheuristiek voor de takanalyse, geen engine-getal
/** Het bestand van de A5e.3b-ablatie-arm die Sanders keuze voorspelde. */
const ARM_FILE = 'bouwbaar.json';
const ARM_LABEL = 'A5e.3b-arm bouwbare val (354,9 · 1994,6, L ≤ 22 mH)';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'test-fixtures', 'casus1_a5e3c_veld_tabel.json');
const golden = loadGolden();
const bank = corpusBank(golden, 'merged');
const netlists = (golden.manifest_en_geometrie as { netlists: Record<string, string> }).netlists;
const FLOOR = bank.floorOhm;
const grid = logspace(DIAG_GRID_HZ[0], DIAG_GRID_HZ[1], DIAG_GRID_POINTS);
const driverZ: Record<string, Complex[]> = (() => {
  const probe = casus1FilterFromParts('probe', [], bank.manifest, bank.files);
  const out: Record<string, Complex[]> = {};
  for (const [drv, z] of Object.entries(probe.driverZ)) out[drv] = resampleImpedance(z.freq, z.magnitude, z.phaseDeg, grid).z;
  return out;
})();

const f2 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(2));
const f1 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(1));
const f0 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(0));

const partsOf = (key: string): VxpPart[] => deserializeFilter(readFileSync(join(CASUS1_DIR, netlists[key]), 'utf-8')).parts;

/* ---- de boekhouding van de generator, mét de velden die de fixture niet typt -- */
interface HerkomstOutcome {
  label: string;
  /** `net.after.rippleDb` / `.phaseDeg` — the TUNER'S OWN figures, what the generator's summary line prints; not an RMS. */
  rimpel_dB: number;
  fase_graden: number;
  geweigerd_door: string[];
  verwerping: { regels: string[]; reden: string; geweigerde_tune: Record<string, number | null> | null } | null;
  niveauwerk: { vloer_ohm: number | null; vloer_vraagt_serie_R_ohm: number | null; vloer_vraagt_toelichting: string | null; geleverd_serie_R_totaal_ohm: number | null };
  spoel_dcr: { totaal_ohm: number; per_spoel: { id: string; weg: string; mH: number; dcr_ohm: number; binnen_bereik: boolean | null }[]; buiten_bereik: string[] } | null;
  pas: { evaluaties: number; vloerbron: string | null };
}
const HERKOMST = JSON.parse(readFileSync(join(CASUS1_DIR, '..', 'casus1_v2_herkomst.json'), 'utf-8')) as {
  kandidaat_uitkomst: HerkomstOutcome[];
  shortlist: { overwogen: number; leverde_geen_netwerk: number; bevroren: number };
  meetopstelling: { vloer_zoekdoel_bron: string | null; spoel_spanwijdte_plafond_mH: number | null };
};

/* ---- |Z| per tak: de tak alleen aan de generator (M-1-diagnose) ---------- */
function solveMin(parts: readonly VxpPart[]): { ohm: number; hz: number; idx: number; mag: number[] } | null {
  try {
    const { netlist } = crossoverToNetlist({ name: 'tab', parts: [...parts] } as VxpCrossover);
    const mag = solveNetwork(netlist, grid, driverZ).inputZ.map((c) => Math.hypot(c.re, c.im));
    let i = 0;
    for (let k = 1; k < mag.length; k++) if (mag[k] < mag[i]) i = k;
    return { ohm: mag[i], hz: grid[i], idx: i, mag };
  } catch {
    return null;
  }
}
function branchOnly(parts: readonly VxpPart[], groups: readonly Group[], branch: string): VxpPart[] {
  const keep = new Set<string>();
  for (const g of groups) if (g.branch === branch) for (const id of g.partIds) keep.add(id);
  return parts.filter(
    (p) => p.type === 'Generator' || p.type === 'Ground' || p.type === 'Wire' || (p.type === 'Driver' && p.model === branch) || (p.partId !== undefined && keep.has(p.partId)),
  );
}
function minZWithBranch(parts: readonly VxpPart[]): { ohm: number; hz: number; branch: string; perBranch: Record<string, number> } | null {
  const sum = solveMin(parts);
  if (!sum) return null;
  const groups = decompose(parts);
  const branches = [...new Set(groups.map((g) => g.branch).filter((b) => b !== ''))];
  const perBranch: Record<string, number> = {};
  for (const b of branches) {
    const c = solveMin(branchOnly(parts, groups, b));
    if (c) perBranch[b] = c.mag[sum.idx];
  }
  const lowest = Object.entries(perBranch).sort((a, b) => a[1] - b[1])[0];
  return { ohm: sum.ohm, hz: sum.hz, branch: lowest ? lowest[0] : '?', perBranch };
}

/* ---- BOM: de goedkoopste catalogusrealisatie, per onderdeel --------------- */
interface CatComp {
  sku: string;
  brand: string;
  series: string;
  kind: string;
  value: number;
  gauge?: number;
  dcr?: number;
  price: number;
}
const catalog: CatComp[] = (() => {
  const p = casus1CoilCatalogPath(golden);
  if (p === null) return [];
  return (JSON.parse(readFileSync(p, 'utf-8')) as { components: CatComp[] }).components;
})();
/** De catalogusleden van één gestelde familie (`<merk>|<serie>|<draaddikte>` in kleine letters, de sleutel van coilDcr.ts). */
function familyMembers(family: string): CatComp[] {
  const [brand, series, gauge] = family.split('|');
  return catalog.filter(
    (p) => p.kind === 'L' && p.brand.toLowerCase() === brand && p.series.toLowerCase() === series && (p.gauge === undefined ? gauge === '' : Math.abs(p.gauge - Number(gauge)) < 0.005),
  );
}
interface Realisation {
  label: string;
  eur: number;
  /** Meer dan één onderdeel voor één waarde: een stapel (spoel), een bank (condensator) of een serie (weerstand). */
  count: number;
}
function coilBom(mH: number, family: string | null): Realisation | null {
  if (family === null) return null;
  const fam = familyMembers(family);
  const target = mH * 1e-3;
  const ok = (v: number) => Math.abs(v / target - 1) <= BOM_TOLERANCE;
  let best: Realisation | null = null;
  for (const a of fam) if (ok(a.value) && (!best || a.price < best.eur)) best = { label: `${a.sku} ${(a.value * 1e3).toFixed(2)} mH`, eur: a.price, count: 1 };
  if (best) return best;
  for (const a of fam) {
    for (const b of fam) {
      if (a.sku > b.sku) continue;
      const v = a.value + b.value;
      const eur = a.price + b.price;
      if (ok(v) && (!best || eur < best.eur)) best = { label: `${a.sku} + ${b.sku} = ${(v * 1e3).toFixed(2)} mH (stapel)`, eur, count: 2 };
    }
  }
  return best;
}
function capBom(uF: number): Realisation | null {
  const target = uF * 1e-6;
  const caps = catalog.filter((p) => p.kind === 'C' && p.value <= target * (1 + BOM_TOLERANCE));
  const ok = (v: number) => Math.abs(v / target - 1) <= BOM_TOLERANCE;
  let best: Realisation | null = null;
  const consider = (parts: CatComp[]) => {
    const v = parts.reduce((s, p) => s + p.value, 0);
    if (!ok(v)) return;
    const eur = parts.reduce((s, p) => s + p.price, 0);
    if (!best || eur < best.eur) best = { label: parts.map((p) => p.sku).join(' + ') + ` = ${(v * 1e6).toFixed(1)} µF`, eur, count: parts.length };
  };
  for (const a of caps) consider([a]);
  const big = caps.filter((p) => p.value >= target / 3.2);
  for (let i = 0; i < big.length; i++) {
    for (let j = i; j < big.length; j++) {
      consider([big[i], big[j]]);
      for (let k = j; k < big.length; k++) consider([big[i], big[j], big[k]]);
    }
  }
  return best;
}
function resBom(ohm: number): Realisation | null {
  const rs = catalog.filter((p) => p.kind === 'R');
  const ok = (v: number) => Math.abs(v / ohm - 1) <= BOM_TOLERANCE;
  let best: Realisation | null = null;
  for (const a of rs) if (ok(a.value) && (!best || a.price < best.eur)) best = { label: `${a.sku} ${a.value} Ω`, eur: a.price, count: 1 };
  if (best) return best;
  for (const a of rs) {
    for (const b of rs) {
      if (a.sku > b.sku) continue;
      const v = a.value + b.value;
      const eur = a.price + b.price;
      if (ok(v) && (!best || eur < best.eur)) best = { label: `${a.sku} + ${b.sku} = ${v.toFixed(2)} Ω (serie)`, eur, count: 2 };
    }
  }
  return best;
}
interface Bom {
  eur: number;
  parts: number;
  /** Onderdelen die geen realisatie binnen ±5 % hebben — de BOM is dan een ONDERGRENS. */
  unrealised: string[];
  /** Waarden die meer dan één catalogusonderdeel vragen (stapel / bank / serie). */
  multi: string[];
  items: { id: string; label: string; eur: number }[];
}
function bomOf(parts: readonly VxpPart[], familyOfCoil: (id: string) => string | null): Bom {
  const items: Bom['items'] = [];
  const unrealised: string[] = [];
  const multi: string[] = [];
  const val = (p: VxpPart, name: string): number | null => {
    const v = p.params.find((q) => q.name === name)?.value;
    return typeof v === 'number' ? v : null;
  };
  for (const p of parts) {
    if (p.partId === undefined || p.open || p.shorted) continue;
    let r: Realisation | null = null;
    if (p.type === 'Inductor') {
      const mH = val(p, 'L');
      r = mH === null ? null : coilBom(mH, familyOfCoil(p.partId));
    } else if (p.type === 'Capacitor') {
      const uF = val(p, 'C');
      r = uF === null ? null : capBom(uF);
    } else if (p.type === 'Resistor') {
      const ohm = val(p, 'R');
      r = ohm === null ? null : resBom(ohm);
    } else continue;
    if (!r) {
      unrealised.push(p.partId);
      continue;
    }
    if (r.count > 1) multi.push(`${p.partId} (${r.count})`);
    items.push({ id: p.partId, label: r.label, eur: r.eur });
  }
  return { eur: items.reduce((s, i) => s + i.eur, 0), parts: items.length + unrealised.length, unrealised, multi, items };
}

/* ---- de val op de wooferbus --------------------------------------------- */
interface Trap {
  ids: string[];
  lMh: number | null;
  cUf: number | null;
  rOhm: number | null;
  dcrOhm: number | null;
  f0Hz: number | null;
  q: number | null;
}
function trapsOf(parts: readonly VxpPart[], lowestWay: string): Trap[] {
  const groups = decompose(parts);
  const val = (id: string, name: string): number | null => {
    const p = parts.find((q) => q.partId === id);
    const v = p?.params.find((q) => q.name === name)?.value;
    return typeof v === 'number' ? v : null;
  };
  const active = (id: string): boolean => {
    const p = parts.find((q) => q.partId === id);
    return p !== undefined && !p.open && !p.shorted;
  };
  return groups
    .filter((g) => g.position === 'shunt' && g.branch === lowestWay && g.fHz !== null && g.fHz < TRAP_BELOW_HZ && g.partIds.some((id) => id.startsWith('L') && active(id)))
    .map((g) => {
      const l = g.partIds.find((id) => id.startsWith('L') && active(id)) ?? null;
      const c = g.partIds.find((id) => id.startsWith('C') && active(id)) ?? null;
      const r = g.partIds.find((id) => id.startsWith('R') && active(id)) ?? null;
      return {
        ids: g.partIds.filter(active),
        lMh: l ? val(l, 'L') : null,
        cUf: c ? val(c, 'C') : null,
        rOhm: r ? val(r, 'R') : null,
        dcrOhm: l ? val(l, 'DCR') : null,
        f0Hz: g.fHz,
        q: g.q,
      };
    });
}

/* De shards van de generator, als zij er nog staan: de enige plek waar een
 * geleverd-maar-niet-bevroren netwerk bestaat (gitignored). */
const SHARD_DIR = join(HERE, '..', 'test-fixtures', '.casus1-v2-shards');
const shards: { label: string; seconds: number; parts: VxpPart[] }[] = existsSync(SHARD_DIR)
  ? readdirSync(SHARD_DIR)
      .filter((x) => x.endsWith('.json'))
      .map((f) => {
        const s = JSON.parse(readFileSync(join(SHARD_DIR, f), 'utf-8')) as { label: string; seconds: number; row: { parts: VxpPart[] } };
        return { label: s.label, seconds: s.seconds, parts: s.row.parts };
      })
  : [];
const shardParts = (label: string): VxpPart[] | null => shards.find((s) => s.label === label)?.parts ?? null;
function shardSecondsOf(label: string): number | null {
  return shards.find((s) => s.label === label)?.seconds ?? null;
}
/* ---- één rij --------------------------------------------------------------- */
interface Row {
  key: string | null;
  corpus: string;
  label: string;
  statedHz: [number, number] | null;
  delivered: boolean;
  ground: string | null;
  crossingsHz: number[];
  minZ: { ohm: number; hz: number; branch: string; perBranch: Record<string, number> } | null;
  floorOk: boolean | null;
  gateMinZ: number | null;
  rmsFull: number | null;
  windowFull: number | null;
  rms397: number | null;
  window397: number | null;
  band397: [number, number] | null;
  mk: { pair: string; deg: number }[];
  mc: { way: string; db: number; limit: number | null; pass: boolean }[];
  resonantDb: number | null;
  liftDb: number | null;
  qesMult: number | null;
  dissPct: number | null;
  hottestThermalW: number | null;
  hottestAllowedW: number | null;
  hottestId: string | null;
  hottestContinuousW: number | null;
  coilPeakA: number | null;
  epdr: number | null;
  lobingDipDb: number | null;
  levelWork: { seriesOhm: number; dcrOhm: number; totalSeriesOhm: number; none: boolean; verdictOk: boolean | null } | null;
  askedDb: number | null;
  dcrTotalOhm: number;
  copperByWay: Record<string, number>;
  coils: { id: string; way: string; mH: number; dcrOhm: number; fitOhm: number | null; inRange: boolean | null }[];
  maxLowestWayCoilMh: number | null;
  traps: Trap[];
  partCount: number;
  bom: Bom | null;
  parts: { id: string; type: string; value: string }[];
  /** De tuner-rimpel (net.after.rippleDb, piek-tot-piek tegen het trapdoel van 2,5) en -fase — het getal dat de monitor afdrukt; GEEN RMS. */
  tunerRippleDb: number | null;
  tunerPhaseDeg: number | null;
  /** Looptijd van de kandidaat in de generator, seconden — uit de shard (gitignored); null zonder shard. */
  seconds: number | null;
  /** Op een verwerping: wat de geweigerde tune nog mat, uit de boekhouding van de generator. */
  refused: { minZOhm: number | null; rmsDeviationDb: number | null; windowPlusMinusDb: number | null; driveOnFsDb: number | null; yOhm: number | null; yNote: string | null; coils: { id: string; weg: string; mH: number; dcr_ohm: number; binnen_bereik: boolean | null }[] } | null;
  evaluations: number | null;
}

const hzOf = (label: string): [number, number] | null => {
  const m = label.match(/woofer→mid ([\d.]+) .*mid→tweeter ([\d.]+)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
};

function measureParts(corpus: string, label: string, key: string | null, parts: VxpPart[], rep: EngineV2Report, outcome: HerkomstOutcome | null): Row {
  const inv = coilDcrInventory(parts, CASUS1_COIL_DCR.model);
  const gateZ = rep.gates.verdicts.find((v) => v.gate === 'M-B/|Z|');
  const full = rep.analysisGrid && rep.system.sumDb ? judgeResponse(rep.analysisGrid, rep.system.sumDb, CASUS1_TARGET_CURVE, CASUS1_V2_BAND_HZ) : null;
  const r = rep.gates.verdicts.find((v) => v.gate === 'M-A/part');
  const l = rep.gates.verdicts.find((v) => v.gate === 'M-L');
  const hottestEl = rep.metrics.dissipation?.elements.find((e) => !e.parasitic && e.id === r?.parameters?.element) ?? null;
  const lw = rep.predesign.levelWork;
  const lowestWay = lw?.lowestWay ?? 'woofer';
  const value = (p: VxpPart): string => {
    const v = p.params.find((q) => q.name === 'L' || q.name === 'C' || q.name === 'R' || q.name === 'Eg');
    return v ? `${v.value} ${v.unit ?? ''}`.trim() : '';
  };
  const copperByWay: Record<string, number> = {};
  for (const c of inv.coils) {
    const way = c.ways.join('+');
    copperByWay[way] = (copperByWay[way] ?? 0) + c.carriedOhm;
  }
  const familyOfCoil = (id: string): string | null => {
    const c = inv.coils.find((x) => x.id === id);
    const way = c?.ways[0];
    return way ? CASUS1_COIL_FAMILY_BY_DRIVER[way] ?? null : null;
  };
  const lowestCoils = inv.coils.filter((c) => c.ways.includes(lowestWay));
  return {
    key,
    corpus,
    label,
    statedHz: hzOf(label),
    delivered: true,
    ground: outcome && outcome.geweigerd_door.length > 0 ? `poort: ${outcome.geweigerd_door.join(', ')}` : null,
    crossingsHz: rep.crossings.map((c) => c.fHz),
    minZ: minZWithBranch(parts),
    floorOk: gateZ && gateZ.value !== null && FLOOR !== null ? meetsAmpFloor(gateZ.value, FLOOR) : null,
    gateMinZ: gateZ?.value ?? null,
    rmsFull: full?.rmsDeviationDb ?? null,
    windowFull: full?.windowPlusMinusDb ?? null,
    rms397: rep.system.response?.rmsDeviationDb ?? null,
    window397: rep.system.response?.windowPlusMinusDb ?? null,
    band397: rep.system.response?.bandHz ?? null,
    mk: rep.system.phaseTracking.map((p) => ({ pair: `${p.lower}→${p.upper}`, deg: p.meanAbsDeg })),
    mc: rep.gates.verdicts.filter((v) => v.gate === 'M-C' && v.value !== null).map((v) => ({ way: v.subject, db: v.value as number, limit: v.limit, pass: v.pass })),
    resonantDb: rep.metrics.lfBump[0]?.result.resonantDb ?? null,
    liftDb: rep.metrics.lfBump[0]?.result.liftDb ?? null,
    qesMult: [...rep.metrics.thevenin].sort((a, b) => (a.atHz ?? Infinity) - (b.atHz ?? Infinity))[0]?.qMultiplier ?? null,
    dissPct: rep.metrics.dissipation ? rep.metrics.dissipation.totalFraction * 100 : null,
    hottestThermalW: r?.value ?? null,
    hottestAllowedW: r?.limit ?? null,
    hottestId: (r?.parameters?.element as string | undefined) ?? null,
    hottestContinuousW: hottestEl?.watts ?? null,
    coilPeakA: l?.value ?? null,
    epdr: rep.metrics.epdr?.minOhm ?? null,
    lobingDipDb: rep.metrics.lobingFinal?.worstDipInCrossoverDb ?? rep.metrics.lobingFinal?.worstDipDb ?? null,
    levelWork: lw?.delivered
      ? { seriesOhm: lw.delivered.seriesOhm, dcrOhm: lw.delivered.dcrOhm, totalSeriesOhm: lw.delivered.totalSeriesOhm, none: lw.delivered.none, verdictOk: lw.verdict?.ok ?? null }
      : null,
    askedDb: lw?.aboveAnchorDb ?? null,
    dcrTotalOhm: inv.carriedTotalOhm,
    copperByWay,
    coils: inv.coils.map((c) => ({ id: c.id, way: c.ways.join('+'), mH: c.henry * 1e3, dcrOhm: c.carriedOhm, fitOhm: c.fitOhm, inRange: c.inRange })),
    maxLowestWayCoilMh: lowestCoils.length ? Math.max(...lowestCoils.map((c) => c.henry * 1e3)) : null,
    traps: trapsOf(parts, lowestWay),
    partCount: parts.filter((p) => p.partId !== undefined && !p.open && !p.shorted && (p.type === 'Inductor' || p.type === 'Capacitor' || p.type === 'Resistor')).length,
    bom: catalog.length ? bomOf(parts, familyOfCoil) : null,
    parts: parts.filter((p) => p.partId !== undefined && p.type !== 'Wire').map((p) => ({ id: p.partId!, type: p.type, value: value(p) })),
    tunerRippleDb: outcome?.rimpel_dB ?? null,
    tunerPhaseDeg: outcome?.fase_graden ?? null,
    seconds: outcome ? shardSecondsOf(outcome.label) : null,
    refused: null,
    evaluations: outcome?.pas.evaluaties ?? null,
  };
}
function measureKey(corpus: string, label: string, key: string, outcome: HerkomstOutcome | null = null): Row {
  return measureParts(corpus, label, key, partsOf(key), bank.report(key), outcome);
}
function refusedRow(corpus: string, o: HerkomstOutcome, ground?: string): Row {
  const t = o.verwerping?.geweigerde_tune ?? null;
  return {
    key: null,
    corpus,
    label: o.label,
    statedHz: hzOf(o.label),
    delivered: false,
    ground: ground ?? `${(o.verwerping?.regels ?? []).join('+')}: ${o.verwerping?.reden ?? '?'}`,
    crossingsHz: [],
    minZ: null,
    floorOk: null,
    gateMinZ: null,
    rmsFull: null,
    windowFull: null,
    rms397: null,
    window397: null,
    band397: null,
    mk: [],
    mc: [],
    resonantDb: null,
    liftDb: null,
    qesMult: null,
    dissPct: null,
    hottestThermalW: null,
    hottestAllowedW: null,
    hottestId: null,
    hottestContinuousW: null,
    coilPeakA: null,
    epdr: null,
    lobingDipDb: null,
    levelWork: null,
    askedDb: null,
    dcrTotalOhm: o.spoel_dcr?.totaal_ohm ?? 0,
    copperByWay: (() => {
      const out: Record<string, number> = {};
      for (const c of o.spoel_dcr?.per_spoel ?? []) out[c.weg] = (out[c.weg] ?? 0) + c.dcr_ohm;
      return out;
    })(),
    coils: (o.spoel_dcr?.per_spoel ?? []).map((c) => ({ id: c.id, way: c.weg, mH: c.mH, dcrOhm: c.dcr_ohm, fitOhm: null, inRange: c.binnen_bereik })),
    maxLowestWayCoilMh: (() => {
      const w = (o.spoel_dcr?.per_spoel ?? []).filter((c) => c.weg.split('+').includes('woofer'));
      return w.length ? Math.max(...w.map((c) => c.mH)) : null;
    })(),
    traps: [],
    partCount: 0,
    bom: null,
    parts: [],
    tunerRippleDb: o.rimpel_dB ?? null,
    tunerPhaseDeg: o.fase_graden ?? null,
    seconds: shardSecondsOf(o.label),
    refused: {
      minZOhm: t?.minZOhm ?? null,
      rmsDeviationDb: t?.rmsDeviationDb ?? null,
      windowPlusMinusDb: t?.windowPlusMinusDb ?? null,
      driveOnFsDb: t?.driveOnFsDb ?? null,
      yOhm: o.niveauwerk.vloer_vraagt_serie_R_ohm,
      yNote: o.niveauwerk.vloer_vraagt_toelichting,
      coils: o.spoel_dcr?.per_spoel ?? [],
    },
    evaluations: o.pas.evaluaties,
  };
}

/* ---- de rijen --------------------------------------------------------------- */
const live = corpusOf('live');
const dated = corpusOf('a5e3veld');
const LIVE_NAME = 'A5e.3c';
const DATED_NAME = 'A5e.3-veld';
const rows: Row[] = [];
const NOT_FROZEN = `${LIVE_NAME} (geleverd, niet bevroren)`;
const notFrozenGround = `GELEVERD, NIET BEVROREN — de shortlist houdt ${DEFAULT_SHORTLIST_SIZE} ontwerpen en koos op spreiding (selectDiverse); geen poort en geen eis`;
for (const o of HERKOMST.kandidaat_uitkomst) {
  const key = live.byCandidate.get(o.label);
  if (key && o.verwerping === null) rows.push(measureKey(LIVE_NAME, o.label, key, o));
  else if (o.verwerping === null) {
    const p = shardParts(o.label);
    if (p) {
      const r = measureParts(NOT_FROZEN, o.label, null, p, buildReport({ manifest: bank.manifest, files: bank.files, filter: casus1FilterFromParts('shard', p, bank.manifest, bank.files), geometry: bank.geometry, settings: bank.settings }), o);
      r.ground = notFrozenGround;
      rows.push(r);
    } else rows.push(refusedRow(NOT_FROZEN, o, `${notFrozenGround}; het netwerk staat alleen in de shards en die ontbreken`));
  } else rows.push(refusedRow(LIVE_NAME, o));
}
for (const label of dated.order) rows.push(measureKey(DATED_NAME, label, dated.byCandidate.get(label)!));
const armParts = (JSON.parse(readFileSync(join(HERE, '..', 'test-fixtures', 'casus1_a5e3b_ablatie', ARM_FILE), 'utf-8')) as { parts: VxpPart[] }).parts;
rows.push(
  measureParts(
    'A5e.3b-arm',
    ARM_LABEL,
    null,
    armParts,
    buildReport({ manifest: bank.manifest, files: bank.files, filter: casus1FilterFromParts('bouwbaar', armParts, bank.manifest, bank.files), geometry: bank.geometry, settings: bank.settings }),
    null,
  ),
);
rows.push(measureKey('HUIDIG (met pad)', 'HUIDIG', 'HUIDIG'));

/* ---- gepaard: op label waar dat kan, anders het dichtstbijzijnde kruispunt ---- */
const datedRows = rows.filter((r) => r.corpus === DATED_NAME);
const pairOf = (r: Row): { row: Row; onLabel: boolean; distOct: number } | null => {
  const a = r.statedHz;
  if (!a) return null;
  const exact = datedRows.find((d) => d.label === r.label);
  if (exact) return { row: exact, onLabel: true, distOct: 0 };
  let best: { row: Row; d: number } | null = null;
  for (const c of datedRows) {
    const b = c.statedHz;
    if (!b) continue;
    const d = Math.abs(Math.log2(a[0] / b[0])) + Math.abs(Math.log2(a[1] / b[1]));
    if (!best || d < best.d) best = { row: c, d };
  }
  return best ? { row: best.row, onLabel: false, distOct: best.d } : null;
};

/* ---- de tabel --------------------------------------------------------------- */
const short = (label: string) => label.replace(/woofer→mid /, '').replace(/ LR4 · mid→tweeter /, ' · ').replace(/ LR4$/, '');
const mkCell = (r: Row) => (r.mk.length ? r.mk.map((m) => `${f1(m.deg)}`).join(' / ') : '—');
const mcCell = (r: Row) => (r.mc.length ? r.mc.map((m) => `${m.way} ${f1(m.db)} (${f1(m.limit)}${m.pass ? '' : ' ✗'})`).join(' / ') : r.refused?.driveOnFsDb !== null && r.refused?.driveOnFsDb !== undefined ? `geweigerde tune ${f1(r.refused.driveOnFsDb)}` : '—');
const zCell = (r: Row) => (r.minZ ? `${f2(r.minZ.ohm)} @ ${f0(r.minZ.hz)} in ${r.minZ.branch}${r.floorOk === null ? '' : r.floorOk ? ' ✓' : ' ✗'}` : r.refused ? `geweigerde tune ${f2(r.refused.minZOhm)}${r.refused.yOhm !== null ? ` (Y ${f2(r.refused.yOhm)})` : r.refused.yNote ? ' (Y —)' : ''}` : '—');
const copperCell = (r: Row) => {
  const ways = ['woofer', 'mid', 'tweeter'];
  const known = ways.map((w) => f2(r.copperByWay[w] ?? 0));
  const other = Object.keys(r.copperByWay).filter((w) => !ways.includes(w));
  return `${known.join(' / ')}${other.length ? ` (+${other.map((w) => `${w} ${f2(r.copperByWay[w])}`).join(', ')})` : ''}`;
};
const trapCell = (r: Row) => (r.traps.length ? r.traps.map((t) => `${f2(t.lMh)} mH / ${f0(t.cUf)} µF @ ${f0(t.f0Hz)} Hz${t.rOhm !== null ? ` + R ${f2(t.rOhm)}` : ''}${t.dcrOhm !== null ? ` (DCR ${f2(t.dcrOhm)})` : ''}`).join('; ') : r.delivered ? 'geen' : '—');
const bomCell = (r: Row) => (r.bom ? `${f0(r.bom.eur)}${r.bom.multi.length ? ` (${r.bom.multi.length}× meervoudig)` : ''}${r.bom.unrealised.length ? ` ONDERGRENS: ${r.bom.unrealised.join(', ')} zonder realisatie` : ''}` : '—');
const rmsCell = (r: Row) => (r.delivered ? `${f2(r.rmsFull)} / ±${f2(r.windowFull)}` : r.refused ? `geweigerde tune ${f2(r.refused.rmsDeviationDb)} / ±${f2(r.refused.windowPlusMinusDb)}` : '—');
const xoCell = (r: Row) => (r.delivered ? `${r.statedHz ? r.statedHz.map(f0).join(' · ') : '—'} → ${r.crossingsHz.map(f0).join(' · ')}` : r.statedHz ? r.statedHz.map(f0).join(' · ') : '—');
const groundCell = (r: Row) => (r.delivered ? (r.corpus === NOT_FROZEN ? r.ground ?? 'GELEVERD, NIET BEVROREN' : `GELEVERD${r.ground ? ` (${r.ground})` : ''}`) : r.corpus === NOT_FROZEN ? r.ground ?? '' : `GEWEIGERD — ${r.ground}`);

const spanMh = CASUS1_LOWEST_WAY_COIL_SPAN_H === null ? null : CASUS1_LOWEST_WAY_COIL_SPAN_H * 1e3;
console.log(
  `A5e.3c — per kandidaat, één meetbank (gemergede set, doelcurve ${CASUS1_TARGET_CURVE.type}, vloer ${FLOOR ?? '—'} Ω, M-A/part bij ${CASUS1_THERMAL_DESIGN_POWER_W ?? '—'} W); ` +
    `volle oordeelband ${CASUS1_V2_BAND_HZ.map((v) => v.toFixed(0)).join('–')} Hz, rapportband vanaf ${rows.find((r) => r.band397)?.band397?.[0].toFixed(0) ?? '?'} Hz; ` +
    `spanwijdte-plafond laagste weg ${spanMh === null ? '—' : spanMh.toFixed(1)} mH (herkomst: ${HERKOMST.meetopstelling.spoel_spanwijdte_plafond_mH ?? '—'}); barrière ${HERKOMST.meetopstelling.vloer_zoekdoel_bron ?? '—'}; ` +
    `veld ${HERKOMST.shortlist.overwogen} overwogen, ${HERKOMST.shortlist.leverde_geen_netwerk} geen netwerk, ${HERKOMST.shortlist.bevroren} bevroren`,
);
console.log('');
console.log(
  '| corpus | kandidaat | uitkomst (grond) | tuner-rimpel dB / fase ° (net.after — het monitorgetal, GEEN RMS) | looptijd s | kruispunt gesteld → geleverd Hz | min \\|Z\\| Ω @ Hz, tak | RMS volle band / ±venster | RMS vanaf 397 / ±venster | M-K W-M / M-T ° | M-C per weg dB (grens) | opslingering / lift dB | Q_es× | dissipatie % | heetste R W bij 10 W (toegestaan) | koper W / M / T Ω | grootste spoel laagste weg mH | val L / C @ f₀ (demping) | lobing dip dB | onderdelen | BOM € (catalogus) |',
);
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  console.log(
    `| ${r.corpus} | ${short(r.label)} | ${groundCell(r)} | ${r.tunerRippleDb === null ? '—' : `${f2(r.tunerRippleDb)} / ${f1(r.tunerPhaseDeg)}`} | ${f0(r.seconds)} | ${xoCell(r)} | ${zCell(r)} | ${rmsCell(r)} | ${r.delivered ? `${f2(r.rms397)} / ±${f2(r.window397)}` : '—'} | ${mkCell(r)} | ${mcCell(r)} | ` +
      `${r.delivered ? `${f2(r.resonantDb)} / ${f2(r.liftDb)}` : '—'} | ${f2(r.qesMult)} | ${f0(r.dissPct)} | ${r.delivered ? `${f2(r.hottestThermalW)} (${f1(r.hottestAllowedW)})${r.hottestId ? ` ${r.hottestId}` : ''}` : '—'} | ${copperCell(r)} | ${f2(r.maxLowestWayCoilMh)}${spanMh !== null && r.maxLowestWayCoilMh !== null && r.maxLowestWayCoilMh > spanMh + 0.005 ? ' > span' : ''} | ${trapCell(r)} | ${f1(r.lobingDipDb)} | ${r.delivered ? r.partCount : '—'} | ${bomCell(r)} |`,
  );
}
console.log('');
console.log('DCR PER SPOEL — weg, L, gedragen DCR, fit van de familie, binnen het enkel-onderdeel-bereik (op een verwerping: het GEWEIGERDE netwerk, uit de boekhouding van de generator):');
for (const r of rows) {
  console.log(`  ${r.corpus} · ${short(r.label)}: ` + (r.coils.length ? r.coils.map((c) => `${c.id} (${c.way}) ${c.mH.toFixed(2)} mH → ${c.dcrOhm.toFixed(3)} Ω${c.fitOhm !== null && Math.abs(c.fitOhm - c.dcrOhm) > 0.0005 ? ` [fit ${c.fitOhm.toFixed(3)}]` : ''}${c.inRange === false ? ' BUITEN BEREIK' : ''}`).join('; ') : 'geen spoelen'));
}
console.log('');
console.log('VOLLE VECTOR — de netlist per geleverde kandidaat (id, type, waarde):');
for (const r of rows.filter((x) => x.delivered)) console.log(`  ${r.corpus} · ${short(r.label)}: ` + r.parts.map((p) => `${p.id}${p.value ? ` ${p.value}` : ''}`).join(', '));
console.log('');
console.log('BOM PER GELEVERDE KANDIDAAT — de goedkoopste catalogusrealisatie per onderdeel (±5 %; spoelen uit de gestelde familie van hun weg):');
for (const r of rows.filter((x) => x.delivered && x.bom)) console.log(`  ${r.corpus} · ${short(r.label)}: € ${r.bom!.eur.toFixed(2)} — ` + r.bom!.items.map((i) => `${i.id}: ${i.label} (€ ${i.eur.toFixed(2)})`).join('; ') + (r.bom!.unrealised.length ? ` — GEEN REALISATIE: ${r.bom!.unrealised.join(', ')}` : ''));
console.log('');
const liveDelivered = rows.filter((r) => (r.corpus === LIVE_NAME || r.corpus === NOT_FROZEN) && r.delivered);
console.log(`GEPAARD TEGEN ${DATED_NAME} — op LABEL waar het kan, anders het dichtstbijzijnde kruispunt met de octaafafstand (anekdote per rij, geen corpusdelta; corpusPairing zegt n op label):`);
console.log(`| ${LIVE_NAME} | ${DATED_NAME} (afstand oct) | min \\|Z\\| Ω | RMS volle band dB | RMS vanaf 397 dB | M-K W-M / M-T ° | M-C tweeter dB | opslingering dB | dissipatie % | heetste R W bij 10 W | koper woofer Ω | onderdelen | BOM € | lobing dip dB |`);
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
const d = (a: number | null, b: number | null) => (a === null || b === null ? '—' : `${f2(b)} → ${f2(a)} (${a - b >= 0 ? '+' : ''}${(a - b).toFixed(2)})`);
const tw = (r: Row) => r.mc.find((m) => m.way === 'tweeter')?.db ?? null;
let onLabel = 0;
for (const r of liveDelivered) {
  const p = pairOf(r);
  if (!p) continue;
  if (p.onLabel) onLabel++;
  const n = p.row;
  console.log(
    `| ${short(r.label)} | ${short(n.label)} (${p.onLabel ? 'label' : p.distOct.toFixed(2)}) | ${d(r.minZ?.ohm ?? null, n.minZ?.ohm ?? null)} | ${d(r.rmsFull, n.rmsFull)} | ${d(r.rms397, n.rms397)} | ` +
      `${r.mk.map((m, i) => d(m.deg, n.mk[i]?.deg ?? null)).join(' / ')} | ${d(tw(r), tw(n))} | ${d(r.resonantDb, n.resonantDb)} | ${d(r.dissPct, n.dissPct)} | ${d(r.hottestThermalW, n.hottestThermalW)} | ${d(r.copperByWay.woofer ?? null, n.copperByWay.woofer ?? null)} | ${d(r.partCount, n.partCount)} | ${d(r.bom?.eur ?? null, n.bom?.eur ?? null)} | ${d(r.lobingDipDb, n.lobingDipDb)} |`,
  );
}
console.log(`paren op label: ${onLabel} van ${liveDelivered.length}`);
console.log('');
/* ---- vraag 1: de lage W-M-kruisingen, per positie ---------------------- */
console.log('VRAAG 1 — PER W-M-POSITIE: wat het veld daar deed, en de grootste spoel op de laagste weg (geleverd of geweigerd netwerk) tegen de spanwijdte:');
const byWm = new Map<number, Row[]>();
for (const r of rows.filter((x) => x.corpus === LIVE_NAME || x.corpus === NOT_FROZEN)) {
  const hz = r.statedHz?.[0];
  if (hz === undefined) continue;
  byWm.set(hz, [...(byWm.get(hz) ?? []), r]);
}
for (const [hz, rs] of [...byWm.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(
    `  W-M ${hz}: ` +
      rs
        .map((r) => `${r.statedHz![1]} → ${r.delivered ? (r.corpus === NOT_FROZEN ? 'GELEVERD (niet bevroren)' : 'GELEVERD') : r.corpus === NOT_FROZEN ? 'geleverd, niet bevroren, geen shard' : `geweigerd (${r.ground?.split(':')[0]})`}, grootste woofer-spoel ${f2(r.maxLowestWayCoilMh)} mH${r.traps.length ? `, val ${r.traps.map((t) => `${f2(t.lMh)} mH/${f0(t.cUf)} µF`).join('+')}` : ''}${r.refused?.yOhm !== null && r.refused?.yOhm !== undefined ? `, Y ${f2(r.refused.yOhm)}` : ''}`)
        .join(' | '),
  );
}
console.log('');
/* ---- vraag 2: wie haalt alles ---------------------------------------- */
const clearsAll = liveDelivered.filter((r) => r.floorOk === true && r.mc.every((m) => m.pass) && (r.levelWork?.verdictOk ?? true) && (r.hottestThermalW === null || r.hottestAllowedW === null || r.hottestThermalW <= r.hottestAllowedW));
console.log(`VRAAG 2 — ${clearsAll.length} van ${rows.filter((r) => r.corpus === LIVE_NAME || r.corpus === NOT_FROZEN).length} kandidaten halen alles (vloer, M-C per weg, niveauwerk, M-A/part), waarvan ${clearsAll.filter((r) => r.corpus === LIVE_NAME).length} bevroren en ${clearsAll.filter((r) => r.corpus === NOT_FROZEN).length} door de shortlist-grootte (${DEFAULT_SHORTLIST_SIZE}) niet; gesorteerd op RMS volle band, met fase, lobing en onderdelen ernaast:`);
for (const r of [...clearsAll].sort((a, b) => (a.rmsFull ?? Infinity) - (b.rmsFull ?? Infinity))) {
  console.log(`  ${short(r.label)}${r.corpus === NOT_FROZEN ? ' (niet bevroren)' : ''}: RMS ${f2(r.rmsFull)} / ${f2(r.rms397)}, M-K ${mkCell(r)}, lobing ${f1(r.lobingDipDb)}, onderdelen ${r.partCount}, BOM € ${f0(r.bom?.eur)}, min|Z| ${f2(r.minZ?.ohm)}, opslingering ${f2(r.resonantDb)}, koper woofer ${f2(r.copperByWay.woofer)}`);
}

writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      _: 'A5e.3c — de tabel per kandidaat (scripts/measure-a5e3c-field.ts), één meetbank voor elke rij; het levende corpus mét zijn verwerpingen, het gedateerde A5e.3-veld, de A5e.3b-ablatie-arm en HUIDIG. Documentatie, geen acceptatiewaarde.',
      band_volle_hz: CASUS1_V2_BAND_HZ,
      band_rapport_hz: rows.find((r) => r.band397)?.band397 ?? null,
      vloer_ohm: FLOOR,
      spanwijdte_plafond_mH: spanMh,
      bom_tolerantie: BOM_TOLERANCE,
      rijen: rows.map((r) => {
        const p = pairOf(r);
        return {
          ...r,
          minZ: r.minZ ? { ...r.minZ, perBranch: Object.fromEntries(Object.entries(r.minZ.perBranch).map(([k, v]) => [k, round2(v)])) } : null,
          gepaard: p && r.corpus === LIVE_NAME ? { label: p.row.label, op_label: p.onLabel, afstand_oct: round2(p.distOct) } : null,
        };
      }),
    },
    null,
    1,
  )}\n`,
  'utf-8',
);
console.log(`wrote ${OUT}`);
