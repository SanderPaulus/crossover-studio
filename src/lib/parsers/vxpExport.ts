import type { VxpDriver, VxpPart, VxpPartParam, VxpProject } from './vxp.ts';

/**
 * VituixCAD project (.vxp) WRITER — the exact inverse of `parseVxp`.
 *
 * The whole design already lives as VxpPart[] on VituixCAD's own schematic
 * grid (WIRE coordinates ARE the topology), so exporting is mostly
 * re-serialising what we hold, wrapped in a SPEAKER header with DRIVER blocks
 * that point at the measurement files.
 *
 * Round-trip invariant (regression test): parseVxp(serializeVxp(p)) preserves
 * `p` for every field the parser reads. VituixCAD-only cosmetic fields (symbol
 * placement, optimizer targets, GUIDs) are emitted with sane defaults so the
 * file opens cleanly, but they carry no electrical meaning.
 *
 * MEASURED-PHASE FIDELITY (the point of the tool): the app designs on the real
 * measured phase, which already contains the inter-driver arrival-time Δ. To
 * make VituixCAD see the SAME thing, export with MinimumPhase=False and NO Z /
 * ResponseDelay offset — the timing is in the response files. Adding a delay on
 * top would DOUBLE-COUNT it (see the "VituixCAD Z is not a delay" lesson). The
 * caller sets each driver's `minimumPhase` / `z` / `responseDelay`; this writer
 * only serialises them.
 */

export interface VxpExportOptions {
  /** SPEAKER description text (default empty). */
  description?: string;
  /** Max SPL for the plot header (default 130). */
  splMax?: number;
  /** Directivity angle step in degrees (default 10). */
  angleStep?: number;
  /** Plot frequency range (defaults 300 / 20000). */
  xMin?: number;
  xMax?: number;
  /** Crossover DSP sample rate (default 96000). */
  sampleRate?: number;
  /** ZERO-based slot NUMBER of the active variant (default 0 = CROSSOVER).
   *  <Variant> is the numeric suffix of the active slot tag: CROSSOVER=0,
   *  CROSSOVER1=1, … CROSSOVER7=7. Proven by Sanders 2023 reference file
   *  (<Variant>0</Variant> with all 8 slots full — active slot was CROSSOVER)
   *  and the KOAN fixture (<Variant>2</Variant> → CROSSOVER2). Pointing this
   *  at a slot that is not in the file gives VituixCAD an empty canvas and
   *  "Amount of sources must be one". */
  activeVariant?: number;
}

const esc = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** VituixCAD writes booleans as "True"/"False". */
const bool = (b: boolean): string => (b ? 'True' : 'False');

/** Trim trailing zeros but keep at least an integer form. */
const numStr = (v: number): string => {
  if (!Number.isFinite(v)) return '0';
  // Enough precision for component values (µF/mH) without float noise.
  const s = Number(v.toPrecision(12)).toString();
  return s;
};

// ── Standard parameter templates ──────────────────────────────────────────
// The electrical value(s) come from our part; VituixCAD also wants the
// optimizer bounds and the secondary parasitics. We fill any missing standard
// param with a neutral default so the file is complete and opens without warnings.

interface ParamTemplate {
  name: string;
  unit: string;
  def: number;
  min: number;
  max: number;
}

