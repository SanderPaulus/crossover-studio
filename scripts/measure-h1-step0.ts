/**
 * H-1 STAP 0 — WAT DE APP DEED TOEN JE EEN HOOGDOORLAAT OP DE ONDERSTE
 * PASSIEVE WEG VROEG.
 *
 * `npx vite-node scripts/measure-h1-step0.ts` — seconden, GEEN ketenrun en GEEN
 * tune. Schrijft `test-fixtures/casus1h_stap0.json`; `h1Step0.test.ts`
 * reproduceert elk getal eruit uit een verse meting.
 *
 * WAAROM HIJ BESTAAT EN WAAROM HIJ BLIJFT BESTAAN NA DE REPARATIE. De vraag van
 * H-1 is "de mid wordt de onderste passieve weg en krijgt een HP richting de
 * actieve zijde". Deze meting stelt die vraag aan de machinerie ZOALS ZIJ WAS en
 * schrijft het antwoord op, zodat de reparatie ertegen gelezen kan worden: wat
 * er ontbrak, wat er STIL faalde (F0), en wat M-C voor de mid deed zonder
 * gemeten weg eronder. Een bevinding die alleen in een sessieverslag staat is
 * een bevinding die niemand kan herhalen.
 *
 * DE VIJF SONDES, en zij meten vijf verschillende lagen:
 *   (a) de ONTWERPSTAP van de TWEEWEGKETEN (`optimizeVirtualFilters`): een HP
 *       op de onderste weg gevraagd via het zaad — wat komt eruit;
 *   (b) de SYNTHESE (`synthesize`): zou zij hem BOUWEN als de ontwerpstap hem
 *       doorgaf — de tegenproef die zegt wáár het gat zit;
 *   (c) de VOOR-ONTWERPLAAG: welk venster beschrijft de onderkant van de
 *       onderste passieve weg;
 *   (d) het OORDEEL: wat zegt M-C over de mid zonder hoogdoorlaat;
 *   (e) de SOM: wat er gebeurt met de beoordeelde band en de som als de woofer
 *       er niet meer is.
 *
 * Alles op de 'koan677'-set, want dat is de set waarop het levende
 * casus-1-corpus is opgewekt en waartegen H-1 zijn kandidaten legt.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logspace, resample, type GriddedResponse } from '../src/lib/dsp.ts';
import { resampleImpedance } from '../src/lib/dsp.ts';
import type { Complex } from '../src/lib/complex.ts';
import { defaultEq, defaultHpLp, type DriverFilterSpec } from '../src/lib/filters.ts';
import { optimizeVirtualFilters } from '../src/lib/vfOptimizer.ts';
import { synthesize } from '../src/lib/synthesis.ts';
import { runIngest, type MeasurementFile } from '../src/lib/engine2/ingest/derive.ts';
import { buildReport, type ReportSettings } from '../src/lib/engine2/report.ts';
import { judgedBandFloor } from '../src/lib/engine2/predesign/judgedBand.ts';
import type { Manifest } from '../src/lib/engine2/ingest/manifest.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';
import {
  CASUS1H_ACTIVE,
  CASUS1H_REPORT_SETTINGS,
  casus1hFiles,
  casus1hGeometry,
  casus1hManifest,
} from '../src/lib/engine2/casus1h.fixture.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'test-fixtures', 'casus1h_stap0.json');

/** De HP die de ontwerper vraagt — het midden van Sanders beoogde gebied. */
const ASKED_HP_HZ = 450;
/** De gestelde doelvorm van casus 1h, gelezen en niet getypt. */
const ASKED_KIND = CASUS1H_ACTIVE.kind;
const ASKED_ORDER = CASUS1H_ACTIVE.order;

/** Het raster van de sonde — de resolutie van het precedent over de hele band. */
const PROBE_POINTS = 240;

const r3 = (v: number | null | undefined): number | null =>
  v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(3));

/** Een gemeten weg op het sonde-raster, stil buiten zijn eigen uitgestrektheid. */
function banded(grid: readonly number[], src: { grid: readonly number[]; db: readonly number[]; phaseDeg: readonly number[] }): GriddedResponse {
  const g = resample(src.grid, src.db, src.phaseDeg, grid, { clampEdges: true });
  const f0 = src.grid[0];
  const f1 = src.grid[src.grid.length - 1];
  return {
    freq: [...grid],
    spl: g.spl.map((v, i) => (grid[i] < f0 || grid[i] > f1 ? -400 : v)),
    phaseDeg: g.phaseDeg.map((v, i) => (grid[i] < f0 || grid[i] > f1 ? 0 : v)),
  };
}

