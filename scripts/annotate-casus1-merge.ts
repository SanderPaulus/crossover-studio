/**
 * M-1 - HET MERGE-/GELDIGHEIDSBLOK OP EEN GEMERGED NF/FF-RESPONSBESTAND.
 *
 * `npx vite-node scripts/annotate-casus1-merge.ts <bron.frd> <doel.frd> <woofer_up|woofer_down>`
 *
 * WAAROM EEN BLOK EN GEEN PARSER (de UI-1-les: proza is geen header). Sanders
 * gemergede wooferbestanden dragen hun herkomst als proza met asterisken -
 * "splice: gain -7.92 dB, delay 0.5433 ms (fit 500-800 ...)" - en de
 * engine-parser (`parseArtaHeader`) leest VELDNAMEN in de vorm `Naam = waarde`.
 * Een parser die proza leest zou betekenen dat een willekeurige
 * commentaarregel een geldigheidsvloer kan zetten, en die vloer is A5b.1(i):
 * hard, automatisch, bindend. Dus krijgt het bestand een gestructureerd blok
 * dat de parser wél leest, met dezelfde veldnaamvorm als een ARTA-header. De
 * proza-regels van Sander blijven erboven staan, woordelijk: zij zijn zijn
 * eigen herkomstnotitie en het blok is de machineleesbare vorm ervan.
 *
 * DE DATA ERONDER IS BYTE-IDENTIEK. Dit script kopieert de gegevensregels
 * letterlijk (geen herparse, geen herafronding) en telt ze na; het VERANDERT
 * geen enkel getal. Wat het toevoegt staat tussen de proza en de kolomkop.
 *
 * WAT HET BLOK ZEGT, per veld:
 *   Merge              = NF/FF - de markering waarop de geldigheidsregel
 *                        (`validity.ts`) een ánder pad neemt dan bij een gepoort
 *                        ver veld: de vloer komt uit het blok, de adviserende
 *                        FF/NF-detector onthoudt zich (het bestand IS de merge).
 *   Valid from / to    = de geldigheid die de merge draagt. Voor de woofers
 *                        20,5 Hz (de poort is meegesommeerd - zonder poort was
 *                        het ~80 Hz) tot het einde van de sweep: boven de
 *                        splice is het bestand het gepoorte ver veld en dat is
 *                        geldig tot 20 kHz. Sanders "geldigheidsplafond 550 Hz"
 *                        is het KRUISPLAFOND van de woofer (eerste breakup / 3)
 *                        en geen meetgeldigheid; de engine leidt dat plafond
 *                        zelf af uit de breakup-scan en zou het NIET meer kunnen
 *                        als het bestand op 550 Hz zou ophouden geldig te zijn.
 *                        Het staat daarom als `Merge usable ceiling` in het blok:
 *                        documentatie, geen grens.
 *   Merge FF window    = het ARTA-venster van de ver-veldhelft, gelezen uit de
 *                        header van het FF-bronbestand: fijnstructuur boven de
 *                        splice is vanaf 2/T te vertrouwen. NIET als
 *                        `Reference time`/`Right window` geschreven, want dan
 *                        zou de header-vloer van de FF-helft (1/T = 397 Hz)
 *                        over de hele merge gelden.
 *   Merge status       = PLACEHOLDER tot groundplane/hermeting: de bestanden
 *                        dragen een inspeel-PREDICTIE, geen meting. Elke
 *                        klasse-A-referentie op deze set draagt dit woord.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArtaHeader, parseLooseNumber } from '../src/lib/engine2/ingest/manifest.ts';
import { parseTabular } from '../src/lib/parsers/tabular.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const CASUS1 = join(HERE, '..', 'test-fixtures', 'casus1');

const [source, target, which] = process.argv.slice(2);
if (!source || !target || (which !== 'woofer_up' && which !== 'woofer_down')) {
  throw new Error(
    'usage: annotate-casus1-merge.ts <bron.frd> <doel.frd> <woofer_up|woofer_down>',
  );
}

/** De bronbestanden van de merge, per woofer - dezelfde namen als het manifest. */
const SOURCES: Record<'woofer_up' | 'woofer_down', { nf: string; ff: string; label: string }> = {
  woofer_up: { nf: 'woofer_up_near.txt', ff: 'woofer_up_hor_0.txt', label: 'woofer BOVEN (W1)' },
  woofer_down: { nf: 'woofer_down_near.txt', ff: 'woofer_down_hor_0.txt', label: 'woofer ONDER (W2)' },
};
const src = SOURCES[which];

/* ---- de FF-header van de bronmeting: het venster van de ver-veldhelft ---- */
const ffText = readFileSync(join(CASUS1, src.ff), 'latin1');
const ffHeader = parseArtaHeader(parseTabular(ffText).comments);
if (ffHeader.referenceTimeMs === undefined || ffHeader.rightWindowMs === undefined) {
  throw new Error(`${src.ff} carries no ARTA window fields - the FF half of the merge has no gate to record`);
}
const taper = ffHeader.rightTaper ? `, ${ffHeader.rightTaper.kind} ${ffHeader.rightTaper.alpha ?? ''}`.trimEnd() : '';

