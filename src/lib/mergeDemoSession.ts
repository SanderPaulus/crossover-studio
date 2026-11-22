/**
 * UI-9 — the example session of the NF/FF-merge tool (Sander, 22-11-2026: a friend loaded the demo
 * project, opened the merge tool and found an empty page asking for a "measuring session").
 *
 * The demo PROJECT carries FRD and ZMA exports — responses that are already merged — and the merge
 * tool works on raw impulses (.pir) of one dual-channel session. So the demo project has nothing for
 * the tool to merge, and a visitor met three drop zones and no example. This module is that example:
 * the August 2026 KOAN measurement — the very impulses `test-fixtures/casus1_pir/` holds for the
 * tests — as a session the tool opens with one press, plus its microphone calibration file and the
 * set-up as the designer STATED it in `opstelling.json` (B-4: only what was stated; the planes were
 * not stated and open as "don't know").
 *
 * Nothing is copied: every file is imported by URL from the fixture folder, so the bundle serves the
 * same bytes the tests read, and a test pins that. The files are fetched on the press, never at start
 * — two megabytes nobody asked for stay out of the first load (the C-1 idiom for the catalog).
 *
 * The cabinet (front, S_d, driver positions) is the demo project's: `KOAN_3WAY_DEMO`, the finished
 * KOAN 2951. The tool reads it from the open project; where the project's cabinet is still empty the
 * loader offers those values through the same `onCabinet`/`onSd` entrances UI-6 built, so a fresh
 * browser lands on a complete step 2 too.
 */
import midHor0 from '../../test-fixtures/casus1_pir/mid_hor_0.pir?url';
import midNear from '../../test-fixtures/casus1_pir/mid_near.pir?url';
import poortNear from '../../test-fixtures/casus1_pir/poort_near.pir?url';
import tweeterHor0 from '../../test-fixtures/casus1_pir/tweeter_hor_0.pir?url';
import wooferDownHor0 from '../../test-fixtures/casus1_pir/woofer_down_hor_0.pir?url';
import wooferDownNear from '../../test-fixtures/casus1_pir/woofer_down_near.pir?url';
import wooferUpHor0 from '../../test-fixtures/casus1_pir/woofer_up_hor_0.pir?url';
import wooferUpNear from '../../test-fixtures/casus1_pir/woofer_up_near.pir?url';
import micCalUrl from '../../test-fixtures/casus1_pir/MM1CDU_allein_00d.mic?url';
import setupRecordText from '../../test-fixtures/casus1_pir/opstelling.json?raw';
import { KOAN_3WAY_DEMO } from '../demo3way.ts';
import type { CabinetPatchForMerge, DroppedFile, MergeWay, Surface } from './mergeSession.ts';

export const MERGE_DEMO_SESSION_VERSION = 'merge-demo-session/1.0';

/** The session's name — also how the tool recognises an already-loaded copy and opens it instead of a second one. */
export const MERGE_DEMO_SESSION_NAME = 'KOAN 2951 — example session (Aug 2026)';

/** The impulses of the session, by file name (the name is what the tool reads the role and the driver from). */
export const MERGE_DEMO_FILES: readonly { name: string; url: string }[] = [
  { name: 'mid_hor_0.pir', url: midHor0 },
  { name: 'mid_near.pir', url: midNear },
  { name: 'poort_near.pir', url: poortNear },
  { name: 'tweeter_hor_0.pir', url: tweeterHor0 },
  { name: 'woofer_down_hor_0.pir', url: wooferDownHor0 },
  { name: 'woofer_down_near.pir', url: wooferDownNear },
  { name: 'woofer_up_hor_0.pir', url: wooferUpHor0 },
  { name: 'woofer_up_near.pir', url: wooferUpNear },
];
export const MERGE_DEMO_MIC_CAL = { name: 'MM1CDU_allein_00d.mic', url: micCalUrl } as const;

/** The set-up as the designer stated it — the four measures and the one question, in the tool's own field form. */
export interface MergeDemoSetup {
  rig: { bottom: string; surface: Surface; overhang: string; overhangUnknown: boolean; overhangMax?: string; micDist: string; micHeight: string };
  /** The planes were not stated: "don't know" (the merges then read "not checked for reflections"). */
  planeQ: 'unknown' | 'no';
}

