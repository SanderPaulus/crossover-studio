/**
 * F3b ACCEPTANCE (g) and (h) — the two deliverables about DECLARED INPUT.
 *
 * (g) M-F-final either has every way's acoustic centre or it is off with a
 *     reason. What it may never do is report the coplanar 0.0 dB, which is the
 *     arithmetic of a missing input wearing the face of a perfect result.
 *
 * (h) The window metadata a designer types, and the caveat that appears and
 *     disappears with it. The casus-1 far fields all carry ARTA headers, so the
 *     header-less case is built by STRIPPING them from the woofer's files —
 *     which is what a set that has passed through another tool looks like.
 *
 * Both run on casus 1 through `buildReport`, so what these assert and what the
 * panel renders are the same object.
 */

import { describe, expect, it } from 'vitest';
import {
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
} from './casus1.fixture.ts';
import { buildReport, type EngineV2Report, type ReportSettings } from './report.ts';
import type { MeasurementFile } from './ingest/derive.ts';
import type { Manifest, ManifestEntry } from './ingest/manifest.ts';
import { ctcKey, type Geometry } from './metrics/types.ts';
import { anchoredGaps, type WayLevel } from './predesign/gaps.ts';
import { passbandLevel } from './ingest/spl.ts';

const golden = loadGolden();
/* M-1 — THE GATED SET, deliberately: (h) is about a HEADER window being stripped
 * and typed back, and the merged woofer of the default set carries no header
 * window at all — its floor is the merge block's (`mergeBlock.test.ts`). */
const manifest = casus1Manifest(golden, 'gated');
const files = casus1Files(manifest);
const geometry = casus1Geometry(golden);

const SETTINGS: ReportSettings = {
  verticalWindowDeg: [-15, 15],
  orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
};

const build = (
  over: {
    manifest?: Manifest;
    files?: readonly MeasurementFile[];
    geometry?: Geometry;
    settings?: ReportSettings;
  } = {},
): EngineV2Report =>
  buildReport({
    manifest: over.manifest ?? manifest,
    files: over.files ?? files,
    filter: casus1Filter('KAND_B', manifest, files, golden),
    geometry: over.geometry ?? geometry,
    settings: over.settings ?? SETTINGS,
  });

/* ================================================================== *
 * (g) M-F-final declares its input
 * ================================================================== */

describe('(g) M-F-final: the reference with the offsets, off with a reason without them', () => {
  it('with the casus-1 acoustic centres it reproduces the reference dip', () => {
    const r = build();
    const ref = golden.kandidaten.KAND_B_3e.lobing_eind_dip_15gr as [number, number];
    const l = r.metrics.lobingFinal!;
    expect(r.metrics.lobingFinalOff).toBeNull();
    expect(Math.abs(l.worstDipDb - ref[0])).toBeLessThanOrEqual(golden.toleranties.dB);
    expect((Math.abs(l.worstAtHz - ref[1]) / ref[1]) * 100).toBeLessThanOrEqual(
      golden.toleranties.frequenties_pct,
    );
    // The window it was synthesised over is ±15°, and the dip is found on one
    // of those angles rather than on the axis it is measured against.
    expect(Math.abs(l.worstAtDeg)).toBe(15);
  });

  it('one way without an acoustic centre turns it OFF, naming the way', () => {
    const partial: Geometry = { ...geometry, zOffsetMm: { ...geometry.zOffsetMm } };
    delete partial.zOffsetMm!.tweeter;
    const r = build({ geometry: partial });
    expect(r.metrics.lobingFinal).toBeNull();
    expect(r.metrics.lobingFinalOff).toContain('tweeter');
    expect(r.metrics.lobingFinalOff).toContain('acoustic-centre offsets are missing');
    // The defect this replaced: the way was DROPPED and the synthesis carried
    // on describing a different speaker. The reason says why that is refused.
    expect(r.metrics.lobingFinalOff).toContain('a different speaker');
  });

  it('a COPLANAR set is refused rather than reported as 0.0 dB', () => {
    // Every way entered at the same height. The sum off axis is then the sum
    // on axis times a common phase factor, so the deviation is exactly zero at
    // every angle and every frequency - and that reads like the best possible
    // loudspeaker.
    const flat: Geometry = {
      ...geometry,
      zOffsetMm: { woofer: 0, mid: 0, tweeter: 0 },
    };
    const r = build({ geometry: flat });
    expect(r.metrics.lobingFinal).toBeNull();
    expect(r.metrics.lobingFinalOff).toContain('same acoustic centre');
    expect(r.metrics.lobingFinalOff).toContain('0.0 dB');
  });

  it('the rotational-symmetry flags are honoured rather than assumed false', () => {
    // The app supplied nothing here until F3b, so every driver on every set
    // carried "not rotationally symmetric" - including a waveguide the
    // designer knows is one. Absent still means the limitation is stated; the
    // difference is that a stated `true` now removes it.
    const r = build();
    expect(r.metrics.lobingFinal!.limitations.join(' ')).toContain('woofer');
    expect(r.metrics.lobingFinal!.limitations.join(' ')).not.toContain('tweeter');

    const unstated: Geometry = { ...geometry };
    delete unstated.rotationallySymmetric;
    const r2 = build({ geometry: unstated });
    expect(r2.metrics.lobingFinal!.pointSourceAssumptionSafe).toBe(false);
    expect(r2.metrics.lobingFinal!.limitations.join(' ')).toContain('tweeter');
  });
});

