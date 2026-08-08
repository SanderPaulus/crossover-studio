import { describe, it, expect } from 'vitest';
import {
  C_AIR_MM_S,
  geometricPathExcessMm,
  measuringDistanceVerdict,
  listeningDelayShiftUs,
  baffleStepHz,
  floorBounceGate,
  gateLimitHz,
  boxRolloff,
  centreToCentreMm,
  farFieldVerdict,
  listeningAngleDeg,
  depthForExcessMm,
  nearestEdgeMm,
  opposedAnglesDeg,
  pathBreakdownMm,
  oppositeFacing,
  pistonDiameterMm,
  radiatingPanelWidthMm,
  rotationLevelOffsetDb,
  trueOffAxisDeg,
  unloadingRisk,
  wavelengthMm,
} from './cabinet.ts';

describe('true off-axis angle of a measurement', () => {
  it('a vertically offset driver is ALREADY off-axis at nominal 0 degrees', () => {
    // Driver 250 mm below the mic reference, measured at 500 mm.
    const d = { xMm: 0, yMm: -250 };
    expect(trueOffAxisDeg(d, 500, 0)!).toBeCloseTo(26.6, 0);
    // ...and its "30 degree" curve is really 39 degrees off ITS axis.
    expect(trueOffAxisDeg(d, 500, 30)!).toBeCloseTo(39.2, 0);
  });

  it('distance is what fixes it — the same driver at 1.5 m means what it says', () => {
    const d = { xMm: 0, yMm: -250 };
    expect(trueOffAxisDeg(d, 1500, 0)!).toBeCloseTo(9.5, 0);
    expect(trueOffAxisDeg(d, 1500, 30)!).toBeCloseTo(31, 0);
    // The SPAN a nominal 0-30 sweep really covers converges on the intended
    // 30 degrees as the mic backs off — it never quite reaches it, because the
    // "0 degree" reading always carries the driver's own offset angle.
    const err = (r: number) => Math.abs(30 - (trueOffAxisDeg(d, r, 30)! - trueOffAxisDeg(d, r, 0)!));
    expect(err(500)).toBeGreaterThan(err(1500));
    expect(err(1500)).toBeGreaterThan(err(3000));
    expect(err(3000)).toBeLessThan(5);
  });

  it('a driver AT the reference point measures exactly what it claims', () => {
    const d = { xMm: 0, yMm: 0 };
    for (const a of [0, 10, 20, 30, 45]) {
      expect(trueOffAxisDeg(d, 500, a)!).toBeCloseTo(a, 6);
    }
  });

  it('folds in a fixed rig ELEVATION, and the sign is decisive', () => {
    // A driver 380 mm below the reference, measured at 500 mm. Tilting the rig
    // by ten degrees moves the true angle by twelve — which is exactly why the
    // field is signed and not assumed.
    const d = { xMm: 0, yMm: -380 };
    expect(trueOffAxisDeg(d, 500, 0, 0)!).toBeCloseTo(37.2, 0);
    // Mic BELOW the reference plane looks straighter at a low driver...
    expect(trueOffAxisDeg(d, 500, 0, -10)!).toBeCloseTo(30.7, 0);
    // ...and above it, more obliquely.
    expect(trueOffAxisDeg(d, 500, 0, 10)!).toBeCloseTo(43.5, 0);
  });

  it('elevation alone IS the off-axis angle for a driver at the reference', () => {
    const at = { xMm: 0, yMm: 0 };
    expect(trueOffAxisDeg(at, 500, 0, -10)!).toBeCloseTo(10, 6);
    expect(trueOffAxisDeg(at, 500, 0, 10)!).toBeCloseTo(10, 6);
    // Horizontal and vertical combine as arccos(cos h * cos v).
    const combined = trueOffAxisDeg(at, 500, 30, 10)!;
    const expected =
      (Math.acos(Math.cos((30 * Math.PI) / 180) * Math.cos((10 * Math.PI) / 180)) * 180) / Math.PI;
    expect(combined).toBeCloseTo(expected, 6);
  });

  it('defaults to a level rig, so existing behaviour is unchanged', () => {
    const d = { xMm: 0, yMm: -250 };
    expect(trueOffAxisDeg(d, 500, 30)).toBe(trueOffAxisDeg(d, 500, 30, 0));
  });

  it('rejects a missing distance', () => {
    expect(trueOffAxisDeg({ xMm: 0, yMm: 0 }, 0, 30)).toBeNull();
  });
});

