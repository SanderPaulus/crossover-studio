import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseVxp, type VxpProject } from './vxp.ts';
import { serializeVxp } from './vxpExport.ts';

const sample: VxpProject = {
  drivers: [
    {
      model: 'mid',
      minimumPhase: false,
      inverted: false,
      responseDelay: 0,
      z: 0,
      impedanceFile: 'mid.ZMA',
      impedanceFileName: 'mid.ZMA',
      responses: [
        { fileName: 'mid_hor0.txt', hor: 0, ver: 0 },
        { fileName: 'mid_hor30.txt', hor: 30, ver: 0 },
      ],
    },
    {
      model: 'tweeter',
      minimumPhase: false,
      inverted: true,
      responseDelay: 47,
      z: -16.2,
      impedanceFile: 'tweeter.ZMA',
      impedanceFileName: 'tweeter.ZMA',
      responses: [{ fileName: 'tw_hor0.txt', hor: 0, ver: 0 }],
    },
  ],
  crossovers: [
    {
      name: 'CROSSOVER',
      parts: [
        {
          type: 'Generator',
          partId: 'G1',
          params: [
            { name: 'Eg', value: 2.83, unit: 'V' },
            { name: 'Tg', value: 0, unit: 'us' },
            { name: 'Rg', value: 0.001, unit: 'Ω' },
          ],
          wires: [
            { x: 3, y: 6 },
            { x: 3, y: 12 },
          ],
        },
        { type: 'Ground', params: [], wires: [{ x: 3, y: 12 }] },
        {
          type: 'Capacitor',
          partId: 'C1',
          inverted: undefined,
          shorted: false,
          open: false,
          params: [
            { name: 'C', value: 10.4, unit: 'uF' },
            { name: 'ESR', value: 0.01, unit: 'Ω' },
          ],
          wires: [
            { x: 11, y: 6 },
            { x: 17, y: 6 },
          ],
        },
        {
          type: 'Inductor',
          partId: 'L1',
          shorted: false,
          open: false,
          params: [
            { name: 'L', value: 0.704, unit: 'mH' },
            { name: 'DCR', value: 0.28, unit: 'Ω' },
          ],
          wires: [
            { x: 17, y: 12 },
            { x: 17, y: 6 },
          ],
        },
        {
          type: 'Driver',
          partId: 'D1',
          model: 'tweeter',
          inverted: false,
          open: false,
          shorted: false,
          params: [],
          wires: [
            { x: 32, y: 6 },
            { x: 32, y: 12 },
          ],
        },
      ],
    },
  ],
};

interface NormPart {
  type: string;
  partId?: string;
  model?: string;
  inverted: boolean;
  shorted: boolean;
  open: boolean;
  values: Record<string, number>;
  wires: { x: number; y: number }[];
}
interface Norm {
  drivers: unknown[];
  crossovers: { name: string; parts: NormPart[] }[];
}

/** Compare only the fields the parser reads back (drop editor-only extras and
 *  normalise optional-undefined booleans the writer emits as explicit False). */
function normalize(p: VxpProject): Norm {
  return {
    drivers: p.drivers.map((d) => ({
      model: d.model,
      minimumPhase: d.minimumPhase,
      inverted: d.inverted,
      responseDelay: d.responseDelay,
      z: d.z,
      impedanceFileName: d.impedanceFileName,
      responses: d.responses,
    })),
    crossovers: p.crossovers.map((x) => ({
      name: x.name,
      parts: x.parts.map((pt) => ({
        type: pt.type,
        partId: pt.partId,
        model: pt.model,
        inverted: pt.inverted ?? false,
        shorted: pt.shorted ?? false,
        open: pt.open ?? false,
        // The writer completes missing standard params; compare only the
        // electrical values we put in by matching on name.
        values: Object.fromEntries(pt.params.map((pr) => [pr.name, pr.value])),
        wires: pt.wires,
      })),
    })),
  };
}

