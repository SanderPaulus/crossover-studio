import { readFileSync } from 'node:fs';
const ROOT = process.env.ROOT!;
const lib = (p: string) => `${ROOT}/src/lib/${p}`;
const { parseFrd } = await import(lib('parsers/frd.ts'));
const { parseZma } = await import(lib('parsers/zma.ts'));
const { logspace, resample, resampleImpedance } = await import(lib('dsp.ts'));
const { withSlotAliasesN } = await import(lib('driverSlots.ts'));
const { crossoverToNetlist } = await import(lib('vxpNetwork.ts'));
const { solveNetwork } = await import(lib('network.ts'));

// --- EPDR, derived here rather than copied ---------------------------------
// Class-B output stage, sine drive, supply just meeting the peak output swing.
//   v(t) = V sin0,  i(t) = (V/|Z|) sin(0 - phi),  p(t) = (V - v) * i on the
//   conducting device.  p = (V^2/|Z|) * (1 - sin0) * sin(0 - phi).
//   For a resistor (phi = 0) the peak is V^2/(4R), so
//       EPDR = |Z| / (4 * max_0[(1 - sin0) sin(0 - phi)]).
// Reduces to EPDR = |Z| at phi = 0 by construction.
const shape = (phiDeg: number) => {
  const phi = (phiDeg * Math.PI) / 180;
  let best = 0;
  for (let d = 0; d < 3600; d++) {
    const th = (d * Math.PI) / 1800;
    const v = (1 - Math.sin(th)) * Math.sin(th - phi);
    if (v > best) best = v;
  }
  return best;
};
const epdrOf = (magOhm: number, phiDeg: number) => magOhm / (4 * shape(phiDeg));

// Check against the published anchor: 4 ohm at 60 degrees is quoted as ~1 ohm.
console.log(`CHECK  4 ohm @  0 deg -> ${epdrOf(4, 0).toFixed(2)} ohm (must be 4.00)`);
console.log(`CHECK  4 ohm @ 60 deg -> ${epdrOf(4, 60).toFixed(2)} ohm (published: ~1)`);
console.log(`CHECK  4 ohm @ 45 deg -> ${epdrOf(4, 45).toFixed(2)} ohm`);
console.log('');

const proj = JSON.parse(readFileSync(process.env.PROJ!, 'utf8'));
const starts = ['woofer','mid','tweeter'].map((k) => parseFrd((proj as any)[k].raw).freq[0]);
const ends = ['woofer','mid','tweeter'].map((k) => { const f = parseFrd((proj as any)[k].raw).freq; return f[f.length-1]; });
const grid = logspace(Math.max(20, Math.min(...starts)), Math.min(20000, Math.max(...ends)), 900);
const zf = (raw: string) => { const z = parseZma(raw); return resampleImpedance(z.freq, z.magnitude, z.phase, grid).z; };
const dz = withSlotAliasesN({ woofer: zf(proj.zByRole.low.raw), mid: zf(proj.zByRole.mid.raw), tweeter: zf(proj.zByRole.high.raw) } as any);

for (const d of proj.design.networkDesigns) {
  const { netlist } = crossoverToNetlist({ name: d.name, parts: d.parts } as any);
  let sol;
  try { sol = solveNetwork(netlist, grid, dz); } catch { console.log(`${d.name.padEnd(18)} not solvable`); continue; }
  let zmin = { v: Infinity, f: 0, phi: 0 }, emin = { v: Infinity, f: 0, phi: 0, mag: 0 };
  for (let i = 0; i < grid.length; i++) {
    const z = sol.inputZ[i];
    const mag = Math.hypot(z.re, z.im);
    const phi = (Math.atan2(z.im, z.re) * 180) / Math.PI;
    if (!Number.isFinite(mag)) continue;
    const e = epdrOf(mag, phi);
    if (mag < zmin.v) zmin = { v: mag, f: grid[i], phi };
    if (e < emin.v) emin = { v: e, f: grid[i], phi, mag };
  }
  console.log(`${d.name.padEnd(18)} |Z|min ${zmin.v.toFixed(2)} @ ${Math.round(zmin.f)} Hz (${zmin.phi.toFixed(0)} deg)   ` +
    `EPDRmin ${emin.v.toFixed(2)} @ ${Math.round(emin.f)} Hz (|Z| ${emin.mag.toFixed(2)}, ${emin.phi.toFixed(0)} deg)   ratio ${(emin.v/zmin.v).toFixed(2)}`);
}