describe('level offset from rig geometry alone', () => {
  it('is ZERO for a driver on the vertical rotation axis', () => {
    // Turning about a vertical axis cannot change the distance to a driver
    // directly above or below it — however far off-axis it sits.
    expect(rotationLevelOffsetDb({ xMm: 0, yMm: -250 }, 500, 30)!).toBeCloseTo(0, 9);
  });

  it('appears for a HORIZONTALLY offset driver, and shrinks with distance', () => {
    const d = { xMm: 100, yMm: -250 };
    const near = rotationLevelOffsetDb(d, 500, 30)!;
    const far = rotationLevelOffsetDb(d, 2000, 30)!;
    // Turning toward the driver brings it closer: the off-axis curve reads HIGHER.
    expect(near).toBeLessThan(0);
    expect(Math.abs(near)).toBeGreaterThan(0.5);
    expect(Math.abs(far)).toBeLessThan(Math.abs(near) / 3);
  });
});

describe('far-field verdict', () => {
  it('calls 50 cm on a wide baffle what it is', () => {
    const v = farFieldVerdict(500, { baffleWidthMm: 300, driverDiameterMm: 250 })!;
    expect(v.sourceMm).toBe(300);
    expect(v.ratio).toBeCloseTo(1.67, 2);
    expect(v.ok).toBe(false);
  });

  it('passes a normal 1.5 m measurement', () => {
    expect(farFieldVerdict(1500, { baffleWidthMm: 300 })!.ok).toBe(true);
  });

  it('needs a source size to say anything', () => {
    expect(farFieldVerdict(500)).toBeNull();
  });
});

describe('piston diameter from Sd', () => {
  it('inverts the cone area', () => {
    // A nominal 8" driver is about 220 cm2 -> ~167 mm effective diameter.
    expect(pistonDiameterMm(220)!).toBeCloseTo(167, 0);
    // A 1" dome, 7 cm2.
    expect(pistonDiameterMm(7)!).toBeCloseTo(29.9, 0);
    expect(pistonDiameterMm(0)).toBeNull();
  });
});

describe('how low the measurement reaches', () => {
  it('quantifies the trade every measurement makes', () => {
    // Reference 1 m above the floor, mic level with it. Backing away improves
    // the far field and SHORTENS the gate — the two rules pull opposite ways,
    // and this is the table that makes the compromise a decision.
    const at = (m: number) => floorBounceGate(m * 1000, 1000)!;
    expect(at(0.5).fromHz).toBeCloseTo(220, -1);
    expect(at(1).fromHz).toBeCloseTo(277, -1);
    expect(at(1.5).fromHz).toBeCloseTo(343, -1);
    expect(at(3).fromHz).toBeCloseTo(566, -1);
    // Monotone: further away is always a shorter window.
    expect(at(0.5).gateMs).toBeGreaterThan(at(1).gateMs);
    expect(at(1).gateMs).toBeGreaterThan(at(3).gateMs);
  });

  it('a taller stand buys low end', () => {
    // Same distance, speaker higher off the floor -> later bounce -> lower f.
    expect(floorBounceGate(1000, 1500)!.fromHz).toBeLessThan(floorBounceGate(1000, 800)!.fromHz);
  });

  it('follows the mic when the rig is tilted', () => {
    const level = floorBounceGate(1000, 1000, 0)!;
    const up = floorBounceGate(1000, 1000, 10)!;
    // Mic raised: it moves away from the floor, so the bounce arrives later.
    expect(up.gateMs).toBeGreaterThan(level.gateMs);
  });

  it('needs both numbers, and refuses nonsense', () => {
    expect(floorBounceGate(0, 1000)).toBeNull();
    expect(floorBounceGate(1000, 0)).toBeNull();
    expect(gateLimitHz(4)).toBeCloseTo(250, 6);
    expect(gateLimitHz(0)).toBeNull();
  });
});

