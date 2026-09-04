/**
 * M-1-DIAGNOSE — WAAR HET |Z|-MINIMUM ZIT EN WELK ELEMENT HET DAAR HOUDT.
 *
 * `npx vite-node scripts/measure-m1-diagnose.ts [SLEUTEL ...]` — seconden, geen
 * ketenrun en geen enkele tune. Zonder argumenten: HUIDIG, de drie V51b-netlists
 * die een M-1-tegenhanger hebben, en élk netwerk dat
 * `scripts/measure-m1-diagnose-arms.ts` in `test-fixtures/casus1_m1_diagnose/`
 * heeft achtergelaten (zaad, geweigerde tune, geleverd netwerk per arm).
 *
 * PER NETWERK DRIE TABELLEN.
 *  (1) De TOPOLOGIE per tak: elke groep (`decompose` uit `v38-groups.ts` — pool,
 *      val, gedempte val, Zobel, shunt-shelf, niveauwerk) met samenstelling,
 *      resonantie en Q, uit de netlist-graaf en nooit uit een naam.
 *  (2) |Z| PER TAK over 20 Hz–20 kHz (elke tak alleen aan de generator, de
 *      andere takken weg) en van de SOM: het minimum met zijn frequentie, en
 *      van elke tak de |Z| op de frequentie waar de som haar minimum heeft —
 *      dat zegt in welke tak het minimum ZIT.
 *  (3) WELK ELEMENT HET DAAR HOUDT: elke groep één voor één geableerd zoals de
 *      snoeipas van de tuner dat doet (serie → draad, shunt → open;
 *      `ablateGroup`), het netwerk opnieuw opgelost en het nieuwe minimum
 *      ernaast. De groep waarvan de ablatie het minimum het verst optilt is de
 *      houder; een groep zonder effect staat er met 0,00.
 *
 *  (4) DE PROBE OP DE GEDEMPTE SHUNT-POOL, alleen op een netwerk dat de gestelde
 *      vloer mist: voor élke shunt-spoel in de HP-ladder van de tak die het
 *      minimum draagt wordt een weerstand IN SERIE met die spoel gebisecteerd
 *      tot het systeemminimum de vloer haalt (`meetsAmpFloor`, dezelfde regel
 *      als de poort, tolerantie erin), en ernaast dezelfde bisectie voor een
 *      PAD aan de kop van die weg (`withSeriesResistanceInFront`, de V51b-Y-
 *      probe op een andere weg). Per probe: de ohm, het nieuwe minimum en wat
 *      het de takoverdracht kost (grootste |Δ| in haar eigen doorlaatband en
 *      op het rasterpunt van de resonantie). De vloer wordt uit het manifest
 *      GELEZEN (`casus1AmpMinLoadOhm`), nooit hier getypt.
 *
 * Voor de M-1-armen ook de VRIJHEID VAN DE TUNER op de dempingsweerstanden: de R
 * van elke gedempte val en elk Zobel in het zaad naast dezelfde R in de
 * geweigerde tune — de tuner mocht ze bewegen (waardetune), en de tabel zegt of
 * en waarheen.
 *
 * Dit script stelt niets en wijzigt niets. Het is het bewijsmateriaal onder
 * casusboek M-1-diagnose; de ketenruns staan in `measure-m1-diagnose-arms.ts`.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logspace, resampleImpedance } from '../src/lib/dsp.ts';
import type { Complex } from '../src/lib/complex.ts';
import { solveNetwork, type Netlist } from '../src/lib/network.ts';
import { acceptedAmpFloor, meetsAmpFloor } from '../src/lib/impedanceFloor.ts';
import { withSeriesResistanceInFront } from '../src/lib/engine2/optimizer/worker.ts';
import { crossoverToNetlist } from '../src/lib/vxpNetwork.ts';
import type { VxpCrossover, VxpPart } from '../src/lib/parsers/vxp.ts';
import { deserializeFilter } from '../src/lib/filterFile.ts';
import { ablateGroup, decompose, type Group } from './v38-groups.ts';
import {
  casus1AmpMinLoadOhm,
  casus1Files,
  casus1FilterFromParts,
  casus1Manifest,
  CASUS1_DIR,
  loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';

/** Het raster van deze diagnose: het hele hoorbare bereik, fijn genoeg om een smalle dip te treffen. */
const DIAG_GRID_HZ: [number, number] = [20, 20000]; // P6-OK: audiobereik, geen projectgetal
const DIAG_GRID_POINTS = 600;
/** Hoeveel de ablatie van een groep het minimum minstens moet optillen om als houder te gelden, Ω. */
const HOLDER_MIN_LIFT_OHM = 0.05;
/** Bereik en stappen van de dempingsprobe (probegrenzen, geen projectgetal). */
const PROBE_MAX_OHM = 47; // P6-OK: de bovengrens van de R-box van de tuner
const PROBE_STEPS = 30;
/** Hoe ver onder haar eigen maximum een takoverdracht nog doorlaatband heet (v38-groups). */
const PASSBAND_WITHIN_DB = 6;
const FLOOR_OHM: number | null = casus1AmpMinLoadOhm(loadGolden());

