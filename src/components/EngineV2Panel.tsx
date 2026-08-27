import type { ReactNode } from 'react';
import type { EngineV2Report } from '../lib/engine2/report';
import type { CapabilityCell } from '../lib/engine2/capability';

/**
 * DELIVERABLE 4 — the Engine v2 report panel.
 *
 * Visible only when the toggle is on, and everything it draws carries the
 * "Engine v2" mark plus the module version. That is a hard requirement of the
 * deliverable and not decoration: this layer's numbers are experimental, they
 * sit next to the shipping engine's numbers on the same screen, and a reader
 * has to be able to tell in one glance which is which.
 *
 * Three rules run through the layout, all of them from the specification
 * rather than from taste:
 *
 *  - A METRIC THAT IS OFF IS SHOWN, WITH ITS REASON (P4 / A5.3). The
 *    capability matrix is the first thing after the header, before any value,
 *    because "which constraints are active" is the question a designer has to
 *    answer before reading a single number.
 *  - EVERY VALUE CARRIES ITS COVERAGE (A5.5). The band a number was computed
 *    on sits under the number, never in a tooltip.
 *  - AN UNCALIBRATED NUMBER SAYS SO WHERE IT IS READ. M-H's severity weighting
 *    and the crossover ceiling that hangs off it are marked in place.
 *
 * Presentation only: no state, no computation. Everything shown comes from
 * `buildReport`, so what the panel says and what the tests assert are the same
 * object.
 */

const hz = (v: number | null | undefined): string =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : `${Math.round(v)} Hz`;
const db = (v: number | null | undefined, digits = 2): string =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v.toFixed(digits)} dB`;
const ohm = (v: number | null | undefined): string =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v.toFixed(2)} Ω`;
const num = (v: number | null | undefined, digits = 2): string =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(digits);

function Section({ title, spec, children }: { title: string; spec?: string; children: ReactNode }) {
  return (
    <section className="v2-section">
      <h4>
        {title}
        {spec && <span className="v2-spec">{spec}</span>}
      </h4>
      {children}
    </section>
  );
}

/** The coverage line that sits under every value. */
function Coverage({ text, flagged }: { text: string; flagged: boolean }) {
  return <div className={flagged ? 'v2-coverage v2-flag' : 'v2-coverage'}>{text}</div>;
}

