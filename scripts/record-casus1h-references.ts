/**
 * H-1 — DE RECORDER VAN CASUS 1h (de KOAN als hybride).
 *
 * `npx vite-node scripts/record-casus1h-references.ts` — seconden, geen tune.
 *
 * Schrijft in `test-fixtures/casus1h/golden_refs_casus1h.json`:
 *  - klasse A: de afgeleide parameters per driver (alle DRIE — de actieve weg
 *    hoort erbij omdat haar meting de MODEL-tak voedt), de twee kruisvensters,
 *    de verankerde gaps, en het blok dat deze casus eigen is: `actieve_zijde`
 *    per gestelde overname, met de drie afgeleide DSP-instellingen, de
 *    nul-marge waarop de polariteit gekozen is en de tegenproef;
 *  - klasse B: de metrieken van elke `H_KAND_n` die op schijf staat, mét het
 *    DSP-doelblok van die netlist;
 *  - `h1_md_vervalt`: de MEETING dat M-D op deze casus geen grootheid meer heeft;
 *  - `h1_qes`: wat de van casus 1b afwijkend WEL gestelde Q_es-eis hier doet;
 *  - `h1_vloer_nameting`: wat de hoofdversterker nog ziet.
 *
 * Draai hem NA `generate-casus1h-v2-candidates.ts`.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import {
  ACTIVE_WAY,
  CASUS1H_ACTIVE,
  CASUS1H_DIR,
  CASUS1H_EXCURSION,
  CASUS1H_FIELD_ALIGNMENTS,
  CASUS1H_MERGE_FIT_UNCERTAINTY_DEG,
  CASUS1H_QES_MULTIPLIER_MAX,
  CASUS1H_STATED_ORDER,
  CASUS1H_TARGET_CURVE,
  CASUS1H_V2_BAND_HZ,
  CASUS1H_V2_BAND_SOURCE,
  CASUS1H_V2_GRID,
  GOLDEN1H_PATH,
  PASSIVE_LOWEST_WAY,
  casus1hActiveAt,
  casus1hField,
  casus1hFiles,
  casus1hManifest,
  casus1hReport,
  casus1hSettingsAt,
  loadGolden1h,
} from '../src/lib/engine2/casus1h.fixture.ts';
import { dspTargetBlock } from '../src/lib/engine2/dspTarget.ts';
import type { EngineV2Report } from '../src/lib/engine2/report.ts';
import { describeTargetCurve } from '../src/lib/engine2/requirements/targetCurve.ts';
import { XO_FS_FACTOR_BY_ORDER } from '../src/lib/engine2/constants.ts';
import { logspace, resampleImpedance } from '../src/lib/dsp.ts';

const BREAKUP_SIGNIFICANT_DB = 2.5;
const LIVE_KEY = /^H_KAND_\d+$/;

const r0 = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x));
const r1 = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? null : Number(x.toFixed(1)));
const r2 = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? null : Number(x.toFixed(2)));
const r3 = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? null : Number(x.toFixed(3)));
const r4 = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? null : Number(x.toFixed(4)));

const raw = JSON.parse(readFileSync(GOLDEN1H_PATH, 'utf-8')) as Record<string, unknown> & {
  afgeleide_parameters: Record<string, Record<string, unknown>>;
  verankerde_gaps_dB: Record<string, unknown>;
  kruisvensters: Record<string, Record<string, unknown>>;
  kandidaten: Record<string, Record<string, unknown>>;
  manifest_en_geometrie: Record<string, unknown> & { netlists: Record<string, string> };
};
const golden = loadGolden1h();
const manifest = casus1hManifest();
const files = casus1hFiles(manifest);
/* The bare report is read at the FIRST stated position: every class-A quantity
 * below is a function of the measurements alone, and the ones that are not —
 * the active side's own settings — are recorded per position in their own
 * block. */
const bare = casus1hReport(null, manifest, files, golden);
const drv = (r: EngineV2Report, name: string) => {
  const d = r.ingest.drivers.find((x) => x.driver === name);
  if (!d) throw new Error(`casus 1h: no driver ${name} in the report`);
  return d;
};
const commit = execSync('git rev-parse HEAD', { cwd: join(CASUS1H_DIR, '..', '..') }).toString().trim();
const WAYS = ['woofer', 'mid', 'tweeter'] as const;