const HERE = dirname(fileURLToPath(import.meta.url));
const ARM_DIR = join(HERE, '..', 'test-fixtures', 'casus1_m1_diagnose');
const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const netlists = (golden.manifest_en_geometrie as { netlists: Record<string, string> }).netlists;
const grid = logspace(DIAG_GRID_HZ[0], DIAG_GRID_HZ[1], DIAG_GRID_POINTS);

/** De gemeten impedanties op het diagnoseraster — één keer, uit het manifest. */
const driverZ: Record<string, Complex[]> = (() => {
  const probe = casus1FilterFromParts('probe', [], manifest, files);
  const out: Record<string, Complex[]> = {};
  for (const [drv, z] of Object.entries(probe.driverZ)) {
    out[drv] = resampleImpedance(z.freq, z.magnitude, z.phaseDeg, grid).z;
  }
  return out;
})();

const f2 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(2));
const f0 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(0));

interface Curve {
  mag: number[];
  minOhm: number;
  minHz: number;
  minIdx: number;
}
function solveMag(parts: readonly VxpPart[]): Curve | null {
  try {
    const { netlist } = crossoverToNetlist({ name: 'diag', parts: [...parts] } as VxpCrossover);
    const z = solveNetwork(netlist, grid, driverZ).inputZ;
    const mag = z.map((c) => Math.hypot(c.re, c.im));
    let minIdx = 0;
    for (let i = 1; i < mag.length; i++) if (mag[i] < mag[minIdx]) minIdx = i;
    return { mag, minOhm: mag[minIdx], minHz: grid[minIdx], minIdx };
  } catch {
    return null;
  }
}

/** De tak alleen: de generator, de massa, de draden, de groepen van deze tak en haar driver. */
function branchOnly(parts: readonly VxpPart[], groups: readonly Group[], branch: string): VxpPart[] {
  const keep = new Set<string>();
  for (const g of groups) if (g.branch === branch) for (const id of g.partIds) keep.add(id);
  return parts.filter(
    (p) =>
      p.type === 'Generator' ||
      p.type === 'Ground' ||
      p.type === 'Wire' ||
      (p.type === 'Driver' && p.model === branch) ||
      (p.partId !== undefined && keep.has(p.partId)),
  );
}

interface Analysis {
  name: string;
  groups: Group[];
  sum: Curve | null;
  branches: { branch: string; curve: Curve | null; atSumMinOhm: number | null }[];
  holders: { group: Group; minOhm: number | null; minHz: number | null; liftOhm: number | null }[];
}

function analyse(name: string, parts: readonly VxpPart[]): Analysis {
  const groups = decompose(parts);
  const sum = solveMag(parts);
  const branchNames = [...new Set(groups.map((g) => g.branch).filter((b) => b !== ''))];
  const branches = branchNames.map((branch) => {
    const curve = solveMag(branchOnly(parts, groups, branch));
    return { branch, curve, atSumMinOhm: curve && sum ? curve.mag[sum.minIdx] : null };
  });
  const holders = groups.map((g) => {
    const c = solveMag(ablateGroup(parts, g));
    return {
      group: g,
      minOhm: c?.minOhm ?? null,
      minHz: c?.minHz ?? null,
      liftOhm: c && sum ? c.minOhm - sum.minOhm : null,
    };
  });
  return { name, groups, sum, branches, holders };
}

