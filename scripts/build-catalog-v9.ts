/**
 * BUILD THE DEFAULT CATALOGUE v9 = v8 + the datasheet TOLERANCE and RATED (DC)
 * VOLTAGE per series (A5e.3, 07-11-2026). Seconds; writes
 * `src/lib/parsers/fixtures/catalog-v9.json`. Nothing else in v8 changes, and
 * `catalogV9.test.ts` holds that.
 *
 * EVERY FIGURE BELOW WAS READ ON A PAGE — the manufacturer's datasheet where one
 * was reachable, a distributor listing otherwise — and carries its URL. Where a
 * figure is not printed, or the sheet's range does not cover a value, the field
 * stays ABSENT (A3h: a plausible guess is worse than a blank). Where sources
 * disagree the SAFER figure is taken (the lower voltage, the wider tolerance),
 * and the note says so.
 *
 *   npx vite-node scripts/build-catalog-v9.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FIX = join(process.cwd(), 'src', 'lib', 'parsers', 'fixtures');

interface Raw {
  sku: string;
  brand: string;
  series: string;
  kind: 'L' | 'C' | 'R';
  value: number;
  [k: string]: unknown;
}

/** µF, for the value breakdowns the sheets print. */
const uf = (c: Raw) => Number((c.value * 1e6).toPrecision(3));

/** Per series: the tolerance (± %) and the rated DC voltage for one part, or
 *  undefined where the source does not cover it. */
const RULES: Record<string, { tol?: number; volt?: (c: Raw) => number | undefined; source: string }> = {
  'Cross-Cap': {
    tol: 5,
    volt: () => 400,
    source:
      'Jantzen Cross-Cap datasheet ("Voltage rating: 400V DC", "Tolerance on capacitance: 5%"), ' +
      'https://www.hificollective.co.uk/sites/default/files/cross-cap.pdf',
  },
  'Superior Z-Cap': {
    tol: 2,
    // 2020 sheet: 1200 VDC 0.1–0.39 µF, 800 VDC 0.47–22 µF; 33 µF is outside the printed range.
    volt: (c) => (uf(c) <= 0.39 ? 1200 : uf(c) <= 22 ? 800 : undefined),
    source:
      'Jantzen Superior Z-Cap datasheet 2020 ("1200V DC from 0.1μF to 0.39μF", "800VDC from 0.47μF to 22μF", ' +
      '"±2%"), https://www.costruireaudio.com/PDF/JANTZEN/Superior-Z-Cap-Data.pdf; 33 µF not covered — no voltage',
  },
  'Alumen Z-Cap': {
    tol: 3,
    // Sheet: 100 VDC from 1.0 µF to 10 µF; the 0.47–0.82 µF values are not covered.
    volt: (c) => (uf(c) >= 1 && uf(c) <= 10 ? 100 : undefined),
    source:
      'Jantzen Alumen Z-Cap datasheet ("100V DC from 1.0 μF to 10 μF", "±3%"), ' +
      'https://www.costruireaudio.com/PDF/JANTZEN/Alumen-Z-Cap-Data.pdf; below 1 µF not covered — no voltage',
  },
  'Electrolytic Bipolar': {
    tol: 10,
    volt: () => 100,
    source:
      'Jantzen bipolar electrolytic 001-60xx ("10% | 100 V"), https://www.soundimports.eu/nl/jantzen-audio-001-6005.html ' +
      '(distributor; the current eleCap line is ±5 % / 100 VDC — the wider ±10 % is taken)',
  },
  'Audyn Cap QS': {
    tol: 5,
    // QS4 is 400 VDC, QS6 630 VDC, and the catalogue SKUs do not say which line: no voltage.
    source:
      'Intertechnik Audyn Cap QS ("C-Tol.% 5"), https://www.intertechnik.de/shop/kondensatoren/audyn-cap-qs4/; ' +
      'voltage left blank — QS4 (400 VDC) or QS6 (630 VDC) is not stated per SKU',
  },
  'MCap Supreme': {
    tol: 2,
    // Mundorf site today: 600 VDC 0.47–10 µF; the 2006 sheet: 800 VDC from 0.68 µF up to 22 µF. The lower where both speak.
    volt: (c) => (uf(c) <= 10 ? 600 : uf(c) <= 22 ? 800 : undefined),
    source:
      'Mundorf MCap Supreme Alu ("600 V DC / 410 V AC" 0.47–10 µF), https://www.mundorf.com/en/variants/mcap-supreme-alu; ' +
      'above 10 µF and the ±2 %: Mundorf 2006 sheet ("[µF] ±2% VDC", 800 VDC), ' +
      'https://www.hificollective.co.uk/sites/default/files/2021-07/mundorf-mcap-supreme-datasheet.pdf — the lower voltage where both speak',
  },
  MOX: {
    tol: 5,
    source: 'Jantzen MOX datasheet ("10 Watt - 5%"), https://www.hificollective.co.uk/sites/default/files/jantzen-mox-datasheet_0.pdf',
  },
  Superes: {
    tol: 1,
    source: 'Jantzen Superes datasheet ("10 Watt - 1%"), https://www.hificollective.co.uk/sites/default/files/superes-resistors-2013_0.pdf',
  },
  'MResist Supreme': {
    tol: 2,
    source:
      'Mundorf MResist Supreme datasheet ("Ohm [Ω] ±2%"), ' +
      'https://hificollective.co.uk/sites/default/files/2021-07/mundorf-mresist-supreme-datasheet.pdf; voltage printed as 625 V AC only — no DC figure',
  },
  'CAST Resistor': {
    tol: 10,
    source:
      'Duelund CAST, distributors disagree (HiFi Collective "5% tolerance", Partsconnexion "+/- 10%") — the wider ±10 % is taken',
  },
};

const v8 = JSON.parse(readFileSync(join(FIX, 'gemini-catalog-v8.json'), 'utf-8')) as {
  note: string;
  components: Raw[];
};
let rated = 0;
let toleranced = 0;
const components = v8.components.map((c) => {
  const r = RULES[c.series];
  if (!r) return c;
  const volt = c.kind === 'C' ? r.volt?.(c) : undefined;
  if (volt !== undefined) rated++;
  if (r.tol !== undefined) toleranced++;
  return {
    ...c,
    ...(r.tol !== undefined ? { tolerance_pct: r.tol } : {}),
    ...(volt !== undefined ? { voltage_v: volt } : {}),
  };
});

const sources = Object.entries(RULES)
  .map(([s, r]) => `${s}: ${r.source}`)
  .join(' | ');
const out = {
  format: 'acoustic-design-studio-catalog',
  version: 9,
  savedAt: '2026-11-07T00:00:00.000Z',
  note:
    v8.note +
    ' || v9 (07-11-2026): v8 plus tolerance_pct (± %) and voltage_v (rated DC voltage) per series, read off the ' +
    'datasheets below; absent where a sheet prints none or does not cover the value; the safer figure where sources ' +
    'disagree. Sources — ' +
    sources,
  components,
};
writeFileSync(join(FIX, 'catalog-v9.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`catalog-v9.json: ${components.length} SKUs, ${toleranced} with a tolerance, ${rated} with a rated voltage`);