const PART_PARAMS: Record<string, ParamTemplate[]> = {
  Generator: [
    { name: 'Eg', unit: 'V', def: 2.83, min: 0.01, max: 400 },
    { name: 'Tg', unit: 'us', def: 0, min: -50000, max: 50000 },
    { name: 'Rg', unit: 'Ω', def: 0.001, min: 0.001, max: 1000 },
  ],
  Capacitor: [
    { name: 'C', unit: 'uF', def: 1, min: 0.0001, max: 100000 },
    { name: 'ESR', unit: 'Ω', def: 0.01, min: 0.001, max: 10 },
  ],
  Inductor: [
    { name: 'L', unit: 'mH', def: 1, min: 0.001, max: 100000 },
    { name: 'DCR', unit: 'Ω', def: 0.28, min: 0.01, max: 100 },
    { name: 'Wire', unit: 'mm', def: 1.4, min: 0.1, max: 10 },
    { name: 'Rpar', unit: 'Ω', def: 1000000, min: 1, max: 1000000 },
    { name: 'Cpar', unit: 'uF', def: 0.0001, min: 0.0001, max: 100 },
  ],
  Resistor: [
    { name: 'R', unit: 'Ω', def: 1, min: 0.01, max: 10000000 },
    { name: 'Pow', unit: 'W', def: 10, min: 0.1, max: 1000 },
  ],
  Driver: [
    { name: 'X', unit: 'mm', def: 0, min: -2000, max: 2000 },
    { name: 'Y', unit: 'mm', def: 0, min: -5000, max: 5000 },
    { name: 'Z', unit: 'mm', def: 0, min: -2000, max: 2000 },
    { name: 'R', unit: 'deg', def: 0, min: -180, max: 180 },
    { name: 'T', unit: 'deg', def: 0, min: -180, max: 180 },
  ],
};

/** VituixCAD marks the primary electrical value of C/L/R as optimizable. */
const OPTIMIZE_TRUE = new Set(['C', 'L', 'R']);

/** Merge the part's own params with the standard template for its type, so the
 *  emitted PART is complete (values kept, missing parasitics defaulted). */
function completeParams(type: string, params: readonly VxpPartParam[]): VxpPartParam[] {
  const template = PART_PARAMS[type];
  if (!template) return [...params];
  const byName = new Map(params.map((p) => [p.name, p]));
  return template.map((t) => {
    const existing = byName.get(t.name);
    return existing
      ? { name: t.name, value: existing.value, unit: existing.unit || t.unit }
      : { name: t.name, value: t.def, unit: t.unit };
  });
}

function boundsFor(type: string, name: string): { min: number; max: number } {
  const t = PART_PARAMS[type]?.find((p) => p.name === name);
  return t ? { min: t.min, max: t.max } : { min: 0, max: 1000000 };
}

// ── Emitters ───────────────────────────────────────────────────────────────

function emitParam(type: string, p: VxpPartParam, pi: number): string {
  const { min, max } = boundsFor(type, p.name);
  const optimize = OPTIMIZE_TRUE.has(p.name) && p.name === PART_PARAMS[type]?.[0]?.name;
  return (
    `      <PARAM pi="${pi}">\n` +
    `        <Name>${esc(p.name)}</Name>\n` +
    `        <Value>${numStr(p.value)}</Value>\n` +
    `        <Unit>${esc(p.unit)}</Unit>\n` +
    `        <Optimize>${bool(optimize)}</Optimize>\n` +
    `        <Expression />\n` +
    `        <Min>${numStr(min)}</Min>\n` +
    `        <Max>${numStr(max)}</Max>\n` +
    `        <OptiBlock>False</OptiBlock>\n` +
    `      </PARAM>\n`
  );
}

function emitWire(w: { x: number; y: number }, wi: number): string {
  return `      <WIRE wi="${wi}">\n        <X>${numStr(w.x)}</X>\n        <Y>${numStr(w.y)}</Y>\n      </WIRE>\n`;
}

/**
 * VituixCAD symbols are RIGID: every 2-terminal component (C/L/R/Generator/
 * Driver) occupies exactly SIX grid units between its terminals — CenX/CenY is
 * the exact midpoint, Rotated encodes the axis, the Driver terminal column sits
 * at CenX−1 (verified across every part of the KOAN fixture). VituixCAD
 * reconstructs the symbol from the centre, so a part whose WIRE points span 5
 * or 7 units cannot be placed on its grid: the part is dropped/disconnected,
 * the Generator ends up not connected to any driver, and each driver's
 * calculation fails "Amount of sources must be one" (hence the message twice
 * on a 2-way). Normalize: keep terminal A in place, move terminal B to A+6
 * along the axis, and bridge old-B → new-B with a stub Wire part so the
 * electrical connectivity is untouched.
 */
