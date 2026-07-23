import type { VxpCrossover, VxpPart } from './parsers/vxp.ts';
import type { SynthesizedComponent } from './synthesis.ts';

/**
 * Render a synthesised branch as a schematic: map the ladder that
 * `synthesize()` built (its component roles encode the topology) onto the
 * VxpCrossover shape our Schematic component already draws.
 *
 * Layout: generator on the left, one top bus, series parts marching right,
 * shunt parts (and notch L-C-R chains) dropping to ground, driver at the end.
 * This is the "a schematic rolls out" step — the editable node editor
 * (step 6) will build on exactly this representation.
 */

const XSTEP = 7; // grid units per series element
const YBUS = 6;
const YSHUNT = 13; // bottom of a plain shunt part

const unitParam = (c: SynthesizedComponent) => {
  switch (c.kind) {
    case 'C':
      return { name: 'C', value: c.value * 1e6, unit: 'uF' };
    case 'L':
      return { name: 'L', value: c.value * 1e3, unit: 'mH' };
    case 'R':
      return { name: 'R', value: c.value, unit: 'Ω' };
  }
};

const round3 = (v: number) => Number(v.toPrecision(3));

function part(
  type: 'Capacitor' | 'Inductor' | 'Resistor',
  c: SynthesizedComponent,
  wires: { x: number; y: number }[],
): VxpPart {
  const p = unitParam(c);
  return {
    type,
    partId: c.id,
    params: [
      { name: p.name, value: round3(p.value), unit: p.unit },
      // Catalog-snap: the simulated DCR/ESR travels into the schematic.
      ...(c.seriesR !== undefined && c.kind !== 'R'
        ? [{ name: c.kind === 'L' ? 'DCR' : 'ESR', value: round3(c.seriesR), unit: 'Ω' }]
        : []),
    ],
    wires,
  };
}

const TYPE: Record<SynthesizedComponent['kind'], 'Capacitor' | 'Inductor' | 'Resistor'> = {
  C: 'Capacitor',
  L: 'Inductor',
  R: 'Resistor',
};

export function synthesizedToSchematic(
  components: readonly SynthesizedComponent[],
  driverModel: string,
): VxpCrossover {
  const parts: VxpPart[] = [];
  let x = 3;

  // Generator column.
  parts.push({
    type: 'Generator',
    partId: 'G',
    params: [{ name: 'Eg', value: 2.83, unit: 'V' }],
    wires: [
      { x, y: YBUS },
      { x, y: YSHUNT },
    ],
  });
  parts.push({ type: 'Ground', params: [], wires: [{ x, y: YSHUNT }] });

  // Walk the ladder in synthesis order; roles encode series/shunt/notch.
  // Multiple shunt branches on one electrical node are spread out with short
  // bus wires — same node, readable drawing. Six columns apart: at four the
  // value labels of adjacent vertical parts overlapped (Sanders screenshot).
  let nodeHasShunt = false;
  const spreadShunt = () => {
    if (!nodeHasShunt) {
      nodeHasShunt = true;
      return;
    }
    parts.push({
      type: 'Wire',
      params: [],
      wires: [
        { x, y: YBUS },
        { x: x + 6, y: YBUS },
      ],
    });
    x += 6;
  };

  let i = 0;
  while (i < components.length) {
    const c = components[i];
    // Zobel: R—C chain from the bus to ground at the current node.
    if (c.role.includes('Zobel') && components[i + 1]?.role.includes('Zobel')) {
      spreadShunt();
      const [r, cap] = [components[i], components[i + 1]];
      parts.push(part(TYPE[r.kind], r, [{ x, y: YBUS }, { x, y: YBUS + 5 }]));
      parts.push(part(TYPE[cap.kind], cap, [{ x, y: YBUS + 5 }, { x, y: YBUS + 10 }]));
      parts.push({ type: 'Ground', params: [], wires: [{ x, y: YBUS + 10 }] });
      i += 2;
      continue;
    }
    // Shelf pad: series R with its bypass element drawn as a loop above it.
    if (c.role.includes('pad R') && components[i + 1]?.role.includes('bypass')) {
      const bypass = components[i + 1];
      const yTop = YBUS - 4;
      parts.push(
        part(TYPE[c.kind], c, [
          { x, y: YBUS },
          { x: x + XSTEP, y: YBUS },
        ]),
      );
      parts.push({ type: 'Wire', params: [], wires: [{ x, y: YBUS }, { x, y: yTop }] });
      parts.push(
        part(TYPE[bypass.kind], bypass, [
          { x, y: yTop },
          { x: x + XSTEP, y: yTop },
        ]),
      );
      parts.push({
        type: 'Wire',
        params: [],
        wires: [
          { x: x + XSTEP, y: yTop },
          { x: x + XSTEP, y: YBUS },
        ],
      });
      x += XSTEP;
      nodeHasShunt = false;
      i += 2;
      continue;
    }
    if (c.role.startsWith('notch')) {
      // L—C—R chain from the bus to ground at the current node.
      spreadShunt();
      const [l, cap, r] = [components[i], components[i + 1], components[i + 2]];
      parts.push(part(TYPE[l.kind], l, [{ x, y: YBUS }, { x, y: YBUS + 5 }]));
      parts.push(part(TYPE[cap.kind], cap, [{ x, y: YBUS + 5 }, { x, y: YBUS + 10 }]));
      parts.push(part(TYPE[r.kind], r, [{ x, y: YBUS + 10 }, { x, y: YBUS + 15 }]));
      parts.push({ type: 'Ground', params: [], wires: [{ x, y: YBUS + 15 }] });
      i += 3;
      continue;
    }
    if (c.role.includes('series')) {
      parts.push(
        part(TYPE[c.kind], c, [
          { x, y: YBUS },
          { x: x + XSTEP, y: YBUS },
        ]),
      );
      x += XSTEP;
      nodeHasShunt = false;
    } else {
      // Plain shunt to ground at the current node.
      spreadShunt();
      parts.push(part(TYPE[c.kind], c, [{ x, y: YBUS }, { x, y: YSHUNT }]));
      parts.push({ type: 'Ground', params: [], wires: [{ x, y: YSHUNT }] });
    }
    i++;
  }

  // Driver at the end of the bus.
  x += XSTEP;
  parts.push({
    type: 'Wire',
    params: [],
    wires: [
      { x: x - XSTEP, y: YBUS },
      { x, y: YBUS },
    ],
  });
  parts.push({
    type: 'Driver',
    partId: 'D',
    model: driverModel,
    inverted: false,
    params: [],
    wires: [
      { x, y: YBUS },
      { x, y: YSHUNT },
    ],
  });
  parts.push({ type: 'Ground', params: [], wires: [{ x, y: YSHUNT }] });

  return { name: `Synthesized (${driverModel})`, parts };
}
