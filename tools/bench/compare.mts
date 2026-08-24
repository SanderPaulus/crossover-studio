/**
 * Voor/na op twee meetlat-uitkomsten.
 *
 *   npx tsx tools/bench/compare.mts <voor.json> <na.json>
 *
 * Toont per kandidaat de vijf getallen met hun verschil, en zegt WIN/VERLIES
 * per as. Het oordeel blijft van de lezer — dit telt alleen op.
 */
import { readFileSync } from 'node:fs';
const [A, B] = process.argv.slice(2);
const a = JSON.parse(readFileSync(A, 'utf8'));
const b = JSON.parse(readFileSync(B, 'utf8'));

/** Voor élke as: is lager beter? */
const AXES: { key: string; label: string; lowerIsBetter: boolean; d: number; eps: number }[] = [
  { key: 'avg', label: 'avg', lowerIsBetter: true, d: 2, eps: 0.005 },
  { key: 'peak', label: 'piek', lowerIsBetter: true, d: 2, eps: 0.005 },
  { key: 'phase', label: 'fase', lowerIsBetter: true, d: 1, eps: 0.05 },
  { key: 'zmin', label: 'Zmin', lowerIsBetter: false, d: 2, eps: 0.005 },
  { key: 'rs', label: 'Rbron', lowerIsBetter: true, d: 2, eps: 0.005 },
  { key: 'parts', label: 'parts', lowerIsBetter: true, d: 0, eps: 0.5 },
  { key: 'bom', label: 'BOM', lowerIsBetter: true, d: 0, eps: 0.5 },
];

const rowsOf = (x: any) => new Map<string, any>(x.rows.map((r: any) => [r.label, r]));
const ra = rowsOf(a), rb = rowsOf(b);

for (const label of ra.keys()) {
  const x = ra.get(label), y = rb.get(label);
  if (!y) { console.log(`${label}: ontbreekt in de tweede run`); continue; }
  console.log(`\n${label}`);
  for (const ax of AXES) {
    const u = x[ax.key], v = y[ax.key];
    if (u === null || v === null || u === undefined || v === undefined) { console.log(`  ${ax.label.padEnd(6)}     —`); continue; }
    const dv = v - u;
    const same = Math.abs(dv) < ax.eps;
    const better = ax.lowerIsBetter ? dv < 0 : dv > 0;
    const mark = same ? '  =' : better ? ' ↑ beter' : ' ↓ SLECHTER';
    console.log(`  ${ax.label.padEnd(6)} ${u.toFixed(ax.d).padStart(8)} → ${v.toFixed(ax.d).padStart(8)}  ${(same ? '' : (dv > 0 ? '+' : '') + dv.toFixed(ax.d)).padStart(8)}${mark}`);
  }
  const dqA = x.dq?.length ?? 0, dqB = y.dq?.length ?? 0;
  if (dqA !== dqB) console.log(`  status ${dqA ? 'gediskwalificeerd' : 'ok'} → ${dqB ? 'GEDISKWALIFICEERD' : 'ok'}`);
}
if (a.ref && b.ref) {
  const same = AXES.every((ax) => {
    const u = a.ref[ax.key], v = b.ref[ax.key];
    return u === null || v === null || Math.abs(v - u) < ax.eps;
  });
  console.log(`\nde lat: ${same ? 'onveranderd (goed — de referentie mag niet meebewegen)' : 'VERANDERD — de wijziging raakt ook het meten zelf, niet alleen het ontwerpen'}`);
}
console.log(`\nwandklok ${Math.round(a.wall)}s → ${Math.round(b.wall)}s`);
