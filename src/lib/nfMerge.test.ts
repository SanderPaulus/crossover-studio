import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrd } from './parsers/frd.ts';
import { parseTabular } from './parsers/tabular.ts';
import { parseArtaHeader } from './engine2/ingest/manifest.ts';
import { readMergeBlock } from './xoWindow.ts';
import { declaredMergeValidity } from './sourceMeta.ts';
import { baffleStepShelfDb } from './nearField.ts';
import {
  NF_MERGE_VERSION,
  SPLICE_CHECK_TOLERANCE_DB,
  bandOf,
  centreOf,
  classifyMeasurementShape,
  mergeNearField,
  mergedFileName,
  portWeight,
  renderMergedFrd,
  spliceBandCheck,
  stepShapeCheck,
  suggestSpliceBand,
  suggestValidFrom,
  sweepUntouchedCheck,
  textChecksum,
  type StepPeer,
} from './nfMerge.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const CASUS1 = join(HERE, '..', '..', 'test-fixtures', 'casus1');
const casus1 = (n: string) => readFileSync(join(CASUS1, n), 'latin1');
const MEASURED = JSON.parse(
  readFileSync(join(HERE, '..', '..', 'test-fixtures', 'casus1_i2_appmerge.json'), 'utf8'),
) as {
  onderwerpen: Record<
    string,
    {
      referentie: string;
      nf: string;
      ff: string;
      splice_band_hz: [number, number];
      stap_model: { hz: number; depthDb: number };
      fit: { gain_dB: number; gain_blok_dB: number; delay_ms: number; offset_deg: number; fase_residu_deg: number };
      herkenning: { nf: string; nf_vraagt: boolean; ff: string; ff_vraagt: boolean };
      voorgestelde_band: {
        band_hz: [number, number] | null;
        ff_vloer_hz: number | null;
        keele_hz: number | null;
        gebruikte_band_boven_keele_hz: number;
      };
      controle_1: { lezing: string; ok: boolean };
      per_band: { from: number; to: number; n: number; db_rms: number; db_max: number; fase_rms: number; fase_max: number }[];
      m1_stapfase?: { steekproef: { hz: number; m1_deg: number }[] };
    }
  >;
  controle_2: { lezing: string; ok: boolean };
};

/** The one place this file builds a merge — every claim below reads it, so a
 *  claim can never quietly measure a different construction than its sibling. */
const mergeOf = (key: string) => {
  const s = MEASURED.onderwerpen[key];
  const m = mergeNearField({
    farText: casus1(s.ff),
    farName: s.ff,
    nearText: casus1(s.nf),
    nearName: s.nf,
    spliceBandHz: s.splice_band_hz,
    step: s.stap_model,
  });
  expect(m, `${key}: the merge refused`).not.toBeNull();
  return { subject: s, merge: m! };
};

const bandStats = (
  freq: readonly number[],
  a: { spl: readonly number[]; phase: readonly number[] },
  b: { spl: readonly number[]; phase: readonly number[] },
  from: number,
  to: number,
) => {
  let n = 0;
  let sd = 0;
  let mx = 0;
  let sp = 0;
  let mp = 0;
  for (let i = 0; i < freq.length; i++) {
    if (freq[i] < from || freq[i] > to) continue;
    const d = a.spl[i] - b.spl[i];
    let p = a.phase[i] - b.phase[i];
    p = (((p + 180) % 360) + 360) % 360 - 180;
    n++;
    sd += d * d;
    mx = Math.max(mx, Math.abs(d));
    sp += p * p;
    mp = Math.max(mp, Math.abs(p));
  }
  return { n, db_rms: Math.sqrt(sd / n), db_max: mx, fase_rms: Math.sqrt(sp / n), fase_max: mp };
};

/* ==================================================================== *
 * 1 — THE ACCEPTANCE: the app's merge against the two merges that exist
 * ==================================================================== */

