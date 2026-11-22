/**
 * UI-10 fase 2d — THE MERGE IS THE MEASUREMENT (Sander, 22-11-2026: "we hebben gemeten wat we hebben gemeten
 * toch. ik wil geen simulatie van een grotere kast. ik wil mergen met wat we hebben"). Until then step 2 carried a
 * "Measured object" card: the measured box, the target box, the driver's T/S and two tolerances fed a model
 * limit ("valid for the target from … Hz"), and a choice could CONVERT the low end with that model ratio — a
 * simulation of the bigger box inside a merge of the measurement. The optimizer never read any of it (it reads
 * `Valid from`, the validity of the measurement itself). Gone from the tool; the library stays with its tests.
 * What remains: WHERE it was measured, one optional line of provenance in the file, and the FRONT of that
 * cabinet — the one thing about it the merge reads (the near→far model and the heights).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../components/NfMergeTool.tsx', import.meta.url), 'utf8');
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('UI-10 fase 2d — the merge is the measurement: no target box, no model limit, no conversion', () => {
  it('the tool neither imports nor calls the load-validity model or the low-end conversion', () => {
    expect(code).not.toMatch(/\bloadValidity\b|\bconvertLowEnd\b|\bMeasuredObject\b|\bBoxSpec\b/);
    expect(code).not.toMatch(/obj\.lowEnd|obj\.targetVolume|obj\.fs\b|obj\.vas\b|obj\.tolDb/);
    expect(code).not.toContain("t('Measured object')");
    expect(code).not.toContain("t('Valid for the target')");
    expect(code).not.toContain('nfm-object');
    expect(code).not.toContain("t('target limit')"); // the chart marker of the model limit
  });
  it('the merged file carries no target limit; the only provenance left is an own front, when there is one', () => {
    // Nazorg — V15: WAS a free-text "Measured in" written as provenance (Sander: "waar is dit invoerveld voor
    // nodig?" — nothing read it); IS nothing typed: the note says only that the merge stood on its own front.
    expect(code).not.toMatch(/setObj\(\{ label: v \}\)/);
    expect(code).not.toContain("t('Measured in')");
    expect(code).toMatch(/measuredObjectNote: ownGeometry \? `measured on its own front, \$\{obj\.baffleW\} × \$\{obj\.baffleH\} mm` : null,/);
    expect(code).toMatch(/targetValidFromHz: null,\s*targetValidityNote: null,/);
  });
  it('the only thing about the measured cabinet the merge reads is its front — asked in the cabinet block, with the heights above ITS bottom when it is its own', () => {
    expect(code).toContain("const ownGeometry = obj.baffle === 'own';");
    const block = code.slice(code.indexOf("t('Your cabinet — what the merge needs')"), code.indexOf("t('Optional')", code.indexOf("t('Your cabinet — what the merge needs')")));
    expect(block).toMatch(/<strong>\{t\('Front'\)\}<\/strong>\{' '\}\s*<select value=\{obj\.baffle\}/);
    expect(block).toMatch(/<option value="identical">\{t\('the front of “Your cabinet”'\)\}<\/option>\s*<option value="own">\{t\('its own front'\)\}<\/option>/);
    expect(block).toMatch(/\{ownGeometry && \(\s*<>\s*\{' '\}\s*<Field value=\{obj\.baffleW\}/); // W × H only with its own front
    expect(block).toMatch(/\{!ownGeometry && \(\s*<p className="nfm-abcd">\s*\{t\('front panel'\)\}/); // the project's front only without
    expect(block).toMatch(/const hOwn = ownGeometry \|\| !w;/);
    // the block is no longer hidden behind !ownGeometry: it IS where the own front is typed
    expect(code).not.toMatch(/\{!ownGeometry && \(\s*<div className="nfm-card nfm-cabinet-min">/);
  });
  it('the heights line in step 2 is a readout; the one place to type a height is the cabinet block', () => {
    expect(code).not.toMatch(/ariaLabel=\{t\('height of \{d\} above the object’s bottom'/);
    expect((code.match(/setC\(d\.stem, \{ ownHeight: v \}\)/g) ?? []).length).toBe(1);
  });
});