describe('spacing, edges, baffle step', () => {
  it('derives centre-to-centre instead of asking for it twice', () => {
    expect(centreToCentreMm({ xMm: 0, yMm: 0 }, { xMm: 0, yMm: -300 })).toBeCloseTo(300, 6);
    expect(centreToCentreMm({ xMm: 40, yMm: 0 }, { xMm: 0, yMm: -30 })).toBeCloseTo(50, 6);
  });

  it('baffle step follows 115/W', () => {
    expect(baffleStepHz(300)!).toBeCloseTo(383, 0);
    expect(baffleStepHz(0)).toBeNull();
  });

  it('finds the nearest edge, and it is not always the side', () => {
    const baffle = { widthMm: 300, heightMm: 1000, refFromTopMm: 200 };
    // A driver on the centre line 100 mm below the reference: sides are 150,
    // the top edge is 300 away -> the side wins.
    expect(nearestEdgeMm({ xMm: 0, yMm: -100 }, baffle)!).toBeCloseTo(150, 6);
    // Push it 100 mm right and the right edge is closest.
    expect(nearestEdgeMm({ xMm: 100, yMm: -100 }, baffle)!).toBeCloseTo(50, 6);
    // A driver just under the top edge.
    expect(nearestEdgeMm({ xMm: 0, yMm: 150 }, baffle)!).toBeCloseTo(50, 6);
  });
});

describe('where the listener sits', () => {
  it('turns a spacing rule into a statement about the room', () => {
    // Reference 1000 mm up, ears at 900 mm, 3 m away -> just under 2 degrees.
    expect(listeningAngleDeg(1000, 900, 3)!).toBeCloseTo(1.9, 1);
    // Same speaker, listener much closer: the angle grows.
    expect(listeningAngleDeg(1000, 900, 1)!).toBeGreaterThan(listeningAngleDeg(1000, 900, 3)!);
    // Ears above the axis reads negative.
    expect(listeningAngleDeg(900, 1100, 3)!).toBeLessThan(0);
    expect(listeningAngleDeg(1000, 900, 0)).toBeNull();
  });
});

describe('what the box already does', () => {
  it('a sealed box is a 2nd-order high-pass you do not have to buy', () => {
    expect(boxRolloff('sealed').order).toBe(2);
    expect(boxRolloff('sealed').canRadiate).toBe(false);
    expect(boxRolloff('ported').order).toBe(4);
    // Only an opening can put its own midrange into the room.
    expect(boxRolloff('ported').canRadiate).toBe(true);
    expect(boxRolloff('open').canRadiate).toBe(true);
    expect(boxRolloff('unknown').order).toBe(0);
    expect(boxRolloff('unknown').note).toBe('');
  });

  it('flags the ported unloading below Fb', () => {
    expect(unloadingRisk('ported')).toBe('high');
    expect(unloadingRisk('sealed')).toBe('none');
  });
});

describe('wavelength helper', () => {
  it('reads the geometry numbers out loud', () => {
    expect(wavelengthMm(343)).toBeCloseTo(1000, 6);
    // The 30-degree null of a 300 mm pair sits where half a wavelength is 150 mm.
    expect(wavelengthMm(1143) / 2).toBeCloseTo(150, 0);
  });
});

