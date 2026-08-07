import type { VxpPart } from './parsers/vxp.ts';
import type { NetworkDesign } from './project.ts';
import { extractReportPayload } from './report.ts';

/**
 * Filter exchange format: ONE network design (a tab) as a standalone JSON
 * file, so filters travel between projects and people without dragging the
 * whole project (raw measurements) along. Same philosophy as project.ts:
 * format marker + version guard, structural validation on load.
 */

export const FILTER_FORMAT = 'acoustic-design-studio-filter';
export const FILTER_VERSION = 1;

export class FilterFileError extends Error {}

export function serializeFilter(design: Pick<NetworkDesign, 'name' | 'parts'>): string {
  return JSON.stringify(
    {
      format: FILTER_FORMAT,
      version: FILTER_VERSION,
      savedAt: new Date().toISOString(),
      name: design.name,
      parts: design.parts,
    },
    null,
    1,
  );
}

export function deserializeFilter(text: string): { name: string; parts: VxpPart[] } {
  // A DESIGN REPORT is also a filter file (Sanders idea): the printable HTML
  // carries this exact payload in a hidden script block, so one import button
  // accepts both shapes and a report can be mailed, printed, AND loaded back.
  const source = extractReportPayload(text) ?? text;
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(source) as Record<string, unknown>;
  } catch {
    throw new FilterFileError('Not a filter file (expected JSON, or an exported design report).');
  }
  if (d['format'] !== FILTER_FORMAT) {
    throw new FilterFileError('Not a Crossover Studio filter file.');
  }
  if (typeof d['version'] !== 'number' || d['version'] > FILTER_VERSION) {
    throw new FilterFileError(
      `Filter version ${String(d['version'])} is newer than this app understands.`,
    );
  }
  const parts = d['parts'];
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new FilterFileError('Filter file contains no parts.');
  }
  for (const p of parts as Array<Record<string, unknown>>) {
    if (typeof p?.['type'] !== 'string' || !Array.isArray(p?.['wires']) || !Array.isArray(p?.['params'])) {
      throw new FilterFileError('Malformed part entry in filter file.');
    }
  }
  return {
    name: typeof d['name'] === 'string' && d['name'].trim() !== '' ? d['name'] : 'Imported filter',
    parts: parts as VxpPart[],
  };
}