describe('I-2 — the app merge against M-1s mid merge', () => {
  /**
   * THE STRICT ONE. Same near field, same far field, same band, same step, no
   * port: anything that moves is a difference between `nfMerge.ts` and the
   * script M-1 ran, and nothing else.
   */
  it('reproduces the merged MAGNITUDE inside the reference file s own rounding', () => {
    const { subject, merge } = mergeOf('mid');
    const ref = parseFrd(casus1(subject.referentie));
    expect(merge.freq.length).toBe(ref.freq.length);
    const all = bandStats(merge.freq, { spl: merge.spl, phase: merge.phaseDeg }, { spl: ref.spl, phase: ref.phase }, 0, Infinity);
    // The file carries three decimals, so half a milli-dB is the floor of what
    // any comparison against it can resolve. This lands there.
    expect(all.db_max).toBeLessThan(0.001);
  });

  it('reproduces the splice gain the reference block states, to the block s own two decimals', () => {
    const { subject, merge } = mergeOf('mid');
    const blk = parseArtaHeader(parseTabular(casus1(subject.referentie)).comments).merge;
    expect(blk?.spliceGainDb).toBeDefined();
    expect(Number(merge.fit.levelDb.toFixed(2))).toBe(blk!.spliceGainDb);
  });

  /**
   * M-1's STEP PHASE IS A DIFFERENT QUANTITY, and this is the claim that says
   * so with numbers instead of prose.
   *
   * `scripts/merge-casus1-mid.ts` builds the shelf's minimum phase from the
   * real cepstrum and then reads `atan2(Im, Re)` of the folded spectrum. That
   * spectrum is `ln|H| + jφ`: the minimum phase is `Im`, and `atan2(Im, Re)` is
   * the angle between the phase and the log-magnitude — it runs from ~175° at
   * 20 Hz to ~140° at 800 Hz where the shelf's own minimum phase is 3.6° to
   * 12.6°. `minphase.ts`, the project's one implementation, has always taken
   * `Im`; this module uses it.
   *
   * NOT REPAIRED HERE, deliberately: repairing `Koan_M_merged.frd` means
   * re-merging casus 1's mid, which moves the measurement set and every corpus
   * that rests on it. So the divergence is MEASURED, pinned, and left standing.
   */
  it('differs from M-1 in PHASE below the splice and nowhere else — the atan2 step', () => {
    const { subject, merge } = mergeOf('mid');
    const ref = parseFrd(casus1(subject.referentie));
    const recorded = new Map(subject.per_band.map((r) => [`${r.from}-${r.to}`, r]));
    for (const [from, to] of [
      [20, 40],
      [80, 150],
      [150, 300],
      [500, 800],
      [800, 20000],
    ] as const) {
      const fresh = bandStats(merge.freq, { spl: merge.spl, phase: merge.phaseDeg }, { spl: ref.spl, phase: ref.phase }, from, to);
      const rec = recorded.get(`${from}-${to}`)!;
      expect(rec, `${from}-${to} Hz is not in the recorded measurement`).toBeDefined();
      expect(fresh.fase_max).toBeCloseTo(rec.fase_max, 2);
      expect(fresh.db_max).toBeCloseTo(rec.db_max, 5);
    }
    // Above the blend the merge IS the far field, so the two agree exactly —
    // without this the claim above would also be true of a merge that differed
    // everywhere for some other reason.
    const above = bandStats(merge.freq, { spl: merge.spl, phase: merge.phaseDeg }, { spl: ref.spl, phase: ref.phase }, 800, 20000);
    expect(above.fase_max).toBe(0);
    expect(above.db_max).toBeLessThan(1e-12);
    // And below it the phase really does move, by more than a rounding.
    const below = bandStats(merge.freq, { spl: merge.spl, phase: merge.phaseDeg }, { spl: ref.spl, phase: ref.phase }, 80, 150);
    expect(below.fase_max).toBeGreaterThan(10);
  });

  it('the M-1 step phase recorded in the measurement is the atan2 quantity, not a shelf phase', () => {
    const s = MEASURED.onderwerpen.mid;
    expect(s.m1_stapfase).toBeDefined();
    for (const p of s.m1_stapfase!.steekproef) {
      // A first-order 6 dB shelf's own minimum phase never leaves ±15°; every
      // one of these is above 130°, which is the whole point.
      expect(Math.abs(p.m1_deg)).toBeGreaterThan(130);
    }
  });
});

describe('I-2 — the app merge against Sanders August woofer merges', () => {
  /**
   * THE ONE THAT CANNOT BE REPRODUCED EXACTLY, and its own header says why:
   * `LF = eigen nearfield + 0.5 x poort (g=0.41)`. That port measurement is not
   * in this repository and inventing one is forbidden, so what is asserted is
   * the DIVERGENCE — reproduced from a fresh measurement, band by band.
   */
  it.each(['woofer_up', 'woofer_down'])('%s: every recorded band reproduces', (key) => {
    const { subject, merge } = mergeOf(key);
    const ref = parseFrd(casus1(subject.referentie));
    for (const rec of subject.per_band) {
      const fresh = bandStats(merge.freq, { spl: merge.spl, phase: merge.phaseDeg }, { spl: ref.spl, phase: ref.phase }, rec.from, rec.to);
      expect(fresh.n, `${key} ${rec.from}-${rec.to} Hz`).toBe(rec.n);
      expect(fresh.db_rms).toBeCloseTo(rec.db_rms, 4);
      expect(fresh.db_max).toBeCloseTo(rec.db_max, 4);
      expect(fresh.fase_max).toBeCloseTo(rec.fase_max, 2);
    }
  });

  /** Above the blend the merge IS the far field: the crossfade weight is 1, so
   *  no near-field number reaches those points. Not BIT-identical, and the
   *  reason is worth writing down rather than rounding away — the crossfade
   *  works in the complex domain, so every point makes a polar round-trip
   *  (dB + degrees → re/im → dB + degrees) and comes back about 1e-14 from
   *  where it started. Pinned at 1e-10 rather than loosened to a decibel: a
   *  merge that leaked a near-field point up here would miss by orders more. */
  it.each(['woofer_up', 'woofer_down'])('%s: above the blend it IS the far field', (key) => {
    const { subject, merge } = mergeOf(key);
    const far = parseFrd(casus1(subject.ff));
    let checked = 0;
    for (let i = 0; i < merge.freq.length; i++) {
      if (merge.freq[i] <= subject.splice_band_hz[1]) continue;
      expect(merge.spl[i]).toBeCloseTo(far.spl[i], 10);
      expect(merge.phaseDeg[i]).toBeCloseTo(far.phase[i], 10);
      checked++;
    }
    expect(checked).toBeGreaterThan(1000);
  });

  /**
   * THE PORT IS NOT NEGLIGIBLE IN THE FIT BAND, and that corrects the reading a
   * casual glance at Sanders header invites. It notes "without the port ~80 Hz"
   * beside a validity floor, which reads as "the port only matters at the
   * bottom". It also moves the LEVEL FIT by a decibel and more: a 600 mm
   * downfiring port has organ-pipe resonances at 500–800 Hz, which is exactly
   * where the gain is fitted.
   */
  it.each(['woofer_up', 'woofer_down'])('%s: the missing port moves the level fit by more than a decibel', (key) => {
    const { subject, merge } = mergeOf(key);
    const gap = Math.abs(merge.fit.levelDb - subject.fit.gain_blok_dB);
    expect(merge.fit.levelDb).toBeCloseTo(subject.fit.gain_dB, 3);
    expect(gap).toBeGreaterThan(0.9);
    // …and the divergence is not confined to the bottom octave either.
    const mid = subject.per_band.find((r) => r.from === 150)!;
    expect(mid.db_max).toBeGreaterThan(1);
  });
});

