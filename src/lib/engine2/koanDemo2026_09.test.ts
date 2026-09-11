/**
 * M-2 — DE GEDATEERDE KOAN-FRAME SET, EN WAT ER OVER HAAR VASTLIGT.
 *
 * Twee soorten claim, en de scheiding is de hele reden dat dit bestand
 * bestaat. De LOADER-TEST toetst dat wij de drie wooferweg-bronnen op dezelfde
 * manier optellen als degene die de referentie maakte: mapping, eenheden en
 * tekens. Zij zegt NIETS over de juistheid van de data, want die data is een
 * voorspelling en kan langs deze weg per constructie niet weerlegd worden. De
 * REGISTRATIE-claims leggen vast wat de set is: welke bron meting is en welke
 * model, dat de meetbasis er niet door verschuift, en dat de vervangregel in
 * het manifest blijft staan.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  KOAN_DEMO_2026_09_DIR,
  KOAN_DEMO_2026_09_NAME,
  LOADER_TEST_BAND_HZ,
  LOADER_TEST_TOLERANCE_DB,
  koanDemoSources,
  koanDemoStatusOf,
  koanDemoWooferWaySourceIds,
  loadKoanDemoImpedance,
  loadKoanDemoManifest,
  loadKoanDemoResponse,
  readKoanDemoFile,
  runKoanDemoLoaderTest,
} from './koanDemo2026_09.fixture.ts';
import { readGateHeader, readMergeBlock } from '../xoWindow.ts';

const MANIFEST = loadKoanDemoManifest();

describe('M-2 loader-test — mapping, eenheden en tekens, niet de data', () => {
  /**
   * DE DRAGENDE CLAIM. Het getal staat in de faalboodschap zodat een latere
   * sessie ziet hoeveel ruimte er was en niet alleen dát hij slaagde.
   */
  it('de complexe som van de wooferweg-bronnen reproduceert de referentie binnen de tolerantie', () => {
    const r = runKoanDemoLoaderTest(MANIFEST);
    expect(
      r.pass,
      `grootste |Δ| ${r.worstDb.toExponential(3)} dB bij ${r.worstHz.toFixed(1)} Hz over ${r.points} punten, tolerantie ${LOADER_TEST_TOLERANCE_DB} dB`,
    ).toBe(true);
    expect(r.worstDb).toBeLessThanOrEqual(LOADER_TEST_TOLERANCE_DB);
  });

  /**
   * Een niveaufout zou als offset in het gemiddelde staan en een tekenfout in
   * de fase. Zonder deze twee zou een som die toevallig binnen 0,1 dB blijft
   * terwijl er een halve golf naast ligt nog steeds slagen.
   */
  it('er is geen niveau-offset en geen tekenfout', () => {
    const r = runKoanDemoLoaderTest(MANIFEST);
    expect(Math.abs(r.meanDb)).toBeLessThanOrEqual(LOADER_TEST_TOLERANCE_DB / 10);
    expect(r.worstPhaseDeg).toBeLessThanOrEqual(1);
  });

  /**
   * DE TEGENPROEF. Zonder haar is "de som klopt" niet te onderscheiden van een
   * test die alles goedkeurt: één bron weglaten moet hem aantoonbaar breken.
   */
  it('hij KAN falen — de som zonder de poort haalt de tolerantie niet', () => {
    const ids = koanDemoWooferWaySourceIds(MANIFEST);
    const sources = koanDemoSources(MANIFEST);
    const ref = loadKoanDemoResponse(MANIFEST.verification.loader_test_reference);
    const withoutOne = ids.slice(0, -1).map((id) => {
      const s = sources.find((x) => x.id === id)!;
      return loadKoanDemoResponse(s.frd);
    });
    const [lo, hi] = LOADER_TEST_BAND_HZ;
    let worst = 0;
    for (const [i, f] of ref.freq.entries()) {
      if (f < lo || f > hi) continue;
      const re = withoutOne.reduce((a, g) => a + Math.pow(10, g.spl[i] / 20) * Math.cos((g.phaseDeg[i] * Math.PI) / 180), 0);
      const im = withoutOne.reduce((a, g) => a + Math.pow(10, g.spl[i] / 20) * Math.sin((g.phaseDeg[i] * Math.PI) / 180), 0);
      worst = Math.max(worst, Math.abs(20 * Math.log10(Math.hypot(re, im)) - ref.spl[i]));
    }
    expect(worst).toBeGreaterThan(LOADER_TEST_TOLERANCE_DB);
  });

  /** De toetsband en de tolerantie komen uit het manifest en niet uit deze test. */
  it('de band en de tolerantie die wij toetsen staan in het manifest', () => {
    const [lo, hi] = LOADER_TEST_BAND_HZ;
    expect(MANIFEST.verification.rule).toContain(`${lo}-${hi} Hz`);
    expect(MANIFEST.verification.rule).toContain(`${LOADER_TEST_TOLERANCE_DB} dB`);
    expect(MANIFEST.verification.rule).toContain('toetst loader, niet de data');
  });
});