const RIGID_TYPES = new Set(['Capacitor', 'Inductor', 'Resistor', 'Generator', 'Driver']);
const SYMBOL_SPAN = 6;

function normalizeGeometry(parts: readonly VxpPart[]): VxpPart[] {
  const out: VxpPart[] = [];
  const stubs: VxpPart[] = [];
  for (const p of parts) {
    if (!RIGID_TYPES.has(p.type) || p.wires.length < 2) {
      out.push(p);
      continue;
    }
    const [a, b] = p.wires;
    const vertical = a.x === b.x;
    const horizontal = a.y === b.y;
    if (vertical === horizontal) {
      out.push(p); // diagonal or zero-length: cannot normalize safely
      continue;
    }
    const span = vertical ? b.y - a.y : b.x - a.x;
    if (Math.abs(span) === SYMBOL_SPAN) {
      out.push(p);
      continue;
    }
    const dir = Math.sign(span);
    const t1 = vertical ? { x: a.x, y: a.y + SYMBOL_SPAN * dir } : { x: a.x + SYMBOL_SPAN * dir, y: a.y };
    out.push({ ...p, wires: [{ ...a }, t1, ...p.wires.slice(2)] });
    // Stub keeps old-B's junctions alive (grounds, bus taps, next section).
    stubs.push({ type: 'Wire', params: [], wires: [{ ...b }, t1] });
  }
  return [...out, ...stubs];
}

/** Symbol centre. For rigid parts this must be the EXACT terminal midpoint
 *  (VituixCAD re-derives the terminals from it); Driver sits one column right
 *  of its terminals, Ground one row below its single point. */
function centre(part: VxpPart): { x: number; y: number } {
  const ws = part.wires;
  if (ws.length === 0) return { x: 0, y: 0 };
  if (part.type === 'Ground') return { x: ws[0].x, y: ws[0].y + 1 };
  if (RIGID_TYPES.has(part.type) && ws.length >= 2) {
    const mx = (ws[0].x + ws[1].x) / 2;
    const my = (ws[0].y + ws[1].y) / 2;
    return part.type === 'Driver' ? { x: ws[0].x + 1, y: my } : { x: mx, y: my };
  }
  // Wire parts: VituixCAD uses the bounding-box midpoint, floored.
  const xs = ws.map((w) => w.x);
  const ys = ws.map((w) => w.y);
  return {
    x: Math.floor((Math.min(...xs) + Math.max(...xs)) / 2),
    y: Math.floor((Math.min(...ys) + Math.max(...ys)) / 2),
  };
}

/** VituixCAD PartIDs are strictly one letter + a number (C1, L2, G1, D1). It
 *  parses them for its internal part counters — an id like "G", "D" or the
 *  merge-prefixed "B·C1" breaks its part loader, the part is dropped, and with
 *  the Generator gone the file fails "Amount of sources must be one". */
const VALID_PART_ID = /^[A-Z]\d+$/;
const ID_PREFIX: Record<string, string> = {
  Capacitor: 'C',
  Inductor: 'L',
  Resistor: 'R',
  Driver: 'D',
  Generator: 'G',
};

/** Per-crossover: keep valid PartIDs verbatim, renumber everything else into
 *  VituixCAD's letter+number scheme (first free number per prefix). */
function sanitizedPartIds(parts: readonly VxpPart[]): Map<VxpPart, string | undefined> {
  const used = new Set<string>();
  for (const p of parts)
    if (p.partId !== undefined && VALID_PART_ID.test(p.partId)) used.add(p.partId);
  const next: Record<string, number> = {};
  const out = new Map<VxpPart, string | undefined>();
  for (const p of parts) {
    const prefix = ID_PREFIX[p.type];
    if (!prefix) {
      out.set(p, undefined); // Ground/Wire carry no PartID in VituixCAD files
      continue;
    }
    if (p.partId !== undefined && VALID_PART_ID.test(p.partId)) {
      out.set(p, p.partId);
      continue;
    }
    let n = next[prefix] ?? 1;
    while (used.has(`${prefix}${n}`)) n++;
    next[prefix] = n + 1;
    used.add(`${prefix}${n}`);
    out.set(p, `${prefix}${n}`);
  }
  return out;
}