/* ================================================================== *
 * 1. afgeleide_parameters — class A, per driver
 * ================================================================== */
const ap = raw.afgeleide_parameters;
for (const name of WAYS) {
  const d = drv(bare, name);
  const re = d.re;
  const z = d.impedance;
  const exc = bare.metrics.driveExcursion.find((x) => x.driver === name) ?? null;
  const dir30 = d.directivity.find((p) => Math.abs(p.angleDeg) === 30) ?? null;
  ap[name] = {
    klasse: 'A',
    afhankelijkheid: 'meting',
    klasse_toelichting:
      'Functies van de METINGEN alleen — gerecordeerd op een rapport zónder netlist, dus dezelfde waarde ' +
      'op elke H_KAND. De ACTIEVE weg staat erbij omdat haar meting de MODEL-tak voedt; haar eigen ' +
      'excursie- en vermogensgrenzen horen bij de actieve versterker en worden hier niet geoordeeld.',
    rol: name === ACTIVE_WAY ? 'ACTIEF — gemodelleerde tak, geen element in enige netlist' : 'PASSIEF',
    Re: re ? r2(re.ohm) : null,
    Re_herkomst: re?.sourceText ?? null,
    Re_direct: re ? r2(re.directOhm) : null,
    Re_fit_residu: re?.fit ? r4(re.fit.relativeResidual) : null,
    Re_fit_band_hz: re?.fit ? [r1(re.fit.bandHz[0]), r1(re.fit.bandHz[1])] : null,
    Re_fit_model: re?.fit?.model ?? null,
    [name === 'woofer' ? 'fp' : name === 'mid' ? 'fc' : 'fs']: r1(z?.fundamentalHz ?? null),
    Zmax: r2(z?.sealed?.zMaxOhm ?? z?.motionalPeaks?.[0]?.ohm ?? null),
    kast: z?.type ?? null,
    semi_inductantie_n: d.semiInductance?.valid ? r2(d.semiInductance.n) : null,
    breakups: (d.breakups?.peaks ?? []).filter((p) => p.dB >= BREAKUP_SIGNIFICANT_DB).map((p) => [r0(p.fHz), r2(p.dB)]),
    breakup_scanband_hz: d.breakups ? [r1(d.breakups.bandHz[0]), r1(d.breakups.bandHz[1])] : null,
    dir_m6_30: r0(dir30?.minus6Hz ?? null),
    NF_fmax: r0(d.nearFieldCeilingHz),
    FF_vloer: d.onAxis ? r1(d.onAxis.bandHz[0]) : null,
    FF_vloer_bron: d.onAxis?.bandFloorProvenance ?? null,
    ...(exc
      ? {
          excursie_x_per_V_op_f0_mm_per_V: r4(exc.xPerVoltMmPerV),
          excursie_toegestane_spanning_V: r2(exc.ceiling.allowedVolts),
          excursie_plafond_re_ingang_dB: r2(exc.ceiling.ceilingDbReInput),
          excursie_toelichting:
            `M-C v2.0 (V49), route ${exc.route}, klasse A — dezelfde getallen als casus 1 (dezelfde kaart, ` +
            `dezelfde sweep). ${'off' in exc.acoustic ? `Route 2: ${exc.acoustic.off}.` : 'Route 2 gemeten.'}` +
            (name === ACTIVE_WAY
              ? ' OP DE ACTIEVE WEG IS DIT EEN LEZING EN GEEN EIS: haar versterker en DSP begrenzen haar, niet dit netwerk.'
              : ''),
        }
      : { excursie_toelichting: 'M-C v2.0 staat UIT op deze weg: geen excursie-invoer.' }),
  };
}

