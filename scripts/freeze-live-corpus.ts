/**
 * FREEZE THE LIVE v2 CORPUS UNDER A DATED NAME, BEFORE REGENERATING IT.
 *
 * `npx vite-node scripts/freeze-live-corpus.ts <id> <PREFIX> "<reden>"`
 * e.g.  `... freeze-live-corpus.ts v33 V33-KAND "de barrière las ..."`
 *
 * WHY THIS IS A SCRIPT AND NOT A PARAGRAPH IN THE PROCEDURE. It has been done
 * by hand four times — V28, V30, V32 and V33-sweep — and by hand it is five
 * separate edits that must all land or the case book is inconsistent: copy the
 * netlist files, add their manifest entries, COPY THE CLASS-B BLOCKS, write the
 * corpus block that records which candidate each file came from, and register
 * the reason. Miss the third and `goldenClassification.test.ts` fails; miss the
 * fourth and the pairing survives only in `casus1_v2_herkomst.json`, which the
 * very next regeneration overwrites — which is exactly what
 * `manifest_en_geometrie.v30_corpus` exists to repair after the fact.
 *
 * IT COPIES; IT NEVER MOVES. The live corpus stays exactly where it is, so the
 * repository is consistent at every point and the freeze can be inspected
 * before the expensive regeneration is started. The generator overwrites the
 * live files afterwards.
 *
 * WHAT IT WILL NOT DO is overwrite an existing dated corpus. A second freeze
 * under a name that is already taken would silently replace the evidence half
 * of an older comparison, which is the failure this whole family of dated
 * corpora exists to prevent.
 *
 * ONE THING STAYS MANUAL, deliberately: the `DATED_REASON` entry in
 * `record-casus1-v2-references.ts`. The reason a corpus is kept cannot be
 * derived from it, and the recorder already says so out loud when it is
 * missing. The `reden` argument here goes into the corpus block; the recorder's
 * entry is what the floor-exception bookkeeping reads.
 */

import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', 'test-fixtures');
const CASUS1 = join(FIXTURES, 'casus1');
const GOLDEN = join(FIXTURES, 'golden_refs_casus1.json');

const [id, prefix, reden] = process.argv.slice(2);
if (!id || !prefix || !reden) {
  throw new Error(
    'usage: freeze-live-corpus.ts <id> <FILE-PREFIX> "<reden>"  ' +
      '(e.g. v33 V33-KAND "de barriere las nog ...")',
  );
}

const herkomst = JSON.parse(readFileSync(join(FIXTURES, 'casus1_v2_herkomst.json'), 'utf-8')) as {
  seed: number;
  run_vingerafdruk: string;
  gegenereerd_op_commit: string;
  bestanden: { name: string; label: string }[];
};

const raw = JSON.parse(readFileSync(GOLDEN, 'utf-8')) as {
  manifest_en_geometrie: { netlists: Record<string, string> } & Record<string, unknown>;
  kandidaten: Record<string, unknown>;
};
const netlists = raw.manifest_en_geometrie.netlists;

const block = `${id}_corpus`;
if (raw.manifest_en_geometrie[block] !== undefined) {
  throw new Error(`${block} already exists — refusing to overwrite a frozen corpus`);
}

const bestanden: { naam: string; was: string; kandidaat: string }[] = [];
for (let i = 0; i < herkomst.bestanden.length; i++) {
  const src = herkomst.bestanden[i];
  const wasKey = src.name.replace(/-/g, '_');
  const n = i + 1;
  const file = `${prefix}-${n}.adsfilter.json`;
  const key = `${prefix.replace(/-/g, '_')}_${n}`;
  if (existsSync(join(CASUS1, file))) throw new Error(`${file} already exists — refusing`);
  if (netlists[key] !== undefined) throw new Error(`${key} already in the manifest — refusing`);
  copyFileSync(join(CASUS1, `${src.name}.adsfilter.json`), join(CASUS1, file));
  netlists[key] = file;
  /* THE CLASS-B BLOCK TRAVELS WITH THE FILE. A dated netlist the case book
   * names and nothing classifies is exactly the hole V33 found in
   * `goldenClassification.test.ts` — ten blocks, one whole delivery. */
  const refs = raw.kandidaten[wasKey];
  if (refs === undefined) throw new Error(`${wasKey} has no reference block to carry over`);
  raw.kandidaten[key] = JSON.parse(JSON.stringify(refs));
  bestanden.push({ naam: key, was: wasKey, kandidaat: src.label });
}

const commit = (() => {
  try {
    return execSync('git rev-parse HEAD', { cwd: join(HERE, '..') }).toString().trim();
  } catch {
    return 'unknown';
  }
})();

raw.manifest_en_geometrie[block] = {
  _:
    `HET GEDATEERDE ${prefix.replace(/-KAND$/, '')}-CORPUS, met de kandidaat waar elke netlist ` +
    'vandaan kwam. Zelfde reden als de andere gedateerde corpora: de koppeling bestandsnaam ↔ ' +
    'kandidaat stond alleen in casus1_v2_herkomst.json, en dat bestand wordt door de volgende ' +
    'regeneratie overschreven. DOCUMENTATIE, geen acceptatiewaarde.',
  reden,
  seed: herkomst.seed,
  run_vingerafdruk: herkomst.run_vingerafdruk,
  gegenereerd_op_commit: herkomst.gegenereerd_op_commit,
  bevroren_op_commit: commit,
  bestanden,
};

writeFileSync(GOLDEN, `${JSON.stringify(raw, null, 1)}\n`);
console.log(`froze ${bestanden.length} netlists as ${prefix}-* (${block})`);
for (const b of bestanden) console.log(`  ${b.was} -> ${b.naam}  (${b.kandidaat})`);
