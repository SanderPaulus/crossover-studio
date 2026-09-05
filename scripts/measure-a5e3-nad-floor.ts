/**
 * A5e.3-VELD — DE ARM MET DE NAD-VLOER: halen de beste drie kandidaten 4,0 Ω,
 * en zo niet, met hoeveel.
 *
 * `A5E3_JOBS=<n> npx vite-node scripts/measure-a5e3-nad-floor.ts [LABEL ...]` —
 * ÉÉN KETENRUN PER LABEL (15–45 min per stuk), `A5E3_JOBS` tegelijk (default 3);
 * `A5E3_ARM=<label>` draait er één (wat het script met zichzelf doet),
 * `A5E3_DRY=1` drukt alleen de payload af, `A5E3_REDO=1` overschrijft.
 * Zonder labels: de DRIE kandidaten van het levende corpus met de laagste RMS
 * op de volle oordeelband (dezelfde meetbank als `measure-a5e3-field.ts`) —
 * "de beste drie" is hier dus een gestelde SELECTIE voor deze arm en geen
 * rangschikking van de shortlist (A5e.1 rangschikt niet; dit script kiest een
 * meetobject en zegt op welk getal).
 *
 * DEZELFDE INSTELLINGEN ALS DE REGENERATIE, met ÉÉN factor verzet: de
 * versterkervloer op de FABRIEKSOPGAVE van de NAD M10 V2 (4,0 Ω minimale
 * belasting, `gestelde_eisen.versterker_nad_min_last_ohm`, de aanvulling van
 * V49) in plaats van de gestelde 2,6 Ω — op alle drie de plaatsen tegelijk
 * waar de vloer reist (`settings.ampMinLoadOhm` voor de barrière en de
 * reparatiepas, `v2.gates.ampMinLoadOhm` voor het oordeel, en de verklaring
 * van de kandidaat). Alles daaromheen — meetset, band, raster, doelcurve,
 * niveauwerkregel, DCR-model, poorten, budgetten, seed — is het object van de
 * generator. Dit is de meting van het laatste hybride-argument: als het
 * passieve veld de fabrieksopgave niet haalt, zegt Y (`floorNeedsSeriesOhm`,
 * V51b) hoeveel serieweerstand op de woofer de vloer zou vragen en of dat
 * überhaupt oplosbaar is, en het geweigerde netwerk zegt waar het minimum zit.
 *
 * Het geweigerde netwerk wordt gevangen met dezelfde observator als
 * `measure-m1-diagnose-arms.ts` (V31 wist het vóór het de worker verlaat).
 * Schrijft per label één JSON in `test-fixtures/casus1_a5e3_nad/` en drukt
 * een samenvattingstabel. Dit script stelt niets en wijzigt niets.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import * as chainModule from '../src/lib/threeWayChain.ts';
import type { Chain3Input, Chain3Result, ChainEngineHooks } from '../src/lib/threeWayChain.ts';
import type { VxpPart } from '../src/lib/parsers/vxp.ts';
import { buildReport, type EngineV2Report } from '../src/lib/engine2/report.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';
import type { GeneratedCandidate } from '../src/lib/engine2/predesign/candidates.ts';
import { handleV2Request, type V2Chain3Payload, type V2Response } from '../src/lib/engine2/optimizer/worker.ts';
import type { GateVerdict } from '../src/lib/engine2/optimizer/gates.ts';
import { judgeResponse } from '../src/lib/engine2/requirements/response.ts';
import { CASUS1_WOOFER_DC_OHM, casus1Files, casus1Filter, casus1Geometry, casus1Manifest, loadGolden } from '../src/lib/engine2/casus1.fixture.ts';
import {
  CASUS1_BUILDABILITY,
  CASUS1_COIL_DCR_SETTINGS,
  CASUS1_CONTINUOUS_POWER_W,
  CASUS1_EXCURSION,
  CASUS1_LEVEL_WORK_SETTINGS,
  CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER,
  CASUS1_TARGET_CURVE,
  CASUS1_V2_BAND_HZ,
  CASUS1_V2_BUDGETS,
  CASUS1_V2_GATES,
  CASUS1_V2_SEED,
  CASUS1_V2_SETTINGS,
  casus1ChainInput,
  casus1Field,
  casus1V2Declaration,
  casus1V2Facts,
} from '../src/lib/engine2/casus1V2.fixture.ts';
import { corpusBank, corpusOf } from '../src/lib/engine2/casus1Corpora.fixture.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', 'test-fixtures', 'casus1_a5e3_nad');
const SELF = fileURLToPath(import.meta.url);
const ONLY = process.env.A5E3_ARM ?? null;
const JOBS = Math.max(1, Number(process.env.A5E3_JOBS ?? 3));
/** Hoeveel kandidaten "de beste drie" zijn — de selectie van deze arm. */
const BEST_N = 3;

