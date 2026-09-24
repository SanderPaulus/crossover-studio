/**
 * U-5c — TOLERANTIEGEVOELIGHEID: wat ±5 % op élk onderdeel met een GELEVERD
 * ontwerp doet.
 *
 * `npx vite-node scripts/measure-u5c-tolerance.ts [SLEUTEL ...]` — seconden,
 * GEEN ketenrun en GEEN tune: het netwerk wordt alleen opnieuw OPGELOST met
 * andere componentwaarden. `U5C_N=<n>` zet het aantal Monte-Carlo-trekkingen
 * (default 200), `U5C_PCT=<p>` de tolerantieband in procent (default 5),
 * `U5C_SEED=<n>` de seed. Schrijft `test-fixtures/casus1_u5c_tolerantie.json`.
 *
 * DE VUISTREGEL. "Geen ontwerp dat binnen de onderdelentolerantie instort" is
 * een van de oudste regels in de bouwschuur, en zij is de enige van de
 * veegronde die niet over een GRENS gaat maar over de STEILHEID van het
 * optimum: een netwerk waarvan de rimpel binnen ±5 % een decibel wegloopt is
 * een netwerk dat je niet kunt bouwen, hoe goed het nominale getal ook is.
 * Deze app kon haar tot U-5c niet beantwoorden: zij rapporteert overal het
 * NOMINALE ontwerp en nergens hoe scherp dat nominale punt is.
 *
 * WAT DIT WEL EN NIET IS. Het is een MEETSCRIPT en geen kolom: er wordt niets
 * gewapend, niets geweigerd, geen eis gesteld en geen corpus aangeraakt. De
 * uitkomst is het bewijsmateriaal waarmee iemand KAN besluiten er een
 * gevoeligheidskolom van te maken — dat is een eigen sessie en een eigen
 * besluit (A5e.1: een eis die deze sessie zelf zou stellen is een eis die
 * niemand gesteld heeft).
 *
 * TWEE LEZINGEN, en zij beantwoorden verschillende vragen.
 *
 *   1. MONTE-CARLO binnen de band, met een seed: hoe ver loopt élke grootheid
 *      weg als ALLE onderdelen tegelijk binnen hun tolerantie zwerven. Dat is
 *      wat een bouwer werkelijk overkomt — de p95 en het uiterste.
 *   2. ÉÉN ONDERDEEL TEGELIJK, op beide randen: WELK onderdeel de spreiding
 *      draagt. Een som over onderdelen zegt niet welke schroef je nauwkeurig
 *      moet kopen; deze tabel wel.
 *
 * DE VERDELING IS UNIFORM binnen de band en niet normaal, met reden: een
 * onderdelentolerantie is een SPECIFICATIE ("binnen ±5 %") en geen gemeten
 * spreiding. Een normale verdeling eromheen zou een aanname over de fabrikant
 * toevoegen die niemand gemeten heeft (A3h); uniform zegt precies wat het blad
 * belooft en niets meer. Wie de echte verdeling meet mag haar hier invullen.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CASUS1_BUILDABILITY,
  CASUS1_COIL_DCR_SETTINGS,
  CASUS1_CONTINUOUS_POWER_W,
  CASUS1_EXCURSION,
  CASUS1_LEVEL_WORK_SETTINGS,
  CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER,
  CASUS1_TARGET_CURVE,
  CASUS1_WINDOW_SETTINGS,
} from '../src/lib/engine2/casus1V2.fixture.ts';
import { CASUS1_DIR } from '../src/lib/engine2/casus1.fixture.ts';
import { deserializeFilter } from '../src/lib/filterFile.ts';
import {
  CASUS1_WOOFER_DC_OHM,
  casus1Files,
  casus1FilterFromParts,
  casus1Geometry,
  casus1Manifest,
  casus1SetOf,
  loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import { buildReport, type EngineV2Report } from '../src/lib/engine2/report.ts';
import { stream } from '../src/lib/engine2/optimizer/determinism.ts';
import type { VxpPart } from '../src/lib/parsers/vxp.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'test-fixtures', 'casus1_u5c_tolerantie.json');

const N = Math.max(1, Number(process.env.U5C_N ?? 200));
const PCT = Number(process.env.U5C_PCT ?? 5);
const SEED = Number(process.env.U5C_SEED ?? 20260924);
const KEYS = process.argv.slice(2).filter((a) => !a.startsWith('-'));

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const netlists = (golden.manifest_en_geometrie as unknown as { netlists: Record<string, string> }).netlists;

/** De gemeten kolommen, en alle drie komen uit ÉÉN rapport. */
interface Vector {
  rippleDb: number | null;
  windowDb: number | null;
  rmsDb: number | null;
  minZOhm: number | null;
  mk: number[];
}

