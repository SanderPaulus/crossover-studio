// Usage: npx vite-node scripts/sum-check.ts <driver1.frd> <driver2.frd> ... <measured-sum.frd>
import { readFileSync } from 'node:fs';
import { parseFrd } from '../src/lib/parsers/frd.ts';
import { checkPredictedSum } from '../src/lib/sumCheck.ts';
const args = process.argv.slice(2);
if (args.length < 2) { console.error('need N driver files + 1 measured sum'); process.exit(1); }
const files = args.map((f) => parseFrd(readFileSync(f, 'utf8')));
const r = checkPredictedSum(files.slice(0, -1), files[files.length - 1]);
console.log(`band ${r.band[0].toFixed(0)}–${r.band[1].toFixed(0)} Hz`);
console.log(`ΔdB  max ${r.maxAbsDb.toFixed(2)}  rms ${r.rmsDb.toFixed(2)}`);
console.log(`Δdeg max ${r.maxAbsDeg.toFixed(1)}  rms ${r.rmsDeg.toFixed(1)}`);
console.log(r.pass ? 'PASS (<1 dB, <10°)' : 'FAIL');
