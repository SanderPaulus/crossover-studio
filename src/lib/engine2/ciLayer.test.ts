/**
 * V45 — WAT DE CI-LAAG BEWAAKT, EN DAT ZIJ HET BLIJFT BEWAKEN.
 *
 * ==================================================================
 * DE BEVINDING DIE DIT BESTAND BESTAANSRECHT GEEFT
 * ==================================================================
 *
 * Zeven tests in de suite vergelijken een LIVE herberekend netwerk
 * byte-voor-byte met een opgeslagen fixture. Zij zijn opgenomen op
 * darwin/arm64 onder Node 26, en zij reproduceren daar. Ergens anders niet, en
 * dat is gemeten in plaats van vermoed (casusboek V45):
 *
 *   · dezelfde machine, alleen de RUNTIME anders (Node 26 -> 22): het ZAAD —
 *     een vast netwerk, zonder enige zoektocht — meet al anders op het vijfde
 *     significante cijfer (`avgDevDb` 1,1610824868774228 -> 1,1610684586317268),
 *     en de simplex loopt daarna naar een ánder lokaal optimum: L1
 *     3,005 -> 3,034 mH, C·R9 13,61 -> 7,08 Ω, 102 259 -> 91 194 evaluaties.
 *   · linux-x64/Node 22 wijkt op zijn beurt af van darwin-arm64/Node 22, dus
 *     PLATFORM en RUNTIME dragen onafhankelijk bij.
 *
 * AFRONDEN REPAREERT DIT NIET. Bij een verschil in het laatste bit zou een
 * `toPrecision`-stap volstaan; 3,005 tegen 3,034 mH is een ander ontwerp, en
 * een vergelijking die dát doorlaat bewaakt niets meer.
 *
 * A5e.4 IS DAARMEE GEPRECISEERD EN NIET GESCHONDEN: byte-identiek geldt per
 * (machine, runtime); over machines heen geldt equivalentie binnen de
 * tolerantieklassen. Een corpus dat elders wordt opgewekt is een LEGITIEM
 * ander corpus, geen regressie.
 *
 * ==================================================================
 * WAT DIT BESTAND DAN ASSERTEERT
 * ==================================================================
 *
 * De taakverdeling die daaruit volgt — CI bewaakt de natuurkunde, de lokale
 * suite bewaakt de bytes — is niet zelfdragend. Zij is een REGEX in
 * `package.json` plus een tag in een testnaam, en allebei kunnen stil groeien.
 * Twee manieren waarop deze oplevering zichzelf ongedaan zou maken:
 *
 *   (1) iemand tagt er nog een test bij, en de laag die op CI overblijft wordt
 *       leger zonder dat iets faalt. Dat is precies de valkuil die V43 voor
 *       `[live]` opschreef, één tag verderop;
 *   (2) een van de referentiebestanden krijgt een tag en verdwijnt uit CI —
 *       waarmee de énige claim die CI nog draagt, verdwijnt.
 *
 * Vandaar een inventaris in plaats van een belofte. De scan leest de BRON en
 * niet een overgetypte lijst; de tagnaam wordt op runtime samengesteld zodat
 * dit bestand zichzelf niet matcht (dezelfde truc als `noAppWideFloor.test.ts`)
 * en zodat `-t` het niet wegfiltert — een bewaker die door zijn eigen filter
 * verdwijnt bewaakt niets.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/* De twee tags, op runtime samengesteld. Stond hier het letterlijke woord, dan
 * zou dit bestand in zijn eigen inventaris opduiken én — erger — zichzelf uit
 * de CI-laag filteren, want `-t` matcht de VOLLEDIGE testnaam. */
const BYTES_TAG = `[${'bytes'}]`;
const LIVE_TAG = `[${'live'}]`;

const SRC = 'src';
const PKG = JSON.parse(readFileSync('package.json', 'utf-8')) as {
  scripts: Record<string, string>;
};

/** Elk testbestand onder `src/`, met zijn bron. */
function testFiles(): { path: string; source: string }[] {
  const out: { path: string; source: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.test\.tsx?$/.test(p)) out.push({ path: p, source: readFileSync(p, 'utf-8') });
    }
  };
  walk(SRC);
  return out;
}

/**
 * De DRAGENDE bestanden van de CI-laag: klasse-A/B-referenties en de
 * poortcontroles op bevroren netlists. Rekenwerk op vaste netwerken, zónder
 * zoektocht — en juist dat maakt ze portable.
 *
 * Deze lijst staat hier met opzet UITGESCHREVEN, terwijl dit project
 * afgeleide lijsten verkiest. De reden is dat er niets is om uit af te
 * leiden: "welke tests moeten op elk platform reproduceren" is een BESLUIT en
 * geen eigenschap van de boom. Wat wél afgeleid wordt is of ze bestaan (een
 * hernoemd bestand faalt hieronder) en of ze getagd zijn.
 */
const CI_LOAD_BEARING = [
  'src/lib/engine2/goldenCasus1.test.ts',
  'src/lib/engine2/goldenClassification.test.ts',
  'src/lib/engine2/frozenNetlistGates.test.ts',
  'src/lib/engine2/metrics/lfBumpDecomposition.test.ts',
  'src/lib/engine2/metrics/phaseIntegration.test.ts',
  'src/lib/engine2/optimizer/boundInversions.test.ts',
  'src/lib/engine2/optimizer/lfBumpBorder.test.ts',
];