/* ================================================================== *
 * (h) manual window metadata, and the caveat that moves with it
 * ================================================================== */

/** The same manifest with the header stripped from one driver's far fields. */
function withoutHeaders(driver: string): { manifest: Manifest; files: MeasurementFile[] } {
  const strip = (e: ManifestEntry): ManifestEntry => {
    if (e.driver !== driver || e.kind === 'Z' || e.kind === 'NF') return e;
    const { header: _dropped, ...rest } = e;
    void _dropped;
    return rest;
  };
  const entries = manifest.entries.map(strip);
  return {
    manifest: { ...manifest, entries },
    files: files.map((f) => ({ ...f, entry: strip(f.entry) })),
  };
}

/** The same, plus window metadata the designer typed for that driver. */
function withManualWindow(
  driver: string,
  manualWindow: NonNullable<ManifestEntry['manualWindow']>,
): { manifest: Manifest; files: MeasurementFile[] } {
  const base = withoutHeaders(driver);
  const add = (e: ManifestEntry): ManifestEntry =>
    e.driver === driver && e.kind !== 'Z' && e.kind !== 'NF' ? { ...e, manualWindow } : e;
  return {
    manifest: { ...base.manifest, entries: base.manifest.entries.map(add) },
    files: base.files.map((f) => ({ ...f, entry: add(f.entry) })),
  };
}

const wooferAngle = (r: EngineV2Report) =>
  r.ingest.drivers.find((d) => d.driver === 'woofer')!.onAxis!;

/**
 * The way levels the report itself derived, rebuilt from the report.
 *
 * Since UI-1 the report REFUSES to publish anchored gaps when a level rests on
 * an unbelievable band, so the inversion that refusal exists for can no longer
 * be read off the report. It is recomputed here instead — same drivers, same
 * bands, same energy average — so the test still MEASURES the thing it claims
 * rather than asserting that a refusal happened.
 *
 * The band is each driver's own validity band rather than the report's
 * boundary-split one: the split only matters to the absolute levels, and this
 * helper is used for the ANCHOR, which is an ordering.
 */
const levelsOf = (r: EngineV2Report): WayLevel[] => {
  const out: WayLevel[] = [];
  for (const d of r.ingest.drivers) {
    if (!d.onAxis) continue;
    const lvl = passbandLevel(d.onAxis.db, d.onAxis.grid, d.onAxis.bandHz);
    if (!lvl) continue;
    out.push({
      driver: d.driver,
      db: lvl.db,
      bandHz: lvl.bandHz,
      bandFloorKnown: d.onAxis.bandFloorKnown,
      bandFloorProvenance: d.onAxis.bandFloorProvenance,
    });
  }
  return out;
};

