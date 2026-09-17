/**
 * H-1 — DE BESLISTABEL: welke overname, en wat de hybride koopt en kost.
 *
 * `npx vite-node scripts/measure-h1-decision.ts` — seconden, GEEN ketenrun en
 * GEEN tune. Schrijft `test-fixtures/casus1h_beslistabel.json`;
 * `h1ActiveSide.test.ts` reproduceert de dragende getallen eruit.
 *
 * DRIE KOLOMMEN KIEZEN DE OVERNAME, en Sander noemt ze in deze volgorde:
 *   1. M-C VAN DE MID MÉT HOOGDOORLAAT — de bescherming die de hybride koopt.
 *      Op casus 1 en 1b is dit getal er niet: daar draagt de mid geen
 *      hoogdoorlaat richting beneden en is zij dus geen beschermde weg.
 *   2. DE LOBING-DIP OP DE OVERNAME — het verticale gedrag rond de overgang
 *      tussen het wooferpaar en de mid, gemeten door de VERTICALE SYNTHESE
 *      (V20a: de enige lobing-grootheid die een oordeel mag dragen), met de
 *      λ/2-knik uit de geometrie AFGELEID ernaast.
 *   3. BOM — wat het passieve netwerk kost, één huis (`bomColumn.ts`).
 *
 * EN DE VERGELIJKING met de volpassieve kandidaten van casus 1, op dezelfde
 * meetset: onderdelen, dissipatie, M-K op beide paren, min |Z|. Gepaard op de
 * ACTIEVE OVERNAME waar dat kan (KAND_V2_2 kruist op 362,3 Hz, de onderbeugel
 * die daarom in de gestelde lijst staat).
 */

import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPEED_OF_SOUND } from '../src/lib/dsp.ts';
import { bomOf, loadCoilCatalog } from './bomColumn.ts';
import { dspTargetBlock, describeDspTarget } from '../src/lib/engine2/dspTarget.ts';
import { deserializeFilter } from '../src/lib/filterFile.ts';
import type { VxpPart } from '../src/lib/parsers/vxp.ts';
import {
  ACTIVE_WAY,
  CASUS1H_ACTIVE,
  CASUS1H_DIR,
  CASUS1H_MERGE_FIT_UNCERTAINTY_DEG,
  PASSIVE_LOWEST_WAY,
  casus1hFiles,
  casus1hManifest,
  casus1hReport,
  casus1hSettingsAt,
  loadGolden1h,
} from '../src/lib/engine2/casus1h.fixture.ts';
import { corpusBank } from '../src/lib/engine2/casus1Corpora.fixture.ts';
import { casus1CoilFamilyByDriver, loadGolden } from '../src/lib/engine2/casus1.fixture.ts';
import { readFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'test-fixtures', 'casus1h_beslistabel.json');
/** The full-passive candidates H-1 is measured against — casus 1's living corpus. */
const AGAINST = ['KAND_V2_1', 'KAND_V2_2', 'KAND_V2_3'] as const;

const r1 = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? null : Number(x.toFixed(1)));
const r2 = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? null : Number(x.toFixed(2)));
const r3 = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? null : Number(x.toFixed(3)));

const golden1h = loadGolden1h();
const manifest = casus1hManifest();
const files = casus1hFiles(manifest);
const golden1 = loadGolden();
const catalogPath = (() => {
  const c = (golden1.manifest_en_geometrie as unknown as { driverkaart?: { spoelfamilie?: { catalogus?: string } } }).driverkaart?.spoelfamilie?.catalogus;
  return typeof c === 'string' ? join(HERE, '..', c) : null;
})();
const catalog = loadCoilCatalog(catalogPath && existsSync(catalogPath) ? catalogPath : null);
const familyByWay = casus1CoilFamilyByDriver(golden1).familyByWay;

/** Which way a coil belongs to, from the part id the synthesis wrote. */
const familyOfCoil = (id: string, ways: Record<string, string[]>): string | null => {
  for (const [way, ids] of Object.entries(ways)) if (ids.includes(id)) return familyByWay[way] ?? null;
  return null;
};

/**
 * THE λ/2 KNEE OF A PAIR, DERIVED.
 *
 * Where half a wavelength equals the spacing: above it the two sources of a
 * handover start to cancel off axis, and it is the frequency Sander points at
 * when he says "c-t-c 38 cm, λ/2 at ~449 Hz". DERIVED from the geometry the
 * manifest carries and never typed (P6) — and the manifest carries THREE
 * spacings for this pair because the woofer is a PAIR of sources (V20): the
 * nearest source, the centroid of the two, and the farthest. The table prints
 * all three rather than choosing, for exactly the reason `lobing.ts` reports
 * four λ fractions and ranks none.
 */