const SETTINGS = {
  ...(CASUS1_CONTINUOUS_POWER_W !== null ? { amplifierPowerW: CASUS1_CONTINUOUS_POWER_W } : {}),
  ...(Object.keys(CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER).length > 0
    ? { maxDriveOnFsDbByDriver: { ...CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER } }
    : {}),
  ...CASUS1_WINDOW_SETTINGS,
  ...CASUS1_BUILDABILITY,
  ...CASUS1_LEVEL_WORK_SETTINGS,
  reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
  targetCurve: CASUS1_TARGET_CURVE,
  ...CASUS1_EXCURSION,
  ...CASUS1_COIL_DCR_SETTINGS,
};

/**
 * Welke onderdelen een tolerantie hebben: alles met een WAARDE die je koopt.
 *
 * De parameternaam is die van het schema zelf (`R` / `L` / `C`); de EENHEID
 * doet er niet toe, want wat hier gebeurt is een vermenigvuldiging. De DCR van
 * een spoel wordt met opzet NIET meegeschaald: dat is een aparte parameter en
 * een inductantietolerantie van ±5 % zegt niets over het koper.
 */
const PARAM: Record<string, string> = { Capacitor: 'C', Inductor: 'L', Resistor: 'R' };

const valueParam = (p: VxpPart) => {
  const name = PARAM[p.type];
  if (name === undefined) return null;
  const par = p.params.find((x) => x.name === name);
  return par && par.value > 0 ? par : null;
};
const tolerable = (p: VxpPart): boolean => valueParam(p) !== null;
const idOf = (p: VxpPart, i: number) => p.partId ?? `${p.type}#${i}`;

function vectorOf(report: EngineV2Report): Vector {
  const r = report.system.response ?? null;
  return {
    rippleDb: r ? r.windowPlusMinusDb * 2 : null,
    windowDb: r ? r.windowPlusMinusDb : null,
    rmsDb: r ? r.rmsDeviationDb : null,
    minZOhm: report.gates.verdicts.find((v) => v.gate === 'M-B/|Z|')?.value ?? null,
    mk: report.system.phaseTracking.map((p) => p.meanAbsDeg),
  };
}

const partsOf = (key: string): VxpPart[] =>
  deserializeFilter(readFileSync(join(CASUS1_DIR, netlists[key]), 'utf-8')).parts;

function reportOn(key: string, scale: (id: string) => number): EngineV2Report {
  const parts = partsOf(key).map((p, i) => {
    const par = valueParam(p);
    if (!par) return p;
    const f = scale(idOf(p, i));
    return f === 1
      ? p
      : { ...p, params: p.params.map((x) => (x === par ? { ...x, value: x.value * f } : x)) };
  });
  return buildReport({
    manifest,
    files,
    filter: casus1FilterFromParts(netlists[key], parts, manifest, files),
    geometry: casus1Geometry(golden),
    settings: SETTINGS,
  });
}

const q = (xs: number[], p: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
};
const f2 = (x: number | null) => (x === null ? '   —  ' : x.toFixed(2).padStart(6));
const f3 = (x: number | null) => (x === null ? '    —  ' : x.toFixed(3).padStart(7));

const subjects = KEYS.length > 0 ? KEYS : ['KAND_V2_2'];
const out: Record<string, unknown>[] = [];