/** De beschermer als waarde, voor de samenvatting. */
function guardOf(a: Analysis): { groep: string; tak: string; rol: string; samenstelling: string; zonder_min_ohm: number | null; zonder_min_hz: number | null } | null {
  const guards = a.holders
    .filter((h) => h.group.role !== 'pole' && h.liftOhm !== null && h.liftOhm <= -HOLDER_MIN_LIFT_OHM)
    .sort((x, y) => x.liftOhm! - y.liftOhm!);
  const g = guards[0];
  return g ? { groep: g.group.id, tak: g.group.branch, rol: g.group.role, samenstelling: g.group.composition, zonder_min_ohm: g.minOhm, zonder_min_hz: g.minHz } : null;
}

function printAnalysis(a: Analysis, title: string): void {
  console.log(`### ${title}`);
  console.log('');
  console.log('TOPOLOGIE per tak (uit de netlist-graaf):');
  console.log('| tak | groep | positie | rol | samenstelling | f0 Hz | Q |');
  console.log('|---|---|---|---|---|---|---|');
  const order = ['woofer', 'mid', 'tweeter'];
  const sorted = [...a.groups].sort(
    (x, y) => order.indexOf(x.branch) - order.indexOf(y.branch) || x.depth - y.depth || x.id.localeCompare(y.id),
  );
  for (const g of sorted) {
    console.log(`| ${g.branch || '(geen)'} | ${g.id} | ${g.position} | ${g.role} | ${g.composition} | ${f0(g.fHz)} | ${f2(g.q)} |`);
  }
  console.log('');
  console.log(`|Z| PER TAK over ${DIAG_GRID_HZ[0]}–${DIAG_GRID_HZ[1]} Hz (tak alleen aan de generator) en van de SOM:`);
  console.log('| tak | min |Z| Ω | bij Hz | |Z| van deze tak bij het SOM-minimum Ω |');
  console.log('|---|---|---|---|');
  for (const b of a.branches) {
    console.log(`| ${b.branch} | ${f2(b.curve?.minOhm)} | ${f0(b.curve?.minHz)} | ${f2(b.atSumMinOhm)} |`);
  }
  console.log(`| **SOM** | **${f2(a.sum?.minOhm)}** | **${f0(a.sum?.minHz)}** | — |`);
  const lowest = [...a.branches].filter((b) => b.atSumMinOhm !== null).sort((x, y) => x.atSumMinOhm! - y.atSumMinOhm!)[0];
  if (lowest && a.sum) {
    console.log(
      `Bij ${f0(a.sum.minHz)} Hz is de laagste tak **${lowest.branch}** (${f2(lowest.atSumMinOhm)} Ω); de andere takken staan er parallel op ` +
        a.branches
          .filter((b) => b !== lowest)
          .map((b) => `${b.branch} ${f2(b.atSumMinOhm)} Ω`)
          .join(', ') +
        '.',
    );
  }
  console.log('');
  console.log('WELK ELEMENT HET MINIMUM HOUDT — elke groep geableerd (serie → draad, shunt → open), som opnieuw opgelost:');
  console.log('| groep (tak) | rol | min |Z| zonder deze groep Ω | bij Hz | lift Ω |');
  console.log('|---|---|---|---|---|');
  const byLift = [...a.holders].sort((x, y) => (y.liftOhm ?? -Infinity) - (x.liftOhm ?? -Infinity));
  for (const h of byLift) {
    console.log(`| ${h.group.id} (${h.group.branch}) | ${h.group.role} | ${f2(h.minOhm)} | ${f0(h.minHz)} | ${h.liftOhm === null ? '—' : (h.liftOhm >= 0 ? '+' : '') + h.liftOhm.toFixed(2)} |`);
  }
  /* De BESCHERMER: de correctie- of niveaugroep waarvan de ablatie het minimum het
   * diepst laat ZAKKEN — dat is het element dat de weg boven de vloer houdt.
   * Poolelementen tellen niet mee (een kortgesloten seriespoel zet de driver
   * kaal aan de generator, en dat zegt niets over de vloer). */
  const guards = byLift.filter((h) => h.group.role !== 'pole' && h.liftOhm !== null && h.liftOhm <= -HOLDER_MIN_LIFT_OHM);
  const guard = guards.length ? guards[guards.length - 1] : null;
  if (guard) {
    console.log(
      `Beschermer: **${guard.group.id}** (${guard.group.branch}, ${guard.group.role}, ${guard.group.composition}) — zonder deze groep zakt het minimum naar ` +
        `${f2(guard.minOhm)} Ω bij ${f0(guard.minHz)} Hz (${guard.liftOhm!.toFixed(2)} Ω)` +
        (guards.length > 1 ? `; daarna ${guards.slice(0, -1).reverse().slice(0, 2).map((g) => `${g.group.id} (${f2(g.minOhm)} Ω bij ${f0(g.minHz)} Hz)`).join(', ')}` : '') +
        '.',
    );
  }
  const holder = byLift[0];
  if (holder && holder.liftOhm !== null && holder.liftOhm >= HOLDER_MIN_LIFT_OHM) {
    console.log(
      `Houder: **${holder.group.id}** (${holder.group.branch}, ${holder.group.role}, ${holder.group.composition}) — zonder deze groep ligt het minimum op ` +
        `${f2(holder.minOhm)} Ω bij ${f0(holder.minHz)} Hz (+${holder.liftOhm.toFixed(2)} Ω).`,
    );
  } else {
    console.log('Houder: geen enkele groep alleen tilt het minimum meer dan ' + HOLDER_MIN_LIFT_OHM + ' Ω op — het minimum is een eigenschap van de driver zelf of van meerdere groepen samen.');
  }
  console.log('');
}