/* ==================================================================== *
 * 2 — The block: one convention, two readers
 * ==================================================================== */

describe('I-2 — the merge block this module writes', () => {
  const build = () => {
    const { subject, merge } = mergeOf('mid');
    const text = renderMergedFrd({
      merge,
      farName: subject.ff,
      nearName: subject.nf,
      spliceBandHz: subject.splice_band_hz,
      step: subject.stap_model,
      cabinetStepHz: 442.3,
      validFromHz: 60,
      validFromReason: 'sealed pod: the near field carries this branch down to 20.5 Hz',
      madeOn: '2026-09-08',
      branchLabel: 'mid',
    });
    return { subject, merge, text };
  };

  /**
   * P-1's form, and its reason: the field NAMES are the convention, the two
   * parsers are independent implementations, and the v1 side may not import
   * engine2. A block that only one of them reads is a block that blocks
   * Optimize on one route and not the other — which is exactly what P-1 had to
   * repair on these very files.
   */
  it('is read back identically by parseArtaHeader (engine2) and readMergeBlock (v1)', () => {
    const { text, merge, subject } = build();
    const eng = parseArtaHeader(parseTabular(text).comments).merge;
    const v1 = readMergeBlock(text);
    expect(eng).toBeDefined();
    expect(v1).not.toBeNull();
    expect(eng!.kind).toBe('NF/FF');
    expect(v1!.kind).toBe('NF/FF');
    expect(eng!.nfSource).toBe(subject.nf);
    expect(v1!.nfSource).toBe(subject.nf);
    expect(eng!.ffSource).toBe(subject.ff);
    expect(v1!.ffSource).toBe(subject.ff);
    expect(eng!.spliceBandHz).toEqual(subject.splice_band_hz);
    expect(v1!.spliceBandHz).toEqual(subject.splice_band_hz);
    expect(eng!.spliceGainDb).toBe(Number(merge.fit.levelDb.toFixed(2)));
    expect(v1!.validFromHz).toBe(60);
    expect(parseArtaHeader(parseTabular(text).comments).statedValidity?.fromHz).toBe(60);
  });

  it('carries the date and the MODEL-validated marker in a field both readers parse', () => {
    const { text } = build();
    const v1 = readMergeBlock(text)!;
    expect(v1.status).toContain('2026-09-08');
    expect(v1.status).toContain('MODEL-validated');
    // Not a field of its own: an unparsed field is decoration.
    expect(text).not.toMatch(/^\* Merge date =/m);
  });

  it('states the step model, its cabinet cross-check and what a second-order shelf would cost', () => {
    const { text, merge } = build();
    const model = parseArtaHeader(parseTabular(text).comments).merge!.stepModel!;
    expect(model).toContain('shelf 6 dB @ 440 Hz');
    expect(model).toContain('minimum phase');
    expect(model).toContain('442.3 Hz');
    expect(model).toContain('MODEL SENSITIVITY');
    expect(merge.stepModelSensitivityDb).toBeGreaterThan(0);
    expect(model).toContain(merge.stepModelSensitivityDb!.toFixed(2));
  });

  it('names the port model as absent rather than leaving the field out', () => {
    const { text } = build();
    expect(parseArtaHeader(parseTabular(text).comments).merge!.portModel).toContain('none');
  });

  /** Every block field is ONE line: a newline would end the field early and an
   *  `=` inside a value would be read as the next field's name. */
  it('keeps every field on one line and free of a second =', () => {
    const { text } = build();
    for (const line of text.split('\n')) {
      if (!line.startsWith('* Merge') && !line.startsWith('* Valid')) continue;
      const body = line.slice(line.indexOf('=') + 1);
      expect(body).not.toContain('=');
    }
  });

  /** The whole point of writing a file: the validity travels with the data,
   *  through the path P-1 built and without a line of new plumbing. */
  it('gives the v1 validity path a floor, so the branch stops being unverified', () => {
    const { text } = build();
    const frd = parseFrd(text);
    const mv = declaredMergeValidity(readMergeBlock(text)!, {
      fromHz: frd.freq[0],
      toHz: frd.freq[frd.freq.length - 1],
    });
    expect(mv.validity.fromHz).toBe(60);
    expect(mv.validity.reason).toContain('NF/FF');
    expect(mv.notes.join(' ')).toContain('MODEL-validated');
  });

  it('parses back as a response with the same curve it was written from', () => {
    const { text, merge } = build();
    const back = parseFrd(text);
    expect(back.freq.length).toBe(merge.freq.length);
    expect(back.hasPhase).toBe(true);
    for (let i = 0; i < back.freq.length; i += 137) {
      expect(back.spl[i]).toBeCloseTo(merge.spl[i], 3);
      expect(back.phase[i]).toBeCloseTo(merge.phaseDeg[i], 3);
    }
  });

  it('names the merged file after the far field it was built on', () => {
    expect(mergedFileName('woofer_up_hor_0.txt')).toBe('woofer_up_hor_0_merged.frd');
    expect(mergedFileName('mid_hor_0')).toBe('mid_hor_0_merged.frd');
  });

  it('carries a version string, so a behaviour change is a bump', () => {
    expect(NF_MERGE_VERSION).toMatch(/^nf-merge\/\d+\.\d+$/);
    const { text } = build();
    expect(text).toContain(NF_MERGE_VERSION);
  });
});