/* ================================================================== *
 * 2. actieve_zijde_afgeleid — class A, THE block this casus owns
 * ================================================================== */
{
  const perPos = CASUS1H_ACTIVE.positionsHz.map((hz) => {
    const a = casus1hActiveAt(hz, manifest, files).report.activeSide!;
    return {
      hz,
      gain_dB: r3(a.settings?.gainDb),
      delay_ms: r4(a.settings?.delayMs),
      omgekeerd: a.settings?.inverted ?? null,
      nul_marge_dB: r2(a.nullMarginDb),
      andere_polariteit_nul_marge_dB: r2(a.otherPolarityNullMarginDb),
      andere_polariteit_delay_ms: r4(a.otherPolarityDelayMs),
      polariteit_marge_dB: a.nullMarginDb !== null && a.otherPolarityNullMarginDb !== null ? r2(a.nullMarginDb - a.otherPolarityNullMarginDb) : null,
      spl_venster_over_de_fitband_dB: r3(a.handoverWindowDb),
      andere_polariteit_spl_venster_dB: r3(a.otherPolarityWindowDb),
      fitband_hz: [r1(a.fitBandHz[0]), r1(a.fitBandHz[1])],
    };
  });
  raw.afgeleide_parameters.actieve_zijde_afgeleid = {
    klasse: 'A',
    afhankelijkheid: 'meting',
    klasse_toelichting:
      'De DRIE DSP-instellingen per gestelde overname, AFGELEID uit de metingen en de gestelde doelvorm en ' +
      'uit niets anders — dus dezelfde waarde op elke netlist, en vastgezet vóór de zoektocht draait. Dat ' +
      'laatste is geen detail: een gain en een delay die op het GELEVERDE netwerk gefit worden zijn knoppen ' +
      'die de zoektocht kan verzetten, en dan hangt de som waarop een kandidaat beoordeeld is af van een ' +
      'getal dat die kandidaat zelf gekozen heeft.',
    versie: bare.activeSide?.version ?? null,
    actieve_weg: ACTIVE_WAY,
    onderste_passieve_weg: PASSIVE_LOWEST_WAY,
    doelvorm: `${CASUS1H_ACTIVE.kind}${CASUS1H_ACTIVE.order}`,
    fitmaat:
      'de REVERSED-POLARITY NULL MARGE: hoeveel de som boven het niveau uitkomt dat dezelfde twee takken ' +
      'maken met de gemodelleerde tak omgepoold, gemiddeld over de fitband. Diep = in fase, en het is ' +
      'dezelfde meting die de eindwaarde in de kast vaststelt.',
    per_overname: perPos,
    bevinding_polariteit:
      'Op 400, 450 en 500 Hz is de polariteit NORMAAL met een marge van 0,8-1,5 dB; op 362,3 Hz wint ' +
      'OMGEKEERD met 0,4 dB — onder wat de merge-fit-onzekerheid alleen al waard is (M-4 mat 8,2-11,8° ' +
      'modelonzekerheid in de mid-merge). Op die positie is de polariteit dus NIET door de data beslist, ' +
      'en het DSP-doelblok zegt dat in plaats van een zelfverzekerde boolean af te drukken.',
  };
}

