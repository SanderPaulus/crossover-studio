/**
 * E-1 — DE M-T-BOVENGRENS: WAT DE BOVENKANT VAN HET VENSTER WEET, WAT DE TUNER ERMEE DOET, EN HET VELD
 * ONDER EEN GESTELD PLAFOND — seconden, geen ketenrun en geen tune.
 *
 * `npx vite-node scripts/measure-e1-mt-ceiling.ts`
 *
 * DE AANLEIDING (A5e.3c): elke geleverde kandidaat op de M-T-bovenpositie (2304 Hz, het breakup-plafond
 * van de mid) werd door de tuner 61–255 Hz naar beneden getrokken, drie van vier naar ~2050 Hz. Sander
 * stelde de spiegel van A5e.3b (b)2 voor: de bovengrens als strengste van gesteld en afgeleid. Vier tabellen:
 *
 *  (1) DE INVENTARIS: élke grens die de bovenkant van het M-T-venster kent (breakup, directiviteit,
 *      gesteld), de lobing-zones (voorkeur, geen grens — V20a) en de vloeren ernaast, met wat bindt.
 *  (2) DE DRIFT PER GELEVERDE NETLIST: gestelde positie, kooi, het kruispunt zoals het RAPPORT het
 *      afleidt (1600 punten) en zoals de POORTROUTE het afleidt (ketenraster, 143 punten — de V32-vorm),
 *      en of het geleverde kruispunt de kooi verliet en welke kant op. Sinds E-1 zegt de kandidaat-
 *      herkomst zelf dat een kooi op een vensterrand eenzijdig is.
 *  (3) DE KNIK: het ruwe niveauverschil mid − tweeter op het veiligheidsraster rond de M-T-band en de
 *      frequentie van zijn steilste daling — waar het akoestische kruispunt naar toe klapt.
 *  (4) HET VELD ONDER EEN BOVENGRENS: onder de strengste BEKENDE (ongewijzigd) en onder een GESTELD
 *      plafond op de gemeten landing (de mediaan van de geleverde plafondpositie-kruispunten), met de
 *      posities, het aantal, en welke van de tien bevroren netlists erbinnen vallen.
 *
 * Schrijft `test-fixtures/casus1_e1_mt_bovengrens.json`. Dit script stelt niets en wijzigt niets.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReport, type EngineV2Report, type ReportSettings } from '../src/lib/engine2/report.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';
import { evaluateGates, freezeGateReference, type GateSettings } from '../src/lib/engine2/optimizer/gates.ts';
import {
  CASUS1_WOOFER_DC_OHM,
  casus1ExcursionSettings,
  casus1Files,
  casus1Filter,
  casus1FilterFromParts,
  casus1Geometry,
  casus1Manifest,
  casus1MaxDriveOnFsDbByDriver,
  loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import {
  CASUS1_TARGET_CURVE,
  CASUS1_V2_GATES,
  CASUS1_WINDOW_SETTINGS,
  casus1ChainInput,
  casus1Field,
  casus1V2Facts,
} from '../src/lib/engine2/casus1V2.fixture.ts';
import { corpusOf } from '../src/lib/engine2/casus1Corpora.fixture.ts';
import type { VxpPart } from '../src/lib/parsers/vxp.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'test-fixtures', 'casus1_e1_mt_bovengrens.json');
const SHARD_DIR = join(HERE, '..', 'test-fixtures', '.casus1-v2-shards');

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const geometry = casus1Geometry(golden);
const MT = ctcKey('mid', 'tweeter');

const fieldSettings = (extra: Partial<ReportSettings> = {}): ReportSettings => ({
  orderByPair: { [ctcKey('woofer', 'mid')]: 4, [MT]: 4 },
  reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
  targetCurve: CASUS1_TARGET_CURVE,
  ...casus1ExcursionSettings(golden),
  ...(Object.keys(casus1MaxDriveOnFsDbByDriver(golden)).length > 0 ? { maxDriveOnFsDbByDriver: casus1MaxDriveOnFsDbByDriver(golden) } : {}),
  ...CASUS1_WINDOW_SETTINGS,
  ...extra,
});
const reportOf = (key: string, settings: ReportSettings = fieldSettings()): EngineV2Report =>
  buildReport({ manifest, files, filter: casus1Filter(key, manifest, files, golden), geometry, settings });

const f0 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(0));
const f1 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(1));

/* ---------------- (1) de inventaris ---------------- */
const HUIDIG = reportOf('HUIDIG');
const mtWindow = HUIDIG.predesign.windows.find((w) => w.lower === 'mid' && w.upper === 'tweeter')!;
console.log('=== (1) WAT DE BOVENKANT VAN HET M-T-VENSTER WEET ===');
console.log(`venster ${f0(mtWindow.floorHz)}–${f0(mtWindow.ceilingHz)} Hz; vloer bindt: ${mtWindow.floorBy?.rule}, plafond bindt: ${mtWindow.ceilingBy?.rule}`);
console.log('| kant | regel | Hz | bindt | bron |');
console.log('| --- | --- | --- | --- | --- |');
for (const l of mtWindow.limits) {
  const binds = (l.side === 'ceiling' && l === mtWindow.ceilingBy) || (l.side === 'floor' && l === mtWindow.floorBy);
  console.log(`| ${l.side} | ${l.rule} | ${f0(l.hz)} | ${binds ? 'JA' : 'nee'} | ${l.source.slice(0, 110)} |`);
}
const statedCeiling = mtWindow.limits.find((l) => l.rule === 'stated') ?? null;
console.log(`gesteld plafond: ${statedCeiling ? `${f0(statedCeiling.hz)} Hz` : 'GEEN (gestelde_eisen.max_kruispunt_hz_per_paar is niet gesteld)'}`);
console.log('lobing-zones (VOORKEUR, geen grens — V20a):');
for (const z of mtWindow.zones) console.log(`  ${z.kind === 'bad' ? 'slechtst' : 'goed'}: ${f0(z.hz[0])}–${f0(z.hz[1])} Hz${z.outsideWindow ? ' (geheel buiten het venster)' : ''} — ${z.label}`);
for (const t of mtWindow.tensions) console.log(`  spanning: ${t}`);

