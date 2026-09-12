/**
 * M-2 — schrijft de woofermerges uit de hermeting van 11-09-2026.
 *
 * De bewerking zelf staat in `src/lib/engine2/koan2026_09.fixture.ts`, samen met
 * élke constante en haar herkomst. Dit script is de SCHRIJVER: het draait de
 * merge, drukt de drie controles af en zet de bestanden op schijf.
 * `koan2026_09.test.ts` is de tweede lezer en reproduceert wat hier geschreven
 * wordt — één implementatie, twee lezers (A3g).
 *
 * Draaien:  npx vite-node scripts/merge-koan-2026-09-woofers.ts
 * Seconden, geen tune.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrd } from '../src/lib/parsers/frd.ts';
import { spliceBandCheck, stepShapeCheck, suggestSpliceBand, sweepUntouchedCheck, type StepPeer } from '../src/lib/nfMerge.ts';
import {
  CABINET_STEP_HZ,
  REAL_VOLUME_L,
  buildKoanTransformedMerge,
  fitKoanBox,
  KOAN_2026_09_DIR,
  KOAN_2026_09_WAYS,
  SD_CM2,
  SPLICE_BAND_HZ,
  STEP,
  buildKoanMerge,
  koanBoxTuneHz,
  koanPortWeight,
  readNew,
} from '../src/lib/engine2/koan2026_09.fixture.ts';

const mark = (ok: boolean | null) => (ok === null ? 'n.v.t.' : ok ? 'OK' : 'LET OP');

function main(): void {
  console.log('M-2 — woofermerge uit de hermeting van 11-09-2026');
  console.log('='.repeat(78));

  const pw = koanPortWeight();
  const fb = koanBoxTuneHz();
  console.log(`\npoortweging : ${pw.note}`);
  console.log(`f_b (nieuwe parallelle sweep): ${fb.fbHz.toFixed(2)} Hz bij ${fb.ohm.toFixed(3)} Ω`);
  console.log(`step-model  : ${STEP.depthDb} dB @ ${STEP.hz} Hz (kastbreedte-afleiding ${CABINET_STEP_HZ.toFixed(1)} Hz)`);

  const peers: StepPeer[] = [];

  for (const way of KOAN_2026_09_WAYS) {
    console.log(`\n${'-'.repeat(78)}\n${way.label}`);
    const b = buildKoanMerge(way);

    const derived = suggestSpliceBand({ farFloorHz: b.farFloorHz, sdCm2: SD_CM2 });
    console.log(`  ver veld   : gate-vloer ${b.farFloorHz.toFixed(1)} Hz`);
    console.log(`  afgeleide splice-band: ${derived.note}`);
    console.log(`  GEBRUIKT   : ${SPLICE_BAND_HZ[0]}–${SPLICE_BAND_HZ[1]} Hz (1/T-grens van het verre veld tot het geldigheidsplafond)`);
    console.log(`  geldig vanaf: ${b.validFromHz.toFixed(1)} Hz`);
    console.log(
      `  splice-fit : gain ${b.merge.fit.levelDb.toFixed(2)} dB, delay ${(b.merge.fit.delayUs / 1000).toFixed(4)} ms, residu ${b.merge.fit.residualDeg.toFixed(1)}° rms`,
    );
    for (const n of b.merge.notes) console.log(`  noot       : ${n}`);

    /* De drie controles. Falen KLEURT en blokkeert niets (F0). */
    const c1 = spliceBandCheck(b.merge, SPLICE_BAND_HZ);
    console.log(`  [${mark(c1.ok)}] ${c1.title}: ${c1.reading ?? 'niet beoordeeld'}`);
    console.log(`         ${c1.why}`);
    const c2 = stepShapeCheck({ hz: STEP.hz, depthDb: STEP.depthDb }, SPLICE_BAND_HZ[0], peers);
    console.log(`  [${mark(c2.ok)}] ${c2.title}: ${c2.reading ?? c2.why}`);
    const raw = readNew(way.nearFile);
    const c3 = sweepUntouchedCheck({ name: way.nearFile, raw }, { name: way.nearFile, raw });
    console.log(`  [${mark(c3.ok)}] ${c3.title}: ${c3.reading ?? c3.why}`);

    writeFileSync(join(KOAN_2026_09_DIR, b.outFile), b.text);
    console.log(`  geschreven : ${b.outFile} (${b.merge.freq.length} rijen)`);

    const near = parseFrd(raw);
    peers.push({
      name: b.outFile,
      mergedFreq: b.merge.freq,
      mergedSpl: b.merge.spl,
      nearFreq: near.freq,
      nearSpl: near.spl,
      nearPhase: near.phase,
      spliceGainDb: b.merge.fit.levelDb,
    });
  }

  /* ---- en dezelfde merge in het frame van de ECHTE kast ---- */
  console.log(`\n${'='.repeat(78)}`);
  console.log(`DE VOLUMETRANSFORMATIE naar ${REAL_VOLUME_L} L, zelfde poort`);
  const boxFit = fitKoanBox();
  console.log(`  de kast meet zichzelf:`);
  console.log(`    f_b uit de poort/conus-verhouding : ${boxFit.fit.tuningHz.toFixed(2)} Hz   Q_l ${boxFit.fit.leakageQ.toFixed(2)}   (residu ${boxFit.fit.residual.toFixed(4)} over ${boxFit.fit.points} punten)`);
  console.log(`    f_b uit het impedantiezadel       : ${boxFit.saddleHz.toFixed(2)} Hz   ->  ${(boxFit.agreement * 100).toFixed(1)} % uit elkaar`);
  console.log(`    Z_b uit de HF-staart              : R_e 5,8 + ${boxFit.blocked.coefficient.toFixed(5)} (jw)^${boxFit.blocked.exponent.toFixed(3)}  (residu ${boxFit.blocked.residualDb.toFixed(3)} dB)`);
  for (const way of KOAN_2026_09_WAYS) {
    const t = buildKoanTransformedMerge(way, boxFit, REAL_VOLUME_L);
    writeFileSync(join(KOAN_2026_09_DIR, t.outFile), t.text);
    console.log(`  ${way.label}: gain ${t.merge.fit.levelDb.toFixed(2)} dB -> ${t.outFile}`);
  }
  console.log('\nKLAAR. Twee frames naast elkaar: de TESTKAST zoals gemeten, en de ECHTE KAST als');
  console.log('MODEL TRANSFORM. Het verre veld boven de splice is in beide onaangeroerde meting.');
}

main();
