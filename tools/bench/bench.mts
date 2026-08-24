/**
 * STAP 0 — de meetlat.
 *
 * Zijn project, zijn catalogus, drie VASTE kandidaten, en zijn eigen filter als
 * lat. Eén regel per kandidaat. Elke wijziging hierna wordt hierop gemeten,
 * vóór en ná, en gaat terug als hij niet wint.
 *
 * Alles wat de uitkomst kan verschuiven staat hieronder HARD — grid, band,
 * kandidaten, kooien, instellingen. Een meetlat die meebeweegt met de code die
 * hij moet beoordelen meet niets. Verander hier alleen iets als je bewust een
 * nieuwe lat begint, en schrijf dat dan in de overdracht.
 *
 *   ROOT="$PWD" PROJ=<project.json> CAT=<catalog.json> REF=<x.adsfilter.json> \
 *     npx tsx tools/bench/bench.mts
 *
 * ONLY=<index> draait één kandidaat en print JSON — dat is hoe de bovenliggende
 * run ze parallel uitvoert; niet zelf gebruiken.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { join } from 'node:path';

const ROOT = process.env.ROOT ?? process.cwd();
const PROJ = process.env.PROJ!;
const CAT = process.env.CAT;
const REF = process.env.REF;
const OUT = process.env.OUT;
const ONLY = process.env.ONLY ? Number(process.env.ONLY) : null;

const lib = (p: string) => join(ROOT, 'src/lib', p);
const { parseFrd } = await import(lib('parsers/frd.ts'));
const { parseZma } = await import(lib('parsers/zma.ts'));
const { logspace, resample, resampleImpedance } = await import(lib('dsp.ts'));
const { withSlotAliasesN } = await import(lib('driverSlots.ts'));
const { runThreeWayChain, rankChain3Results } = await import(lib('threeWayChain.ts'));
const { optimizeNetworkValues } = await import(lib('netOptimizer.ts'));
const { sourceResistanceOhm } = await import(lib('partAudit.ts'));
const { bomFor, setCustomSeries } = await import(lib('catalog.ts'));
const { deserializeCatalog } = await import(lib('catalogFile.ts'));
const { deserializeFilter } = await import(lib('filterFile.ts'));

// ---- PINNED ---------------------------------------------------------------
const GRID = logspace(200, 19000, 240);
const BAND: [number, number] = [455, 16000];   // zijn geldigheidsband (gate)
const SILENT = -400;
const SETTINGS = {
  phasePriority: 0.5,
  targets: { rippleDb: 2.5, phaseDeg: 15 },
  eqBands: 2,
  breakupGuard: true,
  directivityWeight: 0.25,
  ampTarget: 'onAxis' as const,
  phaseMetric: 'band' as const,
  synthMode: 'acoustic' as const,
  catalogSnap: true,
  ampMinLoadOhm: 3.2,
  rSourceDisqualifyOhm: 2.0,
  hpFloorHz: 1849,
  xoFloorPairs: [200, 1849],
  diAnchorHz: { low: 1399, high: 3149 },
  band: BAND,
};
/** Drie vaste kandidaten in het gebied waar zijn scan leeft (W-M 200–622, M-T 1849–2432). */
const CANDS: { xoLow: number; xoHigh: number; lo: [number, number]; hi: [number, number] }[] = [
  { xoLow: 400, xoHigh: 2100, lo: [340, 460], hi: [1900, 2300] },
  { xoLow: 455, xoHigh: 2432, lo: [400, 520], hi: [2200, 2600] },
  { xoLow: 500, xoHigh: 1900, lo: [440, 570], hi: [1750, 2100] },
];
const JUDGE = { low: { floorHz: 200, ceilHz: 622 }, high: { floorHz: 1849, ceilHz: 3149 } };
// ---------------------------------------------------------------------------