/** De R's van de gedempte shunts (val, Zobel, shelf, pad) van het zaad naast die van de tune. */
function printDampingFreedom(seed: readonly VxpPart[], tuned: readonly VxpPart[], what: string): void {
  const rOf = (parts: readonly VxpPart[]) => {
    const m = new Map<string, number>();
    for (const p of parts) {
      if (p.type !== 'Resistor' || !p.partId) continue;
      const r = p.params.find((q) => q.name === 'R')?.value;
      if (r !== undefined) m.set(p.partId, r);
    }
    return m;
  };
  const rs = rOf(seed);
  const rt = rOf(tuned);
  const groups = decompose(seed);
  console.log(`DE VRIJHEID VAN DE TUNER OP DE WEERSTANDEN (zaad → ${what}):`);
  console.log('| weerstand | tak | groep | rol | zaad Ω | tune Ω |');
  console.log('|---|---|---|---|---|---|');
  for (const g of groups) {
    for (const id of g.partIds) {
      if (!rs.has(id)) continue;
      console.log(`| ${id} | ${g.branch} | ${g.id} | ${g.role} | ${f2(rs.get(id))} | ${rt.has(id) ? f2(rt.get(id)) : 'weg (audit)'} |`);
    }
  }
  console.log('');
}


/* ------------------------------------------------------------------ *
 * (4) De probe op de gedempte shunt-pool
 * ------------------------------------------------------------------ */
interface ProbeResult {
  what: string;
  ohm: number | null;
  minOhm: number | null;
  minHz: number | null;
  /** Grootste |Δ dB| van de takoverdracht in haar eigen doorlaatband. */
  passbandMaxAbsDb: number | null;
  /** Δ dB van de takoverdracht op het rasterpunt waar het oude minimum zat. */
  atOldMinDb: number | null;
  note: string;
}

function netlistOf(parts: readonly VxpPart[]): Netlist {
  return crossoverToNetlist({ name: 'diag', parts: [...parts] } as VxpCrossover).netlist;
}

function minOf(nl: Netlist): { ohm: number; hz: number; idx: number } | null {
  try {
    const mag = solveNetwork(nl, grid, driverZ).inputZ.map((c) => Math.hypot(c.re, c.im));
    let i0 = 0;
    for (let i = 1; i < mag.length; i++) if (mag[i] < mag[i0]) i0 = i;
    return { ohm: mag[i0], hz: grid[i0], idx: i0 };
  } catch {
    return null;
  }
}

/** Een weerstand IN SERIE met één shunt-element (het element krijgt een nieuwe knoop naar massa). */
function withSeriesInShunt(nl: Netlist, elementId: string, ohm: number): Netlist | null {
  const e = nl.elements.find((x) => x.id === elementId);
  if (!e || (e.kind !== 'L' && e.kind !== 'C')) return null;
  const grounded = e.nodes[0] === 0 ? 0 : e.nodes[1] === 0 ? 1 : -1;
  if (grounded < 0) return null;
  const n = nl.nodeCount;
  const moved = { ...e, nodes: grounded === 0 ? ([n, e.nodes[1]] as [number, number]) : ([e.nodes[0], n] as [number, number]) };
  return {
    nodeCount: n + 1,
    elements: [...nl.elements.map((x) => (x === e ? moved : x)), { kind: 'R', id: `__probe-${elementId}`, nodes: [n, 0], value: ohm }],
  };
}