describe('serializeVxp', () => {
  it('produces XML our own parser reads back (round trip)', () => {
    const xml = serializeVxp(sample);
    const back = parseVxp(xml);

    // Drivers survive.
    expect(back.drivers.map((d) => d.model)).toEqual(['mid', 'tweeter']);
    expect(back.drivers[1].minimumPhase).toBe(false);
    expect(back.drivers[1].inverted).toBe(true);
    expect(back.drivers[1].responseDelay).toBe(47);
    expect(back.drivers[1].z).toBe(-16.2);
    expect(back.drivers[0].responses).toHaveLength(2);
    expect(back.drivers[0].responses[1].hor).toBe(30);
    expect(back.drivers[0].impedanceFileName).toBe('mid.ZMA');

    // Every electrical value we put in comes back on the right part.
    const parts = normalize(back).crossovers[0].parts;
    expect(parts.find((p) => p.partId === 'C1')!.values['C']).toBe(10.4);
    expect(parts.find((p) => p.partId === 'L1')!.values['L']).toBe(0.704);

    // Topology (wires) preserved verbatim.
    expect(normalize(back)).toMatchObject({
      crossovers: [
        {
          name: 'CROSSOVER',
          parts: normalize(sample).crossovers[0].parts.map((p) => ({
            type: p.type,
            wires: p.wires,
          })),
        },
      ],
    });
  });

  it('completes missing standard params so VituixCAD opens the file', () => {
    const xml = serializeVxp(sample);
    const back = parseVxp(xml);
    const cap = back.crossovers[0].parts.find((p) => p.partId === 'C1')!;
    // ESR present; C present.
    expect(cap.params.map((p) => p.name).sort()).toEqual(['C', 'ESR']);
    const ind = back.crossovers[0].parts.find((p) => p.partId === 'L1')!;
    // Missing Wire/Rpar/Cpar were filled in.
    expect(ind.params.map((p) => p.name)).toContain('Wire');
    expect(ind.params.map((p) => p.name)).toContain('Rpar');
  });

  it('keys multiple variants CROSSOVER, CROSSOVER1, … with one Variant count', () => {
    const twoVariants: VxpProject = {
      drivers: sample.drivers,
      crossovers: [
        { name: 'CROSSOVER', parts: sample.crossovers[0].parts },
        { name: 'CROSSOVER', parts: sample.crossovers[0].parts.slice(0, 3) },
      ],
    };
    const xml = serializeVxp(twoVariants);
    // <Variant> is the ZERO-based slot number of the active variant (default 0
    // = CROSSOVER) — proven by Sanders 2023 reference file (<Variant>0</Variant>,
    // all 8 slots full). Pointing at an absent slot gives an empty canvas and
    // "Amount of sources must be one".
    expect(xml).toContain('<Variant>0</Variant>');
    expect((xml.match(/<Variant>/g) ?? []).length).toBe(1);
    expect(xml).toContain('<CROSSOVER>');
    expect(xml).toContain('<CROSSOVER1>');
    const back = parseVxp(xml);
    expect(back.crossovers.map((c) => c.name)).toEqual(['CROSSOVER', 'CROSSOVER1']);
    expect(back.crossovers[1].parts).toHaveLength(3);
  });

  it('clamps the active-variant slot number to the slots actually present', () => {
    const two: VxpProject = {
      drivers: sample.drivers,
      crossovers: [
        { name: 'CROSSOVER', parts: sample.crossovers[0].parts },
        { name: 'CROSSOVER', parts: sample.crossovers[0].parts },
      ],
    };
    expect(serializeVxp(two, { activeVariant: 1 })).toContain('<Variant>1</Variant>');
    expect(serializeVxp(two, { activeVariant: 9 })).toContain('<Variant>1</Variant>');
    expect(serializeVxp(two, { activeVariant: -3 })).toContain('<Variant>0</Variant>');
  });

  it('sanitizes PartIDs into VituixCAD letter+number form (keeps valid ones)', () => {
    // Built/merged networks carry ids like "G", "D" and "B·C1" — VituixCAD's
    // part loader chokes on those, drops the parts, and then fails with
    // "Amount of sources must be one" (the Generator was among the dropped).
    const built: VxpProject = {
      drivers: sample.drivers,
      crossovers: [
        {
          name: 'CROSSOVER',
          parts: [
            { type: 'Generator', partId: 'G', params: [], wires: [{ x: 3, y: 6 }, { x: 3, y: 12 }] },
            { type: 'Capacitor', partId: 'C1', params: [{ name: 'C', value: 10, unit: 'uF' }], wires: [{ x: 5, y: 6 }, { x: 11, y: 6 }] },
            { type: 'Capacitor', partId: 'B·C1', params: [{ name: 'C', value: 4.7, unit: 'uF' }], wires: [{ x: 5, y: 20 }, { x: 11, y: 20 }] },
            { type: 'Driver', partId: 'D', model: 'mid', params: [], wires: [{ x: 12, y: 6 }, { x: 12, y: 12 }] },
            { type: 'Driver', partId: 'B·D', model: 'tweeter', params: [], wires: [{ x: 12, y: 20 }, { x: 12, y: 26 }] },
            { type: 'Wire', params: [], wires: [{ x: 3, y: 6 }, { x: 5, y: 6 }] },
          ],
        },
      ],
    };
    const xml = serializeVxp(built);
    const back = parseVxp(xml);
    const ids = back.crossovers[0].parts.map((p) => p.partId);
    // Valid C1 kept; G/D/B·C1/B·D renumbered into letter+number; Wire has none.
    expect(ids).toEqual(['G1', 'C1', 'C2', 'D1', 'D2', undefined]);
    for (const id of ids) if (id !== undefined) expect(id).toMatch(/^[A-Z]\d+$/);
    // No forbidden characters anywhere in emitted PartIDs.
    expect(xml).not.toContain('·');
  });

  it('normalizes component geometry to the rigid 6-unit symbol span with stub wires', () => {
    // The app's own schematics use 5/7-unit spans; VituixCAD symbols are rigid
    // (terminals exactly 6 apart, centre = midpoint). Un-normalized parts get
    // dropped/disconnected → "Amount of sources must be one" per driver.
    const built: VxpProject = {
      drivers: sample.drivers,
      crossovers: [
        {
          name: 'CROSSOVER',
          parts: [
            // span 7 (generator), 7 (series L), 5 (shunt C), 7 (driver)
            { type: 'Generator', partId: 'G1', params: [], wires: [{ x: 3, y: 6 }, { x: 3, y: 13 }] },
            { type: 'Inductor', partId: 'L1', params: [{ name: 'L', value: 0.5, unit: 'mH' }], wires: [{ x: 3, y: 6 }, { x: 10, y: 6 }] },
            { type: 'Capacitor', partId: 'C1', params: [{ name: 'C', value: 10, unit: 'uF' }], wires: [{ x: 10, y: 6 }, { x: 10, y: 11 }] },
            { type: 'Ground', params: [], wires: [{ x: 10, y: 11 }] },
            { type: 'Driver', partId: 'D1', model: 'mid', params: [], wires: [{ x: 10, y: 6 }, { x: 10, y: 13 }] },
            { type: 'Ground', params: [], wires: [{ x: 3, y: 13 }] },
          ],
        },
      ],
    };
    const back = parseVxp(serializeVxp(built));
    const parts = back.crossovers[0].parts;

    // Every rigid part now spans exactly 6 grid units.
    for (const p of parts) {
      if (!['Capacitor', 'Inductor', 'Resistor', 'Generator', 'Driver'].includes(p.type)) continue;
      const [a, b] = p.wires;
      const span = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      expect(span).toBe(6);
    }
    // 4 rigid parts were off-spec → 4 stub wires appended (plus the 2 grounds).
    expect(parts.filter((p) => p.type === 'Wire')).toHaveLength(4);

    // Connectivity preserved: same-net check via coincident points + wire fusion.
    const key = (w: { x: number; y: number }) => `${w.x},${w.y}`;
    const parent = new Map<string, string>();
    const find = (k: string): string => {
      let cur = k;
      while (parent.get(cur) !== cur) cur = parent.get(cur)!;
      return cur;
    };
    const union = (p1: string, p2: string) => {
      if (!parent.has(p1)) parent.set(p1, p1);
      if (!parent.has(p2)) parent.set(p2, p2);
      parent.set(find(p1), find(p2));
    };
    for (const p of parts) for (const w of p.wires) if (!parent.has(key(w))) parent.set(key(w), key(w));
    for (const p of parts)
      if (p.type === 'Wire') for (let i = 1; i < p.wires.length; i++) union(key(p.wires[0]), key(p.wires[i]));
    const gen = parts.find((p) => p.type === 'Generator')!;
    const l = parts.find((p) => p.type === 'Inductor')!;
    const drv = parts.find((p) => p.type === 'Driver')!;
    const cap = parts.find((p) => p.type === 'Capacitor')!;
    // Generator + → L in; L out ~ Driver hot ~ C top (the old bus node lives on).
    expect(find(key(gen.wires[0]))).toBe(find(key(l.wires[0])));
    expect(find(key(l.wires[1]))).toBe(find(key(drv.wires[0])));
    expect(find(key(cap.wires[0]))).toBe(find(key(drv.wires[0])));
    // Generator − reaches its ground through the stub.
    const grounds = parts.filter((p) => p.type === 'Ground');
    expect(grounds.some((g) => find(key(g.wires[0])) === find(key(gen.wires[1])))).toBe(true);
  });

  it('emits VituixCAD-required part fields (Wire Open flag, Driver targets)', () => {
    const xml = serializeVxp(sample);
    // Driver parts carry the DriverTarget/FilterTarget blocks VituixCAD stores.
    expect(xml).toContain('<DriverTarget>');
    expect(xml).toContain('<FilterTarget>');
    // Header carries the full field set (spot-check the room/target block).
    expect(xml).toContain('<AxialTarget>');
    expect(xml).toContain('<PowerTarget>');
    expect(xml).toContain('<Toein>');
  });

  it('writes a UTF-8 BOM and CRLF line endings (VituixCAD byte-compatibility)', () => {
    const xml = serializeVxp(sample);
    // Leading BOM (U+FEFF) — VituixCAD's Windows reader relies on it to detect
    // UTF-8; without it non-ASCII units (Ω) broke the parse → "sources must be one".
    expect(xml.charCodeAt(0)).toBe(0xfeff);
    expect(xml).toContain('\r\n');
    // No lone LF anywhere (every newline is part of a CRLF pair).
    expect(/[^\r]\n/.test(xml)).toBe(false);
    // Still parses back cleanly (BOM + CRLF tolerated).
    expect(parseVxp(xml).drivers).toHaveLength(2);
  });

  it('escapes XML-special characters in names', () => {
    const xml = serializeVxp({
      drivers: [
        {
          model: 'A & B <mid>',
          minimumPhase: true,
          inverted: false,
          responseDelay: 0,
          z: 0,
          responses: [],
        },
      ],
      crossovers: [],
    });
    expect(xml).toContain('A &amp; B &lt;mid&gt;');
    // And it still parses.
    expect(parseVxp(xml).drivers[0].model).toBe('A & B <mid>');
  });

  it('round-trips the real KOAN project fixture', () => {
    const path = fileURLToPath(new URL('./fixtures/KOAN 2951 Prototype 140826.vxp', import.meta.url));
    const original = parseVxp(readFileSync(path, 'utf-8'));
    const reparsed = parseVxp(serializeVxp(original));
    expect(reparsed.drivers.map((d) => d.model)).toEqual(original.drivers.map((d) => d.model));
    // First crossover variant's component values survive the round trip.
    const vals = (p: VxpProject, i: number) =>
      p.crossovers[i].parts
        .filter((pt) => ['Capacitor', 'Inductor', 'Resistor'].includes(pt.type))
        .map((pt) => pt.params[0]?.value);
    expect(vals(reparsed, 0)).toEqual(vals(original, 0));
    // Topology part-count preserved for every variant.
    expect(reparsed.crossovers.map((c) => c.parts.length)).toEqual(
      original.crossovers.map((c) => c.parts.length),
    );
  });
});
