/**
 * M-2 — EEN GEMETEN REFLEXKAST NAAR EEN ANDER VOLUME BRENGEN.
 *
 * WAT HET PROBLEEM WAS EN WAAROM DIT DE OPLOSSING IS. Een meting in een
 * testkast naar het frame van de echte kast brengen vraagt normaal de volledige
 * T/S van de driver: f_s, Q_ms, M_ms, V_as, B_l. Die fit is op casus 1 DRIE KEER
 * geprobeerd en drie keer mislukt — de laatste poging, met de volledige complexe
 * impedantie en 160 startpunten, liep met twee parameters naar hun grens
 * (M_ms naar 55 g tegen een kaart van 44,2, en het volume naar 58 L om een kast
 * van 53,2 te beschrijven). Een fit die op zijn grenzen zit beschrijft de kast
 * niet; hij absorbeert wat het model mist.
 *
 * DE UITWEG IS DAT DE KAST ZICHZELF MEET, op twee plaatsen, en dat de driver
 * daar grotendeels uit valt:
 *
 *  (1) DE POORT/CONUS-VERHOUDING HANGT ALLEEN VAN f_b EN Q_l AF. Met U_d de
 *      volumesnelheid van de conus en U_p die van de poort geldt
 *      U_p/U_d = −Z_c/(Z_c + Z_p), en met ω_b² = 1/(C_ab·M_ap) en
 *      Q_l = √(M_ap/C_ab)/R_ap wordt dat
 *
 *          U_p/U_d = −1 / (1 − (ω/ω_b)² + j·(ω/ω_b)/Q_l)
 *
 *      waarin GEEN ENKELE drivergrootheid voorkomt. Twee parameters op een
 *      volledige complexe gemeten kromme, en Keele's diameterweging maakt van
 *      de twee gemeten nabije velden de twee volumesnelheden.
 *
 *  (2) DE CONUSSNELHEID VOLGT UIT DE GEMETEN IMPEDANTIE. Met Z_b de geblokkeerde
 *      impedantie is Z_mech = B_l²/(Z_gemeten − Z_b), dus de mechanische
 *      impedantie hoeft niet gemodelleerd te worden — zij wordt AFGELEZEN. Het
 *      volume zit er maar op één plek in, in de akoestische last N·S_d²·Z_ab,
 *      en die is bekend zodra V, f_b en Q_l bekend zijn. De verhouding van de
 *      conussnelheden tussen twee kasten is dan
 *
 *          v_B/v_A = (Z_mech,A·Z_b + B_l²) / (Z_mech,B·Z_b + B_l²)
 *
 *      met Z_mech,B = Z_mech,A + N·S_d²·(Z_ab,B − Z_ab,A). Daarin komen alleen
 *      S_d, B_l en Z_b voor — f_s, Q_ms, M_ms en V_as vallen eruit.
 *
 * WAT ER DUS NOG GESTELD MOET WORDEN: S_d en B_l uit het datasheet, R_e, en de
 * halfmachts spoelterm van Z_b, die uit de HF-staart van de gemeten sweep te
 * fitten is. Vier getallen in plaats van negen, en drie ervan zijn
 * datasheetgetallen in plaats van fits.
 *
 * WAT DEZE MODULE NIET DOET, en het staat hier omdat een lezer het moet weten:
 *  - Zij neemt aan dat de LEK dezelfde is, dus dat R_ap niet verandert. Dan
 *    schalen f_b en Q_l beide met √(V_A/V_B) bij een ONGEWIJZIGDE poort. Een
 *    andere poort is een ander M_ap en dan moet de aanroeper f_b zelf stellen.
 *  - Zij neemt aan dat de conussen identiek zijn en identiek aangedreven.
 *  - Zij zegt niets over de toestand waarin de nabije velden gemeten zijn. Op
 *    casus 1 zijn die met ÉÉN woofer aangedreven gemeten terwijl de impedantie
 *    er twee draagt; de aanroeper draagt die inconsistentie en hoort haar in de
 *    kop van wat hij schrijft te zetten.
 *
 * P2 IS DE DRAGENDE EIGENSCHAP: met V_B = V_A en f_b,B = f_b,A is élke
 * teruggave EXACT de identiteit, niet bij benadering. `ventedBoxTransform.test.ts`
 * pint dat op nul.
 *
 * Geen I/O en geen engine-import: zuivere functies, zodat de app haar mag
 * importeren en `browserSafe.test.ts` er niet over valt. Zelfde arbeidsdeling
 * als `impedanceFloor.ts`, `phaseAdmission.ts` en `targetLevel.ts`.
 */

import { add, cplx, div, mul, sub, type Complex } from './complex.ts';

