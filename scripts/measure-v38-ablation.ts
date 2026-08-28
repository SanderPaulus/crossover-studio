/**
 * V38 STAP 2 — DE ABLATIE: hoeveel van het gat naar HUIDIG draagt elke groep?
 *
 * `npx vite-node scripts/measure-v38-ablation.ts` — acht waardetunes op de
 * topologie van HUIDIG, gemeten ~790 s per stuk, ruim anderhalf uur.
 * `V38_LIMIT=n` doet er n als rookproef; dat is geen meting.
 *
 * DRIE CONTROLES VÓÓR DE ABLATIE, EN ZIJ DRAGEN DE HELE TABEL.
 *
 * De ablatie trekt armen van elkaar af, dus de nulmeting moet kloppen. De
 * bevroren netlist (0,60 dB) is die nulmeting NIET: hij is nooit door deze
 * doelfunctie beoordeeld. Wat er tussen zit is de vraag die eerst beantwoord
 * moet worden, en de eerste rookproef beantwoordde hem meteen: dezelfde
 * topologie, dezelfde waarden als zaad, alleen her-gepolijst, levert 2,76 dB.
 * Zonder controle zou dat als "de ablatie van de eerste groep" zijn
 * opgeschreven, en dat is precies de fout die V27 optekende.
 *
 * Dus drie controle-armen, die samen scheiden wat één arm niet kan:
 *   0a  GEEN kooi          — de tuner mag de overnames verplaatsen.
 *   0b  de A5d.3-VENSTERS  — de kooi waarin élke v2-kandidaat leeft.
 *   0c  HUIDIG's EIGEN overnames ± 2 % — de overname wordt vastgehouden waar
 *       de ontwerper hem legde (dezelfde speling die `pinRange` in
 *       `threeWayChain.ts` een gestelde pin geeft).
 * Blijft de doelfunctie ook onder 0c weglopen van 0,60 dB, dan gaat het gat
 * niet over de plaats van de overname en ook niet over topologie.
 *
 * De ablatiereeks draait onder de 0c-kooi, zodat het verschil tussen twee
 * armen de GROEP is en niet een verschoven overname.
 *
 * DE VOLGORDE is cumulatief, van buiten naar binnen: dalende diepte op de bus,
 * bij gelijke diepte eerst de shunt-keten die aan die knoop hangt en dan het
 * serie-element ervóór, daarna takvolgorde. Een filterPOOL wordt nooit
 * geableerd — de kern blijft staan, dat is de vraag.
 *
 * De tuner draait WAARDEN en geen topologie; wat er verder anders is dan de
 * v2-route, en waarom, staat in `v38-bench.ts` bij `TUNE_OPTS`.
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
import { ablateGroup, decompose, type Group } from './v38-groups.ts';
import type { VxpPart } from '../src/lib/parsers/vxp.ts';

/** Relatieve speling rond een vastgehouden overname — dezelfde 2 % die
 *  `pinRange` in `threeWayChain.ts` een gestelde pin zonder marge geeft. */
const PIN_SLACK = 0.02;

/**
 * OP WELKE ZOEKMAAT DE REEKS DRAAIT — en waarom dat een argument moest worden.
 *
 * `V38_ERRSMOOTH=0` draait élke arm met de magnitude-gladding van de zoektocht
 * UIT; alles anders blijft gelijk. Default is de gladding van de app (1/12
 * octaaf, de tuner-standaard), en dat is wat de v2-route doet.
 *
 * DE REDEN IS EEN MEETRESULTAAT. Op de gegladde maat landt de her-polijsting
 * op 2,98 dB voor de volle topologie én 2,98 dB zonder de gedempte val van de
 * middentak: de armen zijn niet te onderscheiden, want de doelfunctie komt daar
 * hoe dan ook uit. Een wattenval waarin elke groep 0,00 dB bijdraagt meet dan
 * niet de groepen maar de bodem van de maat waarop hij is opgeschreven.
 * Controle 0d laat zien dat diezelfde topologie ongegladd op 0,53 dB uitkomt —
 * dus de reeks wordt tweemaal gedraaid en beide tabellen staan in het
 * casusboek, met de gegladde als de maat die de v2-route vandaag gebruikt.
 */
const UNSMOOTHED = process.env.V38_ERRSMOOTH === '0';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(
  HERE,
  '..',
  'test-fixtures',
  `casus1_v38_ablatie${UNSMOOTHED ? '_ongegladd' : ''}.json`,
);

