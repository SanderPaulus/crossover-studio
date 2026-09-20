# Vuistregels uit de literatuur, en wat onze engine ermee doet

**Opgesteld 20-09-2026 (H-4), naar aanleiding van de polariteitsarmen.**

## Wat dit document is — en vooral: wat het niet is

Dit is **referentiemateriaal**, geen autoriteit. De nota
(`docs/CrossoverStudio_OptimizerV2_strategie_v2.md`, Deel A) blijft de specificatie en bij twijfel
wint zij; het casusboek (`CLAUDE.md`) blijft de plaats waar metingen en besluiten staan. Wat hier
staat is: *dit zegt de literatuur, dit doet onze code vandaag, en hier lopen ze uit elkaar.*

Een verschil is hier **nooit vanzelf een defect**. Meer dan eens is een "afwijking van de vuistregel"
bij nameten juist de vuistregel gebleken die te grof was voor wat wij meten — V20 trok de
lobing-score in omdat geen enkele λ een weg met twee bronnen samenvat, en V44 verving het
±1-octaaffaservenster omdat het 911 punten meetelde die onder de meetgeldigheid van de bestanden
zelf lagen. Waar wij afwijken staat de reden erbij, en waar de reden ontbreekt staat dát erbij.

### De bronkwaliteit, vooraf en eerlijk

Het meeste dat online over kruisfilters te vinden is, zijn fora en rekenmachine-sites die elkaar
citeren. De stevigste bronnen hieronder zijn Rane Note 160 (Dennis Bohn) en Note 119, Kimmo
Saunisto's VituixCAD-handleiding, Troels Gravesen's eigen ontwerppagina's en Rod Elliott
(sound-au.com). **Dickasons regel kwam via forumcitaten en niet uit de Loudspeaker Design Cookbook
zelf** — dat boek is niet gelezen, en dat staat er liever dan dat het gesuggereerd wordt. Waar een
regel alleen uit forumconsensus komt, staat dat erbij.

De links staan onderaan.

---

## 1. Polariteit

### Wat de literatuur zegt

**De textbookregel.** Bij Linkwitz-Riley vragen LR2 en LR6 één omkering en LR4 en LR8 niet
(Rane Note 160). De reden is elementair: bij LR2 staan de twee helften op het kruispunt 180° uit
fase, bij LR4 360° — dus in fase. Oneven ordes staan 90° (1e) of 270° (3e) en krijgen conventioneel
geen omkering, omdat een omkering daar niets oplost.

**De praktijkregel, en die is belangrijker.** De gedeelde raad van de ontwerpers is: **simuleer en
meet BEIDE polariteiten en vergelijk**. De motivering die telkens terugkeert is dat de akoestische
centra van de drivers niet samenvallen, zodat de meetkundige vertraging bij de elektrische fase
optelt en het textbookantwoord niet meer hoeft te kloppen. Troels Gravesen levert ontwerpen waarin
de mid *moet* worden omgekeerd — bij hem is dat een instructie aan de bouwer, geen variant.

**De omkeer-nultest.** Een even-orde filter met goede fasetracking geeft een **diepe null** als je
één driver omkeert. Dat is de standaardcontrole: hoe dieper de null, hoe beter de twee takken in
fase liepen. Zonder de nodige omkering ziet men een dip van de orde van 30 dB op het kruispunt;
mét, blijft de afwijking binnen enkele dB.

### Wat onze engine doet

| Onderdeel | Waar | Gedrag |
| --- | --- | --- |
| De textbookregel | `activeSide.ts` → `textbookComplementInverted` | Alleen LR, `(orde/2) % 2 === 1`. Dus LR2 ja, LR4 nee, LR1/LR3 nee, BW/BS nooit. **Eén huis, drie lezers**: het complement van de magere hybride-vorm (`complementSettings`, H-2b), het DSP-doelblok (`dspTarget.ts`, H-1) en de polariteitsarmen (H-4). |
| De praktijkregel | `predesign/polarityArms.ts` (H-4) | Sinds H-4 is de niet-gekozen polariteit van élke passieve overname **een eigen kandidaat**: zelfde positie, eigen topologieklasse, volledig uitontworpen, gesynthetiseerd en getuned tegen zijn eigen gekantelde fasedoelen, en door dezelfde poorten geoordeeld. Een drieweg heeft twee overnames, dus vier polariteitsconfiguraties, en het veld draagt ze alle vier. |
| De nultest | `activeSide.ts` (H-1) | De polariteit van de **actieve zijde** in Hybrid mode wordt gekozen op de omgekeerde-polariteit-nulmarge, en het DSP-doelblok drukt beide af zodat de kastmeting hem kan bevestigen. |

