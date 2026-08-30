/**
 * V40 — DRIE BEVROREN NETLISTS ALS VITUIXCAD-PROJECT, VOOR HET FASEOORDEEL.
 *
 * `npx vite-node scripts/export-v40-vxp.ts [SLEUTEL ...]`
 * default: `HUIDIG` + de beste levende kandidaat + de kandidaat waarop de twee
 * fasematen het verst uiteenlopen (afgeleid, niet ingetypt — zie `pickKeys`).
 *
 * WAT DE VRAAG IS. V40 staat open omdat de app twee fasematen draagt die op één
 * netwerk in TEGENGESTELDE richting bewegen: de tuner leest `pairPhaseDeg` (het
 * gemiddelde over het OVERLAPVENSTER van twee takken) en het rapport leest
 * `system.phaseTracking` (het gemiddelde over ±1 octaaf rond het kruispunt,
 * geknipt op meetgeldigheid). Welke van de twee de luidspreker beschrijft is
 * met geen enkele meting in dit project uit te maken, want beide zijn ONZE
 * definities. Een derde partij die dezelfde meetdata en hetzelfde netwerk
 * simuleert kan het wél: de maat die VituixCAD reproduceert beschrijft de
 * luidspreker, de andere beschrijft een conventie.
 *
 * WAT DIT SCRIPT WEL EN NIET IS.
 *
 * WEL de bestaande route: `serializeVxp` en `zipStore` zijn dezelfde functies
 * die de exportknop aanroept, en de brugvertraging komt sinds V41 uit
 * `vituixBridge.ts` — dezelfde functie, één implementatie. De koppen
 * (`MinimumPhase=True`, `Delay` per driver, `Variant` 0) zijn wat de knop
 * schrijft.
 *
 * NIET de exportknop zelf. Die zit in `App.tsx` als een callback over
 * React-state (`designs`, `woofer`, `angleSets`, `project`) en is van buiten een
 * component niet aan te roepen. Dit script vult diezelfde velden uit de
 * casus-1-fixture. Wat het daarbij ANDERS doet dan de knop staat hieronder, met
 * de reden — want een export die stilzwijgend van de app afwijkt is precies wat
 * dit hele oordeel waardeloos zou maken.
 *
 *   1. DE RESPONSBESTANDEN ZIJN AFGELEID, niet de ruwe meetbestanden. De knop
 *      schrijft de ingeladen bestanden door. Dat kan hier niet: casus 1's
 *      WOOFER is één weg gemeten als TWEE bestanden (V13), en VituixCAD wil één
 *      responsbestand per driverblok. Een van de twee doorschrijven zou een
 *      halve woofer simuleren. Dus schrijft dit script per driver de
 *      `onAxisFull` van de opnamepas weg — de ongeknipte complexe som waarop de
 *      app zélf ontwerpt — voor alle drie de wegen, zodat er één afleiding is
 *      en niet één afwijkende. Elk bestand draagt die herkomst in zijn kop.
 *   2. DE IMPEDANTIEBESTANDEN WORDEN OMGEZET. Casus 1's impedanties zijn
 *      binaire ARTA `.lim`-bestanden en VituixCAD leest die niet. Ze gaan als
 *      `.ZMA`-tekst mee (frequentie, |Z|, fase), uit dezelfde parse die de
 *      engine gebruikt. **DIT IS OOK EEN BEVINDING OVER DE APP**, gemeld en
 *      niet gerepareerd: wie in de app een `.lim` inlaadt en exporteert, krijgt
 *      dat `.lim` ongewijzigd in de map en VituixCAD zegt dat het bestand niet
 *      deugt. Buiten het bereik van deze sessie (V41 raakt de exportcode niet).
 *   3. GEEN HOEKENSETS. De knop exporteert de ingeladen hoekmetingen als
 *      extra responsen per driver. Casus 1 heeft er één (mid 30°), en één hoek
 *      op één driver is geen directiviteitsset — hij zou de VituixCAD-simulatie
 *      een gedeeltelijke set geven die de app zelf ook niet gebruikt
 *      (`directivityWeight` staat op 0 en er reist geen `angleData` mee).
 *
 * WAT SANDER ERMEE DOET staat in het casusboek bij V40, naast het getallenblad
 * dat `measure-v40-phase.ts` afdrukt.
 */

import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CASUS1_DIR,
  casus1Files,
  casus1Manifest,
  loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import { runIngest } from '../src/lib/engine2/ingest/derive.ts';
import { deserializeFilter } from '../src/lib/filterFile.ts';
import { serializeVxp } from '../src/lib/parsers/vxpExport.ts';
import type { VxpDriver, VxpPart } from '../src/lib/parsers/vxp.ts';
import { zipStore } from '../src/lib/zip.ts';
import { bridgeDelaysUs, excessDelayMsOf } from '../src/lib/vituixBridge.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', 'test-fixtures', 'casus1', 'v40_vituix');