const halfWaveHz = (mm: number): number => SPEED_OF_SOUND / (2 * (mm / 1000));

const geo = golden1h.manifest_en_geometrie.geometrie;
const z = geo.z_offset_mm;
const midZ = z[PASSIVE_LOWEST_WAY];
const wooferZs = [z.woofer_boven, z.woofer_onder];
const spacings = {
  dichtstbij_mm: Math.min(...wooferZs.map((w) => Math.abs(w - midZ))),
  zwaartepunt_mm: Math.abs((wooferZs[0] + wooferZs[1]) / 2 - midZ),
  verst_mm: Math.max(...wooferZs.map((w) => Math.abs(w - midZ))),
};

const rows: Record<string, unknown>[] = [];
const dspBlocks: Record<string, string[]> = {};
for (const [key, file] of Object.entries(golden1h.manifest_en_geometrie.netlists)) {
  if (!/^H_KAND_\d+$/.test(key)) continue;
  const hz = ((golden1h.kandidaten[key] ?? {}) as { actieve_overname_hz?: number }).actieve_overname_hz;
  if (hz === undefined) throw new Error(`casus 1h: ${key} has no recorded active handover — run the recorder first`);
  const rep = casus1hReport(key, manifest, files, golden1h, casus1hSettingsAt(hz));
  const parts = [...deserializeFilter(readFileSync(join(CASUS1H_DIR, file), 'utf-8')).parts] as VxpPart[];
  /* Which coil belongs to which way, from the SAME inventory the DCR model
   * uses — never from a part-id spelling. */
  const ways: Record<string, string[]> = {};
  for (const c of rep.metrics.buildability?.coilLoads ?? []) ways[c.id] = [];
  const coilWays: Record<string, string[]> = {};
  for (const k of Object.keys(ways)) coilWays[k] = [];
  const bom = bomOf(catalog, parts, (id) => {
    /* The synthesis names the branch in the part id's own way; the DCR
     * inventory is the one place that says which way a coil is on, and the
     * report carries it per netlist. */
    const inv = rep.metrics.buildability?.coilLoads.find((c) => c.id === id);
    void inv;
    return familyOfCoil(id, coilWays) ?? familyByWay[PASSIVE_LOWEST_WAY] ?? null;
  });
  const mc = rep.gates.verdicts.find((v) => v.metric === 'M-C' && v.subject === PASSIVE_LOWEST_WAY) ?? null;
  const mcT = rep.gates.verdicts.find((v) => v.metric === 'M-C' && v.subject === 'tweeter') ?? null;
  const pt = rep.system.phaseTracking;
  const wm = pt.find((p) => p.lower === ACTIVE_WAY && p.upper === PASSIVE_LOWEST_WAY) ?? null;
  const mt = pt.find((p) => p.lower === PASSIVE_LOWEST_WAY && p.upper === 'tweeter') ?? null;
  const dsp = dspTargetBlock(rep, { mergeFitUncertaintyDeg: CASUS1H_MERGE_FIT_UNCERTAINTY_DEG ?? undefined });
  /* WHAT THE LOUDSPEAKER DOES WITH THE DELAY THE BLOCK TELLS YOU TO DIAL IN.
   *
   * The search was steered with the class-A delay — derived before any network
   * existed, so no candidate could move the sum it was judged on — and the
   * realised high-pass carries phase the ideal shape does not, so the delivered
   * network prefers a different one. Both readings belong in a decision table:
   * the JUDGED number is what the corpus was selected on, and the DIALLED one
   * is what the built loudspeaker will do. Through the report's own M-K and not
   * a second implementation (`activeSideSettings`). */
  const refit = rep.activeSide?.deliveredRefit ?? null;
  const dialled = refit
    ? casus1hReport(key, manifest, files, golden1h, {
        ...casus1hSettingsAt(hz),
        activeSideSettings: { delayMs: refit.settings.delayMs, inverted: refit.settings.inverted, gainDb: refit.settings.gainDb },
      })
    : null;
  const dialledWm = dialled?.system.phaseTracking.find((p) => p.lower === ACTIVE_WAY && p.upper === PASSIVE_LOWEST_WAY) ?? null;
  if (dsp) dspBlocks[key] = describeDspTarget(dsp);
  rows.push({
    netlist: key,
    actieve_overname_hz: hz,
    /* --- kolom 1 --- */
    m_c_mid_dB: r2(mc?.value ?? null),
    m_c_mid_grens_dB: r2(mc?.limit ?? null),
    m_c_mid_gewapend: mc?.active ?? null,
    m_c_mid_geslaagd: mc?.pass ?? null,
    hoogdoorlaatbeschermde_wegen: [...rep.gates.highPassProtected],
    m_c_tweeter_dB: r2(mcT?.value ?? null),
    /* --- kolom 2 --- */
    lobing_eind_dip_dB: r2(rep.metrics.lobingFinal?.worstDipDb ?? null),
    lobing_dip_in_kruisgebied_dB: r2(rep.metrics.lobingFinal?.worstDipInCrossoverDb ?? null),
    lobing_dip_bij_hz: r1(rep.metrics.lobingFinal?.worstAtHz ?? null),
    lobing_dip_bij_graden: r1(rep.metrics.lobingFinal?.worstAtDeg ?? null),
    lobing_puntbron_aanname_veilig: rep.metrics.lobingFinal?.pointSourceAssumptionSafe ?? null,
    lobing_uit_reden: rep.metrics.lobingFinalOff,
    /* --- kolom 3 --- */
    bom_eur: r2(bom.eur),
    bom_onderdelen: bom.parts,
    bom_zonder_realisatie: bom.unrealised,
    /* --- context --- */
    onderdelen: parts.filter((p) => p.partId !== undefined && !p.open && !p.shorted).length,
    dissipatie_pct: r1((rep.metrics.dissipation?.totalFraction ?? NaN) * 100),
    min_z_ohm: r2(rep.metrics.epdr?.minZOhm ?? null),
    rms_vlakheid_dB: r2(rep.system.response?.rmsDeviationDb ?? null),
    spl_venster_pm_dB: r2(rep.system.response?.windowPlusMinusDb ?? null),
    m_k_wm_graden: r2(wm?.meanAbsDeg ?? null),
    m_k_wm_graden_op_de_ingestelde_delay: r2(dialledWm?.meanAbsDeg ?? null),
    m_k_mt_graden: r2(mt?.meanAbsDeg ?? null),
    kruispunt_wm_hz: r1(wm?.crossingHz ?? null),
    kruispunt_wm_hz_op_de_ingestelde_delay: r1(dialledWm?.crossingHz ?? null),
    kruispunt_mt_hz: r1(mt?.crossingHz ?? null),
    rms_op_de_ingestelde_delay_dB: r2(dialled?.system.response?.rmsDeviationDb ?? null),
    spl_venster_op_de_ingestelde_delay_pm_dB: r2(dialled?.system.response?.windowPlusMinusDb ?? null),
    dsp: dsp ? { gain_dB: r3(dsp.judged.gainDb), delay_ms: r3(dsp.judged.delayMs), omgekeerd: dsp.judged.inverted } : null,
    dsp_in_te_stellen: refit
      ? { gain_dB: r3(refit.settings.gainDb), delay_ms: r3(refit.settings.delayMs), omgekeerd: refit.settings.inverted }
      : null,
  });
}

