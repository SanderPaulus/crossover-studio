/**
 * E-3 — HUIDIG-MT: HUIDIG's MID AND TWEETER BRANCHES AS A TWO-WAY NETLIST.
 *
 * `npx vite-node scripts/derive-casus1b-huidig-mt.ts` — seconds, no tune.
 *
 * Casus 1b is casus 1's mid and tweeter as a TWO-WAY: the same measurements on
 * the other chain, so that a difference between the two routes is a route
 * difference and not a data difference (casebook E-3, step 3). A casus needs a
 * fixed netlist for its class-B references, and casus 1b has no design of its
 * own — so its reference netlist is DERIVED from casus 1's reference filter
 * HUIDIG (`20260822_3-Zopt_adsfilter.json`): the generator, the two feed wires
 * and every part of the mid (`B·`) and tweeter (`C·`) branches, with the woofer
 * branch left out. Deterministic, and the rule is geometric rather than a list
 * of part ids: HUIDIG draws its three branches on three rows (woofer y 6–16,
 * mid y 22–37, tweeter y 43–53) and its generator at x = 3, so a part whose
 * every terminal lies on the woofer row AND right of the generator is a woofer
 * part. The mid branch keeps its high-pass flank (the W-M handover of the
 * three-way, ~360 Hz): on a two-way that is a shelf under the mid's band, and
 * the metrics on this file describe THAT network — a measurement object, not a
 * design (the same status every dated corpus has).
 *
 * Refuses to overwrite: the file is a reference the moment it exists.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deserializeFilter, serializeFilter } from '../src/lib/filterFile.ts';
import { crossoverToNetlist } from '../src/lib/vxpNetwork.ts';
import type { VxpCrossover, VxpPart } from '../src/lib/parsers/vxp.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const CASUS1 = join(HERE, '..', 'test-fixtures', 'casus1');
const CASUS1B = join(HERE, '..', 'test-fixtures', 'casus1b');
/** HUIDIG, as `manifest_en_geometrie.netlists.HUIDIG` of casus 1 names it. */
const SOURCE = '20260822_3-Zopt_adsfilter.json';
const TARGET_NAME = 'HUIDIG-MT';
const TARGET = `${TARGET_NAME}.adsfilter.json`;

/** The woofer row of HUIDIG's schematic (schematic grid units) and the generator column. */
const WOOFER_ROW_MAX_Y = 16;
const GENERATOR_X = 3;

const src = deserializeFilter(readFileSync(join(CASUS1, SOURCE), 'utf-8'));
const isWooferPart = (p: VxpPart): boolean =>
  p.wires.length > 0 &&
  p.wires.every((w) => w.y <= WOOFER_ROW_MAX_Y) &&
  Math.max(...p.wires.map((w) => w.x)) > GENERATOR_X;
const kept = src.parts.filter((p) => !isWooferPart(p));
const dropped = src.parts.filter(isWooferPart);

/* The derived network must build, must carry exactly the two drivers and must
 * solve — a sub-network that quietly lost its feed would be a reference to
 * nothing. */
const { netlist } = crossoverToNetlist({ name: TARGET_NAME, parts: [...kept] } as VxpCrossover);
const drivers = netlist.elements.filter((e) => e.kind === 'driver').map((e) => (e as { model: string }).model).sort();
if (drivers.join(',') !== 'mid,tweeter') throw new Error(`HUIDIG-MT carries drivers ${drivers.join(', ')}; expected mid and tweeter`);
if (dropped.filter((p) => p.type === 'Driver').length !== 1) throw new Error('expected exactly one dropped driver (the woofer)');

const out = join(CASUS1B, TARGET);
if (existsSync(out)) {
  const existing = readFileSync(out, 'utf-8');
  const fresh = serializeFilter({ name: TARGET_NAME, parts: [...kept] });
  if (existing !== fresh) throw new Error(`${TARGET} exists and differs from the derivation — refusing to overwrite a reference`);
  console.log(`${TARGET} already exists and reproduces byte for byte (${kept.length} parts kept, ${dropped.length} woofer parts left out)`);
} else {
  writeFileSync(out, serializeFilter({ name: TARGET_NAME, parts: [...kept] }), 'utf-8');
  console.log(`wrote ${out}: ${kept.length} parts kept, ${dropped.length} woofer parts left out (${dropped.map((p) => p.partId ?? p.type).join(', ')})`);
}
