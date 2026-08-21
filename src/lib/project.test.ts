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

describe('v2 role-keyed storage + v1 migration (phase-4 trede 2b)', () => {
  it('round-trips a 3-way project: mid response, role-keyed Z, mid angles', () => {
    const threeWay: ProjectState = {
      ...state,
      vxp: undefined,
      impedances: undefined,
      mid: { name: 'm15cf.frd', raw: '100 85 0\n' },
      zByRole: {
        low: { name: 'w.zma', raw: '100 8 0\n' },
        mid: { name: 'm.zma', raw: '100 6 0\n' },
        high: { name: 't.zma', raw: '100 5 0\n' },
      },
      angleFiles: {
        woofer: [{ hor: 0, name: 'w0.txt', raw: 'a' }],
        tweeter: [{ hor: 0, name: 't0.txt', raw: 'b' }],
        mid: [{ hor: 15, name: 'm15.txt', raw: 'c' }],
      },
    };
    const restored = deserializeProject(serializeProject(threeWay));
    expect(restored).toEqual(threeWay);
  });

  it("migrates a v1 standalone project: impedances 'mid'/'tweeter' become roles low/high", () => {
    // Hand-built v1 document — the exact shape the old app wrote for a project
    // WITHOUT a vxp: standalone ZMAs lived in `impedances` under the synthesis
    // vocabulary, where 'mid' meant the LOW branch.
    const v1 = JSON.stringify({
      format: PROJECT_FORMAT,
      version: 1,
      woofer: state.woofer,
      tweeter: state.tweeter,
      impedances: {
        mid: { name: 'low.ZMA', raw: '100 8 0\n' },
        tweeter: { name: 'high.ZMA', raw: '100 5 0\n' },
      },
      design: state.design,
    });
    const restored = deserializeProject(v1);
    expect(restored.zByRole).toEqual({
      low: { name: 'low.ZMA', raw: '100 8 0\n' },
      high: { name: 'high.ZMA', raw: '100 5 0\n' },
    });
    expect(restored.impedances).toBeUndefined();
  });

  it('a v1 vxp project is NOT migrated: model-named impedances stay verbatim', () => {
    // A real vxp driver may legitimately be CALLED "mid" (KOAN's is) — those
    // keys are model names, not storage slots, and must never be re-keyed.
    const v1 = JSON.stringify({
      format: PROJECT_FORMAT,
      version: 1,
      woofer: state.woofer,
      tweeter: state.tweeter,
      impedances: { mid: { name: 'mid.ZMA', raw: '100 8 0\n' } },
      vxp: state.vxp,
      design: state.design,
    });
    const restored = deserializeProject(v1);
    expect(restored.impedances).toEqual({ mid: { name: 'mid.ZMA', raw: '100 8 0\n' } });
    expect(restored.zByRole).toBeUndefined();
  });
});

