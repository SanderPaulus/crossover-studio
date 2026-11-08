/**
 * GUIDED QUESTION 5 BEFORE ANY DESIGN EXISTS (07-11-2026).
 *
 * The voicing lives on the design, and on a fresh project the first design
 * only arrives with the first run — so the question showed no answers. It now
 * holds the choice (`pendingVoicing`), lets the first run read it, and writes
 * it into the first design that arrives without a voicing of its own.
 * Bronscans on App.tsx (the UI-1 idiom: a unit test cannot say what the app renders).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const APP = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf-8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

describe('guided voicing before the first design', () => {
  it('the answers are always drawn, and the old "come back after the run" sentence is gone', () => {
    expect(APP).not.toContain('The voicing hangs on a design');
    const i = APP.indexOf("{q.kind === 'voicing' && (");
    expect(i).toBeGreaterThan(0);
    expect(APP.slice(i, i + 200)).not.toMatch(/activeDesign \?/);
  });

  it('without a design the choice is held, and the run reads it', () => {
    expect(APP).toMatch(/if \(!activeDesign\) \{\s*setPendingVoicing\(/);
    expect(APP).toContain('(activeDesign ? activeDesign.targetCurve : pendingVoicing ?? undefined)');
  });

  it('the first design without a voicing of its own takes it; a project load clears it', () => {
    expect(APP).toMatch(/d\.id === activeDesign\.id && !d\.targetCurve \? \{ \.\.\.d, targetCurve:/);
    expect(APP).toMatch(/function applyProject\(state: ProjectState\) \{\s*setPendingVoicing\(null\);/);
  });
});

describe('G-11 — guided never stops at the pre-start notice', () => {
  it('both route gates skip the notice in guided, so no entry point can hang on a hidden question', () => {
    const app = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf-8');
    const gates = app.match(/if \(v2Windows && !runOpts\.acknowledgedWindowNotice[^\n]*/g) ?? [];
    expect(gates).toHaveLength(2);
    for (const g of gates) expect(g).toContain("uiMode !== 'guided'");
  });
});