function transferCost(base: Netlist, probed: Netlist, model: string, oldMinIdx: number): { passbandMaxAbsDb: number; atOldMinDb: number } | null {
  try {
    const a = solveNetwork(base, grid, driverZ);
    const b = solveNetwork(probed, grid, driverZ);
    const idA = a.drivers.find((d) => d.model === model)?.id;
    const idB = b.drivers.find((d) => d.model === model)?.id;
    if (!idA || !idB) return null;
    const ma = a.transfers[idA].map((c) => 20 * Math.log10(Math.max(Math.hypot(c.re, c.im), 1e-12)));
    const mb = b.transfers[idB].map((c) => 20 * Math.log10(Math.max(Math.hypot(c.re, c.im), 1e-12)));
    const top = Math.max(...ma);
    let worst = 0;
    for (let i = 0; i < grid.length; i++) {
      if (ma[i] < top - PASSBAND_WITHIN_DB) continue;
      worst = Math.max(worst, Math.abs(mb[i] - ma[i]));
    }
    return { passbandMaxAbsDb: worst, atOldMinDb: mb[oldMinIdx] - ma[oldMinIdx] };
  } catch {
    return null;
  }
}

/** Bisectie van de ohm waarbij het systeemminimum de vloer haalt; null als zelfs het maximum niet volstaat. */
function bisectToFloor(make: (ohm: number) => Netlist | null, floorOhm: number): { ohm: number; min: { ohm: number; hz: number; idx: number } } | null {
  const ok = (ohm: number) => {
    const nl = make(ohm);
    const m = nl ? minOf(nl) : null;
    return m && meetsAmpFloor(m.ohm, floorOhm) ? m : null;
  };
  const top = ok(PROBE_MAX_OHM);
  if (!top) return null;
  let lo = 0;
  let hi = PROBE_MAX_OHM;
  let best = { ohm: hi, min: top };
  for (let i = 0; i < PROBE_STEPS; i++) {
    const mid = (lo + hi) / 2;
    const m = ok(mid);
    if (m) {
      hi = mid;
      best = { ohm: mid, min: m };
    } else lo = mid;
  }
  return best;
}

/** De R van een (gedempte) val op een waarde gezet, of ingevoegd als de val er geen heeft. */
function withTrapResistance(nl: Netlist, g: Group, ohm: number): Netlist | null {
  const rId = g.partIds.find((id) => nl.elements.find((e) => e.id === id)?.kind === 'R');
  if (rId) {
    return { ...nl, elements: nl.elements.map((e) => (e.id === rId ? { ...e, value: ohm } : e)) };
  }
  const grounded = g.partIds.find((id) => {
    const e = nl.elements.find((x) => x.id === id);
    return e && (e.nodes[0] === 0 || e.nodes[1] === 0);
  });
  return grounded ? withSeriesInShunt(nl, grounded, ohm) : null;
}

interface BranchProbe {
  model: string;
  branchMinOhm: number;
  branchMinHz: number;
  probes: ProbeResult[];
}