describe('measuring-rig geometry inside a measured delay (Sanders question)', () => {
  const at = (yMm: number) => ({ xMm: 0, yMm });

  it('separates the oblique path from the acoustic centre', () => {
    // A measured arrival is total path / c, and part of that path is simply
    // the mic sitting at a finite distance while the driver sits higher.
    // Sanders' centre: mid 70 mm from the reference point, mic at 500 mm.
    const mid = geometricPathExcessMm(at(70), 500)!;
    expect(mid).toBeCloseTo(4.88, 2);
    expect((mid / C_AIR_MM_S) * 1e6).toBeCloseTo(14.2, 1);
    // The reference point itself contributes nothing, by definition.
    expect(geometricPathExcessMm(at(0), 500)).toBeCloseTo(0, 10);
    // And it SHRINKS with distance — the whole reason this matters.
    expect(geometricPathExcessMm(at(70), 3000)!).toBeLessThan(mid / 4);
  });

  it('judges the measuring distance in degrees at the handover, not in µs', () => {
    // A time shift is only as harmful as the frequency it lands on: the same
    // 12 µs is a shrug at 2 kHz and a real error at 8 kHz, so the verdict has
    // to know where the drivers hand over.
    const at48k = (us: number) => measuringDistanceVerdict(us, 4800)!;
    // Sanders' centre measured at 500 mm: 11.8 µs → 20° → act.
    expect(at48k(11.8).deg).toBeCloseTo(20.4, 0);
    expect(at48k(11.8).verdict).toBe('act');
    // The same set measured at 1.8 m: 1.6 µs → under 3° → nothing to do.
    expect(at48k(1.6).verdict).toBe('fine');
    // Sign is irrelevant — only the size of the error matters.
    expect(at48k(-11.8).verdict).toBe('act');
    // The SAME shift at a low handover is harmless: frequency is half the
    // judgement, which is the whole reason this is not a µs threshold.
    expect(measuringDistanceVerdict(11.8, 400)!.verdict).toBe('fine');
    expect(measuringDistanceVerdict(5, 0)).toBeNull();
  });

  it('the measure→listen shift is what a filter aligned at the mic gets wrong', () => {
    const shift = listeningDelayShiftUs(
      { low: at(50), mid: at(70), high: at(0) },
      500,
      3000,
    )!;
    // The tweeter is at the reference point, so its oblique path is zero at
    // both distances: it does not move, and everything else moves toward it.
    expect(shift.high).toBeCloseTo(11.8, 1);
    expect(shift.mid).toBeCloseTo(0, 6);
    // Earliest driver normalised to 0 — only the differences are audible.
    expect(Math.min(...Object.values(shift))).toBeCloseTo(0, 10);
    // Measuring where you listen leaves nothing to correct.
    const none = listeningDelayShiftUs({ low: at(50), high: at(0) }, 2000, 2000)!;
    for (const v of Object.values(none)) expect(v).toBeCloseTo(0, 10);
  });
});