/* ================================================================== *
 * De volpassieve tegenhangers, door DEZELFDE meetbank
 * ================================================================== */
const bank = corpusBank(golden1, 'koan677');
const against: Record<string, unknown>[] = [];
for (const key of AGAINST) {
  const rep = bank.report(key);
  const file = (golden1.manifest_en_geometrie as unknown as { netlists: Record<string, string> }).netlists[key];
  const parts = [...deserializeFilter(readFileSync(join(HERE, '..', 'test-fixtures', 'casus1', file), 'utf-8')).parts] as VxpPart[];
  const pt = rep.system.phaseTracking;
  const wm = pt.find((p) => p.lower === 'woofer' && p.upper === 'mid') ?? null;
  const mt = pt.find((p) => p.lower === 'mid' && p.upper === 'tweeter') ?? null;
  const bom = bomOf(catalog, parts, () => familyByWay.woofer ?? null);
  against.push({
    netlist: key,
    onderdelen: parts.filter((p) => p.partId !== undefined && !p.open && !p.shorted).length,
    bom_eur: r2(bom.eur),
    dissipatie_pct: r1((rep.metrics.dissipation?.totalFraction ?? NaN) * 100),
    min_z_ohm: r2(rep.metrics.epdr?.minZOhm ?? null),
    rms_vlakheid_dB: r2(rep.system.response?.rmsDeviationDb ?? null),
    spl_venster_pm_dB: r2(rep.system.response?.windowPlusMinusDb ?? null),
    m_k_wm_graden: r2(wm?.meanAbsDeg ?? null),
    m_k_mt_graden: r2(mt?.meanAbsDeg ?? null),
    kruispunt_wm_hz: r1(wm?.crossingHz ?? null),
    kruispunt_mt_hz: r1(mt?.crossingHz ?? null),
    lobing_eind_dip_dB: r2(rep.metrics.lobingFinal?.worstDipDb ?? null),
    lobing_dip_in_kruisgebied_dB: r2(rep.metrics.lobingFinal?.worstDipInCrossoverDb ?? null),
    m_c_mid_dB: r2(rep.gates.verdicts.find((v) => v.metric === 'M-C' && v.subject === 'mid')?.value ?? null),
    m_c_tweeter_dB: r2(rep.gates.verdicts.find((v) => v.metric === 'M-C' && v.subject === 'tweeter')?.value ?? null),
    hoogdoorlaatbeschermde_wegen: [...rep.gates.highPassProtected],
  });
}