function probeDampedShuntPole(a: Analysis, parts: readonly VxpPart[]): { branches: BranchProbe[]; combined: { minOhm: number; minHz: number; using: string[] } | null } {
  if (FLOOR_OHM === null || !a.sum || meetsAmpFloor(a.sum.minOhm, FLOOR_OHM)) return { branches: [], combined: null };
  const floor = FLOOR_OHM;
  const out: BranchProbe[] = [];
  const failing = a.branches.filter((b) => b.curve && !meetsAmpFloor(b.curve.minOhm, floor));
  /* Per falende tak op de TAK ALLEEN gebisecteerd (de bron is ideaal, dus de
   * takken zijn onafhankelijk): een probe op de ene weg kan het minimum van de
   * andere niet raken, en een bisectie op het systeemminimum zou dan niets
   * vinden zodra twee wegen tegelijk onder de vloer zitten. */
  const chosen: { model: string; ohm: number; make: (nl: Netlist, ohm: number) => Netlist | null; what: string }[] = [];
  for (const b of failing) {
    const model = b.branch;
    const alone = netlistOf(branchOnly(parts, a.groups, model));
    const oldIdx = b.curve!.minIdx;
    const probes: ProbeResult[] = [];
    const kinds: { what: string; make: (nl: Netlist, ohm: number) => Netlist | null; note: string }[] = [
      {
        what: `pad aan de kop van ${model}`,
        make: (nl, ohm) => withSeriesResistanceInFront(nl, model, ohm),
        note: `zelfs ${PROBE_MAX_OHM} Ω aan de kop van ${model} haalt de vloer niet`,
      },
      ...a.groups
        .filter((g) => g.branch === model && g.position === 'shunt' && g.role === 'pole')
        .map((g) => ({
          what: `R in serie met ${g.partIds[0]} (${g.composition}, ${model})`,
          make: (nl: Netlist, ohm: number) => withSeriesInShunt(nl, g.partIds[0], ohm),
          note: `geen R tot ${PROBE_MAX_OHM} Ω in serie met ${g.partIds[0]} haalt de vloer`,
        })),
      ...a.groups
        .filter((g) => g.branch === model && (g.role === 'damped-trap' || g.role === 'trap'))
        .map((g) => ({
          what: `de R van de val ${g.id} (${g.composition}, ${model})`,
          make: (nl: Netlist, ohm: number) => withTrapResistance(nl, g, ohm),
          note: `geen R tot ${PROBE_MAX_OHM} Ω in de val ${g.id} haalt de vloer`,
        })),
    ];
    for (const k of kinds) {
      const r = bisectToFloor((ohm) => k.make(alone, ohm), floor);
      const cost = r ? transferCost(alone, k.make(alone, r.ohm)!, model, oldIdx) : null;
      probes.push({
        what: k.what,
        ohm: r?.ohm ?? null,
        minOhm: r?.min.ohm ?? null,
        minHz: r?.min.hz ?? null,
        passbandMaxAbsDb: cost?.passbandMaxAbsDb ?? null,
        atOldMinDb: cost?.atOldMinDb ?? null,
        note: r ? '' : k.note,
      });
    }
    out.push({ model, branchMinOhm: b.curve!.minOhm, branchMinHz: b.curve!.minHz, probes });
    /* De GOEDKOOPSTE werkende probe van deze tak — kleinste doorlaatbandkost,
     * dan kleinste ohm — gaat mee naar de gecombineerde lezing. */
    const working = probes
      .map((pr, i) => ({ pr, k: kinds[i] }))
      .filter((x) => x.pr.ohm !== null)
      .sort((x, y) => (x.pr.passbandMaxAbsDb ?? Infinity) - (y.pr.passbandMaxAbsDb ?? Infinity) || x.pr.ohm! - y.pr.ohm!);
    if (working[0]) {
      const w = working[0];
      chosen.push({ model, ohm: w.pr.ohm!, what: w.k.what, make: w.k.make });
    }
  }
  /* GECOMBINEERD. Een tak die alleen precies de vloer haalt trekt in parallel
   * met de andere takken het systeem er alsnog onder (complexe parallel-
   * schakeling), dus de gecombineerde lezing bisecteert één SCHAALFACTOR op
   * alle gekozen probes tegelijk op het hele netwerk — de ohm per probe die
   * het systeem werkelijk nodig heeft, en de kost per tak bij die ohm. */
  let combined: { minOhm: number; minHz: number; using: string[] } | null = null;
  if (chosen.length === failing.length && chosen.length > 0) {
    const full = netlistOf(parts);
    const apply = (t: number): Netlist | null => {
      let nl: Netlist | null = full;
      for (const c of chosen) nl = nl ? c.make(nl, c.ohm * t) : null;
      return nl;
    };
    const tMax = PROBE_MAX_OHM / Math.max(...chosen.map((c) => c.ohm));
    const okAt = (t: number) => {
      const nl = apply(t);
      const m = nl ? minOf(nl) : null;
      return m && meetsAmpFloor(m.ohm, floor) ? m : null;
    };
    let found: { t: number; min: { ohm: number; hz: number; idx: number } } | null = null;
    const top = okAt(tMax);
    if (top) {
      let lo = 1;
      let hi = tMax;
      found = { t: tMax, min: top };
      const at1 = okAt(1);
      if (at1) found = { t: 1, min: at1 };
      else
        for (let i = 0; i < PROBE_STEPS; i++) {
          const mid = (lo + hi) / 2;
          const m = okAt(mid);
          if (m) {
            hi = mid;
            found = { t: mid, min: m };
          } else lo = mid;
        }
    }
    if (found) {
      const t = found.t;
      combined = {
        minOhm: found.min.ohm,
        minHz: found.min.hz,
        using: chosen.map((c) => {
          const alone = netlistOf(branchOnly(parts, a.groups, c.model));
          const b = a.branches.find((x) => x.branch === c.model)!;
          const cost = transferCost(alone, c.make(alone, c.ohm * t)!, c.model, b.curve!.minIdx);
          return `${c.what} ${f2(c.ohm * t)} Ω (kost ${f2(cost?.passbandMaxAbsDb)} dB in de doorlaatband)`;
        }),
      };
    } else {
      combined = null;
    }
  }
  return { branches: out, combined };
}