const proj = JSON.parse(readFileSync(PROJ, 'utf8'));
const banded = (raw: string) => {
  const p = parseFrd(raw);
  const g = resample(p.freq, p.spl, p.phase, GRID, { clampEdges: true });
  const f0 = p.freq[0], f1 = p.freq[p.freq.length - 1];
  return { freq: GRID, spl: g.spl.map((v: number, i: number) => (GRID[i] < f0 || GRID[i] > f1 ? SILENT : v)), phaseDeg: g.phaseDeg };
};
const w = banded(proj.woofer.raw), m = banded(proj.mid.raw), t = banded(proj.tweeter.raw);
const zOf = (raw: string) => { const z = parseZma(raw); return resampleImpedance(z.freq, z.magnitude, z.phase, GRID).z; };
const driverZ = withSlotAliasesN({ woofer: zOf(proj.zByRole.low.raw), mid: zOf(proj.zByRole.mid.raw), tweeter: zOf(proj.zByRole.high.raw) } as any);
const angleSet = (role: 'woofer' | 'mid' | 'tweeter') => {
  const files = proj.angleFiles?.[role === 'woofer' ? 'woofer' : role];
  if (!Array.isArray(files) || files.length === 0) return null;
  return files.map((f: any) => ({ hor: Number(f.angleDeg ?? f.hor ?? 0), response: banded(f.raw) }));
};
const aw = angleSet('woofer'), am = angleSet('mid'), at = angleSet('tweeter');
const angleData = aw && am && at ? { woofer: aw, mid: am, tweeter: at } : undefined;

if (CAT) {
  // Accepteert het geëxporteerde catalogusbestand ÉN een localStorage-dump
  // waarin datzelfde bestand als string onder `catalog` zit.
  let text = readFileSync(CAT, 'utf8');
  try { const outer = JSON.parse(text); if (outer && typeof outer.catalog === 'string') text = outer.catalog; } catch { /* gewoon een catalogusbestand */ }
  const c = deserializeCatalog(text);
  setCustomSeries(c.series, c.parts ?? []);
}

const inputFor = (i: number) => ({
  grid: [...GRID], w, m, t, driverZ, angleData,
  tAdjust: { offsetMm: 0, trimDb: 0, inverted: false }, midAdjust: {},
  xoLow: CANDS[i].xoLow, xoHigh: CANDS[i].xoHigh,
  xoLowRange: CANDS[i].lo, xoHighRange: CANDS[i].hi,
  judgeWindows: JUDGE,
  label: `W-M ${CANDS[i].xoLow} · M-T ${CANDS[i].xoHigh}`,
  settings: { ...SETTINGS, safety: { freqs: GRID, w, t, m, z: driverZ } },
});
const row = (r: any) => ({
  label: r.label, avg: r.net.after.avgDevDb ?? null, peak: r.net.after.rippleDb,
  phase: r.net.after.pairPhaseDeg?.length ? Math.max(...r.net.after.pairPhaseDeg) : r.net.after.phaseDeg,
  pairs: r.net.after.pairPhaseDeg ?? null, zmin: r.net.after.zMinOhm ?? null,
  rs: r.net.after.rSourceOhm ?? r.net.audit?.rSourceOhm ?? null, parts: r.parts.filter((p: any) => /^(Resistor|Inductor|Capacitor)$/.test(p.type)).length,
  bom: r.bomTotalEur, xo: r.net.after.xoHzPairs ?? null, dq: r.disqualified ?? null,
  // Wat de SYNTHESE de tuner aanreikt. De tuner behoudt eerder dan hij redt,
  // dus dit getal is het plafond van al het latere werk (B1).
  seedZ: r.net.before.zMinOhm ?? null,
  seedPeak: r.net.before.rippleDb ?? null,
  // Wat de part-audit ZAG en DEED — zonder dit is "geen verschil" niet te
  // onderscheiden van "de audit draaide niet".
  audit: r.net.audit ? {
    entries: r.net.audit.entries.length,
    inert: r.net.audit.entries.filter((e: any) => e.verdict === 'inert').length,
    earned: r.net.audit.entries.filter((e: any) => e.verdict === 'earned').length,
    grey: r.net.audit.entries.filter((e: any) => e.verdict === 'grey').length,
    applied: r.net.audit.entries.filter((e: any) => e.applied).length,
    appliedIds: r.net.audit.entries.filter((e: any) => e.applied).map((e: any) => e.ids.join('+')),
  } : null,
});

if (ONLY !== null) {
  const t0 = Date.now();
  const r = runThreeWayChain(inputFor(ONLY));
  process.stdout.write('@@' + JSON.stringify({ ...row(r), secs: (Date.now() - t0) / 1000 }) + '@@');
  process.exit(0);
}