describe('drivers that are not on the front baffle', () => {
  // A friend's speaker with side-firing woofers. The whole point of these
  // fields is that they change numbers the app SHOWS — they never touch the
  // measured data, so the engine is unaffected either way.
  const side = { xMm: 0, yMm: -300, depthMm: 150, facing: 'right' as const };

  it('a side woofer is already 90 degrees off ITS OWN axis at a nominal 0', () => {
    // The turntable turns the CABINET. A front sweep says nothing about this
    // driver's own directivity, and the old baffle-plane model claimed it did.
    expect(trueOffAxisDeg(side, 1000, 0)!).toBeGreaterThan(80);
    // Turning the cabinet towards the driver's side brings it back on-axis.
    const toward = trueOffAxisDeg(side, 1000, 90)!;
    expect(toward).toBeLessThan(trueOffAxisDeg(side, 1000, 0)!);
  });

  it('front-facing drivers on the baffle are bit-identical to the old model', () => {
    // The generalisation must not move a single existing number: every 2-way
    // tower this app has ever seen is this case.
    const plain = { xMm: 40, yMm: -250 };
    const spelled = { xMm: 40, yMm: -250, depthMm: 0, facing: 'front' as const };
    for (const a of [0, 10, 30]) {
      expect(trueOffAxisDeg(spelled, 500, a)).toBe(trueOffAxisDeg(plain, 500, a));
      expect(rotationLevelOffsetDb(spelled, 500, a)).toBe(rotationLevelOffsetDb(plain, 500, a));
    }
    expect(centreToCentreMm(spelled, plain)).toBe(0);
  });

  it('splits mounting depth out of a measured delay — the reason for all this', () => {
    // Half a cabinet back is ~150 mm ≈ 437 µs of pure geometry. Charged to the
    // driver it reads as an acoustic centre a third of a metre out of line,
    // which is what trips the timing check on a perfectly ordinary speaker.
    const b = pathBreakdownMm(side, 1000)!;
    expect(b.mountingMm).toBeCloseTo(144.5, 1);
    expect((b.mountingMm / C_AIR_MM_S) * 1e6).toBeCloseTo(421, 0);
    // The split is exact by construction, never an approximation.
    expect(b.rigMm + b.mountingMm).toBeCloseTo(b.totalMm, 10);
    // And the rig share is what the same driver would have on the baffle.
    expect(b.rigMm).toBeCloseTo(geometricPathExcessMm({ xMm: 0, yMm: -300 }, 1000)!, 10);
  });

  it('the two halves behave differently with distance — the reason to split them', () => {
    // Stepping back drives the rig share to nothing, while the mounting share
    // CONVERGES on the real depth (close up the offset and the depth partly
    // share a direction, so it starts lower). Measured, not assumed: 133 mm at
    // 500 mm, 149.6 at 4 m, against a true 150.
    const near = pathBreakdownMm(side, 500)!;
    const far = pathBreakdownMm(side, 4000)!;
    expect(near.rigMm).toBeCloseTo(83.1, 1);
    expect(far.rigMm).toBeLessThan(near.rigMm / 4);
    expect(near.mountingMm).toBeCloseTo(132.8, 1);
    expect(far.mountingMm).toBeCloseTo(149.6, 1);
    expect(far.mountingMm).toBeLessThan(150);
  });

  it('counts the depth in centre-to-centre spacing (it lobes just as hard)', () => {
    const tweeter = { xMm: 0, yMm: 0 };
    // 300 mm down and 150 mm back: the separation is the 3-D distance.
    expect(centreToCentreMm(side, tweeter)).toBeCloseTo(Math.hypot(300, 150), 6);
  });

  it('measures a side driver against the SIDE panel, not the front baffle', () => {
    // Tall narrow cabinets are exactly the ones that use side woofers, so the
    // front width is the wrong number by a factor of two or more.
    const box = { widthMm: 200, heightMm: 1000, depthMm: 400 };
    expect(radiatingPanelWidthMm('front', box)).toBe(200);
    expect(radiatingPanelWidthMm('right', box)).toBe(400);
    expect(radiatingPanelWidthMm(undefined, box)).toBe(200);
    // Baffle step follows the panel it actually radiates from.
    expect(baffleStepHz(radiatingPanelWidthMm('right', box)!)!).toBeCloseTo(287.5, 1);
    expect(baffleStepHz(radiatingPanelWidthMm('front', box)!)!).toBeCloseTo(575, 1);
  });

  it('says nothing about a side driver\u2019s edges rather than guessing', () => {
    const noDepth = { widthMm: 200, heightMm: 1000, refFromTopMm: 100 };
    // Without a box depth there is no side panel to measure against; silently
    // falling back to the front baffle would be a confident wrong answer.
    expect(nearestEdgeMm(side, noDepth)).toBeNull();
    const withDepth = { ...noDepth, depthMm: 400 };
    // 150 mm from the front, 250 mm from the back, 200 mm below the reference:
    // the front edge is nearest.
    expect(nearestEdgeMm(side, withDepth)!).toBeCloseTo(150, 6);
  });
});

