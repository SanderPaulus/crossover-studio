import { readFileSync } from 'node:fs';
const ROOT = process.env.ROOT!;
const lib = (p: string) => `${ROOT}/src/lib/${p}`;
const { parseZma } = await import(lib('parsers/zma.ts'));
const { logspace, resampleImpedance } = await import(lib('dsp.ts'));
const proj = JSON.parse(readFileSync(process.env.PROJ!, 'utf8'));
const grid = logspace(20, 20000, 600);
const zf = (raw: string) => { const z = parseZma(raw); return resampleImpedance(z.freq, z.magnitude, z.phase, grid).z; };
const all: any = { woofer: zf(proj.zByRole.low.raw), mid: zf(proj.zByRole.mid.raw), tweeter: zf(proj.zByRole.high.raw) };
const medZ = (fc: number) => { const zs: number[] = [];
  for (const z of Object.values<any>(all)) for (let i = 0; i < grid.length; i++)
    if (grid[i] >= fc/2 && grid[i] <= fc*2) zs.push(Math.hypot(z[i].re, z[i].im));
  zs.sort((a,b)=>a-b); return zs[Math.floor(zs.length/2)]; };
const SERIES_CEIL_C = 33e-6, MULT_C = 2.488;
const show = (label: string, fc: number) => {
  const R = medZ(fc);
  const tb = 1 / (2 * Math.PI * fc * R);
  const ceil = Math.max(SERIES_CEIL_C, MULT_C * tb);
  console.log(`${label.padEnd(34)} fc ${String(Math.round(fc)).padStart(5)} Hz · mediaan |Z| ${R.toFixed(2)} Ω · textbook ${(tb*1e6).toFixed(1)} µF · PLAFOND ${(ceil*1e6).toFixed(1)} µF`);
};
const xoLow = 535, xoHigh = 1789;
show('gedeeld anker (wat de code doet)', Math.sqrt(xoLow * xoHigh));
show('als het per tak zou gaan: W-M', xoLow);
show('als het per tak zou gaan: M-T', xoHigh);
for (const [v, f] of [[100e-6, Math.sqrt(xoLow*xoHigh)], [120e-6, Math.sqrt(xoLow*xoHigh)]] as [number, number][]) {
  const R = medZ(f), tb = 1/(2*Math.PI*f*R), ceil = Math.max(SERIES_CEIL_C, MULT_C*tb);
  const over = Math.log10(v / ceil);
  console.log(`  ${(v*1e6).toFixed(0)} µF staat ${(v/ceil).toFixed(2)}× boven het plafond → strafterm in de objective: ${(over*over).toFixed(4)}`);
}