function printProbe(a: Analysis, parts: readonly VxpPart[]): ReturnType<typeof probeDampedShuntPole> {
  const res = probeDampedShuntPole(a, parts);
  if (res.branches.length === 0) return res;
  console.log(
    `DE PROBE OP DE GEDEMPTE SHUNT-POOL — de gestelde vloer ${FLOOR_OHM} Ω (geaccepteerd vanaf ${acceptedAmpFloor(FLOOR_OHM!).toFixed(3)} Ω), ` +
      `per falende tak op de tak alleen: een pad aan de kop, een R in serie met elke shunt-pool, en de R van elke val:`,
  );
  console.log('| tak (min alleen) | probe | Ω tot de vloer | min |Z| van de tak daarmee Ω | bij Hz | kost: max |Δ| in de doorlaatband dB | Δ op het oude minimum dB |');
  console.log('|---|---|---|---|---|---|---|');
  for (const b of res.branches) {
    for (const r of b.probes) {
      console.log(
        `| ${b.model} (${f2(b.branchMinOhm)} Ω @ ${f0(b.branchMinHz)} Hz) | ${r.what} | ${r.ohm === null ? `— (${r.note})` : f2(r.ohm)} | ${f2(r.minOhm)} | ${f0(r.minHz)} | ` +
          `${f2(r.passbandMaxAbsDb)} | ${r.atOldMinDb === null ? '—' : (r.atOldMinDb >= 0 ? '+' : '') + r.atOldMinDb.toFixed(2)} |`,
      );
    }
  }
  if (res.combined) {
    console.log(`Gecombineerd (de goedkoopste werkende probe per tak, samen op het hele netwerk en opgeschaald tot het SYSTEEM de vloer haalt): min |Z| **${f2(res.combined.minOhm)} Ω bij ${f0(res.combined.minHz)} Hz** met ${res.combined.using.join(' + ')}.`);
  } else {
    console.log('Gecombineerd: geen lezing — niet elke falende tak heeft een werkende probe, of samen halen zij de vloer ook opgeschaald niet.');
  }
  console.log('');
  return res;
}

/* ------------------------------------------------------------------ *
 * Wat er geanalyseerd wordt
 * ------------------------------------------------------------------ */
interface ArmFile {
  arm: string;
  label: string;
  what: string;
  settings: unknown;
  seconds: number;
  seedParts: VxpPart[] | null;
  deliveredParts: VxpPart[] | null;
  rejectedParts: VxpPart[] | null;
  refusal: { by: string; kinds: string[]; reason: string } | null;
  gateRefusals: string[];
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  rejectedTune: Record<string, unknown> | null;
  tuned: number;
}

const DEFAULT_KEYS = ['HUIDIG', 'V51B_KAND_1', 'V51B_KAND_6', 'V51B_KAND_3'];
const keys = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_KEYS;
const summary: Record<string, unknown> = {};

console.log('M-1-DIAGNOSE — waar het |Z|-minimum zit en welk element het houdt');
console.log(`raster ${DIAG_GRID_HZ[0]}–${DIAG_GRID_HZ[1]} Hz, ${DIAG_GRID_POINTS} punten; impedanties uit het manifest (${manifest.sessionId})`);
console.log('');