/* ==================================================================== *
 * 3 — Which file is which
 * ==================================================================== */

describe('I-2 — recognising a near field from a far field', () => {
  /**
   * THE DISCRIMINATOR IS THE FILE AGAINST ITSELF: is 1/T inside the band this
   * file shows? No threshold in hertz appears anywhere, so no cabinet, driver
   * or session can outgrow it.
   */
  it('reads casus 1s real files the way the recorded measurement did', () => {
    for (const [key, s] of Object.entries(MEASURED.onderwerpen)) {
      expect(classifyMeasurementShape(casus1(s.nf)).shape, `${key} near field`).toBe(s.herkenning.nf);
      expect(classifyMeasurementShape(casus1(s.ff)).shape, `${key} far field`).toBe(s.herkenning.ff);
    }
  });

  it('is CERTAIN about a gate that bites and ASKS about everything else', () => {
    const ff = classifyMeasurementShape(casus1('mid_hor_0.txt'));
    expect(ff.shape).toBe('gated');
    expect(ff.ask).toBe(false);
    expect(ff.evidence).toContain('396.7');
    // An ungated file is a near field, a ground plane or an anechoic sweep, and
    // a file name is a human's note to themselves — so the app asks.
    const nf = classifyMeasurementShape(casus1('mid_near.txt'));
    expect(nf.shape).toBe('ungated');
    expect(nf.ask).toBe(true);
    expect(nf.evidence).toContain('ground plane');
  });

  it('knows an already-merged file is neither half', () => {
    const m = classifyMeasurementShape(casus1('Koan_M_merged.frd'));
    expect(m.shape).toBe('merged');
    expect(m.ask).toBe(false);
  });

  it('says UNKNOWN and asks when the header offers nothing to go on', () => {
    const bare = 'Freq[Hz]  dBSPL  Phase[Deg]\n100 90 0\n200 90 0\n400 90 0\n800 90 0\n';
    const v = classifyMeasurementShape(bare);
    expect(v.shape).toBe('unknown');
    expect(v.ask).toBe(true);
  });
});

/* ==================================================================== *
 * 4 — The splice band, the port weight, the floor
 * ==================================================================== */