/**
 * The stated set-up, READ from the fixture's own record and never typed here: the table top above the
 * floor (A), the overhang stated as a bound ("at most"), the microphone's distance (C) and height (D).
 * The planes are null in the record → "don't know". Throws on a record that lacks a figure, rather
 * than guessing one (B-4).
 */
export function mergeDemoSetup(recordText: string = setupRecordText): MergeDemoSetup {
  const rec = JSON.parse(recordText) as {
    kast_staat_op?: string;
    tafelblad_boven_vloer_mm?: number;
    mic_boven_vloer_mm?: number;
    mic_tot_baffle_mm?: number;
    tafeloverstek?: { hooguit_mm?: number | null; exact_mm?: number | null };
    vlakken?: Record<string, unknown>;
  };
  const surface = rec.kast_staat_op;
  if (surface !== 'table' && surface !== 'floor' && surface !== 'stand') throw new Error(`example set-up: what the cabinet stands on is not stated (${String(surface)})`);
  const need = (v: number | undefined, what: string): string => {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`example set-up: ${what} is not stated`);
    return String(v);
  };
  const exact = rec.tafeloverstek?.exact_mm;
  const bound = rec.tafeloverstek?.hooguit_mm;
  const overhang =
    typeof exact === 'number'
      ? { overhang: String(exact), overhangUnknown: false }
      : typeof bound === 'number'
        ? { overhang: '', overhangUnknown: false, overhangMax: String(bound) }
        : { overhang: '', overhangUnknown: true };
  const planesStated = Object.entries(rec.vlakken ?? {}).some(([k, v]) => k !== 'open' && v !== null);
  return {
    rig: {
      bottom: need(rec.tafelblad_boven_vloer_mm, 'the table top above the floor (A)'),
      surface,
      ...overhang,
      micDist: need(rec.mic_tot_baffle_mm, 'the microphone distance (C)'),
      micHeight: need(rec.mic_boven_vloer_mm, 'the microphone height (D)'),
    },
    planeQ: planesStated ? 'no' : 'unknown',
  };
}

/** The demo project's cabinet, in the form the tool's `onCabinet` entrance takes — for a project whose cabinet is still empty. */
export function mergeDemoCabinet(): { patch: CabinetPatchForMerge; sdCm2: Record<MergeWay, string> } {
  const c = KOAN_3WAY_DEMO.cabinet;
  return {
    patch: {
      baffleWidthMm: c.baffleWidthMm,
      baffleHeightMm: c.baffleHeightMm,
      refFromTopMm: c.refFromTopMm,
      drivers: {
        low: { yMm: c.drivers.low.yMm, count: c.drivers.low.count, spacingMm: c.drivers.low.spacingMm },
        mid: { yMm: c.drivers.mid.yMm },
        high: { yMm: c.drivers.high.yMm },
      },
    },
    sdCm2: { low: KOAN_3WAY_DEMO.sdCm2.low, mid: KOAN_3WAY_DEMO.sdCm2.mid, high: KOAN_3WAY_DEMO.sdCm2.high },
  };
}

/** Fetches the session's files and its calibration file — on the press, not at start. */
export async function fetchMergeDemoSession(fetchFn: typeof fetch = fetch): Promise<{ files: DroppedFile[]; cal: { name: string; text: string } }> {
  const get = async (url: string, name: string): Promise<Uint8Array> => {
    const r = await fetchFn(url);
    if (!r.ok) throw new Error(`example session: ${name} could not be fetched (${r.status})`);
    return new Uint8Array(await r.arrayBuffer());
  };
  const files = await Promise.all(MERGE_DEMO_FILES.map(async (f) => ({ name: f.name, bytes: await get(f.url, f.name) })));
  const calBytes = await get(MERGE_DEMO_MIC_CAL.url, MERGE_DEMO_MIC_CAL.name);
  return { files, cal: { name: MERGE_DEMO_MIC_CAL.name, text: new TextDecoder('latin1').decode(calBytes) } };
}