/** Luchtdichtheid bij 20 °C, kg/m³. Eenheidsconstante (P6-whitelist). */
export const RHO_AIR = 1.2041;
/** Geluidssnelheid, m/s. Eenheidsconstante (P6-whitelist). */
export const C_AIR = 343;

/** Versiestring: gedragswijziging is een versiebump. */
export const VENTED_BOX_TRANSFORM_VERSION = 'vented-box-transform/1.0';

/** Eén reflexkast, zoals gemeten of zoals bedoeld. */
export interface VentedBox {
  /** Netto volume, litres. */
  volumeL: number;
  /** Afstemming, Hz — het zadel tussen de twee impedantiepieken. */
  tuningHz: number;
  /** Lekkage-Q van de kast. */
  leakageQ: number;
}

/** De akoestische last van de kast en de twee takken waaruit zij bestaat. */
export interface BoxLoad {
  /** De last die de conus ziet: de parallel van compliantie en poort. */
  Zab: Complex;
  /** De kastcompliantie alleen. */
  Zc: Complex;
  /** De poorttak alleen. */
  Zp: Complex;
}

/**
 * De akoestische last van een reflexkast bij één frequentie.
 *
 * `C_ab = V/(ρc²)`, `M_ap = 1/(ω_b²·C_ab)` en `R_ap = √(M_ap/C_ab)/Q_l` — de
 * kast bepaalt de compliantie, de afstemming bepaalt de poortmassa die daarbij
 * hoort, en de lekkage-Q bepaalt de verliezen. Dezelfde formulering die
 * `scripts/generate-casus2-measurements.ts` gebruikt om de synthetische casus
 * met grondwaarheid te maken; `ventedBoxTransform.test.ts` pint dat de twee het
 * op casus 2's eigen kast eens zijn.
 */
export function boxLoad(freqHz: number, box: VentedBox): BoxLoad {
  const w = 2 * Math.PI * freqHz;
  const Cab = (box.volumeL * 1e-3) / (RHO_AIR * C_AIR * C_AIR);
  const wb = 2 * Math.PI * box.tuningHz;
  const Map = 1 / (wb * wb * Cab);
  const Rap = Math.sqrt(Map / Cab) / box.leakageQ;
  const Zc = div(cplx(1), cplx(0, w * Cab));
  const Zp = cplx(Rap, w * Map);
  return { Zab: div(mul(Zc, Zp), add(Zc, Zp)), Zc, Zp };
}

/**
 * `U_p/U_d` — de volumesnelheid van de poort ten opzichte van die van de
 * conussen. GEEN drivergrootheid komt hierin voor; zie de kop.
 */
export function portToConeRatio(freqHz: number, box: VentedBox): Complex {
  const { Zc, Zp } = boxLoad(freqHz, box);
  return mul(cplx(-1), div(Zc, add(Zc, Zp)));
}

/**
 * De TOTALE uitgestraalde volumesnelheid ten opzichte van die van de conussen:
 * `1 + U_p/U_d`. Ruim boven de afstemming is dit 1 (de conus straalt alleen);
 * ruim eronder nadert het nul (de poort heft de conus op).
 */
export function totalToConeRatio(freqHz: number, box: VentedBox): Complex {
  return add(cplx(1), portToConeRatio(freqHz, box));
}

/** Wat er van de driver nodig is, en het is minder dan een T/S-set. */
export interface DriverFacts {
  /** Conusoppervlak per driver, m². Datasheet. */
  sdM2: number;
  /** Krachtfactor, Tm. Datasheet. */
  blTm: number;
  /** Hoeveel identieke drivers ÉÉN kast delen en gelijk worden aangedreven. */
  count: number;
}

/**
 * Een ongewijzigde poort in een ander volume. `M_ap` blijft, dus
 * `f_b ∝ 1/√V`; de lek blijft, dus `R_ap` blijft en `Q_l ∝ 1/√V` volgt.
 *
 * ALLEEN voor een ongewijzigde poort. Verandert lengte of diameter, dan stelt
 * de aanroeper de nieuwe afstemming zelf en gebruikt hij deze functie niet.
 */
export function samePortInVolume(from: VentedBox, toVolumeL: number): VentedBox {
  const k = Math.sqrt(from.volumeL / toVolumeL);
  return { volumeL: toVolumeL, tuningHz: from.tuningHz * k, leakageQ: from.leakageQ * k };
}

/**
 * De verhouding van de conussnelheden tussen twee kasten, bij één frequentie,
 * met `Z_mech` AFGELEZEN uit de gemeten impedantie.
 *
 * `zMeasuredOne` is de elektrische impedantie van ÉÉN driver. Meet je het
 * parallelle paar, dan is dat de meting maal `count`.
 */