const base = partsOf('HUIDIG');
const report = buildReport({
  manifest,
  files,
  filter: casus1FilterFromParts('HUIDIG', base, manifest, files),
  geometry,
  settings: SETTINGS,
});

/** HUIDIG's eigen geleverde overnames, uit de metriekbibliotheek. */
const huidigXo = report.crossings.map((c) => c.fHz);
/** De A5d.3-vensters per aangrenzend paar, in dezelfde volgorde. */
const windowCage: ([number, number] | null)[] = report.predesign.windows.map((w) =>
  w.floorHz !== null && w.ceilingHz !== null && !w.empty ? [w.floorHz, w.ceilingHz] : null,
);
const ownCage: ([number, number] | null)[] = huidigXo.map((f) => [
  f * (1 - PIN_SLACK),
  f * (1 + PIN_SLACK),
]);

console.log(`HUIDIG's eigen overnames: ${huidigXo.map((f) => f.toFixed(1)).join(' / ')} Hz`);
console.log(
  `A5d.3-vensters (orde 4): ${windowCage
    .map((c) => (c ? `${c[0].toFixed(1)}–${c[1].toFixed(1)}` : '—'))
    .join(' | ')} Hz`,
);
huidigXo.forEach((f, i) => {
  const c = windowCage[i];
  if (c && (f < c[0] || f > c[1])) {
    console.log(
      `  let op: overname ${i + 1} (${f.toFixed(1)} Hz) ligt BUITEN zijn eigen A5d.3-venster ` +
        `${c[0].toFixed(1)}–${c[1].toFixed(1)} Hz — een gekooide her-polijsting kan er dus niet terug.`,
    );
  }
});

interface Row extends Measured {
  arm: string;
  kooi: string;
  verwijderd: string | null;
  rol: string | null;
  onderdelen: number;
  vrij: number;
  evaluaties: number;
  kruispuntenHz: (number | null)[];
  /** Wat de tuner van het ZAAD zag, in zijn eigen eenheden. */
  tuner_voor: TunerVector;
  /** Idem, van wat hij leverde. Samen: wat de her-polijsting kocht en betaalde. */
  tuner_na: TunerVector;
  bandNote: string;
  infeasible: string | null;
  audit_verwijderde: string[];
  /** De geleverde netlist zelf, zodat elke latere kolom uit dit bestand kan
   *  komen in plaats van uit een tweede tune van dertien minuten. */
  parts: unknown;
  seconden: number;
}

/** Hoeveel controle-armen er vóór de ablatiereeks staan. */
const CONTROL_ARMS = 4;

const order = [...decompose(base)]
  .filter((g) => g.role !== 'pole')
  .sort(
    (a, b) =>
      b.depth - a.depth ||
      (a.position === b.position ? 0 : a.position === 'shunt' ? -1 : 1) ||
      (a.branch < b.branch ? -1 : a.branch > b.branch ? 1 : 0) ||
      (a.id < b.id ? -1 : 1),
  );

console.log(
  `ablatievolgorde (buiten → binnen): ${order.map((g) => `${g.id} [${g.role}]`).join(' → ')}`,
);
const frozen = measure('HUIDIG-bevroren', base);
console.log(`bevroren HUIDIG (rapport): ${JSON.stringify(frozen)}`);

/* DE REFERENTIERIJ IN DE EENHEDEN VAN DE TUNER komt uit arm 0 zelf.
 *
 * `NetOptimizeResult.before` is per definitie de volle-raster-metriek van het
 * ZAAD, en het zaad van arm 0 IS de bevroren HUIDIG — dus die rij is exact, en
 * een tweede run ernaast zou alleen een tweede kans zijn om iets anders te
 * meten. Een aparte "meet maar tune niet"-run kan trouwens niet: met elke
 * waarde op slot weigert `optimizeNetworkValues` met
 * *"Every component is locked — nothing for the optimizer to move."*
 *
 * WAT DAT KOST, en het staat hier omdat het de zoeknaad raakt: `before` draagt
 * geen `ripplePeakSmoothedDb` en geen `dissRatio` — die twee bestaan alleen
 * voor een GELEVERD netwerk. De 1/12-octaaf gegladde piek is dus per ARM te
 * lezen (naast de ongegladde van dezelfde arm) en niet voor HUIDIG zelf. */