/** Target blocks VituixCAD stores on every Driver part (optimizer defaults). */
const DRIVER_TARGET =
  `      <DriverTarget>\n` +
  `        <FreqMin>500.0</FreqMin>\n` +
  `        <FreqMax>20000.0</FreqMax>\n` +
  `        <SPL>125.0</SPL>\n` +
  `        <Tilt>0.0</Tilt>\n` +
  `        <DrvN>1</DrvN>\n` +
  `        <Invert>False</Invert>\n` +
  `        <FreeLF>False</FreeLF>\n` +
  `        <FreeHF>False</FreeHF>\n` +
  `        <LPType>Linkwitz-Riley</LPType>\n` +
  `        <LPOrder>2</LPOrder>\n` +
  `        <LPFreq>2000.0</LPFreq>\n` +
  `        <LPQval>0.5</LPQval>\n` +
  `        <LPLinp>False</LPLinp>\n` +
  `      </DriverTarget>\n` +
  `      <FilterTarget>\n` +
  `        <FreqMin>20.0</FreqMin>\n` +
  `        <FreqMax>20000.0</FreqMax>\n` +
  `        <SPL>0.0</SPL>\n` +
  `        <Tilt>0.0</Tilt>\n` +
  `        <DrvN>1</DrvN>\n` +
  `        <Invert>False</Invert>\n` +
  `        <FreeLF>False</FreeLF>\n` +
  `        <FreeHF>False</FreeHF>\n` +
  `      </FilterTarget>\n`;

function emitPart(part: VxpPart, xi: number, partId: string | undefined): string {
  const c = centre(part);
  let s = `    <PART xi="${xi}">\n`;
  s += `      <Type>${esc(part.type)}</Type>\n`;
  s += `      <CenX>${numStr(c.x)}</CenX>\n`;
  s += `      <CenY>${numStr(c.y)}</CenY>\n`;
  if (part.type === 'Driver' && part.model !== undefined) {
    s += `      <Model>${esc(part.model)}</Model>\n`;
  }
  // State flags per type (matching VituixCAD's field set).
  if (part.type === 'Driver') {
    s += `      <Open>${bool(part.open ?? false)}</Open>\n`;
    s += `      <Shorted>${bool(part.shorted ?? false)}</Shorted>\n`;
    s += `      <Muted>False</Muted>\n`;
    s += `      <Hidden>False</Hidden>\n`;
    s += `      <Inverted>${bool(part.inverted ?? false)}</Inverted>\n`;
  } else if (part.type === 'Capacitor' || part.type === 'Inductor' || part.type === 'Resistor') {
    // Rotated encodes the symbol axis: False = horizontal, True = vertical.
    const vertical = part.wires.length >= 2 && part.wires[0].x === part.wires[1].x;
    s += `      <Open>${bool(part.open ?? false)}</Open>\n`;
    s += `      <Shorted>${bool(part.shorted ?? false)}</Shorted>\n`;
    s += `      <Rotated>${bool(vertical)}</Rotated>\n`;
  } else if (part.type === 'Ground') {
    s += `      <Open>${bool(part.open ?? false)}</Open>\n`;
    s += `      <Rotated>False</Rotated>\n`;
  } else if (part.type === 'Wire') {
    s += `      <Open>${bool(part.open ?? false)}</Open>\n`;
  }
  if (partId !== undefined) s += `      <PartID>${esc(partId)}</PartID>\n`;
  s += `      <GUID />\n`;
  if (part.type === 'Driver') s += DRIVER_TARGET;
  const params = completeParams(part.type, part.params);
  params.forEach((p, i) => {
    s += emitParam(part.type, p, i);
  });
  part.wires.forEach((w, i) => {
    s += emitWire(w, i);
  });
  s += `    </PART>\n`;
  return s;
}