/* ================================================================== *
 * 3. kruisvensters — class A, BOTH pairs
 * ================================================================== */
{
  const field = casus1hField(bare);
  for (const [lower, upper] of [
    [ACTIVE_WAY, PASSIVE_LOWEST_WAY],
    [PASSIVE_LOWEST_WAY, 'tweeter'],
  ] as const) {
    const w = bare.predesign.windows.find((x) => x.lower === lower && x.upper === upper);
    if (!w) throw new Error(`casus 1h: no ${lower}→${upper} window in the report`);
    const wi = bare.predesign.windowInputs[bare.predesign.windows.indexOf(w)];
    const isActivePair = lower === ACTIVE_WAY;
    const axis = isActivePair ? null : field.field.axes[0];
    raw.kruisvensters[`${lower}_${upper}_orde${CASUS1H_STATED_ORDER}`] = {
      klasse: 'A',
      afhankelijkheid: 'meting',
      venster: [r1(w.floorHz), r1(w.ceilingHz)],
      vloer_bindend: w.floorBy?.rule ?? null,
      plafond_bindend: w.ceilingBy?.rule ?? null,
      grenzen: w.limits.map((l) => ({ kant: l.side, hz: r1(l.hz), regel: l.rule, bron: l.source })),
      spanningen: w.tensions,
      leeg: w.empty,
      f_s_boven_hz: r1(w.upperFsHz),
      k_fs_hz: w.upperFsHz !== null ? r1(w.upperFsHz * (XO_FS_FACTOR_BY_ORDER[w.order] ?? NaN)) : null,
      excursievloer_hz: wi?.upperDriveCeilingDb != null && w.upperFsHz !== null ? r1(w.upperFsHz * 2 ** (Math.abs(wi.upperDriveCeilingDb) / (6 * w.order))) : null,
      ctc_mm: r1(w.spacingMm),
      ctc_bron: w.spacingSource,
      ...(isActivePair
        ? {
            gestelde_posities_hz: CASUS1H_ACTIVE.positionsHz,
            gestelde_posities_binnen_venster: CASUS1H_ACTIVE.positionsHz.map((hz) => ({
              hz,
              binnen: w.floorHz !== null && w.ceilingHz !== null ? hz >= w.floorHz && hz <= w.ceilingHz : null,
            })),
            klasse_toelichting:
              'DE OVERNAME VAN DE ACTIEVE ZIJDE, en zij wordt NIET gezocht: de vier posities zijn gesteld en de ' +
              'actieve zijde realiseert ze in een processor. Het venster staat erbij omdat het de gestelde ' +
              'posities toetsbaar maakt vóór er iets draait — en alle vier liggen erbinnen. Dat het venster ' +
              'bestaat is zelf de eerste winst van H-1: op een tweeweg zonder gestelde actieve zijde bestaat ' +
              'de overname niet en is er niets om een venster van af te leiden (stap 0, c).',
          }
        : {
            veld_verkenning: {
              _: 'Het A5d-veld in de VERKENNINGSMODUS op de ENE passieve overname.',
              posities_hz: axis!.positionsByOrder.flatMap((p) => p.hz.map(r1)),
              orden: axis!.orders,
              bibliotheek: CASUS1H_FIELD_ALIGNMENTS.map((a) => `${a.kind}${a.order}`),
              afgeleid: field.field.parameters.derivedSize,
              budget: field.field.parameters.chainBudget,
              kandidaten: field.field.candidates.length,
            },
            klasse_toelichting:
              'DE ENE PASSIEVE OVERNAME. Hetzelfde venster als casus 1 en casus 1b: het is een functie van de ' +
              'twee drivers, de gestelde orde, het gestelde tweetergetal en de c-t-c, en die vier deelt casus 1h ' +
              'met beide. Dat de woofer actief is verandert er niets aan — nagemeten in de generator, die stopt ' +
              'als dit venster met de actieve overname meebeweegt.',
          }),
    };
  }
}

/* ================================================================== *
 * 4. verankerde_gaps_dB — class A
 * ================================================================== */
{
  const g = bare.predesign.gaps;
  raw.verankerde_gaps_dB = g
    ? {
        klasse: 'A',
        afhankelijkheid: 'meting',
        anker: g.anchor,
        anker_reden: g.anchorReason,
        gaps_tov_anker: Object.fromEntries(g.ways.map((w) => [w.driver, r3(w.gapToAnchorDb)])),
        budgetten: Object.fromEntries(g.ways.map((w) => [w.driver, r3(w.budgetDb)])),
        anker_wissel_waarschuwing: g.anchorSwitchWarning,
        notities: g.notes,
        doelcurve: describeTargetCurve(CASUS1H_TARGET_CURVE),
        klasse_toelichting:
          'Anker en gap zijn functies van de gemeten niveaus en de A5d.3-vensters (casus 1\'s V45/M-1-regel), ' +
          'over ALLE DRIE de wegen — de actieve erbij, want zij speelt mee. Op een hybride is het gap van de ' +
          'ACTIEVE weg geen pad-opdracht maar de DSP-gain: het is precies de grootheid die actieve_zijde_afgeleid ' +
          'per overname uitrekent, en dat die twee dezelfde vraag beantwoorden is de reden dat zij hier naast ' +
          'elkaar staan.',
      }
    : {
        klasse: 'A',
        afhankelijkheid: 'meting',
        geblokkeerd: bare.predesign.gapsBlocked,
        klasse_toelichting: 'GEBLOKKEERD (UI-1): een niveau rust op een onbekende vensterband.',
      };
}