**Wat H-4 verving.** Tot H-4 koos de ontwerpstap de polariteit zelf, in een enumeratie op **ideale
filters** — geen ladder, geen driverimpedantie, geen synthese, geen componenttune — en wat verloor
werd nooit gebouwd, nooit door een poort geoordeeld en stond in geen enkele shortlist. Gemeten vóór
de reparatie: op 5 van de 26 kandidaten van dit casusboek week die keuze al van textbook af, dus de
heuristiek was geen dode tak; en op de tweewegstap viel de keuze op de KALE afdaling, vóór EQ, snoei
en polish, terwijl de cluster erboven op een ándere maat rangschikt.

**Wat het bouwen opleverde** (acht ketenruns, `test-fixtures/casus1_h4_polariteit.json`):

- casus 1b op 1947,9 Hz — **alleen de gespiegelde arm levert**; de textbook-arm valt op M-C.
- casus 1b op 2186,5 Hz — **alleen de textbook-arm levert**; de gespiegelde valt op M-C op zijn
  eigen kruispunten. Twee kandidaten van één casus, 240 Hz uit elkaar, tegengesteld.
- casus 1h — beide leveren en delen de winst: rms 3,148 tegen 3,567 dB, M-K 4,2° tegen 3,6°.
- casus 1 — geen gespiegelde arm levert; alle zes vallen op M-D (1,81–10,04 dB opslingering tegen
  een budget van 1,4) of op de versterkervloer.

Dat laatste is het opmerken waard: op de drieweg sneuvelt de omgepoolde mid **niet op fase** maar op
een LF-budget. De fase-afweging wordt wél gehoord — de arm wordt volledig uitontworpen en op fase
beoordeeld — maar wat hem doodt is de reactantie die de tune in het wooferpad nodig heeft.

### Waar wij afwijken

**De verkenning kan de omgepoolde arm overslaan.** Op gestelde posities (U-5) en in het VOLLE veld
draaien beide armen onvoorwaardelijk; in de **verkenning op afgeleide posities** zaait de engine de
spiegel alleen waar de pre-design fasemarge binnen één eenheid faseafwijking (15°) ligt. Gemeten op
de driewegdemo: verkenning = 6 runs, **0 gespiegeld** — de omgepoolde mid wordt daar dus nooit
gesimuleerd. De literatuur kent zo'n poort niet; zij zegt onvoorwaardelijk "probeer beide".

> **OPEN BESLUIT.** Sander heeft op 20-09-2026 gesteld dat het bij een driewegsessie belangrijk is
> dat de omgepoolde mid altijd gesimuleerd wordt. Dat is met de huidige verkenningspoort niet
> gegarandeerd. De poort weghalen kost een verkenning ×4 (6 → 24 runs op de demo); de marge zou dan
> blijven staan als **gerapporteerde lezing** in plaats van als filter.

### Eén valkuil in het label

Het label noemt **welke wegen omgepoold zijn** — wat een bouwer soldeert — en niet welke arm
textbook is. Op een **LR2**-veld is daardoor `· mid ⌀` juist de textbook-arm, en de rij zonder
markering is een spiegel:

| label | LR2-veld | LR4-veld |
| --- | --- | --- |
| *(geen markering)* | spiegel (beide overnames omgedraaid) | **textbook** |
| `· mid ⌀` | **textbook** | spiegel (beide overnames omgedraaid) |
| `· high ⌀` | spiegel (M-T omgedraaid) | spiegel (M-T omgedraaid) |
| `· high ⌀ + mid ⌀` | spiegel (W-M omgedraaid) | spiegel (W-M omgedraaid) |

Welke arm welke is staat wél in de provenance-zin van de rij ("Textbook polarity: …" /
"Mirrored polarity on …"), alleen niet in het label zelf.

---

## 2. Waar een kruispunt mag liggen

### Wat de literatuur zegt

**De ondergrens tegen de resonantie.** De courante regel is **minstens 2× de f_s van de bovenste
driver, en 3–4× beter** (toegeschreven aan Dickason, via forumcitaten). De motivering die er
consequent bij staat is **excursie** en niet vermogen: een tweeter met f_s 1000 Hz en X_max 0,25 mm
overschrijdt zijn lineaire slag bij 1000 Hz vóór iets anders het begeeft, welke helling je ook
kiest.

**De conservatieve variant** is dezelfde regel in decibel: *"18 dB down at resonance"* — de
spanningskromme van het filter hoort op de resonantie 18 dB onder de doorlaatband te liggen.

