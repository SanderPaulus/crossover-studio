/**
 * V38 — HUIDIG ONTLEED IN COMPONENTGROEPEN, en de gedeelde helper eronder.
 *
 * Waarom een eigen module en niet drie kopieën in drie scripts: stap 1 (de
 * diff-tabel), stap 2 (de ablatie) en stap 3 (de transplantatie) moeten het
 * over DEZELFDE groepen hebben, anders telt de wattenval van stap 2 niet op
 * bij de tabel van stap 1. Eén decompositie, drie lezers.
 *
 * WAT EEN GROEP IS. De netlist wordt per driver-tak afgelopen vanaf de
 * generator. Elk element dat op het pad bron→driver ligt is SERIE; alles wat
 * van een busknoop naar massa hangt is een SHUNT-KETEN, en zo'n keten wordt
 * als geheel één groep (een L en een C in serie naar massa zijn samen een val,
 * niet twee polen). De functie van een groep volgt uit zijn samenstelling en
 * uit niets anders — er staat nergens een frequentie of een componentnaam in
 * dit bestand die uit casus 1 komt.
 *
 * WAT DIT NIET DOET. Het benoemt geen "filterkern" op grond van een orde die
 * de ontwerper bedoeld zou hebben. De filterkern is hier gedefinieerd als de
 * verzameling groepen die een POOL vormen (enkele serie-L/C, enkele shunt-L/C);
 * al het andere — vallen, gedempte vallen, Zobels, niveauweerstanden — is
 * "geen filterkern" en dat is precies de scheiding die de vraag van V38 stelt.
 */

import { crossoverToNetlist } from '../src/lib/vxpNetwork.ts';
import { solveNetwork } from '../src/lib/network.ts';
import type { VxpCrossover, VxpPart } from '../src/lib/parsers/vxp.ts';
import type {
  DriverImpedances,
  NetElement,
  Netlist,
  PassiveElement,
} from '../src/lib/network.ts';

/** 2π, geschreven als constante zodat de formules eronder leesbaar blijven. */
const TWO_PI = 2 * Math.PI;
/** Eenheidsconversies (P6-whitelist). */
const MH_PER_H = 1e3;
const UF_PER_F = 1e6;

export type GroupRole =
  /** Enkele serie-L of serie-C, of enkele shunt-L of shunt-C: één filterpool. */
  | 'pole'
  /** Serie-L + serie-C naar massa: een serie-resonante val (notch). */
  | 'trap'
  /** Idem, met een weerstand erin: een gedempte val. */
  | 'damped-trap'
  /** R + C in serie naar massa: Zobel op de spreekspoelinductantie. */
  | 'zobel'
  /** R + L in serie naar massa: een shunt-shelf (laagfrequente belasting). */
  | 'shunt-shelf'
  /** Een weerstand in het seriepad: niveauwerk. */
  | 'series-pad'
  /** Een shunt-weerstand alleen: niveauwerk (L-pad-been). */
  | 'shunt-pad'
  /** Alles wat hierboven niet past — met de samenstelling erbij. */
  | 'other';

export interface Group {
  /** Driver-model waar deze groep bij hoort ('' als hij nergens bij hoort). */
  branch: string;
  /** Stabiele naam: de partIds, op volgorde. */
  id: string;
  partIds: string[];
  position: 'series' | 'shunt';
  role: GroupRole;
  /** Aantal serie-elementen tussen de generator en het aanhechtingspunt.
   *  Hoger = verder naar buiten, dichter bij de driver. */
  depth: number;
  /** Resonantiefrequentie van een (gedempte) val, Hz — anders null. */
  fHz: number | null;
  /** Q van een gedempte val (√(L/C)/R_totaal) — anders null. */
  q: number | null;
  /** Leesbare samenstelling, bv. "L 0,15 mH + C 100 µF". */
  composition: string;
}

const isPassive = (e: NetElement): e is PassiveElement =>
  e.kind === 'R' || e.kind === 'L' || e.kind === 'C';

/**
 * De busknopen per driver: elk knooppunt op het kortste pad bron→driver.
 *
 * Dezelfde BFS als `busTopology` in `netOptimizer.ts`, maar die geeft alleen
 * een positie per partId terug en V38 heeft de KNOPEN nodig om shunt-ketens
 * aan een tak te kunnen hangen. Bewust niet daar bijgebouwd: dit is een
 * meetscript en `netOptimizer.ts` is engine-code die deze sessie niet raakt.
 */