export function coneVelocityRatio(
  freqHz: number,
  zMeasuredOne: Complex,
  zBlocked: Complex,
  from: VentedBox,
  to: VentedBox,
  driver: DriverFacts,
): Complex {
  const bl2 = cplx(driver.blTm * driver.blTm);
  const zMechFrom = div(bl2, sub(zMeasuredOne, zBlocked));
  const coupling = cplx(driver.count * driver.sdM2 * driver.sdM2);
  const delta = mul(coupling, sub(boxLoad(freqHz, to).Zab, boxLoad(freqHz, from).Zab));
  const zMechTo = add(zMechFrom, delta);
  return div(add(mul(zMechFrom, zBlocked), bl2), add(mul(zMechTo, zBlocked), bl2));
}

/** Wat de transformatie bij één frequentie met elk van de drie doet. */
export interface VolumeTransfer {
  /** Waarmee de gemeten conus-nabijveldsdruk vermenigvuldigd moet worden. */
  cone: Complex;
  /** Idem voor de gemeten poort-nabijveldsdruk. */
  port: Complex;
  /** Idem voor de gesommeerde uitstraling — de controle, niet een derde weg. */
  total: Complex;
}

/**
 * DE TRANSFORMATIE. De conus krijgt `v_B/v_A`; de poort krijgt datzelfde maal
 * de verhouding van de twee poortdelers, want de poort volgt de conus via de
 * kast. De som is de controle: hij hoort `v_B/v_A · (1+R_B)/(1+R_A)` te zijn en
 * dat is wat hier staat.
 *
 * P2: met `to` gelijk aan `from` is elk van de drie EXACT 1.
 */
export function volumeTransfer(
  freqHz: number,
  zMeasuredOne: Complex,
  zBlocked: Complex,
  from: VentedBox,
  to: VentedBox,
  driver: DriverFacts,
): VolumeTransfer {
  const v = coneVelocityRatio(freqHz, zMeasuredOne, zBlocked, from, to, driver);
  const rFrom = portToConeRatio(freqHz, from);
  const rTo = portToConeRatio(freqHz, to);
  const port = mul(v, div(rTo, rFrom));
  const total = mul(v, div(totalToConeRatio(freqHz, to), totalToConeRatio(freqHz, from)));
  return { cone: v, port, total };
}

/* ==================================================================== *
 * De twee fits waarop de kast zichzelf meet
 * ==================================================================== */

export interface PortConeFit {
  /** De afstemming die uit de poort/conus-verhouding volgt, Hz. */
  tuningHz: number;
  leakageQ: number;
  /** De reële schaal die de weging en het aantal conussen opvangt. */
  scale: number;
  /** Complex rms-residu over de fitband, dimensieloos. */
  residual: number;
  /** Hoeveel punten meededen. */
  points: number;
}

/**
 * `f_b` en `Q_l` uit de GEMETEN poort/conus-verhouding. De schaal is vrij en
 * reëel: zij vangt Keele's weging en het aantal conussen op, zodat de fit
 * uitsluitend op de VORM van de deler rust en niet op een niveaukalibratie.
 *
 * Ruim boven de afstemming gaat de verhouding naar nul en meet men ruis; de
 * aanroeper knipt de band en deze functie zegt hoeveel punten meededen.
 */