for (const key of keys) {
  const file = netlists[key];
  if (!file) throw new Error(`het casusboek kent geen netlist ${key}`);
  const parts = deserializeFilter(readFileSync(join(CASUS1_DIR, file), 'utf-8')).parts;
  const a = analyse(key, parts);
  printAnalysis(a, `${key} (${file})`);
  const probe = printProbe(a, parts);
  summary[key] = {
    probe,
    som_min_ohm: a.sum?.minOhm ?? null,
    som_min_hz: a.sum?.minHz ?? null,
    takken: a.branches.map((b) => ({ tak: b.branch, min_ohm: b.curve?.minOhm ?? null, min_hz: b.curve?.minHz ?? null, bij_som_min_ohm: b.atSumMinOhm })),
    houder: (() => {
      const h = [...a.holders].sort((x, y) => (y.liftOhm ?? -Infinity) - (x.liftOhm ?? -Infinity))[0];
      return h && h.liftOhm !== null && h.liftOhm >= HOLDER_MIN_LIFT_OHM
        ? { groep: h.group.id, tak: h.group.branch, rol: h.group.role, samenstelling: h.group.composition, lift_ohm: h.liftOhm }
        : null;
    })(),
    beschermer: guardOf(a),
  };
}

if (existsSync(ARM_DIR)) {
  const armFiles = readdirSync(ARM_DIR).filter((f) => f.endsWith('.json') && f !== 'samenvatting.json').sort();
  for (const f of armFiles) {
    const arm = JSON.parse(readFileSync(join(ARM_DIR, f), 'utf-8')) as ArmFile;
    console.log(`## ARM ${arm.arm} — ${arm.label}`);
    console.log(`${arm.what}`);
    console.log(
      `uitkomst: ${arm.refusal ? `GEWEIGERD (${arm.refusal.kinds.join(', ')}, ${arm.refusal.by}): ${arm.refusal.reason}` : 'GELEVERD'}; ` +
        `zaad min|Z| ${f2(arm.before.zMinOhm as number)} Ω → tune ${f2(((arm.rejectedTune ?? arm.after) as { zMinOhm?: number }).zMinOhm)} Ω; tuned ${arm.tuned}; ${arm.seconds.toFixed(0)} s`,
    );
    for (const g of arm.gateRefusals) console.log(`  · ${g}`);
    console.log('');
    const entry: Record<string, unknown> = { label: arm.label, what: arm.what, refusal: arm.refusal, tuned: arm.tuned };
    if (arm.seedParts) {
      const a = analyse(`${arm.arm} zaad`, arm.seedParts);
      printAnalysis(a, `ZAAD van ${arm.arm}`);
      entry.zaad = { som_min_ohm: a.sum?.minOhm ?? null, som_min_hz: a.sum?.minHz ?? null, takken: a.branches.map((b) => ({ tak: b.branch, min_ohm: b.curve?.minOhm ?? null, min_hz: b.curve?.minHz ?? null, bij_som_min_ohm: b.atSumMinOhm })) };
    }
    const tuned = arm.rejectedParts ?? arm.deliveredParts;
    if (tuned) {
      const what = arm.rejectedParts ? 'GEWEIGERDE TUNE' : 'GELEVERD NETWERK';
      const a = analyse(`${arm.arm} ${what}`, tuned);
      printAnalysis(a, `${what} van ${arm.arm}`);
      entry.probe = printProbe(a, tuned);
      entry.tune = { som_min_ohm: a.sum?.minOhm ?? null, som_min_hz: a.sum?.minHz ?? null, takken: a.branches.map((b) => ({ tak: b.branch, min_ohm: b.curve?.minOhm ?? null, min_hz: b.curve?.minHz ?? null, bij_som_min_ohm: b.atSumMinOhm })) };
      const h = [...a.holders].sort((x, y) => (y.liftOhm ?? -Infinity) - (x.liftOhm ?? -Infinity))[0];
      entry.houder = h && h.liftOhm !== null && h.liftOhm >= HOLDER_MIN_LIFT_OHM ? { groep: h.group.id, tak: h.group.branch, rol: h.group.role, samenstelling: h.group.composition, lift_ohm: h.liftOhm } : null;
      entry.beschermer = guardOf(a);
      if (arm.seedParts) printDampingFreedom(arm.seedParts, tuned, what.toLowerCase());
    }
    summary[`arm:${arm.arm}`] = entry;
  }
  writeFileSync(join(ARM_DIR, 'samenvatting.json'), JSON.stringify(summary, null, 1), 'utf-8');
  console.log(`samenvatting geschreven: ${join('test-fixtures', 'casus1_m1_diagnose', 'samenvatting.json')}`);
} else {
  console.log(`(geen armen gevonden in ${ARM_DIR}; draai eerst measure-m1-diagnose-arms.ts)`);
}