function busNodesPerDriver(elements: readonly NetElement[]): {
  /** Busknoop → de tak waar hij bij hoort. De GENERATORKNOOP staat er NIET in:
   *  hij hoort bij alle takken tegelijk, en hem toewijzen zou elke tak-eerste
   *  serie-component aan de eerst gevonden driver hangen. */
  busOf: Map<number, string>;
  /** Elke busknoop INCLUSIEF de generatorknoop. Dit is de verzameling die
   *  bepaalt of een element in het SERIEPAD ligt; `busOf` bepaalt in wélk. */
  busSet: Set<number>;
  /** Hoeveel serie-elementen tussen de generator en deze knoop. */
  depthOf: Map<number, number>;
  order: string[];
} {
  const src = elements.find((e) => e.kind === 'source');
  const busOf = new Map<number, string>();
  const busSet = new Set<number>();
  const depthOf = new Map<number, number>();
  const order: string[] = [];
  if (!src) return { busOf, busSet, depthOf, order };
  const hot = src.nodes[0] === 0 ? src.nodes[1] : src.nodes[0];
  busSet.add(hot);
  depthOf.set(hot, 0);
  const adj = new Map<number, { a: number; b: number }[]>();
  for (const e of elements) {
    if (!isPassive(e)) continue;
    for (const n of e.nodes) {
      const l = adj.get(n) ?? [];
      l.push({ a: e.nodes[0], b: e.nodes[1] });
      adj.set(n, l);
    }
  }
  for (const drv of elements) {
    if (drv.kind !== 'driver') continue;
    const target = drv.nodes[0] === 0 ? drv.nodes[1] : drv.nodes[0];
    const prev = new Map<number, number>();
    const seen = new Set([hot]);
    const q: number[] = [hot];
    while (q.length > 0) {
      const n = q.shift()!;
      if (n === target) break;
      for (const g of adj.get(n) ?? []) {
        const m = g.a === n ? g.b : g.a;
        if (m === 0 || seen.has(m)) continue;
        seen.add(m);
        prev.set(m, n);
        q.push(m);
      }
    }
    if (!seen.has(target)) continue;
    order.push(drv.model);
    /* Het pad terug naar de generator, zodat de DIEPTE vanaf de generator
     * geteld kan worden: de ablatie van stap 2 loopt van buiten (bij de
     * driver) naar binnen, en "buiten" is een positie op dit pad. */
    const path: number[] = [target];
    let cur = target;
    while (cur !== hot) {
      const p = prev.get(cur);
      if (p === undefined) break;
      path.push(p);
      cur = p;
    }
    path.reverse();
    path.forEach((n, i) => {
      busSet.add(n);
      const d = depthOf.get(n);
      if (d === undefined || i < d) depthOf.set(n, i);
      if (n === hot) return;
      busOf.set(n, drv.model);
    });
  }
  return { busOf, busSet, depthOf, order };
}

const fmtValue = (e: PassiveElement): string =>
  e.kind === 'L'
    ? `L ${(e.value * MH_PER_H).toFixed(2)} mH`
    : e.kind === 'C'
      ? `C ${(e.value * UF_PER_F).toFixed(1)} µF`
      : `R ${e.value.toFixed(2)} Ω`;

/** Klassificeer een shunt-keten uit zijn samenstelling — nooit uit een naam. */
function classifyShunt(els: readonly PassiveElement[]): GroupRole {
  const kinds = els.map((e) => e.kind).sort().join('');
  if (kinds === 'C' || kinds === 'L') return 'pole';
  if (kinds === 'R') return 'shunt-pad';
  if (kinds === 'CL') return 'trap';
  if (kinds === 'CLR') return 'damped-trap';
  if (kinds === 'CR') return 'zobel';
  if (kinds === 'LR') return 'shunt-shelf';
  return 'other';
}

/**
 * Ontleed een partslijst in groepen.
 *
 * Shunt-ketens worden gevonden door vanaf elke busknoop naar massa te lopen
 * over elementen die NIET tussen twee busknopen liggen. Een keten eindigt op
 * massa; komt hij daar niet, dan is het geen shunt en valt hij onder 'other'.
 */