describe('M-2 registratie — wat model is en wat meting', () => {
  it('de map draagt de status in haar naam', () => {
    expect(KOAN_DEMO_2026_09_NAME).toBe('koan_demo_2026-09_modeltransform');
    expect(KOAN_DEMO_2026_09_DIR.endsWith(KOAN_DEMO_2026_09_NAME)).toBe(true);
  });

  /**
   * DE SCHEIDING LOOPT DWARS DOOR DE SET en is daarom per bron vastgelegd. De
   * waveguide en de pod definiëren hun eigen diffractie, dus T en M zijn in de
   * Koan geldig zonder transformatie; de twee woofers en de poort zitten in de
   * kast en zijn getransformeerd.
   */
  it('elke bron verklaart zichzelf, en precies drie zijn model-getransformeerd', () => {
    const sources = koanDemoSources(MANIFEST);
    expect(sources.map((s) => s.id)).toEqual(['T', 'M', 'W1', 'W2', 'PORT']);
    const model = sources.filter((s) => s.status === 'model-transformed').map((s) => s.id);
    const meet = sources.filter((s) => s.status === 'meetdata').map((s) => s.id);
    expect(model).toEqual(['W1', 'W2', 'PORT']);
    expect(meet).toEqual(['T', 'M']);
    for (const s of sources) expect(s.statusText.length).toBeGreaterThan(0);
  });

  /** Een derde soort status mag niet stil als meting doorgaan. */
  it('een onbekende status gooit in plaats van te raden', () => {
    expect(() => koanDemoStatusOf('VOORSPELD op gevoel')).toThrow(/onbekende status/);
  });

  /**
   * De wooferweg wordt STRUCTUREEL afgeleid uit de gedeelde last, niet uit de
   * zin in `verification.rule`. Deze claim pint dat de afleiding hetzelfde
   * antwoord geeft als die zin noemt — een kruiscontrole, geen tweede bron.
   */
  it('de wooferweg volgt uit de gedeelde last en komt overeen met de verificatiezin', () => {
    const ids = koanDemoWooferWaySourceIds(MANIFEST);
    expect(ids).toEqual(['W1', 'W2', 'PORT']);
    for (const id of ids) {
      const s = koanDemoSources(MANIFEST).find((x) => x.id === id)!;
      expect(MANIFEST.verification.rule).toContain(s.frd.replace(/\.frd$/, ''));
      expect(s.zma).toBeNull();
    }
    expect(MANIFEST.loads.W_parallel_zma).toBe('woofers_parallel.zma');
  });

  /** Elk bestand dat het manifest noemt bestaat en is leesbaar. */
  it('elk genoemd bestand bestaat, parseert, en deelt één raster', () => {
    const sources = koanDemoSources(MANIFEST);
    const grid = loadKoanDemoResponse(sources[0].frd).freq;
    for (const s of sources) {
      const g = loadKoanDemoResponse(s.frd);
      expect(g.freq.length, `${s.frd}`).toBe(grid.length);
      expect(g.freq[0]).toBeCloseTo(grid[0], 6);
      if (s.zma) expect(loadKoanDemoImpedance(s.zma).freq.length).toBeGreaterThan(0);
    }
    expect(loadKoanDemoImpedance(MANIFEST.loads.W_parallel_zma).freq.length).toBeGreaterThan(0);
    expect(loadKoanDemoResponse(MANIFEST.verification.loader_test_reference).freq.length).toBe(grid.length);
  });
});

