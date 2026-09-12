/**
 * M-2 — schrijft de DEMOSET voor de echte Koan-kast van 67,7 liter.
 *
 * Wat erin gaat en waar het vandaan komt:
 *  - de WOOFER als één on-axis bestand: de twee per-driver merges uit de
 *    hermeting van 11-09-2026, naar 67,7 L getransformeerd en complex gesommeerd;
 *  - de parallelle IMPEDANTIE, dezelfde meting naar hetzelfde volume gebracht,
 *    zodat SPL en last over dezelfde kast spreken;
 *  - MID en TWEETER ongewijzigd, want een ander kastvolume raakt een pod en een
 *    waveguide niet. Zij worden byte-voor-byte gekopieerd uit de set die Sander
 *    leverde, waar zij als MEETDATA gemarkeerd staan.
 *
 * De bewerking staat in `src/lib/engine2/koan2026_09.fixture.ts` en de
 * natuurkunde in `src/lib/ventedBoxTransform.ts`; dit script schrijft alleen.
 *
 * Draaien:  npx vite-node scripts/build-koan-demo-67l.ts
 */

import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  KOAN_DEMO_67L_DIR,
  KOAN_DEMO_67L_NAME,
  REAL_VOLUME_L,
  TEST_VOLUME_L,
  buildKoanPairFrd,
  buildKoanPairZma,
  fitKoanBox,
} from '../src/lib/engine2/koan2026_09.fixture.ts';
import { KOAN_DEMO_2026_09_DIR } from '../src/lib/engine2/koanDemo2026_09.fixture.ts';

/** Wat ongewijzigd meegaat: pod en waveguide bepalen hun eigen diffractie. */
const CARRIED = ['mid.frd', 'mid.zma', 'tweeter.frd', 'tweeter.zma'];

function main(): void {
  const boxFit = fitKoanBox();
  mkdirSync(KOAN_DEMO_67L_DIR, { recursive: true });

  console.log(`M-2 — demoset voor ${REAL_VOLUME_L} L  ->  ${KOAN_DEMO_67L_NAME}/`);
  console.log('='.repeat(78));
  console.log(`de kast meet zichzelf: f_b ${boxFit.fit.tuningHz.toFixed(2)} Hz (poort/conus) tegen ${boxFit.saddleHz.toFixed(2)} Hz (zadel), ${(boxFit.agreement * 100).toFixed(1)} % uit elkaar`);

  const frd = buildKoanPairFrd(boxFit, REAL_VOLUME_L);
  writeFileSync(join(KOAN_DEMO_67L_DIR, frd.name), frd.text);
  console.log(`  geschreven: ${frd.name}  (wooferpaar, complexe som van de twee merges)`);

  const zma = buildKoanPairZma(boxFit, REAL_VOLUME_L);
  writeFileSync(join(KOAN_DEMO_67L_DIR, zma.name), zma.text);
  console.log(`  geschreven: ${zma.name}  (parallelle last, GEMETEN in ${TEST_VOLUME_L} L en met opzet NIET getransformeerd)`);

  for (const f of CARRIED) {
    copyFileSync(join(KOAN_DEMO_2026_09_DIR, f), join(KOAN_DEMO_67L_DIR, f));
    console.log(`  gekopieerd: ${f}  (ONGEWIJZIGD — pod/waveguide, MEETDATA)`);
  }

  console.log(`\nKLAAR. De RESPONS van de woofer staat in het frame van ${REAL_VOLUME_L} L; boven de splice is`);
  console.log('zij het bestaande verre veld, onaangeroerd. Mid en tweeter zijn onaangeroerde meting.');
  console.log(`De LAST is de GEMETEN sweep uit ${TEST_VOLUME_L} L: transformeren leverde een onfysische driver op`);
  console.log('(negatieve mechanische weerstand onder 30 Hz). Boven 100 Hz doet dat er niet toe.');
  console.log('\nGEVOELIGHEID: bij +/-10 % op de datasheet-B_l beweegt de respons 2,3 dB rond 30 Hz,');
  console.log('0,4-0,7 dB onder 27 Hz en minder dan 0,2 dB boven 60 Hz. Dat is de foutbalk op het lage eind.');
}

main();