/** De testnamen die een tag dragen, met de tag erbij. */
function taggedNames(tag: string): string[] {
  const found: string[] = [];
  for (const { source } of testFiles()) {
    for (const m of source.matchAll(/(?:describe|it(?:\.each\([^)]*\))?)\(\s*'([^']*)'/g)) {
      if (m[1].includes(tag)) found.push(m[1]);
    }
  }
  return found.sort();
}

describe('V45 — de CI-laag bewaakt de natuurkunde, de lokale suite de bytes', () => {
  it('het CI-script bestaat en sluit precies de twee planningstags uit', () => {
    const ci = PKG.scripts['test:ci'];
    expect(ci, 'geen test:ci in package.json').toBeTruthy();
    /* Niet op de letterlijke regex asserteren — dat zou een kopie zijn van de
     * regel die hij moet bewaken. Wat telt is WAT hij uitsluit. */
    expect(ci).toContain('bytes');
    expect(ci).toContain('live');
    // En de volle run sluit niets uit: hij is de acceptatie-autoriteit.
    expect(PKG.scripts.test).toBe('vitest run');
  });

  it('de dragende referentiebestanden bestaan nog en dragen GEEN enkele tag', () => {
    const byPath = new Map(testFiles().map((f) => [f.path, f.source]));
    for (const p of CI_LOAD_BEARING) {
      const src = byPath.get(p);
      expect(src, `${p} bestaat niet meer — hernoemd of verplaatst?`).toBeTruthy();
      /* Dit is de assert die de hele taakverdeling draagt. Een tag hier zou het
       * bestand uit de CI-laag filteren, en dan bewaakt CI niets meer terwijl
       * de deploy groen blijft — de stilste manier waarop deze oplevering
       * zichzelf ongedaan zou maken. */
      expect(src, `${p} draagt ${BYTES_TAG}`).not.toContain(BYTES_TAG);
      expect(src, `${p} draagt ${LIVE_TAG}`).not.toContain(LIVE_TAG);
    }
  });

  it('de byte-inventaris is precies deze ZES bronnamen — tien gedraaide tests', () => {
    /* De namen staan hier voluit zodat een toevoeging een BEWUSTE daad is: wie
     * er een tagt, komt hier langs en moet opschrijven wat hij uit CI haalt.
     *
     * ZES namen en TIEN tests, en dat is geen tegenspraak: vier ervan zijn
     * `it.each(seeds)` over twee zaden. De scan leest de BRON, dus zij staan
     * hier met hun `%i` er nog in — de gedraaide namen zijn 4x2 + 1 + 1.
     *
     * V50 voegde de zesde toe: het oordelenblok `verdicts_sinds_V50` van
     * `f4cRegression`, dat de twee nieuwe poorten (M-A/part, M-L) op elke
     * oordelenlijst pint. Uit CI om dezelfde reden als de andere vijf: het is
     * een byte-vergelijking van een tuner-run tegen een fixture die op
     * darwin/arm64 is opgenomen. */
    expect(taggedNames(BYTES_TAG)).toEqual([
      `${BYTES_TAG} one candidate, live through handleV2Request, byte for byte`,
      `${BYTES_TAG} seed %i: and ALL SIX verdicts reproduce the V50 block`,
      `${BYTES_TAG} seed %i: so does the F4b2 shape — the fixture pins both`,
      `${BYTES_TAG} seed %i: the F4c shape reproduces the STORED F4b2 network`,
      `${BYTES_TAG} seed %i: the VERDICTS reproduce their own V32 block`,
      `${BYTES_TAG} today the real route still reproduces the stored network`,
    ]);
  });

  it('de live-inventaris is precies deze TWEE blokken', () => {
    /* Sinds 01-09-2026 zijn de twee live ketenruns twee BESTANDEN: `[live]` is
     * planning, en een synchrone `handleV2Request` laat twee van hen binnen één
     * bestand niet naast elkaar draaien. De splitsing verandert dus WAAR zij
     * draaien en niet OF — maar zij verhoogt het tagtal van één naar twee, en
     * precies zo'n verhoging is wat deze inventaris zichtbaar moet houden. Wie
     * er een derde bij tagt komt hier langs en schrijft op wat hij uit de
     * snelle laag én uit CI haalt. */
    expect(taggedNames(LIVE_TAG)).toEqual([
      `${LIVE_TAG} a wholesale refusal comes back as a refusal`,
      `${LIVE_TAG} the run still delivers the frozen netlist`,
    ]);
  });

  it('en de scan loopt echt — een lege scan is anders eeuwig groen', () => {
    /* Dezelfde tegenproef als in `noAppWideFloor.test.ts`, en om dezelfde
     * reden: zonder haar is "niets gevonden" niet te onderscheiden van "niet
     * gekeken". */
    const files = testFiles();
    expect(files.length).toBeGreaterThan(100);
    expect(taggedNames(LIVE_TAG).length).toBeGreaterThan(0);
    // En de scanner vindt werkelijk namen, niet alleen bestanden.
    expect(taggedNames(BYTES_TAG).length).toBeGreaterThan(0);
  });
});