/**
 * De commit waarop geëxporteerd is, kort. Reist mee in élke bestandsnaam en in
 * de projectbeschrijving: zonder haar is "welk netwerk zit hierin" een vraag
 * die alleen de bestandsdatum kan beantwoorden, en die overleeft geen kopie.
 * Faalt de aanroep (geen git), dan staat er `nogit` — een leugen zou erger zijn
 * dan een gat.
 */
const COMMIT = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim() || 'nogit';
  } catch {
    return 'nogit';
  }
})();

/** De plotgrenzen die de app meegeeft (`fMin`/`fMax` op deze casus). */
const PLOT_HZ: [number, number] = [200, 20000];

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const ingest = runIngest(manifest, files);
const netlists = (golden.manifest_en_geometrie as { netlists: Record<string, string> }).netlists;

/* ------------------------------------------------------------------ *
 * De drie sleutels
 * ------------------------------------------------------------------ */


/* ------------------------------------------------------------------ *
 * De bestanden die meereizen
 * ------------------------------------------------------------------ */

const HEADER_NOTE =
  '* Afgeleid uit de casus-1-meetset door SD Acoustics Crossover Studio (V40-export).';

/**
 * Eén driverrespons als FRD-tekst: de ongeknipte complexe som van de opnamepas.
 *
 * Dat is `onAxisFull` — voor de mid en de tweeter is dat hun eigen meting, voor
 * de woofer de complexe som van de twee wooferbestanden (V13). Eén afleiding
 * voor alle drie, zodat er geen weg is die anders behandeld wordt dan de andere.
 */
function frdTextFor(driver: string): string {
  const d = ingest.drivers.find((x) => x.driver === driver);
  const full = d?.onAxisFull;
  if (!full) throw new Error(`casus 1 heeft geen on-axis som voor ${driver}`);
  const lines = [
    HEADER_NOTE,
    `* Driver: ${driver} — ongeknipte complexe som van de 0°-verre-veldmetingen (onAxisFull).`,
    '* Kolommen: frequentie [Hz], niveau [dB], fase [graden].',
  ];
  for (let i = 0; i < full.grid.length; i++) {
    lines.push(
      `${full.grid[i].toPrecision(9)} ${full.db[i].toFixed(4)} ${full.phaseDeg[i].toFixed(4)}`,
    );
  }
  return lines.join('\r\n') + '\r\n';
}

/** Eén driverimpedantie als ZMA-tekst, uit dezelfde parse die de engine leest. */
function zmaTextFor(driver: string): string {
  const entry = manifest.entries.find((e) => e.kind === 'Z' && e.driver === driver);
  const f = entry ? files.find((x) => x.entry.file === entry.file) : undefined;
  if (!f?.impedance) throw new Error(`casus 1 heeft geen impedantie voor ${driver}`);
  const z = f.impedance;
  const lines = [
    HEADER_NOTE,
    `* Driver: ${driver} — omgezet uit ${entry?.file} (binair ARTA .lim, dat VituixCAD niet leest).`,
    '* Kolommen: frequentie [Hz], |Z| [ohm], fase [graden].',
  ];
  for (let i = 0; i < z.freq.length; i++) {
    lines.push(
      `${z.freq[i].toPrecision(9)} ${z.magnitude[i].toFixed(5)} ${z.phaseDeg[i].toFixed(4)}`,
    );
  }
  return lines.join('\r\n') + '\r\n';
}

/* ------------------------------------------------------------------ *
 * De export
 * ------------------------------------------------------------------ */

/** De brugvertragingen per driver — dezelfde functie die de knop aanroept. */
function delaysUs(models: readonly string[]): Record<string, number> {
  const excess: Record<string, number | null> = {};
  for (const m of models) {
    const full = ingest.drivers.find((x) => x.driver === m)?.onAxisFull;
    excess[m] = full
      ? excessDelayMsOf({ freq: [...full.grid], spl: [...full.db], phase: [...full.phaseDeg] })
      : null;
  }
  return bridgeDelaysUs(excess);
}