/* ---------------- (2) de drift per geleverde netlist ---------------- */
const gridded = casus1ChainInput(manifest, files, golden);
const facts = casus1V2Facts(HUIDIG, manifest, files);
const GATES: GateSettings = { ...CASUS1_V2_GATES, ...(facts.driveCeilingDbByModel ? { driveCeilingDbByDriver: { ...facts.driveCeilingDbByModel } } : {}) };
const chainCrossings = (netlist: ReturnType<typeof casus1Filter>['netlist']): number[] => {
  const ref = freezeGateReference({
    netlist,
    grid: [...gridded.grid],
    driverZ: gridded.driverZ,
    branchDb: { woofer: gridded.w.spl, mid: gridded.m.spl, tweeter: gridded.t.spl },
    fsHz: facts.fundamentalHzByModel ?? {},
    validHz: facts.validHzByModel ?? {},
    sweeps: Object.fromEntries(Object.entries(facts.impedanceByModel ?? {}).map(([m, z]) => [m, { grid: z.grid, magnitude: z.magnitude, phaseDeg: z.phaseDeg, validHz: z.validHz }])),
  });
  return evaluateGates(netlist, GATES, ref, 'derived').crossings.map((c) => c.fHz);
};
const FIELD = casus1Field(HUIDIG);
const hzOf = (label: string): [number, number] | null => {
  const m = label.match(/woofer→mid ([\d.]+) .*mid→tweeter ([\d.]+)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
};
const cageOf = (label: string) => FIELD.field.candidates.find((c) => c.label === label)?.crossings.map((x) => x.cageHz) ?? null;

interface DriftRow {
  corpus: string;
  netlist: string;
  label: string;
  gesteld_hz: [number, number] | null;
  kooi_hz: [number, number][] | null;
  rapport_hz: number[];
  ketenraster_hz: number[];
  mt_drift_rapport_hz: number | null;
  mt_drift_ketenraster_hz: number | null;
  mt_verlaat_kooi: 'omlaag' | 'omhoog' | 'nee' | null;
  wm_drift_rapport_hz: number | null;
}
const drift: DriftRow[] = [];
const addRow = (corpus: string, netlist: string, label: string, parts: readonly VxpPart[] | null) => {
  const filter = parts ? casus1FilterFromParts(netlist, parts, manifest, files) : casus1Filter(netlist, manifest, files, golden);
  const rep = parts
    ? buildReport({ manifest, files, filter, geometry, settings: fieldSettings() })
    : reportOf(netlist);
  const stated = hzOf(label);
  const cage = cageOf(label);
  const rapport = rep.crossings.map((c) => c.fHz);
  const keten = chainCrossings(filter.netlist);
  const mtR = rapport[1] ?? null;
  const mtK = keten[1] ?? null;
  let leaves: DriftRow['mt_verlaat_kooi'] = null;
  if (cage && mtR !== null) leaves = mtR < cage[1][0] ? 'omlaag' : mtR > cage[1][1] ? 'omhoog' : 'nee';
  drift.push({
    corpus,
    netlist,
    label,
    gesteld_hz: stated,
    kooi_hz: cage,
    rapport_hz: rapport.map((h) => Number(h.toFixed(1))),
    ketenraster_hz: keten.map((h) => Number(h.toFixed(1))),
    mt_drift_rapport_hz: stated && mtR !== null ? Number((mtR - stated[1]).toFixed(1)) : null,
    mt_drift_ketenraster_hz: stated && mtK !== null ? Number((mtK - stated[1]).toFixed(1)) : null,
    mt_verlaat_kooi: leaves,
    wm_drift_rapport_hz: stated && rapport[0] !== undefined ? Number((rapport[0] - stated[0]).toFixed(1)) : null,
  });
};
const live = corpusOf('live', golden);
for (const label of live.order) {
  const key = live.byCandidate.get(label);
  if (key) addRow('A5e.3c', key, label, null);
}
/* Geleverd maar niet bevroren: alleen in de shards (gitignored). */
if (existsSync(SHARD_DIR)) {
  for (const f of readdirSync(SHARD_DIR).filter((x) => /^cand-\d+\.json$/.test(x))) {
    const s = JSON.parse(readFileSync(join(SHARD_DIR, f), 'utf-8')) as { label: string; row: { parts: VxpPart[]; rejection: unknown } };
    if (s.row.rejection || !s.row.parts?.length || live.byCandidate.has(s.label)) continue;
    addRow('A5e.3c (niet bevroren)', s.label, s.label, s.row.parts);
  }
}
const veld = corpusOf('a5e3veld', golden);
for (const label of veld.order) {
  const key = veld.byCandidate.get(label);
  if (key) addRow('A5e.3-veld', key, label, null);
}
console.log('\n=== (2) DE DRIFT: gesteld → geleverd (rapport | ketenraster), kooi, en of het M-T-kruispunt de kooi verliet ===');
console.log('| corpus | netlist | gesteld | kooi M-T | rapport | ketenraster | ΔM-T rapport | ΔM-T keten | verlaat kooi |');
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const r of drift) {
  console.log(`| ${r.corpus} | ${r.netlist} | ${r.gesteld_hz ? `${f1(r.gesteld_hz[0])} · ${f1(r.gesteld_hz[1])}` : '—'} | ${r.kooi_hz ? `${f0(r.kooi_hz[1][0])}–${f0(r.kooi_hz[1][1])}` : '—'} | ${r.rapport_hz.map(f0).join(' · ')} | ${r.ketenraster_hz.map(f0).join(' · ')} | ${f0(r.mt_drift_rapport_hz)} | ${f0(r.mt_drift_ketenraster_hz)} | ${r.mt_verlaat_kooi ?? '—'} |`);
}
const top = drift.filter((r) => r.corpus === 'A5e.3c' || r.corpus === 'A5e.3c (niet bevroren)').filter((r) => r.gesteld_hz && Math.abs(r.gesteld_hz[1] - (mtWindow.ceilingHz ?? 0)) < 0.5);
const topLandings = top.map((r) => r.rapport_hz[1]).filter((h) => Number.isFinite(h)).sort((a, b) => a - b);
const median = (xs: number[]) => (xs.length ? xs[Math.floor(xs.length / 2)] : null);
const landing = median(topLandings);
console.log(`\nplafondpositie (${f0(mtWindow.ceilingHz)} Hz): ${top.length} geleverd, kruispunten volgens het rapport ${topLandings.map(f0).join(', ')} Hz — mediaan ${f0(landing)} Hz; volgens het ketenraster ${top.map((r) => f0(r.ketenraster_hz[1])).join(', ')}`);
const floorPos = drift.filter((r) => r.corpus === 'A5e.3c' && r.gesteld_hz && Math.abs(r.gesteld_hz[1] - (mtWindow.floorHz ?? 0)) < 0.5);
console.log(`vloerpositie (${f0(mtWindow.floorHz)} Hz): ${floorPos.length} geleverd, ΔM-T rapport ${floorPos.map((r) => f0(r.mt_drift_rapport_hz)).join(', ')} Hz`);