const out = {
  _:
    'H-1 — DE BESLISTABEL. Geschreven door scripts/measure-h1-decision.ts; h1ActiveSide.test.ts reproduceert ' +
    'de dragende getallen. Beide helften gaan door DEZELFDE meetset (koan677) en hetzelfde rapportpad; het ' +
    'enige verschil tussen de twee tabellen is de SCHEIDING — hybride tegen volpassief.',
  gemeten_op: { set: 'koan677', sessie_id: manifest.sessionId },
  gestelde_overnames_hz: CASUS1H_ACTIVE.positionsHz,
  lobing_knik: {
    _:
      'DE λ/2-KNIK VAN HET WOOFER→MID-PAAR, AFGELEID uit de manifestgeometrie en nergens getypt (P6). DRIE ' +
      'getallen en geen keuze, want de woofer is een PAAR bronnen (V20): een enkele afstand die een weg met ' +
      'twee bronnen samenvat bestaat niet. Sanders eigen vuistregel ("c-t-c 38 cm → λ/2 op ~449 Hz") ligt ' +
      'tussen het zwaartepunt en de dichtstbijzijnde bron in; het verschil is genoteerd en niet weggerekend.',
    c_m_per_s: SPEED_OF_SOUND,
    dichtstbij: { mm: r1(spacings.dichtstbij_mm), halve_golf_hz: r1(halfWaveHz(spacings.dichtstbij_mm)) },
    zwaartepunt: { mm: r1(spacings.zwaartepunt_mm), halve_golf_hz: r1(halfWaveHz(spacings.zwaartepunt_mm)) },
    verst: { mm: r1(spacings.verst_mm), halve_golf_hz: r1(halfWaveHz(spacings.verst_mm)) },
    sanders_vuistregel: { mm: 380, halve_golf_hz: r1(halfWaveHz(380)) },
  },
  hybride: rows,
  volpassief: against,
  dsp_doelblokken: dspBlocks,
};
writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);

console.log('λ/2 knee (derived):', JSON.stringify(out.lobing_knik, null, 1));
console.log('\n=== HYBRIDE ===');
for (const r of rows) {
  console.log(
    `${r.netlist} @${r.actieve_overname_hz} Hz  M-C mid ${r.m_c_mid_dB} (${r.m_c_mid_gewapend ? `limit ${r.m_c_mid_grens_dB}, ${r.m_c_mid_geslaagd ? 'pass' : 'FAIL'}` : 'off'})` +
      `  lobing ${r.lobing_eind_dip_dB} dB @${r.lobing_dip_bij_hz}  BOM €${r.bom_eur} (${r.bom_onderdelen} parts)` +
      `  rms ${r.rms_vlakheid_dB}  ±${r.spl_venster_pm_dB}  M-K ${r.m_k_wm_graden}/${r.m_k_mt_graden}°  minZ ${r.min_z_ohm}` +
      `\n     op de IN TE STELLEN delay (${(r.dsp_in_te_stellen as { delay_ms: number } | null)?.delay_ms ?? '—'} ms):` +
      ` M-K W→M ${r.m_k_wm_graden_op_de_ingestelde_delay}°  xo ${r.kruispunt_wm_hz_op_de_ingestelde_delay} Hz` +
      `  rms ${r.rms_op_de_ingestelde_delay_dB}  ±${r.spl_venster_op_de_ingestelde_delay_pm_dB}`,
  );
}
console.log('\n=== VOLPASSIEF (casus 1, dezelfde meetset) ===');
for (const r of against) {
  console.log(
    `${r.netlist}  parts ${r.onderdelen}  BOM €${r.bom_eur}  diss ${r.dissipatie_pct}%  minZ ${r.min_z_ohm}` +
      `  rms ${r.rms_vlakheid_dB}  ±${r.spl_venster_pm_dB}  M-K ${r.m_k_wm_graden}/${r.m_k_mt_graden}°  M-C mid ${r.m_c_mid_dB}  lobing ${r.lobing_eind_dip_dB}`,
  );
}
console.log('\n=== DSP ===');
for (const [k, lines] of Object.entries(dspBlocks)) {
  console.log(`\n${k}:`);
  for (const l of lines) console.log(l);
}
console.log(`\nwritten: ${OUT}`);
