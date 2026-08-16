# Validatie — klopt de simulatie met de werkelijkheid?

Eén **Visaton FRS8**, losse componenten. De test: meet de driver kaal, bouw een netwerkje van
wat er ligt, teken datzelfde netwerk na in de Network-tab, en kijk of de voorspelde curve is
wat je vervolgens meet.

Dit test **de simulatie** (MNA-solver, parasieten-model, interactie met de gemeten driver-Z) —
niet de optimizer. Dat is de juiste volgorde: een optimizer die op een verkeerd model draait,
optimaliseert naar de verkeerde uitkomst. Klopt het model, dan is elk optimizer-resultaat
daarna geloofwaardig.

Wat hiermee ongetest blijft: alles wat tússen twee drivers speelt — inter-driver-timing, de
excess-fase-brug, integration-score, directivity-som. Daarvoor is een tweede driver nodig.

---

## ✅ Uitgevoerd: KOAN test-filter-sessie (15–16 aug 2026)

Twee échte drivers (KOAN-mid en -tweeter), componenten "wat er lag": mid 1,8 mH serie +
6,8 µF parallel; tweeter 8,2 µF serie + 0,33 mH — die spoel bleek **over de ingang** te
staan (vóór de cap), niet over de tweeter. Vijf sweeps, één mic, één klok: mid kaal, tweeter
kaal, mid+filter, tweeter+filter, beide samen. Bestanden staan als fixture in
`src/lib/parsers/fixtures/koan-testfilter/` (elk 8e punt), test `validation.koan.test.ts`.

| test | model vs meting (niveau uitgelijnd, 300 Hz–20 kHz) |
|---|---|
| mid + filter | **±0,25 dB avg · P95 0,6 · fase 2,4°** |
| tweeter + filter (zoals bedraad, Rg 1,2 Ω) | ±1,1 dB · fase 2,9° |
| beide samen | ±0,6 dB avg · fase 2,1°; interferentiedip op 984 Hz (gemeten 971), buiten het overlapgebied 0,05–0,65 dB, **in de dip ~2 dB te ondiep (open)** |

Wat het bewijst en wat niet:
- **Solver + gemeten Z**: klopt op een kwart dB zodra het schema is wat er gebouwd is.
- **Complexe som met gemeten fase**: de dip staat op de juiste frequentie — dat is het
  kernidee van de app (fase mét looptijdverschil) en het staat.
- **Code ≡ handberekening**: de app-pijplijn en een volledig onafhankelijke rekensom op het
  rauwe rooster (eigen parser, eigen complexe rekenkunde, geen dsp/solver) geven hetzelfde op
  0,1 dB, inclusief de dip — dat pint de test A voor altijd vast.
- **Open**: ~2 dB in de bodem van een cancellation. Geen codefout (zie hierboven) maar een
  meetopstelling-effect: met de 0,33 mH over de versterker zag die 1–2 Ω; "Rg = 1,2 Ω" is
  daar een benadering van een begrenzende versterker, en in een nul wordt elke takfout
  (1 dB niveau, 10° fase) uitvergroot. De losse tak-tests kunnen precies die twee dingen
  (relatieve timing, niveauverhouding tussen sweeps) niet controleren — de fase-vergelijking
  fit per meting de mic-afstand weg.

Drie lessen voor de volgende meetdag:
1. **Teken wat je bouwt, niet wat je bedoelt.** Spoel vóór/achter de cap, cap vóór/achter de
   spoel — beide zijn vandaag als "8 dB modelfout" binnengekomen en waren tekenfouten.
2. **Rg is je meetopstelling.** Versterker + kabels + klemmen; vul hem in bij G1 voor een
   testvergelijking, zet hem terug op ~0 voor het ontwerp.
3. **Meet de som twee keer: normaal én tweeter omgekeerd**, en zet de spoel niet over de
   ingang. De omgekeerde som is dip-vrij (10° = 0,1 dB) en beslist of het restant fysica of
   meting is.

---