describe('M-2 — de vervangregel en de meetbasis', () => {
  /**
   * DE VERVANGREGEL. Deze set blijft niet naast de meetbasis bestaan, en dat
   * staat in het manifest zelf. Zij is hier gepind zodat zij niet stil kan
   * verdwijnen bij een volgende levering.
   */
  it('het manifest zegt dat de eerste Koan-meting deze set vervangt', () => {
    expect(MANIFEST.flags.status).toContain('vervangen door eerste Koan-meting');
    expect(MANIFEST.measured_in).toContain('beide woofers parallel aangedreven');
    expect(MANIFEST.measured_in).toContain('frame-transformatie naar 67.7 L is model');
  });

  /**
   * DE MEETSPANNING ONTBREEKT NOG, en dat is een bevinding en geen vergissing:
   * zonder haar blijft V49 route 2 uit. Het manifest noemt het gevolg zelf.
   */
  it('de onbekende meetspanning staat er met haar gevolg bij', () => {
    expect(MANIFEST.flags.drive_voltage).toContain('ONBEKEND');
    expect(MANIFEST.flags.drive_voltage).toContain('V49 route 2');
    expect(MANIFEST.assumption).toContain('spanning ONBEKEND');
  });

  /**
   * DE MEETBASIS IS NIET AANGERAAKT. Deze set leest uitsluitend uit haar eigen
   * map: geen bestand van casus 1 en geen golden reference. Een fixture die
   * stiekem de meetbasis binnenstapt zou M-1 verplaatsen zonder dat iets
   * faalt, en dat is precies wat M-2 niet doet.
   */
  it('de fixture leest alleen haar eigen map, nooit casus 1 of een golden reference', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, 'koanDemo2026_09.fixture.ts'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/casus1|casus2|golden_refs/);
    expect(code).toContain('KOAN_DEMO_2026_09_NAME');
  });
});

describe('M-2 bevinding — geen enkel bestand stelt een leesbare geldigheid', () => {
  /**
   * DIT IS DE REDEN DAT DE SET GEEN LAADBARE DEMOBUNDEL IS, en zij staat als
   * MEETRESULTAAT vastgelegd in plaats van als zin in een entry. Zou een
   * latere levering wél koppen dragen, dan valt deze claim om, en dat is het
   * moment waarop de set een demoknop kan krijgen.
   */
  it('elk bestand leest absent of unparseable, en geen enkel draagt een mergeblok', () => {
    const files = [
      ...koanDemoSources(MANIFEST).map((s) => s.frd),
      MANIFEST.verification.loader_test_reference,
    ];
    const kinds = new Map<string, string>();
    for (const f of files) {
      const raw = readKoanDemoFile(f);
      kinds.set(f, readGateHeader(raw).kind);
      expect(readMergeBlock(raw), `${f} draagt een mergeblok`).toBeNull();
    }
    for (const [f, kind] of kinds) {
      expect(['absent', 'unparseable'], `${f}: ${kind}`).toContain(kind);
    }
  });

  /**
   * De koppen zijn NIET gerepareerd, en dat is opzet: een `Valid from`
   * terugschrijven in een bestand dat er nooit een droeg is een meting
   * verzinnen (A3h), en op model-getransformeerde data zou het een geldigheid
   * verzinnen voor iets dat geen meting is.
   */
  it('geen bestand draagt een veldnaam die een geldigheid zou stellen', () => {
    for (const s of koanDemoSources(MANIFEST)) {
      const head = readKoanDemoFile(s.frd).slice(0, 4000);
      expect(head, `${s.frd}`).not.toMatch(/^\s*\*?\s*(Valid from|Merge)\s*=/im);
    }
  });
});
