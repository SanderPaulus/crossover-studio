import { useEffect, useRef, useState } from 'react';
import { Modal } from './Modal';
import { t } from '../lib/i18n';
import { farFieldVerdict, floorBounceGate, trueOffAxisDeg } from '../lib/cabinet';

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
      aria-label={t("Side view: microphone distance versus each driver's true angle")}
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
              {t(d.name)} {ang.toFixed(0)}°
            </text>
          </g>
        );
      })}
      <circle cx={micX} cy={refY} r={5} className="mg-mic" />
      <text x={micX} y={refY - 12} className="mg-lbl mg-mic-lbl">
        {t('mic')}
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
  const rad = (deg * Math.PI) / 180;
  const micX = cx + micMm * s * Math.cos(rad);
  const micY = cy - micMm * s * Math.sin(rad);
  const depth = Math.max(14, 260 * s);
  const half = Math.max(8, 150 * s);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mg-svg" role="img" aria-label={t('Top view: the turntable rotates the cabinet, the microphone stays put')}>
      <line x1={cx} y1={cy} x2={cx + micMm * s} y2={cy} className="mg-axis" />
      <path
        d={`M ${cx} ${cy} L ${cx + 46} ${cy} A 46 46 0 0 ${deg >= 0 ? 0 : 1} ${
          cx + 46 * Math.cos(rad)
        } ${cy - 46 * Math.sin(rad)} Z`}
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
        {deg}° {t('(the cabinet)')}
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
    <Modal open={open} onClose={onClose} label={t('How to measure')} cardClass="help-card mg-card">
      <div className="mg-head">
        <h2>📐 {t('How to measure')}</h2>
        <button type="button" className="icon" aria-label={t('Close the measuring guide')} onClick={onClose}>
          ✕
        </button>
      </div>

      <p>
        {t("Every window and warning this tool derives rests on one thing: what your angle measurements actually captured. That is decided before you touch the software — by where you aimed the microphone and how far away it stood. The illustrations below run on the app's own geometry, so what you see here is exactly what the optimizer will use.")}
      </p>

      <h3>1 · {t('Choose a reference point, and aim at it')}</h3>
      <p>
        {t('Pick one spot on the baffle — the tweeter is the usual choice — and treat it as the origin of everything: the mic points at it, the turntable turns around it, and every driver position you enter is measured from it. Write it down; a measurement whose reference you cannot name is a measurement you cannot interpret later.')}
      </p>

      <h3>2 · {t('Stand far enough back')}</h3>
      <p>
        {t('You sweep')} <em>{t('horizontally')}</em>{t(' — but there is a second angle you never chose. A driver sitting below the reference point has the microphone somewhere above it, so the line from that driver to the mic already runs at an angle')}{' '}
        <strong>{t('before the turntable moves at all')}</strong>{t('. It is there at every horizontal step, it is set purely by how far back you stand, and it is invisible in the files.')}
      </p>
      <p>
        {t('The side view below shows only that unavoidable part. Drag the microphone and watch it shrink:')}
      </p>
      <figure className="mg-stage">
        <SideView micMm={micMm} />
        <figcaption>
          <strong>{t('Side view — the angle you did not choose.')}</strong>{' '}
          {t('The crosshair is the reference point and the dashed line is where the mic is aimed; every driver below it looks up at the microphone. This is not a measurement you take — it is where the driver sits. Drawn to scale, so the cabinet genuinely shrinks as you back away, and with it this angle.')}
        </figcaption>
      </figure>
      <label className="mg-slider">
        {t('Mic distance')}
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
        {t('Put the two together — your horizontal sweep on top of the vertical offset above — and this is the angle each driver was')} <em>{t('actually')}</em> {t('measured at:')}
      </p>
      <table className="mg-table">
        <thead>
          <tr>
            <th>{t('driver')}</th>
            <th>{t('you turned to 0°, it saw')}</th>
            <th>{t('you turned to 30°, it saw')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td style={{ color: r.color }}>{t(r.name)}</td>
              <td>{r.at0.toFixed(0)}°</td>
              <td>{r.at30.toFixed(0)}°</td>
            </tr>
          ))}
        </tbody>
      </table>
      {ff && (
        <p className={ff.ok ? 'mg-ok' : 'mg-warn'}>
          {ff.ok
            ? t('At {d} mm the mic is {r}× the source size — far field, the curves mean what they say.', { d: micMm, r: ff.ratio.toFixed(1) })
            : t('At {d} mm the mic is only {r}× the source size (a 300 mm baffle). Directivity read from this is indicative at best.', { d: micMm, r: ff.ratio.toFixed(1) })}
        </p>
      )}
      <p>
        {t('For a full-size three-way,')} <strong>{t('measure at 1.5–2 m')}</strong>{t(', and never below 1 m. The "three times the baffle" figure is a rule of thumb its own sources label as one; the argument that actually settles it is')} <em>{t('relative timing')}</em>{t(". Design at one distance and listen at another, and every driver's path length changes by a different amount — which lands directly in the crossover phase:")}
      </p>
      <table className="mg-table">
        <thead>
          <tr>
            <th>{t('designed at')}</th>
            <th>{t('woofer–mid error @300 Hz')}</th>
            <th>{t('mid–tweeter error @2.5 kHz')}</th>
          </tr>
        </thead>
        <tbody>
          {[
            ['0.5 m', '36°', '68°'],
            ['1.0 m', '17°', '28°'],
            ['1.5 m', '9°', '14°'],
            ['2.0 m', '4°', '7°'],
          ].map(([d, a, b]) => (
            <tr key={d}>
              <td>{d}</td>
              <td>{a}</td>
              <td>{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        {t('(Relative to a 3 m listening position, for a tower with the mid 180 mm and the woofer 450 mm below the tweeter.) Sixty-eight degrees at the mid–tweeter is the difference between a flat sum and a visible suck-out — in a tool that otherwise lands within a few degrees. Backing away does cost gate length, so measure')}{' '}
        <strong>{t('high')}</strong>{t(' — around half your room height — and put something soft on the floor and ceiling along the reflection path.')}
      </p>

      <h3>3 · {t('The floor decides how low your measurement is worth anything')}</h3>
      <p>
        {t('Indoors you are not measuring a response, you are measuring the first few milliseconds of one. The gate has to close before the floor bounce arrives, and whatever window you get, the measurement is only trustworthy above roughly')}{' '}
        <strong>{t('1 / gate')}</strong>{t(': a 5 ms window means 200 Hz, and it is already a couple of dB out by the time it gets there.')}
      </p>
      <p>
        {t('Here is the trap, and it is the reason step 2 is not free. Backing away lengthens the direct path more than it lengthens the bounce, so the window')}{' '}
        <em>{t('shrinks')}</em>{' '}
        {t("exactly as you fix the far-field problem. Height is what buys it back — these are your slider's distance against three stand heights, computed by the same function the app uses:")}
      </p>
      <table className="mg-table">
        <thead>
          <tr>
            <th>{t('speaker + mic at')}</th>
            <th>{t('gate')}</th>
            <th>{t('valid above')}</th>
          </tr>
        </thead>
        <tbody>
          {[800, 1200, 1600].map((h) => {
            const g = floorBounceGate(micMm, h);
            return (
              <tr key={h}>
                <td>{(h / 1000).toFixed(1)} m</td>
                <td>{g ? `${g.gateMs.toFixed(2)} ms` : '—'}</td>
                <td>{g ? `${Math.round(g.fromHz)} Hz` : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p>
        {t('So:')} <strong>{t('get everything up in the air')}</strong>{t(' — a metre and a half beats a metre by more than backing away costs you — and put the stand out in the room rather than against a wall. Below the gate limit there are two honest ways out, and guessing is not one of them: splice in a')}{' '}
        <strong>{t('near-field')}</strong>{t(' measurement (Import → near-field slot; the app matches level and delay and crossfades in the complex domain), or measure the low end')}{' '}
        <strong>{t('ground plane')}</strong>{t(' — speaker and microphone both on the floor, so the reflection merges with the direct sound and there is no bounce left to gate. Ground plane costs you a known +6 dB and needs the cabinet laid over, but it hands back the 100–500 Hz region that a stand measurement cannot reach.')}
      </p>

      <h3>4 · {t('One clock for every sweep')}</h3>
      <p>
        {t('This is the step the whole tool stands on. Designing on measured phase only works if all your driver files share')}{' '}
        <em>{t('one')}</em>{' '}
        {t('time origin — then the difference between their arrival times is real, and it is the 40–50 µs that decides whether your crossover sums or cancels. Break it and nothing downstream can tell.')}
      </p>
      <ul>
        <li>
          <strong>{t('Do not move the microphone')}</strong>{' '}
          {t('between driver sweeps, and do not move the speaker either. One position, every driver.')}
        </li>
        <li>
          <strong>{t('Never re-zero the time axis')}</strong>{' '}
          {t('per file — no "set t=0 at the peak", no per-file offset removal on export. That throws away exactly the number you came for.')}
        </li>
        <li>
          <strong>{t('Give the rig a shared reference.')}</strong>{' '}
          {t('With an audio interface, a')} <em>loopback</em>{t("-channel is the strongest form. With a USB microphone there is no loopback, so use your software's")}{' '}
          <em>{t('acoustic timing reference')}</em>{t(': a second speaker that plays on every sweep and stays put relative to the mic (it has to reach 5 kHz — a sub cannot do this job).')}
        </li>
      </ul>
      <p>
        {t('The app checks your work: load the drivers and the topbar reports a')}{' '}
        <strong>{t('timing verdict')}</strong>{t('. "Plausible" means the arrival-time difference is within what driver geometry can explain; anything else means the clock moved, and the honest response is to re-measure rather than to design on it.')}
      </p>

      <h3>5 · {t('Keep the radius constant, centred on the reference point')}</h3>
      <p>
        {t('The angle in a file name belongs to the')} <strong>{t('box')}</strong>{t('. What matters is that every angle is taken at the')}{' '}
        <em>{t('same distance')}</em>{' '}
        {t('from the same reference point — swing the microphone on an arc around it, or turn the speaker beneath it; for a vertically stacked cabinet the two are geometrically identical, and the distance to every driver stays exactly constant either way.')}
      </p>
      <p>
        {t('Turning the')} <strong>{t('speaker')}</strong>{' '}
        {t('is still the safer habit, for a reason that has nothing to do with angles: the microphone then stays in one spot in the room, so every curve carries the same reflections. A microphone that travels meets a different floor, wall and ceiling path at each step, and whatever your gate does not remove ends up looking like directivity. The one case where the geometry itself bites is a driver mounted')}{' '}
        <em>{t('off-centre horizontally')}</em>{t(' — 90 mm to one side already shifts its level by half a decibel across a 30° sweep.')}
      </p>
      <figure className="mg-stage">
        <TopView micMm={micMm} deg={Math.round(deg)} />
        <figcaption>
          <strong>{t('Top view — the angle you do choose.')}</strong>{' '}
          {t('The microphone never moves; the cabinet turns about the reference point. This is the number in your file names, and it belongs to the box: every driver turns through it together, on top of whatever vertical offset it already had.')}
        </figcaption>
      </figure>
      <label className="mg-slider">
        {t('Sweep angle')}
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
            {playing ? t('pause') : t('play')}
          </button>
        )}
      </label>

      <h3>6 · {t('Measure the impedance separately')}</h3>
      <p>
        {t('Impedance is electrical: distance, angle and room do not enter into it. Measure each driver')}
        <em> {t('in its finished cabinet')}</em>{' '}
        {t("though — the box is what puts the resonance where it is, and this tool reads the driver's Fs straight off that peak to set a crossover floor. ARTA/LIMP")}{' '}
        <code>.lim</code>{t('-files import directly.')}
      </p>

      <h3>7 · {t('Note these down while you are still at the speaker')}</h3>
      <ul>
        <li>
          <strong>{t('Reference point')}</strong>{' '}
          {t('— which driver or spot, and how far below the top of the baffle it sits.')}
        </li>
        <li>
          <strong>{t('Mic distance')}</strong>, {t('in mm.')}
        </li>
        <li>
          <strong>{t("Each driver's centre")}</strong>{' '}
          {t('relative to the reference point: x to the right, y up (so a driver below it is negative).')}
        </li>
        <li>
          <strong>{t('Baffle width and height')}</strong>{' '}
          {t(', and the enclosure behind each driver — sealed, ported (with its tuning), or open.')}
        </li>
        <li>
          <strong>Sd {t('and')} Xmax</strong> {t('from the datasheets, once per driver.')}
        </li>
      </ul>
      <p>
        {t('All of it goes into')} <strong>Setup → {t('Cabinet & drivers')}</strong>{t('. Nothing there changes your measurements — it lets the app work out what those measurements captured, and say so instead of guessing.')}
      </p>
    </Modal>
  );
}