/* ---- het bronbestand: proza, kolomkop, data - letterlijk ---------------- */
const lines = readFileSync(source, 'latin1').split(/\r?\n/);
const prose: string[] = [];
let columnHeader: string | null = null;
const data: string[] = [];
for (const line of lines) {
  const t = line.trim();
  if (t.length === 0) continue;
  if (t.startsWith('*')) {
    if (columnHeader !== null) throw new Error('a comment line after the column header - not a plain FRD');
    prose.push(line);
    continue;
  }
  if (/^Freq/i.test(t)) {
    columnHeader = line;
    continue;
  }
  const fields = t.split(/\s+/).map(Number);
  if (fields.length < 3 || !fields.every(Number.isFinite)) throw new Error(`not a data row: "${line}"`);
  data.push(line);
}
if (columnHeader === null) throw new Error('no column header line found');
if (data.length === 0) throw new Error('no data rows found');

/* ---- Sanders eigen getallen, uit zijn proza gelezen en niet overgetypt --- */
const proseText = prose.join('\n');
const splice = proseText.match(/splice:\s*gain\s*(-?[\d.]+)\s*dB,\s*delay\s*(-?[\d.]+)\s*ms/i);
if (!splice) throw new Error('the source header names no "splice: gain … dB, delay … ms" line');
const spliceGainDb = Number(splice[1]);
const spliceDelayMs = Number(splice[2]);
const port = proseText.match(/poort\s*\(g=([\d.]+)/i);
const portG = port ? Number(port[1]) : null;
const step = proseText.match(/shelf\s*([\d.]+)\s*dB\s*@\s*([\d.]+)\s*Hz/i);
if (!step) throw new Error('the source header names no "shelf … dB @ … Hz" step model');
const stepDepthDb = Number(step[1]);
const stepHz = Number(step[2]);
const cms = proseText.match(/Cms\s*\+?([\d.]+)%/i);
const ceiling = proseText.match(/geldigheidsplafond\s*([\d.]+)\s*Hz/i);
const usableCeilingHz = ceiling ? Number(ceiling[1]) : null;
const firstHz = parseLooseNumber(data[0]);
const lastHz = parseLooseNumber(data[data.length - 1]);
if (firstHz === undefined || lastHz === undefined) throw new Error('cannot read the first/last frequency');

/* ---- het blok ------------------------------------------------------------ */
const block = [
  `* Merge = NF/FF`,
  `* Valid from = ${firstHz.toFixed(1)} Hz`,
  `* Valid to = ${Math.round(lastHz)} Hz`,
  `* Merge NF source = ${src.nf}`,
  `* Merge FF source = ${src.ff}`,
  `* Merge FF window = reference ${ffHeader.referenceTimeMs} ms, right ${ffHeader.rightWindowMs} ms${taper}`,
  `* Merge splice band = 500-800 Hz`,
  `* Merge splice fit = gain ${spliceGainDb} dB, delay ${spliceDelayMs} ms`,
  `* Merge step model = shelf ${stepDepthDb} dB @ ${stepHz} Hz, first order, applied to the near-field half; diffraction cross-check <= 0.6 dB / <= 5 deg in 250-500 Hz`,
  `* Merge port model = 0.5 x port${portG !== null ? `, g ${portG}` : ''}, 50/50 over both woofers; port summed, hence valid from ${firstHz.toFixed(1)} Hz (without the port ~80 Hz)`,
  `* Merge usable ceiling = ${usableCeilingHz ?? '?'} Hz (first woofer breakup / 3 - a crossover ceiling the engine derives itself from the breakup scan, NOT a measurement-validity limit)`,
  `* Merge prediction = break-in, mild${cms ? ` (Cms +${cms[1]} %)` : ''}: delta <= 0.07 dB / 1.1 deg at 20 Hz, 0 above 150 Hz - MODEL, no measurement`,
  `* Merge floor reason = the near field carries the woofer down to the start of its sweep and the port is summed in; the far-field gate (1/T = ${(1000 / (ffHeader.rightWindowMs - ffHeader.referenceTimeMs)).toFixed(1)} Hz) applies only above the splice`,
  `* Merge status = PLACEHOLDER tot groundplane / hermeting na inspelen`,
];

const out = [...prose, ...block, columnHeader, ...data].join('\n') + '\n';
writeFileSync(target, out, 'latin1');

/* ---- nacontrole: de data is letterlijk overgenomen ---------------------- */
const back = readFileSync(target, 'latin1').split(/\r?\n/).filter((l) => l.trim().length > 0 && !l.trim().startsWith('*') && !/^Freq/i.test(l.trim()));
if (back.length !== data.length || back.some((l, i) => l !== data[i])) {
  throw new Error('the data rows did not survive verbatim');
}
const parsed = parseArtaHeader(parseTabular(out).comments);
if (!parsed.merge || parsed.statedValidity?.fromHz === undefined) {
  throw new Error('the engine parser does not read the block back - the annotation is not machine-readable');
}
console.log(
  `${basename(target)}: ${src.label}, ${data.length} data rows verbatim (${firstHz}–${lastHz} Hz), ` +
    `splice gain ${spliceGainDb} dB / delay ${spliceDelayMs} ms, step ${stepDepthDb} dB @ ${stepHz} Hz, ` +
    `Valid from ${parsed.statedValidity.fromHz} Hz, FF window ${parsed.merge.ffWindow?.effectiveWindowMs?.toFixed(3)} ms` +
    (existsSync(source) ? '' : ''),
);