interface Arm {
  name: string;
  cageName: string;
  cage: ([number, number] | null)[] | null;
  removed: Group | null;
  parts: VxpPart[];
  /** Extra tuner-opties voor deze arm — leeg voor alle armen op één na. */
  extra?: Record<string, unknown>;
}
const arms: Arm[] = [
  { name: 'controle 0a — alles, geen kooi', cageName: 'geen', cage: null, removed: null, parts: base },
  {
    name: 'controle 0b — alles, A5d.3-venster als kooi',
    cageName: 'venster',
    cage: windowCage,
    removed: null,
    parts: base,
  },
  {
    name: "controle 0c — alles, HUIDIG's eigen overnames ±2 %",
    cageName: 'eigen',
    cage: ownCage,
    removed: null,
    parts: base,
  },
  /* CONTROLE 0d — DE ZOEKNAAD ALS ARM.
   *
   * Gelijk aan 0c op één sleutel na: `errorSmoothOct: 0`. De zoektocht gladt
   * standaard de DRIVERMAGNITUDES met 1/12 octaaf vóór de decimatie en laat de
   * FASE ongemoeid (`smoothMag` in `netOptimizer.ts`), waarna zij de takken
   * complex sommeert. Op het geleverde netwerk van de eerste warme run leverde
   * die view een rippelpiek van 43,1 dB naast een ruwe 6,4 dB — de gegladde
   * magnitude en de ongegladde fase heffen elkaar dan ergens op een manier op
   * die de echte som niet kent. Of dat de her-polijsting stuurt is geen kwestie
   * van redeneren: zet de gladding uit en meet het. Alles verder identiek aan
   * 0c, zodat het verschil één sleutel is. */
  /* Controle 0d is de SPIEGEL van de modus: hij draait de gladding precies
   * andersom dan de rest van deze run, zodat elke run zijn eigen
   * ene-sleutel-vergelijking draagt en geen enkele tabel naar de andere hoeft
   * te verwijzen om die te kunnen lezen. */
  {
    name: UNSMOOTHED
      ? 'controle 0d — als 0c, maar zoektocht GEGLADD (de app-standaard)'
      : 'controle 0d — als 0c, maar zoektocht ONGEGLAD (errorSmoothOct 0)',
    cageName: 'eigen',
    cage: ownCage,
    removed: null,
    parts: base,
    extra: UNSMOOTHED ? { errorSmoothOct: 1 / 12 } : { errorSmoothOct: 0 },
  },
];
let cur: VxpPart[] = [...base];
for (const g of order) {
  cur = ablateGroup(cur, g);
  arms.push({
    name: `arm ${arms.length - 3} — zonder ${g.id}`,
    cageName: 'eigen',
    cage: ownCage,
    removed: g,
    parts: cur,
  });
}

/** Welke componenten er tussen zaad en levering elektrisch verdwenen zijn. */
const liveIds = (ps: readonly VxpPart[]): Set<string> =>
  new Set(
    ps
      .filter(
        (p) =>
          p.partId !== undefined &&
          (p.type === 'Resistor' || p.type === 'Inductor' || p.type === 'Capacitor') &&
          p.shorted !== true &&
          p.open !== true,
      )
      .map((p) => p.partId as string),
  );
const auditRemoved = (seed: readonly VxpPart[], out: readonly VxpPart[]): string[] => {
  const after = liveIds(out);
  return [...liveIds(seed)].filter((id) => !after.has(id)).sort();
};