function emitDriver(d: VxpDriver, di: number): string {
  let s = `  <DRIVER di="${di}">\n`;
  s += `    <Model>${esc(d.model)}</Model>\n`;
  s += `    <SPL>80</SPL>\n`;
  s += `    <Z>${numStr(d.z)}</Z>\n`;
  s += `    <ExtendedData>False</ExtendedData>\n`;
  s += `    <ResponseDirectory />\n`;
  s += `    <ResponseScale>1</ResponseScale>\n`;
  s += `    <ResponseDelay>${numStr(d.responseDelay)}</ResponseDelay>\n`;
  s += `    <ResponseInvert>${bool(d.inverted)}</ResponseInvert>\n`;
  s += `    <ResponseMute>False</ResponseMute>\n`;
  s += `    <MinimumPhase>${bool(d.minimumPhase)}</MinimumPhase>\n`;
  s += `    <ResponseSmooth>1/24 oct</ResponseSmooth>\n`;
  if (d.impedanceFile ?? d.impedanceFileName) {
    s += `    <ImpedanceFile>${esc(d.impedanceFile ?? d.impedanceFileName!)}</ImpedanceFile>\n`;
  } else {
    s += `    <ImpedanceFile />\n`;
  }
  s += `    <ImpedanceScale>1</ImpedanceScale>\n`;
  d.responses.forEach((r, ri) => {
    s += `    <RESPONSE ri="${ri}">\n`;
    s += `      <FileName>${esc(r.fileName)}</FileName>\n`;
    s += `      <Hor>${numStr(r.hor)}</Hor>\n`;
    s += `      <Ver>${numStr(r.ver)}</Ver>\n`;
    s += `    </RESPONSE>\n`;
  });
  s += `  </DRIVER>\n`;
  return s;
}