const golden = loadGolden();
/** De NAD-vloer, uit haar ENE huis in het manifest; ontbreekt het veld, dan is er geen arm (P6/P4). */
const NAD_FLOOR_OHM: number = (() => {
  const v = (golden.manifest_en_geometrie as unknown as { gestelde_eisen: { versterker_nad_min_last_ohm?: unknown } }).gestelde_eisen.versterker_nad_min_last_ohm;
  if (typeof v !== 'number' || !(v > 0)) throw new Error('het manifest stelt geen versterker_nad_min_last_ohm; deze arm heeft geen vloer om mee te draaien');
  return v;
})();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const geometry = casus1Geometry(golden);
const report: EngineV2Report = buildReport({
  manifest,
  files,
  filter: casus1Filter('HUIDIG', manifest, files, golden),
  geometry,
  settings: {
    ...(CASUS1_CONTINUOUS_POWER_W !== null ? { amplifierPowerW: CASUS1_CONTINUOUS_POWER_W } : {}),
    ...(Object.keys(CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER).length > 0 ? { maxDriveOnFsDbByDriver: { ...CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER } } : {}),
    ...CASUS1_BUILDABILITY,
    ...CASUS1_LEVEL_WORK_SETTINGS,
    orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
    reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
    targetCurve: CASUS1_TARGET_CURVE,
    ...CASUS1_EXCURSION,
    ...CASUS1_COIL_DCR_SETTINGS,
  },
});
const facts = casus1V2Facts(report, manifest, files);
const field = casus1Field(report);
const gridded = casus1ChainInput(manifest, files, golden);

/** De beste drie: de laagste RMS op de volle oordeelband, gemeten door de meetbank op de bevroren bestanden. */
function bestThree(): string[] {
  const live = corpusOf('live');
  const bank = corpusBank(golden, 'merged');
  const scored = live.order
    .map((label) => {
      const key = live.byCandidate.get(label);
      if (!key) return null;
      const rep = bank.report(key);
      const j = rep.analysisGrid && rep.system.sumDb ? judgeResponse(rep.analysisGrid, rep.system.sumDb, CASUS1_TARGET_CURVE, CASUS1_V2_BAND_HZ) : null;
      return { label, key, rms: j?.rmsDeviationDb ?? Infinity };
    })
    .filter((x): x is { label: string; key: string; rms: number } => x !== null)
    .sort((a, b) => a.rms - b.rms);
  console.log('levend corpus op RMS (volle band): ' + scored.map((s) => `${s.key} ${s.rms.toFixed(2)}`).join(', '));
  return scored.slice(0, BEST_N).map((s) => s.label);
}

