import { describe, it, expect } from 'vitest';
import {
  C_AIR_MM_S,
  geometricPathExcessMm,
  listeningDelayShiftUs,
  baffleStepHz,
  floorBounceGate,
  gateLimitHz,
  boxRolloff,
  centreToCentreMm,
  farFieldVerdict,
  listeningAngleDeg,
  nearestEdgeMm,
  pistonDiameterMm,
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