/* ---------------- (3) de knik in het ruwe niveauverschil ---------------- */
const s = gridded.safety;
const band = [mtWindow.floorHz! / 2 ** 0.5, mtWindow.ceilingHz! * 2 ** 0.5];
const diff: { hz: number; db: number }[] = [];
for (let i = 0; i < s.freqs.length; i++) if (s.freqs[i] >= band[0] && s.freqs[i] <= band[1]) diff.push({ hz: s.freqs[i], db: s.m.spl[i] - s.t.spl[i] });
let knee = { hz: NaN, slopeDbPerOct: 0 };
for (let i = 1; i < diff.length; i++) {
  const slope = (diff[i].db - diff[i - 1].db) / Math.log2(diff[i].hz / diff[i - 1].hz);
  if (slope < knee.slopeDbPerOct) knee = { hz: Math.sqrt(diff[i].hz * diff[i - 1].hz), slopeDbPerOct: slope };
}
/* Het LOKALE MINIMUM van het verschil BINNEN het venster: waar de tweeter ten
 * opzichte van de mid het luidst is — de eigen +0,4 dB-piek van de tweeter
 * tegen de −1,1 dB-stap van de mid rond 2,05 kHz. Dáár landen de geleverde
 * plafondpositie-kruispunten; de steilste daling ligt elders (de tweeter-
 * flank rond 1,4 kHz) en is het niet. */
