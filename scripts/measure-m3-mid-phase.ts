/**
 * M-3 — WAT DE HERMERGDE MID VERPLAATST AAN DE NETLISTS DIE ER AL LIGGEN.
 *
 * `npx vite-node scripts/measure-m3-mid-phase.ts` — seconden, GEEN ketenrun en
 * GEEN tune. Schrijft `test-fixtures/casus1_m3_hermeting.json`;
 * `midM3.test.ts` reproduceert elk getal eruit uit een verse meting.
 *
 * ER WORDT NIETS GEREGENEREERD, en dat is de hele vorm van deze sessie. De drie
 * geleverde netlists van het M-2b-corpus worden HERLEZEN op de nieuwe set —
 * dezelfde bestanden, dezelfde poorten, dezelfde budgetten, één meetbestand
 * anders — zodat zichtbaar wordt wat de fasereparatie aan een OORDEEL doet in
 * plaats van aan een zoektocht. Beide helften gaan door `corpusBank`, dus door
 * exact dezelfde instellingen; het enige verschil tussen de kolommen is de set.
 *
 * DE DRIE REFERENTIEFILTERS STAAN ERNAAST als sanity: zij zijn geen kandidaat
 * en bewegen om dezelfde reden mee, en als HUIDIG hier iets anders doet dan de
 * kandidaten is dat een bevinding over de meting en niet over de zoektocht.
 *
 * WAT EEN VERDICT-WISSEL ZOU BETEKENEN: dat een ontwerp onder M-2b werd
 * geleverd en onder M-3 niet meer (of andersom) — dus dat het corpus op de
 * gerepareerde meting niet meer klopt en er geregenereerd moet worden. Het
 * script zegt het hardop en telt het.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrd } from '../src/lib/parsers/frd.ts';
import { corpusBank } from '../src/lib/engine2/casus1Corpora.fixture.ts';
import { loadGolden, type Casus1MeasurementSet } from '../src/lib/engine2/casus1.fixture.ts';
import type { EngineV2Report } from '../src/lib/engine2/report.ts';
import type { GateVerdict } from '../src/lib/engine2/optimizer/gates.ts';
import { MID_M3_FILE, deltaBands, m1MidResponse } from '../src/lib/engine2/midM3.fixture.ts';
import { CASUS1_DIR } from '../src/lib/engine2/koan2026_09.fixture.ts';
import { readFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'test-fixtures', 'casus1_m3_hermeting.json');

/** De set waarop het M-2b-corpus gemeten is, en de set van vandaag. */
const BEFORE: Casus1MeasurementSet = 'koan677';
const AFTER: Casus1MeasurementSet = 'm3';

/** De drie GELEVERDE netlists van het M-2b-corpus, plus de referentiefilters. */
const CANDIDATES = ['KAND_V2_1', 'KAND_V2_2', 'KAND_V2_3'] as const;
const REFERENCES = ['HUIDIG', 'KAND_A', 'KAND_B'] as const;

const r2 = (v: number | null | undefined): number | null =>
  v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(2));
const r3 = (v: number | null | undefined): number | null =>
  v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(3));

interface PairRead {
  pair: string;
  crossingHz: number | null;
  mk: number | null;
  n: number;
  bandHz: [number, number] | null;
}

interface Read {
  pairs: PairRead[];
  rmsDb: number | null;
  windowDb: number | null;
  minZOhm: number | null;
  /** De identiteit van een oordeel is POORT + ONDERWERP: M-C staat er per weg
   *  in, dus alleen op `gate` matchen zou drie rijen op één leggen. */
  verdicts: { gate: string; subject: string; active: boolean; pass: boolean; tolOnly: boolean; value: number | null; limit: number | null }[];
}