describe('the rest of the cabinet shapes a designer actually builds', () => {
  it('a rear-firing driver points away from the microphone', () => {
    // Ambience tweeters and bipoles. 180 deg at a nominal 0 is not a quirk:
    // it says a front sweep measures the room's reflection, not the driver.
    const rear = { xMm: 0, yMm: 0, facing: 'rear' as const, depthMm: 300 };
    expect(trueOffAxisDeg(rear, 1000, 0)!).toBeCloseTo(180, 6);
    // Its baffle is the back panel — same width as the front, not the depth.
    const box = { widthMm: 200, heightMm: 1000, depthMm: 400 };
    expect(radiatingPanelWidthMm('rear', box)).toBe(200);
  });

  it('a sloped baffle aims the driver, and it is not a rounding error', () => {
    // Same argument that justified the rig's elevation field, mirrored: it
    // tilts the microphone, this tilts the driver.
    const flat = { xMm: 0, yMm: -250 };
    expect(trueOffAxisDeg(flat, 500, 0)!).toBeCloseTo(26.6, 1);
    // The driver sits BELOW the reference, so aiming it UP points it at the
    // microphone and the true angle drops.
    expect(trueOffAxisDeg({ ...flat, tiltDeg: 6 }, 500, 0)!).toBeCloseTo(20.6, 1);
    // Aiming it away does the opposite, by the same amount.
    expect(trueOffAxisDeg({ ...flat, tiltDeg: -6 }, 500, 0)!).toBeCloseTo(32.6, 1);
    // Zero tilt is exactly the untilted form — no drift for the common case.
    expect(trueOffAxisDeg({ ...flat, tiltDeg: 0 }, 500, 30)).toBe(trueOffAxisDeg(flat, 500, 30));
  });

  it('tilt aims an up-firing driver towards the front, not sideways', () => {
    // The only direction anyone aims an up- or down-firing driver on purpose.
    const up = { xMm: 0, yMm: 0, facing: 'up' as const };
    expect(trueOffAxisDeg(up, 1000, 0)!).toBeCloseTo(90, 6);
    // Tilted a full 90 deg towards the front it becomes a front driver.
    expect(trueOffAxisDeg({ ...up, tiltDeg: 90 }, 1000, 0)!).toBeCloseTo(0, 6);
  });

  it('an opposed pair has TWO true angles, and refuses to average them', () => {
    // Force-cancelling side woofers: the standard way to build them. One
    // number here would be a fiction — at 0 deg both are 90 deg off, and
    // turning the cabinet splits them apart.
    const pair = { xMm: 0, yMm: -300, depthMm: 150, facing: 'right' as const, opposed: true };
    const at0 = opposedAnglesDeg(pair, 2000, 0)!;
    expect(at0.nearDeg).toBeCloseTo(at0.farDeg, 0);
    const at30 = opposedAnglesDeg(pair, 2000, 30)!;
    expect(at30.farDeg - at30.nearDeg).toBeGreaterThan(50);
    // Not opposed = nothing to report; the plain angle already covers it.
    expect(opposedAnglesDeg({ ...pair, opposed: false }, 2000, 30)).toBeNull();
  });

  it('opposite panels really are opposite', () => {
    expect(oppositeFacing('left')).toBe('right');
    expect(oppositeFacing('front')).toBe('rear');
    expect(oppositeFacing('up')).toBe('down');
  });
});

describe('working the mounting depth out of the measurement', () => {
  // "You know where the mid is and you have the delays — surely you can work
  // out how deep the tweeter sits?" Yes: subtract the rig from the measured
  // arrival and what is left is the depth. It has to be SOLVED though, not
  // subtracted, because the depth's contribution is not its own length.
  const drv = { xMm: 0, yMm: -300 };

  it('round-trips a known depth exactly', () => {
    for (const depth of [0, 9.1, 40, 150, 400]) {
      const excess = geometricPathExcessMm({ ...drv, depthMm: depth }, 500)!;
      expect(depthForExcessMm(drv, 500, excess)!).toBeCloseTo(depth, 6);
    }
  });

  it('beats subtracting, and by more the deeper the driver sits', () => {
    // The naive "measured minus rig" is short because close up the offset and
    // the depth partly share a direction. This is the error being removed.
    const depth = 150;
    const excess = geometricPathExcessMm({ ...drv, depthMm: depth }, 500)!;
    const rig = geometricPathExcessMm(drv, 500)!;
    const naive = excess - rig;
    expect(naive).toBeCloseTo(132.8, 1); // 11% short of the true 150
    expect(depthForExcessMm(drv, 500, excess)!).toBeCloseTo(150, 6);
  });

  it('refuses rather than clamps when no depth explains the path', () => {
    // Less than the rig's own share means the driver sits in FRONT of the
    // baffle plane — that is a measurement to question, not a zero to report.
    const rig = geometricPathExcessMm(drv, 500)!;
    expect(depthForExcessMm(drv, 500, rig - 5)).toBeNull();
  });
});
