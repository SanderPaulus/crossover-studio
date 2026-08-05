import { useEffect, useRef, useState } from 'react';
import { Modal } from './Modal';
import { farFieldVerdict, trueOffAxisDeg } from '../lib/cabinet';

/**
 * How to take the measurements this tool designs on — as a guide you can
 * OPERATE rather than read.
 *
 * The two illustrations are driven by the same `trueOffAxisDeg` the engine
 * uses, so the guide cannot drift from the app: drag the microphone back and
 * the picture, the numbers and the optimizer's own windows all move together.
 * That is the whole reason it is in the app instead of in a PDF.
 *
 * Motion is purposeful: nothing moves for decoration. The sweep animation
 * exists because the point — that a turntable turns the CABINET, not each
 * driver — is a motion, and a still frame cannot make it. It is a yoyo loop,
 * it stops the moment you touch a control, and `prefers-reduced-motion`
 * removes it entirely (the sliders still teach the same thing by hand).
 */

/** The example three-way: driver offsets from the reference point, mm.
 *  Deliberately the geometry that caused the confusion this guide is about. */
const DEMO = [
  { name: 'Tweeter', yMm: 0, r: 9, color: 'var(--viz-tweeter)' },
  { name: 'Midrange', yMm: -120, r: 16, color: 'var(--viz-mid)' },
  { name: 'Woofer', yMm: -380, r: 30, color: 'var(--viz-woofer)' },
] as const;

const usePrefersReducedMotion = (): boolean => {
  const [reduced, setReduced] = useState(
    () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    if (typeof matchMedia !== 'function') return undefined;
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
};

/** SIDE view: the vertical geometry, which is where "already off-axis at 0°"
 *  comes from. One isotropic scale, so every angle you see is the real one —
 *  the cabinet genuinely shrinks as the mic backs off, and that shrinking IS
 *  the lesson. */
function SideView({ micMm }: { micMm: number }) {
  const W = 460;
  const H = 300;
  const padL = 30;
  const padR = 34;
  const padT = 26;
  const padB = 26;
  const lowest = Math.min(...DEMO.map((d) => d.yMm));
  const aboveMm = 120; // cabinet above the reference point
  const belowMm = -lowest + 140; // cabinet below the lowest driver
  // ONE isotropic scale, fitted to whichever axis binds — angles are only
  // honest if x and y share a scale, so the drawing may never stretch.
  const s = Math.min(
    (W - padL - padR) / micMm,
    (H - padT - padB) / (aboveMm + belowMm),
  );
  const refX = padL;
  const refY = padT + aboveMm * s;
  const micX = refX + micMm * s;
  // Crop the frame to what is actually drawn. The scale must stay isotropic
  // (or the angles lie), so backing the mic off genuinely shrinks the cabinet
  // — but the empty space it leaves behind is just empty space.
  const viewH = Math.min(H, padT + (aboveMm + belowMm) * s + padB);
  const px = (mm: number) => -mm * s; // +y up in physics, down in SVG
  const cabTop = refY + px(aboveMm);
  const cabBot = refY + px(lowest - 140);
  const cabW = Math.max(10, 150 * s);

  return (
    <svg
      viewBox={`0 0 ${W} ${viewH}`}
      className="mg-svg"
      role="img"
      aria-label="Side view: microphone distance versus each driver's true angle"
    >
      <rect
        x={refX - cabW}
        y={cabTop}
        width={cabW}
        height={Math.max(6, cabBot - cabTop)}
        rx={Math.min(6, cabW / 4)}
        className="mg-cab"
      />
      {/* Reference axis: the line the mic is aimed along. */}
      <line x1={refX} y1={refY} x2={micX} y2={refY} className="mg-axis" />
      {DEMO.map((d) => {
        const y = refY + px(d.yMm);
        const ang = trueOffAxisDeg({ xMm: 0, yMm: d.yMm }, micMm, 0) ?? 0;
        return (
          <g key={d.name}>
            <line x1={refX} y1={y} x2={micX} y2={refY} className="mg-ray" style={{ stroke: d.color }} />
            <circle cx={refX} cy={y} r={Math.max(3, d.r * s)} className="mg-drv" style={{ fill: d.color }} />
            <text
              x={refX + Math.max(3, d.r * s) + 8}
              y={y + 4}
              className="mg-lbl"
              style={{ fill: d.color }}
            >
              {d.name} {ang.toFixed(0)}°
            </text>
          </g>
        );
      })}
      <circle cx={micX} cy={refY} r={5} className="mg-mic" />
      <text x={micX} y={refY - 12} className="mg-lbl mg-mic-lbl">
        mic
      </text>
      {/* The reference point is marked, not labelled: a caption under the
          drawing reads better than text competing with the driver labels. */}
      <path
        d={`M ${refX - 9} ${refY} h 18 M ${refX} ${refY - 9} v 18`}
        className="mg-cross"
      />
    </svg>
  );
}

/** TOP view: what the turntable actually does. The mic stays put and the
 *  CABINET turns — which is why the nominal angle belongs to the box and not
 *  to any one driver. */
function TopView({ micMm, deg }: { micMm: number; deg: number }) {
  const W = 460;
  const H = 300;
  const cx = 46;
  const cy = 150;
  const s = (W - cx - 40) / micMm;
  const t = (deg * Math.PI) / 180;
  const micX = cx + micMm * s * Math.cos(t);
  const micY = cy - micMm * s * Math.sin(t);
  const depth = Math.max(14, 260 * s);
  const half = Math.max(8, 150 * s);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mg-svg" role="img" aria-label="Top view: the turntable rotates the cabinet, the microphone stays put">
      <line x1={cx} y1={cy} x2={cx + micMm * s} y2={cy} className="mg-axis" />
      <path
        d={`M ${cx} ${cy} L ${cx + 46} ${cy} A 46 46 0 0 ${deg >= 0 ? 0 : 1} ${
          cx + 46 * Math.cos(t)
        } ${cy - 46 * Math.sin(t)} Z`}
        className="mg-arc"
      />
      <g transform={`rotate(${-deg} ${cx} ${cy})`}>
        <rect x={cx - depth} y={cy - half} width={depth} height={half * 2} rx={3} className="mg-cab" />
        <line x1={cx} y1={cy - half} x2={cx} y2={cy + half} className="mg-baffle" />
        <circle cx={cx} cy={cy} r={5} className="mg-drv" style={{ fill: 'var(--viz-tweeter)' }} />
      </g>
      <line x1={cx} y1={cy} x2={micX} y2={micY} className="mg-ray" />
      <circle cx={micX} cy={micY} r={5} className="mg-mic" />
      <text x={cx + 52} y={cy - 10} className="mg-lbl mg-ref-lbl">
        {deg}° (the cabinet)
      </text>
    </svg>
  );
}