const LIMIT = Number(process.env.V38_LIMIT ?? '0');
const rows: Row[] = [];
for (const a of arms) {
  if (LIMIT > 0 && rows.length >= LIMIT) break;
  const t0 = Date.now();
  const net = optimizeNetworkValues(
    a.parts,
    [...chain.grid],
    chain.w,
    chain.t,
    chain.driverZ,
    { offsetMm: 0, trimDb: 0, inverted: false },
    {
      ...TUNE_OPTS,
      ...(UNSMOOTHED ? { errorSmoothOct: 0 } : {}),
      ...(a.cage ? { xoRangePairs: a.cage } : {}),
      ...(a.extra ?? {}),
    },
  );
  const seconds = (Date.now() - t0) / 1000;
  const row: Row = {
    arm: a.name,
    kooi: a.cageName,
    verwijderd: a.removed?.id ?? null,
    rol: a.removed?.role ?? null,
    onderdelen: countParts(net.parts),
    vrij: net.tuned,
    evaluaties: net.evaluations,
    ...measure(a.name, net.parts),
    kruispuntenHz: (net.after.xoHzPairs ?? []).map((v) => r2(v)),
    tuner_voor: tunerVectorOf(net.before),
    tuner_na: tunerVectorOf(net.after),
    bandNote: net.bandNote,
    infeasible: net.infeasible ?? null,
    /* WAT DE ONDERDELENAUDIT WEGHAALDE, per arm.
     *
     * `staged` staat uit, dus er wordt niet gesnoeid — maar de audit is een
     * BESCHERMING en blijft gewapend (V26 rij 33), en zij verwijdert
     * componenten. Op de transplantatie haalde zij `C·L10` weg, een
     * vierde-orde-pool. Zonder deze kolom zit zo'n verwijdering onzichtbaar in
     * de Δ tussen twee armen en leest zij als groepsbijdrage. */
    audit_verwijderde: auditRemoved(a.parts, net.parts),
    parts: net.parts,
    seconden: Number(seconds.toFixed(0)),
  };
  rows.push(row);
  console.log(
    `${a.name.padEnd(46)} [${row.kooi}] onderdelen ${row.onderdelen}  RMS ${row.rms}  ` +
      `±${row.venster}  W-M ${row.wmFase}°  M-T ${row.mtFase}°  min|Z| ${row.minZ} Ω  ` +
      `EPDR ${row.epdr} Ω  diss ${row.dissipatiePct} %  Qes× ${row.qesMult}  ` +
      `xo ${row.kruispuntenHz.join('/')}  (${row.seconden} s)`,
  );
  console.log(
    `${' '.repeat(48)}tuner: rippelpiek ${row.tuner_voor.rippelPiekDb} → ${row.tuner_na.rippelPiekDb} dB ` +
      `(gegladd ${row.tuner_na.rippelPiekGegladdDb}); gem.afw ${row.tuner_voor.gemAfwDb} → ${row.tuner_na.gemAfwDb} dB; ` +
      `fase ${row.tuner_voor.faseDeg} → ${row.tuner_na.faseDeg}°; ` +
      `R_source ${row.tuner_voor.rSourceOhm} → ${row.tuner_na.rSourceOhm} Ω; ` +
      `dissRatio ${row.tuner_na.dissRatio}; power ${row.tuner_na.powerStdDb ?? 'weegt 0'}`,
  );
}

/* ---- de wattenval, met de VOLLE VECTOR ---------------------------------- */
const n = (v: number | null) => (v === null ? '—' : v.toFixed(2));
const xo = (v: (number | null)[]) =>
  v.map((x) => (x === null ? '—' : x.toFixed(0))).join('/');

console.log('\n=== wattenval — de rapportkant (wat het casusboek als kolom kent) ===');
console.log(
  '| arm | kooi | verwijderd | rol | onderdelen | RMS (dB) | Δ RMS | SPL ± (dB) | ' +
    'smalste piek (dB @ Hz) | W-M fase (°) | M-T fase (°) | min \\|Z\\| (Ω) | vloer | ' +
    'EPDR (Ω) | dissipatie (%) | grootste R (W) | Q_es× | overnames (Hz) |',
);
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
const reportRow = (
  label: string,
  kooi: string,
  verwijderd: string,
  rol: string,
  onderdelen: number,
  m: Measured,
  d: number | null,
  overnames: string,
) =>
  console.log(
    `| ${label} | ${kooi} | ${verwijderd} | ${rol} | ${onderdelen} | ${n(m.rms)} | ` +
      `${d === null ? '—' : `${d >= 0 ? '+' : ''}${d.toFixed(2)}`} | ${n(m.venster)} | ` +
      `${m.smallePiekDb === null ? '—' : `${n(m.smallePiekDb)} @ ${n(m.smallePiekHz)}`} | ` +
      `${n(m.wmFase)} | ${n(m.mtFase)} | ${n(m.minZ)} | ` +
      `${m.haaltVloer === null ? '—' : m.haaltVloer ? 'ja' : '**nee**'} | ${n(m.epdr)} | ` +
      `${n(m.dissipatiePct)} | ${n(m.grootsteRW)} | ${n(m.qesMult)} | ${overnames} |`,
  );
