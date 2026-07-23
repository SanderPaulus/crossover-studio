import { describe, it, expect } from 'vitest';
import {
  serializeProject,
  deserializeProject,
  ProjectError,
  PROJECT_FORMAT,
  type ProjectState,
} from './project.ts';
import { defaultHpLp, defaultEq } from './filters.ts';

const state: ProjectState = {
  woofer: { name: 'mid.txt', raw: 'Freq[Hz] dBSPL Phase\n100 90 0\n200 91 -10\n' },
  tweeter: { name: 'tweet.txt', raw: '100 80 0\n' },
  impedances: { mid: { name: 'mid.ZMA', raw: '100 8 0\n' } },
  vxp: { name: 'koan.vxp', raw: '<SPEAKER/>' },
  design: {
    vFilters: {
      woofer: { gainDb: 0, hp: defaultHpLp(200), lp: { ...defaultHpLp(2100), enabled: true }, eq: [defaultEq(1000)] },
      tweeter: { gainDb: -4.5, hp: { ...defaultHpLp(3200), enabled: true }, lp: defaultHpLp(20000), eq: [] },
    },
    xoName: 'CROSSOVER1',
    offsetMm: '0',
    trimDb: '-1.5',
    inverted: true,
    fMin: '200',
    fMax: '20000',
    splMin: '',
    splMax: '',
    phasePriority: 65,
    vfEqBands: 4,
  },
};

describe('project persistence', () => {
  it('round-trips everything byte-exact', () => {
    const restored = deserializeProject(serializeProject(state));
    expect(restored).toEqual(state);
  });

  it('round-trips a minimal project (design only)', () => {
    const minimal: ProjectState = { design: state.design };
    const restored = deserializeProject(serializeProject(minimal));
    expect(restored.design).toEqual(state.design);
    expect(restored.woofer).toBeUndefined();
    expect(restored.impedances).toBeUndefined();
  });

  it('rejects non-JSON, foreign JSON and future versions', () => {
    expect(() => deserializeProject('not json {')).toThrow(ProjectError);
    expect(() => deserializeProject('{"some":"other file"}')).toThrow(/format marker/);
    expect(() =>
      deserializeProject(JSON.stringify({ format: PROJECT_FORMAT, version: 999, design: state.design })),
    ).toThrow(/newer/);
  });

  it('rejects a project without design state', () => {
    expect(() =>
      deserializeProject(JSON.stringify({ format: PROJECT_FORMAT, version: 1 })),
    ).toThrow(/no design state/);
  });

  it('drops malformed stored files instead of crashing', () => {
    const doc = JSON.parse(serializeProject(state)) as Record<string, unknown>;
    doc['woofer'] = { name: 42 }; // corrupt
    doc['impedances'] = { mid: 'nope', tweeter: { name: 't.ZMA', raw: 'x' } };
    const restored = deserializeProject(JSON.stringify(doc));
    expect(restored.woofer).toBeUndefined();
    expect(restored.impedances).toEqual({ tweeter: { name: 't.ZMA', raw: 'x' } });
  });
});

describe('angle-file persistence', () => {
  it('round-trips per-driver angle sets', () => {
    const withAngles: ProjectState = {
      ...state,
      angleFiles: {
        woofer: [
          { hor: 0, name: 'mid_hor0.txt', raw: 'a' },
          { hor: 15, name: 'mid_hor15.txt', raw: 'b' },
        ],
        tweeter: [{ hor: 0, name: 'tw_hor0.txt', raw: 'c' }],
      },
    };
    const restored = deserializeProject(serializeProject(withAngles));
    expect(restored.angleFiles).toEqual(withAngles.angleFiles);
  });

  it('drops malformed angle entries and empty sets', () => {
    const doc = JSON.parse(serializeProject(state)) as Record<string, unknown>;
    doc['angleFiles'] = {
      woofer: [{ hor: 'nope', name: 'x', raw: 'y' }, { hor: 30, name: 'ok.txt', raw: 'z' }],
      tweeter: 'garbage',
    };
    const restored = deserializeProject(JSON.stringify(doc));
    expect(restored.angleFiles).toEqual({
      woofer: [{ hor: 30, name: 'ok.txt', raw: 'z' }],
      tweeter: [],
    });
  });
});