// ---- de lat: zijn eigen filter door DEZELFDE pijplijn ----------------------
let ref: any = null;
if (REF) {
  const f = deserializeFilter(readFileSync(REF, 'utf8'));
  const rlc = f.parts.filter((p: any) => /^(Resistor|Inductor|Capacitor)$/.test(p.type));
  // maxIterations 1 + alleen `before` lezen: de tuner kan de getallen niet raken.
  const r = optimizeNetworkValues(
    f.parts.map((p: any, i: number) => (i === f.parts.indexOf(rlc[rlc.length - 1]) ? { ...p, locked: false } : p)),
    GRID, w, t, driverZ, { offsetMm: 0, trimDb: 0, inverted: false },
    { ...SETTINGS, midBranch: { response: m, adjust: {} }, maxIterations: 1, catalogSnap: false, staged: undefined, audit: { enabled: false },
      safety: { freqs: GRID, w, t, m, z: driverZ } } as any,
  );
  ref = { label: f.name, avg: r.before.avgDevDb ?? null, peak: r.before.rippleDb,
    phase: r.before.pairPhaseDeg?.length ? Math.max(...r.before.pairPhaseDeg) : r.before.phaseDeg,
    pairs: r.before.pairPhaseDeg ?? null, zmin: r.before.zMinOhm ?? null,
    rs: sourceResistanceOhm(f.parts, { grid: GRID, driverZ, fbHz: Number(proj.cabinet?.drivers?.low?.fbHz) || undefined }),
    parts: rlc.length, bom: bomFor(f.parts).totalEur };
}

// ---- kandidaten, parallel -------------------------------------------------
if (process.env.SKIPCANDS) {
  console.log(ref ? JSON.stringify(ref, null, 1) : 'geen REF opgegeven');
  process.exit(0);
}
const t0 = Date.now();
const runs = CANDS.map((_, i) => new Promise<any>((res, rej) => {
  execFile('npx', ['tsx', join(ROOT, 'tools/bench/bench.mts')],
    { env: { ...process.env, ONLY: String(i) }, maxBuffer: 64 * 1024 * 1024 },
    (err, stdout) => {
      if (err) return rej(new Error(`kandidaat ${i}: ${err.message}`));
      const mm = /@@(.*)@@/s.exec(stdout);
      if (!mm) return rej(new Error(`kandidaat ${i}: geen resultaat`));
      res(JSON.parse(mm[1]));
    });
}));
const rows = await Promise.all(runs);
const wall = (Date.now() - t0) / 1000;

const f2 = (v: number | null, d = 2) => (v === null || !Number.isFinite(v) ? '   —' : v.toFixed(d));
const line = (r: any) =>
  `${String(r.label).padEnd(22)} ${f2(r.avg).padStart(6)} ${f2(r.peak).padStart(7)} ${f2(r.phase, 1).padStart(7)} ` +
  `${f2(r.zmin).padStart(6)} ${f2(r.rs).padStart(6)} ${String(r.parts).padStart(6)} ${(r.bom === null ? '—' : '€' + Math.round(r.bom)).padStart(7)}` +
  `${r.dq?.length ? '  ✗ ' + r.dq : ''}`;
console.log('');
console.log(`${'ontwerp'.padEnd(22)} ${'avg'.padStart(6)} ${'piek'.padStart(7)} ${'fase'.padStart(7)} ${'Zmin'.padStart(6)} ${'Rbron'.padStart(6)} ${'parts'.padStart(6)} ${'BOM'.padStart(7)}`);
console.log('─'.repeat(87));
if (ref) { console.log(line(ref) + '   ◆ de lat'); console.log('─'.repeat(87)); }
for (const r of rows) console.log(line(r));
console.log('');
console.log(`grid ${GRID.length} pt · band ${BAND[0]}–${BAND[1]} Hz · eq ${SETTINGS.eqBands} · snap ${SETTINGS.catalogSnap} · amp ${SETTINGS.ampMinLoadOhm} Ω · ${wall.toFixed(0)}s wandklok`);
if (OUT) writeFileSync(OUT, JSON.stringify({ pinned: { grid: GRID.length, band: BAND, cands: CANDS, settings: SETTINGS }, ref, rows, wall }, null, 1));