/* ================================================================== *
 * 5. M-D vervalt, Q_es bijt of niet, en wat de hoofdversterker ziet
 * ================================================================== */
{
  const wooferLf = bare.metrics.lfBump.find((x) => x.driver === ACTIVE_WAY) ?? null;
  raw.manifest_en_geometrie.h1_md_vervalt = {
    klasse: 'A',
    afhankelijkheid: 'meting',
    _:
      'DE MEETING DAT M-D OP DEZE CASUS GEEN GROOTHEID MEER HEEFT, en zij staat hier omdat "de rij is leeg" ' +
      'en "de eis is niet van toepassing" er in een rapport hetzelfde uitzien. M-D begrenst wat de REACTANTIES ' +
      'van het passieve filter met de bovenste reflexpiek van het wooferpaar doen; op een hybride staat er geen ' +
      'passieve seriespoel meer tussen de versterker en dat paar, dus er is niets om te begrenzen. De A5d.6-' +
      'inversie levert daarmee ook geen spoelplafond meer op de onderste weg.',
    m_d_op_de_actieve_weg: wooferLf
      ? { extra_dB: r2(wooferLf.result.extraDb), lift_dB: r2(wooferLf.result.liftDb), opslingering_dB: r2(wooferLf.result.resonantDb) }
      : null,
    waarom_dat_getal_geen_eis_is:
      'Zonder netlist is er geen tak en dus geen M-D; met een H_KAND-netlist is de actieve weg er nog steeds ' +
      'niet in, dus de metriek heeft geen tak van deze weg om te lezen. De eis staat in ' +
      'gestelde_eisen.niet_overgenomen met deze reden.',
    budget_niet_gewapend: true,
  };
  raw.manifest_en_geometrie.h1_qes = {
    klasse: 'A',
    afhankelijkheid: 'meting',
    _:
      'WAT DE VAN CASUS 1b AFWIJKEND WÉL GESTELDE Q_es-EIS HIER DOET. Op casus 1b is zij niet overgenomen omdat ' +
      'zij op de R_e van het wooferpaar is afgeleid; op casus 1h is de mid de onderste PASSIEVE weg en draagt zij ' +
      'de serieweerstand die M-E vermenigvuldigt, dus de vraag die de eis stelt is hier wél de vraag. Of zij BIJT ' +
      'is een meetresultaat en staat hieronder.',
    gestelde_max: CASUS1H_QES_MULTIPLIER_MAX,
    gesteld_op_weg: PASSIVE_LOWEST_WAY,
    per_netlist: {} as Record<string, unknown>,
  };
  /* The V30/V32 re-measurement, on the ways that remain: each bare sweep's own
   * minimum, and the pairwise parallel of the two the main amplifier now sees.
   * Read off the measured impedances on their own grids — no netlist, no
   * assumption about which combination this design ever presents. */
  const zMins: Record<string, unknown> = {};
  const sweeps: Record<string, { f: readonly number[]; mag: readonly number[]; ph: readonly number[] }> = {};
  for (const e of manifest.entries) {
    if (e.kind !== 'Z') continue;
    const f = files.find((x) => x.entry.file === e.file);
    if (f?.impedance) sweeps[e.driver] = { f: f.impedance.freq, mag: f.impedance.magnitude, ph: f.impedance.phaseDeg };
  }
  for (const [name, s0] of Object.entries(sweeps)) {
    let lo = Infinity;
    let at = NaN;
    for (let i = 0; i < s0.f.length; i++) {
      if (s0.mag[i] < lo) {
        lo = s0.mag[i];
        at = s0.f[i];
      }
    }
    zMins[name] = { min_ohm: r2(lo), bij_hz: r1(at), rol: name === ACTIVE_WAY ? 'ACTIEF — de hoofdversterker ziet deze weg niet meer' : 'PASSIEF' };
  }
  {
    /* mid || tweeter, on the union of their own grids — the combination the
     * main amplifier is now alone with. */
    const a1 = sweeps[PASSIVE_LOWEST_WAY];
    const b1 = sweeps.tweeter;
    if (a1 && b1) {
      const gAll = logspace(
        Math.max(a1.f[0], b1.f[0]),
        Math.min(a1.f[a1.f.length - 1], b1.f[b1.f.length - 1]),
        800,
      );
      const za = resampleImpedance(a1.f, a1.mag, a1.ph, gAll).z;
      const zb = resampleImpedance(b1.f, b1.mag, b1.ph, gAll).z;
      let lo = Infinity;
      let at = NaN;
      for (let i = 0; i < gAll.length; i++) {
        const dRe = za[i].re + zb[i].re;
        const dIm = za[i].im + zb[i].im;
        const den = dRe * dRe + dIm * dIm;
        const nRe = za[i].re * zb[i].re - za[i].im * zb[i].im;
        const nIm = za[i].re * zb[i].im + za[i].im * zb[i].re;
        const m = Math.hypot((nRe * dRe + nIm * dIm) / den, (nIm * dRe - nRe * dIm) / den);
        if (m < lo) {
          lo = m;
          at = gAll[i];
        }
      }
      zMins[`${PASSIVE_LOWEST_WAY}_parallel_tweeter`] = { min_ohm: r2(lo), bij_hz: r1(at) };
    }
  }
  raw.manifest_en_geometrie.h1_vloer_nameting = {
    klasse: 'A',
    afhankelijkheid: 'meting',
    _:
      'WAT DE HOOFDVERSTERKER OP EEN HYBRIDE NOG ZIET — de V30/V32-nameting, op de wegen die overblijven. De ' +
      'gestelde vloer van 2,6 Ω is op casus 1 gemotiveerd op het WOOFERPAAR (3,17 Ω kaal, de laagste kale ' +
      'belasting van de drie); dat paar hangt hier aan zijn eigen versterker. Wat overblijft staat hieronder, en ' +
      'de eis is NIET versoepeld: versoepelen op grond van een weg die verdwijnt is de stille verruiming die dit ' +
      'boek verbiedt.',
    kale_minima_ohm: zMins,
  };
}