/** De payload van de generator, met de vloer op de NAD-opgave op de drie plaatsen waar hij reist. */
function payloadFor(c: GeneratedCandidate): V2Chain3Payload {
  const input: Chain3Input = {
    grid: [...gridded.grid],
    w: gridded.w,
    m: gridded.m,
    t: gridded.t,
    driverZ: gridded.driverZ,
    tAdjust: { offsetMm: 0, trimDb: 0, inverted: false },
    midAdjust: {},
    xoLow: c.crossings[0].hz,
    xoHigh: c.crossings[1].hz,
    xoLowRange: c.crossings[0].cageHz,
    xoHighRange: c.crossings[1].cageHz,
    label: c.label,
    settings: {
      ...CASUS1_V2_SETTINGS,
      ampMinLoadOhm: NAD_FLOOR_OHM,
      safety: gridded.safety,
      structureLow: { kind: c.crossings[0].alignment.kind, order: c.crossings[0].alignment.order },
      structureHigh: { kind: c.crossings[1].alignment.kind, order: c.crossings[1].alignment.order },
      xoFloorPairs: c.crossings.map((x) => x.windowHz[0]),
    } as unknown as Chain3Input['settings'],
  };
  const candidate = casus1V2Declaration(c, gridded.safety);
  (candidate.declaration.stated as { ampMinLoadOhm?: number }).ampMinLoadOhm = NAD_FLOOR_OHM;
  return {
    input,
    v2: {
      ...facts,
      gates: { ...CASUS1_V2_GATES, ampMinLoadOhm: NAD_FLOOR_OHM },
      budgets: { ...CASUS1_V2_BUDGETS },
      determinism: { seed: CASUS1_V2_SEED },
      targetCurve: CASUS1_TARGET_CURVE,
      judgeBandHz: CASUS1_V2_BAND_HZ,
      ...(CASUS1_CONTINUOUS_POWER_W !== null ? { amplifierPowerW: CASUS1_CONTINUOUS_POWER_W } : {}),
    },
    candidate,
  };
}

interface Captured {
  seed: VxpPart[] | null;
  result: Chain3Result | null;
}
function observeChain(): Captured {
  const cap: Captured = { seed: null, result: null };
  const original = chainModule.runThreeWayChain;
  const wrapped = (input: Chain3Input, onProgress?: Parameters<typeof chainModule.runThreeWayChain>[1], hooks?: ChainEngineHooks): Chain3Result => {
    const seen: ChainEngineHooks | undefined = hooks
      ? {
          ...hooks,
          ...(hooks.tuneOptionsFor
            ? {
                tuneOptionsFor: (seedParts: readonly VxpPart[]) => {
                  cap.seed = structuredClone([...seedParts]);
                  return hooks.tuneOptionsFor!(seedParts);
                },
              }
            : {}),
        }
      : hooks;
    const r = original(input, onProgress, seen);
    cap.result = structuredClone(r);
    return r;
  };
  const d = Object.getOwnPropertyDescriptor(chainModule, 'runThreeWayChain');
  if (!d || !d.configurable) throw new Error('de keten-export is niet configureerbaar; de observator kan niet gelegd worden');
  Object.defineProperty(chainModule, 'runThreeWayChain', { configurable: true, enumerable: true, get: () => wrapped });
  return cap;
}

interface ArmOutput {
  label: string;
  floorOhm: number;
  seconds: number;
  seedParts: VxpPart[] | null;
  deliveredParts: VxpPart[] | null;
  rejectedParts: VxpPart[] | null;
  refusal: { by: string; kinds: string[]; reason: string } | null;
  gateRefusals: string[];
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  rejectedTune: Record<string, unknown> | null;
  tuned: number;
  evaluations: number;
  worker: { gates: GateVerdict[]; rejection: unknown; levelWork: unknown; disqualified: string[]; notes: string[] };
}