describe('I-2 — the splice band', () => {
  it('is the widest band both limits allow, and reproduces the recorded numbers', () => {
    for (const [key, s] of Object.entries(MEASURED.onderwerpen)) {
      const sd = key === 'mid' ? 69 : 255;
      const sug = suggestSpliceBand({ farFloorHz: s.voorgestelde_band.ff_vloer_hz, sdCm2: sd });
      expect(sug.band, key).not.toBeNull();
      expect(sug.band![0]).toBeCloseTo(s.voorgestelde_band.band_hz![0], 3);
      expect(sug.band![1]).toBeCloseTo(s.voorgestelde_band.band_hz![1], 3);
      expect(sug.nearMaxHz!).toBeCloseTo(s.voorgestelde_band.keele_hz!, 3);
    }
  });

  /** Sanders own band reaches above ka = 1 on the woofer. A designer's
   *  judgement, reported and not overruled — but a proposal that quietly agreed
   *  with it would not be derived from anything. */
  it('proposes a ceiling BELOW the band the woofer merges actually used', () => {
    const s = MEASURED.onderwerpen.woofer_up;
    expect(s.voorgestelde_band.gebruikte_band_boven_keele_hz).toBeGreaterThan(200);
    const sug = suggestSpliceBand({ farFloorHz: s.voorgestelde_band.ff_vloer_hz, sdCm2: 255 });
    expect(sug.band![1]).toBeLessThan(s.splice_band_hz[1]);
  });

  it('refuses rather than proposing when the two limits cross, and says why', () => {
    const sug = suggestSpliceBand({ farFloorHz: 900, sdCm2: 255 });
    expect(sug.band).toBeNull();
    expect(sug.note).toContain('no honest splice exists');
  });

  it('refuses when an input is missing, naming the input (P4)', () => {
    expect(suggestSpliceBand({ farFloorHz: null, sdCm2: 255 }).note).toContain("far field's validity floor");
    expect(suggestSpliceBand({ farFloorHz: 400, sdCm2: null }).note).toContain('cone area');
  });

  it('warns when the band is too narrow to fit anything across', () => {
    const sug = suggestSpliceBand({ farFloorHz: 560, sdCm2: 255 });
    expect(sug.band).not.toBeNull();
    expect(sug.note).toContain('narrower than');
  });

  /** One quantity, two spellings, one conversion — both directions. */
  it('converts between a band and the centre/width the project stores', () => {
    const band = bandOf(632.4555320336759, 0.6780719051126377);
    expect(band[0]).toBeCloseTo(500, 6);
    expect(band[1]).toBeCloseTo(800, 6);
    const back = centreOf([500, 800]);
    expect(back.transitionHz).toBeCloseTo(632.4555320336759, 9);
    expect(back.blendOct).toBeCloseTo(0.6780719051126377, 9);
  });
});

describe('I-2 — the port weight', () => {
  /** Keele weights each radiator by its diameter; diameter and area are ONE
   *  quantity. Hand-checked: a 74 mm mouth against a 180.2 mm cone is g 0.411,
   *  halved over two woofers is 0.205 — the numbers Sanders August header
   *  records as `0.5 x poort (g=0.41, 50/50 over beide woofers)`. */
  it('reproduces Sanders 0.5 x port at g 0.41 from the diameters alone', () => {
    const coneDiaMm = 2 * Math.sqrt((255 * 1e-4) / Math.PI) * 1000;
    expect(coneDiaMm).toBeCloseTo(180.2, 1);
    const w = portWeight({ portDiaMm: 74, coneDiaMm, sharedBy: 2 });
    expect(w.weight).not.toBeNull();
    expect(w.weight!).toBeCloseTo(0.20534, 5);
    expect(w.note).toContain('1/2 × port');
    expect(w.note).toContain('g 0.411');
  });

  it('has NO default and names the field that is missing', () => {
    expect(portWeight({ portDiaMm: null, coneDiaMm: 180, sharedBy: 2 }).weight).toBeNull();
    expect(portWeight({ portDiaMm: 74, coneDiaMm: null, sharedBy: 2 }).weight).toBeNull();
    const noShare = portWeight({ portDiaMm: 74, coneDiaMm: 180, sharedBy: null });
    expect(noShare.weight).toBeNull();
    expect(noShare.note).toContain('how many drivers share this port');
  });

  /** A port given without a weight is NOT summed, and the merge says so — the
   *  one direction that cannot silently double the low end. */
  it('does not sum a port it cannot weight', () => {
    const s = MEASURED.onderwerpen.mid;
    const withPort = mergeNearField({
      farText: casus1(s.ff),
      farName: s.ff,
      nearText: casus1(s.nf),
      nearName: s.nf,
      portText: casus1(s.nf),
      portName: 'a port',
      portWeight: null,
      spliceBandHz: s.splice_band_hz,
      step: s.stap_model,
    })!;
    const plain = mergeOf('mid').merge;
    expect(withPort.notes.join(' ')).toContain('NOT summed');
    expect(withPort.spl).toEqual(plain.spl);
  });

  /** …and one it CAN weight moves the answer, or the field would be decoration. */
  it('sums a port it can weight, and it changes the low end', () => {
    const s = MEASURED.onderwerpen.mid;
    const withPort = mergeNearField({
      farText: casus1(s.ff),
      farName: s.ff,
      nearText: casus1(s.nf),
      nearName: s.nf,
      portText: casus1(s.nf),
      portName: 'a port',
      portWeight: 0.5,
      spliceBandHz: s.splice_band_hz,
      step: s.stap_model,
    })!;
    const plain = mergeOf('mid').merge;
    const i = withPort.freq.findIndex((f) => f >= 50);
    // The same file at weight 0.5 is 1 + 0.5 = 1.5x the pressure: +3.52 dB,
    // which the level fit then takes straight back out — so the DIFFERENCE
    // below the blend is zero and the fitted GAIN is what moved.
    expect(withPort.fit.levelDb).toBeCloseTo(plain.fit.levelDb - 20 * Math.log10(1.5), 3);
    expect(withPort.spl[i]).toBeCloseTo(plain.spl[i], 6);
    expect(withPort.notes.join(' ')).toContain('summed into the near field at weight 0.500');
  });
});