## 0b. Model-vs-meting-overlay (in de app ingebouwd, aug 2026)

De vergelijkstap van dit protocol zit nu ín de app: **Import-tab →
"Verification measurement"**. Laad de gemeten FRD van de gebouwde build en:

- de SPL-chart tekent de meting over de gesimuleerde Combined (niveau
  automatisch uitgelijnd; de offset staat in de legend),
- de SPL-strip toont avg/P95/grootste afwijking mét frequentie,
- de fase-chart toont het fase-residu ná het wegfitten van de mic-afstand
  (de gefitte delay staat in de tooltip — sanity: ~343 mm per ms),
- een fase-offset rond 180° wordt gemeld als vermoedelijk omgekeerde
  aansluiting — niet stil gecorrigeerd.

Alles wordt beoordeeld over het zichtbare bereik, dus zoom = de band waar
je het model op afrekent. De meting is persistent (project + autosave).
## 0. Single-driver mode (in de app ingebouwd, jul 2026)

Eén geladen driver is genoeg: laad de **FRS8-FRD + ZMA** in het Woofer/mid-slot en de
simulatie draait op die ene tak. De **Combined**-curve is dan exact "FRS8 door jouw netwerk"
en het Impedance-paneel toont de ingangsimpedantie van datzelfde netwerk.

- **Network-tab → New from template** scaffoldt automatisch alleen de geladen driver
  (generator + driver, ongefilterd) — teken daar je gebouwde netwerk na.
- Alles wat twee drivers vergelijkt (relatieve fase, integration-score, timing-check,
  null-check-curve, tweeter adjustment) verbergt zichzelf; het fase-paneel toont de
  **totale fase van de solo-driver** — precies wat je tegen de meting legt.
- De optimizers werken ook solo, met een eigen engine: **Optimize — flatten driver**
  ontwerpt cut-only EQ/shelves en bouwt ze als echte breedbander-topologie (serie-LCR-traps,
  shelf-groepen, gated Zobel); **⚙ Optimize components** tuned componentwaardes op pure
  respons-vlakheid. Voor laag 3 van dit protocol (de negatieve controle) is dat precies
  de tegenstander-generator: laat de solo-optimizer een correctienetwerk ontwerpen en meet
  het naast je eigen handontwerp.

## 1. De kale meting

- **FRD op 0°, mét fase** — drie kolommen. Zonder fasekolom test je maar de helft, en de fase
  is precies waar simulaties fout gaan.
- **ZMA** aan de driverklemmen.
- Driver vastgeschroefd op een testbaffle of doosje; mic op een vaste plek.
- **Noteer nu**: mic-afstand, hoogte, gate-lengte, interface-gain, timingreferentie. Alles
  hierna is een verschilmeting.

## 2. Het netwerk kiezen en meten

**Meet elke component vóór inbouw**: L + DCR, C + ESR, R. Gebruik die waardes in de app, niet
de opdruk. Bij een 8 Ω driver is 0,5 Ω spoel-DCR al een halve dB niveauverschil — de helft van
alle "de sim klopt niet"-meldingen is een niet-ingevulde DCR.

**Kies waardes die een duidelijk effect geven in de geldige band** (200 Hz–15 kHz; onder de
gate-grens is een gated meting niet geldig, en met een 8 cm driver op een kleine baffle is de
onderkant sowieso geen testgebied). Een serie-spoel van ~0,68–1,0 mH op 8 Ω legt de knie rond
1,3–1,9 kHz: ruim binnen bereik en midden in het gladde deel van de FRS8.

**Bouw het in stappen** — dit is de enige aanbeveling die ik echt zou volgen. Op een wisselplank
(kroonsteentjes) kost elke extra stap vijf minuten, en het verschil is enorm: één netwerk dat
afwijkt vertelt je "er klopt iets niet", drie oplopende netwerken vertellen je *wat*.

