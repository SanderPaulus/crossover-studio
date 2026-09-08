/**
 * CASUS 2 — DE PROJECTINVOER SYNCHRONISEREN MET HET MODEL.
 *
 * `npx vite-node scripts/sync-casus2-project-input.ts` — seconden.
 *
 * Op een ECHTE casus komt de driverkaart uit een datasheet en de geometrie van
 * een rolmaat. Op een synthetische komen zij allebei uit het model, en ze met
 * de hand overtypen is precies hoe een fixture een luidspreker gaat beschrijven
 * die nooit gegenereerd is. Dat is geen hypothese: de eerste run van de
 * recorder meldde de excursieroute 42 %, 51 % en 35 % naast de grondwaarheid,
 * en élk van die drie was een kaart die de Bl en M_ms van een eerdere afstemming
 * van het model droeg. P6 één laag hoger: het getal heeft één huis, en dit
 * script maakt de kopie.
 *
 * WAT HET NIET AANRAAKT: `gestelde_eisen` (op de drie versterkergetallen na,
 * die het model zelf stelt) en `driverkaart.spoelfamilie`. Die zijn GESTELD
 * voor deze casus en zijn geen eigenschap van het model.
 *
 * DE VOLGORDE IS: generate-casus2-measurements → dit script → 
 * record-casus2-references. Een eigen script en geen stap in de recorder, omdat
 * de fixture haar constanten bij IMPORT uit het referentiebestand leest: een
 * recorder die het bestand halverwege zijn eigen run bijwerkt, meet nog steeds
 * met de oude kaart.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CASUS2_DIR, GOLDEN2_PATH, loadGolden2, casus2Truth, type GoldenRefs2 } from '../src/lib/engine2/casus2.fixture.ts';

const goldenOnDisk = loadGolden2();
const g: GoldenRefs2 = structuredClone(goldenOnDisk);

const m = g.manifest_en_geometrie;
const t = JSON.parse(readFileSync(join(CASUS2_DIR, 'grondwaarheid.json'), 'utf-8')) as ReturnType<typeof casus2Truth>;
m.grondwaarheid = t;
m.geometrie = {
  ...m.geometrie,
  D_inch: Object.fromEntries(
    Object.entries(t.drivers)
      .filter(([w]) => Object.values(m.bestanden).some((b) => b.drv === w && b.typ === 'NF'))
      .map(([w, d]) => [w, d.diameter_inch as number]),
  ),
  z_offset_mm: t.geometrie.z_offset_mm,
  ctc_mm: t.geometrie.ctc_mm,
  baffle_mm: { ...m.geometrie.baffle_mm, ...t.geometrie.baffle_mm } as { breedte: number; hoogte: number },
};
m.ff_headers = {
  ...m.ff_headers,
  referentietijd_ms: t.poort.referenceTimeMs,
  rechter_venster_ms: t.poort.rightWindowMs,
  effectieve_venstertijd_ms: t.poort.effectieve_venstertijd_ms,
};
const card = m.driverkaart as Record<string, unknown>;
card.ff_meetspanning_V = t.meetcondities.voltsRms;
card.ff_mic_afstand_mm = t.meetcondities.micDistanceMm;
for (const [way, d] of Object.entries(t.drivers)) {
  card[way] = {
    ...((card[way] as Record<string, unknown>) ?? {}),
    model: d.model,
    X_max_mm: d.X_max_mm,
    S_d_cm2: d.S_d_cm2,
    Bl_Tm: d.Bl_Tm,
    M_ms_g: d.M_ms_g,
    Re_datasheet_ohm: d.R_e_ohm,
    schakeling: { aantal: 1, gemeten: 'parallel', gewenst: 'parallel' },
  };
}
const eisen = m.gestelde_eisen as Record<string, unknown>;
eisen.versterker_piekvermogen_W = t.versterker.peakPowerW;
eisen.versterker_nominale_last_ohm = t.versterker.nominalLoadOhm;
eisen.versterker_continu_vermogen_W = t.versterker.continuousPowerW;
writeFileSync(GOLDEN2_PATH, `${JSON.stringify(g, null, 1)}\n`);

console.log('casus 2: projectinvoer gesynchroniseerd met grondwaarheid.json');
for (const [way, d] of Object.entries((g.manifest_en_geometrie.driverkaart as Record<string, unknown>))) {
  if (typeof d !== 'object' || d === null || !('Bl_Tm' in (d as Record<string, unknown>))) continue;
  const c = d as Record<string, number | string>;
  console.log(`  ${way.padEnd(8)} Bl ${Number(c.Bl_Tm).toFixed(3)} T·m  M_ms ${c.M_ms_g} g  S_d ${c.S_d_cm2} cm²  X_max ${c.X_max_mm} mm  R_e ${c.Re_datasheet_ohm} Ω`);
}
