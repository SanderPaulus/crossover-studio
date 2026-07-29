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

## 0. Single-driver mode (in de app ingebouwd, jul 2026)

Eén geladen driver is genoeg: laad de **FRS8-FRD + ZMA** in het Woofer/mid-slot en de
simulatie draait op die ene tak. De **Combined**-curve is dan exact "FRS8 door jouw netwerk"
en het Impedance-paneel toont de ingangsimpedantie van datzelfde netwerk.

- **Network-tab → New from template** scaffoldt automatisch alleen de geladen driver
  (generator + driver, ongefilterd) — teken daar je gebouwde netwerk na.
- Alles wat twee drivers vergelijkt (relatieve fase, integration-score, timing-check,
  null-check-curve, tweeter adjustment) verbergt zichzelf; het fase-paneel toont de
  **totale fase van de solo-driver** — precies wat je tegen de meting legt.
- De crossover-optimizers (Optimize / wizard / component-tuner / passive build) zijn
  geblokkeerd met uitleg: hun vangnetten zijn kruising-verankerd en een kruising bestaat
  hier niet. Voor deze validatie heb je ze ook niet nodig.

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