/* ================================================================== *
 * 6. kandidaten — class B, with the DSP target block
 * ================================================================== */
const netlists = raw.manifest_en_geometrie.netlists;
for (const k of Object.keys(netlists)) if (LIVE_KEY.test(k)) delete netlists[k];
const liveFiles = readdirSync(CASUS1H_DIR)
  .filter((f) => /^H-KAND-\d+\.adsfilter\.json$/.test(f))
  .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
for (const f of liveFiles) netlists[f.replace(/^H-KAND-(\d+)\.adsfilter\.json$/, 'H_KAND_$1')] = f;
for (const k of Object.keys(raw.kandidaten)) if (LIVE_KEY.test(k) && !(k in netlists)) delete raw.kandidaten[k];
golden.manifest_en_geometrie.netlists = { ...netlists };

/* Which stated active handover each frozen netlist came from — read from the
 * generator's provenance, never guessed: the label carries it and the label is
 * what the shortlist froze. */
const herkomstPath = join(CASUS1H_DIR, '..', 'casus1h_v2_herkomst.json');
const herkomst = existsSync(herkomstPath)
  ? (JSON.parse(readFileSync(herkomstPath, 'utf-8')) as {
      gegenereerd_op_commit: string;
      run_vingerafdruk: string;
      opgenomen_op: unknown;
      shortlist: unknown;
      veld: unknown;
      actieve_zijde: unknown;
      bestanden: { name: string; label: string }[];
      kandidaat_uitkomst: { label: string; geleverd: boolean; looptijd_s: number; actieve_overname_hz: number }[];
    })
  : null;
const handoverOf = (key: string): number => {
  const file = netlists[key];
  const name = file.replace(/\.adsfilter\.json$/, '');
  const row = herkomst?.bestanden.find((b) => b.name === name);
  const hz = herkomst?.kandidaat_uitkomst.find((o) => o.label === row?.label)?.actieve_overname_hz;
  if (hz === undefined) throw new Error(`casus 1h: no stated active handover recorded for ${key} — run the generator first`);
  return hz;
};

