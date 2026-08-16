import type { HelpSection } from './help.ts';

/**
 * English edition of the in-app manual. Same structure as HELP_SECTIONS in
 * help.ts (the Dutch original, which remains the authored source): section ids
 * MUST match one-to-one so contextual opening (helpSectionForTab) and saved
 * scroll targets work in both languages. The tests enforce that.
 */
export const HELP_SECTIONS_EN: HelpSection[] = [
  {
    id: 'start',
    title: '🚀 Quick start',
    keywords: ['workflow', 'begin', 'quick start', 'steps', 'demo'],
    blocks: [
      {
        t: 'p',
        text:
          'The core of this tool: designing on the **measured phase** — including the real ' +
          'time offset between the drivers — where other tools (VituixCAD) reconstruct the phase. ' +
          'The normal route from measurement to filter:',
      },
      {
        t: 'steps',
        items: [
          '**Import**: load each driver’s FRD files (0° + all angles) and the .ZMA in one go via multi-select.',
          'Check the **Timing** chip in the topbar. `plausible` = the measurements share a time reference and the measured phase is usable; the phase convention then switches to Measured automatically.',
          'Go to **Filters** and click **🧙 Wizard** (guided) or straight to **Optimize — design for me**. With measured impedances that runs the whole chain: virtual filters → passive synthesis → component tuning, per crossover candidate.',
          'The winning design lands in the **Working** tab on the Network panel, fully built and tuned. The scan table below it is a menu: click a row to load a different candidate.',
          'Save with **Save as new** (your own tab name) and export with **Export .vxp** — measurement files included — to verify in VituixCAD.',
        ],
      },
      {
        t: 'p',
        text:
          'No measurements of your own at hand? **Load KOAN demo data** (Import tab) loads a complete real measurement set incl. angles, plus the priced demo catalog (only if you have not imported a catalog of your own).',
      },
    ],
  },
  {
    id: 'import',
    title: '📥 Import tab',
    keywords: ['frd', 'zma', 'vxp', 'files', 'measurements', 'load', 'project', 'notes', 'inventory', 'single-driver', 'one driver', 'near field', 'merge', 'splice', 'baffle step', 'gate', 'validation', '3-way', 'midrange', 'three-way'],
    blocks: [
      {
        t: 'ul',
        items: [
          '**FRD + ZMA per driver**: select the 0° file, all horizontal angle files AND the .ZMA in one file dialog; angles are recognised from the file name. The .ZMA can simply travel in the same selection — no VituixCAD project is needed for anything.',
          '**Single-driver mode**: one loaded driver (FRD + ZMA) is enough — the simulation then runs on that one branch. Ideal for validating the simulation against a real measurement: measure the bare driver, redraw the built network on the Network tab and compare Combined + impedance against the measurement with the network in place. Everything that compares two drivers (relative phase, integration, timing check) hides itself.',
          '**Verification measurement (model vs measurement)**: build the design, measure it, and load that FRD here. The SPL chart draws the measurement over the simulated Combined — level-aligned automatically (the applied shift is shown in the legend, because absolute calibration simply differs) — and the SPL strip shows where the model deviates: average, P95 and the largest deviation with its frequency. If the measurement carries phase, the mic distance is fitted out as a pure delay and the phase chart shows the residual; an offset around 180° almost always means the build is wired inverted — that is reported, never silently corrected. Loading again replaces; ✕ removes.',
          '**Compare mode** (topbar, next to Guided/Expert): the validation as its own workspace — open the project you designed with, drop the measured FRD of the built speaker in (several are fine: build v1, v2 … become tabs with a comparison table), and the right side shows only the SPL overlay and the phase residual. Level offset and mic delay are shown, not hidden.',
          '**🔬 Compare wizard** (button next to the Verification slot): the same validation as a guided checklist in four steps — Design (active network tab + Use in simulation), Drivers (FRD + impedance per driver), Measurement (load the measurement) and Verdict (the numbers). Every step reads the live app state, so whatever is already in place is simply already green.',
          '**Solo optimizer**: in single-driver mode `Optimize` has its own engine — **Optimize — flatten driver** designs cut-only EQ/shelves that flatten the driver, builds them as a real solo topology (parallel LCR traps IN the series path, series L∥R / C∥R shelves, a series pad for the level, plus a Zobel once the impedance rises ≥1.3× — a shunt to ground does nothing against a voltage source) and tunes the components against the measurement. `⚙ Optimize components` also works solo: the objective is then pure response flatness (+ the amplifier floor); crossover settings are disabled.',
          '**Level target (solo)**: passive can only cut, so flatness COSTS sensitivity. Two ways to steer that in ⚙ Settings. **Sensitivity budget** (relative): how many dB the correction may give up — 6 dB ≈ a baffle step, right for a driver that will still get a crossover. **Target level** (absolute, recommended for a fullranger): flatten down TO a level in your own measurement’s dB scale. That is better posed — a fixed target cannot be met by shifting the average — and one number also decides how far the correction reaches: a lower target reaches further down the band, at the cost of efficiency. The panel shows live where the driver itself sits and how far your target reaches.',
          '**3-way (Midrange slot)**: load a midrange next to woofer and tweeter (FRD + ZMA, same multi-select). As soon as all three responses are loaded the app switches to 3-way: three driver curves + the three-branch sum, its own Midrange filter card (HP and LP together = bandpass), its own Midrange adjustment on the Setup tab, and the phase chart shows the two adjacent pairs (mid vs woofer, tweeter vs mid). Mid data without a complete set of three deliberately stays out — a banner says what is missing. **Build passive filter works in 3-way**: three branch fits on the measured impedances (woofer LP, mid bandpass, tweeter HP) land as one network; the **3-way templates** (1st–4th order, mid = bandpass at 600/3000 Hz) are on too. **⚙ Optimize components works in 3-way**: the tuner judges the three-branch sum with BOTH adjacent crossings guarded (valley, protection, dead branch, amplifier floor) and the phase per pair. The crossover optimizer (Optimize — design for me) runs the full 3-way chain as well.',
          '**Near field (low-end merge)**: any indoor measurement is only honest up to the first reflection — at 50 cm with the cabinet 1 m above the floor that stops around 220 Hz, exactly where a 3-way wants its woofer-mid handover. So load a **near-field measurement** per branch (mic right at the cone, and on a ported box also at the port): the app scales it to the measuring distance, sums cone and port complex with the port weighted by diameter, and splices it under your far-field measurement. Enter Sd — both the scaling and the upper limit come from it (near field is valid to ka = 1, roughly 500 Hz on an 8-inch woofer). The splice frequency must sit between those two limits; the app proposes one itself and refuses a choice outside the physics. The fit is on level **and** on arrival time — a 100 µs seam would otherwise land exactly on the crossover — and the report shows both plus the phase residual; an offset around 180° means the near-field measurement is wired inverted. **Baffle step** is a separate control, not an automatic model: a near-field measurement knows no cabinet, and the published formulas disagree with each other.',
          '**How low is my measurement worth anything?** Enter the measuring distance and the height of the reference point above the floor on the Setup tab; the app computes the floor bounce and says it out loud ("honest down to ≈ 220 Hz"), with a button to set f min right there. Standing further away improves the far field and SHORTENS the gate window — those two rules pull against each other, and this turns that into a choice instead of an assumption.',
          '**The component catalog lives OUTSIDE your project** — next to your design, so a **Reset does not wipe it**. That is deliberate: the catalog is what gives snapping and the BOM meaning, and you do not want to lose it on every fresh start. The buttons live under **Component catalog** on this step, with a status line saying what is loaded now ("19 series · 182 exact parts · prices loaded" or "built-in library only"). Lost it anyway, or want a priced library quickly: **🎧 Demo catalog** loads the priced Jantzen/Mundorf set independently of the KOAN measurement data. Without a priced catalog the app simply keeps working on the built-in library, but without prices and without snapping to real SKUs.',
          '**Series you do not want to use can be switched off.** Open **🗂 Manage…** → the **Series** tab: every series has a **Use** switch. Off means off everywhere — the optimizer no longer picks from it, the inspector no longer suggests it, and the BOM no longer prices it; one pool, one meaning. It is a PREFERENCE and not catalog data: it is stored separately, so a fresh catalog import does not bring back a series you rejected, and an exported catalog keeps describing what EXISTS rather than what one person happens to like. The status line on this step counts how many are off. Want the opposite — everything from one series — use the binding brand/series choice in the 🧙 wizard.',
          '**A VituixCAD project (.vxp)** is entirely optional: use it only to import existing crossover variants (e.g. from a collaborator). Every variant becomes selectable on the Setup tab and can be opened as its own design tab.',
          '**Imported files**: the inventory shows per driver what is loaded; every file can carry a free note ("measured at 50 cm, window open"). Notes travel in the autosave and the project file.',
          '**Save/Load project** stores EVERYTHING — raw measurement files, filters, network tabs, settings — in one JSON. Alongside it an autosave runs continuously (localStorage) that never overwrites existing data with an empty session.',
          '**Catalog import/export** also lives here: load the component catalog (JSON with real SKUs and prices) before running the optimizer, and the BOM computes with real prices.',
        ],
      },
    ],
  },
  {
    id: 'setup',
    title: '🎚 Setup tab & timing',
    keywords: [
      'phase convention', 'measured', 'minimum phase', 'offset', 'view range', 'time reference',
      'timing sanity', 'verdict', 'tweeter adjustment', 'variant',
      'side woofer', 'side-firing', 'mounting depth', 'cabinet depth', 'facing',
      'sloped baffle', 'tilt', 'opposed', 'bipole', 'rear-firing',
      'chamber', 'sealed', 'ported', 'fc', 'fb', 'tuning', 'litres',
    ],
    blocks: [
      {
        t: 'ul',
        items: [
          '**📐 Measure** (topbar): the measuring guide — what to aim the mic at, how far to stand back, and what an angle sweep actually captures. You may rotate with the mic on an arc or with the cabinet on a turntable: as long as the radius is constant and the arc is centred on the reference point, the two are geometrically identical. Turning the cabinet is still the safer habit, because the mic then stays in one spot in the room and every curve carries the same reflections. The illustrations are operable and run on the same geometry as the optimizer, so what you see there is exactly what the app will use.',
          '**Cabinet & drivers**: here you tell the app what you already know, so it does not have to infer it. Everything is measured from the **reference point**: the spot you aimed the microphone at, and with a turntable the axis the cabinet turned around. Aim at the tweeter and it sits at x 0 / y 0, and everything below it gets a negative y. Why it matters: a turntable delivers "0/10/20/30 degrees" of the **cabinet**, not of each driver. A woofer 380 mm below the reference point, measured at 50 cm, already looks 37 degrees along its own axis at "0 degrees" — its whole sweep then covers 37 to 46 degrees. The app computes that per driver and puts it under the input field. Furthermore: the measuring distance decides whether the angle measurements were far field at all; the driver positions supply the centre-to-centre spacing (and with it the lobing ceiling) without you typing it separately; the enclosure type says which order the box itself already provides — a sealed mid is already a 2nd-order high-pass, so an LR2 filter gives an LR4 slope; and Sd + Xmax give the level-aware excursion floor. None of this touches your measurement data — it only feeds windows, warnings and cross-checks.',
          '**Driver positions are measured the way a ruler measures**: across from the centreline, and DOWN from the top of the front panel. Once you have entered on the cabinet step how far the reference point sits below the top, the app converts that to its internal origin itself — you never type the same fact twice, and you never have to invent negative numbers. Without that reference height the field falls back to the old counting from the reference point (y up), and the line below it says so.',
          '**Drivers that are not on the front** (side-, up- or down-firing): set that on the driver under **Mounting**, together with how deep its acoustic centre sits behind the baffle plane, and enter the cabinet depth. Without those two numbers the app judges it against a front it is not on — and then the timing panel raises an alarm on a perfectly ordinary loudspeaker: half a cabinet depth is already some 440 microseconds, and those get booked entirely on the driver’s acoustic centre. With the data in, the panel splits the measured Δ into three parts (the tripod, the mounting depth the cabinet already explains, and only then the driver itself), measures the true angle along the driver’s own axis (a side woofer is simply 90 degrees off-axis at "0 degrees"), counts the depth into the centre-to-centre spacing, and hands the baffle step the side panel — on a narrow cabinet that is a factor of two. Note: a front sweep cannot measure such a driver’s directivity; near field is the honest route there. The same row covers the rest of the cabinet shapes: **rear-firing** (ambience tweeter, bipole), **sloped or stepped baffles** via the tilt field (+ is aimed upward — a 6 degree slope moves the true angle of a driver 250 mm down from 27 to 21 degrees, not a rounding difference), and **opposed woofer pairs** with the "opposed pair" checkbox: those have two true angles at once (at nominal 0 both 90 degrees, at 30 degrees 66 and 112) and the app reports both, because making one out of them would be making it up.',
          '**Chamber (per driver, on purpose)**: the enclosure type lives on the DRIVER because it is the chamber behind that branch — a 3-way regularly runs a sealed mid chamber inside a ported cabinet, so one answer for the whole box would be wrong. The corner (Fc/Fb) you usually need not look up: your impedance measurement already contains it if the ZMA was taken in the box — sealed: the Z peak IS the Fc; ported: the tuning Fb is the saddle between the two peaks. The app reads it off and puts it next to the field as a proposal ("use it"); with a value already entered, the line is a cross-check. Asking for litres would cost three extra datasheet fields (Vas, Qts, free-air Fs) to compute what one number says directly.',
          '**You need not measure the depth — the app derives it.** Under the timing panel sits "Measured mounting depth": from the measured excess delay, minus the oblique path the tripod itself causes, exactly how deep each driver sits remains. Better than a ruler, because a delay finds the ACOUSTIC centre and a ruler does not. Two things to know: it is by definition RELATIVE (the shallowest driver gets 0 — physics needs nothing more), and once you click "use as mounting depth" the timing split explains itself, so the residual stops being an independent check. If you already typed the depth, this line is a CROSS-CHECK instead: if drawing and measurement disagree, one of the two is wrong.',
          '**View range** = the evaluation band: the optimizer judges within this range. Fields freeze the simulation while typing and commit on Enter/blur. A zoom in the SPL chart can be promoted to the range with **use as view range**.',
          '**Phase convention — Measured is the default and the truth**, provided the timing check is green. The measured phase contains the real time offset between the drivers; designing on that is this tool’s reason to exist.',
          '**Minimum** exists only for VituixCAD comparison and diagnosis: the phase is then reconstructed per driver and the time offset has to be put back by hand as an offset. On switching, the offset is filled in automatically (measured → 0; minimum → the measured Δmm).',
          'In measured mode with offset ≠ 0 a warning appears: the time offset then sits in the sum **twice** (once in the measured phase, once as offset).',
          '**Timing sanity** (the panel at the bottom) fits the bulk delay per driver from the unwrapped phase and passes a verdict on the shared time reference. This is the most important silent-failure detector in the whole chain: a wrong timing assumption shows up nowhere else.',
          '**Tweeter adjustment**: level and polarity of the tweeter, plus the choice of active vxp variant when a project is loaded.',
        ],
      },
    ],
  },
  {
    id: 'filters',
    title: '🎛 Filters tab & optimizer',
    keywords: [
      'virtual filters', 'hp', 'lp', 'eq', 'optimize', 'design for me', 'staged', 'targets',
      'priority', 'crossover point', 'acoustic slopes', 'scan', 'build passive', 'bypass', 'cut-only',
    ],
    blocks: [
      {
        t: 'p',
        text:
          'Virtual filters are the **target design**: HP/LP (Butterworth, Linkwitz-Riley, Bessel, order 1–4) ' +
          'plus EQ bands per driver. The passive synthesis then builds a real network from them. ' +
          'Because passive cannot amplify, EQ bands are **cut only** (≤ 0 dB): pushing a peak down works, ' +
          'filling a dip does not — that is physics, not a limitation of the tool.',
      },
      { t: 'h', text: 'Optimize — design for me' },
      {
        t: 'ul',
        items: [
          'With measured impedances the button runs a **full-chain scan**: per crossover candidate the whole chain (virtual rounds → synthesis → component tuning on the assembled network), and the END results compete. The intermediate ranking means nothing — only the final measurement counts.',
          'The **scan table** is a menu: 🏆 marks the ranking winner, clicking a row loads THAT complete design into Working (undo-able), column headers sort. The ranking judges on the **whole-range average deviation** (avg column) — one narrow dip does not decide the winner; the **peak ±dB** column shows the worst spot and is what the targets gate on ("nowhere worse than").',
          'Without a crossover pin one free chain runs first; only if it misses the targets do rescue candidates follow around the found crossing.',
          'At (nearly) equal quality the **cheapest BOM** wins — cost steers at decision points, never inside the search itself.',
          'The optimizer runs in a web worker: the UI stays responsive and **Cancel** aborts without touching the design.',
          'How the optimizer decides internally — its rules of thumb and safety nets — has its own section: **🤖 Under the hood**.',
        ],
      },
      { t: 'h', text: '⚙ Settings (also reachable through the wizard)' },
      {
        t: 'ul',
        items: [
          '**Priority** (flatness ↔ phase): the big knob. More phase priority buys flat phase with amplitude ripple and vice versa; the extremes are bounded internally so 100% phase cannot wreck the response.',
          '**Staged + targets** (ripple in dB, phase in °): the step method — structure first, EQ bands only after, and it stops as soon as the goals are met. **Mind the direction, because it surprises**: a target is a STOPPING POINT, not a ceiling. Tighter therefore makes the filter **more complex and more expensive** — the app keeps adding EQ bands and parts while the target is unmet, and only prunes the parts it does not need once the target IS met. A target your drivers cannot reach at all gives you the worst of both worlds: maximum complexity and the target still missed (measured: with a 1 dB target and 2.22 dB delivered, a 6.8 mH coil stayed in the tweeter branch doing electrically nothing). Looser stops sooner and builds simpler, but you may leave performance on the table that one or two bands would have bought for free. For calibration: on top-of-the-line drivers this engine reaches about 0.9 dB / 4°; on ordinary drivers or a rough cabinet 2–3 dB is a realistic stopping point. The default therefore sits at 2.5 dB / 15°.',
          '**Crossover point** = frequency ± margin: pins the **acoustic** crossing (where the filtered drivers actually cross — not the electrical knees). Margin 0 = exactly there. The scan step count (3/5/7/9) divides the range into adjoining slices.',
          '**Acoustic slope mid/tweeter**: target slope of the measured acoustic flank beside the crossing (dB/oct) — THE "acoustic 4th order at the tweeter" knob. Check the result in the 🎯 Targets popup.',
          '**HP floor**: automatic lower bound for the tweeter HP knee at 2× the Fs read from the measured impedance.',
          '**Breakup guard**: stopband leakage beside the crossing must stay ≥ 20 dB below the sum — resonance phase cannot be filtered away, only made irrelevant in level.',
          '**Catalog snap**: the fit ends on real catalog parts (incl. their DCR/ESR) instead of free values.',
        ],
      },
      { t: 'h', text: 'Building by hand' },
      {
        t: 'ul',
        items: [
          '**Build passive filter** synthesises the current virtual design into a network in a new "Passive build N" tab; only the Optimize flow overwrites Working.',
          'The synthesis-mode dropdown picks the fit goal: **acoustic** (measured response × filter against the ideal acoustic sum — usually what you want) or **filter curve** (the electrical transfer only).',
          '**Bypass** takes the virtual filters out of the simulation without erasing them — switches on automatically after a manual build (you would filter twice otherwise) and off after an optimizer run (the result must be visible).',
        ],
      },
    ],
  },
  {
    id: 'optimizer',
    title: '🤖 Under the hood: the optimizer',
    keywords: [
      'how it works', 'rules of thumb', 'safety nets', 'safety', 'zobel', 'fs trap', 'textbook',
      'deterministic', 'seed', 'prune', 'escalation', 'shrink ladder', 'drift',
      'fundamentals', 'guard', 'cost', 'ladder', 'trap', 'synthesis', 'tuner',
      'impedance', 'amplifier', 'floor', 'ohm',
    ],
    blocks: [
      {
        t: 'p',
        text:
          'The optimizer is **autonomous**: it has the full toolbox, and your settings are ' +
          'starting points and goals, not handcuffs. What it delivers is always checkable (🎯 Targets, ' +
          'scan table, notes) and **deterministic**: the same measurements and settings give exactly the same ' +
          'design, every time.',
      },
      { t: 'h', text: 'The chain at a glance' },
      {
        t: 'steps',
        items: [
          '**Structure**: enumeration of classic alignments (LR2/LR4/BW3/Bessel × polarity) as the foundation. An HP/LP preference from ⚙ Settings is binding — the designer picks the foundation, the optimizer tunes knees, level and polarity.',
          '**EQ bands**: greedy, one band at a time, and every band must earn its keep (≥ 1% improvement). Cuts only — passive cannot boost.',
          '**Passive synthesis per branch**: a textbook ladder as the seed, then a shape fit against the ideal acoustic sum. That fit computes the response’s sensitivity to every component value exactly rather than trying-and-looking, and starts from five different points so it does not settle into the first valley it finds. Corrections (Zobel, Fs trap, top-octave hold) only enter when the MEASUREMENT asks for them — never by default.',
          '**Component tuner on the whole**: branches are synthesised separately, but only the tuner on the assembled network sees how they interact. This is where the big win falls.',
          '**Catalog snap as the closing step**: free values become real SKUs, simulated with their real DCR/ESR.',
        ],
      },
      {
        t: 'p',
        text:
          'With **Staged** on, this works as a step method: escalation stops as soon as the targets are met ' +
          '(structure alone if that suffices, only then EQ bands and extra parts), and a prune pass afterwards removes ' +
          'components that can go (nearly) for free. The stage report under the summary shows ' +
          'ripple and phase per stage.',
      },
      { t: 'h', text: 'Rules of thumb (always on, not taste knobs)' },
      {
        t: 'ul',
        items: [
          '**Role anchor**: ladder components stay within ~×3 of their textbook value. A "2nd order" with a 100 µF series cap is no longer a filter but a wire with extra steps — the pole then sits somewhere else.',
          '**Tweeter protection**: well below the crossing (≤ crossing/3) the drive must be attenuated ≥ 15 dB. The shape fit barely sees that region (weight ~0), so without a hard floor a resonance drive stays invisible.',
          '**Series-path ceiling**: what makes a series part a "wire with extra steps" is its reactance relative to the load — so the ceiling scales with the crossover frequency and the impedance. A tweeter cap above ~33 µF is nonsense; an 88 µF mid cap at a 200 Hz handover is ordinary practice (and gets built as four 22 µF in parallel). Large electrolytics stay reserved for shunts and traps.',
          '**Zobel and Fs trap are gated on the measurement**: a Zobel only on a real impedance rise through the LP band (> ~1.3×), an Fs trap only when the Z peak sits close below the HP knee. Classic rules of thumb as cross-validation, never automatisms.',
          '**Where a driver gives out, the optimizer reads from the measurement.** Four independent limits, and the window is their intersection: (1) **breakup** — a cone resonance at f_b is excited by tones at f_b/3, so the crossing must stay below that; a notch does not fix it, because it attenuates the resonance itself and not the harmonics landing on it from below. (2) **beaming** — measured from your angle files, calibrated on the classic ka limits; note that "−6 dB at 30°" already sits far past every published limit. (3) **centre-to-centre spacing** — pure geometry: put two drivers half a wavelength apart and a vertical null appears. This is the real reason 3-ways cross around 200–500 Hz. (4) **excursion** — enter Sd and Xmax from the datasheet and the lower limit follows from the target level; the same tweeter reaches 587 Hz at 90 dB and only 829 Hz at 96 dB.',
          '**Knees stay free; the acoustic crossing gets pinned.** Caging electrical knees does not work: with a 5–10 dB hotter tweeter the real acoustic crossing sits far below the electrical knee. The crossover pin therefore steers on where the filtered drivers actually cross.',
          '**Cap shrink ladder**: after the tune, every free cap tries one size smaller step by step (E12), as long as the quality keeps clearing the bar — "caps as small as possible" without paying quality for it. A cap that refuses to shrink is genuinely needed at that value.',
          '**Cost steers only at decision points**: at (nearly) equal quality the cheapest realisation wins — in the scan ranking, the snap, and at ties between basins. Price never sits in the search itself: that perturbs the search path and makes the result worse (learned the hard way).',
        ],
      },
      { t: 'h', text: 'Safety nets' },
      {
        t: 'ul',
        items: [
          '**Never worse than the start**: every result is measured against its seed; if it loses, the seed stands.',
          '**Full-grid audit**: bands and decisions that only win on the internal (decimated) computation grid must prove themselves on the full measurement grid — or they go. This is the overfitting brake.',
          '**Dead-branch detection**: no acoustic crossing, or a valley ON the crossing, always costs heavily. Needed because three other protectors (breakup guard, tweeter floor, crossover pin) are all crossing-based: without a crossing all three would switch off exactly in the degenerate state.',
          '**Full-band safety gate**: the fundamentals are checked on the FULL measurement grid at acceptance, even with a narrow view range — a network can derail out of sight (crossing drifted away, tweeter open toward Fs). Degenerate result → seed values restored + the note "widen the view range".',
          '**Target barrier + prune brake** (Staged): a retune may not slide away from a met target (trading ripple past target for phase nobody asked for), and pruning may only be (nearly) free — without that brake the quality walks down to the target line because everything stays "within target".',
          '**Drift catch**: the value tune is challenged from a textbook-seeded variant, also AFTER tuning — the response objective is underdetermined (multiple value sets give the same sum) and without a challenge shunt caps quietly drift into the big-cap basin. Best basin wins; at a tie, the cheapest.',
          '**Amplifier floor (system Z ≥ 2.5 Ω)**: the simulation drives voltage, so an impedance dip is invisible in every response metric — only the amplifier feels it. If the tuned result dives under the floor, a local repair retune follows (only accepted if the response stays in class); if that fails, the note reports it and the Impedance panel shows the dip. The floor sits at 2.5 Ω (the classic 4Ω-amplifier tolerance), not 3: a correct 2nd-order filter on a 4Ω-class driver naturally dips to ~2.7 Ω at the knee. Deliberately NOT a term in the search objective: even a tiny contribution shifts the deterministic search path (measured: a 6 dB worse basin).',
          '**Cancel is safe**: the worker is terminated hard and the design stays untouched.',
        ],
      },
      { t: 'h', text: 'Checking what it did' },
      {
        t: 'ul',
        items: [
          '**🎯 Targets** (Network toolbar): the virtual target design of the last build + the measured acoustic slopes beside the crossing.',
          '**Scan table**: every crossover candidate with ripple/phase/BOM — the final measurement, not the intermediate state. Click a row to load that design.',
          '**Stage report** (Staged): the result per stage, so you can see what each escalation bought.',
          '**Notes** under the result: snap choices (incl. stacks and what singles-only would cost), safety rejections and skipped candidates.',
        ],
      },
    ],
  },
  {
    id: 'network',
    title: '🔧 Network tab & editor',
    keywords: [
      'schematic', 'editor', 'tabs', 'tidy', 'notch', 'lock', 'optimize components',
      'bom', 'save', 'templates', 'adsfilter', 'undo', 'redo', 'inspector',
    ],
    blocks: [
      {
        t: 'p',
        text:
          'The schematic **is** the network: connections arise from point-on-point coincidence, and every change ' +
          'is solved immediately against the measured data. Dragging can never break a circuit — a dragged ' +
          'component automatically leaves wires back to its old connection points.',
      },
      {
        t: 'ul',
        items: [
          '**Design tabs**: every network lives in its own tab. Double-click = rename, and other tabs appear as dashed ghost curves in the SPL and phase charts, each in its own tint.',
          '**Save / Save as new**: "Save as new" stores the active design as a new tab and makes it active; **💾 Save** overwrites the last-saved tab. The Working tab is the Optimize flow’s scratchpad and gets overwritten per run.',
          '**Inspector** (click a component): value, DCR/ESR, polarity, 🔒 lock (locked = the tuner keeps off) and catalog suggestions per brand/series.',
          '**Tidy layout** redraws the schematic from its netlist: same network, neat columns, chains sorted by resonance frequency. Exotic topologies that cannot be re-laid reliably stay untouched — redrawing pretty-but-wrong is lying.',
          '**➕ Add notch** places an LCR trap in front of the chosen driver and then tidies automatically; one undo step for both together.',
          '**⚙ Optimize components** re-fits all unlocked values against the measured sum. Safety net: never end worse than the start. Also runs automatically after Optimize→Build — branches are synthesised one by one, only the tuner sees the interplay. Afterwards a fold-out table shows **"N value changes"** per component old → new (+Δ%) — so you can see WHERE the tuner found its gain.',
          '**Tolerance band ±2/5/10%** (Simulation group): worst-case envelope around the combined curve when every physical part lands within its tolerance — what building with real components can do to this design. The SPL strip shows worst-case and RSS (realistic with independent errors) plus the most sensitive parts: that is where 2% components or re-measuring pay off first. Computed deterministically (all corners per part, no sampling).',
          '**🎯 Targets** shows the target design of the last build plus the measured acoustic slopes beside the crossing (dB/oct ≈ acoustic order) — electrical component count ≠ acoustic order.',
          '**BOM** under the editor: per component the catalog match with price, including 2-part stacks (10.37 µF = 4.7 + 5.6). "No exact catalog value" usually means: catalog (with prices) not imported yet.',
          '**New from template**: a bare starting point to tinker from — drivers only, or a generic 1st–4th-order ladder (8 Ω / 2.5 kHz reference; the topology is the point, the values you tune yourself).',
          '**Export/Import filter (.adsfilter)** exchanges one design tab as a standalone file; **Undo/redo**: Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z (or Ctrl+Y).',
        ],
      },
    ],
  },
  {
    id: 'wizard',
    title: '🧙 Wizard, catalog & components',
    keywords: [
      'wizard', 'catalog', 'tier', 'premium', 'budget', 'position', 'stacking', 'stacks',
      'jantzen', 'mundorf', 'prices', 'snap', 'series', 'brand', 'manage', 'sku',
    ],
    blocks: [
      {
        t: 'p',
        text:
          'The **🧙 Wizard** is the guided route: Goals (targets + priority) → Crossover (point, slopes, ' +
          'Fs floor) → Components (catalog, quality, brands) → Summary + 🚀 Optimize. It is the same state ' +
          'as ⚙ Settings — no separate worlds. The measurements step starts with the **system choice** (1-way / ' +
          '2-way / 3-way): only the matching measurement slots appear and **Next unlocks only once the ' +
          'chosen set is complete** (the button tooltip says what is missing). The choice is guidance — the app ' +
          'always follows what is actually loaded, and reports a mismatch instead of resolving it silently.',
      },
      {
        t: 'ul',
        items: [
          '**Quality profile**: Budget / Balanced / Premium, or **Position** — the doctrine "series path premium, shunt budget": components in the signal path (series tweeter cap, series woofer coil) deserve quality, shunt and notch parts may be cheap.',
          '**Brand/series per kind** (L/C/R) is binding for the snap but does not bound values: if the preferred series does not cover a value, the choice falls through to the next series instead of forcing a wrong value.',
          '**Stacking**: a requested value that does not exist as one part may become a 2-part stack (coils in series, caps in parallel) — but only when the best single part genuinely falls short, and the note says what singles-only would cost in fit and euros.',
          '**Your own catalog**: export the template (JSON), fill in your own brands/series/SKUs with prices, and import it back. An import with an existing series id overrides the built-in version — that is how price updates land.',
          '**🗂 Manage… (catalog manager)**: add, edit and remove SKUs and series without leaving the app — with the same validation as the import. **SKUs view**: values (mH/µF/Ω), DCR/ESR, wire gauge, price and tier per exact part. **Series view**: the value grid per product series (range, E12/E24, gauges, ESR, power, price model, dcrFactor); editing a built-in series stores an override with the same id, ↩ reverts the override to the built-in. Changes stay inside the panel until you press **Save**; from then on snap, BOM and inspector use them immediately. Note: the FIRST exact SKU of a brand+series hides that series’ generated value grid — enter the whole run then (⛱ in the Series table marks shadowed series).',
          'The snap writes its choice onto the component, so the BOM shows exactly the chosen SKU — even at five-way ambiguous values like 10 µF.',
        ],
      },
    ],
  },
  {
    id: 'charts',
    title: '📈 Charts & interaction',
    keywords: [
      'zoom', 'pan', 'crosshair', 'handles', 'drag', 'wheel', 'sonogram', 'directivity',
      'panels', 'chips', 'sticky', 'legend', 'ghost', 'impedance', 'load',
      'amplifier', 'ohm', 'splitter', 'width', 'panel', 'layout',
    ],
    blocks: [
      {
        t: 'ul',
        items: [
          '**Zoom/pan**: scroll wheel = X-zoom around the cursor (Shift = Y-zoom), drag = pan, double-click or the reset button = back. Zooming is display only; **use as view range** is what makes it the evaluation band.',
          'The **crosshair** runs in sync across all frequency charts — point at one frequency, read it everywhere.',
          '**Filter handles in the SPL chart**: hollow dot = HP/LP knee (drag horizontally), solid dot = EQ band (drag = frequency + gain, scroll wheel on it = Q). Only visible while the virtual filters are in the simulation (not under bypass).',
          '**Panel chips** above the analysis pane toggle Directivity, Sonogram, Filter transfer, Impedance, Phase and Time domain individually — off really means not computed, which saves compute. SPL and the integration score are always on.',
          '**System impedance** — the load the amplifier sees from the active passive network (|Z| at the input, like VituixCAD’s Impedance chart). Only the **minimum** can do harm (current/heat): the `Z min` chip colours on the IEC rule of thumb ≥ 0.8× nominal (green ≥ 6.4 Ω, orange ≥ 3.2 Ω). The **phase chart below it** shows the CHARACTER of the load (arg Z: negative = capacitive, positive = inductive) and the strip reports the phase AT the minimum — low and strongly capacitive is the combination tight amplifiers dislike. A HIGH impedance is harmless; only an amplifier with high output impedance (tubes) hears that curve back in the frequency response.',
          '**📌** pins the SPL chart (sticky) so it scrolls along.',
          'Via the legend chips **Woofer/Tweeter target** (off by default) you draw the acoustic target curves in the SPL chart — per driver you see how tightly the filtered response follows its target. The target is deliberately only the ideal HP/LP alignment shape (+ level): EQ bands and shelves are tools to flatten the driver and do not belong in the target. The targets share one level anchor, so a branch playing too soft visibly deviates from its target.',
          'The **divider** between the input pane and the charts is draggable: drag it right for more input space (the charts scale along), double-click to return to the automatic width. The choice is remembered.',
          '**Legend chips** toggle curves; ghost curves of other design tabs are dashed and dim-coloured per tab.',
          '**Sonogram**: discrete 3 dB bands with a −6 dB beamwidth contour; scale normalised or absolute.',
          'In the phase chart, next to the relative phase, **Woofer/Tweeter phase (total)** is on by default: the TOTAL phase per driver (measured + filter, with a shared slow trend removed for readability — both curves get exactly the same correction, so their mutual difference is untouched). Where the relative curve sits at 0° those two lines lie exactly on top of each other — the gap between them IS the relative phase; a branch >60 dB below the sum is not drawn. The raw driver Δφ (finely dashed) sits alongside for reference; the **filter phase per branch** (only what the network adds, not the driver’s own phase) is off by default and can be enabled via the legend chips. Vertical markers show the integration bandwidth and the overlap centre.',
        ],
      },
    ],
  },
  {
    id: 'scores',
    title: '🚦 Scores & status chips',
    keywords: ['integration', 'score', 'phase p95', 'overlap', 'timing', 'flatness', 'colours', 'chips', 'verdict', 'response', 'ripple', 'average', 'p95', 'range'],
    blocks: [
      {
        t: 'ul',
        items: [
          '**Timing** — the verdict of the shared-time-reference check: `plausible` = the measured phase is usable as truth. Not green? Find out why first, before designing anything at all.',
          '**Response** (0–100, topbar + the strip under the SPL chart) — flatness of the combined response over the WHOLE visible range, computed from the AVERAGE deviation from the median level. One narrow dip therefore does not dominate this score — the classic **peak ±dB** sits next to it, together with avg/P95 and "±1 dB over N% of the range". A large gap between avg and peak = the problem is local, not everywhere. The scale is calibrated on designer judgement: a whole-band **±1 dB-class** response scores ~85 (green, "very good"), a real ±3 dB wobble sinks below 50.',
          '**Integration** (0–100, deliberately in the background of the strip) — summing health, overlap-weighted. High is the NORMAL state; it only sinks when the drivers actively work against each other (polarity, timing, crossing in a phase null), and then colours red. Steer the design on Response flatness and Phase flatness. The class limits sit on physical anchors: 45° (nearly full summing), 90° (still ≥ 3 dB gain), 120° (drivers no longer help each other).',
          '**Overlap** — the frequency where the driver levels cross: the real acoustic handover point of the current sum.',
          '**Phase P95** — 95th-percentile phase error in the overlap region; ≤ 45° green, ≤ 90° orange. The phase-flatness strip under the charts additionally shows score/average/P95 over the overlap region.',
          'The colour ladder in the phase chart (15/45/90/120°) is stricter than the score anchors: green there means ≤ 15° — purely visual, the score does not change because of it.',
        ],
      },
    ],
  },
  {
    id: 'concepts',
    title: '🧠 Phase concepts (measured, minimum, excess)',
    keywords: [
      'measured phase', 'minimum phase', 'excess delay', 'bulk delay', 'acoustic centre',
      'time offset', 'arrival time', 'boost', 'passive', 'dcr',
    ],
    blocks: [
      {
        t: 'ul',
        items: [
          '**Measured phase** contains each driver’s real travel time to the mic. Measure both drivers with the same time reference and the mutual time offset — THE ingredient for a sum that truly adds up — comes free in the data.',
          '**Minimum phase** is a reconstruction from magnitude alone: all timing is gone and has to be put back by hand as an offset. VituixCAD works that way; this tool only in the Minimum comparison mode.',
          '**Excess delay** = measured phase minus the minimum-phase reconstruction, fitted as a pure delay: the real acoustic travel time. Beware: the raw bulk-delay fit is **not** the same — it absorbs the driver’s own minimum-phase slope and can even give the wrong sign (on the KOAN set the raw fit says "tweeter 47 µs later", the excess fit "tweeter ~50 µs earlier" — and the latter matches the physical depth). The VituixCAD bridge therefore always uses the excess Δ.',
          '**Passive cannot boost**: a passive network can only attenuate. All EQ is therefore cut, and "raise the rest" does not exist — though the total level can drop (attenuating the loudest branch is free for flatness).',
          '**Coil DCR is real**: a series coil in the woofer path costs level and damping. The catalog computes with real wire gauges; thinner wire = cheaper but more resistance.',
        ],
      },
    ],
  },
  {
    id: 'validation',
    title: '🎯 How well does the simulation predict? (validation)',
    keywords: [
      'validation', 'accuracy', 'deviation', 'measurement versus model', 'compare',
      'cancellation', 'dip', 'interference', 'sensitivity', 'uncertainty',
      'rg', 'source resistance', 'amplifier', 'cables', 'drawing error', 'schematic',
    ],
    blocks: [
      {
        t: 'p',
        text: 'In Aug 2026 the simulation was put against real measurements (KOAN mid and tweeter, each measured bare and with a scratch filter, plus both together; same mic, same clock). This is what came out and what it tells you about the numbers you see in **🔬 Compare** mode.',
      },
      { t: 'h', text: 'What was measured' },
      {
        t: 'ul',
        items: [
          '**Single branch (mid with 1.8 mH + 6.8 µF)**: model and measurement within **±0.25 dB average and 2.4° phase** over 200 Hz–20 kHz. That is the accuracy of the solver on the measured impedance once the schematic is what was actually built.',
          '**Single branch (tweeter)**: ~±1 dB — but only after the schematic was drawn as it sat on the bench (the coil was across the amplifier terminals, not across the tweeter) and with the source resistance filled in. Drawn "as intended" the model was 8 dB off. That was not a simulation error: the app computed exactly what was drawn.',
          '**Both together**: ±0.6 dB average, 2° phase; the interference dip near 1 kHz sat at the right frequency (984 Hz computed, 971 measured), but at the bottom of that dip ~2 dB remained — see below for why that is not a code error, and why you never want such a dip in a design anyway.',
          'The whole computation path (parsing, resample, phase unwrap, solver, complex sum) was also checked against an independent hand calculation on the raw measurement data: equal to 0.1 dB, dip included. That check runs as a test in every build.',
        ],
      },
      { t: 'h', text: 'Why a cancellation is sensitive — and a good crossover is not' },
      {
        t: 'p',
        text: 'Where two drivers nearly cancel, the sum sits dBs below each branch, and every small error in one branch is magnified. Two equally loud branches, an error of **10°** in one of them (unit spread, mic position, an estimated coil DCR):',
      },
      {
        t: 'ul',
        items: [
          'phase difference **15°** → error in the sum **0.13 dB**',
          'phase difference **45°** → **0.3 dB**',
          'phase difference **90°** → **0.8 dB**',
          'phase difference **140°** → **2.4 dB** (the test case above)',
          'phase difference **160°** → **more than 4 dB**',
          'A 1 dB level error in one branch: at ≤ 45° ~0.5 dB in the sum (halved), at 160° double.',
        ],
      },
      {
        t: 'p',
        text: 'That is the physics of two vectors nearly cancelling — every simulator (VituixCAD, LEAP, LspCAD too) has the same sensitivity; the difference is whether the tool tells you. That is why the colour ladder sits at 15/45/90/120°: **green and yellow (≤ 45°) does not just mean "sounds right" but also "is predictable"** — a measurement error is halved there instead of doubled. Red (> 120°) means: here you lean on cancellation, and the SPL curve at that spot is a guess of a few dB whatever you do. A design that is flat thanks to a cancellation is flat on paper and a lottery in the cabinet; the optimizer deliberately steers away from it.',
      },
      { t: 'h', text: 'Rules for an honest comparison' },
      {
        t: 'ul',
        items: [
          '**Draw what you built, not what you meant.** Coil before or after the cap, cap before or after the coil — both arrived in the test as an "8 dB model error" and were drawing errors. The app shows that difference hard; that is the point.',
          '**Rg on the generator is your bench**: amplifier + leads + clips (~1.2 Ω in the test). Fill it in for a comparison against a measurement; put it back to ~0 for the design. And never hang anything low-impedance across the amplifier input — then you measure your amplifier, not your filter.',
          '**Measure the coil DCR** and enter it on the coil; an estimated DCR is the largest unknown in a single branch.',
          '**Compare where the branches add, not where they cancel.** If you want a summed measurement as proof: measure it twice, tweeter normal and inverted. The variant without the dip is the honest reference (10° = 0.1 dB there); the variant with the dip tells you how large your unknowns are.',
          'The single-branch comparisons cannot, by construction, check two things: the relative timing between the branches (the phase comparison fits the mic distance away per measurement) and the level ratio between sweeps (each sweep gets its own offset). Exactly those two set the depth of a dip — one more reason to do the summed measurement.',
        ],
      },
    ],
  },
  {
    id: 'vituixcad',
    title: '🔁 VituixCAD exchange',
    keywords: [
      'vxp', 'export', 'import', 'variant', 'delay', 'bridge', 'minimum phase',
      'amount of sources must be one', 'folder', 'measurement files',
    ],
    blocks: [
      {
        t: 'ul',
        items: [
          '**Import**: a .vxp loads all crossover variants (selectable on the Setup tab) including the drawn topology. The drawing of an imported variant is deliberately not re-laid.',
          '**Export .vxp** (Network tab) writes all design tabs as variants; the active tab becomes the opening schematic. In Chromium the button writes a complete folder: the .vxp file WITH all response and impedance files beside it, so VituixCAD opens without "files not found". Firefox/Safari get the .vxp download only, plus a list of which files to place next to it by hand.',
          '**Timing bridge**: VituixCAD reconstructs the phase itself (minimum phase), so the export gives each driver its excess delay as ResponseDelay. That is how VituixCAD reproduces our measured sum. Do **not** also enter that delay by hand — it would count twice. The same advice sits under the timing panel for anyone filling in the bridge manually.',
          'Tabs without exactly one source (e.g. an imported bare filter) are skipped at export with a note — VituixCAD refuses such variants.',
          '**"Amount of sources must be one"** in VituixCAD means: a variant without a working generator. The export catches all known causes itself; if you still see this message, the file is almost certainly old or edited afterwards — export again from the current version.',
        ],
      },
    ],
  },
  {
    id: 'shortcuts',
    title: '⌨️ Shortcuts & mouse',
    keywords: ['keys', 'keyboard', 'mouse', 'undo', 'redo', 'escape', 'wheel', 'shortcuts'],
    blocks: [
      {
        t: 'ul',
        items: [
          '**Cmd/Ctrl+Z** — undo in the network editor; **Cmd/Ctrl+Shift+Z** or **Ctrl+Y** — redo.',
          '**Esc** — closes popups (this manual, the wizard); cancels renaming a tab.',
          '**Scroll wheel** on a chart — X-zoom around the cursor; **Shift+wheel** — Y-zoom; **drag** — pan; **double-click** — reset.',
          '**Scroll wheel on an EQ handle** — adjust Q; **drag** — frequency + gain.',
          '**Double-click a tab name** — rename (Enter = confirm, Esc = cancel).',
        ],
      },
    ],
  },
  {
    id: 'troubleshoot',
    title: '🩺 Troubleshooting',
    keywords: [
      'error', 'problem', 'widen the view range', 'no prices', 'autosave', 'cancel',
      'reset', 'lost', 'slow', 'safety',
    ],
    blocks: [
      {
        t: 'ul',
        items: [
          '**"widen the view range"** from the component tuner: the evaluation band is so narrow that the network could derail out of sight; the safety gate rejected the result and restored the seed values. Widen the view range and run again.',
          '**BOM without prices / "no exact catalog value"**: import the catalog with real SKUs and prices first (Import tab) and then run the snap or optimizer again.',
          '**Optimizer seems to hang**: it runs in a web worker, so the UI stays responsive and the progress counter should tick. **Cancel** aborts hard; the design stays untouched.',
          '**Filter gone after a build?** Nothing is lost: every build and import opens its own tab, and the Filter bands section merely collapses on bypass (the summary stays in the header). **Reset filters** next to Optimize DOES truly wipe — and asks first.',
          '**Autosave**: the session is saved continuously and an empty session never overwrites an existing autosave. For real certainty: **Save project** to a file.',
          '**Timing verdict not green**: check that both drivers were measured in the same session with the same time reference (loopback/acoustic reference). Without a shared reference the measured phase sum is not trustworthy — Minimum mode plus a manual offset is then the honest alternative.',
          '**VituixCAD errors opening an export**: see the VituixCAD exchange section.',
        ],
      },
    ],
  },
];