const readOf = (rep: EngineV2Report): Read => ({
  pairs: rep.system.phaseTracking.map((p) => ({
    pair: `${p.lower}→${p.upper}`,
    crossingHz: r2(p.crossingHz),
    mk: r2(p.meanAbsDeg),
    n: p.n,
    bandHz: p.bandHz ? [Number(p.bandHz[0].toFixed(1)), Number(p.bandHz[1].toFixed(1))] : null,
  })),
  rmsDb: r3(rep.system.response?.rmsDeviationDb),
  windowDb: r3(rep.system.response?.windowPlusMinusDb),
  minZOhm: r3(rep.metrics.epdr?.minZOhm),
  verdicts: rep.gates.verdicts.map((v: GateVerdict) => ({
    gate: v.gate,
    subject: v.subject,
    active: v.active,
    pass: v.pass,
    tolOnly: v.withinToleranceOnly,
    value: r3(v.value),
    limit: r3(v.limit),
  })),
});

function main(): void {
  const golden = loadGolden();
  const before = corpusBank(golden, BEFORE);
  const after = corpusBank(golden, AFTER);

  console.log('M-3 — de drie geleverde netlists herlezen op de hermergde mid');
  console.log('='.repeat(94));
  console.log(`  vóór = set '${BEFORE}' (M-2b, de mid van M-1)   ná = set '${AFTER}' (M-3, de hermergde mid)`);
  console.log('  GEEN regeneratie: dezelfde bestanden, dezelfde poorten, dezelfde budgetten.\n');

  /* ---- 1. de fasedelta van het MEETBESTAND zelf, als spoor ---- */
  const nieuw = parseFrd(readFileSync(join(CASUS1_DIR, MID_M3_FILE), 'utf8'));
  const oud = m1MidResponse();
  const bands = deltaBands(
    nieuw.freq,
    { spl: nieuw.spl, phase: nieuw.phase },
    { spl: oud.spl, phase: oud.phase },
  );

  /* Het SPOOR: de fase van de mid, oud tegen nieuw, op een handvol punten door
   * de W-M-kruisband. Dit IS wat M-K daar beweegt — de wooferhelft staat stil
   * en het filter is hetzelfde, dus de verandering in |phi_w - phi_m| is de
   * verandering in phi_m. */
  const TRACE_HZ = [20.5, 40, 60, 80, 120, 150, 200, 253, 300, 362, 400, 519, 600, 700, 800, 1000];
  const trace = TRACE_HZ.map((f) => {
    let i = 0;
    for (let k = 0; k < nieuw.freq.length; k++) if (Math.abs(nieuw.freq[k] - f) < Math.abs(nieuw.freq[i] - f)) i = k;
    let d = nieuw.phase[i] - oud.phase[i];
    d = ((((d + 180) % 360) + 360) % 360) - 180;
    return { hz: r2(nieuw.freq[i]), m1_deg: r2(oud.phase[i]), m3_deg: r2(nieuw.phase[i]), delta_deg: r2(d) };
  });

  console.log('DE FASE VAN DE MID, M-1 tegen M-3, door de W-M-kruisband');
  console.log(`  ${'Hz'.padStart(8)}${'M-1 °'.padStart(10)}${'M-3 °'.padStart(10)}${'Δ °'.padStart(9)}  spoor van Δ (1 teken = 2°)`);
  for (const t of trace) {
    const d = t.delta_deg ?? 0;
    const bar = '#'.repeat(Math.min(40, Math.round(Math.abs(d) / 2)));
    console.log(
      `  ${String(t.hz).padStart(8)}${String(t.m1_deg).padStart(10)}${String(t.m3_deg).padStart(10)}` +
        `${String(t.delta_deg).padStart(9)}  ${bar}`,
    );
  }

  /* ---- 2. de netlists ---- */
  const rows: Record<string, { voor: Read; na: Read }> = {};
  const flips: string[] = [];
  const keys = [...CANDIDATES, ...REFERENCES];

  console.log(`\n${'-'.repeat(94)}`);
  console.log('M-K PER PAAR, VÓÓR → NÁ (graden), met de RMS en min |Z| ernaast');
  console.log(
    `  ${'netlist'.padEnd(12)}${'W→M vóór'.padStart(10)}${'W→M ná'.padStart(10)}${'Δ'.padStart(8)}` +
      `${'M→T vóór'.padStart(10)}${'M→T ná'.padStart(10)}${'Δ'.padStart(8)}` +
      `${'RMS vóór'.padStart(10)}${'RMS ná'.padStart(9)}${'min|Z| ná'.padStart(11)}`,
  );

  for (const key of keys) {
    const voor = readOf(before.report(key));
    const na = readOf(after.report(key));
    rows[key] = { voor, na };

    const wmA = voor.pairs.find((p) => p.pair.startsWith('woofer'));
    const wmB = na.pairs.find((p) => p.pair.startsWith('woofer'));
    const mtA = voor.pairs.find((p) => p.pair.startsWith('mid'));
    const mtB = na.pairs.find((p) => p.pair.startsWith('mid'));
    const d = (a: number | null | undefined, b: number | null | undefined): string =>
      a === null || a === undefined || b === null || b === undefined ? '—' : `${b - a >= 0 ? '+' : ''}${(b - a).toFixed(2)}`;

    console.log(
      `  ${key.padEnd(12)}${String(wmA?.mk ?? '—').padStart(10)}${String(wmB?.mk ?? '—').padStart(10)}` +
        `${d(wmA?.mk, wmB?.mk).padStart(8)}` +
        `${String(mtA?.mk ?? '—').padStart(10)}${String(mtB?.mk ?? '—').padStart(10)}` +
        `${d(mtA?.mk, mtB?.mk).padStart(8)}` +
        `${String(voor.rmsDb ?? '—').padStart(10)}${String(na.rmsDb ?? '—').padStart(9)}` +
        `${String(na.minZOhm ?? '—').padStart(11)}`,
    );

    /* ---- 3. wisselt er een oordeel? ---- */
    for (const vb of voor.verdicts) {
      const va = na.verdicts.find((x) => x.gate === vb.gate && x.subject === vb.subject);
      if (!va) {
        flips.push(`${key}: poort ${vb.gate} op ${vb.subject} bestaat ná niet meer`);
        continue;
      }
      const state = (v: typeof vb): string =>
        !v.active ? 'uit' : v.pass ? (v.tolOnly ? 'binnen (alleen op tolerantie)' : 'binnen') : 'BUITEN';
      if (va.active !== vb.active || va.pass !== vb.pass || va.tolOnly !== vb.tolOnly) {
        flips.push(
          `${key}: ${vb.gate} op ${vb.subject} ${state(vb)} → ${state(va)} ` +
            `(waarde ${vb.value} → ${va.value}, grens ${vb.limit})`,
        );
      }
    }
    if (na.verdicts.length !== voor.verdicts.length) {
      flips.push(`${key}: ${voor.verdicts.length} oordelen vóór, ${na.verdicts.length} ná`);
    }
  }

  console.log(`\n${'-'.repeat(94)}`);
  if (flips.length === 0) {
    const n = keys.length;
    const nv = rows[keys[0]].voor.verdicts.length;
    console.log(`GEEN ENKEL OORDEEL WISSELT: ${n} netlists x ${nv} poorten, alle ${n * nv} identiek in actief én in pass.`);
    console.log('Het M-2b-corpus klopt dus nog op de gerepareerde meting en er is niets te regenereren.');
  } else {
    console.log(`LET OP — ${flips.length} OORDEEL(EN) WISSELEN. Dit is de bevinding en de sessie stopt hier voor overleg:`);
    for (const f of flips) console.log(`  ${f}`);
  }

  writeFileSync(
    OUT,
    `${JSON.stringify(
      {
        _wat:
          'M-3 — de drie geleverde netlists van het M-2b-corpus en de drie referentiefilters, herlezen op de ' +
          'hermergde mid. GEEN regeneratie: beide helften door dezelfde corpusBank-instellingen, alleen de ' +
          'meetset verschilt.',
        _hoe: 'npx vite-node scripts/measure-m3-mid-phase.ts',
        _gemeten_op: new Date().toISOString().slice(0, 10),
        voor_set: BEFORE,
        na_set: AFTER,
        fasedelta_meetbestand: {
          per_band: bands.map((b) => ({
            van_Hz: b.from,
            tot_Hz: b.to,
            n: b.n,
            dB_max: Number(b.dbMax.toFixed(4)),
            graden_rms: Number(b.degRms.toFixed(2)),
            graden_max: Number(b.degMax.toFixed(2)),
          })),
          spoor: trace,
        },
        netlists: rows,
        oordeelswissels: flips,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  console.log(`\ngeschreven: ${OUT}`);
}

main();
