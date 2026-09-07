/**
 * E-4 — THE CATALOGUE SNAP AND THE COPPER THE SEARCH DESIGNED WITH.
 *
 * THE FINDING THIS TEST STANDS ON. Since A5e.3 the v2 search designs with the
 * DCR of a family the DESIGNER stated: `refreshDcr` gives every free coil the
 * resistance its family has at its inductance, and every gate, inversion and
 * inventory reads that same number. The catalogue snap, which runs AFTER the
 * tune, carried a ceiling that predates all of it — `branchDcrBudgetOhms`,
 * from the branch driver's own minimum |Z| against the source-resistance tier,
 * split over the branch's coils by L^0.65. Two answers to one question, and
 * LP-1 measured the consequence in the browser: casus 1's stated 1.4 mm and
 * 1.0 mm air cores put 1.82 Ω of honest copper on the series path against a
 * 0.39 Ω branch budget, and the snap REFUSED a network the search had been
 * told to build with exactly that wire.
 *
 * FOUR CLAIMS.
 *
 *  1. THE BRANCH BUDGET REFUSES THE DESIGN'S OWN WIRE. On the live corpus,
 *     coils whose family the project states carry more copper than the branch
 *     budget allows them. Without this the repair has no subject.
 *  2. THE FAMILY CEILING ADMITS IT, and admits a real SKU: for every such coil
 *     `pickCandidates` under the family ceiling returns a part of that family
 *     whose DCR is inside the ceiling. The design becomes buildable, which is
 *     the whole point.
 *  3. IT IS NOT A BLANK CHEQUE. The family ceiling still refuses a coil of the
 *     WRONG gauge — a thinner-wire family at the same inductance. A ceiling
 *     that admitted anything would be the branch budget's opposite defect.
 *  4. P2/P4. Absent, the ceiling is the one it always was, and the declaration
 *     says why rather than stating `'branch'` on nobody's behalf.
 *
 * COST: no chain run and no tune. Netlists off disk, the v8 catalogue, and the
 * two ceilings as functions.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deserializeCatalog } from '../../catalogFile.ts';
import { branchDcrBudgetOhms, catalogParts, pickCandidates, setCustomSeries, type CatalogPart } from '../../catalog.ts';
import { catalogFamilyOf, dcrOf, fitCoilDcrFamilies, snapDcrCeilingOhm, waysOfElements } from '../../coilDcr.ts';
import { deserializeFilter } from '../../filterFile.ts';
import { crossoverToNetlist } from '../../vxpNetwork.ts';
import { CASUS1_DIR, loadGolden } from '../casus1.fixture.ts';
import { CASUS1_COIL_FAMILY_BY_DRIVER } from '../casus1V2.fixture.ts';
import { declareCandidateChoices } from './candidateDeclaration.ts';
import type { VxpCrossover, VxpPart } from '../../parsers/vxp.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const V8 = join(HERE, '..', '..', 'parsers', 'fixtures', 'gemini-catalog-v8.json');
const golden = loadGolden();
const netlists = (golden.manifest_en_geometrie as unknown as { netlists: Record<string, string> }).netlists;

const imported = deserializeCatalog(readFileSync(V8, 'utf-8'));
const fits = fitCoilDcrFamilies(imported.parts);
const fitById = new Map(fits.map((f) => [f.family, f]));

/** The LIVE corpus — the netlists a regeneration replaces, and the ones a snap
 *  would be asked to build today. */
const LIVE = Object.keys(netlists).filter((k) => /^KAND_V2_\d+$/.test(k));

const partsOf = (key: string): VxpPart[] =>
  deserializeFilter(readFileSync(join(CASUS1_DIR, netlists[key]), 'utf-8')).parts;

/** Every coil of a netlist with the way it feeds and the family that way states. */
interface Coil {
  netlist: string;
  id: string;
  henry: number;
  dcrOhm: number;
  way: string;
  family: string;
}
const coilsOf = (key: string): Coil[] => {
  const parts = partsOf(key);
  const { netlist } = crossoverToNetlist({ name: key, parts: [...parts] } as VxpCrossover);
  const ways = waysOfElements(netlist);
  const out: Coil[] = [];
  for (const p of parts) {
    if (p.type !== 'Inductor' || p.partId === undefined) continue;
    const henry = (p.params.find((q) => q.name === 'L')?.value ?? 0) * 1e-3; // mH → H
    const dcr = p.params.find((q) => q.name === 'DCR')?.value ?? 0;
    if (!(henry > 0) || !(dcr > 0)) continue;
    const models = ways.get(p.partId) ?? [];
    // The way whose family this coil was stamped with — the lowest-DCR one,
    // exactly as `stampCoilDcr` chooses it for a shared coil.
    let way: string | null = null;
    let best = Infinity;
    for (const m of models) {
      const f = fitById.get(CASUS1_COIL_FAMILY_BY_DRIVER[m] ?? '');
      if (!f) continue;
      const r = dcrOf(henry, f);
      if (r && r.ohm < best) { best = r.ohm; way = m; }
    }
    if (way === null) continue;
    out.push({ netlist: key, id: p.partId, henry, dcrOhm: dcr, way, family: CASUS1_COIL_FAMILY_BY_DRIVER[way]! });
  }
  return out;
};