function main(): void {
  const manifest: Manifest = casus1hManifest();
  const files: MeasurementFile[] = casus1hFiles(manifest);
  const ingest = runIngest(manifest, files);
  const fullOf = (driver: string) => {
    const f = ingest.drivers.find((x) => x.driver === driver)?.onAxisFull;
    if (!f) throw new Error(`no on-axis sum for ${driver}`);
    return f;
  };

  const out: Record<string, unknown> = {};
  out['_'] = (
    'H-1 STAP 0 — de machinerie zoals zij was, gemeten op de koan677-set. ' +
    'Geschreven door scripts/measure-h1-step0.ts; h1Step0.test.ts reproduceert elk getal.'
  );
  out['gemeten_op'] = { set: 'koan677', sessie_id: manifest.sessionId };
  out['gevraagde_hoogdoorlaat'] = { hz: ASKED_HP_HZ, kind: ASKED_KIND, orde: ASKED_ORDER };

  /* ---------------- (a) de ontwerpstap van de tweewegketen ---------------- */
  const grid = logspace(200, 20000, PROBE_POINTS);
  const mid = banded(grid, fullOf('mid'));
  const tweeter = banded(grid, fullOf('tweeter'));
  const seed = {
    woofer: {
      gainDb: 0,
      /* DE VRAAG: een hoogdoorlaat op de ONDERSTE weg, ingeschakeld, op de
       * gestelde vorm. Dit is precies wat een ontwerper zou invullen. */
      hp: { enabled: true, kind: ASKED_KIND, order: ASKED_ORDER, freq: ASKED_HP_HZ },
      lp: { ...defaultHpLp(2000), kind: 'LR' as const, order: 4 as const },
      eq: [defaultEq(1000, 0, 1), defaultEq(4000, 0, 1)],
    },
    tweeter: {
      gainDb: 0,
      hp: { ...defaultHpLp(2900), kind: 'LR' as const, order: 2 as const },
      lp: defaultHpLp(20000),
      eq: [defaultEq(6500, -10, 0.5), defaultEq(10000, 0, 1)],
    },
  };
  const vf = optimizeVirtualFilters(grid, mid, tweeter, seed, { offsetMm: 0, trimDb: 0, inverted: false }, {
    band: [400, 19500],
    eqBandsPerDriver: 2,
    structurePreference: { kind: ASKED_KIND, order: ASKED_ORDER },
    maxIterations: 60,
  });
  out['a_ontwerpstap'] = {
    _: (
      'De tweewegketen krijgt de HP in haar ZAAD en levert hem niet. `baseSpecs` in vfOptimizer.ts ' +
      'schrijft `woofer.hp = { enabled: false }` LETTERLIJK, en `baseHandles` geeft de onderste weg ' +
      'geen enkele vrijheidsgraad voor een hoogdoorlaat: er is een handle voor haar laagdoorlaat, ' +
      'een voor de HP van de tweeter en een voor het niveau van de tweeter, en dat is alles. Het ' +
      'zaadveld wordt dus niet afgewezen maar overschreven — F0: er komt geen melding, geen ' +
      'waarschuwing en geen probleemregel. De ontwerper vult een hoogdoorlaat in en krijgt er een ' +
      'ontwerp zonder terug dat er precies zo uitziet als een ontwerp waar hij er nooit om vroeg.'
    ),
    gevraagd: { enabled: seed.woofer.hp.enabled, kind: seed.woofer.hp.kind, orde: seed.woofer.hp.order, hz: seed.woofer.hp.freq },
    geleverd: {
      enabled: vf.specs.woofer.hp.enabled,
      kind: vf.specs.woofer.hp.kind,
      orde: vf.specs.woofer.hp.order,
      hz: r3(vf.specs.woofer.hp.freq),
    },
    stil: true,
    aantal_meldingen: 0,
  };

  /* ---------------- (b) de synthese — de tegenproef ---------------------- */
  const zOf = (driver: string): Complex[] => {
    const e = manifest.entries.find((x) => x.driver === driver && x.kind === 'Z');
    const f = files.find((x) => x.entry.file === e?.file);
    if (!f?.impedance) throw new Error(`no impedance for ${driver}`);
    return resampleImpedance(f.impedance.freq, f.impedance.magnitude, f.impedance.phaseDeg, grid).z;
  };
  const withHp: DriverFilterSpec = {
    gainDb: 0,
    hp: { enabled: true, kind: ASKED_KIND, order: ASKED_ORDER, freq: ASKED_HP_HZ },
    lp: { enabled: true, kind: 'LR', order: 4, freq: 2200 },
    eq: [],
  };
  const noHp: DriverFilterSpec = { ...withHp, hp: { ...withHp.hp, enabled: false } };
  const synthOf = (spec: DriverFilterSpec) =>
    synthesize(spec, grid, zOf('mid'), { mode: 'acoustic', driverSplDb: mid.spl, label: 'mid', corrections: 'lean' });
  const sWith = synthOf(withHp);
  const sWithout = synthOf(noHp);
  const seriesCapsOf = (r: typeof sWith) => r.components.filter((c) => /HP section \d+ series C/.test(c.role)).length;
  out['b_synthese'] = {
    _: (
      'De SYNTHESE kan het wel, en dat is wat de bevinding scherp maakt: `deriveTopology` bouwt een ' +
      'volledige HP-ladder zodra `spec.hp.enabled` waar is (serie-C en shunt-L per sectie), plus de ' +
      'Fs-val en de beschermingsterm die alleen bestaan voor een hoogdoorlaatweg. Het gat zit dus ' +
      'uitsluitend in de ONTWERPSTAP van de tweewegketen, niet in de realisatie.'
    ),
    met_hp: { onderdelen: sWith.components.length, hp_serie_condensatoren: seriesCapsOf(sWith), rollen: sWith.components.map((c) => c.role) },
    zonder_hp: { onderdelen: sWithout.components.length, hp_serie_condensatoren: seriesCapsOf(sWithout), rollen: sWithout.components.map((c) => c.role) },
  };

  /* ---------------- (c) de voor-ontwerplaag ------------------------------ */
  const geometry = casus1hGeometry();
  /* Het rapport ZONDER de gestelde actieve zijde — de app zoals zij was. */
  const bare: ReportSettings = { ...CASUS1H_REPORT_SETTINGS };
  delete (bare as { activeHandover?: unknown }).activeHandover;
  const midTweeterOnly: Manifest = {
    sessionId: `${manifest.sessionId}-mid-tweeter-only`,
    entries: manifest.entries.filter((e) => e.driver !== 'woofer'),
  };
  const twoWay = buildReport({
    manifest: midTweeterOnly,
    files: files.filter((f) => f.entry.driver !== 'woofer'),
    filter: null,
    geometry,
    settings: bare,
  });
  const windows = twoWay.predesign.windows.map((w) => ({
    paar: `${w.lower}->${w.upper}`,
    vloer_hz: r3(w.floorHz),
    plafond_hz: r3(w.ceilingHz),
    vloer_regel: w.floorBy?.rule ?? null,
  }));
  const floor = judgedBandFloor(twoWay);
  out['c_voor_ontwerp'] = {
    _: (
      'ER IS GEEN VENSTER VOOR DE ONDERKANT VAN DE ONDERSTE WEG, en dat is geen tekortkoming van ' +
      'xoWindow.ts maar van de vraag: een kruisvenster is een eigenschap van een PAAR aangrenzende ' +
      'wegen, en de onderste weg van een tweeweg heeft er geen onder zich. Zonder een gestelde ' +
      'actieve zijde bestaat de overname niet en is er dus niets om een venster van af te leiden. ' +
      'De beoordeelde band begint daarmee bij de eigen bandvloer van de mid en er is niets dat zegt ' +
      'dat zij daar niet meer alleen speelt.'
    ),
    vensters: windows,
    aantal_vensters: windows.length,
    venster_voor_de_onderkant_van_de_onderste_weg: null,
    beoordeelde_band_vloer_hz: r3(floor?.floorHz ?? null),
    beoordeelde_band_vloer_door: floor ? (floor.fpHz !== null && floor.floorHz > floor.validityFloorHz ? 'f_p' : 'validity') : null,
    laagste_weg: floor?.lowest ?? null,
  };

  /* ---------------- (d) het oordeel: M-C op de mid ----------------------- */
  const mcOf = (rep: ReturnType<typeof buildReport>) => {
    const v = rep.gates.verdicts.filter((x) => x.metric === 'M-C');
    return v.map((x) => ({
      onderwerp: x.subject,
      actief: x.active,
      waarde_dB: r3(x.value),
      grens_dB: r3(x.limit),
      geslaagd: x.pass,
      reden: x.reason ?? null,
    }));
  };
  const twoWayHuidig = buildReport({
    manifest: midTweeterOnly,
    files: files.filter((f) => f.entry.driver !== 'woofer'),
    filter: null,
    geometry,
    settings: bare,
  });
  out['d_oordeel'] = {
    _: (
      'M-C oordeelt uitsluitend een HOOGDOORLAATBESCHERMDE weg, en dat wordt AFGELEID uit de ' +
      'takoverdracht (V47/M-1) en nooit uit een wegnaam. Zonder netwerk is er geen tak en dus geen ' +
      'afleiding; met een tweewegnetwerk dat de mid geen hoogdoorlaat geeft is de mid geen ' +
      'beschermde weg en oordeelt M-C haar niet — terwijl het project WEL een getal voor haar stelt ' +
      '(drive_op_fs_max_dB_per_weg.mid). Een gestelde eis die niets oordeelt omdat de machinerie de ' +
      'weg niet als beschermd ziet, is precies de stille toestand die H-1 opheft.'
    ),
    hoogdoorlaatbeschermde_wegen_zonder_netwerk: twoWayHuidig.gates.highPassProtected,
    m_c_oordelen_zonder_netwerk: mcOf(twoWayHuidig),
    gestelde_m_c_per_weg: CASUS1H_REPORT_SETTINGS.maxDriveOnFsDbByDriver ?? null,
  };

  /* ---------------- (e) de som ------------------------------------------- */
  const three = buildReport({ manifest, files, filter: null, geometry, settings: bare });
  out['e_som'] = {
    _: (
      'Zonder gestelde actieve zijde kent de app maar twee toestanden: de woofer doet mee als ' +
      'PASSIEVE weg (het driewegrapport) of hij bestaat niet (het tweewegrapport). Er is geen derde ' +
      'toestand "hij speelt mee maar staat niet in de netlist", en precies die derde toestand IS de ' +
      'hybride. Het verschil hieronder is wat er met de beoordeelde band gebeurt als de woofer ' +
      'verdwijnt: van de merge-vloer van het wooferpaar naar de f_c van de mid-pod.'
    ),
    drieweg: {
      wegen: three.driversLowToHigh,
      beoordeelde_band_vloer_hz: r3(judgedBandFloor(three)?.floorHz ?? null),
      aantal_vensters: three.predesign.windows.length,
    },
    tweeweg: {
      wegen: twoWay.driversLowToHigh,
      beoordeelde_band_vloer_hz: r3(judgedBandFloor(twoWay)?.floorHz ?? null),
      aantal_vensters: twoWay.predesign.windows.length,
    },
    derde_toestand_bestond_niet: true,
  };

  /* ---------------- het W-M-venster, als context voor de posities -------- */
  const wmKey = ctcKey('woofer', 'mid');
  const wm = three.predesign.windows.find((w) => ctcKey(w.lower, w.upper) === wmKey) ?? null;
  out['f_gestelde_posities_tegen_het_venster'] = {
    _: (
      'Het woofer→mid-venster van casus 1 beschrijft precies de overname die de actieve zijde ' +
      'overneemt, dus de vier gestelde posities kunnen ertegen gelegd worden vóór er iets draait.'
    ),
    venster_hz: wm ? [r3(wm.floorHz), r3(wm.ceilingHz)] : null,
    vloer_regel: wm?.floorBy?.rule ?? null,
    plafond_regel: wm?.ceilingBy?.rule ?? null,
    posities: CASUS1H_ACTIVE.positionsHz.map((hz) => ({
      hz,
      binnen_venster: wm && wm.floorHz !== null && wm.ceilingHz !== null ? hz >= wm.floorHz && hz <= wm.ceilingHz : null,
    })),
  };

  writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
  console.log(JSON.stringify(out, null, 1));
  console.log(`\nwritten: ${OUT}`);
}

main();