function runArm(label: string): ArmOutput {
  const c = field.field.candidates.find((x) => x.label === label);
  if (!c) throw new Error(`het veld kent geen kandidaat "${label}"`);
  const payload = payloadFor(c);
  const cap = observeChain();
  const t0 = Date.now();
  const collected: unknown[] = [];
  handleV2Request(structuredClone({ id: 1, kind: 'v2Chain3One' as const, payload }), (m: V2Response) => {
    if (m.kind === 'error') throw new Error(m.message);
    if (m.kind === 'done') collected.push(m.data);
  });
  const done = collected[0] as { result: Chain3Result; gates: GateVerdict[]; rejection: unknown; levelWork: unknown; notes: string[] };
  if (!done) throw new Error(`arm ${label} leverde niets`);
  if (!cap.result) throw new Error(`arm ${label}: de observator op runThreeWayChain heeft NIET gevuurd`);
  const r = cap.result;
  const net = r.net as unknown as {
    refusal?: { by: string; kinds: string[]; reason: string };
    rejectedParts?: VxpPart[];
    gateRefusals?: string[];
    rejectedTune?: Record<string, unknown>;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    tuned: number;
    evaluations: number;
  };
  const refused = net.refusal ?? null;
  const rej = done.rejection as { kinds?: string[]; reason?: string } | null;
  const workerRefusedDelivered = !refused && rej !== null && rej !== undefined;
  return {
    label,
    floorOhm: NAD_FLOOR_OHM,
    seconds: (Date.now() - t0) / 1000,
    seedParts: cap.seed,
    deliveredParts: refused || workerRefusedDelivered ? null : [...r.parts],
    rejectedParts: refused ? (net.rejectedParts ?? null) : workerRefusedDelivered ? [...r.parts] : null,
    refusal: refused ? { by: refused.by, kinds: [...refused.kinds], reason: refused.reason } : workerRefusedDelivered ? { by: 'worker', kinds: [...(rej?.kinds ?? [])], reason: rej?.reason ?? '' } : null,
    gateRefusals: [...(net.gateRefusals ?? [])],
    before: net.before,
    after: net.after,
    rejectedTune: net.rejectedTune ?? null,
    tuned: net.tuned,
    evaluations: net.evaluations,
    worker: { gates: done.gates, rejection: done.rejection, levelWork: done.levelWork, disqualified: [...(done.result.disqualified ?? [])], notes: done.notes },
  };
}

const f2 = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : '—');
const fileOf = (label: string) => join(OUT_DIR, `${label.replace(/woofer→mid /, '').replace(/ LR4 · mid→tweeter /, 'x').replace(/ LR4$/, '').replace(/[^0-9A-Za-z.x]/g, '_')}.json`);
function summaryLine(o: ArmOutput): string {
  const floor = o.worker.gates.find((g) => g.gate === 'M-B/|Z|');
  const lw = o.worker.levelWork as { floorNeedsSeriesOhm?: number | null } | null;
  return (
    `  [${o.label}] vloer ${o.floorOhm} Ω — ${o.refusal ? `GEWEIGERD (${o.refusal.kinds.join(',')}): ${o.refusal.reason.slice(0, 140)}` : 'GELEVERD'}` +
    ` | zaad min|Z| ${f2(o.before.zMinOhm)} → tune ${f2((o.rejectedTune ?? o.after).zMinOhm)} Ω` +
    (floor && floor.value !== null ? ` (poort ${f2(floor.value)})` : '') +
    ` | Y ${lw?.floorNeedsSeriesOhm === null || lw?.floorNeedsSeriesOhm === undefined ? 'null' : f2(lw.floorNeedsSeriesOhm)} | rimpel ${f2((o.rejectedTune ?? o.after).rippleDb)} dB | tuned ${o.tuned} | ${o.seconds.toFixed(0)} s`
  );
}

const labels = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ONLY !== null ? [ONLY] : bestThree();

