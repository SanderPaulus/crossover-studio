/* Where does the 0.00 ohm come from — the synthesis seed, or the tune? */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = process.env.ROOT!;
const lib = (p: string) => join(ROOT, 'src/lib', p);
const { parseFrd } = await import(lib('parsers/frd.ts'));
const { parseZma } = await import(lib('parsers/zma.ts'));
const { logspace, resample, resampleImpedance } = await import(lib('dsp.ts'));
const { designThreeWay } = await import(lib('threeWayDesign.ts'));
const { synthesize } = await import(lib('synthesis.ts'));
const { mergeSynthesizedSchematics } = await import(lib('schematicEdit.ts'));
const { crossoverToNetlist } = await import(lib('vxpNetwork.ts'));
const { busPositions } = await import(lib('netOptimizer.ts'));
const { solveNetwork } = await import(lib('network.ts'));
const D = join(ROOT, 'src/lib/parsers/fixtures/koan-3way');
const grid = logspace(210, 19000, 240);
const banded = (n: string) => { const p = parseFrd(readFileSync(join(D,n),'utf8'));
  const g = resample(p.freq,p.spl,p.phase,grid,{clampEdges:true});
  const f0=p.freq[0], f1=p.freq[p.freq.length-1];
  return { freq: grid, spl: g.spl.map((v:number,i:number)=>(grid[i]<f0||grid[i]>f1?-400:v)), phaseDeg: g.phaseDeg }; };
const w=banded('woofer-pair-hor0.frd'), m=banded('mid-hor0.txt'), t=banded('tweeter-hor0.txt');
const z=(n:string)=>{const zz=parseZma(readFileSync(join(D,n),'utf8'));return resampleImpedance(zz.freq,zz.magnitude,zz.phase,grid).z;};
const driverZ:any={woofer:z('woofers-parallel.zma'),mid:z('mid.zma'),tweeter:z('tweeter.zma')};
const dz:any = designThreeWay({ w,m,t,tAdjust:{offsetMm:0,trimDb:0,inverted:false},midAdjust:{},
  xoLow:514, xoHigh:1849, band:[250,18000], phasePriority:0.5,
  xoLowWindow:[424,622], xoHighWindow:[1849,2121], hpFloorHz:1849, breakupGuard:true,
  eqBandsPerBranch:2, diAnchorHz:{low:1399,high:3149} } as any);
const ALIVE=-300;
const synthOne=(spec:any,resp:any,k:string)=>{const idxs:number[]=[];for(let i=0;i<grid.length;i++) if(resp.spl[i]>ALIVE) idxs.push(i);
  return synthesize(spec, idxs.map(i=>grid[i]), idxs.map(i=>driverZ[k][i]), {mode:'acoustic',phasePriority:0.5,catalogSnap:false,corrections:'lean',leanTargetDb:2.5,driverSplDb:idxs.map(i=>resp.spl[i])} as any);};
const merged = mergeSynthesizedSchematics([
  {components:synthOne(dz.specs.woofer,w,'woofer').components,model:'woofer'},
  {components:synthOne(dz.specs.mid,m,'mid').components,model:'mid'},
  {components:synthOne(dz.specs.tweeter,t,'tweeter').components,model:'tweeter'},
]).parts;
const { netlist } = crossoverToNetlist({name:'seed',parts:[...merged]} as any);
const sol = solveNetwork(netlist, grid, driverZ);
let zmin=Infinity, at=0;
sol.inputZ.forEach((c:any,i:number)=>{const zm=Math.hypot(c.re,c.im); if(zm<zmin){zmin=zm;at=grid[i];}});
console.log(`SEED (synthesised, untuned): Z min ${zmin.toFixed(3)} Ω @ ${at.toFixed(0)} Hz, ${merged.filter((p:any)=>/Resistor|Inductor|Capacitor/.test(p.type)).length} parts`);
const rlc = merged.filter((p:any)=>/Resistor|Inductor|Capacitor/.test(p.type));
// which part carries the short: open each one and see if the minimum lifts
const zminOf=(ps:any[])=>{try{const {netlist}=crossoverToNetlist({name:'x',parts:[...ps]} as any);
  const so=solveNetwork(netlist,grid,driverZ);let mn=Infinity;so.inputZ.forEach((c:any)=>{const v=Math.hypot(c.re,c.im);if(v<mn)mn=v;});return mn;}catch{return NaN;}};
for(const part of rlc){
  const without = merged.filter((q:any)=>q!==part);
  const v = zminOf(without);
  if(v>zmin*3) console.log(`  removing ${part.partId} lifts Z min ${zmin.toFixed(3)} -> ${v.toFixed(3)} Ω`);
}
const posOf = busPositions(merged);
for (const id of ['B·C1','B·L5','B·C6','B·R11']) {
  const pp2 = rlc.find((x:any)=>x.partId===id);
  if (pp2) console.log(`  ${id}: ${posOf(id)} path`);
}
console.log('smallest values:', rlc.map((p:any)=>{const q=p.params.find((x:any)=>['R','L','C'].includes(x.name));return `${p.partId}=${q.name}${q.value}`;}).join(' '));
