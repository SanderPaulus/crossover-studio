/**
 * E-7 (V53) — DE KLASSE-B-VENSTERREFERENTIES HERLEID, MET BRUG (V15-vorm).
 *
 *   npx vite-node scripts/record-e7-window-bridge.ts
 *
 * Seconden, geen ketenrun en geen tune. `judgeResponse` smoothet sinds E-7 over
 * de bandpunten alleen (`response-judgement/1.1`); daardoor beweegt het venster
 * van een rapport een fractie waar het raster onder of boven de band doorloopt.
 * Dit script leest élke referentie `spl_venster_pm_dB` die de suite tegen een
 * verse rapportlezing houdt, en:
 *
 *  - herschrijft hem ALLEEN als de verse waarde, op de eigen precisie van het
 *    opgeschreven getal, anders is;
 *  - zet de oude waarde ernaast onder `_waarden_F3_tot_E7` (V15: een herleiding
 *    die haar voorganger weggooit is van een regressie niet te onderscheiden);
 *  - GOOIT als de RMS op hetzelfde blok niet binnen de dB-klasse van het bestand
 *    reproduceert — dan beweegt er iets anders dan het venster, en dat hoort
 *    niet door een venster-recorder weggeschreven te worden.
 *
 * Idempotent: een blok met een bestaande brug houdt die brug; alleen de waarde
 * wordt (opnieuw) op de verse lezing gezet.
 *
 * WAT HET NIET AANRAAKT: de gedateerde casus-1-corpora. Die worden door geen
 * test tegen een verse vensterlezing gehouden, en hun getal is een record van
 * de stand waarin zij zijn opgeschreven.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildReport, type EngineV2Report } from '../src/lib/engine2/report.ts';
import { FLAT_TARGET } from '../src/lib/engine2/requirements/targetCurve.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';
import {
  CASUS1_WOOFER_DC_OHM,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import { corpusBank } from '../src/lib/engine2/casus1Corpora.fixture.ts';
import { CASUS1B_DIR, casus1bFiles, casus1bManifest, casus1bReport, loadGolden1b } from '../src/lib/engine2/casus1b.fixture.ts';
import {
  CASUS1H_DIR,
  casus1hFiles,
  casus1hManifest,
  casus1hReport,
  casus1hSettingsAt,
  loadGolden1h,
} from '../src/lib/engine2/casus1h.fixture.ts';

const BRIDGE = '_waarden_F3_tot_E7';

/** Het aantal decimalen waarop een getal is opgeschreven. */
function decimalsOf(v: number): number {
  const s = String(v);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

interface Block {
  spl_venster_pm_dB?: number | null;
  rms_vlakheid_dB?: number | null;
  [k: string]: unknown;
}

const log: string[] = [];

/** Schrijft het bestand terug in de vorm waarin het stond (inspringing 1, met of zonder slotregel). */
function writeLike(path: string, before: string, raw: unknown): void {
  writeFileSync(path, JSON.stringify(raw, null, 1) + (before.endsWith('\n') ? '\n' : ''));
}

function rederive(file: string, label: string, block: Block, rep: EngineV2Report, tolDb: number): boolean {
  const old = block.spl_venster_pm_dB;
  if (typeof old !== 'number') return false;
  const r = rep.system.response;
  if (!r) throw new Error(`${file} ${label}: het rapport oordeelt geen respons`);
  if (typeof block.rms_vlakheid_dB === 'number' && Math.abs(r.rmsDeviationDb - block.rms_vlakheid_dB) > tolDb) {
    throw new Error(
      `${file} ${label}: RMS ${r.rmsDeviationDb.toFixed(3)} tegen opgeschreven ${block.rms_vlakheid_dB} — ` +
        'er beweegt meer dan het venster; deze recorder schrijft niets',
    );
  }
  const fresh = Number(r.windowPlusMinusDb.toFixed(decimalsOf(old)));
  if (fresh === old) return false;
  const bridge = (block[BRIDGE] as Record<string, unknown> | undefined) ?? {};
  if (!('spl_venster_pm_dB' in bridge)) bridge.spl_venster_pm_dB = old;
  block[BRIDGE] = bridge;
  block.spl_venster_pm_dB = fresh;
  log.push(`${file} ${label}: ±${old} → ±${fresh} dB (brug ${BRIDGE}.spl_venster_pm_dB = ${bridge.spl_venster_pm_dB})`);
  return true;
}

/* ---- casus 1: het levende corpus (zoals casus1V2Candidates.test.ts) en de F3-blokken ---- */
{
  const path = join('test-fixtures', 'golden_refs_casus1.json');
  const before = readFileSync(path, 'utf-8');
  const raw = JSON.parse(before);
  const golden = loadGolden();
  const tol = golden.toleranties.dB as number;
  const bank = corpusBank(golden);
  let changed = false;
  for (const key of Object.keys(raw.manifest_en_geometrie.netlists).filter((k) => /^KAND_V2_\d+$/.test(k))) {
    changed = rederive(path, key, raw.kandidaten[key], bank.report(key), tol) || changed;
  }
  /* F3 — het respons-oordeel op de drie v1-kandidaten, op de vlakke referentie
   * (de instellingen van `casus1Shortlist.test.ts`). */
  const manifest = casus1Manifest(golden);
  const files = casus1Files(manifest);
  const geometry = casus1Geometry(golden);
  const settings = {
    amplifierPowerW: 100,
    orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
    reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
    targetCurve: FLAT_TARGET,
  };
  const f3 = (k: 'HUIDIG' | 'KAND_A' | 'KAND_B') =>
    buildReport({ manifest, files, filter: casus1Filter(k, manifest, files, golden), geometry, settings });
  changed = rederive(path, 'KAND_B_3e', raw.kandidaten.KAND_B_3e, f3('KAND_B'), tol) || changed;
  const others = raw.kandidaten._F3_respons_oordeel.overige_kandidaten as Record<string, Block>;
  for (const [k, b] of Object.entries(others)) {
    changed = rederive(path, `_F3_respons_oordeel.${k}`, b, f3(k === 'HUIDIG_2e' ? 'HUIDIG' : 'KAND_A'), tol) || changed;
  }
  if (changed) writeLike(path, before, raw);
}

/* ---- casus 1b: élke netlist die het manifest noemt (zoals goldenCasus1b.test.ts) ---- */
{
  const path = join(CASUS1B_DIR, 'golden_refs_casus1b.json');
  const before = readFileSync(path, 'utf-8');
  const raw = JSON.parse(before);
  const golden = loadGolden1b();
  const manifest = casus1bManifest(golden);
  const files = casus1bFiles(manifest);
  let changed = false;
  for (const key of Object.keys(raw.manifest_en_geometrie.netlists)) {
    changed = rederive(path, key, raw.kandidaten[key], casus1bReport(key, manifest, files, golden), golden.toleranties.dB) || changed;
  }
  if (changed) writeLike(path, before, raw);
}

/* ---- casus 1h: de levende hybride netlists, elk op zijn eigen actieve overname ---- */
{
  const path = join(CASUS1H_DIR, 'golden_refs_casus1h.json');
  const before = readFileSync(path, 'utf-8');
  const raw = JSON.parse(before);
  const golden = loadGolden1h();
  const manifest = casus1hManifest();
  const files = casus1hFiles(manifest);
  let changed = false;
  for (const key of Object.keys(raw.manifest_en_geometrie.netlists).filter((k) => /^H_KAND_\d+$/.test(k))) {
    const hz = raw.kandidaten[key].actieve_overname_hz as number;
    const rep = casus1hReport(key, manifest, files, golden, casus1hSettingsAt(hz));
    changed = rederive(path, key, raw.kandidaten[key], rep, golden.toleranties.dB as number) || changed;
  }
  if (changed) writeLike(path, before, raw);
}

console.log(log.length > 0 ? log.join('\n') : 'niets bewoog op de opgeschreven precisie');