const inWindow = diff.filter((d) => d.hz >= mtWindow.floorHz! && d.hz <= mtWindow.ceilingHz!);
const dipInWindow = inWindow.reduce((a, b) => (b.db < a.db ? b : a), inWindow[0]);
console.log(`\n=== (3) DE KNIK in mid − tweeter (ruw, veiligheidsraster, ${f0(band[0])}–${f0(band[1])} Hz) ===`);
console.log(`lokaal minimum van mid − tweeter BINNEN het venster: ${dipInWindow.db.toFixed(2)} dB bij ${f0(dipInWindow.hz)} Hz; de geleverde plafondpositie-kruispunten landen op ${topLandings.map(f0).join(', ')} Hz`);
console.log(`steilste daling ${knee.slopeDbPerOct.toFixed(1)} dB/oct bij ${f0(knee.hz)} Hz (de tweeterflank; niet waar de kruispunten landen)`);
const near = drift.filter((r) => r.rapport_hz[1] !== undefined && Math.abs(Math.log2(r.rapport_hz[1] / dipInWindow.hz)) < 0.02);
console.log(`geleverde M-T-kruispunten binnen 0,02 octaaf van dat minimum: ${near.length} van ${drift.length} — ${near.map((r) => `${r.netlist} (${f0(r.rapport_hz[1])})`).join(', ')}`);
console.log('| Hz | mid − tweeter dB |');
console.log('| --- | --- |');
for (const d of diff) console.log(`| ${f0(d.hz)} | ${d.db.toFixed(2)} |`);