describe('I-2 — where the merged response may be believed', () => {
  it('reaches as far down as the near field when the cone is the whole radiator', () => {
    const v = suggestValidFrom({ enclosure: 'sealed', boxTuneHz: 88.8, portSummed: false, nearLowestHz: 5.1, gridLowestHz: 20.5, farFloorHz: 396.7 });
    expect(v.hz).toBeCloseTo(20.5, 6);
    expect(v.mustBeStated).toBe(false);
    expect(v.reason).toContain('sealed');
  });

  /** Sanders own answer, derived: with the port summed his woofers declare
   *  20.5 Hz, and his header says the ~80 Hz alternative is the one WITHOUT it. */
  it('reaches that far on a reflex box too, but only with the port summed', () => {
    const withPort = suggestValidFrom({ enclosure: 'reflex', boxTuneHz: 31.3, portSummed: true, nearLowestHz: 5.1, gridLowestHz: 20.5, farFloorHz: 396.7 });
    expect(withPort.hz).toBeCloseTo(20.5, 6);
    expect(withPort.reason).toContain('port is summed');
  });

  /**
   * WITHOUT THE PORT THE APP CANNOT ANSWER, and does not. Not f_b and not a
   * multiple of it: at the tuning the cone is at its MINIMUM and the port is
   * carrying the output, so the cone-only error is largest exactly there and
   * does not fall off in a direction a factor could capture.
   */
  it('refuses to state a floor for a reflex box whose port was not measured', () => {
    const v = suggestValidFrom({ enclosure: 'reflex', boxTuneHz: 31.3, portSummed: false, nearLowestHz: 5.1, gridLowestHz: 20.5, farFloorHz: 396.7 });
    expect(v.hz).toBeNull();
    expect(v.mustBeStated).toBe(true);
    expect(v.reason).toContain('31.3');
    expect(v.reason).toContain('largest at the tuning');
  });

  it('never reaches below the grid it is written on', () => {
    const v = suggestValidFrom({ enclosure: 'sealed', boxTuneHz: null, portSummed: false, nearLowestHz: 5, gridLowestHz: 100, farFloorHz: null });
    expect(v.hz).toBe(100);
  });
});

/* ==================================================================== *
 * 5 — The three checks
 * ==================================================================== */