export function decompose(parts: readonly VxpPart[]): Group[] {
  const { netlist } = crossoverToNetlist({ name: 'v38', parts: [...parts] } as VxpCrossover);
  const els = netlist.elements.filter(isPassive);
  const { busOf, busSet, depthOf } = busNodesPerDriver(netlist.elements);
  const isBus = (n: number) => busSet.has(n);
  const seriesEl = els.filter((e) => isBus(e.nodes[0]) && isBus(e.nodes[1]));
  const shuntEl = els.filter((e) => !(isBus(e.nodes[0]) && isBus(e.nodes[1])));

  const groups: Group[] = [];

  for (const e of seriesEl) {
    const branch = busOf.get(e.nodes[0]) ?? busOf.get(e.nodes[1]) ?? '';
    groups.push({
      branch,
      id: e.id,
      partIds: [e.id],
      position: 'series',
      depth: Math.max(depthOf.get(e.nodes[0]) ?? 0, depthOf.get(e.nodes[1]) ?? 0),
      role: e.kind === 'R' ? 'series-pad' : 'pole',
      fHz: null,
      q: null,
      composition: fmtValue(e),
    });
  }

  /* Shunt-ketens: begin op een busknoop, loop over niet-serie-elementen tot
   * massa. Een knoop met meer dan één uitgaande tak zou hier een boom maken;
   * dat komt in deze netlists niet voor en wordt gemeld in plaats van geraden. */
  const used = new Set<string>();
  const shuntAdj = new Map<number, PassiveElement[]>();
  for (const e of shuntEl) {
    for (const n of e.nodes) {
      const l = shuntAdj.get(n) ?? [];
      l.push(e);
      shuntAdj.set(n, l);
    }
  }
  for (const start of [...busOf.keys()].sort((a, b) => a - b)) {
    for (const first of shuntAdj.get(start) ?? []) {
      if (used.has(first.id)) continue;
      const chain: PassiveElement[] = [];
      let node = start;
      let el: PassiveElement | undefined = first;
      while (el && !used.has(el.id)) {
        used.add(el.id);
        chain.push(el);
        const next = el.nodes[0] === node ? el.nodes[1] : el.nodes[0];
        if (next === 0) {
          node = 0;
          el = undefined;
          break;
        }
        node = next;
        el = (shuntAdj.get(node) ?? []).find((x) => !used.has(x.id));
      }
      const reachesGround = node === 0;
      const role = reachesGround ? classifyShunt(chain) : 'other';
      const L = chain.filter((c) => c.kind === 'L').reduce((a, c) => a + c.value, 0);
      const C = chain.filter((c) => c.kind === 'C').reduce((a, c) => a + 1 / c.value, 0);
      const Cs = C > 0 ? 1 / C : 0;
      const R =
        chain.reduce((a, c) => a + (c.kind === 'R' ? c.value : (c.seriesR ?? 0)), 0);
      const resonant = L > 0 && Cs > 0;
      groups.push({
        branch: busOf.get(start) ?? '',
        id: chain.map((c) => c.id).join('+'),
        partIds: chain.map((c) => c.id),
        position: 'shunt',
        depth: depthOf.get(start) ?? 0,
        role,
        fHz: resonant ? 1 / (TWO_PI * Math.sqrt(L * Cs)) : null,
        q: resonant && R > 0 ? Math.sqrt(L / Cs) / R : null,
        composition:
          chain.map(fmtValue).join(' + ') + (reachesGround ? '' : ' (bereikt massa niet)'),
      });
    }
  }
  return groups;
}

/**
 * Een groep ABLEREN: serie-elementen worden een DRAAD, shunt-elementen
 * verdwijnen.
 *
 * Niet: de parts uit de lijst gooien. Een serie-element weghalen knipt de tak
 * door en meet dan de stilte in plaats van het ontbreken van de groep — het is
 * dezelfde twee-varianten-regel die de prune-pas van de tuner zelf hanteert
 * (`open` voor shunt, `shorted` voor serie). `crossoverToNetlist` verwerkt
 * beide vlaggen, en een element dat zo verdwijnt komt niet in `free` terecht:
 * de her-polijsting kan het dus ook niet stiekem terugtunen.
 */
export function ablateGroup(parts: readonly VxpPart[], g: Group): VxpPart[] {
  const drop = new Set(g.partIds);
  return parts.map((p) =>
    p.partId !== undefined && drop.has(p.partId)
      ? g.position === 'series'
        ? { ...p, shorted: true }
        : { ...p, open: true }
      : p,
  );
}