export function MeasuringGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [micMm, setMicMm] = useState(500);
  const [deg, setDeg] = useState(0);
  const [playing, setPlaying] = useState(true);
  const reduced = usePrefersReducedMotion();
  const raf = useRef(0);

  // Yoyo loop over the sweep. Stops on any manual input — an animation that
  // fights the user is worse than none.
  useEffect(() => {
    if (!open || !playing || reduced) return undefined;
    let dir = 1;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      setDeg((d) => {
        const next = d + dir * dt * 0.012;
        if (next >= 30) dir = -1;
        if (next <= 0) dir = 1;
        return Math.max(0, Math.min(30, next));
      });
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [open, playing, reduced]);

  const ff = farFieldVerdict(micMm, { baffleWidthMm: 300 });
  const rows = DEMO.map((d) => ({
    name: d.name,
    color: d.color,
    at0: trueOffAxisDeg({ xMm: 0, yMm: d.yMm }, micMm, 0) ?? 0,
    at30: trueOffAxisDeg({ xMm: 0, yMm: d.yMm }, micMm, 30) ?? 0,
  }));

  return (
    <Modal open={open} onClose={onClose} label="How to measure" cardClass="help-card mg-card">
      <div className="mg-head">
        <h2>📐 How to measure</h2>
        <button type="button" className="icon" aria-label="Close the measuring guide" onClick={onClose}>
          ✕
        </button>
      </div>

      <p>
        Every window and warning this tool derives rests on one thing: what your angle
        measurements actually captured. That is decided before you touch the software — by where
        you aimed the microphone and how far away it stood. The illustrations below run on the
        app&apos;s own geometry, so what you see here is exactly what the optimizer will use.
      </p>

      <h3>1 · Choose a reference point, and aim at it</h3>
      <p>
        Pick one spot on the baffle — the tweeter is the usual choice — and treat it as the origin
        of everything: the mic points at it, the turntable turns around it, and every driver
        position you enter is measured from it. Write it down; a measurement whose reference you
        cannot name is a measurement you cannot interpret later.
      </p>

      <h3>2 · Stand far enough back</h3>
      <p>
        You sweep <em>horizontally</em> — but there is a second angle you never chose. A driver
        sitting below the reference point has the microphone somewhere above it, so the line from
        that driver to the mic already runs at an angle{' '}
        <strong>before the turntable moves at all</strong>. It is there at every horizontal step,
        it is set purely by how far back you stand, and it is invisible in the files.
      </p>
      <p>
        The side view below shows only that unavoidable part. Drag the microphone and watch it
        shrink:
      </p>
      <figure className="mg-stage">
        <SideView micMm={micMm} />
        <figcaption>
          <strong>Side view — the angle you did not choose.</strong> The crosshair is the
          reference point and the dashed line is where the mic is aimed; every driver below it
          looks up at the microphone. This is not a measurement you take — it is where the driver
          sits. Drawn to scale, so the cabinet genuinely shrinks as you back away, and with it
          this angle.
        </figcaption>
      </figure>
      <label className="mg-slider">
        Mic distance
        <input
          type="range"
          min={300}
          max={3000}
          step={50}
          value={micMm}
          onChange={(e) => {
            setPlaying(false);
            setMicMm(Number(e.target.value));
          }}
        />
        <output>{micMm} mm</output>
      </label>
      <p className="mg-tablenote">
        Put the two together — your horizontal sweep on top of the vertical offset above — and
        this is the angle each driver was <em>actually</em> measured at:
      </p>
      <table className="mg-table">
        <thead>
          <tr>
            <th>driver</th>
            <th>you turned to 0°, it saw</th>
            <th>you turned to 30°, it saw</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td style={{ color: r.color }}>{r.name}</td>
              <td>{r.at0.toFixed(0)}°</td>
              <td>{r.at30.toFixed(0)}°</td>
            </tr>
          ))}
        </tbody>
      </table>
      {ff && (
        <p className={ff.ok ? 'mg-ok' : 'mg-warn'}>
          {ff.ok
            ? `At ${micMm} mm the mic is ${ff.ratio.toFixed(1)}× the source size — far field, the curves mean what they say.`
            : `At ${micMm} mm the mic is only ${ff.ratio.toFixed(1)}× the source size (a 300 mm baffle). Directivity read from this is indicative at best.`}
        </p>
      )}
      <p>
        The working rule is <strong>at least three times the largest dimension of the baffle</strong>,
        and further is better. Trade the extra reflections for it: a gate that has to be shorter is
        a smaller problem than angles that mean something other than what they say.
      </p>

      <h3>3 · Turn the cabinet, not the microphone</h3>
      <p>
        The angle in a file name belongs to the <strong>box</strong>. Rotate the speaker about the
        reference point and leave the mic exactly where it is — moving the mic around an arc
        changes the distance to every driver as well as the angle, and the two are then impossible
        to separate afterwards.
      </p>
      <figure className="mg-stage">
        <TopView micMm={micMm} deg={Math.round(deg)} />
        <figcaption>
          <strong>Top view — the angle you do choose.</strong> The microphone never moves; the
          cabinet turns about the reference point. This is the number in your file names, and it
          belongs to the box: every driver turns through it together, on top of whatever vertical
          offset it already had.
        </figcaption>
      </figure>
      <label className="mg-slider">
        Sweep angle
        <input
          type="range"
          min={0}
          max={30}
          step={1}
          value={Math.round(deg)}
          onChange={(e) => {
            setPlaying(false);
            setDeg(Number(e.target.value));
          }}
        />
        <output>{Math.round(deg)}°</output>
        {!reduced && (
          <button type="button" onClick={() => setPlaying((p) => !p)}>
            {playing ? 'pause' : 'play'}
          </button>
        )}
      </label>

      <h3>4 · Measure the impedance separately</h3>
      <p>
        Impedance is electrical: distance, angle and room do not enter into it. Measure each driver
        <em> in its finished cabinet</em> though — the box is what puts the resonance where it is,
        and this tool reads the driver&apos;s Fs straight off that peak to set a crossover floor.
        ARTA/LIMP <code>.lim</code> files import directly.
      </p>

      <h3>5 · Note these down while you are still at the speaker</h3>
      <ul>
        <li>
          <strong>Reference point</strong> — which driver or spot, and how far below the top of the
          baffle it sits.
        </li>
        <li>
          <strong>Mic distance</strong>, in mm.
        </li>
        <li>
          <strong>Each driver&apos;s centre</strong> relative to the reference point: x to the
          right, y up (so a driver below it is negative).
        </li>
        <li>
          <strong>Baffle width and height</strong>, and the enclosure behind each driver — sealed,
          ported (with its tuning), or open.
        </li>
        <li>
          <strong>Sd and Xmax</strong> from the datasheets, once per driver.
        </li>
      </ul>
      <p>
        All of it goes into <strong>Setup → Cabinet &amp; drivers</strong>. Nothing there changes
        your measurements — it lets the app work out what those measurements captured, and say so
        instead of guessing.
      </p>
    </Modal>
  );
}