describe('I-2 — the three checks', () => {
  it('check 1 reproduces its recorded reading on all three real merges', () => {
    for (const [key, s] of Object.entries(MEASURED.onderwerpen)) {
      const { merge } = mergeOf(key);
      const c = spliceBandCheck(merge, s.splice_band_hz);
      expect(c.reading, key).toBe(s.controle_1.lezing);
      expect(c.ok, key).toBe(s.controle_1.ok);
    }
  });

  /**
   * AND ALL THREE FAIL IT, which is the finding rather than a reason to move
   * the number: ±0.5 dB is a convention Sander wrote down, and no merge in this
   * repository achieves it — his own August header records a splice residual of
   * −1.57…+1.77 dB. The check colours and blocks nothing (F0).
   */
  it('check 1 is not vacuous: it fails on every merge this project contains', () => {
    for (const [key, s] of Object.entries(MEASURED.onderwerpen)) {
      expect(s.controle_1.ok, key).toBe(false);
    }
    // …and it can pass, or "fails on everything" would be indistinguishable
    // from a check wired to false. A merge of a file with ITSELF agrees exactly.
    const s = MEASURED.onderwerpen.mid;
    const self = mergeNearField({
      farText: casus1(s.ff),
      farName: s.ff,
      nearText: casus1(s.ff),
      nearName: s.ff,
      spliceBandHz: s.splice_band_hz,
      step: null,
    })!;
    const c = spliceBandCheck(self, s.splice_band_hz);
    expect(c.ok).toBe(true);
    expect(SPLICE_CHECK_TOLERANCE_DB).toBe(0.5);
  });

  it('check 1 declines rather than judging when the band holds too few points', () => {
    const { merge } = mergeOf('mid');
    const c = spliceBandCheck(merge, [1000, 1001]);
    expect(c.ok).toBeNull();
    expect(c.why).toContain('too few');
  });

  /** Check 2 on the real cabinet: casus 1 has three merged drivers on one
   *  baffle, so the mid's shelf can be read against both woofers' empirical
   *  steps — the comparison M-1 did by hand. */
  it('check 2 reproduces its recorded reading on the real baffle', () => {
    const peers: StepPeer[] = (['up', 'down'] as const).map((w) => {
      const text = casus1(`Koan_W_${w}_merged_ingespeeld_mild.frd`);
      const m = parseFrd(text);
      const blk = parseArtaHeader(parseTabular(text).comments).merge!;
      const near = parseFrd(casus1(`woofer_${w}_near.txt`));
      return {
        name: `woofer_${w}`,
        mergedFreq: m.freq,
        mergedSpl: m.spl,
        nearFreq: near.freq,
        nearSpl: near.spl,
        nearPhase: near.phase,
        spliceGainDb: blk.spliceGainDb!,
      };
    });
    const c = stepShapeCheck({ hz: 440, depthDb: 6 }, 500, peers);
    expect(c.reading).toBe(MEASURED.controle_2.lezing);
    expect(c.ok).toBe(MEASURED.controle_2.ok);
    expect(c.why).toContain('woofer_up');
    expect(c.why).toContain('woofer_down');
  });

  it('check 2 says NOT APPLICABLE rather than passing vacuously', () => {
    expect(stepShapeCheck({ hz: 440, depthDb: 6 }, 500, []).ok).toBeNull();
    expect(stepShapeCheck({ hz: 440, depthDb: 6 }, 500, []).why).toContain('no other driver');
    expect(stepShapeCheck(null, 500, []).why).toContain('no step model');
  });

  /** Hand calculation: a peer whose empirical step IS the shelf reads zero. */
  it('check 2 reads zero when the peer carries exactly this shelf', () => {
    const freq = Array.from({ length: 400 }, (_, i) => 50 * 2 ** (i / 100));
    const shelf = baffleStepShelfDb(freq, 440, 6);
    const nearSpl = freq.map(() => 90);
    const peer: StepPeer = {
      name: 'twin',
      mergedFreq: freq,
      mergedSpl: shelf.map((v) => v + 90 - 7),
      nearFreq: freq,
      nearSpl,
      nearPhase: freq.map(() => 0),
      spliceGainDb: -7,
    };
    const c = stepShapeCheck({ hz: 440, depthDb: 6 }, 500, [peer]);
    expect(c.ok).toBe(true);
    expect(Number.parseFloat(c.reading!)).toBeLessThan(0.02);
  });

  /** …and moves when the peer's step is a different depth, or the reading is
   *  not a function of the peer at all. */
  it('check 2 moves when the peer carries a different step', () => {
    const freq = Array.from({ length: 400 }, (_, i) => 50 * 2 ** (i / 100));
    const nearSpl = freq.map(() => 90);
    const peerOf = (depth: number): StepPeer => ({
      name: `d${depth}`,
      mergedFreq: freq,
      mergedSpl: baffleStepShelfDb(freq, 440, depth).map((v) => v + 90 - 7),
      nearFreq: freq,
      nearSpl,
      nearPhase: freq.map(() => 0),
      spliceGainDb: -7,
    });
    const a = Number.parseFloat(stepShapeCheck({ hz: 440, depthDb: 6 }, 500, [peerOf(6)]).reading!);
    const b = Number.parseFloat(stepShapeCheck({ hz: 440, depthDb: 6 }, 500, [peerOf(3)]).reading!);
    expect(b).toBeGreaterThan(a + 1);
  });

  it('check 3 sees a sweep that stayed put, and one that did not', () => {
    const z = { name: 'mid.lim', raw: casus1('mid.lim') };
    const ok = sweepUntouchedCheck(z, { name: z.name, raw: z.raw });
    expect(ok.ok).toBe(true);
    expect(ok.reading).toContain(textChecksum(z.raw));
    expect(sweepUntouchedCheck(z, { name: z.name, raw: z.raw + ' ' }).ok).toBe(false);
    expect(sweepUntouchedCheck(z, null).ok).toBe(false);
    expect(sweepUntouchedCheck(null, null).ok).toBeNull();
  });

  it('check 3s checksum separates files that differ by one character', () => {
    expect(textChecksum('a')).not.toBe(textChecksum('b'));
    expect(textChecksum('')).toBe(textChecksum(''));
  });
});

/* ==================================================================== *
 * 6 — P2 and P4 on the merge itself
 * ==================================================================== */

describe('I-2 — what the merge does and does not assume', () => {
  it('applies no step at all when no step is stated (P4)', () => {
    const s = MEASURED.onderwerpen.mid;
    const none = mergeNearField({
      farText: casus1(s.ff),
      farName: s.ff,
      nearText: casus1(s.nf),
      nearName: s.nf,
      spliceBandHz: s.splice_band_hz,
      step: null,
    })!;
    expect(none.stepModelSensitivityDb).toBeNull();
    // A half-space near field without the step reads HIGH at the bottom, and
    // that difference is the whole reason the model exists.
    const withStep = mergeOf('mid').merge;
    const i = none.freq.findIndex((f) => f >= 100);
    expect(none.spl[i] - withStep.spl[i]).toBeGreaterThan(1);
  });

  it('says how much measured near field the far field s grid leaves behind', () => {
    const { merge } = mergeOf('mid');
    expect(merge.notes.join(' ')).toContain('is not carried');
  });

  it('reports that the two halves state different time origins, and what that costs', () => {
    const { merge } = mergeOf('mid');
    expect(merge.timeReferenceNote).toContain('DIFFERENT reference times');
    expect(merge.timeReferenceNote).toContain('not an acoustic-centre distance');
  });

  it('refuses on a band that is not a band, and on a file that is not a response', () => {
    const s = MEASURED.onderwerpen.mid;
    const base = { farText: casus1(s.ff), farName: s.ff, nearText: casus1(s.nf), nearName: s.nf, step: null };
    expect(mergeNearField({ ...base, spliceBandHz: [800, 500] })).toBeNull();
    expect(mergeNearField({ ...base, spliceBandHz: [0, 500] })).toBeNull();
    expect(mergeNearField({ ...base, farText: 'not a response', spliceBandHz: [500, 800] })).toBeNull();
  });
});