reportRow(
  'HUIDIG, bevroren',
  '—',
  '—',
  '—',
  countParts(base),
  frozen,
  null,
  huidigXo.map((f) => f.toFixed(0)).join('/'),
);
/* DE VOORGANGER VAN ELKE ABLATIE-ARM, en waarom de eerste een uitzondering is.
 *
 * De reeks draait onder de `eigen`-kooi met de standaard-gladding, en dat is
 * exact de configuratie van controle 0c. De EERSTE ablatie-arm hoort dus tegen
 * 0c te worden gelegd en niet tegen zijn buurman in de lijst — die buurman is
 * 0d, dezelfde topologie met de gladding UIT, en een verschil daarmee zou het
 * gladdings-effect als groepsbijdrage opschrijven. Precies de fout waarvoor de
 * controle-armen bestaan, een regel lager. Een controle-arm zelf krijgt geen
 * Δ: hij is geen stap in de reeks. */
const FIRST_ABLATION = CONTROL_ARMS;
const BASELINE_FOR_SERIES = 2; // controle 0c
rows.forEach((r, i) => {
  const prev =
    i === FIRST_ABLATION
      ? (rows[BASELINE_FOR_SERIES] ?? null)
      : i > FIRST_ABLATION
        ? rows[i - 1]
        : null;
  const d = prev && prev.rms !== null && r.rms !== null ? r.rms - prev.rms : null;
  reportRow(r.arm, r.kooi, r.verwijderd ?? '—', r.rol ?? '—', r.onderdelen, r, d, xo(r.kruispuntenHz));
});

console.log('\n=== dezelfde armen in de EENHEDEN VAN DE TUNER (wat de scalar weegt) ===');
console.log(
  'De referentierij is het ZAAD van arm 0, en dat zaad IS de bevroren HUIDIG. De twee ' +
    'kolommen die alleen een geleverd netwerk kent (gegladde rippelpiek, dissRatio) staan ' +
    'daarom leeg op die rij.',
);
console.log(
  '| arm | rippelpiek (dB) | rippelpiek 1/12-okt gegladd (dB) | gem. afwijking (dB) | ' +
    'fase (°) | paarfase (°) | min \\|Z\\| (Ω) | R_source (Ω) | dissRatio | power-std (dB) | ' +
    'power-fold (dB) |',
);
console.log('|---|---|---|---|---|---|---|---|---|---|---|');
const tunerRow = (label: string, t: TunerVector) =>
  console.log(
    `| ${label} | ${n(t.rippelPiekDb)} | ${n(t.rippelPiekGegladdDb)} | ${n(t.gemAfwDb)} | ` +
      `${n(t.faseDeg)} | ${t.paarFaseDeg ? t.paarFaseDeg.map((v) => n(v)).join('/') : '—'} | ` +
      `${n(t.zMinOhm)} | ${n(t.rSourceOhm)} | ${n(t.dissRatio)} | ` +
      `${t.powerStdDb === null ? 'weegt 0' : n(t.powerStdDb)} | ` +
      `${t.powerFoldDb === null ? 'weegt 0' : n(t.powerFoldDb)} |`,
  );
if (rows.length > 0) tunerRow('HUIDIG, bevroren (= zaad van arm 0)', rows[0].tuner_voor);
for (const r of rows) tunerRow(r.arm, r.tuner_na);

/* ---- de VENSTERGRENS als eigen post -------------------------------------
 *
 * HUIDIG kruist W-M onder de A5d.3-vloer, en de generator mag daar per beleid
 * niet komen — dat is meetgeldigheid en het is terecht. Dit deel van het gat is
 * dus geen topologie en geen doelfunctie maar ONTOEGANKELIJKHEID, en het
 * verdient een eigen regel in plaats van te worden meegeteld bij een groep. De
 * meting is de arm die HUIDIG's eigen overname vasthoudt tegen de arm die in
 * het venster moet blijven — zelfde topologie, zelfde waarden als zaad, zelfde
 * doelfunctie, alleen een andere kooi. */
