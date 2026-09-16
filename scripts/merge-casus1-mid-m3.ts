/**
 * M-3 — SCHRIJFT DE MID-MERGE MET DE GECORRIGEERDE FASEWISKUNDE.
 *
 * De bewerking zelf staat in `src/lib/engine2/midM3.fixture.ts`, samen met élke
 * constante en haar herkomst. Dit script is de SCHRIJVER: het draait de merge,
 * drukt de drie controles én de fasedelta af, en zet het bestand op schijf.
 * `midM3.test.ts` is de tweede lezer en reproduceert wat hier geschreven wordt —
 * één implementatie, twee lezers (A3g), de vorm die M-2 voor de woofers zette.
 *
 * Draaien:  npx vite-node scripts/merge-casus1-mid-m3.ts
 * Seconden, geen tune.
 *
 * DE DRIE CONTROLES zijn die van `nfMerge.ts` en falen KLEURT (F0):
 *   (1) splice-band: |FF − (NF·shelf + niveau)| over de band;
 *   (2) stap-vorm tegen die van de twee AUGUSTUS-woofers — dezelfde peers als
 *       M-1 en I-2 gebruikten, en met opzet niet de 67,7 L-merges: die dragen
 *       een getransformeerd nabij veld, dus `merged − near − gain` zou daar
 *       twee frames door elkaar halen;
 *   (3) `mid.lim` ongewijzigd — het structurele feit dat niemand meet.
 *
 * DE VIERDE TABEL IS DE SESSIE: de delta oud→nieuw, band voor band, in
 * dezelfde banden waarin I-2 de fout mat.
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrd } from '../src/lib/parsers/frd.ts';
import { parseTabular } from '../src/lib/parsers/tabular.ts';
import { parseArtaHeader } from '../src/lib/engine2/ingest/manifest.ts';
import {
  spliceBandCheck,
  stepShapeCheck,
  suggestSpliceBand,
  sweepUntouchedCheck,
  type StepPeer,
} from '../src/lib/nfMerge.ts';
import {
  CABINET_STEP_HZ,
  MID_M1_FILE,
  SPLICE_BAND_HZ,
  STEP,
  buildM3MidMerge,
  deltaBands,
  m1MidResponse,
} from '../src/lib/engine2/midM3.fixture.ts';
import { CASUS1_DIR } from '../src/lib/engine2/koan2026_09.fixture.ts';
import { loadGolden } from '../src/lib/engine2/casus1.fixture.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const rd = (f: string): string => readFileSync(join(CASUS1_DIR, f), 'utf8');
const mark = (ok: boolean | null): string => (ok === null ? 'n.v.t.' : ok ? 'OK' : 'LET OP');

function main(): void {
  console.log('M-3 — de mid opnieuw gemergd met de gecorrigeerde fasewiskunde');
  console.log('='.repeat(78));

  const b = buildM3MidMerge();
  const golden = loadGolden();
  const sdCm2 = (
    golden.manifest_en_geometrie as unknown as { driverkaart: Record<string, { S_d_cm2?: number }> }
  ).driverkaart.mid?.S_d_cm2 ?? null;

  console.log(`\nbronnen     : ${b.merge.notes.length ? '' : ''}nabij veld + gepoort ver veld, gesloten pod, GEEN poort`);
  console.log(`ver veld    : gate-vloer ${b.farFloorHz.toFixed(1)} Hz`);
  const derived = suggestSpliceBand({ farFloorHz: b.farFloorHz, sdCm2 });
  console.log(`afgeleide splice-band: ${derived.note}`);
  console.log(`GEBRUIKT    : ${SPLICE_BAND_HZ[0]}–${SPLICE_BAND_HZ[1]} Hz (M-1's band, onveranderd — zie de fixture)`);
  console.log(`step-model  : ${STEP.depthDb} dB @ ${STEP.hz} Hz (kastbreedte-afleiding ${CABINET_STEP_HZ === null ? 'n.v.t.' : `${CABINET_STEP_HZ.toFixed(1)} Hz`})`);
  console.log(`geldig vanaf: ${b.validFromHz} Hz GESTELD (M-1); de app zou ${b.derivedValidFromHz === null ? 'niets' : `${b.derivedValidFromHz.toFixed(1)} Hz`} afleiden`);
  console.log(
    `splice-fit  : gain ${b.merge.fit.levelDb.toFixed(3)} dB, delay ${(b.merge.fit.delayUs / 1000).toFixed(4)} ms, ` +
      `offset ${b.merge.fit.offsetDeg.toFixed(1)}°, residu ${b.merge.fit.residualDeg.toFixed(2)}° rms`,
  );
  for (const n of b.merge.notes) console.log(`  noot      : ${n}`);

  /* ---- de drie controles ---- */
  console.log(`\n${'-'.repeat(78)}\nDE DRIE CONTROLES`);
  const c1 = spliceBandCheck(b.merge, SPLICE_BAND_HZ);
  console.log(`  [${mark(c1.ok)}] ${c1.title}: ${c1.reading ?? 'niet beoordeeld'}`);
  console.log(`         ${c1.why}`);

  const peers: StepPeer[] = (['up', 'down'] as const).map((w) => {
    const name = `Koan_W_${w}_merged_ingespeeld_mild.frd`;
    const text = rd(name);
    const m = parseFrd(text);
    const blk = parseArtaHeader(parseTabular(text).comments).merge;
    if (blk?.spliceGainDb === undefined) throw new Error(`${name}: geen splice-gain in het blok`);
    const near = parseFrd(rd(`woofer_${w}_near.txt`));
    return {
      name: `woofer_${w}`,
      mergedFreq: m.freq,
      mergedSpl: m.spl,
      nearFreq: near.freq,
      nearSpl: near.spl,
      nearPhase: near.phase,
      spliceGainDb: blk.spliceGainDb,
    };
  });
  const c2 = stepShapeCheck({ hz: STEP.hz, depthDb: STEP.depthDb }, SPLICE_BAND_HZ[0], peers);
  console.log(`  [${mark(c2.ok)}] ${c2.title}: ${c2.reading ?? c2.why}`);
  console.log(`         ${c2.why}`);

  const lim = rd('mid.lim');
  const c3 = sweepUntouchedCheck({ name: 'mid.lim', raw: lim }, { name: 'mid.lim', raw: lim });
  console.log(`  [${mark(c3.ok)}] ${c3.title}: ${c3.reading ?? c3.why}`);

  /* ---- de vierde tabel: wat de reparatie verplaatst ---- */
  const old = m1MidResponse();
  const rows = deltaBands(
    b.merge.freq,
    { spl: b.merge.spl, phase: b.merge.phaseDeg },
    { spl: old.spl, phase: old.phase },
  );
  console.log(`\n${'-'.repeat(78)}`);
  console.log(`DE FASEDELTA — M-3 (Im) tegen M-1 (atan2), band voor band, op het gedeelde raster`);
  console.log(`  ${'band'.padEnd(14)}${'n'.padStart(6)}${'dB rms'.padStart(10)}${'dB max'.padStart(10)}${'° rms'.padStart(10)}${'° max'.padStart(10)}`);
  for (const r of rows) {
    console.log(
      `  ${`${r.from}–${r.to} Hz`.padEnd(14)}${String(r.n).padStart(6)}${r.dbRms.toFixed(4).padStart(10)}` +
        `${r.dbMax.toFixed(4).padStart(10)}${r.degRms.toFixed(2).padStart(10)}${r.degMax.toFixed(2).padStart(10)}`,
    );
  }

  /* ---- schrijven ---- */
  writeFileSync(join(CASUS1_DIR, b.outFile), b.text, 'utf8');
  console.log(`\ngeschreven  : ${b.outFile} (${b.merge.freq.length} rijen)`);
  console.log(`bewaard     : ${MID_M1_FILE} (M-1, ongewijzigd — de gedateerde brug)`);

  const status = execSync('git status --porcelain -- test-fixtures/casus1/mid.lim test-fixtures/casus1/mid_near.txt test-fixtures/casus1/mid_hor_0.txt', {
    cwd: join(HERE, '..'),
  })
    .toString()
    .trim();
  console.log(`bronnen     : ${status === '' ? 'ongewijzigd (git status schoon)' : `GEWIJZIGD: ${status}`}`);
}

main();