describe('(h) manual window metadata: the floor appears, the block recomputes, the flag clears', () => {
  const headers = golden.manifest_en_geometrie.ff_headers;
  const stripped = withoutHeaders('woofer');
  const manual = withManualWindow('woofer', {
    referenceTimeMs: headers.referentietijd_ms,
    rightWindowMs: headers.rechter_venster_ms,
    note: 'from the measurement log',
  });

  const withHeader = build();
  const noFloor = build(stripped);
  const typed = build(manual);

  it('without headers and without metadata the floor is UNKNOWN, and says so', () => {
    const a = wooferAngle(noFloor);
    expect(a.bandFloorKnown).toBe(false);
    expect(a.bandFloorProvenance).toBe('none');
    // The band then starts wherever the sweep does, which is a different claim
    // from a derived floor and is lower than one.
    expect(a.bandHz[0]).toBeLessThan(wooferAngle(withHeader).bandHz[0]);
  });

  it('UI-1: an unknown floor BLOCKS the block — no anchor, no gaps, and the reason travels', () => {
    /* Until UI-1 this was a caveat printed above an otherwise complete table
     * (`suspectBands`, F3b), and the 3-way demo showed a caveat is not enough:
     * the panel warned AND published an anchor, a gap per way and three
     * attenuation budgets, every one of them computed on a level biased
     * downwards, every one of them looking ordinary. So there are no numbers
     * now — F0's rule, one section further along. */
    expect(noFloor.predesign.gaps).toBeNull();
    const b = noFloor.predesign.gapsBlocked!;
    expect(b.drivers).toContain('woofer');
    expect(b.bands.find((x) => x.driver === 'woofer')!.provenance).toContain(
      'no window header',
    );
    // It still says WHY, in terms of what it would have done to this block.
    expect(b.describe).toContain('not a derived gate floor');
    expect(b.describe).toContain('reads LOWER');
    // ...and it names the way out, which is an INPUT and not a switch.
    expect(b.describe).toContain('reference time and right window');
    // The block is absent exactly when it should be: a report whose levels all
    // rest on a derived floor has no block and does have gaps.
    expect(withHeader.predesign.gapsBlocked).toBeNull();
    expect(withHeader.predesign.gaps).not.toBeNull();
  });

  it('entering the window times restores the floor, with its provenance visible', () => {
    const a = wooferAngle(typed);
    expect(a.bandFloorKnown).toBe(true);
    expect(a.bandFloorProvenance).toBe('manual-window');
    // 1/T from the numbers the designer typed IS the header's own floor here,
    // because they are the header's own numbers.
    expect(a.bandHz[0]).toBeCloseTo(wooferAngle(withHeader).bandHz[0], 6);
    // The provenance travels in words too - a stated number must never read
    // like a measured one.
    const note = noFloor.ingest.drivers
      .find((d) => d.driver === 'woofer')!
      .validity.find((v) => v.file.includes('hor_0'))!.interval;
    expect(note.floorProvenance).toBe('none');
    const typedNote = typed.ingest.drivers
      .find((d) => d.driver === 'woofer')!
      .validity.find((v) => v.file.includes('hor_0'))!.interval;
    expect(typedNote.fromReason).toContain('entered by hand');
    expect(typedNote.notes.join(' ')).toContain('NOT from its header');
  });

  it('the anchored-gap block recomputes, and the flag disappears with the metadata', () => {
    /* THE INCIDENT, REPRODUCED, and it is worse than a wrong budget.
     *
     * With the woofer's floor unknown its level is averaged from where the
     * sweep starts, so it includes an octave and a half of rolloff nothing was
     * ever going to reproduce. That drags it down past the mid — and the
     * ANCHOR MOVES. The block then reports a different reference way, a
     * different gap for every other way, and a different attenuation budget
     * behind each of them, all of which look like ordinary numbers.
     *
     * Note what does NOT fire: `anchorSwitchWarning` stays silent, because the
     * woofer is the lowest way and A5d.4(b) is about an anchor that is not.
     * The inversion is invisible to every existing signal in the block, which
     * is precisely why the caveat had to be added to it. */
    expect(withHeader.predesign.gaps!.anchor).toBe('mid');

    /* THE INVERSION ITSELF, still measured — and it has to be, or the block
     * above is a refusal nobody can check. The report no longer publishes
     * these numbers, so they are recomputed here from the report's OWN
     * unfloored levels with the flag dropped: that is precisely the call the
     * app used to make. The anchor comes out `woofer` instead of `mid`, and
     * `anchorSwitchWarning` stays silent throughout — the woofer IS the lowest
     * way, so A5d.4(b) has nothing to say about it. Not one existing signal in
     * the block saw this, which is why it had to become a refusal. */
    const asIfBelieved = anchoredGaps(
      levelsOf(noFloor).map((l) => ({ ...l, bandFloorKnown: undefined })),
    )!;
    expect(asIfBelieved.anchor).toBe('woofer');
    expect(asIfBelieved.anchorSwitchWarning).toBeNull();
    expect(noFloor.predesign.gaps).toBeNull();

    // With the window entered, the block clears and the table is the one the
    // header itself produced - anchor, gaps and budgets alike.
    expect(typed.predesign.gapsBlocked).toBeNull();
    expect(typed.predesign.gaps!.anchor).toBe(withHeader.predesign.gaps!.anchor);
    const budget = (r: EngineV2Report, driver: string) =>
      r.predesign.gaps!.ways.find((w) => w.driver === driver)?.budgetDb ?? null;
    expect(budget(typed, 'woofer')).toBeCloseTo(budget(withHeader, 'woofer')!, 6);
    expect(budget(typed, 'tweeter')).toBeCloseTo(budget(withHeader, 'tweeter')!, 6);
    // ...and it really was RECOMPUTED rather than merely re-flagged: the
    // tweeter's budget is a different number in the unfloored report.
    expect(
      anchoredGaps(levelsOf(noFloor).map((l) => ({ ...l, bandFloorKnown: undefined })))!.ways.find(
        (w) => w.driver === 'tweeter',
      )!.budgetDb,
    ).not.toBeCloseTo(budget(typed, 'tweeter')!, 3);
  });

  it('the shortcut form states the floor directly', () => {
    const direct = withManualWindow('woofer', { validityFloorHz: 397 });
    const r = build(direct);
    const a = wooferAngle(r);
    expect(a.bandFloorProvenance).toBe('manual-floor');
    expect(a.bandHz[0]).toBeCloseTo(397, 6);
    expect(r.predesign.gapsBlocked).toBeNull();
  });

  it('a HEADER always wins: typed numbers cannot relax a measured gate floor', () => {
    // A5b.1(i) is absolute about this, and it is the one way this feature
    // could do damage. The metadata is offered to every far field of the
    // driver; the ones that still have a header must ignore it entirely.
    const overreach = {
      manifest: {
        ...manifest,
        entries: manifest.entries.map((e) =>
          e.driver === 'woofer' && e.kind === 'FF'
            ? { ...e, manualWindow: { validityFloorHz: 20 } }
            : e,
        ),
      },
      files: files.map((f) =>
        f.entry.driver === 'woofer' && f.entry.kind === 'FF'
          ? { ...f, entry: { ...f.entry, manualWindow: { validityFloorHz: 20 } } }
          : f,
      ),
    };
    const r = build(overreach);
    const a = wooferAngle(r);
    expect(a.bandFloorProvenance).toBe('header');
    expect(a.bandHz[0]).toBeCloseTo(wooferAngle(withHeader).bandHz[0], 6);
    expect(r.predesign.gapsBlocked).toBeNull();
  });
});