export function serializeVxp(project: VxpProject, options: VxpExportOptions = {}): string {
  const {
    description = '',
    splMax = 130,
    angleStep = 10,
    xMin = 300,
    xMax = 20000,
    sampleRate = 96000,
    activeVariant = 0,
  } = options;

  let s = `<?xml version="1.0" encoding="utf-8"?>\n`;
  s += `<!--VituixCAD PROJECT-->\n`;
  s += `<!--Version 2-->\n`;
  s += `<SPEAKER>\n`;
  s += description === '' ? `  <Description />\n` : `  <Description>${esc(description)}</Description>\n`;
  s += `  <ReferenceAngle>0</ReferenceAngle>\n`;
  s += `  <SPLmax>${numStr(splMax)}</SPLmax>\n`;
  s += `  <DualPlane>False</DualPlane>\n`;
  s += `  <KeywordHor>hor</KeywordHor>\n`;
  s += `  <KeywordVer>ver</KeywordVer>\n`;
  s += `  <AngleMultiplier>1</AngleMultiplier>\n`;
  s += `  <XMin>${numStr(xMin)}</XMin>\n`;
  s += `  <XMax>${numStr(xMax)}</XMax>\n`;
  s += `  <Interpolate>True</Interpolate>\n`;
  s += `  <UserAnglesHor />\n`;
  s += `  <UserAnglesVer />\n`;
  s += `  <IntensitySphere>True</IntensitySphere>\n`;
  s += `  <IntensityCylinder>False</IntensityCylinder>\n`;
  s += `  <IncludeHor>True</IncludeHor>\n`;
  s += `  <IncludeVer>False</IncludeVer>\n`;
  s += `  <HalfSpace>False</HalfSpace>\n`;
  // Remaining header fields VituixCAD always writes — emitted with its own
  // defaults (room sim off, targets neutral) so the reader finds the full set.
  s += `  <Corner>False</Corner>\n`;
  s += `  <LiswinDI>True</LiswinDI>\n`;
  s += `  <CTA2034Aweights>True</CTA2034Aweights>\n`;
  s += `  <AngleStep>${numStr(angleStep)}</AngleStep>\n`;
  s += `  <FrontWall>False</FrontWall>\n`;
  s += `  <FrontWallZ>1000</FrontWallZ>\n`;
  s += `  <LeftWall>False</LeftWall>\n`;
  s += `  <LeftWallX>-1000</LeftWallX>\n`;
  s += `  <Ceiling>False</Ceiling>\n`;
  s += `  <CeilingY>1500</CeilingY>\n`;
  s += `  <Floor>False</Floor>\n`;
  s += `  <FloorY>-1000</FloorY>\n`;
  s += `  <Toein>25</Toein>\n`;
  s += `  <AbsorpWall>2</AbsorpWall>\n`;
  s += `  <AbsorpCeil>2</AbsorpCeil>\n`;
  s += `  <AbsorpFloor>2</AbsorpFloor>\n`;
  s += `  <ReferDistance>2000</ReferDistance>\n`;
  s += `  <PlaneRotation>0</PlaneRotation>\n`;
  s += `  <DrvOffsetX>0</DrvOffsetX>\n`;
  s += `  <DrvOffsetY>0</DrvOffsetY>\n`;
  s += `  <AxialTarget>\n`;
  s += `    <FreqMin>500.0</FreqMin>\n`;
  s += `    <FreqMax>12000.0</FreqMax>\n`;
  s += `    <SPL>120.0</SPL>\n`;
  s += `    <Tilt>0.0</Tilt>\n`;
  s += `    <DrvN>1</DrvN>\n`;
  s += `    <Invert>False</Invert>\n`;
  s += `    <FreeLF>False</FreeLF>\n`;
  s += `    <FreeHF>False</FreeHF>\n`;
  s += `  </AxialTarget>\n`;
  s += `  <PowerTarget>\n`;
  s += `    <FreqMin>20.0</FreqMin>\n`;
  s += `    <FreqMax>20000.0</FreqMax>\n`;
  s += `    <SPL>85.0</SPL>\n`;
  s += `    <Tilt>0.0</Tilt>\n`;
  s += `    <DrvN>1</DrvN>\n`;
  s += `    <Invert>False</Invert>\n`;
  s += `    <FreeLF>False</FreeLF>\n`;
  s += `    <FreeHF>False</FreeHF>\n`;
  s += `  </PowerTarget>\n`;

  project.drivers.forEach((d, i) => {
    s += emitDriver(d, i);
  });

  // Crossover slots are keyed CROSSOVER (slot 0), CROSSOVER1 (slot 1), … and
  // <Variant> is the ZERO-BASED slot number of the ACTIVE one. We emit our
  // variants densely from slot 0, so valid values are 0..n-1. Hard learned:
  // writing the count, then a 1-based index, both pointed VituixCAD at a slot
  // that was not in the file → empty canvas + "Amount of sources must be one"
  // (per driver, so the message appeared twice).
  if (project.crossovers.length > 0) {
    const active = Math.min(Math.max(0, Math.round(activeVariant)), project.crossovers.length - 1);
    s += `  <Variant>${active}</Variant>\n`;
  }
  project.crossovers.forEach((xo, i) => {
    const tag = i === 0 ? 'CROSSOVER' : `CROSSOVER${i}`;
    s += `  <${tag}>\n`;
    s += `    <DSP>Analog</DSP>\n`;
    s += `    <SampleRate>${numStr(sampleRate)}</SampleRate>\n`;
    s += `    <DSPSettings />\n`;
    s += `    <DSPTemplate />\n`;
    const placed = normalizeGeometry(xo.parts);
    const ids = sanitizedPartIds(placed);
    placed.forEach((p, pi) => {
      s += emitPart(p, pi, ids.get(p));
    });
    s += `  </${tag}>\n`;
  });

  s += `</SPEAKER>\n`;
  // VituixCAD writes (and its Windows/.NET reader expects) UTF-8 WITH a BOM and
  // CRLF line endings. Emitting LF-only without a BOM made VituixCAD misparse the
  // crossover block (non-ASCII units like Ω) and see zero sources → "Amount of
  // sources must be one". Match the reference file's bytes exactly.
  return '﻿' + s.replace(/\n/g, '\r\n');
}
