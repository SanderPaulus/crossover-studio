/**
 * U-3 — BUILD THE TWO-WAY DEMO BUNDLE OUT OF CASUS 1b.
 *
 * Seconds, no chain run and no tune. Same form as the resampling that made the
 * three-way demo (E-2's provenance line is the model): read casus 1's own
 * measurement files, resample onto a log grid small enough to ship, and write
 * the ORIGINAL header comments back verbatim with one line added saying where
 * the file came from and what was done to it.
 *
 * WHY VERBATIM IS THE WHOLE POINT. The two-way demo shipped twelve bare
 * three-column files with no header at all, so `readGateHeader` answered
 * `absent` on every one of them, so `refuseIfUnverified` refused the run: a
 * demo that blocks its own route. Writing a window back into a file that never
 * carried one would be inventing a measurement (A3h). Casus 1's files DO carry
 * theirs — an ARTA window on the gated tweeter and the 30° mid, an M-1 merge
 * block on the merged mid — so the fix is to ship those files, and the one
 * rule this script must not break is that it copies their headers and does not
 * compose them.
 *
 * The impedances are casus 1's binary LIMP sweeps, converted to ZMA text by
 * the app's own converter (`limToZmaText`) exactly as the import boundary does
 * it — a binary file cannot live in an autosave.
 *
 * Run: npx vite-node scripts/build-demo2way.ts
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrd } from '../src/lib/parsers/frd.ts';
import { parseTabular } from '../src/lib/parsers/tabular.ts';
import { parseLim, limToZmaText } from '../src/lib/parsers/lim.ts';
import { logspace, resample } from '../src/lib/dsp.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'test-fixtures', 'casus1');
const OUT = join(ROOT, 'src', 'lib', 'parsers', 'fixtures', 'koan-2way');

/** The three-way demo's own grid sizes, kept so the two bundles weigh the same. */
const FAR_POINTS = 500;
const NEAR_POINTS = 250;
/** The near-field grid of the three-way demo, Hz — it must cover the splice band. */
const NEAR_HZ: [number, number] = [10, 2000];

/** Wrap to (−180, 180] — the form every ARTA export and both demo bundles use. */
function wrapDeg(d: number): number {
  let x = ((d + 180) % 360 + 360) % 360 - 180;
  if (x === -180) x = 180;
  return x;
}

interface Job {
  src: string;
  out: string;
  title: string;
  points: number;
  /** Explicit grid, or the file's own extent. */
  hz?: [number, number];
}

const FAR: Job[] = [
  {
    src: 'Koan_M_merged.frd',
    out: 'mid-merged-hor0.frd',
    title: 'KOAN 2951 2-way demo — midrange on axis, NF/FF merged (M-1), mic 1 m',
    points: FAR_POINTS,
  },
  {
    src: 'mid_hor_30.txt',
    out: 'mid-hor30.txt',
    title: 'KOAN 2951 2-way demo — midrange 30° horizontal, gated, mic 1 m',
    points: FAR_POINTS,
  },
  {
    src: 'tweeter_hor_0.txt',
    out: 'tweeter-hor0.txt',
    title: 'KOAN 2951 2-way demo — tweeter 0° horizontal, gated, mic 1 m',
    points: FAR_POINTS,
  },
];

const NEAR: Job[] = [
  {
    src: 'mid_near.txt',
    out: 'mid-near.txt',
    title: 'KOAN 2951 2-way demo — near field, midrange cone',
    points: NEAR_POINTS,
    hz: NEAR_HZ,
  },
];

function build(job: Job): { file: string; points: number; hz: [number, number]; headerLines: number } {
  const text = readFileSync(join(SRC, job.src), 'utf-8');
  const frd = parseFrd(text);
  const { comments } = parseTabular(text);
  const lo = job.hz ? job.hz[0] : frd.freq[0];
  const hi = job.hz ? job.hz[1] : frd.freq[frd.freq.length - 1];
  if (lo < frd.freq[0] || hi > frd.freq[frd.freq.length - 1]) {
    throw new Error(`${job.src}: grid ${lo}–${hi} Hz leaves the measurement ${frd.freq[0]}–${frd.freq[frd.freq.length - 1]} Hz`);
  }
  const grid = logspace(lo, hi, job.points);
  const g = resample(frd.freq, frd.spl, frd.phase, grid);

  const provenance =
    `* source: ${job.src} (casus 1 / casus 1b, ${frd.freq.length} pts, ` +
    `${frd.freq[0].toFixed(2)}–${frd.freq[frd.freq.length - 1].toFixed(0)} Hz), resampled to a ` +
    `${job.points}-pt log grid ${lo.toFixed(1)}–${hi.toFixed(0)} Hz ` +
    `(dB + unwrapped phase in log-f, then re-wrapped) by scripts/build-demo2way.ts`;

  /* The ORIGINAL header, verbatim and first: the window and the merge block
   * are properties of the measurement and must read exactly as the source
   * states them. Only the title and the provenance line are this script's. */
  const COLUMN_HEADER = 'Freq[Hz]     dBSPL  Phase[Deg]';
  /* One comment is dropped: the source's own COLUMN header, which ARTA writes
   * as a comment and this file writes as the real one. Keeping both would make
   * the file state its columns twice. Everything else is copied. */
  const isColumnHeader = (c: string) => /Freq\s*\[?Hz/i.test(c) && /dB/i.test(c) && /Phase/i.test(c);
  const lines = [
    `* ${job.title}`,
    ...comments.filter((c) => !isColumnHeader(c)).map((c) => (c.startsWith('*') ? c : `* ${c}`)),
    provenance,
    COLUMN_HEADER,
  ];
  for (let i = 0; i < grid.length; i++) {
    lines.push(`${grid[i].toFixed(3)}  ${g.spl[i].toFixed(3)}  ${wrapDeg(g.phaseDeg[i]).toFixed(3)}`);
  }
  writeFileSync(join(OUT, job.out), lines.join('\n') + '\n');
  return { file: job.out, points: grid.length, hz: [lo, hi], headerLines: comments.length };
}

function buildZ(src: string, out: string): { file: string; points: number } {
  const buf = readFileSync(join(SRC, src));
  const z = parseLim(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
  writeFileSync(join(OUT, out), limToZmaText(z, src));
  return { file: out, points: z.freq.length };
}

console.log('U-3 — de tweeweg-demobundel herbouwd uit casus 1b\n');
console.log('  ver veld / nabij veld');
for (const j of [...FAR, ...NEAR]) {
  const r = build(j);
  console.log(`    ${r.file.padEnd(24)} ${String(r.points).padStart(4)} pts  ${r.hz[0].toFixed(1)}–${r.hz[1].toFixed(0)} Hz  (${r.headerLines} headerregels overgenomen)`);
}
console.log('  impedantie');
for (const [src, out] of [['mid.lim', 'mid.zma'], ['tweeter.lim', 'tweeter.zma']] as const) {
  const r = buildZ(src, out);
  console.log(`    ${r.file.padEnd(24)} ${String(r.points).padStart(4)} pts  (uit ${src})`);
}
console.log(`\nGeschreven in ${OUT}`);
