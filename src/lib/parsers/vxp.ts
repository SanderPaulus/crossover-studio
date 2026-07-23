import { XMLParser } from 'fast-xml-parser';

/**
 * VituixCAD project (.vxp) parser.
 *
 * A .vxp is XML with a <SPEAKER> root containing <DRIVER> elements (each with
 * a list of <RESPONSE> off-axis measurement files and one impedance file) and
 * one or more crossover variants (<CROSSOVER>, <CROSSOVER1>, ...) made of
 * <PART> elements. We extract the measurement-set mapping and the component
 * inventory; the wiring topology (WIRE coordinates) is deliberately left for
 * the node-editor/MNA phase, where it will be mapped onto our own network
 * model rather than VituixCAD's canvas grid.
 */

export interface VxpResponse {
  fileName: string;
  hor: number; // horizontal off-axis angle, degrees
  ver: number; // vertical off-axis angle, degrees
}

export interface VxpDriver {
  model: string;
  /** True when VituixCAD is set to discard measured phase for this driver. */
  minimumPhase: boolean;
  inverted: boolean;
  responseDelay: number;
  /** Raw path as stored in the project (often absolute, e.g. "Z:\\x.ZMA"). */
  impedanceFile?: string;
  /** Basename of impedanceFile, for matching against locally loaded files. */
  impedanceFileName?: string;
  responses: VxpResponse[];
}

export interface VxpPartParam {
  name: string;
  value: number;
  unit: string;
}

export interface VxpPart {
  type: string; // Capacitor | Inductor | Resistor | Driver | Generator | ...
  partId?: string; // C1, L2, R3, D1, ...
  model?: string; // for Driver parts: which VxpDriver it instantiates
  inverted?: boolean;
  shorted?: boolean;
  open?: boolean;
  /** Editor-only: the component optimizer must keep this part's value. */
  locked?: boolean;
  /** Editor-only: catalog SKU id(s) the snap chose ('SKU' or 'SKU+SKU' for a
   *  stack) — the BOM's authoritative attribution. Verified against the
   *  value on read, so a later manual edit cannot make it lie. */
  catalog?: string;
  params: VxpPartParam[];
  /**
   * Terminal/waypoint coordinates on VituixCAD's schematic grid. Two parts are
   * electrically connected when they share a coordinate (Wire parts union all
   * their points into one net). This is the entire topology encoding.
   */
  wires: { x: number; y: number }[];
}

export interface VxpCrossover {
  name: string; // "CROSSOVER", "CROSSOVER1", ...
  parts: VxpPart[];
}

export interface VxpProject {
  drivers: VxpDriver[];
  crossovers: VxpCrossover[];
}

export class VxpParseError extends Error {}

/** Elements that must always parse as arrays even when a single one occurs. */
const ARRAY_TAGS = new Set(['DRIVER', 'RESPONSE', 'PART', 'PARAM', 'WIRE']);

const asArray = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

/** VituixCAD writes booleans as "True"/"False". */
const asBool = (v: unknown): boolean => String(v).toLowerCase() === 'true';

function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1];
}

export function parseVxp(text: string): VxpProject {
  const parser = new XMLParser({
    ignoreAttributes: true,
    parseTagValue: true,
    isArray: (name) => ARRAY_TAGS.has(name),
  });

  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(text);
  } catch (e) {
    throw new VxpParseError(`Not valid XML: ${e instanceof Error ? e.message : String(e)}`);
  }

  const speaker = doc['SPEAKER'] as Record<string, unknown> | undefined;
  if (!speaker) throw new VxpParseError('No <SPEAKER> root element — not a VituixCAD project file.');

  const drivers = asArray(speaker['DRIVER'] as Record<string, unknown>[]).map(parseDriver);

  // Crossover variants live under keys CROSSOVER, CROSSOVER1, CROSSOVER2, ...
  const crossovers: VxpCrossover[] = Object.keys(speaker)
    .filter((k) => /^CROSSOVER\d*$/.test(k))
    .sort((a, b) => Number(a.slice(9) || -1) - Number(b.slice(9) || -1))
    .map((name) => ({
      name,
      parts: asArray((speaker[name] as Record<string, unknown>)['PART'] as Record<string, unknown>[]).map(
        parsePart,
      ),
    }));

  return { drivers, crossovers };
}

function parseDriver(d: Record<string, unknown>): VxpDriver {
  const impedanceFile = d['ImpedanceFile'] !== undefined && d['ImpedanceFile'] !== ''
    ? String(d['ImpedanceFile'])
    : undefined;

  return {
    model: String(d['Model'] ?? ''),
    minimumPhase: asBool(d['MinimumPhase']),
    inverted: asBool(d['ResponseInvert']),
    responseDelay: Number(d['ResponseDelay'] ?? 0),
    impedanceFile,
    impedanceFileName: impedanceFile ? basename(impedanceFile) : undefined,
    responses: asArray(d['RESPONSE'] as Record<string, unknown>[]).map((r) => ({
      fileName: String(r['FileName'] ?? ''),
      hor: Number(r['Hor'] ?? 0),
      ver: Number(r['Ver'] ?? 0),
    })),
  };
}

function parsePart(p: Record<string, unknown>): VxpPart {
  return {
    type: String(p['Type'] ?? 'Unknown'),
    partId: p['PartID'] !== undefined ? String(p['PartID']) : undefined,
    model: p['Model'] !== undefined ? String(p['Model']) : undefined,
    inverted: p['Inverted'] !== undefined ? asBool(p['Inverted']) : undefined,
    shorted: p['Shorted'] !== undefined ? asBool(p['Shorted']) : undefined,
    open: p['Open'] !== undefined ? asBool(p['Open']) : undefined,
    params: asArray(p['PARAM'] as Record<string, unknown>[]).map((par) => ({
      name: String(par['Name'] ?? ''),
      value: Number(par['Value'] ?? NaN),
      unit: String(par['Unit'] ?? ''),
    })),
    wires: asArray(p['WIRE'] as Record<string, unknown>[]).map((w) => ({
      x: Number(w['X'] ?? NaN),
      y: Number(w['Y'] ?? NaN),
    })),
  };
}