/* ==================================================================== *
 * 7 — Does the APP call any of this, and where?
 * ==================================================================== */

/**
 * A SOURCE SCAN, and it exists for the reason UI-1 exists: everything above
 * tests a function, and what a function test cannot reach is whether the app
 * calls it. The layer after `handleV2Request` went untested for months and did
 * the wrong thing the whole time; a merge that never reaches the response, or
 * one that is applied without the designer seeing the checks, would look
 * exactly as green.
 */
describe('I-2 — the app wiring', () => {
  const APP = readFileSync(join(HERE, '..', 'App.tsx'), 'utf8');

  it('puts the merge with the measurement upload, not in the Filters panel', () => {
    const slot = APP.slice(APP.indexOf('className="nf-slot"'), APP.indexOf('drop-anywhere-hint'));
    expect(slot).toContain('runNearFieldMerge(role)');
    expect(slot).toContain('acceptNearFieldMerge(role)');
    expect(slot).toContain('undoNearFieldMerge(role)');
    const panel = readFileSync(join(HERE, '..', 'components', 'EngineV2Panel.tsx'), 'utf8');
    expect(panel).not.toContain('runNearFieldMerge');
  });

  /** The whole difference from the live splice above it: nothing is applied on
   *  the way past. The response changes in exactly one function. */
  it('changes the branch response only from accept and undo', () => {
    for (const setter of ['setWoofer(', 'setMidDrv(', 'setTweeter(']) {
      const hits = APP.split(setter).length - 1;
      expect(hits, setter).toBeGreaterThan(0);
    }
    const accept = APP.slice(APP.indexOf('const acceptNearFieldMerge'), APP.indexOf('const undoNearFieldMerge'));
    expect(accept).toContain('setWoofer(next)');
    // The far field is KEPT — and a re-merge must not overwrite that ingredient
    // with the previous merge, so only a first accept records it.
    expect(accept).toContain('far: n[role].far ?? { name: loaded.name, raw: loaded.raw }');
    // `runNearFieldMerge` builds and stores a preview and touches nothing else.
    const run = APP.slice(APP.indexOf('const runNearFieldMerge'), APP.indexOf('const acceptNearFieldMerge'));
    expect(run).toContain('setNfPreview(');
    expect(run).not.toContain('setWoofer(');
    expect(run).not.toContain('setMidDrv(');
    expect(run).not.toContain('setTweeter(');
  });

  /**
   * THE DOUBLE-MERGE GUARD. The live splice and a written merge answer the same
   * question; running both stacks two baffle-step models and two level fits on
   * one branch. Accepting a merge leaves the near field in the slot on purpose,
   * so without this line the collision is the NORMAL case rather than an edge.
   */
  it('does not merge a response that already declares a merge', () => {
    const memo = APP.slice(APP.indexOf('const merged = useMemo'), APP.indexOf('const nfPreview'));
    expect(memo).toContain('if (readMergeBlock(loaded.raw)) continue;');
  });

  /** The file is written in one place, and only into the preview. */
  it('writes a merged file only through the preview', () => {
    expect(APP.split('renderMergedFrd(').length - 1).toBe(1);
    const run = APP.slice(APP.indexOf('const runNearFieldMerge'), APP.indexOf('const acceptNearFieldMerge'));
    expect(run).toContain('renderMergedFrd({');
  });

  /** Every refusal names the input it is missing (P4) — none of them fills one in. */
  it('refuses by naming the missing input rather than substituting one', () => {
    const run = APP.slice(APP.indexOf('const runNearFieldMerge'), APP.indexOf('const acceptNearFieldMerge'));
    expect(run).toContain('fail(w.note)');
    expect(run).toContain('fail(suggested.reason)');
    expect(run).not.toMatch(/\?\?\s*440/);
    expect(run).not.toMatch(/\|\|\s*500/);
  });

  /** The class the panel gives these fields is the class the register files
   *  them under, and it is NICE: without a merge everything runs. */
  it('files the merge inputs as NICE TO HAVE', async () => {
    const { V2_INPUT_REGISTER } = await import('./v2InputRegister.ts');
    for (const id of ['nearFieldCone', 'nearFieldPort', 'spliceBand', 'mergeValidFrom']) {
      const row = V2_INPUT_REGISTER.find((r) => r.id === id);
      expect(row, id).toBeDefined();
      expect(row!.cls, id).toBe('nice');
      expect(row!.form, id).toContain('Near field');
    }
  });
});