/**
 * WAT EEN GROEP ELEKTRISCH DOET, gemeten in plaats van beweerd.
 *
 * Lost het netwerk twee keer op — mét en zonder de groep — en geeft het
 * verschil in de takoverdracht van de eigen driver terug. De functie van een
 * groep is dan een MEETRESULTAAT ("−7,4 dB bij 1380 Hz, breedte 0,4 octaaf")
 * en geen etiket dat iemand uit het schema heeft afgelezen; en zij is
 * vergelijkbaar met de gemeten aanleidingen die de opnamepas aflevert.
 *
 * De takoverdracht en niet de systeemrespons, met opzet: een groep in de
 * middentak verandert óók de som, maar dat verschil vermengt zijn eigen
 * werking met de fase-optelling van de andere takken. Wat hier gevraagd wordt
 * is wat de groep in ZIJN tak doet.
 */
export interface GroupEffect {
  /** dB verschil (met − zonder) per rasterpunt. */
  deltaDb: number[];
  /** Grootste absolute afwijking en waar. */
  peakDb: number;
  peakHz: number;
  /** Breedte in octaven waar |Δ| boven de helft van de piek ligt. */
  widthOct: number;
  /**
   * Mediane Δ over de DOORLAATBAND van de tak zelf (waar de overdracht binnen
   * `PASSBAND_WITHIN_DB` van haar eigen maximum ligt).
   *
   * Naast de piek, want de piek is bijna altijd een STOPBAND-getal: een
   * serieweerstand die het niveau met 5 dB zakt, verandert óók de bronimpedantie
   * die de shunt-condensator ziet en verschuift daarmee de flank — twintig dB
   * verderop, waar niemand luistert. Een groep die vlak over de doorlaatband
   * werkt is NIVEAUwerk; een groep die daar niets doet en ergens een smalle
   * hap neemt is een VAL. Dat onderscheid is de hele diff-tabel.
   */
  passbandDb: number;
}

/** Hoe ver onder haar eigen maximum een takoverdracht nog doorlaatband heet. */
const PASSBAND_WITHIN_DB = 6;

export function groupEffect(
  parts: readonly VxpPart[],
  g: Group,
  freq: readonly number[],
  driverZ: DriverImpedances,
): GroupEffect | null {
  const idOf = (ps: readonly VxpPart[]): Netlist =>
    crossoverToNetlist({ name: 'v38', parts: [...ps] } as VxpCrossover).netlist;
  const withNet = idOf(parts);
  const withoutNet = idOf(ablateGroup(parts, g));
  const pick = (nl: Netlist): string | null => {
    const d = nl.elements.find((e) => e.kind === 'driver' && e.model === g.branch);
    return d ? d.id : null;
  };
  const idA = pick(withNet);
  const idB = pick(withoutNet);
  if (!idA || !idB) return null;
  const a = solveNetwork(withNet, freq, driverZ).transfers[idA];
  const b = solveNetwork(withoutNet, freq, driverZ).transfers[idB];
  const deltaDb = freq.map((_, i) => {
    const ma = Math.hypot(a[i].re, a[i].im);
    const mb = Math.hypot(b[i].re, b[i].im);
    return 20 * Math.log10(Math.max(ma, 1e-12) / Math.max(mb, 1e-12));
  });
  let peakDb = 0;
  let peakIdx = 0;
  deltaDb.forEach((v, i) => {
    if (Math.abs(v) > Math.abs(peakDb)) {
      peakDb = v;
      peakIdx = i;
    }
  });
  const magA = a.map((c) => Math.hypot(c.re, c.im));
  const maxA = Math.max(...magA);
  const inBand: number[] = [];
  magA.forEach((m, i) => {
    if (20 * Math.log10(Math.max(m, 1e-12) / maxA) >= -PASSBAND_WITHIN_DB) inBand.push(deltaDb[i]);
  });
  inBand.sort((x, y) => x - y);
  const passbandDb = inBand.length ? inBand[Math.floor(inBand.length / 2)] : 0;
  const half = Math.abs(peakDb) / 2;
  let lo = peakIdx;
  let hi = peakIdx;
  while (lo > 0 && Math.abs(deltaDb[lo - 1]) >= half) lo--;
  while (hi < freq.length - 1 && Math.abs(deltaDb[hi + 1]) >= half) hi++;
  return {
    deltaDb,
    peakDb,
    peakHz: freq[peakIdx],
    widthOct: Math.log2(freq[hi] / freq[lo]),
    passbandDb,
  };
}