if (process.env.A5E3_DRY === '1') {
  for (const label of labels) {
    const c = field.field.candidates.find((x) => x.label === label);
    if (!c) throw new Error(`het veld kent geen kandidaat "${label}"`);
    const p = payloadFor(c);
    console.log(`[${label}] vloer settings ${(p.input.settings as { ampMinLoadOhm?: number }).ampMinLoadOhm} / gates ${p.v2.gates.ampMinLoadOhm} / verklaring ${(p.candidate!.declaration.stated as { ampMinLoadOhm?: number }).ampMinLoadOhm} · spoel-DCR ${(p.candidate!.declaration.stated as { coilDcrModel?: unknown }).coilDcrModel ? 'model' : 'absent'} · band ${p.v2.judgeBandHz?.map((v) => v.toFixed(1)).join('–')} · xo ${p.input.xoLow}/${p.input.xoHigh}`);
  }
  process.exit(0);
}

if (ONLY !== null) {
  mkdirSync(OUT_DIR, { recursive: true });
  const out = runArm(ONLY);
  writeFileSync(fileOf(ONLY), JSON.stringify(out, null, 1), 'utf-8');
  console.log(summaryLine(out));
  process.exit(0);
}

mkdirSync(OUT_DIR, { recursive: true });
const todo = labels.filter((l) => !existsSync(fileOf(l)) || process.env.A5E3_REDO === '1');
console.log(`NAD-vloer-arm: ${labels.length} kandidaten, ${todo.length} te draaien, ${JOBS} tegelijk; vloer ${NAD_FLOOR_OHM} Ω`);
const t0 = Date.now();
let next = 0;
let finished = 0;
await new Promise<void>((resolve, reject) => {
  /* A5e.3b (c)1 — een lege werklijst spawnt geen enkel kind, dus zonder deze
   * regel wacht de promise eeuwig op een `close` die nooit komt: bij bestaande
   * armbestanden meteen doorvallen naar het lezen en rapporteren hieronder. */
  if (todo.length === 0) {
    resolve();
    return;
  }
  const start = () => {
    if (next >= todo.length) {
      if (finished === todo.length) resolve();
      return;
    }
    const label = todo[next++];
    const child = spawn('npx', ['vite-node', SELF], { cwd: join(HERE, '..'), env: { ...process.env, A5E3_ARM: label, A5E3_JOBS: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (b: Buffer) => (out += b.toString()));
    child.stderr.on('data', (b: Buffer) => (out += b.toString()));
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`arm ${label} faalde (exit ${code}):\n${out}`));
        return;
      }
      finished++;
      for (const line of out.split('\n')) if (line.startsWith('  [')) console.log(line);
      start();
    });
  };
  for (let i = 0; i < Math.min(JOBS, todo.length); i++) start();
});
console.log(`alle armen klaar in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
console.log('');
console.log(`| kandidaat | vloer Ω | uitkomst | zaad min\\|Z\\| Ω | tune min\\|Z\\| Ω | poort M-B/\\|Z\\| Ω | Y (wat de vloer op de woofer vraagt) Ω | rimpel dB | tuned | s |`);
console.log('|---|---|---|---|---|---|---|---|---|---|');
for (const label of labels) {
  const o = JSON.parse(readFileSync(fileOf(label), 'utf-8')) as ArmOutput;
  const floor = o.worker.gates.find((g) => g.gate === 'M-B/|Z|');
  const lw = o.worker.levelWork as { floorNeedsSeriesOhm?: number | null } | null;
  console.log(
    `| ${label.replace(/woofer→mid /, '').replace(/ LR4 · mid→tweeter /, ' · ').replace(/ LR4$/, '')} | ${o.floorOhm} | ${o.refusal ? `geweigerd (${o.refusal.kinds.join(', ')})` : 'geleverd'} | ${f2(o.before.zMinOhm)} | ${f2((o.rejectedTune ?? o.after).zMinOhm)} | ${f2(floor?.value)} | ${lw?.floorNeedsSeriesOhm === null || lw?.floorNeedsSeriesOhm === undefined ? '— (onoplosbaar)' : f2(lw.floorNeedsSeriesOhm)} | ${f2((o.rejectedTune ?? o.after).rippleDb)} | ${o.tuned} | ${o.seconds.toFixed(0)} |`,
  );
}