const own = rows.find((r) => r.kooi === 'eigen' && r.verwijderd === null) ?? null;
const win = rows.find((r) => r.kooi === 'venster') ?? null;
console.log('\n=== venstergrens: wat de A5d.3-vloer kost, apart gehouden ===');
if (own && win) {
  console.log(
    `HUIDIG kruist W-M op ${huidigXo[0].toFixed(1)} Hz; de A5d.3-vloer ligt op ` +
      `${windowCage[0]?.[0].toFixed(1) ?? '—'} Hz (${
        windowCage[0] ? Math.log2(windowCage[0][0] / huidigXo[0]).toFixed(2) : '—'
      } octaaf hoger).`,
  );
  console.log(
    '| kooi | overnames geleverd (Hz) | RMS (dB) | SPL ± (dB) | W-M fase (°) | M-T fase (°) | ' +
      'min \\|Z\\| (Ω) | dissipatie (%) | Q_es× |',
  );
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const r of [own, win]) {
    console.log(
      `| ${r.kooi === 'eigen' ? "HUIDIG's eigen overname ±2 %" : 'A5d.3-venster'} | ` +
        `${xo(r.kruispuntenHz)} | ${n(r.rms)} | ${n(r.venster)} | ${n(r.wmFase)} | ` +
        `${n(r.mtFase)} | ${n(r.minZ)} | ${n(r.dissipatiePct)} | ${n(r.qesMult)} |`,
    );
  }
  if (own.rms !== null && win.rms !== null) {
    console.log(
      `bijdrage van de venstergrens aan het gat: ${(win.rms - own.rms >= 0 ? '+' : '')}` +
        `${(win.rms - own.rms).toFixed(2)} dB RMS ` +
        `(venster t.o.v. eigen overname). Dit deel is geen topologie en geen doelfunctie.`,
    );
  }
} else {
  console.log('(niet te meten: een van beide armen ontbreekt in deze run)');
}

writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      _:
        'V38 stap 2 — de ablatie op HUIDIG, met drie controle-armen ervoor. Documentatie, ' +
        'geen acceptatiewaarde: niets assert hierop.',
      opzet: {
        tuner:
          'optimizeNetworkValues, WAARDEN-only (geen `staged`, dus geen snoei en geen ' +
          'escalatie) — maar de ONDERDELENAUDIT blijft gewapend en verwijdert wel ' +
          'componenten; zie `audit_verwijderde` per arm',
        zoekgladding: UNSMOOTHED ? 'UIT (errorSmoothOct 0)' : "1/12 octaaf (de app-standaard)",
        raster: [chain.grid[0], chain.grid[chain.grid.length - 1], chain.grid.length],
        vloer_ohm: FLOOR,
        opties: Object.keys(TUNE_OPTS).sort(),
        kooien: {
          geen: null,
          venster: windowCage,
          eigen: ownCage,
        },
        niet_gewapend: [
          'branchTargets — komt uit de ontwerpstap van de keten; die draait hier niet',
          'gateViolation — de poort oordeelt ná afloop met buildReport; een geweigerde tune levert haar zaad (V31/V33) en dat is geen ablatiemeting',
          'staged — zet snoei en escalatie aan, en die veranderen de topologie',
        ],
      },
      huidig_overnames_hz: huidigXo,
      bevroren_huidig: frozen,
      bevroren_huidig_tuner: rows[0]?.tuner_voor ?? null,
      bevroren_huidig_tuner_hoe:
        'het ZAAD van arm 0, dat de bevroren HUIDIG is. Een aparte meet-maar-tune-niet-run ' +
        'kan niet: met elke waarde op slot weigert optimizeNetworkValues.',
      band_tuner: rows[0]?.bandNote ?? null,
      band_rapport: frozen.bandHz,
      doelcurve_gelijk:
        'JA, nagegaan: judgeResponse rekent de RMS-afwijking t.o.v. de doelcurve gerefereerd ' +
        'aan het BANDGEMIDDELDE (response.ts), en de amplitudeterm van de zoektocht is ' +
        'bandStd — de standaarddeviatie om datzelfde bandgemiddelde (netOptimizer.ts). ' +
        'Zelfde vlakke doelcurve, zelfde niveauvrijheid, zelfde statistiek. Wat WEL verschilt: ' +
        'de zoektocht rekent op een gedecimeerd raster met 1/12-octaaf gegladde magnitudes, ' +
        'de acceptatie op het volle raster ongegladd (A5e.1 gladt het VENSTER, niet de RMS), ' +
        'en de banden verschillen (zie band_tuner / band_rapport).',
      volgorde: order.map((g) => ({ id: g.id, rol: g.role, tak: g.branch, diepte: g.depth })),
      armen: rows,
    },
    null,
    1,
  )}\n`,
  'utf-8',
);
console.log(`\ngeschreven: ${OUT}`);