function exportOne(key: string): { zip: string; bridge: string } {
  const name = netlists[key];
  if (!name) throw new Error(`onbekende netlist-sleutel "${key}"`);
  const parts: VxpPart[] = deserializeFilter(readFileSync(join(CASUS1_DIR, name), 'utf-8')).parts;

  // De drivermodellen die de netlist zélf noemt, in de volgorde waarin zij
  // erin staan — niet een lijst die dit script bijhoudt.
  const models: string[] = [];
  for (const p of parts) {
    if (p.type === 'Driver' && p.model && !models.includes(p.model)) models.push(p.model);
  }
  if (models.length === 0) throw new Error(`${key} draagt geen driverblokken`);

  const us = delaysUs(models);
  const payload = new Map<string, string>();
  const drivers: VxpDriver[] = models.map((model) => {
    const frdName = `${model}_onaxis.txt`;
    const zmaName = `${model}.ZMA`;
    payload.set(frdName, frdTextFor(model));
    payload.set(zmaName, zmaTextFor(model));
    return {
      model,
      // De brug: VituixCAD reconstrueert de fase uit de magnitude en telt deze
      // vertraging erbij op. Zie `vituixBridge.ts` voor waarom het de
      // EXCESS-fasevertraging is en niet de ruwe Δ.
      minimumPhase: true,
      inverted: false,
      responseDelay: us[model] ?? 0,
      z: 0,
      impedanceFile: zmaName,
      impedanceFileName: zmaName,
      responses: [{ fileName: frdName, hor: 0, ver: 0 }],
    };
  });

  /* V44 — DE NAAM DRAAGT DE CORPUSSLEUTEL EN DE COMMIT, en dat is een reparatie.
   *
   * De V41-zips heetten naar de LEVENDE sleutel (`V40-KAND_V2_1.zip`), en die
   * sleutel wijst na elke regeneratie naar een ander bestand: de zip die Sander
   * in VituixCAD opendeed bevatte de V41-netlist terwijl `KAND_V2_1` in de repo
   * inmiddels twee generaties verder stond, met een ander kruispunt en andere
   * onderdelen. Een aflezing die tegen de verkeerde rij wordt gelegd is erger
   * dan geen aflezing. Dus: een BEVROREN sleutel in de naam (die verwijst voor
   * altijd naar hetzelfde bestand) plus de commit waarop geëxporteerd is, zodat
   * er ook over de meetset en de brug geen twijfel bestaat. */
  const base = `${key}@${COMMIT}`;
  const xml = serializeVxp(
    { drivers, crossovers: [{ name: 'CROSSOVER', parts }] },
    {
      description:
        `SD Acoustics Crossover Studio — casus 1, netlist ${key} (${name}), ` +
        `geëxporteerd op commit ${COMMIT}. Voor de validatie van de fasemaat M-K ` +
        '(casusboek V40/V44).',
      activeVariant: 0,
      xMin: PLOT_HZ[0],
      xMax: PLOT_HZ[1],
    },
  );
  payload.set(`${base}.vxp`, xml);

  mkdirSync(OUT_DIR, { recursive: true });
  const zipPath = join(OUT_DIR, `${base}.zip`);
  writeFileSync(
    zipPath,
    zipStore([...payload].map(([n, data]) => ({ name: `${base}/${n}`, data }))),
  );
  const bridge = models.map((m) => `${m} ${us[m] ?? 0} µs`).join(' / ');
  return { zip: zipPath, bridge };
}

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

/**
 * DE DRIE VASTE MEETOBJECTEN, en alle drie zijn BEVROREN met opzet (V44).
 *
 * Tot V43 stond hier `['HUIDIG', ...liveKeys()]`, en dat is precies waardoor de
 * V41-zips onbruikbaar werden: een levende sleutel wijst na elke regeneratie
 * naar een ander bestand, dus de zip in de repo en de rij in het getallenblad
 * liepen uit elkaar zonder dat iets faalde. Een bevroren sleutel kan dat niet.
 *
 * De keuze is dezelfde als bij V40 en op dezelfde assen: HUIDIG is het handwerk
 * van de ontwerper, `V41_KAND_1` was de beste kandidaat van dat veld, en
 * `V38FIX_KAND_5` is de netlist waarop de twee vervangen fasematen het VERST
 * uiteenliepen — het scherpste validatieobject dat het casusboek heeft.
 *
 * Een LEVENDE kandidaat exporteren kan altijd door hem als argument mee te
 * geven; hij wordt hier niet meegeleverd omdat zijn zip bij de eerstvolgende
 * regeneratie een ander netwerk zou beschrijven onder dezelfde naam.
 */
const FROZEN_SUBJECTS = ['HUIDIG', 'V41_KAND_1', 'V38FIX_KAND_5'];

const asked = process.argv.slice(2);
const keys = asked.length > 0 ? asked : FROZEN_SUBJECTS;

console.log(`uitvoermap: ${OUT_DIR}`);
console.log('');
console.log('| sleutel | bestand | zip | brugvertragingen (MinimumPhase=True) |');
console.log('|---|---|---|---|');
for (const key of keys) {
  const r = exportOne(key);
  console.log(`| ${key} | ${netlists[key]} | ${r.zip.replace(join(HERE, '..') + '/', '')} | ${r.bridge} |`);
}
console.log('');
console.log(
  'Elke zip pakt uit tot één map met het .vxp én zijn meetbestanden ernaast, precies zoals de ' +
    'exportknop van de app het doet — VituixCAD opent hem zonder te hoeven zoeken.',
);