/* ---------------- (4) het veld onder een bovengrens ---------------- */
const fieldUnder = (ceilingHz: number | null) => {
  const rep = ceilingHz === null ? HUIDIG : reportOf('HUIDIG', fieldSettings({ maxCrossingHzByPair: { [MT]: ceilingHz } }));
  const f = casus1Field(rep);
  const w = f.field.axes[1].window['4'];
  const wm = f.field.axes[0].positionsByOrder[0].hz;
  const mt = f.field.axes[1].positionsByOrder[0].hz;
  const frozen = live.order.filter((l) => live.byCandidate.has(l)).map((label) => {
    const hz = hzOf(label)!;
    const inside = hz[0] >= f.field.axes[0].window['4'].floorHz! - 0.5 && hz[0] <= f.field.axes[0].window['4'].ceilingHz! + 0.5 && hz[1] >= w.floorHz! - 0.5 && hz[1] <= w.ceilingHz! + 0.5;
    return { netlist: live.byCandidate.get(label)!, label, binnen: inside };
  });
  return {
    plafond_hz: Number((w.ceilingHz ?? NaN).toFixed(1)),
    plafond_bindt: w.ceilingBy?.rule ?? null,
    posities_wm: wm.map((h) => Number(h.toFixed(1))),
    posities_mt: mt.map((h) => Number(h.toFixed(1))),
    afgeleid: f.field.parameters.derivedSize,
    geleverd: f.field.parameters.deliveredSize,
    bevroren_binnen: frozen.filter((x) => x.binnen).map((x) => x.netlist),
    bevroren_buiten: frozen.filter((x) => !x.binnen).map((x) => x.netlist),
    spanning: w.tensions,
  };
};
const known = fieldUnder(null);
const arm = landing !== null ? fieldUnder(Number(landing.toFixed(1))) : null;
console.log('\n=== (4) HET VELD ONDER EEN BOVENGRENS ===');
for (const [name, f] of [['strengste BEKENDE grens (ongewijzigd)', known], [`GESTELD plafond op de gemeten landing (${f0(landing)} Hz)`, arm]] as const) {
  if (!f) continue;
  console.log(`\n${name}: M-T-plafond ${f.plafond_hz} Hz (${f.plafond_bindt}); veld ${f.afgeleid} afgeleid → ${f.geleverd} geleverd`);
  console.log(`  W-M: ${f.posities_wm.map(f0).join(', ')}`);
  console.log(`  M-T: ${f.posities_mt.map(f0).join(', ')}`);
  console.log(`  bevroren binnen: ${f.bevroren_binnen.length} (${f.bevroren_binnen.join(', ')}); buiten: ${f.bevroren_buiten.length} (${f.bevroren_buiten.join(', ') || '—'})`);
  for (const t of f.spanning) console.log(`  spanning: ${t}`);
}

writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      _: 'E-1 — DOCUMENTATIE (scripts/measure-e1-mt-ceiling.ts): de inventaris van de M-T-bovenkant, de drift per geleverde netlist, de knik in het ruwe niveauverschil, en het veld onder de strengste bekende grens en onder een gesteld plafond op de gemeten landing. Geen acceptatiewaarde.',
      venster_mt: { vloer_hz: mtWindow.floorHz, plafond_hz: mtWindow.ceilingHz, vloer_bindt: mtWindow.floorBy?.rule ?? null, plafond_bindt: mtWindow.ceilingBy?.rule ?? null, grenzen: mtWindow.limits.map((l) => ({ kant: l.side, regel: l.rule, hz: Number(l.hz.toFixed(1)), bindt: l === mtWindow.ceilingBy || l === mtWindow.floorBy })), zones: mtWindow.zones.map((z) => ({ soort: z.kind, hz: z.hz.map((h) => Number(h.toFixed(1))), buiten_venster: z.outsideWindow, label: z.label })), gesteld_plafond: statedCeiling ? statedCeiling.hz : null, spanningen: mtWindow.tensions },
      drift,
      plafondpositie: { hz: mtWindow.ceilingHz, geleverd: top.length, landingen_rapport_hz: topLandings, landing_mediaan_hz: landing, landingen_ketenraster_hz: top.map((r) => r.ketenraster_hz[1] ?? null) },
      knik: {
        band_hz: band.map((h) => Number(h.toFixed(1))),
        lokaal_minimum_in_venster: { hz: Number(dipInWindow.hz.toFixed(1)), dB: Number(dipInWindow.db.toFixed(2)) },
        kruispunten_binnen_0_02_oct_van_het_minimum: near.map((r) => ({ netlist: r.netlist, hz: r.rapport_hz[1] })),
        steilste_daling: { hz: Number(knee.hz.toFixed(1)), helling_dB_per_oct: Number(knee.slopeDbPerOct.toFixed(2)) },
        verschil: diff.map((d) => ({ hz: Number(d.hz.toFixed(1)), dB: Number(d.db.toFixed(2)) })),
      },
      veld_onder_strengste_bekende: known,
      veld_onder_gesteld_plafond_op_landing: arm,
    },
    null,
    1,
  )}\n`,
  'utf-8',
);
console.log(`\nwrote ${OUT}`);