**De bovengrens** is de conusbreakup (klassiek f_break/3 voor een scherpe piek, f_break/2 voor een
milde) en de bundeling van de onderste weg.

**Driverafstand.** Lobing begint boven ¼ λ; de praktijkregel is dat de hart-op-hart-afstand van twee
wegen die samen spelen **kleiner dan ongeveer ½ λ** blijft bij de hoogste frequentie waarop zij
allebei op niveau zijn. Losser geformuleerd komt men ook "minder dan één golflengte" tegen.

### Wat onze engine doet

| Regel | Waar | Waarde |
| --- | --- | --- |
| k·f_s-vloer | `constants.ts` → `XO_FS_FACTOR_BY_ORDER` | orde 1: 3,0 · orde 2: 2,0 · orde 3: 1,6 · **orde 4: 1,4** |
| Aandrijfvloer (A5d.3(ii) omgekeerd) | `predesign/xoWindow.ts`, regel `'drive'` | `f = f_s · 2^(|plafond| / (6 · orde))`, met het plafond uit M-C v2.0 — de **gemeten** excursiegrens van de driver |
| Gestelde vloer | regel `'drive-stated'` (A5e.3b) | Hetzelfde, op het door de ontwerper gestelde dB-getal |
| Aanbevolen minimum van het blad | regel `'stated-min'` (U-3g) | Verbatim als vloer, bij élke orde |
| Breakup-plafond | `BREAKUP_DIV_SEVERE` 3,0 / `BREAKUP_DIV_MILD` 2,0, geïnterpoleerd op severiteit | **ONGEKALIBREERD** en elke lezer moet dat markeren |
| Lobing | `metrics/lobing.ts` (`lobing-lambda/2.0`) | **Vier** λ-fracties — dichtstbij / amplitudegewogen zwaartepunt / verst, alle drie tússen de wegen, plus de grootste scheiding bínnen een weg |

**De strengste vloer bindt**, en `floorBy` zegt welke.

### Waar wij afwijken — en dit is de scherpste van dit document

**Onze k·f_s-conventie is materieel losser dan de 18-dB-regel.** Uitgedrukt in de eenheid waarin de
aandrijfvloeren rekenen is `XO_FS_FACTOR_BY_ORDER` een vrijwel constante verzwakking van
**9,51 / 12,00 / 12,21 / 11,65 dB** bij orde 1 t/m 4 — `6 · orde · log₂(k)`, hier nagerekend en bij
U-3e al zo gemeten. De industrieregel zegt 18 dB. Het getal dat casus 1 zélf stelt is **−20 dB**,
oftewel 18 + 2 dB marge voor f_s-drift.

Met andere woorden: waar een project niets stelt, kiest de engine stilzwijgend de **lossere** van
twee gepubliceerde conventies. U-3e heeft dat gemeten en bewust laten staan, met twee redenen:
`XO_FS_FACTOR_BY_ORDER` is een Deel-A-regelfactor die voor élke overname geldt — ook conus-naar-conus,
waar de afgeleide excursiegrens de juiste autoriteit is — en k·f_s bindt alleen wanneer de afgeleide
vloer lager ligt, dus verhogen zou juist bijten waar de meting zegt dat de driver veilig is. De
uitweg die U-3e voorstelde en U-3g bouwde is `stated-min`: de aanbevolen minimale kruisfrequentie van
het datablad als vensterinvoer. **Casus 1 stelt er geen.**

**Lobing wordt gerapporteerd en nooit geoordeeld.** V20 stelde vast dat voor een weg met meer dan
één bron geen enkele λ die weg samenvat, en trok de niet-monotone zonescore in. Er is dus geen
poort, geen budget en geen shortlist-criterium op een λ-fractie. De literatuurgetallen (¼ λ aanvang,
½ λ praktijk) staan hier genoteerd voor de dag dat iemand er wél een grens op wil.

---

## 3. Fase

### Wat de literatuur zegt

De courante richtlijn is een faseverschil **kleiner dan 90°** over het gebied waar beide takken
binnen **20 dB** van elkaar liggen, en strenger: **binnen 30°** rond het midden van het
overnamegebied. De fasetracking hoort zich minstens een octaaf boven en onder het kruispunt uit te
strekken.

### Wat onze engine doet