export function fitPortConeRatio(
  ratio: readonly { freqHz: number; value: Complex }[],
  search: { tuningHz: [number, number]; leakageQ: [number, number]; scale: [number, number] },
): PortConeFit | null {
  if (ratio.length < 8) return null;
  const cost = (fb: number, ql: number, k: number): number => {
    let s = 0;
    for (const r of ratio) {
      const m = mul(cplx(k), portToConeRatio(r.freqHz, { volumeL: 1, tuningHz: fb, leakageQ: ql }));
      s += (m.re - r.value.re) ** 2 + (m.im - r.value.im) ** 2;
    }
    return Math.sqrt(s / ratio.length);
  };
  /* Grof raster, dan coördinaatafdaling met halverende stap. Drie parameters op
   * een volledige complexe kromme is goed geconditioneerd; een multi-start is
   * hier niet nodig en de test pint dat de fit een gestelde kast terugvindt. */
  let best = { fb: search.tuningHz[0], ql: search.leakageQ[0], k: search.scale[0], c: Infinity };
  const span = (r: [number, number], n: number, i: number) => r[0] + ((r[1] - r[0]) * i) / (n - 1);
  for (let a = 0; a < 12; a++) {
    for (let b = 0; b < 10; b++) {
      for (let c = 0; c < 10; c++) {
        const fb = span(search.tuningHz, 12, a);
        const ql = span(search.leakageQ, 10, b);
        const k = span(search.scale, 10, c);
        const v = cost(fb, ql, k);
        if (v < best.c) best = { fb, ql, k, c: v };
      }
    }
  }
  let step = {
    fb: (search.tuningHz[1] - search.tuningHz[0]) / 12,
    ql: (search.leakageQ[1] - search.leakageQ[0]) / 10,
    k: (search.scale[1] - search.scale[0]) / 10,
  };
  for (let iter = 0; iter < 400; iter++) {
    let improved = false;
    for (const key of ['fb', 'ql', 'k'] as const) {
      for (const s of [step[key], -step[key]]) {
        const trial = { ...best, [key]: best[key] + s };
        if (trial[key] <= 0) continue;
        const v = cost(trial.fb, trial.ql, trial.k);
        if (v < best.c - 1e-15) {
          best = { ...trial, c: v };
          improved = true;
        }
      }
    }
    if (!improved) {
      let done = true;
      for (const key of ['fb', 'ql', 'k'] as const) {
        step[key] /= 2;
        if (step[key] > 1e-7) done = false;
      }
      if (done) break;
    }
  }
  return { tuningHz: best.fb, leakageQ: best.ql, scale: best.k, residual: best.c, points: ratio.length };
}

export interface BlockedFit {
  /** De coëfficiënt van de halfmachtsterm, Ω·s^n. */
  coefficient: number;
  /** De exponent. */
  exponent: number;
  /** rms-residu op de magnitude, dB. */
  residualDb: number;
}

/**
 * `Z_b = R_e + K·(jω)^n` uit de HF-STAART van de gemeten sweep, waar de
 * motionele term verwaarloosbaar is. Dezelfde vorm die `motionalFit.ts` als
 * lekterm draagt; hier op de andere kant van de band en op de magnitude, want
 * dat is wat een staart betrouwbaar oplevert.
 */
export function fitBlockedImpedance(
  tail: readonly { freqHz: number; magnitudeOhm: number }[],
  reOhm: number,
  search: { coefficient: [number, number]; exponent: [number, number] },
): BlockedFit | null {
  if (tail.length < 8) return null;
  const cost = (K: number, n: number): number => {
    let s = 0;
    for (const t of tail) {
      const w = 2 * Math.PI * t.freqHz;
      const zb = add(cplx(reOhm), blockedTerm(K, n, w));
      s += (20 * Math.log10(Math.hypot(zb.re, zb.im) / t.magnitudeOhm)) ** 2;
    }
    return Math.sqrt(s / tail.length);
  };
  let best = { K: search.coefficient[0], n: search.exponent[0], c: Infinity };
  for (let a = 0; a < 60; a++) {
    for (let b = 0; b < 40; b++) {
      const K = search.coefficient[0] + ((search.coefficient[1] - search.coefficient[0]) * a) / 59;
      const n = search.exponent[0] + ((search.exponent[1] - search.exponent[0]) * b) / 39;
      const v = cost(K, n);
      if (v < best.c) best = { K, n, c: v };
    }
  }
  let stepK = (search.coefficient[1] - search.coefficient[0]) / 60;
  let stepN = (search.exponent[1] - search.exponent[0]) / 40;
  for (let iter = 0; iter < 300; iter++) {
    let improved = false;
    for (const [dK, dN] of [[stepK, 0], [-stepK, 0], [0, stepN], [0, -stepN]] as [number, number][]) {
      const K = best.K + dK;
      const n = best.n + dN;
      if (K <= 0 || n <= 0) continue;
      const v = cost(K, n);
      if (v < best.c - 1e-12) {
        best = { K, n, c: v };
        improved = true;
      }
    }
    if (!improved) {
      stepK /= 2;
      stepN /= 2;
      if (stepK < 1e-9 && stepN < 1e-9) break;
    }
  }
  return { coefficient: best.K, exponent: best.n, residualDb: best.c };
}

/** `K·(jω)^n` — de halfmachtsterm van de geblokkeerde impedantie. */
export function blockedTerm(coefficient: number, exponent: number, omega: number): Complex {
  const m = coefficient * Math.pow(omega, exponent);
  const a = (exponent * Math.PI) / 2;
  return cplx(m * Math.cos(a), m * Math.sin(a));
}

/** `Z_b` bij één frequentie, uit een gefitte staart. */
export function blockedImpedance(freqHz: number, reOhm: number, fit: BlockedFit): Complex {
  return add(cplx(reOhm), blockedTerm(fit.coefficient, fit.exponent, 2 * Math.PI * freqHz));
}