| # | Netwerk | Wat je ermee isoleert |
|---|---|---|
| N1 | alleen serie-L | DCR-model, simpelste geval — wijkt dit al af, zoek niet verder in de solver |
| N2 | serie-L + shunt-C | reactieve interactie met de driver-Z (Fs-piek + inductieve flank) |
| N3 | + Zobel of LCR-notch | de gevoeligste topologie; hier bijt een fout in het Z-model het hardst |

## 3. Voorspellen — vóór je meet

Leg de voorspelling vast (screenshot of projectbestand) **voordat** de meting binnen is.
Anders wordt het geen test maar een verklaring achteraf; de verleiding om een 1 dB-afwijking
weg te redeneren is groot als je de meting al hebt gezien.

Randvoorwaarde die je makkelijk over het hoofd ziet: de generator staat op **Rg = 0,001 Ω**,
dus een ideale spanningsbron. Meet met een solid-state amp en korte, dikke kabels. Heb je een
lange dunne kabel of een amp met noemenswaardige uitgangsimpedantie, vul die weerstand dan in
als Rg — dan vergelijk je appels met appels.

## 4. De meting met netwerk

Zelfde mic, zelfde hoogte, zelfde gain, zelfde gate, zelfde timingreferentie. **Verander niets
aan de volumeknop** — alleen dan is het absolute niveau vergelijkbaar en betekent een
niveauverschil ook echt iets.

Meet per stap twee dingen:

1. **SPL + fase** op 0°.
2. **De impedantie van driver+netwerk.** Dit is gratis en het meest diagnostische wat je kunt
   doen: het is een volledig akoestiek-vrije controle op dezelfde componentwaardes en dezelfde
   topologie. Klopt de |Z|-curve met het Impedance-paneel, dan wéét je dat het netwerkmodel en
   je waardes goed zijn, en zit elke resterende SPL-afwijking in de akoestiek of de meting. Dat
   splitst je foutzoekgebied in tweeën nog voor je begint.

Extra scherpe variant op de SPL-vergelijking: deel de complexe meting mét netwerk door de kale
meting. Dat geeft `H_netwerk(f)` — de gemeten transferfunctie van het netwerk onder echte
driverbelasting, direct te leggen naast het Filter transfer-paneel, in amplitude én fase, zonder
dat de driver zelf nog in beeld is.

## 5. Wat "goed" is

| Grootheid | Criterium |
|---|---|
| SPL-vorm t.o.v. sim, 200 Hz–15 kHz | binnen **0,5 dB** (N1–N2), **1,0 dB** (N3) |
| absoluut niveau | binnen **0,3 dB** (bij identieke gain) |
| fase | binnen **10°** |
| systeem-\|Z\| | binnen **5%**, minima binnen **0,2 Ω** |
| resonanties (notch/Zobel) | frequentie binnen **3%** |
| meting vs **tolerantie-band ±5%** | binnen de envelop, dicht bij de RSS-lijn |

Die laatste valideert meteen `tolerance.ts`: met LCR-gemeten componenten hoort de meting ruim
binnen de worst-case-envelop te vallen. Ligt hij erbuiten, dan is de afwijking niet met
componenttolerantie te verklaren.

## 6. Diagnose als het niet klopt

| Symptoom | Waarschijnlijke oorzaak |
|---|---|
| Vorm klopt, niveau verschoven | gain of mic-afstand veranderd; anders Rg / kabel- en klemweerstand |
| Knie zit systematisch te hoog of te laag | componentwaarde wijkt af (meet hem), of verkeerde ZMA gekoppeld |
| Amplitude klopt, fase niet | timingreferentie verschoven tussen de metingen — opnieuw meten |
| Te weinig demping rond een resonantie | DCR/ESR niet of te laag ingevuld |
| Afwijking pas boven ~5 kHz | mic-positie/gate, of de driver-Z-meting loopt daar niet ver genoeg door |
| Afwijking alleen onder ~300 Hz | gate-grens — geen geldig testgebied |
| N1 klopt, N2/N3 niet | Z-interactie: de gemeten ZMA of de topologie in het schema |