const ALL: Coil[] = LIVE.flatMap(coilsOf);

/** The v1 ceiling, read at the way's own Re-like minimum |Z| and the tier the
 *  v2 route states. Split proportionally, as `dcrCeilFor` does — approximated
 *  here by the WHOLE branch budget, which is the LOOSEST the split can be:
 *  a coil over this is over its own share too. */
const branchCeil = (): number => branchDcrBudgetOhms(3.17, 1.0); // P6-OK: the case book's measured woofer-pair minimum |Z|, and the v1 source tier

describe('E-4 — the snap ceiling on the v2 route', () => {
  it('the corpus exists and every coil of it has a stated family', () => {
    expect(LIVE.length).toBeGreaterThan(0);
    expect(ALL.length).toBeGreaterThan(LIVE.length); // more than one coil each
    for (const c of ALL) expect(fitById.get(c.family), `${c.netlist}/${c.id}: ${c.family}`).toBeTruthy();
  });

  it('1 — the BRANCH budget refuses copper the search was told to design with', () => {
    /* The subject of the repair. Without a coil over the branch budget, "the
     * family ceiling admits it" would be a claim about nothing. */
    const budget = branchCeil();
    const over = ALL.filter((c) => c.dcrOhm > budget);
    expect(over.length, `no live coil exceeds the ${budget.toFixed(2)} Ω branch budget`).toBeGreaterThan(0);
    // ...and they are honest fit values, not stray params: each is what its own
    // family predicts at its own inductance.
    for (const c of over) {
      const f = fitById.get(c.family)!;
      const r = dcrOf(c.henry, f)!;
      expect(Math.abs(c.dcrOhm - r.ohm) / r.ohm, `${c.netlist}/${c.id}`).toBeLessThan(0.02);
    }
  });

  it('2 — the FAMILY ceiling admits it, and a real SKU with it', () => {
    setCustomSeries([], imported.parts);
    try {
      let checked = 0;
      for (const c of ALL) {
        const f = fitById.get(c.family)!;
        const ceil = snapDcrCeilingOhm(c.henry, f);
        expect(ceil, `${c.netlist}/${c.id}`).not.toBeNull();
        expect(c.dcrOhm, `${c.netlist}/${c.id}: designed with ${c.dcrOhm} Ω against ${ceil} Ω`).toBeLessThanOrEqual(ceil! * 1.02);
        /* A ceiling nothing can meet is a refusal with extra steps: ask the
         * catalogue for the part, inside the family, under the ceiling. */
        const only = (p: CatalogPart) => catalogFamilyOf(p) === c.family;
        const picks = pickCandidates('L', c.henry, 3, null, 'series', ceil!, only);
        expect(picks.length, `${c.netlist}/${c.id}: no SKU under the family ceiling`).toBeGreaterThan(0);
        checked++;
      }
      // A loop over an empty list passes silently, which is how a guard rots.
      expect(checked).toBe(ALL.length);
      expect(checked).toBeGreaterThan(0);
    } finally {
      setCustomSeries([], catalogParts());
    }
  });

  it('3 — and it still refuses the WRONG gauge, so it is not a blank cheque', () => {
    /* The counter-proof. The ceiling describes ONE family; a thinner wire at
     * the same inductance has more copper and must not slip through on the
     * strength of a fat family's residual. */
    const fat = fitById.get('jantzen|air core wire coil|1.4')!;
    const thin = fitById.get('jantzen|air core wire coil|0.7')!;
    const henry = 3e-3;
    const ceil = snapDcrCeilingOhm(henry, fat)!;
    expect(dcrOf(henry, thin)!.ohm, 'a 0.7 mm coil should not fit a 1.4 mm ceiling').toBeGreaterThan(ceil);
  });

  it('4 — absent, the snap keeps the ceiling it always had, and says why (P2/P4)', () => {
    const base = {
      cages: [null, null] as readonly (readonly [number, number] | null)[],
      windowFloorsHz: [null, null] as readonly (number | null)[],
      orders: [4, 4],
      stated: {},
    };
    const none = declareCandidateChoices(base as never);
    expect(none.stated.coilSnapDcrCeiling).toBeUndefined();
    const why = none.absent.find((a) => a.key === 'coilSnapDcrCeiling')?.why ?? '';
    expect(why, 'the absence has no reason').toMatch(/branch budget/);
    expect(why).toMatch(/P4|nobody chose it/);
    // An explicit value wins, so the two ceilings can be measured in one commit.
    const stated = declareCandidateChoices({ ...base, stated: { coilSnapDcrCeiling: 'branch' } } as never);
    expect(stated.stated.coilSnapDcrCeiling).toBe('branch');
  });
});