describe('verification measurements (Compare mode)', () => {
  it('round-trips the list + active index and keeps verifyFile as the active one', () => {
    const base: ProjectState = { design: state.design };
    const files = [
      { name: 'build-v1.frd', raw: '100 90 0\n1000 91 0\n' },
      { name: 'build-v2.frd', raw: '100 90.5 0\n1000 90.8 0\n' },
    ];
    const st = { ...base, verifyFile: files[1], verifyFiles: files, verifyActive: 1 };
    const back = deserializeProject(serializeProject(st));
    expect(back.verifyFiles).toEqual(files);
    expect(back.verifyActive).toBe(1);
    expect(back.verifyFile).toEqual(files[1]);
  });

  it('reads a pre-Compare file (verifyFile only) without inventing a list', () => {
    const base: ProjectState = { design: state.design };
    const st = { ...base, verifyFile: { name: 'old.frd', raw: '100 90 0\n' } };
    const back = deserializeProject(serializeProject(st));
    expect(back.verifyFile?.name).toBe('old.frd');
    expect(back.verifyFiles).toBeUndefined();
    expect(back.verifyActive).toBeUndefined();
  });

  it('drops malformed entries from the list and rejects a bogus active index', () => {
    const base: ProjectState = { design: state.design };
    const json = JSON.parse(serializeProject(base));
    json.verifyFiles = [{ name: 'ok.frd', raw: 'x' }, { nope: 1 }, 'junk'];
    json.verifyActive = -3;
    const back = deserializeProject(JSON.stringify(json));
    expect(back.verifyFiles).toEqual([{ name: 'ok.frd', raw: 'x' }]);
    expect(back.verifyActive).toBeUndefined();
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

describe('B2 migration — a pre-B2 project must still open', () => {
  it('a design without bandAtDesign round-trips and stays loadable', () => {
    /* The rule: refusing to open a project is worse than a weak band. So a
     * pre-B2 tab loads, keeps its parts, and simply has no band stamp — which
     * is what the UI marks it on. Refusals apply to new runs, never to
     * loading. */
    const pre = {
      format: PROJECT_FORMAT,
      version: 2,
      design: {
        ...state.design,
        networkDesigns: [{ id: 'working', name: 'Working', parts: [] }],
        activeDesignId: 'working',
      },
    };
    const loaded = deserializeProject(JSON.stringify(pre));
    expect(loaded.design.networkDesigns).toHaveLength(1);
    expect(loaded.design.networkDesigns![0].name).toBe('Working');
    expect(loaded.design.networkDesigns![0].bandAtDesign).toBeUndefined();
    // And it survives a save/load cycle without acquiring a band it never had.
    const again = deserializeProject(serializeProject(loaded));
    expect(again.design.networkDesigns![0].bandAtDesign).toBeUndefined();
  });

  it('a band stamp survives the round trip once a run has produced one', () => {
    const withBand = {
      format: PROJECT_FORMAT,
      version: 2,
      design: {
        ...state.design,
        networkDesigns: [
          { id: 'working', name: 'Working', parts: [], bandAtDesign: { fromHz: 398, toHz: 18000 } },
        ],
        activeDesignId: 'working',
      },
    };
    const again = deserializeProject(serializeProject(deserializeProject(JSON.stringify(withBand))));
    expect(again.design.networkDesigns![0].bandAtDesign).toEqual({ fromHz: 398, toHz: 18000 });
  });
});

describe('A3 — sourceMode rides inside v2, so a project stays openable both ways', () => {
  it('a file carrying sourceMode still declares version 2, and an older app can read it', () => {
    /* THE QUESTION THIS ANSWERS: is v3 a one-way door? It does not have to be
     * one, so it was not made one. deserializeProject refuses any file whose
     * version is HIGHER than it knows ("update the app"), so bumping the
     * version is what would lock older builds out. `sourceMode` is an optional
     * field an older build simply ignores — and ignoring it means treating the
     * branch as an array, which is exactly what that build would have done
     * anyway. The version moves at A7, where the netlist genuinely cannot be
     * read by an older app, and there the refusal is honest. */
    const withMode: ProjectState = {
      design: {
        ...state.design,
        cabinet: {
          ...(state.design.cabinet ?? {}),
          drivers: { low: { count: '1', sourceMode: 'discrete' } },
        },
      },
    };
    const text = serializeProject(withMode);
    expect(JSON.parse(text).version).toBe(2);
    const back = deserializeProject(text);
    expect(back.design.cabinet?.drivers?.low?.sourceMode).toBe('discrete');
    // A build that predates the field drops it and keeps the rest — simulated
    // by stripping the key, which is what an old reader's typed parse does.
    const oldReader = JSON.parse(text);
    delete oldReader.design.cabinet.drivers.low.sourceMode;
    const asOld = deserializeProject(JSON.stringify(oldReader));
    expect(asOld.design.cabinet?.drivers?.low?.count).toBe('1');
    expect(asOld.design.cabinet?.drivers?.low?.sourceMode).toBeUndefined();
  });
});