for (const key of subjects) {
  if (!netlists[key]) throw new Error(`${key} staat niet in manifest_en_geometrie.netlists`);
  const nominal = reportOn(key, () => 1);
  const nv = vectorOf(nominal);
  const parts = partsOf(key)
    .map((p, i) => ({ p, id: idOf(p, i) }))
    .filter((x) => tolerable(x.p));

  console.log(`\n=== ${key} — ${parts.length} onderdelen met een tolerantie, ±${PCT} %, ${N} trekkingen ===`);
  console.log(
    `NOMINAAL  ± ${f2(nv.windowDb)} dB · rms ${f3(nv.rmsDb)} dB · min |Z| ${f3(nv.minZOhm)} Ω · M-K ${nv.mk.map((m) => m.toFixed(1)).join(' / ')}°`,
  );

  /* ---- 1. Monte-Carlo, alle onderdelen tegelijk ---------------------- */
  const rnd = stream(SEED, `u5c-tolerance/${key}`);
  const draws: Vector[] = [];
  for (let i = 0; i < N; i++) {
    const f = new Map<string, number>();
    for (const x of parts) f.set(x.id, 1 + ((rnd() * 2 - 1) * PCT) / 100);
    draws.push(vectorOf(reportOn(key, (id) => f.get(id) ?? 1)));
  }
  const col = (pick: (v: Vector) => number | null): number[] =>
    draws.map(pick).filter((x): x is number => x !== null);
  const band = (name: string, pick: (v: Vector) => number | null, nom: number | null) => {
    const xs = col(pick);
    if (xs.length === 0 || nom === null) return null;
    const dev = xs.map((x) => Math.abs(x - nom));
    const row = {
      grootheid: name,
      nominaal: Number(nom.toFixed(4)),
      min: Number(Math.min(...xs).toFixed(4)),
      max: Number(Math.max(...xs).toFixed(4)),
      p95_afwijking: Number(q(dev, 0.95).toFixed(4)),
      grootste_afwijking: Number(Math.max(...dev).toFixed(4)),
    };
    console.log(
      `  ${name.padEnd(12)} nominaal ${f3(nom)}  spreiding ${f3(row.min)} … ${f3(row.max)}  ` +
        `p95 |Δ| ${f3(row.p95_afwijking)}  max |Δ| ${f3(row.grootste_afwijking)}`,
    );
    return row;
  };
  console.log('\n  -- 1. MONTE-CARLO: alle onderdelen tegelijk --');
  const mc = [
    band('± venster dB', (v) => v.windowDb, nv.windowDb),
    band('rms dB', (v) => v.rmsDb, nv.rmsDb),
    band('min |Z| Ω', (v) => v.minZOhm, nv.minZOhm),
    ...nv.mk.map((m, i) => band(`M-K ${i + 1} °`, (v) => v.mk[i] ?? null, m)),
  ].filter((x): x is NonNullable<typeof x> => x !== null);

  /* ---- 2. één onderdeel tegelijk, op beide randen -------------------- */
  console.log('\n  -- 2. ÉÉN ONDERDEEL TEGELIJK, op beide randen: wie draagt de spreiding --');
  const per: Record<string, unknown>[] = [];
  for (const { p, id } of parts) {
    const lo = vectorOf(reportOn(key, (q) => (q === id ? 1 - PCT / 100 : 1)));
    const hi = vectorOf(reportOn(key, (q) => (q === id ? 1 + PCT / 100 : 1)));
    const swing = (pick: (v: Vector) => number | null): number | null => {
      const a = pick(lo);
      const b = pick(hi);
      const n = pick(nv);
      return a === null || b === null || n === null ? null : Math.max(Math.abs(a - n), Math.abs(b - n));
    };
    per.push({
      onderdeel: id,
      soort: p.type,
      waarde: valueParam(p)!.value,
      eenheid: valueParam(p)!.unit,
      venster_dB: swing((v) => v.windowDb),
      rms_dB: swing((v) => v.rmsDb),
      minZ_ohm: swing((v) => v.minZOhm),
      mk_graden: nv.mk.map((_, i) => swing((v) => v.mk[i] ?? null)),
    });
  }
  const ranked = [...per].sort((a, b) => Number(b.rms_dB ?? 0) - Number(a.rms_dB ?? 0));
  for (const r of ranked.slice(0, 8)) {
    console.log(
      `  ${String(r.onderdeel).padEnd(7)} ${String(r.soort)}  Δ± venster ${f3(Number(r.venster_dB))} dB  ` +
        `Δrms ${f3(Number(r.rms_dB))} dB  Δmin|Z| ${f3(Number(r.minZ_ohm))} Ω  ` +
        `ΔM-K ${(r.mk_graden as (number | null)[]).map((m) => (m === null ? '—' : m.toFixed(1))).join(' / ')}°`,
    );
  }
  out.push({ netlist: key, onderdelen: parts.length, nominaal: nv, monte_carlo: mc, per_onderdeel: per });
}

writeFileSync(
  OUT,
  JSON.stringify(
    {
      _:
        'U-5c — TOLERANTIEGEVOELIGHEID (VOORSTEL, geen eis en geen kolom): wat ±' +
        `${PCT} % op élk onderdeel met een geleverd ontwerp doet. Twee lezingen: Monte-Carlo met alle ` +
        'onderdelen tegelijk (wat een bouwer overkomt) en één onderdeel tegelijk op beide randen (wie ' +
        'de spreiding draagt). Geen ketenrun en geen tune — het netwerk wordt alleen opnieuw opgelost. ' +
        'Uniform binnen de band, want een tolerantie is een SPECIFICATIE en geen gemeten spreiding.',
      _gemeten_op: new Date().toISOString().slice(0, 10),
      tolerantie_pct: PCT,
      trekkingen: N,
      seed: SEED,
      /* De meetset uit het MANIFEST en niet getypt: de sessie-id van casus 1
       * kent er vier, en een tolerantietabel zonder de set waarop zij gemeten
       * is beschrijft een ander netwerk zodra de basis verschuift (M-3). */
      meetset: casus1SetOf(manifest),
      per_netlist: out,
    },
    null,
    1,
  ) + '\n',
  'utf-8',
);
console.log(`\nGeschreven: ${OUT}`);