function CapabilityGrid({ cells, subjects, metrics }: {
  cells: CapabilityCell[];
  subjects: string[];
  metrics: string[];
}) {
  const at = (m: string, s: string) => cells.find((c) => c.metric === m && c.subject === s);
  return (
    <div className="v2-scroll">
      <table className="v2-table">
        <thead>
          <tr>
            <th>Metric</th>
            {subjects.map((s) => (
              <th key={s}>{s}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.map((m) => {
            const any = cells.find((c) => c.metric === m)!;
            return (
              <tr key={m}>
                <th scope="row">
                  {m} <span className="v2-muted">{any.title}</span>
                  {any.uncalibrated && <span className="v2-uncal" title={any.uncalibrated}>uncalibrated</span>}
                </th>
                {subjects.map((s) => {
                  const cell = at(m, s);
                  if (!cell) return <td key={s} className="v2-na">·</td>;
                  return (
                    <td key={s} className={cell.active ? 'v2-on' : 'v2-off'} title={cell.reasons.join('; ')}>
                      {cell.active ? 'on' : 'off'}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** A gate limit, rendered in the unit the gate speaks. */
function fmt(limit: number, gate: string): string {
  if (gate === 'M-A') return `${(limit * 100).toFixed(1)} %`;
  if (gate === 'M-C') return `${limit.toFixed(1)} dB`;
  return `${limit.toFixed(2)} Ω`;
}

/** A bound ceiling, in the unit a designer buys the part in. */
function boundText(maxSI: number, unit: 'Ω' | 'H' | 'F'): string {
  if (unit === 'H') return `${(maxSI * 1e3).toFixed(2)} mH`;
  if (unit === 'F') return `${(maxSI * 1e6).toFixed(1)} µF`;
  return `${maxSI.toFixed(2)} Ω`;
}

export interface EngineV2PanelProps {
  report: EngineV2Report;
  /** Set when the netlist's drivers could not be told apart by name. */
  ambiguous?: string | null;
}

export function EngineV2Panel({ report, ambiguous }: EngineV2PanelProps) {
  const { ingest, capability, metrics, predesign, system, gates } = report;

  return (
    <div className="panel v2-panel">
      <div className="v2-head">
        <h3>
          {report.engine.label} <span className="v2-badge">experimental</span>
        </h3>
        <div className="v2-stamp">
          {report.engine.mark} · session <code>{ingest.sessionId}</code> · estimators{' '}
          <code title={ingest.fingerprint}>{ingest.fingerprint.split(';').length} versioned</code>
        </div>
      </div>
      <p className="sub">
        The metric library, the ingest pass and the pre-design blocks, on the loaded design. The
        gates below are the ones the v2 optimisation path enforces; a limit you have not stated
        judges nothing, here or there.
      </p>

      {ambiguous && <p className="v2-problem">{ambiguous}</p>}
      {report.problems.map((p, i) => (
        <p className="v2-problem" key={i}>
          {p}
        </p>
      ))}

      <Section title="Hard gates" spec="A4 M-A/M-B/M-C · A2 P2/P4">
        <p className="v2-muted">
          Hard requirements, not weights: a gate is a feasibility question asked before the soft
          goals and never a penalty term beside them. A gate with no limit stated is OFF — its
          value is still shown, because a number you cannot see is a number you cannot judge.
        </p>
        <div className="v2-scroll">
          <table className="v2-table">
            <thead>
              <tr>
                <th>Gate</th>
                <th>Subject</th>
                <th>Reads</th>
                <th>Limit</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {gates.verdicts.map((v, i) => (
                <tr key={i}>
                  <td title={v.title}>
                    {v.gate} <span className="v2-muted">{v.specRef}</span>
                  </td>
                  <td>{v.subject}</td>
                  <td title={v.parameters ? Object.entries(v.parameters).map(([k, x]) => `${k}: ${x}`).join(' · ') : undefined}>
                    {v.reason}
                  </td>
                  <td>
                    {v.limit === null ? (
                      <span className="v2-muted">no limit set</span>
                    ) : (
                      `${v.direction === 'max' ? '≤' : '≥'} ${fmt(v.limit, v.gate)}`
                    )}
                  </td>
                  <td
                    className={
                      !v.active
                        ? 'v2-off'
                        : v.withinToleranceOnly
                          ? 'v2-on v2-tolerance'
                          : v.pass
                            ? 'v2-on'
                            : 'v2-fail'
                    }
                    title={v.withinToleranceOnly ? v.reason : undefined}
                  >
                    {!v.active
                      ? 'off'
                      : v.withinToleranceOnly
                        ? 'inside, on tolerance'
                        : v.pass
                          ? 'inside'
                          : 'EXCEEDED'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {gates.violation && <p className="v2-problem">{gates.violation}</p>}
        {gates.highPassProtected.length > 0 && (
          <p className="v2-muted">
            M-C applies to {gates.highPassProtected.join(', ')} — derived from each branch&rsquo;s own
            transfer (a rising flank below its passband), never from a way&rsquo;s name.
          </p>
        )}
      </Section>

      <Section title="Search-space bounds from measured budgets" spec="A5d.6">
        <p className="v2-muted">
          A budget you state is inverted through the measured impedance and near field into a
          ceiling on a component value, so the search never visits ground the budget forbids. State
          none and the search box is exactly the app&rsquo;s own.
        </p>
        {predesign.bounds.length === 0 ? (
          <p className="v2-muted">No budget stated — no bound.</p>
        ) : (
          <div className="v2-scroll">
            <table className="v2-table">
              <thead>
                <tr>
                  <th>Way</th>
                  <th>Bounded</th>
                  <th>Ceiling</th>
                  <th>From</th>
                </tr>
              </thead>
              <tbody>
                {predesign.bounds.map((b, i) => (
                  <tr key={i}>
                    <td>{b.subject}</td>
                    <td>
                      {b.quantity}
                      {b.slack && (
                        <span className="v2-uncal" title="A pre-bound: exact for a single section only, widened per order, and never a verdict — the gate is the authority (A5d.6).">
                          slack
                        </span>
                      )}
                    </td>
                    <td>{boundText(b.maxSI, b.unit)}</td>
                    <td title={Object.entries(b.parameters).map(([k, x]) => `${k}: ${x}`).join(' · ')}>
                      {String(b.parameters.formula ?? b.rule)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {predesign.boundNotes.map((n, i) => (
          <p className="v2-muted" key={i}>
            {n}
          </p>
        ))}
      </Section>

      <Section title="Capability matrix" spec="A5.3 · P4">
        <p className="v2-muted">
          Which metric can run for which driver or pair, and why not. A metric whose input is
          missing stays off — it is never evaluated on an assumed default.
        </p>
        <CapabilityGrid
          cells={capability.cells}
          subjects={capability.subjects}
          metrics={capability.metrics}
        />
        {capability.describeOff.length > 0 && (
          <details className="v2-details">
            <summary>{capability.describeOff.length} metrics are off — reasons</summary>
            <ul>
              {capability.describeOff.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </details>
        )}
      </Section>

      <Section title="Derived parameters per driver" spec="A5b · A5c">
        <div className="v2-scroll">
          <table className="v2-table">
            <thead>
              <tr>
                <th>Driver</th>
                <th>R_e</th>
                <th>Alignment</th>
                <th>f_s / f_c</th>
                <th>Voice coil</th>
                <th>Valid band (far field)</th>
                <th>Near-field ceiling</th>
              </tr>
            </thead>
            <tbody>
              {ingest.drivers.map((d) => (
                <tr key={d.driver}>
                  <th scope="row">{d.driver}</th>
                  <td title={d.re?.sourceText}>
                    {ohm(d.re?.ohm)}
                    {d.re && (
                      <span className="v2-muted">
                        {' '}
                        {d.re.source === 'entered'
                          ? 'entered'
                          : d.re.source === 'motional-fit'
                            ? 'fit'
                            : 'direct'}
                      </span>
                    )}
                    {d.re?.motionalProximityWarning && (
                      <span className="v2-warn" title={d.re.motionalProximityWarning}>
                        {' '}
                        overestimate
                      </span>
                    )}
                    {d.re?.reclassificationShift && (
                      <span className="v2-uncal" title={d.re.reclassificationShift}>
                        peak set moved
                      </span>
                    )}
                    {d.re && d.re.source !== 'direct' && (
                      <div className="v2-muted">
                        direct {ohm(d.re.directOhm)}
                        {d.re.motionalSkirtOhm !== null &&
                          ` (carries ${d.re.motionalSkirtOhm.toFixed(3)} Ω motional)`}
                        {d.re.fit && d.re.source === 'entered' && ` · fit ${ohm(d.re.fit.reOhm)}`}
                      </div>
                    )}
                    {d.re?.fit && (
                      <div className="v2-muted">
                        fit residual {d.re.fit.relativeResidual.toFixed(4)} · band sensitivity ±
                        {d.re.fit.bandSensitivityOhm.toFixed(3)} Ω
                        {d.re.fit.refusal && (
                          <span className="v2-warn" title={d.re.fit.refusal}>
                            {' '}
                            fit abstained
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td title={d.impedance?.reason}>{d.impedance?.type ?? '—'}</td>
                  <td>{hz(d.impedance?.fundamentalHz)}</td>
                  <td title={d.semiInductance?.reason}>
                    {d.semiInductance?.valid ? `n = ${num(d.semiInductance.n)}` : 'not determinable'}
                  </td>
                  <td title={d.onAxis?.bandReason.low}>
                    {d.onAxis ? `${hz(d.onAxis.bandHz[0])} – ${hz(d.onAxis.bandHz[1])}` : '—'}
                    {d.onAxis && !d.onAxis.bandFloorKnown && (
                      <span
                        className="v2-warn"
                        title="No detector could establish a gate floor for this measurement — the header carries no window fields. The bottom of this band is simply where the sweep starts, which is not the same claim."
                      >
                        {' '}
                        gate floor unknown
                      </span>
                    )}
                    {d.onAxis?.fineDetailFromHz && (
                      <span className="v2-muted"> (detail from {hz(d.onAxis.fineDetailFromHz)})</span>
                    )}
                    {d.onAxis &&
                      (d.onAxis.bandFloorProvenance === 'manual-window' ||
                        d.onAxis.bandFloorProvenance === 'manual-floor') && (
                        <span
                          className="v2-uncal"
                          title={`This floor is NOT from the file's header — it was entered by hand (${d.onAxis.bandFloorProvenance === 'manual-window' ? 'window times' : 'validity floor'}). A stated number, not a measured one; everything derived from it inherits that.`}
                        >
                          entered
                        </span>
                      )}
                  </td>
                  <td>{hz(d.nearFieldCeilingHz)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {ingest.drivers.map((d) =>
          d.notes.length === 0 && (d.breakups?.peaks.length ?? 0) === 0 ? null : (
            <details className="v2-details" key={d.driver}>
              <summary>{d.driver} — detail</summary>
              <ul>
                {d.impedance?.reflex && (
                  <li>
                    Vented: f_L {hz(d.impedance.reflex.fLHz)}, f_b {hz(d.impedance.reflex.fbHz)},
                    f_H {hz(d.impedance.reflex.fHHz)}, dip {ohm(d.impedance.reflex.zDipOhm)} —
                    √(f_L·f_H) = {hz(d.impedance.reflex.sqrtCheckHz)} (
                    {(d.impedance.reflex.sqrtCheckError * 100).toFixed(0)} % from f_b), loss
                    indicator Z(f_b)/R_e = {num(d.impedance.reflex.lossIndicator)}
                  </li>
                )}
                {d.impedance?.sealed && (
                  <li>
                    Sealed: f_c {hz(d.impedance.sealed.fcHz)}, Z_max {ohm(d.impedance.sealed.zMaxOhm)},
                    r₀ {num(d.impedance.sealed.r0)}, Q_mc {num(d.impedance.sealed.qmc)}, Q_ec{' '}
                    {num(d.impedance.sealed.qec)}, Q_tc {num(d.impedance.sealed.qtc)}
                  </li>
                )}
                {d.diffraction && (
                  <li>
                    Diffraction ripple {db(d.diffraction.rmsDb)} RMS; dominant detour{' '}
                    {d.diffraction.dominantPathMm === null
                      ? '—'
                      : `${d.diffraction.dominantPathMm.toFixed(0)} ± ${d.diffraction.pathResolutionMm.toFixed(0)} mm`}
                  </li>
                )}
                {d.directivity.map((x) => (
                  <li key={x.angleDeg}>
                    Directivity at {x.angleDeg}°: −3 dB {hz(x.minus3Hz)}, −6 dB {hz(x.minus6Hz)}
                    {x.effectiveRadiusM !== null &&
                      ` — effective radiating radius ${(x.effectiveRadiusM * 1000).toFixed(0)} mm`}
                  </li>
                ))}
                {d.baffleStep && (
                  <li>
                    FF/NF baffle-step fit: f₀ {hz(d.baffleStep.f0Hz)}, depth {db(d.baffleStep.depthDb, 1)},
                    residual {db(d.baffleStep.residualRmsDb)} RMS
                    {d.baffleStep.breaksBelowHz !== null &&
                      ` — stops fitting below ${hz(d.baffleStep.breaksBelowHz)}`}
                  </li>
                )}
                {(d.breakups?.peaks.length ?? 0) > 0 && (
                  <li>
                    Breakups:{' '}
                    {d.breakups!.peaks
                      .map(
                        (p) =>
                          `${hz(p.fHz)} +${p.dB.toFixed(1)} dB${p.q ? ` (Q ${p.q.toFixed(1)})` : ''}` +
                          (p.belowFineDetailFloor ? ' [shape not trusted: below 2/T]' : ''),
                      )
                      .join(', ')}
                  </li>
                )}
                {d.persistence.length > 0 && (
                  <li>
                    Off-axis persistence:{' '}
                    {d.persistence
                      .map(
                        (p) =>
                          `${hz(p.fHz)} ${p.onAxisDb.toFixed(1)}→${p.offAxisDb.toFixed(1)} dB at ${p.angleDeg}° (${p.persistent ? 'holds — real cone resonance' : 'collapses — interference'})`,
                      )
                      .join('; ')}
                  </li>
                )}
                {d.notes.map((n, i) => (
                  <li className="v2-warn" key={`n${i}`}>
                    {n}
                  </li>
                ))}
              </ul>
            </details>
          ),
        )}
      </Section>

      <Section title="Metrics" spec="A4 — reporting only">
        {!report.analysisGrid && (
          <p className="v2-muted">
            No filter is loaded, so every metric that needs a solved network stays off. The derived
            parameters above do not need one.
          </p>
        )}

        {metrics.dissipation && (
          <div className="v2-metric">
            <div className="v2-metric-head">
              <span className="v2-id">M-A</span> Dissipation
              <b>
                {(metrics.dissipation.totalFraction * 100).toFixed(1)} % of the amplifier power
                {metrics.dissipation.totalWatts !== null &&
                  ` (${metrics.dissipation.totalWatts.toFixed(1)} W)`}
              </b>
            </div>
            <div className="v2-muted">
              {metrics.dissipation.elements
                .filter((e) => !e.parasitic)
                .slice(0, 4)
                .map((e) => `${e.id} ${(e.fraction * 100).toFixed(1)} %${e.watts !== null ? ` / ${e.watts.toFixed(1)} W` : ''}`)
                .join(' · ')}
              {' · '}
              coil DCR and cap ESR add{' '}
              {((metrics.dissipation.totalWithParasiticsFraction - metrics.dissipation.totalFraction) * 100).toFixed(1)} %
            </div>
            <Coverage
              text={metrics.dissipation.coverage.describe}
              flagged={metrics.dissipation.coverage.flagged}
            />
          </div>
        )}

        {metrics.epdr && (
          <div className="v2-metric">
            <div className="v2-metric-head">
              <span className="v2-id">M-B</span> EPDR
              <b>
                {ohm(metrics.epdr.minOhm)} minimum at {hz(metrics.epdr.atHz)}
              </b>
            </div>
            <div className="v2-muted">
              bare |Z| minimum {ohm(metrics.epdr.minZOhm)} at {hz(metrics.epdr.minZAtHz)} · worst
              phase {metrics.epdr.worstPhaseDeg.toFixed(0)}° at {hz(metrics.epdr.worstPhaseAtHz)}
            </div>
            <Coverage text={metrics.epdr.coverage.describe} flagged={metrics.epdr.coverage.flagged} />
          </div>
        )}

        {metrics.driveVoltage.map((v) => (
          <div className="v2-metric" key={`c-${v.driver}`}>
            <div className="v2-metric-head">
              <span className="v2-id">M-C</span> Voltage on f_s — {v.driver}
              <b>{db(v.db, 1)} below the passband average</b>
            </div>
            <div className="v2-muted">
              f_s {hz(v.fsHz)} (from the loaded impedance) · passband {hz(v.passbandHz[0])} –{' '}
              {hz(v.passbandHz[1])} (from the derived crossings)
            </div>
            <Coverage text={v.coverage.describe} flagged={v.coverage.flagged} />
          </div>
        ))}

        {metrics.lfBump.map(({ driver, result }) => (
          <div className="v2-metric" key={`d-${driver}`}>
            <div className="v2-metric-head">
              <span className="v2-id">M-D</span> Low-frequency lift — {driver}
              <b>{db(result.extraDb, 2)} on top of the bare box</b>
            </div>
            <div className="v2-muted">
              bare box {db(result.bareDb, 2)} · peak at {hz(result.atHz)} · band and reference derived
              from f_p {hz(result.fPeakHz)}: {hz(result.bandHz[0])} – {hz(result.bandHz[1])},
              normalised at {hz(result.referenceHz)}
            </div>
            {result.notes.map((n, i) => (
              <div className="v2-warn" key={i}>
                {n}
              </div>
            ))}
            <Coverage text={result.coverage.describe} flagged={result.coverage.flagged} />
          </div>
        ))}

        {metrics.thevenin.map((t) => (
          <div className="v2-metric" key={`e-${t.driver}`}>
            <div className="v2-metric-head">
              <span className="v2-id">M-E</span> Source resistance — {t.driver}
              <b>
                {ohm(t.rsOhm)} at {hz(t.atHz)}
                {t.qMultiplier !== null && ` → Q_es × ${t.qMultiplier.toFixed(2)}`}
              </b>
            </div>
            <div className="v2-muted">R_e: {t.reOhm === null ? '—' : ohm(t.reOhm)} — {t.reSource}</div>
          </div>
        ))}

        {/* M-F-interim, V20: FOUR fractions side by side and no verdict on any
            of them. No colour, no zone word, no threshold — the whole point of
            the row is that these are four different distances between the same
            two ways and the reader picks, not the panel. */}
        {metrics.lobingLambdas.map((l) => (
          <div className="v2-metric" key={`f-${l.lower}`}>
            <div className="v2-metric-head">
              <span className="v2-id">M-F</span> Lobing (geometry) — {l.lower} → {l.upper}
              <b>{l.crossingHz === null ? 'no crossing' : `at ${hz(l.crossingHz)}`}</b>
            </div>
            <div className="v2-fractions">
              {l.fractions.map((f) => (
                <div className="v2-fraction" key={f.key} title={f.describe}>
                  <span className="v2-fraction-label">{f.label}</span>
                  <b>{f.lambda === null ? '—' : `${num(f.lambda)} λ`}</b>
                  <span className="v2-muted">
                    {f.distanceMm === null ? 'not present' : `${f.distanceMm.toFixed(0)} mm`}
                    {f.between && ` · ${f.between[0]} ↔ ${f.between[1]}`}
                  </span>
                </div>
              ))}
            </div>
            {l.authorityNote && <div className="v2-muted">{l.authorityNote}</div>}
            {l.notes.map((n, i) => (
              <div className="v2-muted" key={i}>
                {n}
              </div>
            ))}
          </div>
        ))}

        {metrics.lobingFinalOff && (
          <div className="v2-metric">
            <div className="v2-metric-head">
              <span className="v2-id">M-F</span> Lobing (synthesised)
              <b className="v2-off">off</b>
            </div>
            <div className="v2-warn">{metrics.lobingFinalOff}</div>
          </div>
        )}

        {metrics.lobingFinal && (
          <div className="v2-metric">
            <div className="v2-metric-head">
              <span className="v2-id">M-F</span> Lobing (synthesised)
              <b>
                deepest dip {db(metrics.lobingFinal.worstDipDb, 1)} at{' '}
                {hz(metrics.lobingFinal.worstAtHz)} / {metrics.lobingFinal.worstAtDeg}°
              </b>
            </div>
            {metrics.lobingFinal.worstDipInCrossoverDb !== null && (
              <div className="v2-muted">
                in the crossover region: {db(metrics.lobingFinal.worstDipInCrossoverDb, 1)} at{' '}
                {hz(metrics.lobingFinal.worstInCrossoverAtHz)}
              </div>
            )}
            {metrics.lobingFinal.limitations.map((l, i) => (
              <div className="v2-warn" key={i}>
                {l}
              </div>
            ))}
            <Coverage
              text={metrics.lobingFinal.coverage.describe}
              flagged={metrics.lobingFinal.coverage.flagged}
            />
          </div>
        )}

        {metrics.directivity.map((g) => (
          <div className="v2-metric" key={`g-${g.lower}`}>
            <div className="v2-metric-head">
              <span className="v2-id">M-G</span> Directivity match — {g.lower} → {g.upper}
              <b>
                {g.marginOctaves === null
                  ? 'no margin (no off-axis data)'
                  : `${g.marginOctaves.toFixed(2)} octaves of headroom`}
              </b>
            </div>
            <div className="v2-muted">
              −6 dB at {g.angleDeg}° of {g.lower}: {hz(g.lowerMinus6Hz)} · crossing {hz(g.crossingHz)}
              {g.diMatchBandHz && ` · DI-continuous region ${hz(g.diMatchBandHz[0])} – ${hz(g.diMatchBandHz[1])}`}
            </div>
            {g.notes.map((n, i) => (
              <div className="v2-muted" key={i}>
                {n}
              </div>
            ))}
          </div>
        ))}

        {metrics.breakup.map((h) => (
          <div className="v2-metric" key={`h-${h.driver}-${h.breakupHz}`}>
            <div className="v2-metric-head">
              <span className="v2-id">M-H</span> Breakup distance — {h.driver}
              <b>
                ceiling {hz(h.ceilingHz)}
                {h.marginOctaves !== null && ` · crossing sits ${h.marginOctaves.toFixed(2)} octaves from it`}
              </b>
              <span className="v2-uncal" title={h.uncalibrated}>
                uncalibrated
              </span>
            </div>
            <div className="v2-muted">
              breakup {hz(h.breakupHz)} at +{h.peakDb.toFixed(1)} dB
              {h.q !== null && ` (Q ${h.q.toFixed(1)})`} ÷ {h.divisor.toFixed(2)}
            </div>
            {h.notes.map((n, i) => (
              <div className="v2-muted" key={i}>
                {n}
              </div>
            ))}
          </div>
        ))}

        {metrics.groupDelay && (
          <div className="v2-metric">
            <div className="v2-metric-head">
              <span className="v2-id">M-J</span> Group delay vs audibility threshold
              <b>
                {metrics.groupDelay.worstExcessMs <= 0
                  ? `${Math.abs(metrics.groupDelay.worstExcessMs).toFixed(2)} ms below the threshold at its closest`
                  : `${metrics.groupDelay.worstExcessMs.toFixed(2)} ms OVER the threshold at ${hz(metrics.groupDelay.worstAtHz)}`}
              </b>
            </div>
            <div className="v2-muted">
              Reporting only — no gate and no taste judgement. Typical high crossings sit far below
              the threshold; low ones deserve a look.
            </div>
            <Coverage
              text={metrics.groupDelay.coverage.describe}
              flagged={metrics.groupDelay.coverage.flagged}
            />
          </div>
        )}
      </Section>

      <Section title="Pre-design — anchored sensitivity gaps" spec="A5d.4">
        {!predesign.gaps ? (
          <p className="v2-muted">Needs at least two branches with a usable band.</p>
        ) : (
          <>
            <p>
              Anchor: <b>{predesign.gaps.anchor}</b> — {predesign.gaps.anchorReason}
            </p>
            {predesign.gaps.anchorSwitchWarning && (
              <p className="v2-warn">{predesign.gaps.anchorSwitchWarning}</p>
            )}
            {predesign.gaps.suspectBands.length > 0 && (
              <div className="v2-suspect">
                <b>⚠ Read this block with a caveat.</b>
                {predesign.gaps.suspectBands.map((b) => (
                  <p className="v2-warn" key={b.driver}>
                    {b.describe}
                  </p>
                ))}
              </div>
            )}
            <table className="v2-table">
              <thead>
                <tr>
                  <th>Way</th>
                  <th>Gap to the anchor</th>
                  <th>Gap to the neighbour below</th>
                  <th>Chained attenuation budget</th>
                </tr>
              </thead>
              <tbody>
                {predesign.gaps.ways.map((w) => (
                  <tr key={w.driver}>
                    <th scope="row">{w.driver}</th>
                    <td>{db(w.gapToAnchorDb, 2)}</td>
                    <td>{db(w.gapToNeighbourDb, 2)}</td>
                    <td>{db(w.budgetDb, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {predesign.gaps.notes.map((n, i) => (
              <div className="v2-muted" key={i}>
                {n}
              </div>
            ))}
          </>
        )}
      </Section>

      <Section title="Pre-design — feasible crossover windows" spec="A5d.3">
        {predesign.windows.length === 0 ? (
          <p className="v2-muted">Needs at least two branches.</p>
        ) : (
          predesign.windows.map((w) => (
            <div className={w.empty ? 'v2-metric v2-empty-window' : 'v2-metric'} key={`${w.lower}-${w.upper}`}>
              <div className="v2-metric-head">
                {w.lower} → {w.upper}
                <b>
                  {w.empty
                    ? 'EMPTY — no crossing frequency is allowed'
                    : `${hz(w.floorHz)} – ${hz(w.ceilingHz)}`}
                </b>
              </div>
              <ul className="v2-limits">
                {w.limits.map((l, i) => (
                  <li key={i} className={l === w.floorBy || l === w.ceilingBy ? 'v2-binding' : ''}>
                    {l.side === 'floor' ? '▲' : '▼'} {hz(l.hz)} — {l.source}
                    {(l === w.floorBy || l === w.ceilingBy) && <b> · binding</b>}
                    {l.uncalibrated && (
                      <span className="v2-uncal" title={l.uncalibrated}>
                        uncalibrated
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {w.zones.length > 0 && (
                <div className="v2-muted">
                  Preference zones:{' '}
                  {w.zones
                    .map(
                      (z) =>
                        `${z.label} ${hz(z.hz[0])}–${hz(z.hz[1])}${z.outsideWindow ? ' (outside the window)' : ''}`,
                    )
                    .join(' · ')}
                </div>
              )}
              {w.tensions.map((t, i) => (
                <div className="v2-warn" key={i}>
                  {t}
                </div>
              ))}
            </div>
          ))
        )}
      </Section>

      <Section title="System — window interaction" spec="A5d.3">
        <ul>
          <li>
            SPL window: {system.splWindowDb === null ? '—' : `± ${system.splWindowDb.toFixed(2)} dB`}
            {system.splBandHz && ` over ${hz(system.splBandHz[0])} – ${hz(system.splBandHz[1])}`}
          </li>
          {system.phaseTracking.map((p) => (
            <li key={`${p.lower}-${p.upper}`}>
              Phase tracking {p.lower} → {p.upper}: {p.meanAbsDeg.toFixed(1)}° mean over ±1 octave
              around {hz(p.crossingHz)}
            </li>
          ))}
          {system.midbandOctaves.map((m) => (
            <li key={m.driver}>
              {m.driver} spans {m.octaves.toFixed(2)} octaves between its crossings
            </li>
          ))}
          <li>
            Three-source zone:{' '}
            {system.threeSourceZoneHz
              ? `${hz(system.threeSourceZoneHz[0])} – ${hz(system.threeSourceZoneHz[1])} — more than two ways contribute there`
              : 'none — the ways are amplitude-decoupled'}
          </li>
          {system.phaseCoupling.map((p, i) => (
            <li key={i}>
              {p.driver} carries {p.degPerOctave.toFixed(0)}°/octave of electrical rotation at{' '}
              {hz(p.atCrossingHz)}
            </li>
          ))}
        </ul>
        <p className="v2-muted">
          Phase couples about twice as far as amplitude does: two crossings can be amplitude-decoupled
          while the sections of one still rotate the other's tracking band. Reported, not forbidden.
        </p>
      </Section>

      <p className="v2-foot">
        {report.engine.mark} · parked pending specification decisions (A5e): soft-goal normalisation
        and aggregation, the target-curve object, the catalog schema, and the determinism policy.
        Nothing on this panel assumes any of them.
      </p>
    </div>
  );
}