const qesPer: Record<string, unknown> = (raw.manifest_en_geometrie.h1_qes as { per_netlist: Record<string, unknown> }).per_netlist;
for (const key of Object.keys(netlists)) {
  const hz = handoverOf(key);
  const rep = casus1hReport(key, manifest, files, golden, casus1hSettingsAt(hz));
  const pt = rep.system.phaseTracking;
  const wm = pt.find((p) => p.lower === ACTIVE_WAY && p.upper === PASSIVE_LOWEST_WAY);
  const mt = pt.find((p) => p.lower === PASSIVE_LOWEST_WAY && p.upper === 'tweeter');
  const dsp = dspTargetBlock(rep, { mergeFitUncertaintyDeg: CASUS1H_MERGE_FIT_UNCERTAINTY_DEG ?? undefined });
  const qes = rep.metrics.thevenin.find((t) => t.qMultiplier !== null)?.qMultiplier ?? null;
  qesPer[key] = {
    actieve_overname_hz: hz,
    Qes_mult: r2(qes),
    binnen_eis: CASUS1H_QES_MULTIPLIER_MAX !== null && qes !== null ? qes <= CASUS1H_QES_MULTIPLIER_MAX : null,
  };
  raw.kandidaten[key] = {
    klasse: 'B',
    afhankelijkheid: 'meting+netlist',
    klasse_toelichting:
      `Metrieken op de VASTE netlist manifest_en_geometrie.netlists.${key}, een BESTAND in test-fixtures/casus1h/. ` +
      'Het netwerk komt uit een hybride v2-run (zie manifest_en_geometrie.v2_herkomst), maar de referentie hangt ' +
      'aan het bestand en niet aan die run — daarom klasse B en geen klasse C. ELKE SOM hieronder draagt de ' +
      'gemodelleerde actieve tak; elke ELEKTRISCHE waarde leest uitsluitend de mid/tweeter-netlist.',
    actieve_overname_hz: hz,
    minZ: r2(rep.metrics.epdr?.minZOhm),
    minZ_bij_hz: r1(rep.metrics.epdr?.minZAtHz ?? null),
    minEPDR: r2(rep.metrics.epdr?.minOhm),
    dissipatie_pct: r0((rep.metrics.dissipation?.totalFraction ?? NaN) * 100),
    grootste_R_W_bij_100W: r2(rep.metrics.dissipation?.elements.find((e) => !e.parasitic)?.watts ?? null),
    Qes_mult: r2(qes),
    V_tweeter_op_fs_dB: r2(rep.metrics.driveVoltage.find((d) => d.driver === 'tweeter')?.db ?? null),
    V_mid_op_fs_dB: r2(rep.metrics.driveVoltage.find((d) => d.driver === PASSIVE_LOWEST_WAY)?.db ?? null),
    hoogdoorlaatbeschermde_wegen: [...rep.gates.highPassProtected],
    rms_vlakheid_dB: r2(rep.system.response?.rmsDeviationDb ?? null),
    spl_venster_pm_dB: r2(rep.system.response?.windowPlusMinusDb ?? null),
    wm_fase_oct: r2(wm?.meanAbsDeg ?? null),
    wm_fase_kruispunt_hz: r1(wm?.crossingHz ?? null),
    mt_fase_oct: r2(mt?.meanAbsDeg ?? null),
    mt_fase_kruispunt_hz: r1(mt?.crossingHz ?? null),
    lobing_eind_dip_dB: r2(rep.metrics.lobingFinal?.worstDipDb ?? null),
    poorten: rep.gates.verdicts.filter((v) => v.active).map((v) => ({ poort: v.gate, onderwerp: v.subject, waarde: r3(v.value), grens: v.limit, geslaagd: v.pass })),
    dsp_doel: dsp
      ? {
          _: 'H-1 — HET DSP-DOELBLOK van deze netlist: de getallen die in de processor gaan. DELAY en POLARITEIT zijn klasse A (afgeleid vóór de zoektocht, gelijk op elke netlist); de GAIN is een NIVEAUMATCH op de tak die gebouwd is — `klasse_A_gain_dB` is wat de gestelde vorm alleen zou vragen, en het verschil is wat de realisatie aan niveau kost.',
          laagdoorlaat: dsp.lowPass,
          hoogdoorlaat_passief: dsp.passiveHighPass,
          geleverd: {
            gain_dB: r3(dsp.judged.gainDb),
            klasse_A_gain_dB: r3(rep.activeSide?.classAGainDb ?? null),
            delay_ms: r4(dsp.judged.delayMs),
            omgekeerd: dsp.judged.inverted,
          },
          delivered_refit: dsp.deliveredRefit
            ? { gain_dB: r3(dsp.deliveredRefit.gainDb), delay_ms: r4(dsp.deliveredRefit.delayMs), spl_venster_dB: r3(dsp.deliveredRefit.handoverWindowDb) }
            : null,
          polariteit: {
            nul_marge_dB: r2(dsp.polarity.nullMarginDb),
            andere_polariteit_nul_marge_dB: r2(dsp.polarity.otherPolarityNullMarginDb),
            marge_dB: r2(dsp.polarity.marginDb),
          },
          fitband_hz: [r1(dsp.fitBandHz[0]), r1(dsp.fitBandHz[1])],
          notities: dsp.notes,
        }
      : null,
  };
}
raw.kandidaten._parameters = {
  klasse: 'B',
  afhankelijkheid: 'meting+netlist',
  _: 'V15 — waarop de klasse-B-blokken gemeten zijn: casus1hReport met de actieve overname van DIE netlist (casus1hSettingsAt), het rapportraster (de poortsweep) en het versterkervermogen van casus 1.',
  doelcurve: describeTargetCurve(CASUS1H_TARGET_CURVE),
  fasemaat: 'M-K (V44): gemiddelde |Δφ| over de TOEGELATEN punten. Op het WOOFER→MID-paar is de onderste tak de GEMODELLEERDE actieve tak — de maat oordeelt dus de hybride overname en niet een passieve.',
  actieve_overname_per_netlist: Object.fromEntries(Object.keys(netlists).map((k) => [k, handoverOf(k)])),
};

