/**
 * ENGINE V2 — the public surface.
 *
 * Everything the app may touch goes through here, and nothing here has a side
 * effect: importing this module changes no behaviour anywhere, which is half
 * of what makes the "toggle off = byte-identical" guarantee provable (see
 * `facade.ts` and `toggleRegression.test.ts` for the other half).
 *
 * Layout:
 *   facade / version   - the flag, the mark, the estimator version table
 *   ingest/*           - A5: manifest, validity, extractors, derivation pass
 *   metrics/*          - A4: the metric library, reporting-only in F1
 *   predesign/*        - A5d: anchored gaps, feasible crossover windows
 *   capability, report - A5.3 and the assembled panel data
 */

export { ENGINE_V2_LABEL, ENGINE_V2_VERSION, ESTIMATOR_VERSIONS, estimatorFingerprint, estimatorVersion, stamp } from './version.ts';
export type { EstimatorId, EstimatorStamp } from './version.ts';

export { ENGINE_V1_ONLY, engineV2Mark, selectEngine } from './facade.ts';
export type { EngineId, EngineSelection } from './facade.ts';

export * from './constants.ts';
export * from './util.ts';

export * from './ingest/manifest.ts';
export * from './ingest/validity.ts';
export * from './ingest/motionalFit.ts';
export * from './ingest/impedance.ts';
export * from './ingest/spl.ts';
export * from './ingest/derive.ts';

export * from './metrics/types.ts';
export * from './metrics/analysis.ts';
export * from './metrics/electrical.ts';
export * from './metrics/acoustic.ts';
export * from './metrics/registry.ts';

export * from './predesign/gaps.ts';
export * from './predesign/xoWindow.ts';
export * from './predesign/xoRangeAdvice.ts';

export * from './optimizer/determinism.ts';
export * from './optimizer/gates.ts';
export * from './optimizer/bounds.ts';
export * from './optimizer/run.ts';

export * from './appAdapter.ts';
export * from './capability.ts';
export * from './report.ts';