| Onderdeel | Waar | Waarde |
| --- | --- | --- |
| Het overlapvenster | `integration.ts` → `DEFAULT_OVERLAP_WINDOW_DB` | **20 dB** — precies het getal uit de richtlijn |
| De fasemaat M-K | `phaseAdmission.ts` + `metrics/phaseIntegration.ts` (`phase-integration/2.0`) | Gemiddelde \|Δφ\| over de **toegelaten** punten |
| De schaal van de objectieven | `bandMetrics.ts` → `PHASE_ERROR_UNIT_DEG` | **15°** — waar vijf zoekobjectieven hun fasefout door delen |
| Het stopdoel van de trapmethode | casus 1: `targets` | rimpel 2,5 dB, **fase 15°** |

**De toelating is waar wij van de richtlijn afwijken, en bewust.** V44 verving het ±1-octaafvenster
door drie gronden tegelijk: (a) binnen de meetgeldigheid van **beide** takken, (b) beide takken
boven de stille-geestvloer, (c) niveauverschil binnen het overlapvenster. De aanleiding was een
meting: over het hele casusboek telde de tuner 1047 punten mee die het rapport niet zag, waarvan
**911 onder de meetgeldigheidsvloer** die de meetbestanden zélf opgeven en 14 waar beide takken dood
waren en het faseverschil dus uitsluitend van de filters kwam. Het octaafvenster is daarmee geen
toelatingsgrond meer maar een controlekolom.

### Waar wij staan tegenover de richtlijn

**Wij halen haar ruim, en de tie-break keek naar een veel slechter getal dan wat geleverd wordt.**
Twee grootheden worden hier makkelijk verward en ze schelen een factor drie:

| grootheid | wat het is | casus 1, woofer→mid |
| --- | --- | --- |
| De **paarfase van de ontwerpstap** | op IDEALE filters, op de ongerefinede knie — het getal waarop de polariteits-tie-break viel | 45–80° |
| **M-K op het geleverde netwerk** | de echte ladder in de echte driverimpedantie, na de tune, op de toegelaten punten | **10,6 / 13,1 / 32,0°** (het levende corpus), HUIDIG 20,6° |

Over het hele casusboek: 173 geleverde woofer→mid-overnames, mediaan **15,2°**, spreiding 1,9–81,4°,
en **149 van de 173 binnen de 30°-richtlijn**. De referentiefilters van de ontwerper lezen 2,8 / 4,6 /
20,6°.

Dat verschil is zelf een bevinding over de oude polariteitskeuze: zij werd genomen op een getal dat
op ideale filters drie keer zo slecht is als wat de tune uiteindelijk levert — precies het bezwaar
dat `threeWayDesign.ts` bovenaan zijn eigen bestand maakt, *"een keuze mag niet gemaakt worden op een
grootheid die een latere stap nog verandert"*. Dat is waarom H-4 de arm bouwt in plaats van hem op
dat getal weg te gooien.

---

## 4. Het laag, de impedantie en de versterker

### Wat de literatuur zegt

Het **mechanisme** is canoniek: de DCR van de seriespoel en elke discrete serieweerstand tellen op
bij de Q_es van de driver, verlagen de demping die de versterker uitoefent en tillen het laag op.
Rod Elliott behandelt dat samen met de impedantiecompensatie die het tempert.

### Wat onze engine doet

| Maat | Waar | Casus 1 stelt |
| --- | --- | --- |
| M-D — de LF-bult, ontleed in **lift** (resistief) en **opslingering** (resonant) | `metrics/acoustic.ts` (`lf-bump/1.1`), V43 | budget **1,4 dB** op de opslingering |
| M-E — Q_es-vermenigvuldiging | `1 + R_s/R_e` op de opgeloste R_e | maximaal **2,4** |
| M-B/\|Z\| — de versterkervloer | `impedanceFloor.ts` → `meetsAmpFloor`, de ene vergelijking | **2,6 Ω** |
| Niveauwerk op de laagste weg | `levelWork.ts` (`level-work/1.2`) | **geen pad toegestaan** (V51) |

### Waar wij afwijken

**Er bestaat geen vuistregel met een getal voor het LF-opslingeringsbudget.** Het mechanisme is
overal beschreven, de grens nergens gestandaardiseerd. De 1,4 dB is dus een echt projectbesluit van
Sander (V43) en niet iets dat tegen een industrienorm te leggen valt. Dat is relevant zodra een arm
erop sneuvelt met 1,81 dB: dat gesprek gaat over dat budget, niet over de polariteit.

Hetzelfde geldt voor de Q_es-grens van 2,4 en voor de versterkervloer van 2,6 Ω — allebei gesteld,
allebei met hun datum en hun reden in `gestelde_eisen`, geen van beide een norm.

---

## 5. Wat onze engine doet waar de literatuur zwijgt

Vijf dingen waarvoor geen vuistregel bestaat, met de reden dat zij er zijn:

1. **De versterkervloer als zoekdoel** (V30) — een barrière in het objectief die de zoektocht uit het
   gebied houdt dat de poort zou weigeren, met gewicht `AMP_FLOOR_BARRIER_WEIGHT` = 1200. De
   literatuur kent de vloer als eis, niet als term.
2. **De zoekmaat zonder gladding** (`SEARCH_SMOOTHING_OCTAVES` = 0, V38-fix) — gladden vóór de
   sommatie ontkoppelt magnitude en fase, en trok op onze set de stille geest van buiten de band
   over de bandrand: de amplitudeterm blies van 1,85 naar 10,22 dB.
3. **Bouwbaarheid als poort** (V50/V51) — M-A/part en M-L: het vermogen in elke discrete weerstand
   bij een gesteld **thermisch ontwerpvermogen** van 10 W, en de piekstroom door elke spoel.
4. **Het rimpel-stopdoel op een eigen band** (E-5b) — de trapmethode stopt escaleren op een band die
   een halve octaaf onder de laagste overname begint, niet op de hele geoordeelde band.
5. **De polariteitsarmen zelf** (H-4) — de literatuur zegt "probeer beide"; wat zij niet zegt is dat
   beide dan ook volledig uitontworpen, getuned en door dezelfde poorten geoordeeld horen te worden,
   naast elkaar in één tabel.

---

## Wat hiervan een besluit wacht

1. **De verkenningspoort op de polariteitsarmen** — zie §1. Sanders regel is "op een drieweg altijd";
   de poort garandeert dat niet.
2. **`stated-min` voor casus 1** — de aanbevolen minimale kruisfrequentie van de BlieSMa (2200 Hz bij
   2e orde) is bij U-4 **geregistreerd en niet gevoed**, omdat hij de M-T-vloer van 1646,9 naar
   2200 Hz zou tillen en dus een regeneratie vraagt.
3. **Het LF-budget van 1,4 dB** — of een omgepoolde mid die er 0,41 dB overheen gaat weggegooid hoort
   te worden, is een vraag over dat getal.

---

## Bronnen

- [Linkwitz-Riley Crossovers: A Primer — Rane Note 160](https://www.ranecommercial.com/legacy/note160.html)
- [Linkwitz-Riley Active Crossovers — Rane Note 119 (PDF)](https://schematicsforfree.com/files/Audio/Circuits/Equalizers,%20Filters,%20Loudness%20&%20Tone%20Controls/Filters/Filters%20-%20Analog/Other/Linkwitz-Riley%20Active%20Crossovers.pdf)
- [VituixCAD help 2.0 — Kimmo Saunisto](https://kimmosaunisto.net/Software/VituixCAD/VituixCAD_help_20.html)
- [Measurements with REW for crossover simulation — Kimmo Saunisto (PDF)](https://kimmosaunisto.net/Software/VituixCAD/VituixCAD_Measurement_REW.pdf)
- [Troels Gravesen — Inverted Polarity](http://www.troelsgravesen.dk/Inverted-Polarity.htm) — *certificaat verlopen op 20-09-2026; de pagina zelf kon niet opgehaald worden, de inhoud komt uit citaten elders*
- [Reverse mid polarity in 3 way — diyAudio](https://www.diyaudio.com/community/threads/reverse-mid-polarity-in-3-way.372732/)
- [3rd Order Crossover Reverse Null — diyAudio](https://www.diyaudio.com/community/threads/3rd-order-crossover-reverse-null.366805/)
- [The importance of phase tracking — diyAudio](https://www.diyaudio.com/community/threads/the-importance-of-phase-tracking.211883/)
- [Rule of Thumb Tweeter Crossover — Parts Express Tech Talk](https://techtalk.parts-express.com/forum/tech-talk-forum/10982-rule-of-thumb-tweeter-crossover)
- [Driver bandwidth and determining crossover frequency — HTGuide](https://htguide.com/forum/archive/index.php/t-25250.html)
- [Impedance Compensation For Passive Crossovers — Rod Elliott, sound-au.com](https://sound-au.com/articles/z-compensation.htm)
- [Speaker lobing calculator — Audio Judgement](https://audiojudgement.com/speaker-lobing-polar-response/)
- [MTM Driver Spacing — Parts Express Tech Talk](https://techtalk.parts-express.com/forum/tech-talk-forum/47982-mtm-driver-spacing)
- [Time Alignment Part Three — Audiofrog](https://www.audiofrog.com/time-alignment-part-three-delays-and-crossovers-for-tweeters-and-mids/)