/* ================================================================== *
 * 7. the pointer to the generator's provenance
 * ================================================================== */
raw.manifest_en_geometrie.v2_herkomst = herkomst
  ? {
      _: 'De hybride v2-run waaruit de H-KAND-bestanden komen: test-fixtures/casus1h_v2_herkomst.json. DOCUMENTATIE — de acceptatie zit in kandidaten.H_KAND_*.',
      bestand: 'test-fixtures/casus1h_v2_herkomst.json',
      gegenereerd_op_commit: herkomst.gegenereerd_op_commit,
      run_vingerafdruk: herkomst.run_vingerafdruk,
      opgenomen_op: herkomst.opgenomen_op,
      shortlist: herkomst.shortlist,
      actieve_zijde: herkomst.actieve_zijde,
      uitkomsten: herkomst.kandidaat_uitkomst.map((o) => ({ label: o.label, geleverd: o.geleverd, looptijd_s: o.looptijd_s, actieve_overname_hz: o.actieve_overname_hz })),
      veld: herkomst.veld,
    }
  : { _: 'NOG NIET GEGENEREERD: draai scripts/generate-casus1h-v2-candidates.ts.' };
raw.manifest_en_geometrie.v2_route = {
  _: 'H-1 — de HYBRIDE route: handleV2Request kind v2ChainOne → runDesignChain, met een gestelde actieve overname. De onderste passieve weg krijgt de gestelde hoogdoorlaat, de som draagt de gemodelleerde actieve tak, en elke elektrische grootheid leest uitsluitend de passieve netlist.',
  raster: { van_hz: r1(CASUS1H_V2_GRID[0]), tot_hz: r1(CASUS1H_V2_GRID[CASUS1H_V2_GRID.length - 1]), punten: CASUS1H_V2_GRID.length },
  oordeelband_hz: CASUS1H_V2_BAND_HZ.map(r1),
  oordeelband_bron: CASUS1H_V2_BAND_SOURCE,
  gestelde_orde: CASUS1H_STATED_ORDER,
  excursie_invoer: { piek_W: CASUS1H_EXCURSION.amplifierPeakPowerW ?? null, nominale_last_ohm: CASUS1H_EXCURSION.amplifierNominalLoadOhm ?? null, xmax_marge: CASUS1H_EXCURSION.xmaxMarginFraction ?? null },
  gerecordeerd_op_commit: commit,
};

writeFileSync(GOLDEN1H_PATH, `${JSON.stringify(raw, null, 1)}\n`, 'utf-8');
console.log(`wrote ${GOLDEN1H_PATH}`);
for (const n of WAYS) console.log(`${n}: Re ${ap[n].Re} f ${ap[n].fp ?? ap[n].fc ?? ap[n].fs} FF ${ap[n].FF_vloer} plafond ${ap[n].excursie_plafond_re_ingang_dB}`);
for (const k of Object.keys(raw.kruisvensters)) console.log(`window ${k}: ${JSON.stringify(raw.kruisvensters[k].venster)} ${raw.kruisvensters[k].vloer_bindend}/${raw.kruisvensters[k].plafond_bindend}`);
for (const k of Object.keys(netlists)) {
  const b = raw.kandidaten[k] as Record<string, unknown>;
  console.log(
    `${k} (active ${b.actieve_overname_hz} Hz): minZ ${b.minZ} rms ${b.rms_vlakheid_dB} win ±${b.spl_venster_pm_dB} ` +
      `M-K W→M ${b.wm_fase_oct}° M→T ${b.mt_fase_oct}° mid ${b.V_mid_op_fs_dB} dB lobing ${b.lobing_eind_dip_dB}`,
  );
}
