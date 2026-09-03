# Strategie — Optimizer Engine v2 voor SD Acoustics Crossover Studio

*Herzien 25-08-2026. Opbouw: **Deel A** is de algemene specificatie en bevat uitsluitend formules, afleidingsregels en parameters — geen enkel getal dat uit een specifiek project afkomstig is. **Deel B** is het casusboek: projectdata die de specificatie valideert en de regressieset vormt. Alles in Deel A moet werken voor elke driverconfiguratie, elk aantal wegen en elke meetset.*

---

# DEEL A — Algemene specificatie

## A1. Aanleiding

De huidige optimizer stuurt op SPL, fase en min|Z|. In praktijkgebruik (casus 1, Deel B) bleken drie klassen van ontwerpfouten daar volledig buiten te vallen: vermogensverlies in filterweerstanden, fasedoelen die gehaald worden via ondergedempte resonanties die elders schade aanrichten, en kruispunten op akoestisch onhoudbare plekken. De gemene deler: de kostenfunctie kende de fysica buiten het elektrische domein niet. Vakvuistregels coderen die fysica, maar verliesgevend. De v2-engine neemt de onderliggende grootheden op en gebruikt vuistregels uitsluitend als validatie.

## A2. Kernprincipes

**P1 — Metriek boven proxy.** Een vuistregel wordt nooit direct een grens. Eerst wordt de fysische grootheid geïdentificeerd, die wordt als berekenbare metriek geïmplementeerd, en de vuistregel wordt de regressietest van de metriek binnen zijn geldigheidsgebied.

**P2 — Hard en zacht gescheiden in de architectuur.** Harde eisen zijn haalbaarheidspoorten vóór de zachte kostenfunctie, geen straftermen ernaast. Een kwadratische straf naast fasetermen kan stilletjes overschreden worden zodra een andere winst groter is.

**P3 — Onhaalbare doelen krijgen geen drempel.** Zachte doelen worden drempelloos geminimaliseerd met gewicht; de gebruiker ziet de bereikte waarde en de afruil. Drempels op onhaalbare doelen creëren straf-plateaus waarin de optimizer niet meer kan onderscheiden.

**P4 — Alles projectinstelling, standaard uit, zichtbaar.** Metrieken die invoer vereisen staan uit zolang die ontbreekt, en de UI toont welke randvoorwaarden actief zijn. Geen enkele grens of gewicht krijgt een ingebakken standaard die stilletjes meedoet.

> **Amendement (F2, 26-08-2026).** P4 geldt niet voor reproduceerbaarheids-instellingen — daar is een gerapporteerde standaard veiliger dan afwezigheid. Concreet: de run-seed (A5e.4). Een grens of gewicht dat stilletjes meedoet vervalst een *oordeel*; een ontbrekende seed vervalst niets maar maakt het resultaat onherhaalbaar, en dat is de ergere fout. De uitzondering geldt uitsluitend voor instellingen die aan geen enkel oordeel deelnemen, en de gebruikte waarde wordt altijd gerapporteerd. Een budget is géén zo'n instelling: dat begrenst inspanning en volgt gewoon P4.

> **Amendement (V47, 31-08-2026; opgeschreven bij de nazorg van 01-09-2026) bij P2 en P4 — een RELATIEVE bewaking is geen eis, en een BANDBEGRENSDE bewaking bewaakt alleen haar eigen band.** Twee eigenschappen van een bescherming die apart onschuldig lijken en samen een driver onbewaakt laten.
>
> *(a) Wat aan het zaad hangt, bewaakt het toeval van het zaad.* Een bescherming die het geleverde netwerk vergelijkt met het ZAAD waaruit het gegroeid is — "word niet slechter dan waar je vandaan kwam" — doet een uitspraak over de zoekstap en niet over de luidspreker. Wat zij toelaat beweegt mee met wat dat zaad toevallig droeg: tegen een goed zaad veroordeelt zij ontwerpen die aan elke gestelde eis voldoen, tegen een slecht zaad laat zij ontwerpen door die er geen enkele halen. Zij mag dus naast een gestelde eis staan en nooit in plaats daarvan. Staat zij er als enige, dan staat er in werkelijkheid geen bewaking op de driver — en dat is precies de toestand die P4 wil vermijden: een afwezige grens die zich als een aanwezige voordoet, ditmaal niet door een ingebakken standaard maar door een maat die de vraag niet stelt.
>
> *(b) Wat over een band integreert, zegt niets buiten die band.* Een bandbegrensde bewaking raakt een driver-eigen frequentie — een resonantie, een breakup — uitsluitend wanneer haar band die frequentie bevat, en of dat zo is volgt uit de AFLEIDING van de band en nooit uit haar naam. Voor de volle-band-veiligheidsregel van de huidige tuner is die afleiding: het beschermingstekort geïntegreerd onder `xoF/3`. Zij bereikt de eigen resonantie van de bovenste weg van een paar dus alleen wanneer het kruispunt boven `3·f_s` van die weg ligt; eronder leest zij daar per constructie nul, ook wanneer de aandrijving op die resonantie tientallen dB te hoog is. Een maat die naar een driver vernoemd is, is daarmee nog geen maat die die driver meet — alleen de band is dat, en zij hoort opgeschreven te staan waar de regel staat (A3j-bijlage, rij 31).
>
> Beide helften zijn gemeten en niet beredeneerd; het casusbewijs staat in Deel B, V47, met de tegenproef erbij (een netwerk waarvan de aandrijving op de resonantie ruim dertig dB verslechtert terwijl de relatieve maat de hele weg exact nul blijft, omdat haar band met het kruispunt meebeweegt).

**P5 — Parasieten zijn afhankelijke variabelen.** DCR/ESR gekoppeld aan componentwaarde via catalogusmodellen tijdens continue optimalisatie; exacte samenstellingswaarden bij snapping. DCR kan bovendien bewuste ontwerpvariabele zijn (bijv. baffle-step-bijdrage) en mag dus niet blind geminimaliseerd worden.

**P6 — Geen projectgetal in de specificatie.** Elke band, grens of referentiefrequentie in een metriek wordt **afgeleid uit projectdata** (impedantiepieken, kruispunten, gate-tijden, drivergeometrie) of is een **expliciete projectinstelling**. Hardgecodeerde frequenties of waardes die uit één ontwerp stammen zijn een specificatiefout.

## A3. Architectuur

```
 projectdata ──► METRIEKBIBLIOTHEEK (pure functies met gedeclareerde
 (netlist, Z/SPL,  databehoefte, afgeleide banden, actief/uit-status)
 geometrie,             │
 catalogus)   ┌─────────┴─────────┐
              ▼                   ▼
       POORTEN (hard)      ZACHTE DOELEN (drempelloos, gewogen)
              │ faalt → verwerp   │
              ▼                   ▼
       OPTIMALISATIEKERN: globaal (DE) → polish (grenzen afgedwongen),
       parasieten gekoppeld, kruispunt-vensters als instelling
              ▼
       ROBUUSTHEID & SNAPPING: worst-case over parasiet-onzekerheidsband,
       discrete catalogus-descent met exacte parasieten, Monte-Carlo eindpoort
```

### A3j. Keuze, polish en het grijze gebied ertussen

*Toegevoegd 27-08-2026 (F4c). Algemeen geformuleerd: de indeling geldt voor elke instelling die
de tuner aanneemt, niet voor een vastgelegde lijst sleutels. De concrete indeling van de
huidige tuner is een BIJLAGE bij het casusboek, geen onderdeel van deze specificatie — een
lijst namen in Deel A zou een implementatiedetail tot norm verheffen.*

Een optimalisatie krijgt twee soorten instellingen mee, en het onderscheid is niet cosmetisch:
het bepaalt wie ze mag zetten zodra er twee engines zijn.

**Keuze** — de instelling bepaalt **WAT** er gezocht wordt. Waar wordt overgenomen, welke flank
krijgt welke orde, welke helling wordt nagestreefd, bindt de catalogus, welke curve wordt
beoordeeld en over welke band, en wat is ronduit verboden. Een keuze beschrijft de kandidaat.
Zij hoort bij de laag die de kandidaat oplevert (A5d, pre-design) en nergens anders vandaan te
komen.

**Polish** — de instelling bepaalt **HOE** er gezocht wordt binnen een gegeven keuze:
iteratiebudget, gladding van de foutmaat, numerieke veiligheid, instrumentatie. Polish mag
overerven: wie de kandidaat ook koos, deze instellingen veranderen niets aan wat er gezocht wordt.

**Het grijze gebied** — gewichten die de scalaire kostfunctie vormgeven. Naar de vorm zijn het
polish: geen ervan noemt een frequentie, een orde of een topologie. Naar het effect zijn het
keuze, want de balans tussen deelscores bepaalt welk deel van het veld de zoektocht ooit
bezoekt. Een kandidaat beoordeeld op een andere weging is een andere vraag, ook als het
zoekgebied identiek is.

**De regel die hieruit volgt.** Zodra twee engines dezelfde tuner delen, mag een keuze-instelling
niet meer stilzwijgend van de ene naar de andere overerven: een kandidaat die door engine A is
gekozen en met de instellingen van engine B wordt gezocht, wordt ongemerkt teruggetrokken naar
B's ontwerp. Grijze instellingen erven wél, maar alleen **expliciet**: de engine die de zoektocht
voert stelt ze vast, en waar zij een waarde van de ander overneemt zegt zij dat. Zeggen dat iets
overgeërfd is verslaat het verzwijgen — en het maakt de aanname toetsbaar zodra iemand haar wil
betwisten.

**Toetsbaarheid.** De indeling is pas een regel als zij afdwingbaar is: elke instelling die de
tuner aanneemt heeft een klasse, de verzameling klassen dekt de instellingen volledig, en een
nieuwe instelling zonder klasse hoort de build te breken in plaats van stil in de erf-categorie
te vallen.


Structureel afgevangen ontwerpfouten: (1) polish-fase die grenzen negeert — grenshandhaving zit in de kern; (2) optima op een naald — worst-case over de parasietband is een vaste laatste fase, met de onzekerheidsband als instelling.

## A4. Metriekregister

Formaat per metriek: *grootheid → formule → afgeleide parameters → databehoefte → rol (poort/zacht/rapportage) → status*. Een metriek komt pas in de engine als alle velden compleet zijn en er een validatiecasus in Deel B staat.

### Poorten (harde eisen, geen extra databehoefte)

**M-A · Dissipatie per weerstand.** `P_R = ∫ S(f)·|I_R(f)/E_g|²·R df`, met S(f) een programmaruis-weging (IEC 60268-1: roze met 1e-orde HP/LP op de normranden), genormeerd zodat het totaal in de luidspreker opgenomen vermogen gelijk is aan de opgave. Rapportage als **fractie van het versterkervermogen** (schaalvrij) én in watt bij door de gebruiker gekozen vermogen. Databehoefte: geen — elementstromen volgen uit de MNA-oplossing. Valkuil (gedocumenteerd in casus 1): normeren op E_g².

**M-A/part · Vermogen per weerstand tegen zijn opgave (V50, 03-09-2026).** Dezelfde integraal, per element: `P_R` van ÉLKE discrete weerstand bij het gestelde CONTINUE versterkervermogen (thermiek is een gemiddelde, geen piek — het veld naast P_piek van V49), tegen een TOEGESTANE waarde per element. *Toegestaan:* de opgave van het GEKOZEN catalogusonderdeel (`CatalogPart.powerW`, wanneer de snap er een op het element zette) en anders de gestelde weerstandsklasse van het project (W continu), maal de gestelde marge (fractie; een filterweerstand in een gesloten kast zonder koeling loopt op de helft van zijn opgave al heet — de marge is een projectbesluit, geen getal van de engine). *Afgeleide parameters:* per element watt en toegestaan; het oordeel leest het element met de MINSTE marge (watt/toegestaan) en noemt het. *Databehoefte:* een opgelost netwerk (als M-A) plus een continu vermogen; zonder klasse én zonder opgave op enig element is de poort UIT en zegt zij welk veld ontbreekt (P4); zonder marge evenzo. *Rol:* poort (`M-A/part` in `GATE_IDS`), verwerping in de V31-vorm. *Wat de poort NIET doet:* een weerstand splitsen — serie/parallel-banken zijn een topologiekeuze die de generator niet maakt; het oordeel noemt dat als remedie. *Validatiecasus:* casus 1, Deel B V50.

**M-L · Piekstroom per spoel tegen zijn verzadigingsopgave (V50, 03-09-2026).** `I_L,piek = max_f |I_L(f)/E_g| · V_piek` met `V_piek = √(2·P_piek·R_nom)` (de piekingang van V49), ONGEWOGEN — verzadiging van een kern is een gebeurtenis van een halve periode en geen gemiddelde, dus hier geen IEC-weging; de frequentie van het maximum wordt gemeld, want een verzadigingsopgave zonder frequentie is niet tegen een datasheet te leggen. *Toegestaan:* de verzadigings-/maximumstroom van het gekozen catalogusonderdeel (`CatalogPart.maxCurrentA`, schema sinds V50; een stapel spoelen in serie is zo sterk als haar zwakste lid) en anders de gestelde spoelklasse (A). Luchtspoelen hebben geen verzadiging (alleen thermisch, buiten scope) en worden nooit geoordeeld. *Databehoefte:* een opgelost netwerk plus de versterkerpiek (P_piek, R_nom); zonder piek geen stroom in ampère en de poort zegt het; zonder klasse én zonder opgave is zij UIT. *Rol:* poort (`M-L`), verwerping in de V31-vorm. *Validatiecasus:* casus 1, Deel B V50 — waar de klasse LEEG is met de bevinding dat de C-Coil-documentatie geen verzadigingsstroom noemt.

**M-B · EPDR.** `EPDR(f) = |Z_in|/(2·cos²φ)`; poort op het minimum over de band. Vervangt de kale |Z|-ondergrens; die blijft beschikbaar als eenvoudige modus. Databehoefte: geen.

**M-C · Spanning op driverresonantie.** `20·log10(|V_drv(f_s)| / V̄_passband)`, met f_s automatisch uit de piek(en) van het geladen impedantiebestand en V̄_passband het gemiddelde over de doorlaatband van die weg, **afgeleid uit de gevonden kruispunten** (P6). Vangt de vuistregels "kruis ≥ 2×Fs" en "−18 dB op Fs" in één berekenbare grootheid. Databehoefte: geen. Grens instelbaar per project.

**M-C v2.0 · De grens excursie-gedragen (V49, 02-09-2026).** De GROOTHEID blijft M-C; wat verandert is waar de grens vandaan komt. *Formule:* `x/V|f₀ = Bl·Q_ms / (Z_max·N·M_ms·ω₀²)` (route 1, elektromechanisch, ladingsonafhankelijk; Z_max, f₀ en Q_ms uit de GEMETEN sweep in situ — z-resonance 1.1 draagt Small's Q_ms per motionele piek —, Bl en M_ms van de driverkaart, N het aantal parallelle drivers achter de gemeten impedantie); tegenproef `x/V = p·2π·r / (ρ₀·S_d·N·ω₀²·V_meet)` (route 2, akoestisch, uit de gemeten SPL bij een GEDOCUMENTEERDE meetspanning en micafstand; veronderstelt vrije halfruimte-straling en overschat x onder elke akoestische belasting — waveguide, hoorn, kastfront —, dus altijd conservatief; de verhouding route 2/route 1 is een gemeten eigenschap van de inbouw en wordt zo gemeld, zonder geometrie-specifieke tak). *Van uitslag naar eis:* `V_toegestaan = X_max·marge / (x/V)`, `plafond = 20·log10(V_toegestaan / V_piek)` met `V_piek = √2·√(P_piek·R_nom)`; de afgeleide M-C-grens per ontwerp is `plafond − V̄_passband[dB]`, en de poort leest de **strengste** van die grens en een eventueel gesteld dB-getal, met vermelding welke. *Monotoniciteit:* onder f₀ stijfheidsgestuurd (x/V ≈ constant), erboven 1/f²; onder een monotoon dalende hoogdoorlaat is f₀ het maximum van uitslag-per-volt, dus één punt volstaat (V47) — de `protSqDb`-controlekolom bewaakt de aanname. *Afgeleide parameters:* x/V, V_toegestaan, plafond (klasse A per driver); afgeleide grens (klasse B per netlist). *Databehoefte:* driverkaart (X_max, en Bl+M_ms óf S_d met gedocumenteerde meetspanning en -afstand), versterkerpiek (P_piek, R_nom), X_max-marge; ontbreekt er één, dan staat de afleiding UIT met het veld genoemd en oordeelt het gestelde dB-getal alleen. *Rol:* poort (dezelfde M-C-poort), plus de `drive-series-c`-voorbound leest dezelfde effectieve grens. *Wat de grens NIET dekt:* thermische belasting (de V36-wattkolom blijft de zichtbaarheid) en vervorming rond de resonantie (de fabrikantsondergrens is context). De weg zónder hoogdoorlaat krijgt geen eis maar de zwakste-schakel-rapportage: uitslag op f₀ bij V_piek tegen X_max·marge, en waar het één-resonatormodel de grens haalt. *Validatiecasus:* casus 1, Deel B V49. **Sinds V50 is het gestelde dB-getal PER WEG** (`maxDriveOnFsDbByDriver`, met het ene veld als terugval): de 18-dB-conventie is een dome-regel en hoort bij de weg waarvoor zij bedacht is; een weg zonder gesteld getal wordt op de afgeleide excursiegrens alleen geoordeeld, en `limit_source` zegt dat. Casus 1: tweeter −20,0, mid leeg (Deel B V50).

### Zachte doelen

> **Herijkt bij F3 (26-08-2026), A5e.1.** "Zacht" betekende in de oorspronkelijke opzet: meedoen in een gewogen kostenfunctie, met een gewicht dat de gebruiker instelt. Dat is vervallen. Onder het satisficing-besluit zijn de metrieken hieronder **rapportage- en sorteerkolommen** op de shortlist: zij beschrijven een kandidaat, zij rangschikken hem op verzoek van de lezer, en zij kennen géén gewicht. Wat een kandidaat wél kan afwijzen is een EIS (venster, fase) of een POORT (M-A/M-B/M-C) — beide acceptatiegrenzen, beide zonder gewicht. De formules, afleidingen en databehoeften hieronder veranderen daar niet door; alleen hun rol verandert, en het woord "gewicht" komt in geen van hun implementaties meer voor.


**M-D · LF-opslingering op de driverresonantie.** Extra respons-bult die filter + bronimpedantie toevoegen bovenop het kale driver-in-kast-gedrag: `max over B van [NF×H_el] − max over B van [NF]`, beide genormeerd op f_ref. **Afleiding (P6):** B en f_ref volgen uit de bovenste impedantiepiek f_p van het geladen .zma — B ≈ [0,7·f_p , 2,2·f_p], f_ref ≈ 3·f_p mits binnen het geldige NF-bereik en onder het kruispunt. Databehoefte: nabije-veldmeting van de betreffende weg. Vervangt de spoel-vuistregel (die R, DCR, piek-Q en kastafstemming mist).

*Registerrij, herzien bij V43 — de bult is ÉÉN getal met TWEE mechanismen erin, en zij worden sindsdien apart gerapporteerd:*

| veld | inhoud |
| --- | --- |
| grootheid | Drie getallen op één band, niet één. (1) `extraDb` — de volle bult, ongewijzigd sinds F1 en de grootheid waarin élke staande referentie en het gestelde budget zijn uitgedrukt. (2) `liftDb` — de **resistieve lift**: de brede, gedempte helft. Serieweerstand verzwakt de midband (lage \|Z\|) méér dan de reflexpiek (hoge \|Z\|), dus zij tilt het laag op zonder één reactantie. Niveauwerk. (3) `resonantDb` — de **resonante opslingering**: de smalle, ondergedempte helft, wat de reactanties bovenop die lift leggen tegen de motionele piek. |
| formule | Alle drie op dezelfde band B en dezelfde normalisatie f_ref, in één pas: `extraDb = max_B[NF·H_el] − max_B[NF]`, `liftDb = max_B[NF·H_res] − max_B[NF]`, `resonantDb = max_B[NF·H_el] − max_B[NF·H_res]`. **Per constructie `liftDb + resonantDb = extraDb`** — drie maxima over één band, geen tweede meting — en dát is wat de bestaande `lf_bult_extra_dB`-referenties tot de brug naar de twee nieuwe maakt. |
| het resistieve equivalent (H_res) | Hetzelfde netwerk, dezelfde topologie, dezelfde waarden, elke reactantie vervangen door **haar eigen serieweerstand**: spoel → DCR (een ideale spoel heeft DCR 0 en wordt dus een KORTSLUITING; de knopen worden samengevoegd, want nodale analyse kan geen ideale kortsluiting stempelen en een "klein genoeg" weerstandje is een magisch getal dat het antwoord bepaalt — P6), condensator → **OPEN**, en de tak verlaat het netwerk. Dat laatste is een besluit met een reden: de resistieve limiet van een condensator is een open tak, zijn ESR staat in serie met een reactantie die oneindig is geworden en kan dus niets geleiden. Hem door zijn ESR vervangen zou elke seriecondensator in een bijna-kortsluiting veranderen, wat de tegenovergestelde limiet is. **De DRIVER houdt zijn gemeten impedantie, reactantie en al** — de motionele piek is juist de grootheid waarover de twee krommen vergeleken worden; wie hem ook zou resistiveren houdt niets over om tegen op te slingeren. Wat de transform weghaalt is de reactantie die de ONTWERPER kiest. |
| afgeleide parameters | B en f_ref precies als hierboven, uit f_p — de ontleding voegt géén band en géén frequentie toe. |
| databehoefte | Onveranderd voor `extraDb`. De twee helften vragen er één ding bij: een **tweede netwerkoplossing** op hetzelfde raster. Geen meting erbij; wel een tweede MNA-pas, dus zij wordt lui gebouwd en per rapport hooguit één keer. |
| rol | **rapportage**, alle drie. Zij dragen geen poort: M-D heeft geen id in `GATE_IDS` en veroordeelt geen geleverde netlist. Wat er wél aan hangt is het projectbudget dat de A5d.6-inversie `bump-series-l` voedt, en dat staat **sinds V43 op `resonantDb`** — één staande eis, op de helft waar de spoelvuistregel over gaat. `liftDb` krijgt met opzet **géén eigen budget**: hij is niveauwerk, en wat daarvan gewenst is hangt aan doelcurve en dempingsmarge — het ankerbesluit A5e.2, **gesloten bij V45**. Sindsdien is dat niveauwerk niet onbewaakt maar bewaakt door de dingen die er wél over gaan: de doelcurve stuurt de zoektocht (`amplitudeReference`), de Q_es-grens begrenst de serieweerstand die de lift veroorzaakt, en `gap-pad-r` is bereikbaar zodra een project een dempingsmarge stelt. Een tweede budget op `liftDb` zou dat besluit nog steeds onder een andere naam nemen, en komt er niet. |
| geldigheid | Precies die van `extraDb` — dezelfde band, dezelfde NF-geldigheid, dezelfde dekkingsrapportage. Eén ding erbij: een tak die in de resistieve limiet niets draagt (een DCR-loze spoel dwars over de driver) levert **geen** ontleding, en dan zijn beide helften `null` mét de reden. Nooit 0 — een nul leest als "gemeten, en het is niets". |
| negatieve opslingering | **Kan, en is geen fout.** M-D normaliseert op f_ref, dus wie daar door zijn eigen reactanties wordt opgetild — een doorlaatband­resonantie rond f_ref — leest ten opzichte van zijn resistieve equivalent lager. HUIDIG is precies dat geval: `extraDb` 3,75, lift 4,69, opslingering **−0,94** dB. De opslingering is dus "wat reactantie bij de piek doet **ten opzichte van wat zij bij f_ref doet**", en niet "wat reactantie bij de piek doet". Dat is dezelfde relativiteit die `extraDb` altijd al droeg; zij wordt hier alleen zichtbaar. |
| validatiecasus | casus 1, élke bevroren netlist (`manifest_en_geometrie.v43_ontleding`, klasse B) plus het levende corpus in `kandidaten.*.lf_lift_dB` / `.lf_opslingering_dB`. Handberekening en nieuwe-meting-test in `metrics/lfBumpDecomposition.test.ts`; de optel-assert over het hele casusboek in `frozenNetlistGates.test.ts`. |
| versie | `lf-bump/1.1` (was ongeversioneerd; 1.0 = de F1-vorm met alleen `extraDb`), naast `resistive-equivalent/1.0` voor de transform. MINOR en geen MAJOR: `extraDb` is bit-identiek, band en normalisatie zijn onaangeraakt, de resultaatvorm is alleen gegroeid — dezelfde afweging als bij `z-re` 1.0 → 1.1. Een cache van vóór deze versie kan de nieuwe vraag niet beantwoorden, dus hij vervalt. |

**M-E · Thévenin-bronweerstand / Q-vermenigvuldiging.** `Z_s(f) = (V₂−V₁)/(V₁/Z₁ − V₂/Z₂)` via twee solves (Z en 2Z), geëvalueerd rond f_s; rapportage als `(R_e+R_s)/R_e`. Databehoefte: R_e per driver. Goedkope benadering van M-D wanneer geen NF-meting beschikbaar is; rapportage kan de consequentie in kastvolume tonen (V_box ∝ Q_ts²-vuistregel als duiding, niet als grens).

**M-F · Verticale lobing.** Twee niveaus, en sinds V20 (27-08-2026) is de rangorde tussen die twee vastgelegd in plaats van impliciet: **F-eind is de autoriteit**, F-interim is leesvoer.

*F-eind (berekend) — de autoriteit.* Synthetiseer het verticale gedrag uit per-driver-metingen, filterspanningen en z-offsets: `P(θ,f) = Σ_i P_i(f)·H_i(f)·e^{+jk·z_i·sinθ}`; rapporteer afwijking t.o.v. as over een instelbaar hoekvenster en de diepste dip in het kruisgebied. **Dit is de enige lobing-grootheid waar een gebruikers-eis of een kandidaat-oordeel aan mag hangen** (V20a): zij gebruikt élke bron, élk akoestisch centrum en de doelhellingen van de kandidaat zelf, in plaats van één afstand die voor alle bronnen tegelijk moet instaan. Databehoefte: z-offsets (akoestische centra) + per-driver-metingen op één as. Beperking documenteren: puntbron-benadering per driver; eigen verticale bundeling van drivers/waveguides zit er niet in.

*F-interim (alleen geometrie) — rapportage.* **Registerrij, herzien bij V20:**

| veld | inhoud |
| --- | --- |
| grootheid | Bronscheiding in golflengtes bij het kruispunt, als **vier** fracties per aangrenzend wegenpaar: (1) tot de **dichtstbijzijnde** bron, (2) tot het **amplitudegewogen zwaartepunt**, (3) tot de **verste** bron — alle drie *tussen* de twee wegen — plus (4) de grootste onderlinge scheiding **binnen** één van beide wegen. |
| formule | `λ = d·f_x/c` voor elk van de vier `d`. `d₁ = min_{i∈L, j∈U} |z_i−z_j|`, `d₃ = max_{i∈L, j∈U} |z_i−z_j|`, `d₂ = |z̄_L − z̄_U|` met `z̄ = Σ a_i z_i / Σ a_i`, `d₄ = max_w max_{i,j∈w} |z_i−z_j|`. |
| afgeleide parameters | `f_x` = het kruispunt dat de kandidaat zelf oplevert (geen kruispunt = geen fractie, wél de afstanden, en dat wordt gemeld). `a_i` = relatieve amplitude uit de **aansturing**; niet ingevuld = gelijk aangestuurd (parallel), en de metriek zégt dat in plaats van stil een 1 te schrijven. |
| databehoefte | De verticale positie van **elke** bron per weg (`waySources`). Terugval: één bron per weg op het akoestisch centrum; verdere terugval: de ingevoerde c-t-c-afstand, die dan voor alle drie de tussen-de-wegen-fracties tegelijk staat — met de melding dat zij niet te scheiden waren. Een árray-afstand alléén is géén invoer: een afstand zegt niet hoevéél bronnen zij scheidt, en er twee van maken is precies de N=2-aanname die V20 verbiedt. |
| rol | **rapportage.** Geen poort, geen budget, geen shortlist-criterium, geen score — blijvend (V20a/b). |
| validatiecasus | casus 1, alle drie de netlists (`kandidaten.*.lobing_{wm,mt}_*_lambda`, parameters in `kandidaten._M_F_interim_parameters`). |
| versie | `lobing-lambda/2.0`. MAJOR t.o.v. de ongeversioneerde F1-vorm: andere resultaatvorm én een andere grootheid onder dezelfde naam. |

*Wat V20 verving.* F1 rapporteerde **één** λ per paar, genomen als de grootste van de paarafstand en een array-afstand binnen een van beide wegen, en scoorde die tegen een **niet-monotone** zonecurve (gunstig klein, ongunstigst rond een halve golflengte, opnieuw gunstig rond één — de verzoening van de twee strijdige vakregels, Deel B V5). Voor een weg met N bronnen bestaat die ene λ niet, dus de score scoorde een keuze en niet een meting; hij is vervallen en heeft geen vervanger. De zonecurve zelf staat bewaard in Deel B, V20.

**M-G · Directiviteits-match.** Uit een 0°/θ-meetpaar per driver: de frequenties waar het verschil −3 en −6 dB passeert; de −6 dB-frequentie van de onderste driver is de bovengrens voor het kruispunt (vakregel), de metriek rapporteert de marge. **Aanscherping bij off-axis data van béíde drivers:** de eigenlijke regel is DI-continuïteit — een sprong in bundeling op het kruispunt geeft een power-response-anomalie die geen EQ kan repareren. De snijzone van de twee D(f)-curven wordt dan een tweezijdige doelband in de kruisvenster-synthese in plaats van een eenzijdig plafond. Databehoefte: minstens één off-axis meting per betrokken driver; de doelband-variant vereist beide.

**M-H · Breakup-afstand met ernst-weging.** Breakup-detectie per driver (zie A5.2); de vakregel "kruis onder f_break/3 (H3) resp. /2 (H2)" geldt in volle sterkte alleen voor forse pieken. Weging: vereiste marge schaalt met piekamplitude en Q (voorstel: volle regel vanaf circa +6 dB piek; daaronder lineair afbouwend; exacte weging vaststellen zodra HD-metingen in het casusboek zitten). Belangrijk inzicht: een notch op de breakup verhelpt dit niet — de vervorming ontstaat ín de driver, ná het filter. **Richtings-persistentie als ernst-component:** een piek die bij off-axis metingen blijft staan of groeit is een echte conusresonantie (telt mee in de power response → ernst omhoog); een piek die verdwijnt of van teken wisselt is interferentie/diffractie (ernst omlaag). Lineair deelrapport (altijd beschikbaar): elektrische onderdrukking op f_break.

**M-K · Fase-integratie per kruisgebied.** *Nieuw bij V44 (30-08-2026). Vóór V44 bestond deze grootheid wel maar had zij geen registerrij: zij stond als extractor onder A5.5 en werd op TWEE plaatsen anders geïmplementeerd — en die twee bewogen op hetzelfde netwerk in tegengestelde richting (Deel B, V40).*

| veld | inhoud |
| --- | --- |
| grootheid | Het gemiddelde \|relatieve fase\| tussen twee AANGRENZENDE takken, over de punten die zo'n oordeel mogen DRAGEN. De formule is ongewijzigd sinds F1; wat V44 vaststelt is de puntenverzameling. |
| formule | `mean over toegelaten i van \|wrap(arg H_onder(f_i) − arg H_boven(f_i))\|`, op het raster waarop de aanroeper werkt. |
| toelating (drie gronden, alle drie tegelijk) | **(a)** het punt ligt binnen de meetgeldige band van BEIDE takken (A5b.1). **(b)** BEIDE takken liggen boven de stille-geestvloer van de aanroeper — buiten haar gemeten uitgestrektheid draagt een tak de geestwaarde met fase 0, en twee even dode takken liggen per definitie binnen élk RELATIEF niveauvenster. **(c)** \|niveauverschil na filter\| ≤ het overlapvenster (`integration.ts`): fase waar de som hem niet voelt, telt niet. |
| wat vervalt | De **±1-octaafband rond het kruispunt** als toelating. Zij was een BENADERING van "waar de twee takken elkaar overnemen"; grond (c) meet dat gebied rechtstreeks, op het geleverde netwerk. Gevolg in beide richtingen: geldige punten buiten dat octaaf tellen mee, en punten binnen dat octaaf waar één tak allang weg is, tellen niet. |
| afgeleide parameters | Géén. De geldige band komt per weg uit de opnamepas, de geestvloer is de conventie van wie het raster bouwde, en het overlapvenster woont in `integration.ts`. Er staat geen frequentie en geen grens in de metriekcode (P6). |
| databehoefte | Twee gefilterde taktransfers op één raster. Grond (a) vraagt de A5b.1-geldigheid, grond (b) een gestelde geestconventie; ontbreekt er een, dan ONTHOUDT die grond zich en de metriek zegt welke (P4). Zij valt nooit terug op een verzonnen band. |
| geldigheid | De dekking wordt gemeten tegen het OVERNAMEGEBIED (de band die grond (c) van dit netwerk afleest) en niet tegen een octaafvenster: zij zegt hoeveel van dat gebied de meetgeldigheid en de geestvloer overlieten. Op casus 1 is dat 100 % op mid→tweeter en 42–56 % op woofer→mid, waar het overnamegebied onder de 397 Hz-vloer reikt. |
| rol | **zacht.** Dit is waar de EIS `phase-tracking` op oordeelt (per kruisgebied, verruimbaar door de relaxatieladder als smaak-eis, A5e.1) en waar de shortlist op sorteert; het is geen poort en heeft geen id in `GATE_IDS`. |
| controlekolommen | De twee vervangen maten blijven meereizen onder eigen naam (`control.octaveClipped`, `control.overlapWindow`) en oordelen niets. Zij staan er omdat hun onderlinge tegenspraak het bewijsmateriaal onder V44 is: verdwijnt zij, dan is er aan een van beide iets veranderd zonder dat iemand het besloot. |
| validatiecasus | casus 1, élke bevroren netlist (`manifest_en_geometrie.v44_fasematen`, klasse B) plus `kandidaten.*.wm_fase_oct` / `.mt_fase_oct`. Handberekening en nieuwe-meting-test in `metrics/phaseIntegration.test.ts`; de corpusclaims in `frozenNetlistGates.test.ts`; de tuner-helft in `optimizer/phaseAdmission.test.ts`. |
| versie | `phase-integration/2.0`, naast `phase-admission/1.0` voor de toelating. MAJOR: dezelfde naam, een andere puntenverzameling, dus een ander getal — dezelfde afweging als `lobing-lambda/2.0`. Een cache van vóór deze versie beantwoordt de nieuwe vraag niet en vervalt. |

*Wat V44 verving, en waarom geen van de twee genoeg was.* De RAPPORTMAAT middelde over ±1 octaaf rond het kruispunt, geknipt op meetgeldigheid — en telde daarmee punten mee waar één tak dertig dB weg was (op `V28_KAND_1` mid→tweeter dertien punten van gemiddeld 146°, wat 90,7° opleverde waar de som 29,7° zag). De TUNERMAAT middelde over het overlapvenster zonder enige knip — en telde daarmee, over het hele casusboek, 1047 punten mee die de rapportmaat niet zag, waarvan 911 onder de meetgeldigheidsvloer die de meetbestanden zélf opgeven en 14 waar beide takken dood waren en het faseverschil uitsluitend van de filters kwam. De twee defecten staan haaks op elkaar, en dat is waarom het antwoord hun DOORSNEDE is en niet een van beide.

### Rapportage zonder optimalisatierol

**M-J · Groepvertraging vs. hoorbaarheidsdrempel.** Groepvertraging van het totale systeem, getoond tegen de drempelcurve uit de psychoakoestische literatuur (~1–3 ms in het middengebied, ruimer daarbuiten). Geen poort, geen smaakoordeel: typische HF-kruisingen blijven er ruim onder, lage kruispunten verdienen de blik. Dit is de berekenbare afstammeling van alle "steil klinkt slechter"-lore; de klankregel zelf ("2e orde muzikaler") is ❌ — geen grootheid, en de gecontroleerde luisterliteratuur wijst gladde on-/off-axis respons aan als dominante voorkeursfactor.

**Ontwerpprincipe voicing.** "Muzikaal" is een responskeuze, geen filterorde-eigenschap: voicing hoort een expliciete, gedocumenteerde **doelcurve** te zijn (project-object: vlak, tilt, luistervenster, behoud-huidig, of handmatig) waar de SPL-doelfunctie tegen rekent — nooit een bijeffect van helling-ideologie.

**M-I · Gevoeligheid/robuustheid.** Monte-Carlo over componenttoleranties (instelbaar per componenttype) als eindrapport; worst-case over de parasietband als poortcontrole in de laatste fase. Promotie naar in-de-lus-straf pas na profilering.

### Categorische catalogusregels (geen metriek)

- Kernverzadiging: spoelfamilies dragen een vlag met stroomgrens; serie-elementen in hoogstroompaden vereisen lucht of gedocumenteerde verzadigingsstroom. (Getalsmatige onderbouwing: bij vol vermogen liggen RMS-stromen in het bereik waar ferrietkernen op bastransiënten niet-lineair worden.)
- Fysiek formaat/prijs: maximale capaciteit/inductie per bouwvorm als cataloguseigenschap; relevant zodra een layout-doelvak (projectinstelling) is opgegeven.
- Snapping-snoeiregel: kandidaten die uitsluitend verschillen in DCR onder de meetbaarheidsgrens in serie-LP-posities, of in DCR van shunt-spoelen in HP-secties, niet apart evalueren.

## A5. Meetopname en afleiding (de motor achter P6)

Nieuwe metingen moeten door **dezelfde regels** verwerkt worden als bestaande — zonder codewijziging. Daarvoor bestaat de opnamepas, die bij elke wijziging van de meetset draait:

1. **Manifest.** Elke meting krijgt tags: driver, type (Z / nabij-veld / ver-veld / groundplane), hoek, en waar bekend gate, spanning, afstand, driverdiameter. Auto-detectie uit bestandsheaders waar mogelijk; de rest tagt de gebruiker eenmalig bij upload.
2. **Afleidingspas.** Per driver worden de afgeleide parameters berekend die alle metrieken voeden: R_e, impedantiepieken (f, Z, Q), breakup-pieken (f, amplitude, Q), geldigheidsgrenzen (Keele-grens, gate-grens, FF/NF-divergentie), en de daaruit volgende evaluatiebanden. Deze parameters worden gecachet onder de meetsessie-ID.
3. **Capability-matrix.** Metriek × databehoefte → actief/uit per driver, met reden ("M-G uit: geen off-axis meting voor tweeter"). Dit is wat de UI toont onder P4.
4. **Her-evaluatie.** Vervangt of vult een gebruiker metingen aan, dan herberekent de pas de afgeleide parameters en worden bestaande ontwerpen automatisch opnieuw gescoord tegen ongewijzigde regels. Regels veranderen nooit mee met een meting; alleen de afgeleide grenzen doen dat.
5. **Geldigheidspropagatie.** Elke meting draagt zijn eigen geldigheidsinterval [f_lo, f_hi] als metadata. Elke metriek snijdt zijn natuurlijke evaluatieband met de geldigheidsintervallen van de data die hij gebruikt en rapporteert de **dekking**: "geëvalueerd over X–Y, dat is N% van de beoogde band", met een vlag bij lage dekking. De optimizer evalueert kostentermen uitsluitend binnen geldige gebieden — een vaste evaluatie-ondergrens in de kostenfunctie is een P6-overtreding; de ondergrens vólgt uit de meetset. Metrieken waarvan de beoogde band grotendeels buiten de geldige data valt worden niet stilletjes geëvalueerd en niet stilletjes overgeslagen, maar zichtbaar gemarkeerd als ongedekt.

Prototype-demonstratie op casus 1 (alle parameters louter uit bestanden + manifest) staat als `ingest.py` in de referentiebundel. De demonstratie legde meteen drie te verfijnen schatters bloot — vastgelegd als V8 in het casusboek.

## A5b. SPL-extractoren (voedt het F1-rapportpaneel)

Alle extractoren leiden hun banden en grenzen af uit de data zelf (P6):

1. **Geldigheidsgrenzen — drie detectoren, in rangorde.** (i) *Header-vloer (hard, automatisch):* effectieve venstertijd T = rechter venster − referentietijd uit de bestandsheader; f ≥ 1/T is een absoluut minimum, fijnstructuur pas vertrouwd vanaf ~2/T. (ii) *FF/NF-modeltest (adviserend):* het FF−NF-verschil moet passen op een fysisch baffle-step-model (shelf, diepte ≤ ~7 dB, begrensde exponent), gefit uitsluitend binnen de Keele-geldige NF-band; blijvend residu markeert de kapotte zone. Let op: het model kan gate-afval deels absorberen — nooit boven de header-vloer laten versoepelen. (iii) *Detail-instorting (zwak adviserend):* vereist een SNR-wacht en kan fysiek gladde responsies niet van gate-gladde onderscheiden. Eindoordeel per meting: **max(header-vloer, modeldetector)**. Nabij-veld: Keele-grens 4311/D_inch en mic-afstandseis 0,11×straal. Alle overige metrieken clippen hun banden op deze grenzen; elke nieuwe of vervangende meting brengt zijn eigen grenzen mee via zijn eigen headers — de banden bewegen automatisch mee, in beide richtingen.
2. **Breakup-scan.** Afwijking t.o.v. fractionele-octaaf-trend (breedte instelbaar); piekdetectie met Q-schatting via de −3 dB-punten van de rimpel. Voedt M-H.
3. **Diffractie-rimpel.** RMS-rimpel t.o.v. trend over de doorlaatband + FFT-periodiciteit → dominante omweglengtes in mm, te toetsen aan kastgeometrie.
4. **Directiviteit uit 0°/θ-paren.** Voedt M-G; toont waar het gedrag van kolbentheorie afwijkt (waveguides, pods). Levert bovendien de **effectieve stralerdiameter** per frequentie (kolbenmodel-fit op D(f)): voedt de Keele-grens datagedreven i.p.v. via handinvoer, en markeert conus-ontkoppeling (waar het kolbenmodel — en daarmee elke symmetrie-aanname — ophoudt te gelden).
5. **Baffle step.** FF−NF in het gezamenlijk geldige gebied, vergeleken met c/(2W) uit de opgegeven baffle-breedte.
6. **Verticale-lobing-synthese.** Voedt M-F-eind.

### A5c. Z-extractoren (impedantiedata)

Impedantie is exact en gate-vrij meetbaar; per geladen .zma/.lim leidt de opnamepas af:
1. **R_e** via Re(Z), geëxtrapoleerd onder de onderste resonantie (kale low-f-aflezing faalt zodra de meting dicht op f_L begint — zie V8d).
2. **Resonanties met Q** per piek; voor gesloten systemen direct de uitlijning: r₀=Z_max/R_e, Q_mc/Q_ec/Q_tc via de klassieke Small-methode.
3. **Reflex-diagnostiek**: f_L/f_b/f_H, consistentiecheck √(f_L·f_H)≈f_b, en de verliesindicator Z(f_b)/R_e (duiding via de QL≈7-praktijkregel; nauwkeurigheid staat of valt met R_e).
4. **Rimpelscan** t.o.v. fractionele-octaaf-trend: interne staande golven, poortpijp-resonanties, pod-modes — elk met frequentie en amplitude, te toetsen aan kastgeometrie.
5. **Spreekspoelmodel**: semi-inductantie-fit |Z−R_e| = K·ω^n boven het motionele gebied; n≈1 zuivere spoel, n→0,5 sterke wervelstroomonderdrukking. Voedt Zobel-advies en de LP-modellering. Voor tweeters vaak niet in-band bepaalbaar (motioneel domineert tot ver boven de audioband) — extractor moet dat detecteren en melden i.p.v. onzin fitten.
6. **Sessievergelijking**: f_s/f_b/compliantie-drift tussen meetsessies → inspeel-detectie en her-validatiewaarschuwing (sluit aan op F5).
7. **Systeem-vingerafdruk (QC)**: gemeten ingangsimpedantie van het gebouwde filter vs. gesimuleerde — afwijking lokaliseert bouwfouten (verkeerde waarde, bedrading, kernverzadiging) zonder akoestische meting.
8. Met extra metingen: vol T/S-stel (vrije lucht + delta-massa/volume), thermische R_e-shift en poortcompressie (twee niveaus).

### A5d. Afgeleide ontwerpanalyses (pre-design laag)

Combinaties van reeds afgeleide parameters die ontwerpruimte afbakenen vóórdat er een component gekozen is:
1. **Onderlinge looptijden (dZ) automatisch.** Wanneer de headers één gedeelde referentietijd tonen, zijn relatieve aankomsttijden per driverpaar extraheerbaar uit de overtollige fase → voedt lobing-synthese en tijd-uitlijning zonder handmatige akoestisch-centrum-sessies. Vereist eerst minimumfase-verwijdering (Hilbert): kale fasehelling overschat de vertraging van bandbegrensde drivers (V8h).
2. **Fase-hellinganalyse per overlapgebied.** Hellingen (°/okt) van de káле driverresponsies rond elk snijpunt → de structurele mismatch die het filter moet overbruggen, als orde-asymmetrie-advies vóór optimalisatie (~90°/okt ≈ één orde).
3. **Haalbare kruisvensters** *(geïmplementeerd in prototype, zie V9)*. Per driverpaar de doorsnede van alle afgeleide grenzen, elk met bronvermelding en de melding welke grens bindend is:
   - *vloeren:* meetgeldigheid (beide metingen); k·f_s van de bovenste driver met orde-afhankelijke k (≈3/2/1,6/1,4 voor orde 1–4 — steilere flank mag dichter op de resonantie);
   - *plafonds:* eerste significante breakup van de onderste driver gedeeld door een ernst-gewogen factor (→3 bij forse pieken, →2 bij milde; de wegingscurve is het enige ongekalibreerde element en vergt HD-data); −6 dB@30°-punt van de onderste driver;
   - *voorkeurszones binnen het venster:* lobing-zones (niet-monotoon per R5) en fase-hellingmatch (A5d.2).
   Leeg venster = driver-/layoutprobleem, geen filterprobleem — en dat vóór er één ontwerp gemaakt is. Conflicterende zones (bijv. lobing-goed boven het breakup-plafond) worden expliciet getoond: dat zijn de werkelijke ontwerpspanningen van een drivercombinatie.
   **Vensterinteractie (meerweg).** De klassieke minimumafstand-regel (midband ≥ ~2 okt steil / ~3 okt flauw; maximum ~10–12:1) is geschreven voor amplitude, maar fasekoppeling reikt ~2× verder. Geen afstands-poort; drie rapportage-indicatoren: (a) *drie-bronnen-zone* — frequenties waar >2 wegen binnen X dB van de som liggen (triggert M-F-eind met drie bronnen); (b) *fase-doorkoppeling* — faserotatie die de secties van het ene kruispunt bijdragen in de trackingband van het andere (voedt A5d.2); (c) *mid-insertieverlies* — dB onder het asymptotische niveau; boven een drempel is het ontwerp een bewuste filler-topologie: toegestaan, maar gemeld, met rendementskost en verhoogd Monte-Carlo-gewicht.
   **Orde-afleiding per flank.** De filterorde is geen gebruikersgok maar een afgeleide: (i) *akoestische doelhelling telt, niet elektrische orde* — vereiste elektrische orde = (doelhelling − gemeten natuurlijke helling)/6, per flank uit de kale meting; (ii) beschermingsflank: benodigde verzwakking op f_s (M-C-doel) gedeeld door de octaafafstand tot het kruispunt; (iii) onderdrukkingsflank: benodigde verzwakking op de (ernst-gewogen) breakup gedeeld door de afstand; (iv) orde-asymmetrie ≈ fase-hellingmismatch (A5d.2) / 90°/okt; (v) kostenkant per kandidaat-orde via M-A (serie-elementen onderin zijn duur in koper en dissipatie, bovenin goedkoop). Voorkeursvorm: symmetrische akoestische LR-flanken voor fasetracking, tenzij (iv) asymmetrie voorschrijft.
4. **Gevoeligheids-gap-analyse — verankerd, niet paarsgewijs.** Het referentieniveau van het systeem is het **anker**: de weg met de hoogste kosten-per-dB verzwakking (vrijwel altijd de onderste weg — daar kost dempen bronweerstand, LF-bult en dissipatie). Het dempingsbudget van elke andere weg is zijn gemeten gap t.o.v. het *anker*, en die budgetten **ketenen**: budget(bovenste) = gap(bovenste→midden) + gap(midden→anker). Ligt een tussenweg bóven het anker, dan schuift zijn overschot dus één-op-één door naar alle wegen erboven. Twee nuances: (a) het ankerniveau hangt af van de doelcurve — het is het niveau van de onderste weg ná baffle-step in de beoogde opstelling, niet zijn kale doorlaatbandgevoeligheid; (b) ligt een tussenweg *onder* het anker, dan wisselt het anker en moet de onderste weg gedempt worden — dat is een haalbaarheidswaarschuwing (driverkeuze-probleem: systeemgevoeligheid begrensd door de tussenweg, met dempingsconsequenties op de onderste weg), geen stille optimalisatie-uitkomst.
5. **Manifest-kruischecks (QC).** Gefitte baffle-step-f₀ vs opgegeven baffle-breedte; referentietijd-consistentie tussen headers (schakelt analyse 1 aan/uit); niveaucontroles NF/FF — vangt tagfouten in het manifest.
6. **Meetafgeleide zoekruimtegrenzen.** Elke budgetmetriek die monotoon van een componentwaarde afhangt is inverteerbaar naar een grens op die component, met uitsluitend gemeten Z/NF/SPL plus de projectbudgetten als invoer. Twee klassen:
   - *Exacte inversies* (metriek hangt van weinig componenten af): max totale serie-R in het laagste pad uit het Qes-budget (Rs ≤ R_e·(q−1)); max serie-L uit het bult-budget bij gegeven Rs (1D-oplossing op de gemeten Z-piek + NF); max pad-verzwakking uit de gemeten gevoeligheids-gap.
   - *Topologie-bewuste voorbounds* (metriek verdeeld over meerdere secties): bijv. max serie-C uit het f_s-spanningsbudget geldt exact voor een enkelvoudige sectie en verruimt per extra filterorde — toepassen als zoekdoos-vormgeving met speling; de poort (M-C e.d.) blijft de autoriteit.
   Consequentie voor A5e.3: **optimalisatiegrenzen = catalogus-spanwijdte ∩ meetafgeleide budgetgrenzen.** Pathologisch gedrag (weerstand-drift naar extreme waarden voor "gratis" faserotatie) wordt daarmee per constructie onmogelijk i.p.v. per straf ontmoedigd, en de zoekruimte krimpt aanzienlijk.
7. **Reflectiedetectie binnen het venster.** Periodieke rimpel (cepstrum/FFT) in ver-veldmetingen verraadt resterende reflecties → meetkwaliteits-QC.

Niet extraheerbaar uit SPL alleen (documenteren in de UI): vervorming (HD-sweep vereist), echte verticale polars per driver, absolute max-SPL/excursiegrenzen (vereist gedocumenteerde meetspanning en -afstand plus Sd/Xmax).

### A5d.8. Kandidaatgeneratie — de pre-design-laag levert het VELD

*Toegevoegd 27-08-2026 (F4d). Algemeen geformuleerd: de regels gelden voor elk aantal wegen, elke meetset en elke topologie-bibliotheek. De uitkomst op één project is een casusboek-entry, geen onderdeel van deze specificatie.*

A5d.1 t/m A5d.7 bakenen de ontwerpruimte af. Zolang die afbakening alleen gerapporteerd wordt, is de engine een **vetorecht met een rapportagelaag**: zij kan een netwerk afkeuren en componentwaarden begrenzen, maar niet voorstellen wáár de overname hoort — terwijl zij dat als enige uit de metingen afleidt. Kandidaatgeneratie sluit die naad. Zij hoort in A5d en nergens anders: A5d is pre-design, A5e is de run, en een kandidaat is per definitie het ding dat vóór de run bestaat.

**De uitvoer.** Per aangrenzend wegenpaar een reeks kandidaat-overnames; als geheel het cartesisch product daarover, plus per kandidaat een volledige verklaring over élke instelling die de zoektocht aanneemt (A3j). Een kandidaat is dus geen frequentie maar een **beschrijving van een zoekvraag**.

**De vijf regels waaraan de reeks moet voldoen.**

1. **Spreiding in OCTAAF-afstand, niet clustering.** De posities dekken de aanbevolen band gelijkmatig in log-frequentie. Een veld dat het midden van een venster fijn bemonstert en de randen niet, heeft al besloten dat het midden beter is — precies het oordeel dat A5e.1 deze laag verbiedt. Waar de aanbevolen band uit meerdere segmenten bestaat (de slechtste lobing-zone is eruit gesneden) loopt de spreiding over de **aaneengeschakelde** octaafafstand van de segmenten, zodat een breed segment naar rato meer posities krijgt en de weggesneden zone er geen consumeert.
2. **Het AANTAL is afgeleid, niet gekozen.** Twee overnames die dichter bij elkaar liggen dan de gladding waarop de acceptatie oordeelt, leveren ontwerpen op die dat oordeel niet uit elkaar kan houden; die breedte is dus de fijnste zinvolle stap. Het aantal is wat erin past. Een smal venster krijgt daardoor mínder kandidaten — omdat het minder onderscheidbare antwoorden HEEFT, wat informatie is en geen tekortkoming.
3. **De orde per flank komt uit de orde-afleiding (A5d.3), en meerdere toegestane orden zijn aparte KANDIDATEN.** Nooit een gewogen compromis: er bestaat geen orde drieënhalf. Waar geen enkele regel gewapend is en de ontwerper niets gesteld heeft, ONTHOUDT de afleiding zich — en onthouding betekent niet "orde 1" en niet "orde 4" maar: elke bouwbare orde is een eigen kandidaat. Een engine zonder mening biedt het veld aan; zij kiest niet stilletjes.
   *Gevolg dat vaak wordt overgeslagen:* het venster is een FUNCTIE van de orde (de vloer is k·f_s met k dalend naarmate de flank steiler wordt), dus het venster wordt **per orde opnieuw afgeleid**. Eén venster met vier orden erin zou drie ervan onder een vloer plaatsen die voor een ander is berekend.
4. **Niets buiten de meetgeldigheid. Ooit.** De posities worden uit de aanbevolen band gesneden, en die is per constructie een deelverzameling van het haalbare venster. Een kandidaat buiten het venster is daarmee niet iets dat de generator weigert op te leveren, maar iets dat zij niet kan uitdrukken. De relaxatie-ladder (A5e.1) mag later een SMAAK-eis verruimen; zij mag nooit de meetgeldigheid verruimen, en deze laag evenmin.
5. **Elke kandidaat draagt zijn herkomst.** Uit welk venster, welk segment van de aanbevolen band, de hoeveelste positie daarin, hoeveel octaven boven de vloer, welke limiet die vloer en dat plafond zette, en welke regel de orde bepaalde. Een shortlist-rij die een ontwerper niet kan toeschrijven is een rij waar hij niet naar kan handelen — en het hele argument om kandidaatgeneratie hierheen te halen is dat déze kandidaten kunnen zeggen waar zij vandaan komen.

**Kosten en dunnen.** Het afgeleide veld kan groter zijn dan wat een ontwerper wil betalen. Dan worden **posities** gedund en **orden nooit**: een positie is een steekproef uit een continuüm, een orde is een keuze, en een keuze laten vallen om een budget te halen beantwoordt een vraag die openstond. Wat gedund is wordt gemeld, met beide aantallen erbij — een stilzwijgende afkapping leest als volledige dekking.

**Verhouding tot de tuner.** De generator vervangt geen optimizer. Zij levert het WAT; de bestaande waarde-optimalisatie doet het HOE binnen die keuze (A3j). Dat is ook de reden dat de kandidaat zijn keuzes expliciet meestuurt: zodra twee engines dezelfde tuner delen, trekt een overgeërfde keuze-instelling de kandidaat stil terug naar het ontwerp van de ándere engine.

**Verhouding tot A5e.4.** Een veld van kandidaten is diversiteit die BESLOTEN is. Gejitterde startpunten zijn diversiteit die getrókken is. Onder satisficing is alleen de eerste bruikbaar, want een shortlist spreidt over topologie-klassen en een gejitterde start heeft geen topologie gekozen. Waar beide bestaan is de kandidaat de bron van spreiding en is de seed een reproduceerbaarheids-instelling die aan geen enkel oordeel deelneemt — wat hij volgens A5e.4 sowieso al was.

**Twee vloeren, twee vragen — en geen automatische verzoening.** Een app met een oudere ontwerplaag kan een tweede ondergrens voor dezelfde overname kennen (bijvoorbeeld een splice- of montageregel in plaats van een meetgeldigheidsregel). Die twee beantwoorden verschillende vragen: *waar mag een respons geloofd worden* tegenover *waar mag een overname zitten*. De regel is dat de kandidaatgeneratie op één van beide staat, dat gezegd wordt op wélke, en dat de andere als **tegenoordeel** naast de eerste getoond wordt met zijn herkomst — inclusief de melding welk deel van het veld die andere laag geweigerd zou hebben. Automatisch verzoenen is verboden: de vroegste laag in de pijplijn wint dan, en "eerst" is geen argument.

## A5e. Openstaande specificatiebesluiten (vóór F1/F2 te nemen)

1. **Aggregatie van zachte doelen — BESLOTEN bij F3 (26-08-2026): SATISFICING, GEEN GEWICHTEN.**

   Het besluit is niet "welke gewichten" maar "geen gewichten". De aanbeveling uit de parkeerlijst — genormaliseerde scores plus een diverse top-N — is voor de helft overgenomen (de diverse top-N) en voor de helft verworpen (de genormaliseerde scores). De reden is dat een genormaliseerde score alsnog een gewogen som ís zodra je hem gebruikt om te rangschikken, en dan is de gewichtsvector alleen onzichtbaar geworden in plaats van weg.

   - **De gebruiker stelt EISEN, geen gewichten.** Acceptatiegrenzen op de UITKOMST: SPL-venster in ±dB t.o.v. de doelcurve, maximale fase-trackingfout, en de bestaande impedantie-/EPDR-vloer. Leeg veld = geen eis (P4).
   - **De engine zoekt het TOELAATBARE GEBIED.** Alles wat aan alle actieve eisen én alle actieve poorten voldoet is een winnaar. Er bestaat **geen gewogen somscore en geen gewichtsvector** — nergens, ook niet intern als "hulpmiddel". Eisen zijn acceptatie-eisen op de uitkomst, geen straftermen in de zoektocht: P3 (onhaalbare doelen krijgen geen drempel) blijft onverkort gelden voor de zoektocht zelf.
   - **De uitkomst is een GEDIVERSIFIEERDE SHORTLIST** (standaard 10, instelbaar): eerst gespreid over topologie-klassen (orde per flank, polariteit meegerekend), daarbinnen op afstand in genormaliseerde componentruimte. Tien wezenlijk verschillende ontwerpen, geen tien klonen.
   - **Sortering is presentatie, geen oordeel.** Standaard gesorteerd op RMS-vlakheid t.o.v. de doelcurve; elke metriekkolom is hersorteerbaar; sorteren verandert niets aan de inhoud van de lijst. De selectie is aan de mens.
   - **Venster poort, gemiddelde rangschikt.** De ±dB-eis is peak-to-peak op de 1/6-octaaf-gegladde systeemrespons t.o.v. de doelcurve; de sorteersleutel is de RMS-afwijking van diezelfde doelcurve. Twee verschillende vragen — "is dit acceptabel" en "welke is het vlakst" — verdienen twee verschillende grootheden, en één getal voor beide is precies hoe een piek van 3 dB en een systematische kanteling van 3 dB gelijk gaan scoren. De fase-eis is **M-K** (A4): gemiddelde |Δφ| per kruisgebied over de punten die zo'n oordeel mogen dragen, met gerapporteerde dekking. Tot V44 stond hier "de bestaande trackingmetriek, geclipt op meetgeldigheid" — één van de twee implementaties die de app toen droeg, en niet degene waarop de eis werkelijk geoordeeld werd (de worker las de TUNER-maat). Zie Deel B, V40 en V44.
   - **Outliers asymmetrisch — en dat is een SMAAKPRINCIPE, expliciet als zodanig.** Smalle kenmerken vallen door de 1/6-octaaf-gladding buiten het venster-oordeel; ze gaan naar de rimpelscan. Smalle **pieken** worden per kandidaat gerapporteerd als kolom (grootste piek: +dB @ f, met Q). Smalle **dips** worden vergeven. *Motivering:* het gehoor is asymmetrisch gevoelig voor resonanties en anti-resonanties. Een smalle piek is een resonantie: hij klinkt na, hij wordt door meerdere richtingen tegelijk gevoed en hij is in de powerrespons terug te vinden. Een smalle dip is een interferentie-uitdoving: hij is positie- en hoekafhankelijk, hij verplaatst zich met de luisteraar, en hij vult zich in een kamer grotendeels vanzelf. De literatuur over hoorbaarheidsdrempels van smalle filters zet de drempel voor dips consequent hoger dan voor pieken. Een ontwerp afkeuren op een dip die de luisteraar nooit op die plek hoort is dus strenger dan het gehoor zelf. **Er komt geen extra drempelveld voor:** het onderscheid zit in wat gerapporteerd wordt, niet in een getal dat de gebruiker moet raden.
   - **RELAXATIE-LADDER.** Levert de zoektocht geen (of minder dan N) winnaars, dan verruimt de engine in ZICHTBARE stappen uitsluitend de FALENDE SMAAK-eisen (SPL-venster, fase) tot N kandidaten passen. De uitkomst draagt een etiket: "voldoet aan ±2,25 dB — gestelde eis was ±1,5". **Beschermingsgrenzen (Z/EPDR, dissipatie, V@fs) worden NOOIT gerelaxeerd** — een ladder die er een aanraakt is een bug, geen feature, en de suite bewaakt dat. De ladder is een HER-FILTER op de al geëvalueerde kandidaten, geen nieuwe zoektocht: een ladder die opnieuw gaat scannen trekt de eisen alsnog de zoektocht in. Het etiket vermeldt daarom ook zijn eigen begrenzing ("binnen de gescande kandidaten; een fijner grid kan meer opleveren"). Is een eis principieel onhaalbaar — bijvoorbeeld een Z-eis boven de vloer die het drivercomplement zelf al zet — dan meldt de pre-design-diagnose dat VÓÓR de zoektocht, met het haalbare getal erbij.
   - **TWEETRAPS-STEMPELING.** De eisen raken de zoektocht niet, dus zij horen niet in de run-vingerafdruk (A5e.4). De shortlist-UITKOMST hangt er wél aan, dus die krijgt een eigen stempel — doelcurve, eisenwaarden, ladderstappen inclusief etiket, N, selectieversie — bovenop de vingerafdruk van de onderliggende run. Zelfde eisen op dezelfde run geven een byte-identieke shortlist; andere eisen op dezelfde run geven dezelfde run-vingerafdruk en een ander shortlist-stempel. Dat maakt "de selectie is aan de mens" reproduceerbaar én navertelbaar.
2. **Doelcurve-object — BESLOTEN bij F3 (26-08-2026): MINIMAAL. GESLOTEN bij V45 (30-08-2026): het niveau-anker.**

   - Referentie voor dag één is **vlak**. Het object kent een type-veld; `tilt` en `behoud-huidig` zijn GEDECLAREERD maar niet geïmplementeerd (TODO, geen gedrag). Een half werkende kanteling is erger dan een afwezige: hij zou stilletjes meedoen in elk venster- en RMS-oordeel.
   - **`bass-plateau` is er sinds V45 bij, en hij is de vorm die A5d.4(a) nodig had.** Twee parameters, met opzet uit tegengestelde bronnen (P6): de DIEPTE is GESTELD — hoeveel het on-axis laag bewust onder het anker ligt, een voicing-besluit over een opstelling dat geen meting kan opleveren — en de OVERGANG is GEMETEN: `baffleStepHz` van de kastbreedte uit de projectdata, en van niets anders. De VORM is de eerste-orde shelf die de app zelf al tekent (`baffleStepShelfDb`), geen tweede mening over baffle step. Ontbreekt een van beide helften, dan levert de curve GEEN offsets en noemt zij wat er miste (P4).
   - **Twee lezers, en dat is wat het besluit sluit.** (a) A5d.4(a) — het ankerniveau wordt NA baffle step genomen, dus de verankerde gaps vergelijken elke weg op haar eigen doelniveau in plaats van op haar kale gemeten niveau. Alleen VERSCHILLEN tussen wegen verplaatsen een anker. (b) De ZOEKTOCHT — de amplitudeterm meet sinds V45 de spreiding van (som − doel) in plaats van van de som. Zonder die tweede lezer verplaatst een gestelde voicing wél het oordeel (A5e.1) en niet de zoektocht, en de zoektocht heeft het hele iteratiebudget: dan wint zij, en het oordeel legt de nederlaag vast. Sleutelpaar `amplitudeReference` (CHOICE) en `amplitudeTargetDb` (POLISH).
   - De doelcurve hangt aan het **ONTWERP**, niet aan het project. Twee voicings van dezelfde luidspreker moeten naast elkaar kunnen bestaan en vergeleken worden; een projectbrede doelcurve maakt van "welke voicing wil ik" een instelling die je heen en weer moet zetten in plaats van een keuze die je naast elkaar legt.
   - Additief in het model: afwezig = vlak, en oude projecten laden ongewijzigd. Zodra het veld bestaat gaat het mee in het shortlist-stempel.
   - **Wat OPEN blijft:** `tilt` en `behoud-huidig` (optie C bij V45 expliciet uitgesteld), en op casus 1 de vraag of de gestelde plateaudiepte ooit gemeten kan worden — zij kan dat op deze meetset niet, en waarom staat in V45 en in `gestelde_eisen.basplateau_waarom_niet_gemeten`.
3. **Catalogus-schema.** Families met parasietmodellen (DCR/ESR-fits), verzadigings-/kernvlaggen, bouwvorm/formaat, prijs; en de regel dat **optimalisatiegrenzen uit de catalogus-spanwijdte volgen** — hardgecodeerde componentgrenzen zijn dezelfde P6-fout als hardgecodeerde frequenties.
4. **Determinisme — BESLOTEN bij F2 (26-08-2026).** Zelfde invoer + zelfde seed = byte-identiek resultaat. Het vastgelegde beleid:

   - **Elke run heeft een seed, altijd.** Het project mag er een opgeven; doet het dat niet, dan geldt een gepubliceerde standaardseed die in het resultaat wordt *gerapporteerd*. "Afwezig = uit" is de juiste regel voor een *grens* (P4) en de verkeerde voor een seed: uit zou hier "niet reproduceerbaar" betekenen, precies wat dit besluit moet uitsluiten. Een seed neemt aan geen enkel oordeel deel — hij kiest welk van meerdere gelijkwaardige startpunten bezocht wordt.
   - **Het budget is een projectinstelling en afwezig betekent écht afwezig:** het eigen iteratiebeleid van de tuner geldt, ongewijzigd. Een budget begrenst inspanning, nooit aanvaardbaarheid.
   - **Elk resultaat draagt een vingerafdruk, en die is een LIJST van benoemde componenten**, geen ondoorzichtige hash: enginetversie, schattertabel, seed, budget, aantal startpunten, ontwerp, meetset, actieve poorten, actieve budgetten met hun inversies, en de zoeksturende tuneropties. Twee runs die verschillen moeten kunnen zeggen *welke* invoer verschilde; één hash kan alleen "niet gelijk" zeggen.
   - **Geen klok, geen entropie, geen iteratievolgorde over een hashmap.** De enige randomness in het v2-pad is de spreiding van startpunten, en die komt uit een teller-gebaseerde generator met (seed, stroomnaam) als volledige invoer. Elke verzameling die het pad oplevert is gesorteerd op een *benoemde* sleutel; gelijkspel wordt gebroken op het startpuntnummer, nooit op invoegvolgorde.
   - **Kandidaatvolgorde is een ORDE, geen score.** De rangschikking gebruikt één vastgelegde geleverde grootheid. Zodra A5e.1 (normalisatie en aggregatie) genomen is, wordt de volgorde de zaak van dát besluit; tot dan is één reproduceerbare sleutel beter dan een gewichtsvector waar niemand mee heeft ingestemd.

   Implementatie: `src/lib/engine2/optimizer/determinism.ts`; acceptatie in `determinism.test.ts` (twee runs byte-identiek, andere seed bereikt aantoonbaar de zoektocht, en de vingerafdruk beweegt mee met *elke* component waaruit hij bestaat — component voor component doorlopen, niet steekproefsgewijs).
5. **Schatter-versionering.** Afgeleide parameters worden gecachet; elke extractor draagt een versienummer en een versiebump invalideert de cache en her-triggert de dekking- en golden-reference-tests. Zonder dit worden V8-verbeteringen stille gedragswijzigingen.

### A5e-horizon: open punten uit de kandidaatgeneratie (F4d en de nazorg)

Geen specificatiebesluiten in de zin hierboven — het zijn afgebakende, benoemde openstaande
punten met een casusboek-entry erachter. Ze staan hier zodat ze niet alleen in Deel B leven.

- **`diAnchor` als tweezijdige doelband in `xoWindow.ts`** — de énige v1-mechaniek die F4d
  bewust niet overnam en waarvan F4d zelf zegt dat hij spijt doet. DI-continuïteit is een echte
  A5d.3-voorkeurszone en hoort in het VENSTER thuis (A4 M-G: *"de snijzone van de twee
  D(f)-curven wordt dan een tweezijdige doelband"*), niet als losse extra kandidaat naast het
  venster. `xoWindow.ts` kent die zone nog niet; tot dan sturen de vensters de generator en
  wordt de DI-match alleen gerapporteerd. Zie V27, dekkingstabel 1.
- **~~Rij 38 — het ketenraster begint op 200 Hz~~ — GESLOTEN bij V32 (27-08-2026).**
  Het raster is NIET verplaatst, en dat blijft de juiste keuze: het is `sim`, élke grafiek op dat
  scherm tekent erop uit, en zijn bodem is waar de VERRE-VELDMETINGEN van deze set beginnen — een
  respons die niet gemeten is, wordt niet beoordeeld. Wat wél moest veranderen is wie er nog op
  oordeelde. Sinds V32 geldt: **het raster wordt niet verplaatst; geen poort of inversie oordeelt
  er nog op.** De inventarisatie die dat hard maakt staat in V32 met bestand:regel — vier poorten
  (M-A, M-B/EPDR, M-B/|Z|, M-C), de hoogdoorlaatbeschermings-afleiding en de
  doorlaatband-impedantiemediaan die twee A5d.6-inversies voedt, alle zes verhuisd naar de gemeten
  impedantiesweep, uit één gedeelde functie die het paneel óók gebruikt. Wat op het ketenraster
  blijft is precies wat erop hoort: de kruispunten en elk responsoordeel.
- **V28 — mag een uitsnijding het kandidaatveld vormen, en zo ja op grond waarvan?** De
  F3c-uitsnijding stuurde het veld met een λ-fractie op één c-t-c-afstand, wat V20a verbiedt;
  zij is opgeschort en het veld dekt nu het hele venster. De drie uitkomsten die openstaan
  (verwerpen / herbouwen op de verticale synthese / behouden als doorsnede van de vier
  V20-fracties) staan in de entry. **Open.**
- **~~Casus 1 heeft geen versterkervloer~~ — GESTELD op 27-08-2026 (2,6 Ω, V30);
  ~~de vloer is een veto en geen zoekdoel~~ — GEREPAREERD dezelfde dag, in een eigen sessie.**
  De vondst stond: `zFloorBarrier` werd alleen door de reparatiepas gezet, dus de zoektocht die
  de topologie en de waarden koos wist niet dat er een vloer was. Sinds de V30-vervolgsessie is
  `zFloorBarrier` een OPTIE van `NetOptimizeOptions` (default `false`, dus de v1-route en de
  toggle-invariant zijn byte-onaangeraakt) en op de v2-route een KEUZE-sleutel die de kandidaat
  wapent zodra er een vloer gesteld is. Gemeten op hetzelfde veld met dezelfde seed: van nul naar
  **elf van vijftien** die de vloer halen, shortlist van 0 naar 10, en de vlakheid ging mee omhoog
  in plaats van omlaag (RMS 2,96–3,58 → 1,71–1,96 dB). De prijs zit in de fasetracking. Wat
  hieruit openbleef staat als **V31** (vier kandidaten worden door de veiligheidspoort in hun
  geheel verworpen en leveren hun zaad) en **V32** (de v2-poortreferentie is blind onder 200 Hz).
  **Beide zijn dezelfde dag gerepareerd, in één sessie**: een verworpen kandidaat levert sinds V31
  een VERWERPING met de regel die hem weigerde in plaats van zijn zaad, en elke elektrische poort
  oordeelt sinds V32 op de gemeten impedantiesweep in plaats van op het ketenraster. Wat V31 NIET
  heeft opgelost is de arbitrage zelf — de afruil tussen de versterkervloer en de
  tweeterbescherming is nog steeds een alles-of-niets-veto, en de meting die daarover zou
  beslissen is nog steeds niet gedaan.
- **~~V33 — de doelfunctie kan niet mikken op wat de poort sinds V32 handhaaft~~ — GESLOTEN op
  27-08-2026, in een eigen sessie.** De vondst stond: de barrièreterm las `zShortOhm` van het
  EVALUATIERASTER terwijl de poort sinds V32 op de volle gemeten sweep handhaaft, en op de
  396,7 Hz-as weigerde de poort daarom een tune die de zoektocht niet had kunnen vermijden.
  Sinds V33 is de BRON van die grootheid een KEUZE-sleutel met drie waarden
  (`zFloorBarrierSource`: `'grid'` = default en dus v1 byte-onaangeraakt, `'safety'` = de
  v2-route, `'sweep'` = het poortraster zelf). Alle drie lezen door dezelfde functie
  (`minImpedanceAt`, die `epdr` — en dus de poort — sinds V33 ook gebruikt): het raster is een
  parameter, geen tweede implementatie. Op `'sweep'` is doel = poort een IDENTITEIT en assert de
  suite dat met `toBe`; de v2-route stelt `'safety'`, dat dezelfde uitgestrektheid heeft en
  alleen grover is, en dáár is de rechtvaardiging een meting: het verschil tussen beide lezingen
  is op het levende corpus 0,0075 Ω tegen een vloerspeling van 0,0520 Ω, en op géén enkele
  bevroren netlist vellen de twee rasters een ander oordeel over de vloer. Reden om niet de
  identiteit te nemen: die maakt van een casus-1-ketenrun elf minuten in plaats van één.
  Tweede helft: een poort die de hele waardetune weigert levert sinds V33 een VERWERPING met de
  regel die weigerde, in de V31-vorm en in één geharmoniseerd veld, in plaats van een ongetuned
  zaad dat als ontwerp leest. Wat de inventarisatie daarnaast opleverde staat als **V34**
  (de bronweerstandsprobe leest de rand van zijn eigen zoekvenster, met een doel én een
  diskwalificatie eraan). Zie V33 in Deel B.
- **~~V34 — een DOEL en een DISKWALIFICATIE lezen nog steeds het ketenraster, op een frequentie
  die de rasterrand aanwijst~~ — GESLOTEN op 28-08-2026, in een eigen sessie.** De vondst stond,
  en zij is nagemeten: op casus 1 landt de probe op `grid[24] = 640,2 Hz` — de BOVENrand van zijn
  eigen zoekvenster — terwijl dit wooferpaar bassreflex is en zijn twee impedantiepieken op 17 en
  51 Hz liggen, allebei onder een raster dat op 200 Hz begint. Twee reparaties, één entry, en dat
  is geen bundeling maar een noodzaak: elk van de twee is in zijn eentje slechter dan geen van
  beide. (1) De bewaking is een echte bewaking geworden — `ProbeEdgeRule`, `'first'` = de
  historische regel en dus v1 byte-onaangeraakt, `'both'` = elke rand — en de probe leest op de
  v2-route het VEILIGHEIDSRASTER (`rSourceProbeSource`, keuze-sleutel met `'grid'` als default).
  (2) De 2,0 Ω-diskwalificatie en de 1,0 Ω-audittier zijn op de v2-route INGETROKKEN: casus 1
  stelt geen bronweerstandseis, dus de kandidaat draagt er geen (P4). Waarom samen: op 640 Hz
  lezen de drie v1-baselines 0,50/0,47/0,68 Ω, op de echte piek 3,98/4,59/2,55 Ω — alleen de
  probe repareren zou de eigen referentiefilter van de ontwerper hebben gediskwalificeerd op een
  grens die niemand heeft gesteld. Beide getallen hebben nu één huis met een motivering
  (`partAudit.ts`), langs dezelfde weg als `ampMinLoadOhm` bij F0. Zie V34 in Deel B.
- **V35 — de terugval van de probe neemt de PIEK, en op een bassreflexkast is de afstemming het
  DAL.** Sinds V34 leest de bronweerstandsprobe op de v2-route het veiligheidsraster en landt hij
  op een echte resonantie (51,5 Hz op casus 1) in plaats van op een venstergrens. Maar wat
  `rSourceDisqualifyOhm` en de dissipatieterm willen weten is de demping BIJ de boxafstemming, en
  dit wooferpaar heeft twee pieken (17 en 51 Hz) met het dal — de werkelijke poortafstemming,
  ~31 Hz — ertussen. Twee mogelijke uitkomsten, geen van beide genomen: (i) **de ontwerper stelt
  f_b** — het veld bestaat (`audit.fbHz`), casus 1 vult het niet, en dan is dit een P4-vraag en
  geen enginevraag; (ii) **de terugval leidt de kastsoort af uit de kromme** (twee pieken met een
  dal ertussen ⇒ bassreflex ⇒ neem het dal). Die tweede verandert de uitkomst van élke bestaande
  run met een bassreflexwoofer en verdient dus dezelfde behandeling als V30, V32, V33 en V34: een
  eigen sessie met een vóór/ná-meting. Tot dan heet de aflezing wat zij is — "de bronweerstand bij
  de bovenste impedantiepiek van de laagste weg" — en zegt `rSourceProbeNote` dat hardop. Zie V34
  in Deel B. **Open.**
- **~~V36 — waar leest de dissipatieterm zijn probe, en wat bewaakt dissipatie nog?~~ — GESLOTEN op
  28-08-2026, in een eigen sessie.** Twee gedaanten waren mogelijk en het was geen van beide: de
  term is niet ingetrokken (dat zou A3j schenden — `dissipationWeight` is grijs en wordt expliciet
  overgenomen) en hij is niet dood door een randweigering (dat zou V33 in een vierde gedaante
  zijn). Hij leest sinds V34 hetzelfde raster als élke andere lezer van diezelfde probe. De
  bevinding is een andere: hij is **te klein om iets te beslissen** — hoogstens 0,34 % van de
  objectiefwaarde op het levende casus-1-corpus, tegen een uitdagingsdrempel van 1 %, en dat gold
  vóór V34 net zo goed. Wat er wél is gebouwd: de shortlist toont naast de dissipatieFRACTIE nu de
  WATT in de grootste enkele weerstand bij het gestelde vermogen — een kolom, geen criterium, met
  een assert dat een veld waarin één kandidaat 95 % verstookt een byte-identieke lijst oplevert.
  Geen regeneratie: er is geen regel in de zoektocht veranderd. Zie V36 in Deel B.
- **~~V37 — de dissipatieterm deelt door de PIEKHOOGTE en niet door R_e~~ — GESLOTEN op
  28-08-2026, in een eigen sessie.** De vondst stond en de controle die V36 voorstelde is de
  acceptatie geworden. De term bestaat om de serie-R-route naar niveauregeling af te remmen, en de
  schade die zij aanricht is Q_es-vermenigvuldiging: `1 + R_source/R_e`, met R_e de DC-weerstand
  (A3j rij 23, A4 M-E). Hij deelde echter door `Re(Z)` BIJ de bronweerstandsprobe, en sinds V34 zit
  die probe op de impedantiepiek van de laagste weg: gemeten 19,31 Ω tegen een gemeten R_e van
  3,05 Ω — een factor 6,33 die tot **40,1** kwadrateert. Sinds V37 is de NOEMER een KEUZE-sleutel
  met twee waarden (`dissipationReferenceSource`: `'probe'` = default en dus v1 byte-onaangeraakt,
  `'re'` = de v2-route), met de opgeloste R_e ernaast als polish-sleutel
  (`dissipationReferenceReOhm`) in precies de vorm die V33 voor de barrière koos. De R_e is
  dezelfde die M-E publiceert en die de Q_es-inversie gebruikt — één R_e, één herkomst, sinds V37
  drie lezers (F4b lek 1). Geen terugval: een genoemde bron zonder opgeloste R_e levert géén
  verhouding en meldt welke invoer ontbrak, precies zoals bij V32, V33 en V34. De acceptatie is de
  referentie zelf: `1 + R_source/R_e` reproduceert de `Qes_mult`-referenties van élke bevroren
  netlist binnen hun tolerantieklasse (grootste afwijking 0,36 % tegen een klasse van 5 %) en de
  piekhoogte doet dat aantoonbaar niet (minstens 18 % ernaast op élke netlist die werkelijk
  serieweerstand draagt). Het gewicht is NIET bijgesteld, en dat is een besluit met dezelfde
  volgorde als bij V36: eerst de noemer, dán pas de vraag of het gewicht klopt. Zie V37 in Deel B.
- **V38 — de zoektocht gladt de drivermagnitudes en niet hun fase, en op casus 1 is dat het hele
  gat naar de referentiefilter van de ontwerper.** Gemeten in een meetsessie zonder één
  gedragswijziging. `smoothMag` in `netOptimizer.ts` gladt de magnitudes met `errorSmoothOct`
  (1/12 octaaf, de app-standaard) vóór de decimatie, laat de fase ongemoeid, en sommeert de
  takken dan complex. De zoektocht ziet daardoor een som met een kenmerk van 43–47 dB waar de
  geleverde luidspreker 4–6 dB rimpelpiek heeft. Eén sleutel op 0, alles verder gelijk: HUIDIG's
  eigen topologie gaat van 2,98 naar **0,53 dB** RMS — onder HUIDIG's eigen 0,60 — en op twee
  gegenereerde kandidaten van 3,22 naar 1,83 en van 2,08 naar 1,53, waarbij de eerste ook van
  0,68 Ω (een bijna-kortsluiting onder de gestelde vloer) naar 2,59 Ω gaat. De
  ene-sleutel-vergelijking is in beide richtingen in twee onafhankelijke runs gemeten en is
  symmetrisch tot op de decimaal. **Geen bug-melding en niets gerepareerd:** `errorSmoothOct` is
  gedocumenteerd gedrag, staat als POLISH geclassificeerd (A3j) en F3c bouwde er al een
  zichtbaarheidsnotitie voor. Wat V38 toevoegt is de maat. Vier vormen liggen open — laten staan
  met een scherpere notitie; de fase meegladden zodat de gegladde som een echte som blijft; de
  bron een kandidaat-sleutel maken zoals bij V33/V34/V37; of alleen de zoekmaat gladden en de
  leveringsmaat niet — en het verdient dezelfde behandeling als V30, V32, V33 en V34: een eigen
  sessie met een vóór/ná op het hele veld. Zie V38 in Deel B. **GESLOTEN door V38-fix**, met één
  correctie op de zin hierboven: de 43–47 dB komt NIET van de ontkoppeling van magnitude en fase.
  Die bestaat en is meetbaar, maar zij draagt op élke van tachtig bevroren netlists hoogstens
  6 % van de echte rimpelpiek. Wat de 43 dB draagt is de STILLE GEEST net buiten de beoordeelde band: het
  ketenraster loopt tot 20 kHz, de gemeten uitgestrektheid van alle drie de wegen houdt op bij
  19 053,6 Hz, en een gladdingskern van 1/12 octaaf reikt over die rand heen en trekt het laatste
  punt bínnen de band van 130,95 naar 43,67 dB. Dat is nagemeten door óók ná de sommatie te
  gladden — waar geen enkele ontkoppeling bestaat — en hetzelfde getal te krijgen. Daarmee is
  vorm (ii) en (iv) weerlegd in plaats van gekozen: de reparatie is 0. **Wat er open blijft staat
  in de V38-fix-entry en is niet klein:** de v1-route leest die maat nog steeds, en de acceptatie
  ontsnapt er niet aan door haar breedte of haar volgorde maar doordat haar RASTER geen dood punt
  draagt. De naad tussen zoeken en oordelen is dus breder dan V38 hem beschreef.
- **V40 — de twee fasematen bewegen tegengesteld op hetzelfde netwerk, en niemand weet welke de
  luidspreker beschrijft.** Op HUIDIG's zaad zijn zij het eens (tuner 22,28°, rapport 23,83° voor
  W-M). Op het netwerk dat dezelfde run aflevert lopen zij uiteen in tegengestelde richting: de
  tuner leest 9,65°, het rapport 47,68°. Nagemeten dat het niet de band is — beide netwerken
  worden op 397–715 Hz geoordeeld met 42,95 % dekking. Op de ongegladde maat van V38-fix wordt
  het gat niet kleiner maar groter (tuner 11,00°, rapport 53,09°), dus de reparatie van de
  zoekmaat neemt het niet weg. Zolang dit staat is "de tuner kocht fase" een uitspraak in de
  eenheden van de tuner en niet in die van het rapport, en elke afruil die op fase verdedigd
  wordt draagt die onzekerheid mee. **Beslisroute, genoteerd en niet gelopen:** exporteer één
  netlist in beide toestanden naar VituixCAD (de exportbrug bestaat en schrijft
  `MinimumPhase=True` plus de gemeten tweeter-Δ als `Delay`), en laat de fasetracking dáár
  oordelen. De maat die VituixCAD reproduceert beschrijft de luidspreker; de andere beschrijft
  een conventie. **Open**, geen implementatie in de V38-fix-sessie. **V41 heeft de beslisroute
  GELOPEN maar niet beslist**, en het bewijsmateriaal maakt de vraag scherper dan zij hierboven
  staat: `measure-v40-phase.ts` rekent één formule over beide banden en de tunerkolom reproduceert
  daarmee EXACT, de rapportkolom binnen ongeveer een graad. De twee maten zijn dus dezelfde
  formule, het raster draagt hooguit een graad, en **het hele gat is de BAND** — het
  overlapvenster van de tuner (|Δniveau| ≤ 20 dB) is niet op meetgeldigheid geknipt en reikt op
  `466,5 · 1491,4` tot 200 Hz, een vol octaaf onder de vloer waarop het rapport knipt (59,15°
  tegen 17,05° op dezelfde formule). Welke band de juiste VRAAG stelt is beleid en geen meting;
  drie VituixCAD-projecten staan klaar in `test-fixtures/casus1/v40_vituix/`. Zie V40 in Deel B
  voor de leesinstructie en voor wat elke uitkomst intrekt.
  **GESLOTEN door V44 (30-08-2026), en het antwoord is GEEN VAN BEIDE.** De ontleding
  punt-voor-punt (`measure-v40-overlap-band.ts`) laat zien dat allebei de verzamelingen een
  gemeten defect dragen, en dat de twee defecten haaks op elkaar staan. De tuner middelde over
  het hele casusboek 1047 punten mee die het rapport niet zag — 911 daarvan onder de
  meetgeldigheidsvloer die de meetbestanden zélf opgeven, 14 op punten waar BEIDE takken dood
  waren en het faseverschil dus uitsluitend van de filters kwam. Het rapport middelde over punten
  waar één tak dertig dB weg was en zijn fase de som niet kon bewegen (op `V28_KAND_1` M-T
  dertien punten van gemiddeld 146°, wat 90,7° opleverde waar de som 29,7° zag). De maat is
  daarom hun DOORSNEDE geworden — M-K in A4, met elke uitsluiting op een bestaande doctrine en
  één implementatie (`lib/phaseAdmission.ts`) die de tuner én de rapportlaag lezen. Beide oude
  maten blijven als benoemde controlekolommen staan. Zie V44 in Deel B, en daar ook de
  leesinstructie voor de fase-kolommen van V30 tot en met V43.
- **V39 — de toetsbaarheid van A3j houdt één laag te laag op.** `CHOICE_KEYS`/`GREY_KEYS`/
  `POLISH_KEYS`, de volledigheidsassert en `choiceKeyGuard.test.ts` dekken de 44 sleutels van
  `NetOptimizeOptions`. `Chain3Settings` — ongeveer 32 sleutels, en de laag waar de kandidaat
  langskomt vóórdat de tuner iets ziet — is nergens geclassificeerd. Twee instellingen die op
  casus 1 aantoonbaar de TOPOLOGIE bepalen vallen daardoor buiten elke garantie: `eqBands` (de
  app stelt 2, de v2-fixture stelt niets, en een EQ-band is de enige weg naar een breakup-val)
  en `leanTargetDb`, die niet eens een sleutel IS maar binnen de keten wordt afgeleid uit
  `targets.rippleDb` — een kandidaat kan hem principieel niet stellen. Gemeten: de kale ladder
  haalt de daaruit volgende 2,5 dB-drempel op 45 van de 45 takken en de eigen standaard van
  0,5 dB op 0 van de 45, dus er wordt nooit een Zobel, Fs-val of top-octaaf-hold gekocht. Zie
  V38 in Deel B, beslislijst B–D. **GEDEELTELIJK GESLOTEN door V41**, en de scheiding is het
  punt: die twee sleutels zijn nu kandidaat-gedragen (`CHAIN_CHOICE_KEYS` in `chainChoices.ts`;
  `leanTargetDb` IS sindsdien een sleutel), en de LAAG is dat nadrukkelijk niet. V41's lijst dekt
  twee van de ongeveer tweeëndertig en zegt dat zelf hardop — de norm die rij 11 van de
  A3j-tabel stelt is dat een classificatie beweegt wanneer een MÉTING haar beweegt, en voor de
  andere dertig is er geen meting. **De rest blijft open**, en V41's fixture-inventarisatie voegt
  er twee concrete posten aan toe:
  · **`audit.fbHz` steekt de grens niet over.** Bij de tuner is dat geen decoratie maar het
  ANKER van de bronweerstandsprobe (`netOptimizer.ts:1574`) én de referentiefrequentie van de
  dissipatieterm (`:1823`). Casus 1 KENT een kastafstemming — `afgeleide_parameters.woofer.fb`
  = 31,3 Hz — maar dat is een afgeleid MEETFEIT en geen ontwerpersinstelling, en het bereikt de
  tuner nergens. Dezelfde vorm als F4b's lekken, één grootheid verder; V34 en V37 verdienen er een
  vóór/ná op.
  · **`costWeight` staat in de v2-fixture op de legacy-default van de tuner (0,0015) waar de
  app 0,015 stuurt.** Aantoonbaar inert op casus 1 — de tuner leest hem uitsluitend binnen
  `if (opts.catalogSnap && hasImportedCatalog())` en deze casus snapt niet — maar hij is GRIJS
  (A3j), en juist een grijze sleutel hoort expliciet én juist gesteld te worden.
- **V42 — hoe begrens je de BRONIMPEDANTIE bij resonantie zonder de versterkervloer te breken?**
  Het LF-bult-budget (A4 M-D) is sinds V42 een gestelde eis en voedt de A5d.6-inversie
  `bump-series-l`, die sindsdien de SOM van de seriespoelen plafonneert in plaats van elke spoel
  apart — zeven van de acht V41-netlists droegen er twee en ontsnapten aan de per-component-versie.
  Wat de meting daarna opleverde is een NEGATIEF resultaat en het staat voluit in V42: het veld
  ging van 8 naar 4 netlists en geen enkele overlevende veranderde — alle vier byte-identiek aan
  hun voorganger, alle vier nog steeds boven het budget. De oorzaak is natuurkunde en geen bug:
  `H_el = Z/(Z + R_pad + jωL)`, dus serieweerstand tilt de reflexpiek in zijn eentje al op
  (dezelfde natuurkunde als M-E's Q_es-vermenigvuldiging), en boven ~1,7 Ω padweerstand is het
  budget op vóór er een spoel in het pad zit — `maxSeriesInductanceFromBump` geeft dan `null` en
  er komt geen grens (V12). Zes van de negen bevroren netlists zitten daar, HUIDIG (3,76 Ω)
  inbegrepen. Waar de grens WEL bond brak zij de versterkervloer: vier kandidaten met de beste
  RMS van het project (0,48–0,54 dB) kwamen terug op 1,93–2,41 Ω tegen een vloer van 2,60. **De
  twee gestelde eisen trekken aan hetzelfde onderdeel.** Drie richtingen liggen open en geen ervan
  is gebouwd: een parallelweerstand over de seriespoel, een LCR-dempingsnetwerk over de driver op
  f_p, of de eis uitdrukken als één grens op `R_pad + jωL` samen — dat laatste is een tweede
  inversie en geen topologievoorstel. Bewijsmateriaal: `scripts/measure-v42-bump-bound.ts` en
  `manifest_en_geometrie.v42_bult_bevinding`. **Open**, Sander beslist welke richting de generator
  mag voorstellen. **GESLOTEN DOOR V43**, en niet met een topologievoorstel maar met de
  vaststelling dat de vraag verkeerd gesteld was. M-D levert sinds V43 naast `extraDb` ook
  `liftDb` (wat het resistieve equivalent van hetzelfde netwerk alleen al doet) en `resonantDb`
  (wat de reactanties daar bovenop leggen), en zij tellen per constructie op tot `extraDb`. De
  gemeten conclusie: wat V42's budget veroordeelde was op alle drie de referentiefilters de
  LIFT — HUIDIG 4,69 dB lift tegen −0,94 dB opslingering — en dat is niveauwerk, geen spoel. De
  eis staat sinds V43 op `resonantDb` alleen, met een op de vuistregel herijkt getal (1,4 dB), en
  de lift krijgt géén eigen budget: die is ankerdomein en hoort bij A5e.2 (doelcurve plus
  dempingsmarge) — **gesloten bij V45**, waar dat domein zijn eigen mechanismen kreeg in plaats
  van een tweede budget op deze grootheid. **Optie 3 van V42 — één grens op `R_pad + jωL` samen — is daarmee expliciet
  vervallen:** zij herkoppelt precies wat de ontleding gescheiden heeft. De LCR- en
  parallel-R-voorstellen (opties 1 en 2) zijn niet weerlegd maar ook niet meer nodig om de eis
  werkzaam te krijgen; zij blijven beschikbaar als de zoektocht de spoel op de nieuwe grens
  onvoldoende kan krijgen. Bewijsmateriaal: `scripts/measure-v43-decomposition.ts`,
  `manifest_en_geometrie.v43_ontleding`, `.v43_inversie_bevinding` en `.v43_budget_bevinding`.
- **V45 — drie open punten uit het ankerbesluit, alle drie GEMETEN en geen ervan gebouwd.**
  · **Het STALE PLAFOND van `bump-series-l`.** De inversie lost haar plafond op bij de
  padweerstand van het ZAAD en daarna ligt het vast, terwijl de zoektocht die padweerstand vrij
  mag verhogen — en meer serieweerstand DEMPT de resonante helft, dus het plafond is conservatief
  en niet fout. "Conservatief" is niet hetzelfde als "veilig", en dat verschil was ongemeten.
  Sinds V45 wordt het GELEVERDE netwerk op `resonantDb` tegen hetzelfde gestelde budget getoetst
  (V31-vorm, `by: 'stated-budget'`), zodat het stale plafond hoogstens te streng kan zijn en nooit
  een schending kan doorlaten. De inversie iteratief heroplossen tijdens de tune is een eigen
  sessie — het vraagt een netwerkoplossing per evaluatie — en of hij nodig is, is nu meetbaar: als
  die toets nooit vuurt, kost de staleness niets. **Open, en de meting loopt vanzelf.**
  · **De Q_es-eis is strenger dan haar eigen metriek op elke netlist met een shunt.** De eis is
  uitgedrukt in M-E (`q = 1 + R_s/R_e`, met R_s de Thévenin-bronweerstand op f_p), maar de
  A5d.6-inversie kan alleen de DC-SERIEWEERSTAND van het pad begrenzen — dat is het enige wat in
  een zoekruimte staat. Die twee lopen naar BEIDE kanten uiteen: waar de weg reactantie draagt
  leest M-E hoger (HUIDIG +0,08), waar een shunt over de driver staat leest hij LAGER
  (`V43_KAND_1`: 2,17 Ω tegen 4,46 Ω padweerstand, q 1,71 tegen 2,46). Gevolg: de eis kan een
  ontwerp weigeren dat M-E zou goedkeuren. Dat is de veilige kant, en dezelfde vorm van
  benadering als het stale plafond hierboven — de reparatie is dezelfde soort sessie. **Open.**
  · **De gestelde plateaudiepte is niet gemeten en kan dat op deze meetset niet worden.** De
  ver-veldgeldigheidsvloer ligt bijna drie octaven boven f_p, de wooferbestanden zijn geen
  NF/FF-merge, en een merge zou de baffle-step-diepte moeten AANNEMEN die de eis juist bedoelt.
  **Open tot er een groundplane- of near/far-gemergede meting is die het laag werkelijk ziet**;
  dan wordt het getal herzien. Bij verplaatsing van de luidsprekers wordt het sowieso herzien.
- **V29 — mag `safety` een netlist weigeren die vrijwel kortsluit als er géén vloer gesteld is?**
  Twee verdedigbare houdingen (strikt P4 tegenover een uit de gemeten driverimpedanties
  afleidbare degeneratiegrens), aanleiding is de V28-shortlist met 0,01 Ω erin. **Open**, geen
  besluit genomen.

## A6a. Ontwerp-pijplijn (werkvolgorde per project)

De klassieke handmatige volgorde luidt: (1) impedantie lineariseren — Zobel op stijgende Le, LCR op resonantiepieken; (2) kruispunten en hellingen kiezen; (3) secties van onder naar boven ontwerpen; (4) niveaus padden; (5) fase/polariteit controleren; (6) voicen. Die volgorde bestaat omdat élke stap de volgende handmatig rekenbaar maakt: een geresistiveerde belasting laat tekstboekformules kloppen, vaste kruispunten ontkoppelen de secties.

In een meetgedreven, gezamenlijk optimaliserende engine vervalt die reden — en erger: **sequentieel optimaliseren van gekoppelde doelen is schadelijk.** Kruispunt, fase en SPL zijn één gekoppeld probleem (vensterinteractie, fase-doorkoppeling), en het casusboek bevat het bewijs uit eigen huis: een amplitude-optimizer die ná een fase-optimalisatie draaide vernietigde de fasetracking. De v2-volgorde scheidt daarom niet de *doelen* maar de *beslislagen*:

1. **Opname & geldigheid** — manifest, geometrie, afgeleide parameters, dekkingskaart (A5).
2. **Pre-design** — verankerde gevoeligheidsanalyse, haalbare kruisvensters met koppelingsindicatoren, orde-afleiding per flank, meetafgeleide zoekruimtegrenzen (A5d). Uitvoer: structuurbeslissingen en een rapport van spanningen, vóór er iets ontworpen is.
3. **Topologie-sjabloon** — inclusief compensatienetwerken als *kandidaten met bestaansrecht-toets*: een Zobel wordt voorgesteld waar de gemeten Le-stijging de LP-knie in reikt; een LCR waar een resonantiepiek nabij een filterknie ligt **én** de componentwaarden bouwbaar zijn (de bouwbaarheidstoets uit V3: op lage f_s exploderen de waarden). Nooit standaard: de solver kent de echte belasting al, dus compensatie moet zijn plek verdienen via poorten en doelen, niet via de gewoonte "eerst vlak maken".
4. **Gezamenlijke waarde-optimalisatie, dan het TOELAATBARE GEBIED** — kruispunten, fase én SPL in één doelfunctie, binnen poorten en grenzen. Nooit na elkaar. *Herijkt bij F3 (A5e.1):* de uitkomst van deze stap is geen winnaar maar een VERZAMELING. Elke gescande kandidaat wordt tegen de actieve eisen en poorten gehouden; alles wat slaagt is toelaatbaar, en daaruit komt een gediversifieerde shortlist (topologie-klasse eerst, dan afstand in genormaliseerde componentruimte). Slaagt er niets, dan verruimt de relaxatie-ladder in zichtbare stappen uitsluitend de falende smaak-eisen — nooit een beschermingsgrens — en draagt de uitkomst het etiket dat zegt waaraan zij wél voldoet. De keuze uit de shortlist is een mensbeslissing; de engine levert het veld, niet het oordeel.
5. **Snapping, robuustheid, rapport** — discrete catalogus, worst-case, Monte-Carlo, dekkings- en afruioverzicht.
6. **Bouw-QC** — systeem-impedantievingerafdruk tegen de simulatie.

Registervermelding: de klassieke volgorde-regels zijn ✅ als *sjabloon-heuristieken* (stap 3) en ❌ als optimalisatievolgorde (stap 4).

## A6. Fasering

Elke fase één ononderbroken implementatiesessie groot, met acceptatie via het casusboek (Deel B). Volgorde bindend.

**F0 — voorwaarde.** Lopende sanering van de oude impedantie-ondergrens afronden (raakt dezelfde codepaden). *Acceptatie: suite groen, geen verwijzing naar de oude constante.*

**F1 — Metriekbibliotheek + SPL-extractoren, alleen rapporterend.** Losgekoppeld van de optimizer; rapportpaneel per geladen filter, inclusief "uit — invoer ontbreekt". Solver uitbreiden met elementstromen. *Acceptatie: alle golden references uit het casusboek binnen afronding gereproduceerd; eenheidstests per metriek tegen handberekeningen.*

**F2 — Poorten M-A/M-B/M-C in de engine.** Grenzen per project instelbaar; grenshandhaving in de polish structureel. *Acceptatie: geen kandidaat schendt een actieve poort; de poort-ontwijkingsregressies uit het casusboek falen niet meer.*

**F3 — Zachte doelen M-D t/m M-H + invoerbeheer.** Instelbare gewichten, drempelloos; projectvelden volgens het geometriemodel A5a (bronnenlayout, meetopstelling, kastgeometrie) plus R_e; zichtbaarheidsregel P4; kruispunt-vensters. *Acceptatie: casusboek-rangordes gereproduceerd; bij ontbrekende invoer aantoonbaar inactief én gemeld.*

**F4 — Parasietkoppeling + robuuste snapping.** Catalogus-DCR/ESR-modellen; exacte samenstellings-parasieten; worst-case over de instelbare onzekerheidsband; Monte-Carlo eindrapport; snoeiregels. *Acceptatie: de naald-optimum-regressie uit het casusboek wordt door de engine zelf gevangen.*

**F5 — Meetsessie-koppeling.** Elk filterontwerp gekoppeld aan een meetsessie-ID; waarschuwing bij mismatch (baffle-/positiewijziging invalideert het filter — procesregel uit het vak). *Acceptatie: laden van een filter bij afwijkende sessie geeft zichtbare waarschuwing.*

**F6 — verkennend, apart besluit: topologievoorstellen.** Gerichte inserties (serie-L, L-pad, shunt-demping, ordewissel) door de volledige pijplijn geëvalueerd; waarden-optimalisatie kan deze klasse verbeteringen principieel niet vinden. Starten na ervaring met F1–F5.

## A7. Teststrategie

- **Casusboek als regressieset.** Elke gevalideerde casus (Deel B) levert golden references die elke build moet reproduceren. Het casusboek groeit met elk project; de specificatie verandert er niet door.
- **Dode-knop-test.** Voor elk gewicht en elke grens een geautomatiseerde sweep die aantoont dat de uitvoer verandert.
- **Grenzen-assert.** Elke run eindigt met een controle dat alle parameters binnen hun grenzen liggen.
- **P6-lint.** Reviewregel: geen letterlijke frequenties/waardes in metriekcode die niet herleidbaar zijn tot een afleiding of een projectinstelling.
- **Nieuwe-meting-test.** Neem een casusboek-meting, verschuif synthetisch f_s of voeg een breakup-piek toe, en assert dat alle afgeleide parameters en banden meebewegen. Dit bewijst per build dat de regels op data werken en niet op onthouden constanten.
- **Synthetische grondwaarheid-casussen.** Genereer meetsets uit bekende modellen (T/S + kast + kolben-directiviteit + gekozen gate): de extractoren moeten de bekende parameters exact terugvinden. Dekt de eenzaam-datapunt-zwakte van afleidingsregels (zie V3-kanttekening) zonder op nieuwe echte projecten te wachten, en levert casussen voor systeemtypes die het casusboek nog mist (gesloten sub, 2-weg, filler-topologie).
- **Dekkingstest.** Vervang in een casusboek-project een meting door een variant met kortere/langere venstertijd en assert dat (a) de geldigheidsintervallen meebewegen, (b) elke metriek zijn dekking herrapporteert, en (c) de optimizer-kostenfunctie aantoonbaar geen samples buiten de geldige band gebruikt.

## A8. Risico's en niet-doelen

- Metriek-inflatie: register-formaat is verplicht; geen complete rij, geen opname.
- Rekentijd: Thévenin kost twee extra solves maar alleen rond resonanties; worst-case is de duurste stap — profileren vóór optimaliseren.
- Niet-doel: vuistregels afschaffen. Ze blijven in het rapport als duiding naast de berekende waarde, zodat de dialoog met de gemeenschap aansluitbaar blijft.
- Niet-doel: app-defaults (P4).

---

# DEEL B — Casusboek (projectspecifiek, zijlijn)

*Dit deel valideert Deel A en levert de golden references. Niets hieruit mag terugvloeien als standaardwaarde.*

## Casus 1 — Koan 2951 (meetdata 22-08-2026, analyses 25-08-2026)

Configuratie: 3-weg; 2× SB WO24TX-8 parallel, MR13TX-4 in bolpod, T25T-6 in WG104-waveguide; c-t-c W1-W2 275,8 mm, W2-M ~261 mm, M-T 129,2 mm; z-offsets −601,6/−325,9/−64,6/+64,6 mm; gate 5,021 ms.

**Golden references (drie kandidaten):**

| | HUIDIG 2e orde | KAND-A 2e orde | KAND-B 3e orde |
|---|---|---|---|
| W-M / M-T fase ±1 okt | 19,8° / 7,1° | 2,8° / 3,6° | 1,3° / 3,5° |
| min\|Z\| / min EPDR | 3,46 / 1,73 Ω | 3,32 / 1,66 Ω | 3,44 / 1,72 Ω |
| M-A: totaal / grootste R | 46% / 25,5 W | 53% / 30,9 W | 39% / 19,7 W |
| M-C tweeter @ f_s | −24,6 dB | −33,3 dB | −34,5 dB |
| M-D extra bult | +3,78 dB | +4,30 dB | +3,36 dB |
| M-E Q-mult | 2,31× | 2,50× | 1,84× |
| M-F interim W-M, tussen de wegen (dichtstbij / zwaartepunt / verste) | 0,274 / 0,419 / 0,563 λ | 0,351 / 0,537 / 0,722 λ | 0,340 / 0,520 / 0,699 λ |
| M-F interim W-M, binnen de wooferweg | 0,29λ | 0,36λ | 0,36λ |
| M-F interim M-T (één bron per weg: de drie vallen samen) | 0,84λ | 0,92λ | 0,94λ |
| M-F eind, ±15° dip | — | — | −3,9 dB @ ~3,5 kHz |
| SPL-venster | ±2,2 dB | ±1,67 dB | ±1,79 dB |

**Validaties van Deel A op deze casus:**
- V1 (M-A): normalisatiefout op E_g ontdekt en gedocumenteerd; dissipatie bleek bindend (39–53%).
- V2 (poort-ontwijking): fasedoel via ondergedempte L/C met serie-R tegen de grens (drift richting extreem hoge R zonder grenshandhaving) — regressie voor F2.
- V3 (M-D-afleiding): bovenste impedantiepiek 52,3 Hz, Q 4,97 → band en f_ref volgens A4-afleiding reproduceren de handmatige analyse; spoel-vuistregel (2,7 mH ↔ +2,45 dB) gereproduceerd; LCR-vlakstelling op deze f_p vergt onbouwbare waarden (~60–120 mH) — motiveert waarom M-D een zacht doel is.
- V4 (M-C): onderscheidde kandidaten met 10 dB verschil zonder extra invoer.
- V5 (M-F): strijdige vakregels (klassiek ≤ halve golflengte vs. 1,0–1,4 golflengte met slechtste zone rond 0,5–0,7) — beide verwerpen dezelfde foute oplossing om verschillende redenen; alleen F-eind beslecht de rangorde. Synthese uit metingen bevestigd: kruisgebied verticaal onschadelijk (≤1,3 dB op ±15° bij het onderste kruispunt).
- V6 (M-H): breakup-scan vond dominante wooferpiek +3,2 dB Q≈7 die de bestaande notch bevestigt; f_break/3 valt samen met het onafhankelijk gekozen kruispuntvenster. Milde pieken (+2,9 dB mid) tonen de noodzaak van ernst-weging. Open meetverzoek: HD-sweep wooferpaar.
- V7 (extractoren): gate-grens uit FF/NF-divergentie (~465 Hz) consistent met eerder handmatig bepaalde gate-limiet; diffractie-rimpel RMS 0,39 dB bevestigt teardrop+waveguide; pod-mid houdt spreiding ver voorbij kolbentheorie (−6 dB@30° ≈ 5,4 kHz).

- V8 (opnamepas): drie schatters behoeven verfijning, ontdekt door de generieke pas op deze casus te draaien: (a) R_e-schatting uit min|Z| van de laagste bins pakt reactantie mee (4,6 vs werkelijke ~3,0 Ω) → gebruik Re(Z) bij lage f; (b) de stijgende spreekspoel-inductantie wordt als "piek" gedetecteerd (mid, hoge f, Q≈0,5) → discriminator piek-vs-flank nodig; (c) breakup-detectie is gevoelig voor de bandkeuze wanneer die niet op de geldigheidsgrenzen wordt geclipt (dezelfde wooferpiek: +0,7 vs +3,2 dB); (d) R_e-schatting via Re(Z) bij de laagste bins overschat wanneer de meting dicht op f_L begint (3,81 vs ~2,9 Ω bij een 10 Hz-start naast f_L=16,5 Hz) → motionele fit of extrapolatie vereist, en de verliesindicator Z(f_b)/R_e erft die fout één-op-één; (e) semi-inductantie-fit op de tweeter leverde een onzinnige exponent omdat het motionele staartgebied de fitband domineerde → geldigheidsdetectie verplicht; (f) detail-instortingsdetector gaf vals-hoge grenzen op fysiek gladde responsies en vals-lage op ruis → alleen met SNR-wacht en als advies; (g) FF/NF-vergelijking zonder fysisch stapmodel keurt gate-gladde data goed (59 Hz "betrouwbaar" op een 2,5 ms-venster) en zonder Keele-clipping faalt de fit volledig → modelvorm, exponentgrens en NF-clipping zijn alle drie verplicht; (h) looptijd-extractie via kale fasehelling overschat systematisch bij bandbegrensde drivers (rolloff-faselag telt mee als "afstand"; rangorde en verhoudingen klopten wel) → minimumfase-component eerst verwijderen. Alle vijf zijn afleidingsfouten, geen regelfouten — precies wat de nieuwe-meting-test moet blijven vangen.

- V12 (grens-inversie): de bult-budget-inversie reproduceert de spoel-vuistregel exact — bij Rs ≈ 0,5 Ω en budget 2,5 dB volgt max-L 2,65 mH, vrijwel letterlijk de "2,7 mH bij 4 Ω" uit de gemeenschap; de L↔R-afruil wordt expliciet (bij Rs = 2 Ω is het 2,5 dB-budget met géén enkele L haalbaar). Qes-budget-inversie op gemeten R_e: 0,87/1,45/2,90 Ω bij 1,3/1,5/2,0×. Gevoeligheids-gap-bound omsloot de gerealiseerde shelf-weerstand. Tegen-voorbeeld gedocumenteerd: de enkelvoudige serie-C-voorbound (5–10 µF) botst met de gerealiseerde 4e-orde midtak (42 µF serie) — bewijs dat voorbounds topologie-bewust of met speling moeten, met de poort als autoriteit.
- V11 (vensterinteractie): op het referentieontwerp (2,49 okt midband) is de drie-bronnen-zone afwezig (amplitude ontkoppeld) terwijl de mid-tak op het onderste kruispunt −121°/okt elektrische rotatie draagt die grotendeels van de bovenste-kruispunt-secties komt — fasekoppeling zonder amplitudekoppeling, exact het mechanisme achter het oorspronkelijke trackingprobleem van deze casus. Bevestigt: rapporteren i.p.v. verbieden, en gezamenlijke optimalisatie als antwoord.
- V10 (directiviteits-aanscherpingen): richtings-persistentie gevalideerd op het 0°/30°-paar — alle vier de gedetecteerde conuspieken van de betreffende driver bleven op 30° staan of namen toe (tot +7,9 dB), dus échte resonanties met power-gewicht: de ernst-weging van het bovenste kruisplafond gaat daarmee omhóóg, niet omlaag, wat het eerder gekozen conservatieve kruispunt achteraf steunt en het hoger geoptimaliseerde kandidaat-kruispunt op de rand zet. Effectieve-diameterextractie gevalideerd: fit toont vol conusoppervlak in het bundelingsbegin en krimpende effectieve diameter daarboven (conus-ontkoppeling) — direct bruikbaar voor de datagedreven Keele-grens.
- V9 (kruisvenster-synthese): generieke assemblage draaide op de casusparameters. Onderste paar: venster 397–551 Hz — vloer bindend door meetgeldigheid, plafond door ernst-gewogen breakup; het gekozen kruispunt valt erbinnen en het hele venster ligt in de gunstige lobing-zone. Bovenste paar: venster 1294–2284 Hz mét blootgelegde driewegs-spanning: de slechtste lobing-zone beslaat de onderhelft van het venster, de gunstige lobing-zone ligt bóven het breakup-plafond, en het geconvergeerde kruispunt ligt op de rand — de positie van die rand hangt volledig aan de ongekalibreerde ernst-weging. Conclusie: de synthese maakt de werkelijke afruil zichtbaar vóór het ontwerpen; kalibratie van de wegingscurve (HD-data) is de ontbrekende schakel.

- V13 (een driver is een SOM van metingen, niet één meting) — ontdekt bij F1 door de opnamepas op de volledige meetset te draaien. Het wooferpaar is één weg, één Driver-part en één parallelle .lim, maar twéé ver-veldbestanden. Scannen op één conus beantwoordt een vraag die niemand stelt: de breakup die telt zit in de druk die het páár uitstraalt, en dat is de complexe som. Dezelfde conusresonantie leest **+0,7 dB op één conus en +3,24 dB op de som** — en het hele ernst-gewogen kruisplafond (551 Hz) hangt aan welke van die twee je gelooft. Regel: metingen met dezelfde driver-tag en dezelfde hoek worden complex gesommeerd vóór élke scan, en `combineAtAngle` is de enige ingang tot de extractoren. Generiek, niet casusspecifiek: elke array-weg heeft dit.

- V14 (de adviserende FF/NF-detector mag geen band slopen) — ontdekt door de app te dráaien op de eigen demo-set, niet door een test. Twee constructiefouten in de eerste implementatie, beide met hetzelfde gevolg: de gate-vloer sprong van 397 Hz naar 2 kHz, twee drivers verdwenen uit het rapport en de wegvolgorde keerde om. (a) *Abstentie ontbrak:* een fit die nérgens past levert "het residu is bovenin nog steeds slecht", en dat veroordeelt alles eronder — terwijl de conclusie hoort te zijn dat het model deze data niet beschrijft. Fit-oordeel nu op het **mediane** absolute residu, niet op de RMS: een écht kapotte zone is precies waarvoor de detector bestaat en trekt een RMS over de drempel, waarmee de detector zou abstineren op zijn eigen kerngeval. (b) *Persistentie ontbrak:* A5b.1(ii) zegt "blijvend residu", en dat woord doet werk — één uitschieter bovenin veroordeelde de hele band. Alleen een aaneengesloten reeks van minstens 1/6 octaaf telt nu. Derde bevinding uit dezelfde sessie: **wegvolgorde hoort op de ongeclipte respons**. Waar de energie van een driver zit is een eigenschap van de driver, niet van het venster dat erop stond; ordenen op de geclipte band laat de volgorde afhangen van welke meting het hardst gepoort is. Alle drie nu met regressie vastgelegd.

- V15 (P6 geldt ook voor de golden references) — bij de F1-oplevering reproduceerde de engine vijf referenties niet, en in alle vijf de gevallen had de engine gelijk: het referentiebestand had een eigenschap van één meetsessie ingebakken. Dat is dezelfde fout als een hardgecodeerde frequentie in de engine, één niveau hoger. (a) *W-M fasetracking* was gemiddeld over het volle ±1 octaaf rond het kruispunt, waarvan bij HUIDIG de onderste helft onder de 397 Hz-vloer ligt (kruispunt 360 Hz). Op de geclipte band (A5.5) leest de engine 23,8° tegen de genoteerde 19,8° — en het beslissende bewijs: **KAND-A en KAND-B reproduceren de oorspronkelijke referentie exact** (2,79 vs 2,8 en 1,24 vs 1,3), want hún kruispunten liggen boven de vloer. De metriek is nu geclipt en rapporteert zijn dekking. (b) *Mid-breakup #4* is er twee (14379 Hz +2,83 en 14955 Hz +3,17), gelezen als één breder kenmerk op een grover raster; de andere drie reproduceren tot binnen 0,06 dB op dezelfde schatter. (c) *SPL-venster* is geen A4-metriek en de band waarover het genomen was stond nergens — een referentie zonder band is geen referentie, en is verwijderd. (d) *M-C, tweeterspanning op f_s* — het tweede en scherpste geval, en het bewijs dat het patroon geen toeval was. De referentie gebruikte **hardgecodeerde sessie-banden** (4–10 kHz voor de tweeter, 0,7–1,5 kHz voor de mid) waar A4 om de uit de kruispunten afgeleide doorlaatband vraagt. Gevoed met precies die banden reproduceert de engine de oude waarden tot binnen **0,05 dB** (−24,65 / −33,26 / −34,47 tegen −24,6 / −33,3 / −34,5): het bandverschil is de volledige verklaring, er zit geen tweede oorzaak onder. Die reproductie staat als staande test in de golden-suite, met de sessieparameters in het referentiebestand in plaats van in de test. (e) *Verankerde gaps en grens-inversies* zijn geen acceptatiecriterium in F1: de eerste wacht op het doelcurve-object (A5e.2) omdat A5d.4(a) het ankerniveau ná baffle step wil, de tweede is een F2-referentie omdat A5d.6 zoekruimtegrenzen levert. Anker en haalbaarheidswaarschuwing reproduceren wél en blijven asserts.

  **Procesregel die hieruit volgt.** Een golden reference die een **band, een middeling of een grid** gebruikt legt die parameters expliciet vast in het referentiebestand. Zonder die parameters is de waarde niet reproduceerbaar, en een niet-reproduceerbare waarde is geen referentie maar een herinnering. Twee van de vijf herzieningen (W-M fase, M-C) waren dezelfde fout in verschillende vermomming, en in beide gevallen kostte het uren om achteraf te reconstrueren wat vooraf één regel had gescheeld. Het referentiebestand draagt sinds F1 zijn eigen herzieningsnotitie, zijn afgeleide tolerantieklassen mét motivering, en per herziene referentie de parameters van de ingetrokken waarde. Openstaande afwijkingen na F1: **geen**.

- V16 (de derde vermomming van V15, en een poort die zichzelf kan ontlopen) — bij de F2-oplevering.

  **(a) De bult-inversie stond op een sessieband.** `grens_inversies.maxL_bij_Rs0,5_budget2,5dB` = 2,65 mH bleek berekend op de band 40–110 Hz met normalisatie op 150 Hz — de hardgecodeerde getallen in `metrics5.py` — waar A4 M-D om B = [0,7·f_p, 2,2·f_p] met f_ref = 3·f_p vraagt. Gevoed met precies die sessieparameters lost de engine 2,71 mH op en ligt de bult bij de genoteerde 2,65 mH binnen de dB-tolerantieklasse van het 2,5 dB-budget; op de afgeleide conventie is de grens 2,43 mH. Exact het patroon van V15(a) en V15(d), nu voor de derde keer, en opnieuw had de engine gelijk. Het V12-tegenvoorbeeld ("bij Rs = 2 Ω is 2,5 dB met géén enkele L haalbaar") reproduceert wél onveranderd: de bult bij L = 0 is daar al 3,04 dB. De twee andere inversies reproduceren op hun eigen, nu vastgelegde parameters — de Qes-inversie exact op R_e = 2,90 Ω, de pad-R-inversie tot 0,011 Ω op de mediaan |Z| over de afgeleide doorlaatband met het genoteerde 4,1 dB-budget.

  **Bijvangst die vermelding verdient:** het casusboek draagt twéé lezingen van dezelfde R_e van het wooferpaar — 2,90 Ω (`Re_werkelijk_ca`, waar de Qes-inversie op staat) en 3,05 Ω (`compare.py`, waar de M-E-referentie op staat). Geen van beide is fout; wat fout was, is dat geen van beide referenties zei wélke zij gebruikte. Beide staan nu in het referentiebestand met hun herkomst.

  **(b) Een poort waarvan de referentie meebeweegt is geen poort.** M-C vergelijkt de spanning op f_s met de *doorlaatband*, en die band volgt uit de kruispunten. Wordt hij bij elke polish-stap opnieuw afgeleid, dan kan de optimizer de poort halen door het kruispunt te verplaatsen: de meetlat schuift mee met het ontwerp. De afgeleide parameters van een poort worden daarom bij aanvang van een run **bevroren** op het ontwerp waar de run mee begint, en de opgeleverde kandidaat wordt op *beide* conventies getoetst — op de bevroren banden én op de banden die zijn eigen kruispunten impliceren. Slagen voor de ene en zakken voor de andere is een bevinding, geen afrondingsverschil, en wordt als zodanig gerapporteerd.

  **(c) Een voorbound met speling mag het ontwerp waarop hij wordt losgelaten nooit zelf uitsluiten.** V12's tegenvoorbeeld (enkelvoudige serie-C-voorbound van 5–10 µF tegen een gerealiseerde 4e-orde midtak met 42 µF) is geen kalibratieprobleem van de verruimingsfactor: een grotere factor verplaatst de botsing alleen. De regel die de hele klasse wegneemt: een bound die als `slack` is gemarkeerd wordt verruimd tot de waarde die het ontwerp zelf draagt, met een notitie. De poort blijft de autoriteit, en die oordeelt over de f_s-spanning zelf in plaats van over een componentwaarde die daarvoor in de plaats staat.

- V17 (een diagnose die door mijn eigen rapport werd tegengesproken) — bij F2b, en het is een procesles, geen engineles.

  **Wat er gebeurde.** De 3-weg-scan op de demoset bleef minutenlang in `part audit (seed)` staan met een bevroren teller. Ik schreef dat toe aan de poortvraag die F2 in de audit-lus had gezet: elke vraag lost het hele netwerk op en integreert M-A, dus "de audit vraagt het per verwijderkandidaat" klonk sluitend. Het stond als vaststaand in het opleverrapport.

  **De tegenspraak stond in datzelfde rapport.** De v1-run die ik ter vergelijking had gedraaid — zónder poorten — bleef in *exact dezelfde stage* even lang hangen. Dat had de verklaring meteen moeten uitsluiten. Twee waarnemingen in één verslag, waarvan de tweede de eerste weerlegt, en ik heb ze niet naast elkaar gelegd. De poortvraag stond bovendien in de audit al ná de kwaliteitscheck, dus de veronderstelde herhaling bestond daar niet eens.

  **Wat de meting zegt.** Op de tweewegfixture, dezelfde seed, met en zonder poorten: **v1 3424 ms / 9538 sims, v2 2219 ms / 6144 sims, vier poort-evaluaties in de hele run.** De v2-run is niet trager maar *sneller*, en dat is geen meetfout maar het mechanisme: een poortweigering kapt een zoektocht af die anders was doorgelopen. Een harde grens bespaart werk zodra hij bijt — het omgekeerde van wat een strafterm doet, die de zoektocht juist door verboden gebied laat dwalen. Wat wél traag is op een groot 3-weg-netwerk is de seed-part-audit zelf, op v1 en v2 gelijk; bestaand gedrag, nu gemeten en als TODO vastgelegd.

  **Wat de teller ving dat een klok nooit had gevonden.** De acceptatie-eis was een *telling*, geen tijdmeting. Die telling klopte niet: zeven evaluaties tegen zes getelde. Oorzaak: `constraintViolation` — de A3f-backstop bij de reparatiepas, de snap en de eindcontrole — riep de poorthaak rechtstreeks aan, buiten cache en teller om. Eén ontsnapte aanroeppad, onzichtbaar voor elke tijdmeting en voor elk oog, gevonden door een assert die twee getallen vergeleek. Alles loopt nu door één `cachedGateViolation`. In dezelfde test zat mijn eigen tweede fout: de uniciteitscheck dedupliceerde op part-*id's* in plaats van op waarden, waardoor hij groen zou blijven op een cache die nooit raakt.

  **De etiket-schakel: waaróm het waarnemen faalde.** Beide misdiagnoses hingen aan één regel voortgangscode. `stage('value tune')` draait vóór `runAudit(parts, 'part audit (seed)')`, en niets zet het etiket daarna terug — dus élke hartslag gedurende de volledige waarde-tune rapporteert "part audit (seed)". Op een groot 3-weg-netwerk is dat de langste stage die er is. Daar bovenop zwijgt de hartslag tijdens `auditNetwork` zelf, dat zijn volle-grid-solves buiten de evaluatieteller om doet, zodat de sim-teller bevriest op precies het moment dat een lezer bewijs van leven zoekt.

  Het gevolg: de waarnemer ziet minutenlang een verkeerde stagenaam met een stilstaande teller, en concludeert "hang". Ik concludeerde bovendien "hang veroorzaakt door de nieuwe poortvraag in de audit-lus" — omdat het etiket letterlijk *audit* zei. Het etiket wees de verdachte aan. De UI deed niets fout; zij rendert getrouw wat de engine aanlevert, en de engine leverde de verkeerde naam. Vastgelegd als `TODO(observability)` op de plek van het etiket, met drie punten en een expliciete afbakening voor de sessie die het repareert: voortgangsberichten maken géén deel uit van het byte-invariant van het resultaat, dus labels en hartslag mogen vrij bewegen.

  **De regel die hieruit volgt.** Een prestatiediagnose is een bewering over een oorzaak, en die valt onder dezelfde bewijslast als een metriek (P1): eerst de grootheid meten, dan pas de vuistregel geloven. Een plausibel mechanisme dat de waargenomen vertraging verklaart is geen bewijs zolang de controlemeting — dezelfde run zonder de verdachte — niet is afgelegd. Ik had die controlemeting al gedaan en genegeerd. En een tweede, uit de etiket-schakel: **een diagnose die leunt op een voortgangsmelding erft de betrouwbaarheid van die melding.** Een stagenaam is geen meting.

- V18 (het dip-schouder-artefact, en waarom dezelfde fix twee keer niet dezelfde fix is) — bij F3, gevonden door de test die iets anders moest bewaken.

  **Het artefact.** Een residu is `curve − trend`, en een smalle DIP trekt de trend met zich mee omlaag. Aan wéérszijden van die dip ligt de curve daardoor bóven de verlaagde trend en wordt het residu positief. Een detector die alleen naar kruinen in het residu kijkt rapporteert élke smalle dip dus als **twee pieken**, die hem flankeren, elk ruwweg een kwart van de dipdiepte. Gemeten op een synthetische dip van 4 dB, 1/20 octaaf breed, op 5 kHz: pieken op 4485 en 5597 Hz, beide +0,95 dB.

  **Hoe hij gevonden werd, en door wat.** Niet door een prestatieklacht en niet door een oog op de code, maar door acceptatietest (d) van F3 — de test die het *smaakprincipe* moest vastleggen: smalle piek rapporteren, smalle dip vergeven. Die test voerde een dip in en verwachtte een lege kolom, en kreeg er twee pieken terug. **De test die het principe bewaakte, bewaakte de detector.** Dat is het argument voor asymmetrische acceptatietests in één zin: een test die alleen het verwachte geval voert, ziet de spiegeling van zijn eigen aanname nooit.

  **De remedie, en waarom zij niet overal geldt.** Op de F3-systeemsom is de oplossing eenvoudig: een piek is een lokaal maximum van het residu **én** van de respons. Op de schouders van een dip is de respons monotoon, dus die vallen af; elke echte piek blijft. De som is nominaal vlak, en dat is precies wat de test geldig maakt.

  Op de **breakup-scan** (A5b.2) werkt geen van beide remedies, en dat is gemeten voordat het werd opgeschreven:
  - *"Eis ook een lokaal maximum van de curve."* Sloopt echte breakups. Een breakup zit op een respons die ergens heen gaat: op de afval van een woofer *vlakt* een conusresonantie de daling af, hij keert hem niet om. Casus 1's gedocumenteerde +3,2 dB-piek op 1395 Hz verdween.
  - *"Verwerp een kruin waarvan het naburige residu-minimum dieper is dan de kruin hoog is."* Sloopt ze óók, en de data zegt waarom: diezelfde 1394 Hz-kruin leest +3,25 dB tússen minima van −4,54 en −5,74 dB. Op een rimpelende driverrespons is een kruin tussen twee diepe dalen geen artefact — zo ziet een breakup eruit.

  **Wat er op het spel stond.** Die 1395 Hz-detectie is niet decoratief: met de ernst-weging (3,2 dB → divisor 2,53) zet zij het plafond van het woofer-mid-kruisvenster op **551 Hz**, en `plafond_bindend: "breakup_ernst"` in het referentiebestand zegt dat het de énige binding op die bovengrens is. Een filter dat een kwart van de echte detecties wegneemt om dit artefact te verwijderen, zou de app het enige argument ontnemen dat zij heeft om dat kruispunt laag te houden. En de tegenwerping "op 1395 Hz is de woofer toch 35 dB onderdrukt" is precies de vuistregel die M-H vervangt: de vervorming ontstaat ín de driver, ná het filter, dus elektrische demping raakt haar niet.

  **De regel die hieruit volgt.** Twee scans met dezelfde formule zijn niet twee instanties van hetzelfde probleem. De geldigheid van een detectorregel hangt aan de vórm van de curve waarop hij draait — nominaal vlak of nominaal hellend — en een remedie overzetten zonder die vorm te toetsen is hoe een bugfix een regressie wordt. Het artefact blijft in de breakup-scan bewust staan, met de meting erbij, begrensd doordat een flankkruin ongeveer een kwart van de dipdiepte is en er dus een notch van meerdere dB nodig is om de rapportagedrempel te halen.

- V19 (waar een referentie een FUNCTIE van is — de classificatie van casus 1) — bij F4a, en het is een sessie zonder één gedragswijziging.

  **Waarom.** De audit (`docs/audit_engineV2_optimizerV1_grens.md`, §6 en §8) stelt vast dat engine v2 vandaag alleen WAARDEN begrenst: welke kandidaten er zijn beslist `crossover3Variants` stroomopwaarts, vóór de v1/v2-splitsing. Zodra v2 eigen kandidaten genereert (F4d) levert dat legitiem andere netwerken op, en elke golden reference die een eigenschap van de ZOEKTOCHT vastlegt in plaats van natuurkunde gaat dan rood — precies op het moment dat de acceptatie-autoriteit nodig is. V15 schreef die les op voor een eigenschap van één meetsessie; dit is dezelfde fout één laag lager, voor een eigenschap van één engine. De vraag was dus niet "klopt het getal" maar "waar is het getal een functie van".

  **De drie klassen.** A = (metingen) → waarde, engine-onafhankelijk. B = (metingen, gegeven netlist) → metriek, berekend op een vaste netlist die als BESTAND in `test-fixtures/casus1/` staat. C = (metingen, zoektocht) → uitkomst: een kruispunt dat een zoektocht koos, componentwaarden waarop zij uitkwam, de score van een run, de samenstelling van een shortlist.

  **De uitkomst, en zij was niet de verwachte.** Van de 272 bladeren van het referentiebestand zijn er 204 waardedragend (de rest is proza en bestandsboekhouding). Daarvan zijn er **123 klasse A**, **71 klasse B**, **0 klasse C**, plus 10 tolerantieklassen — die geen klasse dragen, want een tolerantie is nergens een functie van maar een besluit met een motivering. **Er is niets gedegradeerd, omdat er niets te degraderen viel.**

  De reden is één ontwerpbesluit dat al lang geleden goed is uitgevallen: **de drie kandidaten van casus 1 zijn als netlist-BESTAND bevroren, niet als uitkomst van een run.** `manifest_en_geometrie.netlists` noemt drie `.adsfilter.json`-bestanden die sinds `b04f9fa` onveranderd in de repo staan; `casus1Filter` leest ze van schijf en `buildReport` rekent erop. Geen enkele test die een casus-1-referentie consumeert draait een zoektocht — nagelopen met `grep` op `optimizeNetworkValues`, `crossover3Variants`, `handleV2Request` en `runV2Chain3` over alle acht consumerende testbestanden. Wat de audit vreesde bestaat voor deze casus dus niet.

  **Dat is een bevinding en geen opluchting.** Zij is pas waar sinds iemand het heeft nagekeken, en niets hield haar waar. Twee dingen doen dat sinds F4a wél: elke referentie draagt de velden `klasse` en `afhankelijkheid` (letterlijk `meting`, `meting+netlist` of `meting+zoektocht`), en `src/lib/engine2/goldenClassification.test.ts` faalt op een blok zonder klasse, op een klasse die niet bij haar afhankelijkheid past, op een klasse C buiten `v1_baseline`, en op een bronbestand dat een `v1_baseline`-waarde leest. Het lege `v1_baseline`-blok draagt de commit waarop de classificatie is gedaan (`b137f1d`) plus de herleiding: de kandidaatgeneratie bewoog het laatst bij `61a3ea4`, de tuner bij `c7030ab`. F4d kan zijn eigen uitkomst ernaast leggen zonder ergens een acceptatiecriterium te vinden dat er geen mocht zijn.

  **Wat de classificatie wél opleverde: negen ontbrekende parameterblokken.** Klasse bepalen dwingt je te lezen waar een getal vandaan komt, en dan valt op wat er niet staat. **Veertien** van de 46 referentiegroepen in de tabel hieronder bleken een BAND, een GLADDING of een RASTER te gebruiken die alleen in de code stond — precies wat de V15-procesregel verbiedt. Zij zijn *herdefinieerd* en ondergebracht in **negen** parameterblokken; negen en niet veertien, omdat de vier SPL-scans (breakups, persistentie, richting, diffractie) er aantoonbaar één delen. De waarden zijn onaangeraakt gebleven en de parameters staan er nu bij — mechanisch geverifieerd: van de 272 bestaande bladeren is er geen enkele van waarde veranderd. De overige 31 groepen zijn *behouden* (14 + 31 = 45), en de zesenveertigste rij is het lege baseline-blok.

  De scherpste drie:
  - **De SPL-scans** (`_spl_scan_parameters`). Breakups, richtings-persistentie, de richtingsverhouding en de diffractierimpel draaien alle vier tegen dezelfde 1/2-octaaftrend op hetzelfde 500-punts logaritmische raster, geclipt op de eigen geldigheidsband van de driver. Geen van die drie stond in het bestand — terwijl **V8c letterlijk vastlegt dat dezelfde conusresonantie +0,7 of +3,2 dB leest naargelang die band**, en het kruisplafond van 551 Hz aan dat verschil hangt. De meest bandgevoelige referentie in het boek droeg haar band niet.
  - **M-E** (`_M_E_parameters`). `Qes_mult` deelt door R_e, en het casusboek draagt twee lezingen van dezelfde R_e van het wooferpaar (V16: 2,90 en 3,05 Ω). Welke van de twee eronder lag stond in een zin in V16 en in een constante in de testfixture — `CASUS1_WOOFER_DC_OHM = 3.05`. Een parameter die alleen in code bestaat is exact wat V15 verbiedt, en de test vergelijkt de twee nu.
  - **M-F-interim** (`_M_F_interim_parameters`). λ = d·f/c, en wélke d stond nergens. Het onderste paar gebruikt niet de 261 mm tussen wooferpaar en mid maar de **275,8 mm ARRAY-afstand binnen de wooferweg** — het paar is één weg met twee bronnen, en de bronscheiding die de lobe maakt zit binnen die weg. Op HUIDIG is dat 0,289 tegen 0,274 λ: buiten de λ-klasse van 4 %, dus een andere grootheid en geen afronding. *(Bij V20 herzien: het blok draagt nu alle vier de afstanden, en de vraag welke van de twee juist was is beantwoord door haar te verwerpen.)*

  De andere zes: de directe R_e-aflezing (mediaan over de laagste 2,5 % van de punten — genoemd in proza bij woofer en tweeter, en bij de mid nergens), de spreekspoelfit (band = één decade boven de hoogste motionele resonantie), de verankerde gaps (energiegemiddelde tussen de overnames, met de overname als meetkundig midden van het A5d.3-venster), de kruisvensters (orde-factor 1,4, de ongekalibreerde ernst-divisors 3,0/2,0 en de casusboek-c-t-c), M-A/M-B (het volle poortvrije analyseraster en de IEC 60268-1-weging) en de vensterinteractie (KAND_B, en een fasehelling over een vol octaaf rond het kruispunt).

  **De grens tussen "herdefiniëren" en "niet aanraken".** V15 gaat over een band, een middeling of een raster. Detectiedrempels — `RESONANCE_MIN_Z_OVER_RE`, de fasenul-hoek, de reflex-dipfractie — zijn géén V15-geval: zij zijn schattergedrag, en dat wordt gedekt door de schatter-versionering (`z-re@1.1`) en door casus S1. Die scheiding aanhouden is wat verhinderde dat "elke referentie krijgt parameters" ontaardde in het overschrijven van de hele engine in JSON.

  **De les die overblijft.** Een referentie zonder klasse is een getal waarvan niemand weet wat het overleeft. Dat casus 1 er goed uit komt, komt doordat haar kandidaten bestanden zijn — en dat is een eigenschap van hoe de fixtures zijn aangelegd, niet van hoe het bestand is geschreven. Een volgende casus die kandidaten als RUN-uitkomst vastlegt, krijgt het probleem dat de audit voorzag, en krijgt het stil. Vandaar de regel in `.claude/skills/casus-toevoegen/SKILL.md`: elke nieuwe referentie draagt klasse en afhankelijkheid, en klasse C mag alleen onder `v1_baseline` of een toekomstig `v2_baseline` staan.

  **Openstaand, en bewust niet in F4a opgelost.** Er is geen tolerantieklasse voor graden-per-octaaf; `goldenCasus1.test.ts:611` draagt daarom zijn eigen 15 %, en dat is dezelfde soort fout als een test die zijn eigen dB-klasse meesleept. Een klasse vaststellen is een besluit met een motivering en geen classificatie, dus het is genoteerd in `vensterinteractie.parameters.openstaand_tolerantie` en wacht op de sessie die het neemt.

  **De inventarisatietabel.** Vijf kolommen: referentie, klasse, consumerende test, besluit, reden. `gCT` = `src/lib/engine2/goldenCasus1.test.ts`, `bIT` = `src/lib/engine2/optimizer/boundInversions.test.ts`, `cST` = `src/lib/engine2/optimizer/casus1Shortlist.test.ts`, `mWT` = `src/lib/engine2/manualWindowAndLobing.test.ts`, `fix` = `src/lib/engine2/casus1.fixture.ts`, `gClT` = `src/lib/engine2/goldenClassification.test.ts`.

| referentie | kl. | consumerende test | besluit | reden |
|---|---|---|---|---|
| `toleranties.*` (10) | — | gCT:134-149 | behouden | Geen referentie maar de aanvaardingsbreedte VAN referenties; nergens een functie van. |
| `afgeleide_parameters.woofer.Re` / `.mid.Re` / `.tweeter.Re` | A | gCT:162, 323, 384 | behouden | Motionele fit; band, weging en startpunten staan volledig in `re_fit_parameters`. |
| `..woofer.Re_naief`, `.mid.Re_direct`, `.tweeter.Re_direct` | A | gCT:166, 389 | **herdefinieerd** | Venstermiddeling waarvan het venster (laagste 2,5 % van de punten, mediaan) alleen in proza stond, en bij de mid nergens. |
| `..*.Re_motionele_rok_ohm` (3) | A | gCT:171, 262 | behouden | Uit de gefitte tak zelf; de fitband staat in `re_fit_parameters`. |
| `..*.Re_fit_residu`, `..*.Re_fit_bandgevoeligheid_ohm` (6) | A | gCT:244-249 | behouden | Fitkwaliteit met eigen tolerantieklasse en volledige parameterset (F3b). |
| `..*.Re_fit_band_hz` (3) | A | gCT:253-259 | behouden | De band zelf, expliciet — dit ís de V15-parameter. |
| `..woofer.Re_werkelijk_ca` | A | gCT:163 | behouden | Meterlezing van het parallelle wooferpaar; herkomst genoteerd. |
| `..woofer.fL` / `fb` / `fH` / `Zdip` | A | gCT:176-179 | behouden | Reflex-classificatie over de hele sweep; schattergedrag zit in de versiestring. |
| `..woofer.Q_bovenpiek` | A | gCT:294 | behouden | Open referentieniveau van de −3 dB-punten is al gemotiveerd in `toleranties_toelichting.Q_pct`. |
| `..woofer.breakup.{f,dB,Q}`, `..mid.breakups` (5) | A | gCT:312-315, 353-357 | **herdefinieerd** | Trendbreedte, scanraster en band ontbraken — juist de referentie waarvan V8c zegt dat zij bandgevoelig is. |
| `..mid.persistentie_30gr` (5) | A | gCT:358-365 | **herdefinieerd** | Zelfde scan plus een ±1/6-octaaf zoekvenster; geen van beide stond er. |
| `..mid.dir_m3_30` / `dir_m6_30` | A | gCT:373-374 | **herdefinieerd** | De VERSCHILcurve wordt gegladd op dezelfde trend; gladding en raster ontbraken. |
| `..mid.fc` / `Zmax` / `r0` / `Qmc` / `Qec` / `Qtc`, `..tweeter.fs` / `Zmax` / `r0` | A | gCT:326-331, 390-392 | behouden | Gesloten-classificatie over de hele sweep. |
| `..*.semi_inductantie_n` (2) | A | gCT:296, 332 | **herdefinieerd** | Fitband (één decade boven de hoogste resonantie) en de weigergrenzen stonden alleen in de code. |
| `..*.NF_fmax` (2) | A | gCT:302, 333 | behouden | Keele over de getagde diameter; de diameter staat in het manifest. |
| `..woofer.FF_vloer_header` | A | gCT:303 | behouden | 1/T uit de header; de headertijden staan in `manifest_en_geometrie.ff_headers`. |
| `..tweeter.diffractie_rimpel_rms_dB`, `..dominante_omweg_mm` | A | gCT:393-398 | **herdefinieerd** | RMS-band, log-raster, 1024-punts lineaire transformatie, Hann-venster en de 4-perioden-ondergrens ontbraken alle vijf. |
| `..tweeter._Re_sessie_25_08.waarde` / `.r0` | A | gCT:389 | behouden | Ingetrokken waarde mét haar schatter — de V15-vorm zelf. |
| `verankerde_gaps_dB.anker` | A | gCT:580 | behouden | Acceptatiecriterium; reproduceert, en nagemeten identiek op alle drie de netlists (gClT). |
| `verankerde_gaps_dB.woofer_tov_mid` / `.tweeter_tov_mid` | A | gCT:587 (status), 590-591 | **herdefinieerd** | Niveaubanden (energiegemiddelde tussen de overnames, overname = meetkundig venstermidden) ontbraken. |
| `kandidaten.*.minZ` / `.minEPDR` (6) | B | gCT:420-421 | **herdefinieerd** | Zoekt een minimum over het HELE poortvrije analyseraster; band noch raster stond er. |
| `kandidaten.*.dissipatie_pct`, `.R8_W_bij_100W` / `.grootste_R_W_bij_100W` (6) | B | gCT:426-431 | **herdefinieerd** | IEC-weging, normalisatie op aangenomen vermogen en het raster ontbraken. |
| `kandidaten.*.Qes_mult` (3) | B | gCT:436-440 | **herdefinieerd** | Deelt door R_e = 3,05 Ω, een waarde die alleen in `fix:281` en in een zin van V16 bestond. |
| `kandidaten.*.lf_bult_extra_dB` (3) | B | gCT:454-458 | behouden | Band en referentie afgeleid uit f_p; vastgelegd in `grens_inversies.parameters.maxL_bult`. |
| `kandidaten.*.lobing_{wm,mt}_*_lambda` (27, was 6) | B | gCT:461-499 | **herdefinieerd bij F4a, hernoemd en uitgebreid bij V20** | Wélke c-t-c stond nergens, en het onderste paar gebruikte de array-afstand en niet de paarafstand. V20 beantwoordt dat: er zijn vier afstanden en de metriek kiest er geen. `lobing_wm_lambda` heet nu `lobing_wm_binnen_weg_lambda`, waarde en klasse ongewijzigd. |
| `kandidaten.*.V_tweeter_op_fs_dB` (3) | B | gCT:445-449 | behouden | Doorlaatband afgeleid uit de eigen kruispunten (F1-conventie, genoteerd in `_V_tweeter_op_fs_dB_opmerking`). |
| `kandidaten.*.wm_fase_oct` / `.mt_fase_oct` (6) | B | gCT:473-481 | behouden | ±1 octaaf geclipt op de geldigheidsband; de conventie staat in `_wm_fase_oct_opmerking`. |
| `kandidaten.KAND_B_3e.lobing_eind_dip_15gr` | B | gCT:488-489, mWT:66-68 | behouden | Het ±15°-venster staat in de sleutelnaam, de akoestische centra in de geometrie. |
| `kandidaten.KAND_B_3e.rms_vlakheid_dB` / `.spl_venster_pm_dB` | B | cST:83-92 | behouden | Volledige parameterset in `_F3_respons_oordeel` (doelcurve, gladding, band, raster). |
| `kandidaten._F3_respons_oordeel.overige_kandidaten.*` (4) | B | cST:95-102 | behouden | Idem, en de kolom smalle pieken is expliciet leeg gemeld (cST:117-121). |
| `kandidaten._F3_respons_oordeel.{gladding,band_hz,grid}` | B | cST:70-79 | behouden | Dit zijn de V15-parameters zelf. |
| `kandidaten._V_tweeter_op_fs_dB_sessie_25_08.*` (11) | B | gCT:495-530 | behouden | Ingetrokken waarden mét sessieband, middeling, raster en f_s-afronding. |
| `kruisvensters.woofer_mid_orde4.*` | A | gCT:537-546 | **herdefinieerd** | Orde-factor, ernst-divisors, significantiedrempel en c-t-c ontbraken; de sleutelnaam draagt de orde, en een naam is geen parameter. |
| `kruisvensters.mid_tweeter_orde4.*` | A | gCT:548-557, 559-576 | **herdefinieerd** | Idem. |
| `grens_inversies.maxRs_Qmult1_3/1_5/2_0_ohm` | A | bIT:78-91 | behouden | Volledige parameterset sinds F2, inclusief wélke R_e-lezing. |
| `grens_inversies.maxL_bij_Rs0_5_budget2_5dB_mH` | A | bIT:139-160 | behouden | Band uit f_p, budget en pad-R expliciet; assert op de metriek, niet op de mH. |
| `grens_inversies._maxL_sessie_25_08.*` (5) | A | bIT:162-196 | behouden | Ingetrokken waarde met haar sessieband — de V15-vorm. |
| `grens_inversies.max_padR_tweeter_gap_ohm` + `parameters.max_padR.*` | **B** | bIT:200-208 | behouden | De impedantiemediaan is meting, maar de doorlaatband komt uit de kruispunten van HUIDIG; herkomst stond er al. |
| `grens_inversies.parameters.voorbound_serie_C.*` | **B** | bIT:212-270 | behouden | `gerealiseerd_uF`/`_orde` zijn eigenschappen van de netlist KAND_B (C1 = 42,0 µF); geen acceptatiewaarde maar een mechanisme-eis. |
| `vensterinteractie.midband_octaaf`, `.drie_bronnen_zone`, `.fase_doorkoppeling_...` | B | gCT:600-613 | **herdefinieerd** | Kandidaat (KAND_B) en de venstervorm van de fasehelling stonden er niet; op HUIDIG leest hetzelfde blok 2,65 okt en −127 °/okt. |
| `manifest_en_geometrie.bestanden.*` (24) | A | fix:209-215 | behouden | Meetmanifest — projectinvoer, geen afleiding. |
| `manifest_en_geometrie.ff_headers.*` (3) | A | mWT:156-162 | behouden | Headertijden uit de meetbestanden. |
| `manifest_en_geometrie.geometrie.*` (14) | A | fix:238-262 | behouden | Kastgeometrie; c-t-c-herkomst sinds F3c expliciet toegeschreven. |
| `manifest_en_geometrie.netlists.*` (3) | A | fix:287 | behouden | **De reden dat er geen klasse C is:** de kandidaten zijn bestandsnamen, geen runuitkomsten. |
| `re_fit_parameters.*` (6 waarden) | A | gCT:272-288 | behouden | De V15-parameters van de motionele fit. |
| `v1_baseline.referenties` | C | gClT (verbiedt lezen) | — | Leeg bij F4a; niets viel te degraderen. |

- V20 (welke afstand geldt voor lobing tussen een weg met N bronnen en de aangrenzende weg?) — opgeworpen bij F4a, **beantwoord op 27-08-2026 door de vraag te verwerpen**.

  **De vraag zoals F4a haar stelde.** M-F-interim rekent λ = d·f/c op het kruispunt. Voor het paar wooferarray → mid gebruikte de engine de **array-afstand** (275,8 mm, tussen de twee woofers onderling) en niet de **paarafstand** (261 mm, tussen wooferpaar en mid). Op HUIDIG scheelt dat 0,289 tegen 0,274 λ — buiten de λ-tolerantieklasse van 4 %, dus twee verschillende grootheden en geen afronding. F4a legde de gemaakte keuze vast in het referentiebestand en liet de vraag welke van de twee JUIST is expliciet open.

  **Het besluit.** Geen van beide, en de vraag zelf deugde niet. Voor lobing tussen twee wegen bestaat **geen enkele afstand die een weg met N bronnen samenvat**; elke keuze uit de kandidaten is een aanname die zich als meting voordoet. Daarom:

  a. **De verticale synthese is de autoriteit** voor lobing tussen wegen — alle bronnen, alle z-offsets, alle akoestische centra, de doelhellingen van de kandidaat. Zij is de énige lobing-grootheid waar een gebruikers-eis of een kandidaat-oordeel aan mag hangen. Referentie: `kandidaten.KAND_B_3e.lobing_eind_dip_15gr` (−3,9 dB @ ~3,5 kHz).
  b. **λ-fracties zijn rapportage/screening.** Voor een weg met N bronnen tegenover de aangrenzende weg worden er **drie** gerapporteerd — tot de dichtstbijzijnde bron, tot het amplitudegewogen zwaartepunt, tot de verste bron — plus **de grootste onderlinge scheiding binnen de weg** als aparte grootheid. Amplitudeweging komt uit de aansturing; parallel = gelijk, en de metriek meldt dat zij die gelijkheid heeft aangenomen in plaats van er stil een 1 voor te schrijven. Nergens een aanname van N = 2 of van drie wegen.
  c. **De bestaande `lobing_wm_lambda` mat de binnen-de-weg-scheiding en heette verkeerd.** Hernoemd naar `lobing_wm_binnen_weg_lambda`; waarde (0,29 / 0,36 / 0,36) en klasse (B) ongewijzigd. Een afleidingsfout in de naamgeving, geen rekenfout — en dáárom is de waarde behouden in plaats van herzien. `lobing_mt_lambda` is niet hernoemd: mid en tweeter zijn elk één bron, en dan is hij een echte tussen-de-wegen-fractie.

  **Waarom casus 1 de oude vraag niet kon beslechten, en de nieuwe wél illustreert.** F4a merkte op dat 0,289 en 0,274 allebei in de gunstige zone vallen, zodat de ontwerpbeslissing er niet van kantelt. Dat blijft waar voor die twee getallen, en het is precies waarom zij samen te weinig waren. De vier fracties bij het kruispunt van de kandidaten zetten dat op scherp:

  | | HUIDIG (f_x = 360 Hz) | KAND_B (f_x = 447 Hz) |
  | --- | --- | --- |
  | dichtstbijzijnde bron (261,3 mm) | 0,274 λ | 0,340 λ |
  | amplitudegewogen zwaartepunt (399,2 mm) | 0,419 λ | 0,520 λ |
  | verste bron (537,0 mm) | **0,563 λ** | **0,699 λ** |
  | binnen de wooferweg (275,7 mm) | 0,289 λ | 0,359 λ |

  Eén handover, vier fracties, en zij liggen op HUIDIG een factor twee uit elkaar. De verste-bron-lezing landt op 0,563 λ — midden in de zone die de oude score de ongunstigste noemde — terwijl de dichtstbijzijnde op 0,274 λ in de gunstige zone ligt. **Beide getallen zijn juist en zij zeggen tegengestelde dingen**, omdat het twee verschillende afstanden zijn tussen dezelfde twee wegen. De oude implementatie rapporteerde er één (0,289) en de discussie ging over de vraag of dat er 0,274 had moeten zijn — terwijl de lezing die er in de buurt van een oordeel komt, 0,563, in geen van beide voorstellen voorkwam. Dat is de eigenlijke vondst van V20: de keuze tussen twee kandidaten verborg een derde.

  Wat daaruit volgt is niet dat KAND_B slechter is dan hij leek. Het volgt dat je het aan deze getallen niet kunt zien, en daarvoor bestaat de synthese: die zegt voor KAND_B −3,9 dB op ±15° in het kruisgebied, en dát is de uitspraak waar een oordeel op mag staan.

  **De niet-monotone zonescore is vervallen en heeft geen vervanger.** Hij scoorde precies de ene λ waarvan hierboven blijkt dat zij niet te kiezen is; een curve over een niet te kiezen getal is een oordeel dat op een aanname rust. De kennis die erin zat gaat niet verloren — de twee verzoende vakregels staan in V5, en de knopen zelf staan hier, zodat een toekomstige screening ze kan oppakken zonder ze opnieuw af te leiden: (0,00 → 0,00), (0,25 → 0,15), (0,60 → 1,00), (1,00 → 0,25), (1,40 → 0,35), (2,00 → 1,00), stuksgewijs lineair in λ. **Wat er niet meer mag:** een poort, een budget of een shortlist-criterium op een λ-fractie. Dat is een blijvend verbod en geen momentopname.

  **Wat er in de code veranderde, en wat nadrukkelijk niet.** Nieuw: `metrics/lobing.ts` (pure functies, versie `lobing-lambda/2.0`, geldigheidspropagatie vanuit het kruispunt van de kandidaat), `Geometry.waySources` (waar élke straler zit, per weg), en `sourcesFromArray` in de adapter — die laatste bouwt posities uit **aantal + spacing + akoestisch centrum**, en dus alleen waar het aantal bekend is. Een array-afstand op zichzelf blijft géén invoer voor deze metriek: een afstand zegt niet hoeveel stralers zij scheidt, en er twee van maken zou de N = 2-aanname terugbrengen langs de achterdeur. Onaangeraakt: de synthese zelf (`verticalLobing`), de v1-route, en elke poort en elk budget. Het gedrag verandert uitsluitend in de rapportagelaag.

  **Waar het meetfeit vandaan komt dat dit mogelijk maakte.** De twee wooferposities staan al sinds de eerste sessie afzonderlijk in het referentiebestand (`z_offset_mm.woofer_boven` en `.woofer_onder`); de fixture middelde ze weg vóórdat een metriek ze zag. Dat gemiddelde is nog steeds juist voor de synthese — die wil één akoestisch centrum per tak — en het was fout voor de fracties, die juist bestaan omdat een weg met twee stralers op meer dan één afstand van zijn buur staat. De gegevens waren er dus al; wat ontbrak was een metriek die ernaar vroeg. **Bijvangst, en zij is als test vastgelegd:** de dichtstbijzijnde-afstand die uit de z-offsets volgt (261,3 mm) ís de paarafstand die het casusboek los noteert (`ctc_mm.woofer_mid` = 261), en de binnen-de-weg-scheiding (275,7 mm) ís `ctc_mm.woofer_woofer` (275,8). Twee onafhankelijk opgeschreven getallenreeksen die samenvallen tot op de afronding — als zij ooit uiteenlopen weet niemand meer met wélke een referentie berekend is, en dat is de F3c-les over herkomst toegepast op de enige plek waar dezelfde afstand twee keer is opgeschreven.

  **Wat haar alsnog zou kunnen bijstellen.** Een verticale meting over het kruisgebied van een weg met twee bronnen, waarvan de gemeten dip zegt welke van de vier fracties het gedrag verklaart. Dat zou de fracties niet tot een keuze terugbrengen — het besluit onder (a) hangt daar niet van af — maar het zou wél zeggen welke van de vier het meest voorspellend is, en dat is een nuttige rangorde in de **rapportage**. Op deze meetset ligt die meting er niet. **Gesloten wat het besluit betreft; open als verfijning.**

- V21 (de ingevoerde DC-weerstand kwam nooit aan — één hiërarchie, twee implementaties) — bij F4b, en het lek was drie fasen oud.

  **Wat het was.** `V2RunSettings.reOhmByModel` bestond sinds F2, werd sinds F2 gelezen (`worker.ts`, `measurementFacts`), en werd door niemand ooit gevuld — `grep -rn "reOhmByModel" src/` gaf uitsluitend treffers in `worker.ts` zelf. Het A5a-formulierveld dat de ontwerper invult ging een andere kant op: `App.tsx` → `AdapterBranch.measuredReOhm` → `buildEngineV2Input` → `buildReport`, en daar hield het op. **De hele F3b-verbetering was rapportage-only.**

  **Waarom de terugval niet onschuldig was.** De worker riep `estimateRe(curve)` aan zónder opties, en `impedance.ts` schakelt de motionele fit alleen in als `opts.fundamentalHz` én `opts.motionalPeaks` gezet zijn. Beide ontbraken per constructie — de worker heeft de geclassificeerde resonanties niet, die zitten in de opnamepas — dus de fit was altijd `null` en de **directe aflezing** won altijd. Op het wooferpaar van casus 1 is dat 3,81 Ω tegen een opgeloste 2,90 Ω. De M-E-inversie `R_s ≤ R_e·(q−1)` is lineair in R_e, dus de grens stond **32 % te ruim**, terwijl het paneel ernaast het juiste getal toonde. Eén hiërarchie, twee implementaties, en zij waren het oneens.

  **Hoe aangetoond.** Door de échte route: `handleV2Request` met de payload eerst door `structuredClone`, en de assert op de `R_e_ohm` en `R_e_source` die de opgeleverde `qes-series-r`-grens meedraagt. Zonder payload leest die bron letterlijk "no resolved R_e reached this run"; mét payload staat de doorgegeven waarde er verbatim in en is de grens `R_e·(q−1)` daarvan. Het getal in de test is de eigen aflezing van de fixture maal een factor — geen enkele Ω-waarde staat in de test.

  **Wat gewijzigd is.** De opnamepas blijft de énige plek waar A5c.1 gelopen wordt; de worker leidt niets meer opnieuw af. `measurementFacts.ts` (nieuw) draagt de opgeloste R_e mét zijn herkomsttekst over de grens, `App.tsx` vult hem bij `v2ScanSettings` uit het rapport dat er toch al ligt, en de sleutelvertaling gaat via `driverIds` + `canonicalModelForRole` — het rapport spreekt netlist-modelnamen, de worker canonieke, en dat zijn niet dezelfde. De terugval in de worker is **niet** verwijderd (de route zonder rapport heeft hem nodig) maar loopt alleen nog als de payload niets levert, en zegt dat dan in `collect.notes`. Sinds F4b heeft dat notitiekanaal ook een scherm: `App.tsx` verzamelt de notities van de kandidaten, ontdubbelt ze en toont ze bij de scanuitslag. **Een kanaal zonder lezer rapporteert niets — dat is hoe dit lek en V23 samen drie fasen overleefden.**

  **De vingerafdruk.** Nieuw ingrediënt `facts` (A5e.4): een run op de opgeloste feiten en een run op de terugval waren tot F4b niet te onderscheiden — zelfde seed, zelfde ontwerp, zelfde vingerafdruk, en één van de twee deelde door het verkeerde getal. De herkomst zit erin naast de waarde, want 2,90 Ω van een meter en 2,90 Ω uit een fit zijn dezelfde grens en een andere bewering. `determinism.test.ts` weigerde de build tot het nieuwe ingrediënt zijn eigen mutatie kreeg — precies waarvoor die dekkingsassert bestaat.

  **Acceptatie op casus 1.** De R_e die de grens oversteekt IS het getal waar de klasse-B-referentie `kandidaten.*.Qes_mult` door deelt: `factsForWorker(...).reOhmByModel.woofer` gelijk aan `kandidaten._M_E_parameters.R_e_ohm` uit het referentiebestand — het parameterblok dat F4a moest aanleggen omdat die waarde tot dan alleen in een constante in de fixture bestond. Eén R_e, één herkomst, aan beide kanten van de grens. Zonder ingevoerde waarde steekt de **motionele fit** over en aantoonbaar niet de directe aflezing (het verschil ligt buiten de ohm-klasse) — het getal dat de worker met eigen middelen nooit kon bereiken.

  **Waarom de v1-route niet geraakt is.** Alles wat hier beweegt zit in `engine2/` en in de v2-tak van `App.tsx`. `optimWorker.ts` is byte-onaangeraakt en importeert nog steeds niets uit `engine2/`; `netOptimizer.ts`, `threeWayChain.ts` en `designChain.ts` zijn niet gewijzigd. Met de vlag uit bestaat `v2ScanSettings` niet en is `engineV2Report` `null`, dus de payload wordt niet eens opgebouwd. `toggleRegression.test.ts` blijft byte-identiek.

- V22 (de meetgeldigheid werd bij de grens weggegooid — V15, één laag lager) — bij F4b.

  **Wat het was.** `worker.ts` zette `validHz[model]` op `[grid[0], grid[grid.length-1]]`: het hele analyseraster, voor élke driver. De A5b.1-geldigheidsintervallen — 1/T uit de meetheader, geclipt op de omvang van de bestanden — staken de grens niet over. `freezeGateReference` kreeg dat raster mee, en `passbandOf` klemt de doorlaatband aan **beide** kanten op precies die "fallback" (`analysis.ts`: `[Math.max(lo, fallback[0]), Math.min(hi, fallback[1])]`). Met het volle raster is die klem inert, dus de bevroren doorlaatbanden en elke inversie die er een leest oordeelden ook op frequenties waarvan de meting zelf zegt dat ze er niet zijn.

  **Waarom dit V15 is en geen nieuw soort fout.** V15 legde vast dat een referentie die een band gebruikt die band moet meedragen, anders is zij niet reproduceerbaar. Hier gebruikt een *grens* een band, en die band werd bij de overdracht vervangen door een ruimere — dezelfde fout één laag lager: niet "de referentie vergat haar band" maar "de route gooide haar band weg". En net als bij V15 had de engine gelijk en de route ongelijk: de opnamepas had het interval correct afgeleid.

  **Hoe aangetoond.** Met een fixture waarin raster en geldigheid *bewust* verschillen: de gemeten tweeter-impedantie wordt boven een gekozen plafond maal acht genomen, en het plafond wordt als geldigheidstop meegegeven. De M-C-voorbound draagt de mediane |Z| over de doorlaatband als parameter, dus het effect is direct afleesbaar — **45,7 Ω zonder interval tegen 5,8 Ω met interval**, en de grens zelf beweegt mee. De onderkant van de sweep blijft schoon, met opzet: daar wonen de directe R_e-aflezing en de resonantieclassificatie, en die vervuilen zou de run laten falen om een reden die niets met geldigheid te maken heeft. Een interval dat *ruimer* is dan het raster wordt op het raster geklemd en niet geloofd — een array houdt op waar hij ophoudt.

  **Wat gewijzigd is.** `validHzByModel` in de payload, gevuld uit `d.onAxis.bandHz` van het rapport; in de worker komt `validHz[model]` daaruit, geclipt op het raster, en het raster is uitsluitend terugval — genoteerd in `collect.notes` en in de vingerafdruk. Op casus 1 is het interval dat oversteekt aantoonbaar de header-gate-vloer die het referentiebestand noteert (`afgeleide_parameters.woofer.FF_vloer_header`), en aantoonbaar smaller dan het analyseraster.

  **Waarom de v1-route niet geraakt is.** Zelfde argument als V21: het veld bestaat alleen in de v2-payload en wordt alleen door de v2-worker gelezen.

- V23 (een ingevuld veld dat niets doet, en dat nergens stond) — bij F4b, en het is de kleinste van de drie reparaties met de scherpste les.

  **Wat het was.** `worker.ts` geeft de budgetinversie `gapBudgetDb: null` mee, met een `TODO(A5e.2)` erboven: A5d.4(a) wil het ankerniveau ná baffle step in de beoogde opstelling, en dat is een eigenschap van het doelcurve-object — een open besluit. `bounds.ts` slaat de dempingsgrens dan over met een `continue` en zónder notitie ("het anker heeft per definitie geen verzwakkingsbudget"), want vanuit die functie gezien is een ontbrekend gap-budget geen ontbrekende invoer. Er volgde wél een noot in `collect.notes` — en `collect.notes` bereikte het scherm nooit. Resultaat: een ontwerper die `dampingMarginDb` invult krijgt een veld dat niets doet en dat nergens zegt dat het niets doet.

  **Waarom dat een doctrine-schending is en niet alleen een gemis.** F0 legde vast: **leeg = geen oordeel**. Het spiegelbeeld stond nergens: *ingevuld en niet toegepast = ook geen oordeel*. Een getal dat in een veld staat ziet eruit alsof het meedoet.

  **Wat gewijzigd is — en vooral wat níet.** De TODO staat er nog, het besluit blijft open, en er is geen gap verzonnen. Wat er bij is gekomen is één zin in `predesign.boundNotes`, die het paneel al rendert bij de budgetsectie: "stated — not applied on this route (waiting on A5e.2)". Met de asymmetrie erbij, want die is echt en de lezer heeft er recht op: in het **rapport** wordt de marge wél toegepast (dat heeft de verankerde gaps om hem bovenop te leggen), het is de **zoektocht** die hem niet kan gebruiken. Zonder ingevuld veld verschijnt er niets — een ongevraagd veld verdient geen zin.

  **Bijvangst — GEREPAREERD IN F4b2.** Op dezelfde route droeg `BudgetWay` geen `nearField` en geen `impedance` (`grep` op `worker.ts`: nul treffers), dus óók `lfBumpBudgetDb` kon daar nooit tot een grens komen — hij leverde altijd de noot "needs a near-field measurement, the loaded impedance sweep and the impedance peak". Een vierde gat van dezelfde familie, buiten de drie die de audit noemt, en al aanwezig sinds F2. F4b maakte het **zichtbaar** door `collect.notes` een scherm te geven; F4b2 heeft het gedicht — de nabij-veldkromme, de impedantiesweep en de fundamentele resonantie steken sindsdien over als feiten. Zie **V25** voor de vier-inversies-tabel, voor de meting die de vorm van die reparatie bepaalde (het ketenraster levert geen weigering maar een grens van 1 048 576 mH), en voor wat er wél open blijft.

  **Waarom de v1-route niet geraakt is.** De noot zit in het v2-rapportmodel, dat met de vlag uit niet gebouwd wordt.

- V24 (hardgecodeerde kruispunt-defaults in `App.tsx`, en waarom ze blijven staan) — bij F4b, audit §7.

  **Wat het was.** Vier `useState`-defaults en hun laad-terugvallen zetten het kruispunt van een ontwerp: 2200 ± 400 Hz voor de bovenste overname en 400 ± 150 Hz voor de onderste, plus 1800/3500 Hz als migratiewaarden voor een oud projectbestand. Het zijn frequenties uit één project die een ánder project sturen — `xoLowPin` en `xoHighPin` kooien de structuurzoektocht — en de lage geeft een bereik van 250–550 Hz terwijl de A5d.3-meetgeldigheidsvloer voor dat paar op 396,7 Hz ligt. **Het bereik begint 147 Hz onder de laagste frequentie die de app zelf vertrouwt.** Dezelfde klasse die P6 verbiedt; `p6Lint.test.ts` scande alleen `src/lib/engine2/`, dus de regel bestond en de bewaking niet.

  **Waarom ze niet weg konden.** De toggle-invariant zegt dat de app met de vlag uit byte-identiek is aan de app van vóór engine2. Deze waarden afleiden op de v1-route verándert v1-gedrag, en dat is precies het ene wat dit project niet doet.

  **Wat gewijzigd is.** Ze staan verzameld in één benoemd blok `V1_PIN_DEFAULTS_LEGACY`, met de audit-verwijzing en de reden erbij, en **geen enkele waarde is veranderd**. `p6Lint` heeft een tweede scope gekregen op `src/App.tsx`: een frequentie-literaal op een regel die een pin-identifier noemt is verboden tenzij die regel het legacy-blok noemt, plus een **snapshot** van het blok zodat er niets bij kan komen zonder dat de test breekt — een benoemd huis voor een schending helpt alleen zolang het klein blijft. De scope is bewust smal (deze namenfamilie, niet "elke frequentie in App.tsx"): een blanket-regel zou plotgrenzen, weergavelimieten en een notch-default meepakken, en een lint die wolf roept wordt weggehaald.

  **Wat de lint meteen ving.** De audit noemde vier `useState`-defaults en de laad-terugval. Er waren er méér: `xoRangeValue` — de **tweewegroute** — droeg dezelfde twee literalen nog eens (`num(xoFreqHz, 2200)`, `num(xoMarginHz, 400)`), en de migratiewaarden 1800/3500 stonden ook nergens in de opsomming. De lint vond ze binnen een minuut. Dat is het argument voor de lint in één zin: een handmatige inventarisatie van literalen is compleet tot zij het niet is, en niemand merkt het verschil.

  **De v2-route neemt zijn pin ergens anders vandaan.** `xoPinsValue` splitst nu: de getypte waarde van de ontwerper wint altijd — dat is de F3b/F3c-doctrine, de app maakt de onenigheid zichtbaar en doet dan precies wat haar gezegd is — maar wanneer een veld niets bruikbaars bevat valt de v1-route terug op het legacy-blok en de v2-route **niet**. Die neemt de A5d.3-band via de F3c-aanbeveling, en is er geen venster af te leiden, dan is er **geen pin** en wordt dat gemeld in `v2RunNotes` bij de scanuitslag. Een stille 400 Hz is de fout die daarmee weg is. De lint bewaakt die splitsing structureel: de legacy-namen mogen alleen binnen de `!useV2Pins`-tak gelezen worden.

  **Waarom de v1-route niet geraakt is.** Het blok is een hernoeming, geen herwaardering: dezelfde getallen, dezelfde plekken, dezelfde volgorde. De tweewegroute (`xoRangeValue`) blijft volledig v1 — die is nog niet op v2 aangesloten (`TODO(F2c)`) — en gebruikt dus ook nog het blok. `toggleRegression.test.ts` is groen, en dat is het bewijs.

- V25 (het vierde gat: de LF-bult-inversie had nooit invoer — en het raster loog niet, het zweeg) — bij F4b2.

  **Wat het was.** V23 noteerde het als bijvangst: `BudgetWay` kreeg op de workerroute geen `nearField` en geen `impedance`, dus `lfBumpBudgetDb` kon daar nooit tot een grens komen. Gemeten met alle vier de budgetten tegelijk gewapend, door de échte route:

  | # | inversie | gedreven door | wat zij nodig heeft | rapportroute | workerroute vóór F4b2 | na F4b2 | na V45 |
  |---|---|---|---|---|---|---|---|
  | 1 | `qes-series-r` | `budgets.qesMultiplierMax` | `reOhm`, `lowest` | ✅ | ✅ (sinds F4b op de opgeloste R_e — V21) | ✅ | ✅ **en op casus 1 GEWAPEND** (2,4) |
  | 2 | `bump-series-l` | `budgets.lfBumpBudgetDb` | `nearField`, `impedance`, `fPeakHz`, `lowest`, `pathROhm`, optioneel `crossingAboveHz` | ✅ | ❌ **dood** | ✅ **hersteld** | ✅ + geleverde-netwerk-toets |
  | 3 | `gap-pad-r` | `budgets.dampingMarginDb` | `gapBudgetDb` ≠ null, `zPassbandMedianOhm` | ✅ | ❌ dood (`gapBudgetDb: null`) | ❌ **blijft dood, met reden** | ✅ **BEREIKBAAR** (casus 1 wapent hem niet — P4) |
  | 4 | `drive-series-c` | `gates.maxDriveOnFsDb` | `highPassProtected`, `fsHz`, `zPassbandMedianOhm`, `order?` | ✅ | ✅ maar altijd op orde 1 | ✅ op de gedeclareerde orde | ✅ |

  **2 van 4, en dat was de stand sinds F2** — niet iets wat F4b veroorzaakte. Wat F4b deed was `collect.notes` een scherm geven; daardoor werd zichtbaar wat er al drie fasen stond. De audit-tabel in §3 zegt "3 van 4" en draagt sinds F4b2 een gedateerd erratum; de tabelregel zelf is niet aangeraakt, omdat F4c en F4d er met paragraafnummers naar verwijzen.

  **De meting die de reparatie van vorm deed veranderen, en mijn eerste antwoord was fout.** De vraag was: volstaat het raster dat de worker al heeft? Ik heb hem eerst verkeerd gesteld — ik mat de PRECISIE van de inversie op het raster van het rapport (de impedantiespanwijdte, 10 Hz–20 kHz) en vond 0,0143 dB verschil met de klasse-A-referentie, ruim binnen de dB-klasse van 0,15. Conclusie: het raster volstaat, de impedantie hoeft niet over.

  Dat was het verkeerde raster. De worker houdt de impedantie op het KETENRASTER, en de ondergrens daarvan is de ver-veldspanwijdte — in `App.tsx` minstens 200 Hz. M-D evalueert over [0,7·f_p, 2,2·f_p], op deze woofer **36,7–115,2 Hz**: volledig onder dat raster. En de inversie weigert daar niet. Zij leest nergens bult, verdubbelt haar bracket tot `BOUND_BRACKET_DOUBLINGS` en levert **1 048 576 mH** af — duizend henry, aangeboden als zoekgrens.

  Het was dus geen precisievraag maar een DEKKINGSvraag, en het antwoord staat aan de andere kant van de streep: de sweep steekt over, op zijn eigen raster, met zijn geldigheidsinterval erbij (de lek-2-vorm van F4b). Er is bewust **geen terugval** op de rasterkopie die de worker al heeft: een inversie zonder data onder haar band hoort géén grens te leveren, niet een grote.

  **Om dezelfde reden steekt f_p zelf over.** `fPeakHz` werd in de worker geclassificeerd uit dezelfde rasterkopie. Een classificatie die de resonantie niet ziet vindt niets — of vindt een conusmode en noemt die f_s, precies de fout waarvoor A5c.2's fasetest bestaat (V8b). De opnamepas heeft hem al opgelost op de volle sweep; de worker consumeert. Dat repareert stilzwijgend ook M-C, dat zijn f_s uit diezelfde classificatie haalde.

  **Wat er verder is bijgekomen, en waar het vandaan komt.** `order` en `crossingAboveHz` zijn NETWERKeigenschappen, geen meetfeiten, en komen daarom niet via `measurementFacts` uit het rapport — de orde in het rapport is de PRE-DESIGN-orde die de ontwerper voor een overname heeft ingesteld (`orderByPair`), en die over een v1-kandidaat leggen beschrijft die kandidaat als iets wat hij niet is: casus 1's HUIDIG is een 2e-orde ontwerp onder een 4e-orde vensterinstelling. Beide komen dus van de workerkant, dezelfde scheiding als `pathROhm`: de orde uit de gedeclareerde uitlijning die de kandidaat draagt (`structureLow`/`structureHigh` op de driewegroute, de filterspec op de tweewegroute; 'auto' betekent dat er niets gedeclareerd is en de voorbound valt terug op zijn eigen gedocumenteerde default), het kruispunt uit `xoLow`/`xoHigh`. `TODO(F4c)` staat op beide: het kandidaat-object maakt de bron expliciet.

  **`pathROhm` verschilt tussen de routes, en dat blijft zo.** Het rapport heeft geen netwerk en geeft 0; de worker kent het seed-netwerk en geeft de werkelijke serieweerstand. Dat is geen onenigheid maar twee verschillende vragen. De acceptatietest voedt daarom BEIDE kanten het parameterblok van de klasse-A-referentie (`pad_R_ohm` uit de fixture) in plaats van wat elke route zelf zou produceren — anders zou de test een verschil meten dat er hoort te zijn.

  **Hoe aangetoond.** Vijf asserts op de inversie zelf: dezelfde invoer uit het rapport en uit de payload leveren een byte-identieke grens; die grens IS de klasse-A-referentie `maxL_bij_Rs0_5_budget2_5dB_mH` binnen haar eigen tolerantieklasse (de assert staat op de METRIEK, niet op de millihenry — een geïnverteerde grens erft de tolerantie van de metriek die zij inverteert); en het ketenraster levert aantoonbaar de absurde grens op, zodat de reden om de sweep mee te sturen in de suite staat en niet alleen in dit boek. Drie asserts door de échte route met `structuredClone`: met beide krommen wordt de grens bereikt, met geen van beide niet en de noot zegt welke invoer ontbrak, en met alleen het nabije veld nog steeds niet — de sweep is de helft die niet uit het analyseraster verzonnen mag worden.

  **De vingerafdruk.** Het F4b-ingrediënt `facts` is uitgebreid van twee naar vijf feiten (R_e, A5b.1-geldigheid, resonantie, nabij veld, sweep) in plaats van dat er een ingrediënt bij kwam — de naam beschrijft nog steeds precies wat erin zit. Omdat de NAAM niet verandert, ziet de dekkingsassert in `determinism.test.ts` die groei niet; daar staat sinds F4b2 een tweede assert naast die elk van de vijf apart de sleutel moet zien bewegen, plus een telling zodat een zesde feit niet ongetest kan meeliften.

  **Waarom de v1-route niet geraakt is.** Alles zit in de v2-payload, in `engine2/` en in de v2-tak van `App.tsx`. `optimWorker.ts` is byte-onaangeraakt, `netOptimizer.ts`, `threeWayChain.ts` en `designChain.ts` zijn niet gewijzigd, en de inversieformules in `bounds.ts` evenmin — alleen wat zij als invoer krijgen. Met de vlag uit wordt de payload niet opgebouwd. `toggleRegression.test.ts` is byte-identiek.

  **Openstaand — en de eerste helft is bij V45 gesloten.** De dempingsmarge (inversie 3) wachtte op A5e.2 en op niets anders; sinds V45 bestaat het doelcurve-object, steekt het verankerde budget als meetfeit de grens over en is de inversie **4 van 4 bereikbaar**. Bereikbaar en niet gewapend: casus 1 stelt geen dempingsmarge, dus zij levert daar geen grens (P4) — waarom niet staat in V45 onder *"wat gap-pad-r op deze casus niet kan"*. En `crossingAboveHz` is op de tweewegroute het meetkundig midden van het gestelde bereik in plaats van een kruispunt, omdat die route een RANGE draagt en geen punt — F4c maakt dat expliciet.

- V26 (wie mag kiezen: de 37 tuner-instellingen ingedeeld, en de v2-run vergrendeld) — bij F4c.

  **Wat het was.** De v2-route zette vier van de tuner-instellingen en nam de rest letterlijk over uit wat de v1-keten toevallig had gebouwd (audit §2.2). Onschadelijk zolang v1 óók de kandidaten kiest — instellingen en kandidaat komen dan uit dezelfde hand en zijn het per constructie eens. Het houdt op onschadelijk te zijn zodra v2 een eigen kandidaat aanlevert: een v1-hellingsdoel, een v1-kooi of een v1-pin trekt die kandidaat dan stil terug naar de v1-keuze, en niets zegt het.

  **Twee correcties op de aanname vooraf, en de tweede is de belangrijkste.**

  *Ten eerste: het zijn er 37, geen "ruim vijftig".* De audit schatte het aantal op ruim vijftig; geteld op de top-level sleutels van `NetOptimizeOptions` zijn het er 37. Geen verschil dat iets aan de redenering verandert, wel een getal dat nu klopt en dat een test bewaakt.

  *Ten tweede: `run.ts` is niet de route die de app neemt.* De `Omit<>` daar begrenst `runV2Optimization`, en die wordt uitsluitend door twee tests aangeroepen — `grep` bevestigt het. De scan-knop gaat via de wórker, en daar bouwt de kéten (`threeWayChain.ts`) de tuner-opties uit `Chain3Settings` en merget de engine-hook als láátste. Die volgorde is de hefboom: wat de hook noemt, wint. Alleen `run.ts` afsluiten zou een deur op slot doen die niemand gebruikt.

  **De indeling.** Drie klassen, gedefinieerd in Deel A (A3j) in algemene bewoordingen; de tabel hieronder is de bijlage voor déze tuner en geen norm. **Keuze** (25): bepaalt WAT er gezocht wordt. **Grijs** (5): gewichten die de scalar vormgeven en daarmee bepalen welk deel van het veld bezocht wordt — polish naar de vorm, keuze naar het effect (audit §6.4). **Polish** (7): bepaalt HOE er gezocht wordt binnen een gegeven keuze; mag overerven.

  **Wat gewijzigd is.** `run.ts`'s `tuneOptions` is versmald van "alles behalve de drie die v2 bezit" naar "alles wat geen keuze en geen gewicht is"; keuzes en gewichten komen binnen via twee nieuwe, benoemde objecten. **De compiler is de bewaking** — twee bestaande tests stopten meteen met compileren omdat ze `phasePriority` en `staged` door `tuneOptions` gaven, en dat is precies de vangst waarvoor de scheiding bestaat. Op de workerroute noemt de hook nu tien keuzes en vijf gewichten expliciet, teruggelezen uit de instellingen die de keten kreeg: **niets wordt hier gekozen**, en dat is het punt — de waarden zijn dezelfde, ze steken alleen benoemd over.

  **Wat er nog niet gesteld kan worden, en waarom dat een noot is en geen omissie.** Vijftien keuze-sleutels worden binnen de keten samengesteld (`xoRangePairs` uit de eigen kooi van de kandidaat, en verder `branchTargets`, `safety`, `snapPrefs`, `staged`, `audit`, `midBranch`, `angleData` en de solo-familie). Die hier herleiden zou een tweede implementatie van ketenlogica zijn, en dat is hoe twee beschrijvingen van één ding uiteen gaan lopen — V21's les, een laag hoger. Ze staan met naam en toenaam in `collect.notes`: *"Search choices still inherited from the v1 chain, not v2-derived: …"*. F4d verhuist ze naar de kandidaat.

  **De vijf grijze sleutels, elk met zijn motivering.**

  - `phasePriority` — verdeelt het budget tussen amplitude en fase. Zet hem hoog en de zoektocht bezoekt ontwerpen die fase kopen met vlakheid; zet hem laag en zij komt daar nooit. Dat is geen fijnafstemming, dat is welk deel van het veld bestaat.
  - `directivityWeight` — bepaalt of de energiegemiddelde respons meetelt. Op nul is de zoektocht op-as-blind voor bundeling; erboven wordt een ándere kandidaat de beste.
  - `powerFoldWeight` — het gewicht van de DI-vouwterm rond elk kruispunt. Weegt precies het gebied waar de kandidaat over overname gaat.
  - `dissipationWeight` — stuurt weg van serieweerstand vóór de laagste tak. De term bestaat omdat de tuner zonder niveau-anker een serie-R als goedkoopste niveauregeling gebruikt (19-08: R_s 7,15 Ω, Q_es ×3,24 won de ranking). Het gewicht bepaalt of die route open staat.
  - `costWeight` — budgetdruk bij het snappen. Een BOM-voorkeur van de ontwerper, geen numerieke instelling.

  Geen van de vijf is opnieuw gebalanceerd en er is er geen bijgekomen; F4c stelt ze alleen vast in plaats van ze te laten overwaaien. Een gewicht dat níemand stelt is de default van de tuner, en dát is ook een besluit: `run.ts` en de worker noemen sindsdien de gewichten die aan de tuner zijn overgelaten.

  **De twee vondsten uit F4b2 staan in dezelfde tabel** (rijen 38 en 39), want ze zijn van dezelfde soort ook al zijn het geen tuner-instellingen: de ondergrens van het ketenraster is een keuze die v1 stil aan de v2-route oplegt, en de orde bij uitlijning `'auto'` is een keuze-sleutel zónder declaratie.

  **Hoe aangetoond.** Dezelfde run twee keer uitgedrukt — de F4b2-vorm (alles door `tuneOptions`, gereconstrueerd met een cast langs het versmalde type heen, want de regressie moet vergelijken met wat de code déed en niet met een opgepoetste versie ervan) en de F4c-vorm (dezelfde waarden via `choices` en `weights`) — en de opgeleverde netwerken karakter voor karakter vergeleken. **Byte-identiek op beide seeds.** Met een assert ervoor dat de twee seeds aantoonbaar verschillende netwerken opleveren: zonder die assert zou "onveranderd op twee seeds" ook waar zijn voor een zoektocht die zijn seed negeert.

  **Wat wél verandert: de vingerafdruk.** `choices` is een nieuw ingrediënt, dus een run die zijn kandidaat stelde en een run die hem overerfde zijn niet langer identiek gestempeld — precies waarvoor het ingrediënt bestaat. Het netwerk is hetzelfde, de stempel niet, en een lezer die een oude vingerafdruk naast een nieuwe legt hoort dat te weten.

  **De regressie op de route die de app wél neemt (nagekomen bij F4c).** De eerste fixture pinde `runV2Optimization`, en het erratum onder audit §2.2 zegt waarom dat niet genoeg is: niets in de app roept die functie aan. Er is daarom een tweede fixture door de échte route — `handleV2Request` → `runThreeWayChain`, payload door `structuredClone` — met beide vormen erin: **inherited** (`runThreeWayChain` zónder v2-hook, dus zuivere overerving uit de keten) en **stated** (de route zoals hij nu is, met tien keuzes en vijf gewichten expliciet). Poorten en budgetten leeg in de payload, met opzet: met niets gewapend gaf de pre-F4c-hook aantoonbaar `{}` terug, zodat het énige verschil tussen de twee vormen F4c's herstellen is.

  **Uitkomst: byte-identiek, op geen enkele sleutel afwijking.** Dat is geen toeval maar de reden waarom de tien en de vijf zó gekozen zijn: elke sleutel die de hook herstelt geeft de keten verbatim door uit `s.*` (`threeWayChain.ts:360–396`), dus hem herstellen zet dezelfde waarde tweemaal. De sleutels die de keten TRANSFORMEERT — `staged` uit `s.targets`, `xoRangePairs` uit de eigen kooi van de kandidaat — worden juist niet hersteld, en dat is precies waarom.

  **Wat de meting er ongevraagd bij opleverde.** Op de workerroute **bereikt de seed de zoektocht niet**: de keten draait één keer en er is geen gejitterde start — die zit in `run.ts`. De twee seedrijen in de fixture zijn dus identiek. Dat is vastgelegd in plaats van weggepoetst: een wijziging die de seed wél laat doorwerken is een echte gedragswijziging, en dit is de plek waar zij zichtbaar wordt. Het betekent ook dat "twee seeds" op deze route geen tweede pad door de zoektocht toetst, en dat de dekking van deze regressie dus aan één kandidaat hangt (`xoLow` 500, `xoHigh` 3000). Uitbreiden vraagt een tweede kandidaat, niet een tweede seed.

  **Waarom de v1-route niet geraakt is.** `netOptimizer.ts` is niet gewijzigd, `threeWayChain.ts` en `designChain.ts` evenmin, en er is geen gewicht bijgekomen of herbalanceerd. Alles wat beweegt zit in `engine2/`. Met de vlag uit draait de keten precies het object dat zij altijd bouwde — de hook wordt niet aangeroepen. `toggleRegression.test.ts` is byte-identiek.

  ---

  **Bijlage V26 — de 37 tuner-instellingen, ingedeeld.** Regelnummers zijn `src/lib/netOptimizer.ts` tenzij anders vermeld. "wie zet hem" geldt voor de v2-route.

| # | sleutel | landt op | klasse | reden | wie zet hem op v2 |
|---|---|---|---|---|---|
| 1 | `phasePriority` | 815, 865 | **grijs** | verdeelt budget amplitude/fase — bepaalt welk deel van het veld bezocht wordt | v2-run (expliciet) |
| 2 | `rSourceDisqualifyOhm` | 872 | keuze | hard verbod: infeasible bron-R | v2-kandidaat |
| 3 | `loadFloor` | 873, 874, 1286 | keuze | hard verbod: afgeleide versterkervloer | v2-kandidaat |
| 4 | `ampMinLoadOhm` | 600, 881, 1875 | keuze | hard verbod: de vloer van de ontwerper | v2-kandidaat |
| 5 | `band` | 45 plekken vanaf 387 | keuze | wélke band beoordeeld wordt is wat "goed" betekent | v2-kandidaat |
| 6 | `maxIterations` | 816, 2319–2364 | polish | iteratiebudget; verandert niets aan wat gezocht wordt | mag overerven |
| 7 | `angleData` | 19 plekken vanaf 835 | keuze | wapent de directiviteitstermen; zonder is de zoektocht op-as | v2-kandidaat |
| 8 | `directivityWeight` | 866 | **grijs** | of de energiegemiddelde respons meetelt — andere winnaar | v2-run (expliciet) |
| 9 | `powerMetric` | 867 | keuze | kiest de DEFINITIE van de vermogensmaat ('smooth' / 'legacy') | v2-kandidaat |
| 10 | `powerFoldWeight` | 1116 | **grijs** | weegt precies het gebied rond de overname | v2-run (expliciet) |
| 11 | `errorSmoothOct` | 1129, 1131 | ~~polish~~ → **keuze** *(28-08-2026, V38-fix)* | ~~gladding van de zoek-foutmaat; poorten en doelen blijven op het rauwe raster~~ — de beschrijving klopte, de gevolgtrekking niet: hij bepaalt WELKE KROMME de amplitudeterm een statistiek van is, en dat is dezelfde soort vraag als `band`. Eén sleutel, alleen die, verplaatste het geleverde netwerk 0,55–2,45 dB op drie topologieën | ~~mag overerven~~ → **v2-kandidaat** (`declareCandidateChoices`, onvoorwaardelijk 0) |
| 12 | `ampTarget` | 817, 1117 | keuze | wélke curve vlak gemaakt wordt (op-as of luistervenster) | v2-kandidaat |
| 13 | `breakupGuard` | 10 plekken vanaf 818 | keuze | ontwerpregel op stopbandlek naast het kruispunt | v2-kandidaat |
| 14 | `staged` | 25 plekken vanaf 1216 | keuze | het DOEL waar de trapmethode aan gehouden wordt | v2-kandidaat |
| 15 | `xoRange` | 1939 | keuze | pint het akoestische kruispunt | v2-kandidaat |
| 16 | `phaseMetric` | 819, 1906, 1978 | keuze | kiest de fasemaat; "must match the design optimizer's setting" | v2-kandidaat |
| 17 | `onStage` | 820, 1255–1275 | polish | voortgangscallback; beïnvloedt niets (V17: een etiket is geen meting) | mag overerven |
| 18 | `catalogSnap` | 3200 | keuze | bindt de catalogus of niet — een ontwerpbesluit | v2-kandidaat |
| 19 | `costWeight` | 385, 3206 | **grijs** | budgetdruk bij het snappen: een BOM-voorkeur, geen numerieke instelling | v2-run (expliciet) |
| 20 | `snapPrefs` | 7 plekken vanaf 2134 | keuze | welke serie, welke tier per positie | v2-kandidaat |
| 21 | `acousticSlopes` | 855–860 e.v. | keuze | de nagestreefde helling per flank | v2-kandidaat |
| 22 | `xoRangePairs` | 1820, 2019 | keuze | de kooi per aangrenzend paar | v2-kandidaat (nu nog keten) |
| 23 | `dissipationWeight` | 868 | **grijs** | opent of sluit de serie-R-route naar niveau-aanpassing | v2-run (expliciet) |
| 24 | `xoFloorPairs` | 2025 | keuze | stijve fysica-vloer per paar | v2-kandidaat |
| 25 | `xoPinHard` | 1819, 1949–2032 | keuze | stijve barrière i.p.v. zachte pin (alleen reparatiepas) | v2-kandidaat |
| 26 | `solo` | 26 plekken vanaf 822 | keuze | topologie: nul driverparen | v2-kandidaat |
| 27 | `soloSensitivityDb` | 849 | keuze | de code noemt hem zelf "A DESIGNER'S CHOICE, not a constant" | v2-kandidaat |
| 28 | `soloTargetLevelDb` | 1614–1643 | keuze | ÍS de doelfunctie in solo-modus | v2-kandidaat |
| 29 | `branchTargets` | 1443, 1447, 2011 | keuze | de leiband: het contract per tak | v2-kandidaat |
| 30 | `zFloorStrict` | 3066, 3110, 3673 | keuze | verzet de lat van de reparatiepas | v2-kandidaat |
| 31 | `safety` | 31 plekken vanaf 439 | keuze | volle-band-verbod op degeneratie | v2-kandidaat |
| 32 | `midBranch` | 824 | keuze | topologie: twee paren i.p.v. één | v2-kandidaat |
| 33 | `audit` | 36 plekken vanaf 401 | keuze | poort 4, het fysieke onderdelenaudit | v2-kandidaat |
| 34 | `gateViolation` | 539, 975–1019 e.v. | polish (v2-bezit) | de poorthaak; v2 zet hem sinds F2 | v2-run |
| 35 | `onGateEvaluated` | 1023 | polish | instrumentatie; "nothing here may influence a decision" | mag overerven |
| 36 | `valueCeilings` | 2196, 2198 | polish (v2-bezit) | A5d.6-inversie; v2 zet hem sinds F2 | v2-run |
| 37 | `valueSumCeilings` | 2216 | polish (v2-bezit) | A5d.6-somplafond; v2 zet hem sinds F2 | v2-run |
| 38 | ketenraster-ondergrens | `App.tsx:4128` | **keuze** | ver-veldspanwijdte als hard getal; F4b2 mat dat de LF-bult-inversie daarop 1 048 576 mH afleverde | v2-kandidaat — nog niet gezet |
| 39 | orde bij uitlijning `'auto'` | `worker.ts` (F4b2) | **keuze zonder declaratie** | `structureLow/High` is `undefined` bij 'auto', dus `drive-series-c` valt terug op zijn default terwijl de rapportroute de echte orde heeft | v2-kandidaat — moet de orde per flank altijd dragen |

  **GEDATEERDE CORRECTIE OP RIJ 11 (28-08-2026, V38-fix), en zij is de enige herclassificatie die deze tabel kent.** "Mag overerven" is geen beschrijving maar een CLAIM, en bij `errorSmoothOct` was zij onwaar. De reden waarom hij polish werd is nog steeds letterlijk juist — hij gladt de zoek-foutmaat, en poorten, doelen en acceptatie blijven op het rauwe raster — maar wat daaruit werd afgeleid, dat een resolutieknop niet kan bepalen wélk netwerk wint, is gemeten en weerlegd: 2,45 dB op HUIDIG, 0,55–1,39 dB op twee gegenereerde kandidaten, met die ene sleutel als enige verschil. Sinds V38-fix stelt de kandidaat hem. Zie de V38-fix-entry voor het mechanisme, dat een ánder is dan V38 dacht.

  **NOOT BIJ RIJ 31 (`safety`) — WELKE BAND HET "VOLLE-BAND-VERBOD" WERKELIJK LEEST (01-09-2026, V47-nazorg).** De klasse verandert hier niet: het blijft een KEUZE en zij wordt door de v2-kandidaat gesteld. Wat erbij hoort te staan is de maat, want de kolom *"volle-band-verbod op degeneratie"* is de bedoeling en niet de meting. De regel vergelijkt `protSqDb` — het gemiddelde kwadratische tekort van de elektrische takoverdracht boven de beschermingsvloer, **geïntegreerd over de band onder `xoF/3` en gesommeerd over de paren** — van het geleverde netwerk met dat van het ZAAD. Daaruit volgen de twee eigenschappen die het A2-amendement generiek maakt: zij oordeelt RELATIEF (dus tegen wat het zaad toevallig droeg), en zij bereikt de eigen resonantie van de bovenste weg van een paar alleen bij een kruispunt boven `3·f_s`. "Volle band" slaat op waar zij DEGENERATIE zoekt — buiten de oordeelband, en dat doet zij nog steeds; het slaat niet op de band waarop haar beschermingsterm meet.

  **DE ANDERE POLISH-SLEUTELS, NAGELOPEN OP DEZELFDE AANNAME.** Gemeld, niet omgezet — de les van rij 11 is nu juist dat een classificatie verandert wanneer een METING haar verandert, en op verdenking omzetten zou dezelfde fout in spiegelbeeld zijn.

| sleutel | draagt nog "mag overerven"? | wat de aanname waard is |
|---|---|---|
| `onStage` (rij 17) | ja | **niet te weerleggen, structureel.** `(label, evals) => void`; de engine leest nooit een teruggave. Een instrumentatiehaak die niets teruggeeft kán geen uitkomst verplaatsen — dat is een eigenschap van zijn type en geen aanname. |
| `onGateEvaluated` (rij 35) | ja | idem: `(info) => void`, en de code zegt het zelf ("nothing here may influence a decision"). |
| `maxIterations` (rij 6) | ja | **DE ENIGE ECHTE OVERLEVENDE, en hij verdient rij 11's behandeling.** Hij bepaalt waar de zoektocht STOPT (`netOptimizer.ts:3093`: `maxIterations ?? max(700, 140·vrij)`), geen enkele keten stelt hem, en op de v2-route wordt hij alleen gezet als een determinisme-budget dat doet. Nooit gemeten wat hij kost: V38 zag dezelfde topologie 478 tegen 891 seconden lopen op één andere sleutel, dus het iteratiebudget is aantoonbaar geen constante over armen heen. **V39-familie.** |
| `gateViolation`, `valueCeilings`, `valueSumCeilings` (34, 36, 37) | nee | v2-bezit sinds F2 — er is niets om van te erven. |
| `rejectedTuneReport` (V31), `zFloorBarrierImpedance` (V33), `dissipationReferenceReOhm` (V37) | nee | v2-bezit, alle drie met hun eigen argument in `choices.ts`. |

  **AANVULLING (28-08-2026, V41): DEZE TABEL DEKT ÉÉN LAAG, EN DAT IS SINDS V41 EEN EXPLICIETE UITSPRAAK.** Elke rij hierboven is een sleutel van `NetOptimizeOptions`, en `choiceKeyGuard.test.ts` bewaakt dat die verzameling VOLLEDIG geclassificeerd is. `Chain3Settings` — de laag waar de kandidaat langskomt vóórdat de tuner iets ziet — is dat niet, en V38 tekende dat op als beslispunt D. V41 sluit daarvan twee sleutels, met een eigen lijst (`CHAIN_CHOICE_KEYS` in `chainChoices.ts`) die naast deze tabel staat en nadrukkelijk niet erin:

| sleutel | laag | klasse | waarom | herkomst op de v2-route |
|---|---|---|---|---|
| `eqBands` | `Chain3Settings` | **keuze** | het budget snijdende EQ-banden dat de ONTWERPSTAP per tak mag voorstellen — en een EQ-band is de enige weg waarlangs `deriveTopology` een val op een gemeten breakup kan voorstellen. Ongesteld is in `designThreeWay` een stille NUL, niet "geen oordeel": het omgekeerde van P4 | v2-kandidaat (`DEFAULT_EQ_BANDS_PER_DRIVER`, de eigen standaard van de app én van de gulzige ontwerpstap) |
| `leanTargetDb` | `Chain3Settings` | **keuze** | de fitfout van de kale ladder waaronder de SYNTHESESTAP geen Zobel, Fs-val of top-octaaf-hold koopt. Was tot V41 geen sleutel maar een afleiding uit `targets.rippleDb` — het stopdoel van de trapmethode, vijf keer zo ruim — dus een kandidaat kon hem principieel niet stellen | v2-kandidaat (`SYNTHESIS_LEAN_DEFAULT_DB`, de eigen standaard van `synthesize`) |

  **De reden dat het bij twee blijft is dezelfde als de reden dat rij 11 verplaatst is:** een classificatie beweegt wanneer een MÉTING haar beweegt. Voor deze twee is die meting er (45 van de 45 takken, en 0 van de 10 netlists met een enkele val, Zobel of shelf); voor de overige ongeveer dertig sleutels van `Chain3Settings` is zij er niet, en een lijst die ze uit voorzorg zou claimen keert de les om. **De laag blijft dus open — V39.** De twee posten die V41's fixture-inventarisatie er concreet bij oplevert (`audit.fbHz` steekt de grens niet over; het grijze `costWeight` staat in de v2-fixture op de legacy-default in plaats van op wat de app stuurt) staan bij V39 in de A5e-horizon.

  **Wat er met rij 38 en 39 gebeurt.** Beide zijn geclassificeerd en geen van beide is in F4c gezet — dat zou kandidaatgeneratie zijn, en die is F4d. Rij 38 blijft op de v1-route byte-identiek; de v2-route mag hem expliciet maken zodra de kandidaat er een heeft. Rij 39 is de scherpste van de twee: het is een keuze-sleutel die op de v2-route soms helemaal niet gedeclareerd is, en het kandidaat-object uit F4d moet de orde per flank áltijd dragen — anders is "geen declaratie" opnieuw niet te onderscheiden van "orde 1".

- V27 (de kandidaatgeneratie verhuist — en wat er onderweg niet meeverhuist) — bij F4d.

  **Wat het was.** Engine v2 leidde de haalbare kruisvensters, de aanbevolen band en de orde-regels af, en gebruikte er niets van: de kandidaten kwamen uit `crossover3Variants`, dat op niveau-ankers en buurten van rauwe snijpunten werkt. De audit zei het scherp (§6.1): *"v2 kan vetoën en rapporteren. Het kan niet voorstellen."* Na F4d doet het dat wel — op de v2-route, en alleen daar.

  ---

  **DEKKINGSTABEL 1 — wat `crossover3Variants` per kandidaat oplevert, veld voor veld.**

  `Chain3Variant` heeft vijf velden. Dat is de hele kandidaat; al het andere dat een keten-invoer draagt is per RUN gedeeld, niet per kandidaat.

| v1-veld | wat het is | v2-bron | gedekt |
|---|---|---|---|
| `label` | `"W-M 411 · M-T 2520 Hz"` | `GeneratedCandidate.label` — paar, frequentie **en uitlijning**, want twee orden op één frequentie zijn twee kandidaten en de scan-tabel sleutelt op deze string | ✅ |
| `xoLow` | centrum van een schijf van de pin of van de buurt van het rauwe snijpunt | `crossings[0].hz` (`predesign/candidates.ts`) — positie *i* van *n*, gelijkmatig in octaafafstand over de aanbevolen band | ✅ |
| `xoHigh` | idem, bovenste as | `crossings[N-1].hz` — N-weg, niets telt tot twee | ✅ |
| `xoLowRange` | de kooi: ±halve tussenafstand, geklemd op rails | `crossings[0].cageHz` — ±halve tussenafstand **in octaven**, geklemd op het segment waarin de positie ligt | ✅ |
| `xoHighRange` | idem | `crossings[N-1].cageHz` | ✅ |

  **En wat `crossover3Variants` gebruikt om die vijf te maken — dáár zitten de niet-gedekte velden.** Elk hieronder is een expliciete ontwerpbeslissing van deze sessie, geen stille terugval.

| v1-mechanisme | v2-bron | besluit F4d |
|---|---|---|
| `overlapAnchor` op de NIVEAU-getrimde responsies (waar twee wegen elkaar ontmoeten na een voorlopige padding) | geen | **niet overgenomen.** Het anker is waar de *niveaus* kruisen van een luidspreker die nog niet bestaat — de padding is nog niet gekozen. De audit noemt het zelf zwak bewijs (§6.1), en A5d.3 levert een venster dat op meetgeldigheid, f_s, breakup-ernst en directiviteit staat. Een niveau-anker naast een venster zou een tweede, zwakkere mening zijn over dezelfde vraag. |
| `warm` (warm start: de kruispunten van het ontwerp dat nu in de sim staat) | geen | **niet overgenomen.** "Wat je al hebt" is geen uit de metingen afgeleid voorstel. De behoefte erachter — het bestaande ontwerp naast het veld kunnen leggen — wordt beantwoord door het vergelijkingsblok (`predesign/comparison.ts`), zonder een v1-kandidaat het v2-veld in te smokkelen. |
| `diAnchor` (DI-match, regel 9 / M-G) | nog geen | **niet overgenomen, en dit is de enige die spijt doet.** DI-continuïteit is een echte A5d.3-voorkeurszone en hoort in het VENSTER thuis als tweezijdige doelband (A4 M-G: "de snijzone van de twee D(f)-curven wordt dan een tweezijdige doelband"), niet als losse extra kandidaat. `xoWindow.ts` kent die zone nog niet. Openstaand item; tot dan sturen de vensters de generator en wordt de DI-match alleen gerapporteerd. |
| `hpFloorHz` (tweeter-HP-vloer ≥ 2×Fs) | `XO_FS_FACTOR_BY_ORDER` in het venster | ✅ gedekt, en **strenger**: k daalt met de orde (3,0 / 2,0 / 1,6 / 1,4), dus het venster wordt per kandidaat-orde opnieuw afgeleid in plaats van één vaste factor voor alles. |
| rails (`[250,1500]`, `[1200,7000]`, plafonds 2000/12000, vloer 150) | geen | **niet overgenomen, met opzet.** Dat zijn projectgetallen (P6, audit §7). Het venster vervangt ze volledig: waar geen venster is, is er geen kandidaat, en dat wordt gemeld in plaats van opgevuld. |
| `xoHigh ≥ 2,5 × xoLow` | monotonie-eis | **gedeeltelijk.** De generator eist dat de overnames **stijgen** en laat combinaties vallen die dat niet doen (met telling). De factor 2,5 zelf is een v1-getal en is niet overgenomen: als twee aangrenzende vensters elkaar overlappen is dát de bevinding, en die staat in de vensters. |
| `steps` (kandidaatstappen per as, 1/4/9 ketens) | `chainBudget` | ✅ gedekt, van betekenis veranderd: hij begrenst nu het VELD in plaats van het raster te definiëren. Boven het budget worden **posities** gedund en **orden nooit**, en beide aantallen worden gemeld. |
| duplicaat-inklapping (twee schijven op hetzelfde punt) | product + monotonie | ✅ gedekt; posities zijn per constructie uniek binnen een as. |

  ---

  **DEKKINGSTABEL 2 — de vijftien keuze-sleutels die F4c bij naam "still inherited" noemde.**

  F4c stelde er tien; de overige vijftien werden in de keten samengesteld en stonden met naam en toenaam in `collect.notes`. Ze zijn nu alle vijftien **verklaard** — en niet alle vijftien met een waarde, want zeven van hen hebben er geen. De drie toestanden zijn *stated*, *absent (met reden)* en *delegated (aan een genoemde stap, met reden)*, en `declarationCoverage` eist dat zij samen de sleutelverzameling **exact** dekken. Een sleutel die in géén van de drie zit, is precies de stille erving die F4d beëindigt, en de build breekt erop.

| sleutel | F4d-toestand | waarom |
|---|---|---|
| `xoRangePairs` | **stated** | de kooien van de kandidaat zelf. Hij had ze altijd al; sinds F4d steken ze benoemd over in plaats van via `input.xoLowRange`. |
| `xoFloorPairs` | **stated** | **de A5d.3-venstervloer**, niet de v1-fysicavloer. Dit is audit §6.3 in één regel: de vloer die stuurt is gesteld, de andere staat ernaast als tegenoordeel. |
| `staged` | stated | het rimpel/fase-doel van de ontwerper; de keten gaf `s.targets` verbatim door. |
| `safety` | stated | de volle-band-veiligheidsset; verbatim doorgegeven. |
| `snapPrefs` | stated | welke serie, welke tier; verbatim. |
| `audit` | stated | de onderdelenaudit; verbatim. |
| `loadFloor` | stated of **absent (P4)** | de afgeleide versterkervloer; niet ingevuld = geen oordeel, en dat staat er als reden in plaats van als ontbrekende sleutel. |
| `zFloorStrict` | stated | de keten zet hem zelf op `true` met een gestelde reden ("de seed is onze eigen synthese"). Dezelfde waarde, nu benoemd — F4c's argument: een waarde die niemand noemt is niet te onderscheiden van een besluit. |
| `xoRange` | **absent** | pint ÉÉN overname, en dit ontwerp heeft er N. `xoRangePairs` zegt hetzelfde N-weg; één as hier noemen laat de lezer raden welke. |
| `xoPinHard` | **absent** | de stijve barrière hoort bij de hold-the-pin-reparatiepas, die pas draait nádat een gepinde as ontsnapt is. Vooraf wapenen maakt van elke kooi een muur, en een kooi is boekhouding en geen belofte. |
| `solo` | **absent** | de solo-familie beschrijft een één-weg-ontwerp. |
| `soloSensitivityDb` | **absent** | idem. |
| `soloTargetLevelDb` | **absent** | idem. |
| `branchTargets` | **delegated** → de ontwerpstap van de keten | de leiband per tak volgt uit de uitlijning en de knieën die díe stap net heeft vastgesteld; hij bestaat niet vóórdat zij gedraaid heeft. Hem hier herleiden zou een tweede implementatie van ketenlogica zijn — V21, één laag hoger. |
| `angleData` | **delegated** → de keten-invoer | de gemeten hoeksets reizen al mee in de payload. Een tweede kopie is een tweede ding dat het oneens kan zijn met het eerste. |
| `midBranch` | **delegated** → de keten-invoer | de respons en de bijstelling van de middentak zijn `input.m` en `midAdjust`. Zelfde argument. |

  **De twee vondsten uit V26 (rijen 38 en 39).**

  - **Rij 39 (orde bij uitlijning `'auto'`) is GESLOTEN.** Een gegenereerde kandidaat kent zijn orde per flank altijd, dus hij stelt altijd een uitlijning (`structureLow`/`structureHigh` gebonden aan die orde) én stuurt `orderByModel` mee voor de pre-bound. "Geen declaratie" en "orde 1" zijn op deze route niet langer te verwarren.
  - **Rij 38 (ketenraster-ondergrens) is GEMETEN EN GESTELD, niet verplaatst.** Op casus 1 begint het analyseraster op 200 Hz terwijl de laagste A5d.3-venstervloer op 397 Hz ligt. Geen enkele kandidaat wordt onder die vloer geplaatst en de oordeelband is al op meetgeldigheid geclipt (audit §5), dus daar wordt niets gescoord. Wat overblijft is geen lek maar een **stilte**: de rasterrand komt uit de meetspanwijdtes en het fMin-veld, niet uit een afgeleide vloer. De v2-route zegt dat nu in de runnotities. *Waarom niet verplaatst:* het raster is `sim`, en daar tekent élke grafiek op dit scherm uit. Hem verzetten zou de rapportage-oppervlakken op de v2-route mee veranderen, en dat is een grotere wijziging dan F4d's opdracht — die zegt dat gedrag uitsluitend op de v2-route verandert, niet dat élk v2-oppervlak mag bewegen. Een lezer die dit betwist heeft een punt; het staat er daarom als afweging en niet als voldongen feit.

  ---

  **A5e.4 op de route die de app neemt.** Zie het tweede erratum onder audit §3 voor de meting per onderdeel. Kort: het **budget** werkt door (`maxIterations`), de **seed** en `starts` niet — de keten draait één keer per kandidaat en er is geen gejitterde start. Bij F4c was dat bijvangst; bij F4d is het een **besluit**: diversiteit komt uit kandidaten, niet uit gejitterde starts. Een kandidaat is een keuze die een ontwerper kan lezen en betwisten; een gejitterde start is toeval, en een veld dat uit toeval bestaat laat zich niet over topologie-klassen spreiden omdat niets zijn topologie koos. `DEFAULT_RUN_STARTS` staat daarom op **1**: de engine jittert niet meer uit zichzelf, een project dat erom vraagt krijgt het nog steeds, en de machinerie blijft getest. De assert *"de seed bereikt de zoektocht niet"* is bewust **bevestigd** in plaats van verwijderd, nu met een reden erbij, en er staat een tegenproef naast dat een andere KANDIDAAT de zoektocht wél bereikt.

  **Wat F4d aan de vingerafdruk toevoegt.** Het `choices`-ingrediënt was op deze route altijd leeg — `runV2Optimization` vult het en dat pad loopt niemand. Leeg was juist zolang v1 de kandidaten koos. `V2ScanSettings.candidateFieldKey` draagt sinds F4d het hele veld: elke kandidaat met kruispunten, kooi, orde en uitlijning, plus de generator-parameters en wat er gedund is.

  ---

  **`clampPin`: waar hij ingreep, en wat er met de A5d.3-vensters gebeurde.**

  Eén plek, `App.tsx` in `runVfOptimize`, direct na `xoPinsValue()` en vóór álles wat de pin gebruikt. Hij vuurt alleen wanneer het v1-venster `userClampedByData` heeft gezet — dat wil zeggen: de ontwerper (of, sinds F4b, de A5d.3-afleiding via `xoPinsValue`) heeft een bereik gesteld dat onder de v1-datavloer duikt. Dan wordt de pin **vervangen** door het midden van het v1-venster.

  De doorwerking is breed, want de geklemde pin gaat vervolgens naar: (a) `crossover3Variants` als zoekruimte, (b) `settings.xoLowPin`/`xoHighPin` en daarmee de kooi in de tune, (c) `judgeWindows`, waartegen het OPGELEVERDE kruispunt geoordeeld wordt, en (d) terug in `physWin3` als gebruikersvenster. Vier plaatsen, één substitutie, en het enige zichtbare spoor was een banner over iets anders. Live op het KOAN-project: aanbevolen band 396,7–448,5 Hz → 707–728 Hz, waarna de pre-start-raming meldde dat 4 van de 4 kandidaten buiten het A5d.3-venster 396,7–549,7 Hz vielen. De raming had gelijk.

  **F4d:** `clampPin` begint met `if (useV2) return pin;`. Op de v1-route byte-identiek. Op de v2-route wordt niets meer geklemd, en de twee vloeren komen naast elkaar te staan met hun herkomst (`predesign/floorComparison.ts`), inclusief de melding welk deel van het veld de ándere laag geweigerd zou hebben. Geen automatische verzoening: de twee beantwoorden verschillende vragen, en dat de v1-waarde won omdat hij eerder in de pijplijn zit is geen argument.

  ---

  **De uitkomst op casus 1.** *(HERZIEN BIJ V28 — lees dit blok als het verslag van wat F4d deed, niet als de huidige stand. De F3c-uitsnijding die de M-T-as van vijf posities naar drie bracht is opgeschort; het veld is nu vijftien kandidaten en de tabellen hieronder zijn met hun opvolgers vervangen bij V28.)*

  Het veld dat de metingen impliceren, met de orde die het casusboek zelf voor deze vensters noteert (4 op beide overnames):

| as | venster (orde 4) | aanbevolen band | posities | waarom dat aantal |
|---|---|---|---|---|
| woofer→mid | 396,7–548,5 Hz | 396,7–548,5 Hz (de slechtste lobing-zone 657–920 Hz ligt boven het plafond) | **396,7 / 466,5 / 548,5 Hz** | 0,47 octaaf band; 1 + ⌊0,47 / (1/6)⌋ = 3 |
| mid→tweeter | 1294,0–2283,5 Hz | 1294,0–1327,4 **en** 1858,4–2283,5 Hz | **1294,0 / 2033,9 / 2283,5 Hz** *(V28: nu 1294,0 / 1491,4 / 1719,0 / 1981,2 / 2283,5)* | 0,33 octaaf *aanbevolen* band (de slechtste lobing-zone 1327–1858 Hz is eruit gesneden); 1 + ⌊0,33 / (1/6)⌋ = 3. **V28: die uitsnijding is opgeschort, dus 0,82 octaaf VENSTER en 1 + ⌊0,82 / (1/6)⌋ = 5.** |

  Twee keer drie, om volstrekt verschillende redenen — wat precies het punt is van een aantal dat wordt afgeleid in plaats van gekozen. Product: **9 kandidaten**, en de V9-spanning van dit project (de slechtste lobing-zone ligt binnen het bovenste venster) is nu een **gat in de kandidatenlijst** in plaats van een zin in het paneel.

  *Precies dat gat is wat V28 opwierp, en het antwoord was dat het er niet had mogen zijn: het werd gesneden door een λ-fractie op één c-t-c-afstand, en V20a reserveert elk lobing-oordeel voor de verticale synthese. Sinds V28 is het veld drie × vijf = **15 kandidaten**, en de V9-spanning staat weer in het paneel — nu ook op elke kandidaat zelf, met bron en met de mededeling dat zij niet is toegepast.*

  **De pre-start-raming meldt 0 van 9 buiten het venster** en 0 van 9 buiten de aanbevolen band, dus de dialoog verschijnt niet. *(V28: 0 van 15 buiten het venster — dat blijft een eigenschap die de generator niet kán schenden — maar niet meer 0 buiten de AANBEVELING, want de generator volgt haar niet meer. De raming zegt dat, en dat is gewenst zolang V28 open is.)* Met de tegenproef ernaast: dezelfde schatter, gevoed met de kruispunten die het v1-venster oplevert (707–728 Hz), meldt **4 van 4 buiten** — de audit-meting, gereproduceerd als uitspraak over de schatter in plaats van over de run.

  **Klasse A, nagemeten.** Het veld is een functie van de METINGEN alleen: dezelfde negen kandidaten komen uit een rapport dat op HUIDIG, op KAND-A en op KAND-B gebouwd is. Dat is de F4a-classificatie op de generator toegepast, en het is de reden dat de gegenereerde netlists als klasse B kunnen worden vastgelegd zonder ergens een klasse C te introduceren.

  ---

  **DE VERGELIJKING — v2-kandidaten naast de v1-baseline.**

  De negen kandidaten zijn door de échte route getuned (`handleV2Request` → `runThreeWayChain`, seed 20260827, raster 96 punten 200–20 kHz, oordeelband 397–19 500 Hz) en als `KAND-V2-*.adsfilter.json` bevroren. Alle getallen hieronder komen uit dezelfde metriekbibliotheek op dezelfde meetset — `predesign/comparison.ts`, dat niets rangschikt en waarin geen kolom een functie van een andere kolom is.

| ontwerp | min \|Z\| (Ω) | min EPDR (Ω) | dissipatie (%) | grootste R (W) | drive @ f_s (dB) | LF-bult (dB) | Q-mult (×) | SPL-venster (±dB) | RMS-afwijking (dB) | fase, slechtste paar (°) |
|---|---|---|---|---|---|---|---|---|---|---|
| HUIDIG | 3,46 | 1,73 | 46 | 25,55 | −25,08 | 3,75 | 2,86 | 1,34 | 0,60 | 23,83 |
| KAND-A | 3,32 | 1,66 | 52 | 30,93 | 10,48 | 4,25 | 3,22 | 1,47 | 0,87 | 3,69 |
| KAND-B | 3,44 | 1,72 | 39 | 19,57 | 11,13 | 3,41 | 4,10 | 1,30 | 0,70 | 3,41 |
| KAND-V2-1 | 0,00 | 1,59 | 40 | 37,83 | 19,11 | 3,40 | 1,71 | 1,65 | 1,41 | 84,66 |
| KAND-V2-2 | 0,01 | 0,02 | 2 | 1,30 | −12,68 | 1,49 | 1,15 | 4,41 | 2,80 | 65,57 |
| KAND-V2-3 | 1,39 | 0,70 | 0 | 0,34 | −21,61 | 1,49 | 1,12 | 5,09 | 2,91 | 21,51 |
| KAND-V2-4 | 1,31 | 0,66 | 1 | 0,51 | −19,76 | 1,49 | 1,10 | 5,25 | 3,04 | 18,10 |
| KAND-V2-5 | 1,24 | 0,62 | 14 | 11,50 | 4,24 | 1,76 | 1,41 | 5,40 | 3,05 | 20,69 |
| KAND-V2-6 | 1,18 | 0,59 | 15 | 12,53 | 4,13 | 1,71 | 1,45 | 5,54 | 3,12 | 20,20 |
| KAND-V2-7 | 1,15 | 0,58 | 15 | 11,59 | 4,05 | 1,70 | 1,41 | 5,64 | 3,21 | 18,67 |
| KAND-V2-8 | 1,08 | 0,54 | 15 | 12,20 | 3,95 | 1,69 | 1,44 | 5,80 | 3,29 | 18,58 |
| KAND-V2-9 | 0,84 | 0,43 | 16 | 12,01 | 3,28 | 1,68 | 1,44 | 6,16 | 3,53 | 20,74 |

  **De v2-kandidaten verliezen, over vrijwel de hele tabel.** Dat is de uitkomst, hij wordt hier genoteerd zoals hij is, en de vraag die telt is *waarvan* het een uitspraak is.

  **DE CONTROLE, en zij verandert de conclusie.** Dezelfde keten, dezelfde instellingen, dezelfde meetset — maar gestart op de kruispunten van HUIDIG zélf (360 / 2250 Hz, met een ruime kooi): **5,24 dB rimpel, 21,9° fase, min\|Z\| 1,42 Ω.** De negen v2-kandidaten leveren 3,11–9,15 dB en 15,0–27,0°, en de beste van hen (466,5 / 1294 Hz, 3,11 dB) is **beter dan de controle op de kruispunten van de baseline**.

  Daaruit volgt wat deze tabel wél en niet zegt:

  - **Wat zij niet zegt:** dat de v2-kandidaten slechte kruispunten zijn. Op de kruispunten van de baseline levert dezelfde ene ketenpas een even middelmatig netwerk op.
  - **Wat zij wél zegt:** dat één ketenpas — zonder catalogus-snapping, zonder EQ-banden, zonder ampèrevloer en zonder de iteraties van een ontwerpsessie — geen ontwerp oplevert dat in de buurt komt van de drie bevroren netlists. Die drie zijn geen uitkomst van één pas; ze zijn het resultaat van een lange sessie met een mens erin.
  - **De v1-tuner faalt dus NIET structureel op een v2-kandidaat.** Dat was de hypothese die getoetst moest worden (de startprompt noemt hem expliciet), en de controle verwerpt hem: de tuner doet op een v2-kandidaat wat hij op een v1-kandidaat doet.

  **Twee dingen die de vergelijking wél blootlegt, en beide zijn echt.**

  1. **`min|Z|` van 0,00–1,4 Ω tegen 3,3–3,5 Ω.** Casus 1 stelt geen versterkervloer, dus `ampMinLoadOhm` is afwezig en niets oordeelt over de belasting — P4, en de F0-doctrine (*leeg veld = geen oordeel*) in werking. De drie baselines dragen de impliciete discipline van een ontwerper die dat getal in zijn hoofd had; de v2-run heeft daar geen gestelde tegenhanger voor. Dat is geen bug maar een **ontbrekende projectinstelling**, en het is precies het soort ding dat zichtbaar hoort te zijn in plaats van vanzelf goed te gaan.
  2. **De fasetracking van KAND-V2-1 en -2 (84,7° en 65,6°).** *(Achterhaald bij V28: het segment van 33 Hz was een artefact van de uitsnijding en bestaat niet meer. Zie daar voor de nameting.)* Beide kruisen M-T op 1294 Hz, de ondergrens van het bovenste venster, in het segment dat maar 33 Hz breed is (1294–1327 Hz — de slechtste lobing-zone begint erboven). Een kooi van 2,6 % is nauwelijks een zoekruimte, en de tuner heeft er geen ruimte om de fase te repareren. Openstaand: of een segment dat smaller is dan de acceptatie-gladding een kandidaat verdient, of alleen een vermelding. De generator plaatst er nu één, omdat het toegestane band is en niets die keuze voor de ontwerper mag maken.

  ---

  **TWEE FOUTEN IN DE MEETOPSTELLING, en ze staan hier omdat ze allebei bijna als bevinding waren opgeschreven.**

  *Ten eerste: de eerste versie van de fixture wapende de BESCHERMINGEN niet.* Geen `targets` (het doel van de trapmethode), geen `safety` (het volle-band-verbod op degeneratie, V26 rij 31) en geen audit-drempels — met de redenering dat elk extra gewapend mechanisme een tweede verklaring voor een verschil is. Die redenering klopt voor een REGRESSIE en is precies verkeerd om voor een VOORSTEL: het zijn beschermingen, en een tuner zonder beschermingen levert netwerken op die vlak zijn op de oordeelband en degenereren erbuiten. Gemeten: **min\|Z\| = 0,00 Ω** — een dode kortsluiting — terwijl de keten een keurige 1,90 dB rimpel rapporteerde, want de rimpel werd gemeten waar het netwerk nog werkte.

  *Ten tweede, en dit was de duurdere: `synthMode` stond op `'filter'` en de app draait `'acoustic'`.* De controle legde het bloot: op `'filter'`, gestart op de kruispunten van HUIDIG, leverde dezelfde keten **31,4 dB** rimpel, dreef de overnames van 360/2250 naar **856/3848 Hz** en liet 0,00 Ω achter. Op `'acoustic'` werd dat 5,24 dB en 358/2370 Hz. Een fixture die niet de synthese van de app draait, meet de app niet.

  **De procesles is de bekende, één laag verder.** V15 zei het over referenties: een getal zonder zijn parameters is geen referentie. Hier ging het over een RUN, en de parameters die ontbraken waren niet exotisch — het waren de defaults van de app. De regel die hieruit volgt en die in de fixture staat opgeschreven: *een run-fixture die met een vergelijking als doel wordt gebouwd, draait de instellingen van de app en niet een minimale set.* En: **een tabel waarin het nieuwe verliest, verdient een controle vóórdat zij een bevinding wordt.** Zonder de controle zou hier gestaan hebben dat de v1-tuner op v2-kandidaten faalt, en dat was niet waar.

- V28 (**OPEN** — de F3c-uitsnijding stuurde het kandidaatveld met een λ-fractie) — opgeworpen bij de F4d-nazorg, 27-08-2026.

  **De vraag waarmee het begon.** Drie posities gelijkmatig over het 0,82-octaaf M-T-venster horen op ~1294 / ~1720 / ~2283 Hz te landen. De F4d-lijst gaf 1294 / 2034 / 2284. Waar komt dat gat vandaan?

  **De herleiding, bestand voor bestand.**

  1. `predesign/candidates.ts` legde zijn posities over `recommendedBand(window).effectiveHz` — de aanbevolen band, niet het venster.
  2. `predesign/recommendedBand.ts:150` bepaalt wat daaruit gesneden wordt: `w.zones.find((z) => z.kind === 'bad')`.
  3. Die zone wordt gemaakt in `predesign/xoWindow.ts:218` — `add('the WORST lobing zone', [LOBING_WORST_LOW * cOverD, LOBING_WORST_HIGH * cOverD], 'bad')` — met `LOBING_WORST_LOW = 0.5` en `LOBING_WORST_HIGH = 0.7` (`xoWindow.ts:140-141`).
  4. En `cOverD` komt uit `xoWindow.ts:212`: `SPEED_OF_SOUND_M_S / (input.spacingMm / MM_PER_M)`, waarbij `spacingMm` de ENE c-t-c-afstand is die `report.ts:675` voor dit paar doorgeeft.

  De uitgesneden grootheid is dus: **de band waarop d/λ tussen 0,5 en 0,7 ligt, voor één c-t-c-afstand.** Dat is een λ-fractie. Het is niet de verticale synthese; `verticalLobing` komt in dit hele pad niet voor. En 0,5–0,7 is niet zomaar een λ-fractie: het is precies het dal van de niet-monotone zonecurve die V20 heeft geschrapt (V20's knopen: 0,60 → 1,00, de ongunstigste).

  **Het oordeel: F3c is een V20-schending op een plek die V20 niet zag.** V20a zegt dat de verticale synthese de énige lobing-grootheid is waar een oordeel aan mag hangen, en het blijvende verbod luidt: geen poort, geen budget, geen shortlist-criterium op een λ-fractie. Bij F3c leek dat niet te bijten, want de aanbevolen band was **advies**: een zin en twee veldwaarden achter een knop, die de ontwerper mocht negeren. F4d heeft er zonder het te merken iets anders van gemaakt — de band waaruit de kandidaten worden gesneden. F4d's eigen uitbreiding van `noWeights.test.ts` benoemt precies waarom dat het verschil maakt: *"kiezen wélke kandidaten bestaan is dezelfde beslissing als kiezen tussen hun uitkomsten, één stap eerder."* De uitsnijding werd sturend op het moment dat de generator haar ging lezen.

  **Waarom dit geen leerstellige klacht is, maar nagemeten.** V20 stelde vast dat er voor een weg met N bronnen vier afstanden zijn en geen keuze ertussen. `xoWindow` krijgt er één. Wélke, bepaalt wat er wordt uitgesneden — en op het ONDERSTE paar van casus 1 (wooferarray → mid, een weg met twee bronnen) verandert dat het veld:

  | λ-lezing (V20) | afstand | uitgesneden zone | valt in het W-M-venster 396,7–548,5 Hz? |
  | --- | --- | --- | --- |
  | dichtstbijzijnde bron *(wat de engine gebruikt)* | 261,3 mm | 656–919 Hz | nee — boven het plafond |
  | binnen de wooferweg | 275,7 mm | 622–871 Hz | nee — boven het plafond |
  | amplitudegewogen zwaartepunt | 399,2 mm | **430–602 Hz** | **ja — snijdt af vanaf 430 Hz** |
  | verste bron | 537,0 mm | **319–447 Hz** | **ja — snijdt 396,7–447 Hz weg** |

  Vier juiste getallen, vier verschillende kandidatenlijsten op dezelfde as. De verste-bron-lezing zou de positie op 396,7 Hz hebben geweigerd; de dichtstbijzijnde weigert niets. De keuze die V20 verwierp bepaalt hier rechtstreeks wélke ontwerpen een tuner ooit te zien krijgt, en zij wordt nergens genoemd. Dat is dezelfde vondst als V20, één laag verder: **de keuze tussen twee kandidaten verborg een derde, en hier verbergt zij bovendien dat er gekozen wórdt.**

  **Wat de nazorgsessie heeft gedaan — en nadrukkelijk niet.**

  - **Opgeschort, niet gerepareerd.** `candidates.ts` kent nu `APPLY_BAND_EXCISIONS`, en die staat op `false`. De generator dekt het hele A5d.3-venster gelijkmatig. Het besluit of een uitsnijding het veld überhaupt mag vormen is aan deze entry en is niet genomen.
  - **`recommendedBand.ts` is byte-onaangeraakt**, en dat is opzet. De F3c-dialoog blijft de aanbevolen band tonen met haar overnameknoppen: als ADVIES is zij niet in strijd met V20a — een ontwerper die het leest en negeert is precies het geval waarvoor A5d.3 "toon de zones, middel ze niet" schreef. Wat verboden was, was dat een machine haar volgt zonder het te zeggen.
  - **Elke uitgesneden zone reist nu mee met de kandidaat, mét bron.** `XoZone.derivedFrom` is VERPLICHT geworden (`xoWindow.ts`): elke zone die band wegneemt moet zeggen wélke grootheid zij is en waaruit zij is gerekend. `CandidateCrossing.excisions` draagt zone, bron, `applied` en — als zij niet is toegepast — waarom niet. Het staat in de provenance-zin die een shortlistrij afdrukt, in de axis-notities voor het paneel, en in `casus1_v2_herkomst.json`. Een lezer die vraagt "waarom staat er geen kandidaat tussen 1327 en 1858 Hz?" krijgt sinds nu antwoord, ook wanneer het antwoord "die staat er wél" is.
  - **Geen poort, geen budget, geen drempel verplaatst of toegevoegd.**

  **Wat dit op casus 1 verandert — BREAKING, alleen voor v2-runs.**

  De M-T-as gaat van 0,33 octaaf aanbevolen band naar 0,82 octaaf venster, dus van drie posities naar vijf; W-M blijft drie (daar lag de zone al boven het plafond).

  | as | venster (orde 4) | band waarover gespreid | posities |
  | --- | --- | --- | --- |
  | woofer→mid | 396,7–548,5 Hz | 396,7–548,5 Hz (0,47 okt) | **396,7 / 466,5 / 548,5 Hz** |
  | mid→tweeter | 1294,0–2283,5 Hz | 1294,0–2283,5 Hz (0,82 okt) | **1294,0 / 1491,4 / 1719,0 / 1981,2 / 2283,5 Hz** |

  Het veld gaat van **9 naar 15 kandidaten**. En daarmee komt een tweede getal in beeld dat bij F4d onzichtbaar was: **de shortlist laat er tien door van de vijftien.** Bij F4d was het negen van negen — de shortlist had nog nooit iets geweigerd, en of hij dat kón was op deze casus niet te zien. Nu wel. Bevroren wordt de shortlist, zoals altijd, dus er staan **tien** `KAND-V2-*.adsfilter.json` op schijf tegen negen daarvoor.

  Geen enkele referentie werd hierdoor ONGELDIG, en dat is de F4a-classificatie die zich uitbetaalt: de referenties hangen aan BESTANDEN, dus een ander veld levert andere bestanden op en niet andere waarden voor dezelfde.

  De pre-start-raming meldt nog steeds **0 van 15 buiten het venster** — dat blijft een eigenschap die de generator niet kán schenden. Wat wél verandert: enkele kandidaten liggen nu buiten de F3c-**aanbeveling**, en de raming zegt dat. Dat is gewenst zolang V28 open is: een opschorting die ook de raming het zwijgen oplegde, zou nergens op het scherm laten zien dat het veld en de aanbeveling uit elkaar zijn gelopen.

  **Wat de bredere M-T-dekking opleverde — en één ding dat zij juist NIET opleverde.**

  1. **De 33 Hz-kooi is weg, de rimpel beweegt — maar de fasetracking van V27's twee probleemgevallen is NIET gerepareerd, en dat weerlegt de verklaring die V27 gaf.**

  V27 noteerde als tweede echte bevinding dat KAND-V2-1 en -2 (84,7° en 65,6° fase) allebei op 1294 Hz kruisten, in het segment van 1294–1327 Hz: *"Een kooi van 2,6 % is nauwelijks een zoekruimte, en de tuner heeft er geen ruimte om de fase te repareren."* Dat is een toetsbare uitspraak, en de opschorting toetst haar: met het hele venster als band is de kooi op diezelfde 1294 Hz zo'n 95 Hz breed, bijna een factor drie ruimer.

  Wat de ene ketenpas per kandidaat rapporteert, F4d naast V28:

  | kandidaat (W-M · M-T) | F4d (kooi 33 Hz) | V28 (kooi ≈95 Hz) |
  | --- | --- | --- |
  | 396,7 · 1294 | 9,15 dB / 27,0° | **3,25 dB / 19,0°** |
  | 466,5 · 1294 | 3,11 dB / 21,3° | 3,93 dB / 26,6° |
  | 548,5 · 1294 | 6,34 dB / 17,0° | 6,33 dB / 16,1° |

  Bijna zes dB rimpel weg op de slechtste, 0,8 dB erbij op de middelste. **Een bredere kooi is dus geen strikt makkelijker probleem** — één ketenpas over een grotere zoekruimte is een ánder probleem, niet hetzelfde probleem met meer speling.

  En op de metriek waar het V27 om ging is het antwoord ronduit nee. De M-T-fasetracking van de twee kandidaten die op 1294 Hz kruisen ging van 84,7° / 65,6° naar **89,9° / 89,2°**. Niet beter: slechter.

  **Wat er in plaats daarvan mee correleert, staat in de tabel ernaast.** Precies die twee dragen `min |Z| = 0,01 Ω` — een dode kortsluiting. De dérde kandidaat die óók op 1294 Hz kruist, 548,5 · 1294, heeft `min |Z| = 0,86 Ω` en een M-T-fasetracking van 19,9°: dezelfde overname, dezelfde kooi, normale fase. De kooibreedte verklaart het verschil dus niet en de overnamefrequentie evenmin; wat de twee uitzonderingen delen is een gedegenereerde belasting.

  Dat is **V27's eerste bevinding en niet zijn tweede**: casus 1 stelt geen versterkervloer, `ampMinLoadOhm` is afwezig, en niets oordeelt over de belasting (P4, de F0-doctrine). De tuner mag naar 0,01 Ω lopen en doet dat, en een netwerk dat daarheen is gelopen heeft geen bruikbare fase meer. V27 schreef de fasetracking toe aan te weinig zoekruimte; de ruimte is verdrievoudigd en de fase is verslechterd. **De ontbrekende projectinstelling is de verklaring, en de smalle kooi was het toeval dat ernaast lag.**

  V27's openstaande vraag — *"of een segment dat smaller is dan de acceptatie-gladding een kandidaat verdient"* — is daarmee niet beantwoord maar wel onschadelijk: dat segment bestaat niet meer, want het was een artefact van de uitsnijding. Wat blijft openstaan is het echte punt: **casus 1 heeft een versterkervloer nodig voordat een v2-vergelijking iets zegt over wat een tuner kán.**
  2. **De vergelijkingstabel schuift mee.** Zie het blok hieronder; het vervangt de v2-helft van V27's tabel, waarvan de rijen naar bestanden verwezen die niet meer bestaan. De conclusie van V27 verandert niet — één ketenpas levert geen ontwerp dat de drie bevroren netlists benadert, en de controle op de kruispunten van HUIDIG zélf (5,24 dB) blijft de reden dat dat een uitspraak is over de PAS en niet over de kandidaten.

  ---

  **DE VERGELIJKING NA V28 — tien bevroren v2-kandidaten naast de v1-baseline.**

  Dezelfde metriekbibliotheek op dezelfde meetset (`predesign/comparison.ts`), dezelfde kolommen, niets gerangschikt.

  |---|---|---|---|---|---|---|---|---|---|---|
  | HUIDIG | 3.46 | 1.73 | 46 | 25.55 | -25.08 | 3.75 | 2.86 | 1.34 | 0.60 | 23.83 |
  | KAND-A | 3.32 | 1.66 | 52 | 30.93 | 10.48 | 4.25 | 3.22 | 1.47 | 0.87 | 3.69 |
  | KAND-B | 3.44 | 1.72 | 39 | 19.57 | 11.13 | 3.41 | 4.10 | 1.30 | 0.70 | 3.41 |
  | KAND-V2-1 (396.7 / 1294 Hz, LR4) | 0.01 | 0.53 | 0 | — | 21.10 | 5.20 | 1.00 | 2.67 | 1.87 | 89.93 |
  | KAND-V2-2 (466.5 / 1294 Hz, LR4) | 0.01 | 1.82 | 31 | 19.11 | 20.66 | 13.74 | 1.43 | 3.81 | 2.40 | 89.17 |
  | KAND-V2-3 (396.7 / 2283.5 Hz, LR4) | 1.38 | 0.69 | 1 | 0.46 | -21.26 | 1.49 | 1.13 | 5.15 | 2.96 | 20.63 |
  | KAND-V2-4 (548.5 / 2283.5 Hz, LR4) | 1.17 | 0.58 | 15 | 12.49 | 4.13 | 1.71 | 1.45 | 5.59 | 3.17 | 20.06 |
  | KAND-V2-5 (396.7 / 1719 Hz, LR4) | 1.16 | 0.59 | 1 | 1.18 | -16.45 | 1.49 | 1.13 | 5.48 | 3.24 | 17.17 |
  | KAND-V2-6 (466.5 / 1981.2 Hz, LR4) | 1.14 | 0.57 | 15 | 11.78 | 4.17 | 1.84 | 1.43 | 5.67 | 3.24 | 17.89 |
  | KAND-V2-7 (396.7 / 1491.4 Hz, LR4) | 1.04 | 0.54 | 2 | 1.35 | -13.76 | 1.49 | 1.15 | 5.57 | 3.35 | 15.98 |
  | KAND-V2-8 (548.5 / 1719 Hz, LR4) | 0.95 | 0.48 | 16 | 12.35 | 3.75 | 1.76 | 1.46 | 6.15 | 3.48 | 19.99 |
  | KAND-V2-9 (548.5 / 1491.4 Hz, LR4) | 0.87 | 0.44 | 16 | 12.05 | 3.42 | 1.68 | 1.44 | 6.21 | 3.53 | 20.42 |
  | KAND-V2-10 (548.5 / 1294 Hz, LR4) | 0.86 | 0.44 | 16 | 11.74 | -12.30 | 1.71 | 1.44 | 6.16 | 3.58 | 19.90 |

  **Wat er tegenover de F4d-tabel verandert, en wat niet.** De v1-baselines zijn identiek — dezelfde bestanden, dezelfde metrieken. De v2-rijen zijn ándere netwerken (ander veld, andere shortlist) en niet betere: de rimpel- en fasekolommen liggen in dezelfde orde als bij F4d, en `min |Z|` blijft 0,01–1,4 Ω tegen 3,3–3,5 Ω voor de baselines. **De conclusie van V27 staat dus overeind en is niet door V28 gered.** Wat V28 wél doet, is de verklaring aanscherpen: de twee slechtste rijen zijn de twee met de gedegenereerde belasting, en dát is de ontbrekende versterkervloer en niet de kandidaat.

  **Wat V28 moet beslissen, en welke uitkomsten open staan.**

  1. **Verwerpen.** Geen enkele uitsnijding op een λ-fractie, ooit. De aanbevolen band blijft advies in de dialoog; de generator dekt altijd het venster. Dit is de huidige toestand, en de nulhypothese.
  2. **Herbouwen op de synthese.** Een uitsnijding is legitiem als zij uit `verticalLobing` komt: draai de synthese over het kruisgebied per kandidaat-frequentie en snij weg waar de gesynthetiseerde dip een gestelde grens overschrijdt. Dat is een échte A5d.3-voorkeurszone en geen aanname — maar het is duur (een synthese per positie), het vraagt een **gestelde** dipgrens (P4: zonder die grens geen oordeel), en het is niet zonder meer een uitsnijding: een dip is continu en een zone is binair.
  3. **Behouden als screening met etiket.** De uitsnijding blijft, maar alleen wanneer alle vier de V20-fracties hem eens zijn — de zone is dan de doorsnede van vier zones en de keuze tussen de afstanden is niet meer nodig. Op casus 1's onderste paar is die doorsnede leeg, wat de bruikbaarheid meteen laat zien.

  Optie 2 heeft de voorkeur van de nazorgsessie en is niet uitgevoerd: zij vraagt een gestelde grens die casus 1 niet heeft, en dat is een projectinstelling en geen sessiebesluit. **Open.**

  **Wat er in de code veranderde.** `predesign/candidates.ts` (`APPLY_BAND_EXCISIONS`, `BandExcision`, `excisionsFor`, `excisionSentence`, band = venster), `predesign/xoWindow.ts` (`XoZone.derivedFrom`, verplicht). **Onaangeraakt:** `recommendedBand.ts`, `metrics/lobing.ts`, `verticalLobing`, elke poort, elk budget, de v1-route, en `components/XoWindowAnnotation.tsx`. Met de vlag uit verandert er niets; `toggleRegression.test.ts` blijft byte-identiek.

- V29 (**OPEN** — mag `safety` een netlist weigeren die vrijwel kortsluit als er géén versterkervloer is opgegeven?) — opgeworpen bij de vloersessie, 27-08-2026.

  **De aanleiding, en zij is geen gedachte-experiment.** De V28-shortlist bevatte twee bevroren netlists met `min |Z| = 0,01 Ω` (KAND-V2-1 en -2). Nul komma nul één ohm is voor elke versterker die bestaat een kortsluiting. Ze stonden er niet door een fout: casus 1 stelde geen `ampMinLoadOhm`, dus M-B/|Z| oordeelde niet, en `safety` — het volle-band-verbod op degeneratie (V26 rij 31) — was gewapend en liet ze door. De shortlist deed precies wat hem gezegd was en leverde een ontwerp op dat niemand mag bouwen.

  **Wat `safety` vandaag wél doet.** Hij bewaakt het gedrag BUITEN de oordeelband: hij vangt netwerken die vlak zijn waar gemeten wordt en daarbuiten weglopen. Dat is waarom hij bestaat (V27: zonder hem leverde de eerste fixture 0,00 Ω met een keurige 1,90 dB rimpel). Wat hij niet doet is een absolute ondergrens aan de belasting stellen, want die grens is een eigenschap van de versterker en die kent hij niet.

  **De twee houdingen, allebei verdedigbaar.**

  1. **Strikt P4 — nee.** Leeg veld is geen oordeel; dat is de F0-doctrine en zij is er niet voor niets gekomen. Een app die stilletjes een vloer verzint waar de ontwerper er geen stelde, is precies de app die drie plekken met drie drempels had (`impedanceFloor.ts` bestaat om dat op te ruimen). Een buisversterker, een PA-eindtrap en een class-D-module willen verschillende antwoorden, en 0,01 Ω is alleen absurd als je weet welke er staat. Bovendien: de ontwerper ZIET de kolom — `min |Z|` staat in het vergelijkingsblok en in het poortrapport, met de vermelding "no limit set". De informatie wordt niet achtergehouden; er wordt alleen niet voor hem beslist. *Wat er dan wél moet gebeuren:* niets in de code, en een projectinstelling in het casusboek — wat deze sessie voor casus 1 heeft gedaan.
  2. **Een afleidbare degeneratiegrens — ja, maar niet als versterkervloer.** De gemeten driverimpedanties zetten zelf al een ondergrens: het complement kan niet lager dan de parallelschakeling van de `R_e`'s die de meting oplevert (casus 1: woofer 3,05 Ω gemeten DC, mid en tweeter erbij). Een netwerk dat dáár ver onder duikt, doet dat niet omdat de drivers dat kunnen maar omdat het filter een pad heeft gemaakt dat de drivers omzeilt — een serie-C die tegen een spoel resoneert, een shunt die naar nul loopt. Dat is geen belastingsoordeel maar een DEGENERATIE-detectie, en zij is uit de metingen af te leiden zonder dat iemand een versterker noemt. `safety` is de plek waar die hoort, want dat is wat `safety` is: het verbod op degeneratie. **Het onderscheid dat deze houding draagt:** "te zware belasting voor jouw versterker" is P4 en blijft afwezig-is-afwezig; "dit netwerk is fysisch ontaard" is een uitspraak over het netwerk zelf, en die mag een engine doen die de drivers heeft gemeten.

  **Waar de spanning precies zit.** Houding 2 is aantrekkelijk en heeft een echt risico: elke afgeleide grens is een getal dat niemand heeft gesteld, en dit project heeft (V21, V22, V25) drie keer meegemaakt dat een tweede afleiding náást een gestelde waarde uiteindelijk met haar in strijd was. Een degeneratiegrens uit de `R_e`'s zou bovendien een factor nodig hebben — hoevéél onder de parallelschakeling is "ontaard"? — en die factor is precies het soort getal dat A5e.1 en P6 niet eigenmachtig ingevuld willen zien.

  **Wat het zou beslechten.** Eén meting die er nu niet is: een netwerk dat de detectie zou weigeren, gebouwd en gemeten, zodat blijkt of de gedetecteerde degeneratie zich als degeneratie gedraagt of alleen op papier bestaat. Zonder dat is elke gekozen factor een aanname die zich als meting voordoet — de fout die V20 heeft opgeruimd.

  **Geen besluit.** Deze sessie heeft de vraag alleen gesteld en de aanleiding vastgelegd. Wat zij wél deed is houding 1 volgen voor casus 1: de vloer is GESTELD (`manifest_en_geometrie.gestelde_eisen`), de poort is gewapend, en de 0,01 Ω-netwerken zijn niet meer bevroren omdat de poort ze weigert — niet omdat `safety` iets nieuws doet. `safety`, M-A, M-B, M-C en elke andere poort zijn bij deze sessie byte-onaangeraakt. **Open.**

- V30 (de versterkervloer is GESTELD — en zij blijkt een veto en geen zoekdoel; **gedeeltelijk gesloten** bij de vervolgsessie, waar zij een zoekdoel werd) — bij de vloersessie, 27-08-2026.

  **Wat er gesteld is.** `manifest_en_geometrie.gestelde_eisen.versterkervloer_ohm = 2,6 Ω`, met de motivering van de ontwerper erbij: *"Het bestaande filter HUIDIG staat op ~2,6 Ω minimum en is qua SPL en fase goed; de v2-kandidaten worden zo op dezelfde voet vergeleken."* Het getal staat in dát blok en nergens anders — niet in `src/lib/engine2/`, niet als default, niet als constante in een fixture. De fixtures lezen het via `casus1AmpMinLoadOhm(golden)`, en het reist het pad van de app: het A5a-veld vult `settings.ampMinLoadOhm` én `v2ScanSettings.gates.ampMinLoadOhm`.

  **Twee dingen die bij het opschrijven meteen bijgesteld moesten worden.**

  1. *De poort heet M-B/|Z|, niet M-A.* De opdracht sprak van "de M-A-poort wapenen met de versterkervloer". In het A4-register is M-A de **dissipatiefractie** — dimensieloos — en een vloer in ohm kan maar één poort wapenen: `M-B/|Z|`, de eenvoudige modus van M-B, met `meetsAmpFloor` als vergelijkingsregel. Het register houdt hier de namen; M-A, M-B/EPDR en M-C blijven ongewapend, want casus 1 stelt daar niets voor.
  2. *HUIDIG meet geen 2,6 Ω maar 3,46 Ω.* `kandidaten.HUIDIG_2e.minZ` = 3,46 (min |Z| over het hele raster, poortvrij). De motivering noemt ~2,6. Het zijn twee grootheden — de app toont een systeemimpedantie op een eigen raster en band — en dit bestand beslist niet welke de ontwerper bedoelde. **Beide staan nu in het manifest**, naast elkaar. De gestelde vloer is 2,6 en dát wordt gewapend; gunstig neveneffect is dat de baseline waaraan de motivering refereert de vloer met marge haalt en dus niet zelf omvalt.

  ---

  **DE UITKOMST: 0 VAN 15.** Het A5d.3-veld (vijftien kandidaten sinds V28) is opnieuw door de échte route getuned mét de vloer gewapend. **Geen enkele kandidaat haalt hem.** De geleverde min |Z| liep van 0,03 tot 1,38 Ω tegen een gestelde 2,6 Ω; alle vijftien werden door `M-B/|Z|` geweigerd, de shortlist kwam op **0 van 15** en er is niets bevroren.

  **En toen begon het eigenlijke werk, want die uitslag betekende niet wat hij leek te betekenen.** Naast de run zonder vloer gelegd:

  | | zonder vloer | met vloer 2,6 Ω |
  | --- | --- | --- |
  | kandidaten | 15 | 15 |
  | shortlist | 10 | **0** |
  | netwerk BYTE-IDENTIEK aan de run zonder vloer | — | **13 van 15** |
  | netwerk veranderd | — | 2 van 15 (juist de twee die al op 0,01 Ω stonden) |

  Dertien van de vijftien leverden exact hetzelfde netwerk als de run waarin geen vloer bestond, terwijl zij op 0,86–1,38 Ω stonden en de vloer 2,6 Ω was. "0 van 15" is dus geen uitspraak over wat de tuner kán.

  ---

  **DE HERLEIDING, en de eerste hypothese was fout.**

  *Vermoeden vooraf:* `Z_FLOOR_OHM` — hardgecodeerd in `netOptimizer.ts`, zes locaties, beide ketens — bepaalt wanneer de reparatiepas afgaat, en de gestelde vloer is alleen een poort achteraf.

  *Weerlegd.* `grep -rn "Z_FLOOR_OHM" src/` geeft **nul treffers**: sessie F0 heeft de constante verwijderd, en wat er in `docs/OptimizerV2_startprompts.md:11` staat is de startprompt van díe sessie, geen openstaand item. De trigger van de reparatiepas is de GESTELDE vloer en niets anders:

  - `netOptimizer.ts:880-881` — `ampFloorOhm = opts.ampMinLoadOhm > 0 ? opts.ampMinLoadOhm : null`, met in het commentaar: *"THE one place this file decides whether an amplifier-load floor exists at all"*.
  - `netOptimizer.ts:909` — `zSlackOhm = ampFloorOhm − acceptedAmpFloor(ampFloorOhm)`, dus de 2 %-meettolerantie: op 2,6 Ω is dat **0,052 Ω**.
  - `netOptimizer.ts:3058` — `if (ampFloorOhm !== null && zCur.short > zSlackOhm)`. De pas gaat dus af zodra min |Z| onder **2,548 Ω** ligt: bij alle vijftien.

  **Gemeten in plaats van beredeneerd.** Drie kandidaten door de échte route, met de vloer gewapend, en `ampFloorRepair` uitgelezen (dat is een getypt pass-resultaat en geen tekstmatch — A3g):

  | kandidaat | min \|Z\| | `ampFloorRepair` |
  | --- | --- | --- |
  | 396,7 · 1294 | 0,035 Ω | `failed` |
  | 396,7 · 1491,4 | 1,045 Ω | `failed` |
  | 548,5 · 1294 | 0,859 Ω | `failed` |

  `'failed'` wordt uitsluitend binnen die `if` gezet, dus **de reparatiepas is bij alle drie afgegaan en bij alle drie mislukt**. De tuner heeft het geprobeerd. Dat de dertien byte-identiek terugkwamen komt doordat een mislukte reparatie wordt teruggedraaid: `cur` blijft staan en het netwerk is letterlijk hetzelfde.

  **Waar het vermoeden wél klopte, op een ander adres.** De vloer zit nergens in de hoofdzoektocht. De enige plek waar `zShortOhm` een kostenterm wordt is `netOptimizer.ts:2303` — `barr += 1200 * (m.zShortOhm / ampFloorOhm!) ** 2` — en dat blok staat achter `if (zFloorBarrier)`. `zFloorBarrier` is een parameter van `tune()` die op `false` staat (`netOptimizer.ts:2162`) en alleen door de reparatie-aanroepen op `true` wordt gezet (`3068`, `3073`). Het commentaar zegt het zelf: *"only the repair pass sets zFloorBarrier, and that pass runs only with a rating given."*

  > **De gestelde vloer is een VETO plus een reparatiepas achteraf. Zij is nooit een zoekdoel.** De zoektocht die de topologie en de waarden kiest weet niet dat er een vloer is; pas als zij klaar is wordt gekeken of het resultaat eronder duikt, en dan mag één barrière-retune proberen het op te tillen — vanuit een punt dat al voor iets anders geoptimaliseerd is.

  Dat is dezelfde lekklasse als audit §6.1 (*"v2 kan vetoën en rapporteren. Het kan niet voorstellen."*), één laag lager: **de vloer kan vetoën en repareren; hij kan niet sturen.** En het verklaart de uitslag precies. Een zoektocht die de vloer als doel had meegenomen was elders begonnen; een reparatie die pas achteraf 1,0 Ω naar 2,6 Ω moet tillen, moet een netwerk omgooien dat al ergens anders in vastzit.

  **Niet gerepareerd in deze sessie, met opzet.** Het is een wijziging in de kostenfunctie van `netOptimizer.ts` op het v1-pad, dus zij raakt de toggle-invariant en verdient een eigen schone sessie met eigen regressies. Wat deze sessie doet is het vastleggen met bestand:regel, zodat de volgende niet opnieuw hoeft te zoeken.

  ---

  **WAT ER MET DE BEVROREN NETLISTS GEBEURT — en waarom ze NIET verwijderd zijn.**

  De opdracht zei: netlists die de poort niet halen worden verwijderd, "geen referentie aanpassen maar een netlist die nooit had mogen bestaan". Die redenering staat, maar zij veronderstelt dat de poort een eerlijk oordeel over de kandidaat velt. Na de herleiding hierboven doet hij dat niet: hij velt een oordeel over een zoektocht die de vloer niet kende. Tien netlists weggooien op grond daarvan zou het bewijsmateriaal van V30 vernietigen.

  Dus: **de tien blijven staan, elk met een vlag.** `manifest_en_geometrie.v2_herkomst.vloeruitzonderingen` noemt ze bij naam, met hun gemeten min |Z|, de gestelde vloer en de reden — *"bevroren vóór de vloer gesteld werd, getuned zonder hem; de tuner heeft de vloer niet als zoekdoel gezien (V30); mag niet gebouwd worden."* De klasse-B-referenties blijven ongewijzigd: het zijn metrieken op netlist-BESTANDEN en die bewegen niet omdat er een eis bij is gekomen.

  De lijst is boekhouding en geen vrijstelling, en `frozenNetlistGates.test.ts` maakt dat hard: **élke bevroren netlist haalt de vloer, óf staat in de lijst.** Een naam weghalen terwijl de netlist de vloer nog steeds mist, zet de suite op rood — nagemeten, met `KAND_V2_1` (0,01 Ω): *"a frozen netlist misses the stated floor and is not named in v2_herkomst.vloeruitzonderingen — name it with its reason, or replace the netlist"*. De lijst hoort leeg te raken zodra V30 een opvolger heeft.

  ---

  **DE VERGELIJKING, met de vloer als eigen kolom.**

  | ontwerp | min \|Z\| (Ω) | min EPDR (Ω) | dissipation, total (%) | largest resistor (W) | drive at f_s, worst way (dB) | LF lift added (dB) | Q multiplier, lowest way (×) | SPL window (±dB) | RMS deviation (dB) | phase tracking, worst pair (°) | haalt de gestelde vloer 2.6 Ω? |
  |---|---|---|---|---|---|---|---|---|---|---|---|
  | HUIDIG | 3.46 | 1.73 | 46 | 25.55 | -25.08 | 3.75 | 2.86 | 1.34 | 0.60 | 23.83 | **ja** |
  | KAND-A | 3.32 | 1.66 | 52 | 30.93 | 10.48 | 4.25 | 3.22 | 1.47 | 0.87 | 3.69 | **ja** |
  | KAND-B | 3.44 | 1.72 | 39 | 19.57 | 11.13 | 3.41 | 4.10 | 1.30 | 0.70 | 3.41 | **ja** |
  | KAND-V2-1 | 0.01 | 0.53 | 0 | — | 21.10 | 5.20 | 1.00 | 2.67 | 1.87 | 89.93 | nee |
  | KAND-V2-2 | 0.01 | 1.82 | 31 | 19.11 | 20.66 | 13.74 | 1.43 | 3.81 | 2.40 | 89.17 | nee |
  | KAND-V2-3 | 1.38 | 0.69 | 1 | 0.46 | -21.26 | 1.49 | 1.13 | 5.15 | 2.96 | 20.63 | nee |
  | KAND-V2-4 | 1.17 | 0.58 | 15 | 12.49 | 4.13 | 1.71 | 1.45 | 5.59 | 3.17 | 20.06 | nee |
  | KAND-V2-5 | 1.16 | 0.59 | 1 | 1.18 | -16.45 | 1.49 | 1.13 | 5.48 | 3.24 | 17.17 | nee |
  | KAND-V2-6 | 1.14 | 0.57 | 15 | 11.78 | 4.17 | 1.84 | 1.43 | 5.67 | 3.24 | 17.89 | nee |
  | KAND-V2-7 | 1.04 | 0.54 | 2 | 1.35 | -13.76 | 1.49 | 1.15 | 5.57 | 3.35 | 15.98 | nee |
  | KAND-V2-8 | 0.95 | 0.48 | 16 | 12.35 | 3.75 | 1.76 | 1.46 | 6.15 | 3.48 | 19.99 | nee |
  | KAND-V2-9 | 0.87 | 0.44 | 16 | 12.05 | 3.42 | 1.68 | 1.44 | 6.21 | 3.53 | 20.42 | nee |
  | KAND-V2-10 | 0.86 | 0.44 | 16 | 11.74 | -12.30 | 1.71 | 1.44 | 6.16 | 3.58 | 19.90 | nee |

  Een kolom en geen filter: het vergelijkingsblok rangschikt niets en verbergt niets, en een tabel die alles onder de vloer stilletjes had weggelaten, beantwoordt een vraag die niemand stelde. De verdict-kolom komt uit `meetsAmpFloor` — dezelfde ene regel als de poort — dus kolom en poort kunnen niet uit elkaar lopen.

  **Het antwoord op de vraag die de opdracht stelde** (*zit de beste v2-kandidaat nog steeds op ~3,1 dB, of verandert de 0,01 Ω-verwijdering het beeld?*): geen van beide. Er is niets verwijderd, en er is ook geen nieuwe beste kandidaat — het veld mét de vloer leverde er nul. De drie v1-baselines halen de vloer alle drie met marge (3,32–3,46 Ω), de tien v2-netlists geen van alle (0,01–1,38 Ω), en het gat naar HUIDIG op RMS-vlakheid (0,60 dB tegen 1,87–3,58 dB) staat er nog precies zoals V27 het beschreef. **Zolang de vloer geen zoekdoel is, zegt dit gat niets over de kandidaten en alles over de ene ketenpas.** Dat is de opmaat die de opdracht vroeg, en zij wijst nu naar V30 in plaats van naar de kandidaatgeneratie.

  **Wat er in de code veranderde.** `casus1.fixture.ts` (`casus1AmpMinLoadOhm`, een lookup en geen constante), `casus1V2.fixture.ts` (de vloer in `CASUS1_V2_SETTINGS` en in de kandidaatverklaring), de twee scripts (poort wapenen, `kandidaat_uitkomst` per kandidaat, de vloerkolom, de uitzonderingslijst), `frozenNetlistGates.test.ts` en `goldenClassification.test.ts`. **Onaangeraakt:** `safety`, M-A, M-B, M-C, elke andere poort, `netOptimizer.ts`, `threeWayChain.ts` en de v1-route. Met de vlag uit verandert er niets.

  ---

  **V30 — VERVOLGSESSIE, 27-08-2026: DE VLOER IS NU EEN ZOEKDOEL. GEDEELTELIJK GESLOTEN.**

  De vorige sessie legde met bestand:regel vast dat de gestelde vloer een veto plus een reparatiepas achteraf is en nooit een zoekdoel, en liet de reparatie daarvan expliciet aan een eigen schone sessie. Dit is die sessie.

  **De inventarisatie eerst, want zij bepaalde de vorm van de ingreep.** Alle regelnummers hieronder zijn die van de boom VÓÓR deze sessie — dezelfde die V30 hierboven noteert; na de ingreep zijn ze verschoven.

  1. *De vondst van V30 klopt tegen de huidige boom.* `zFloorBarrier` was een parameter van `tune()` met de literal `false` als default (`netOptimizer.ts:2162`), en de enige aanroepen die hem op `true` zetten waren de twee van de reparatiepas (`3070`, `3073`). De hoofdzoektocht zag de vloer dus niet — bevestigd, niet aangenomen.
  2. *Het gewicht 1200 (`netOptimizer.ts:2303`) was een kaal literal en stond nergens anders.* Het is v1-eigendom, getuned vóór een lokale reparatie ("op 120 kostte een residu van 2,7 Ω een verwaarloosbare 1,2 en de reparatie liep vast"), en niets meet of die stijfheid ook voor een volle zoektocht deugt. Niet veranderd. Wél benoemd: `AMP_FLOOR_BARRIER_WEIGHT`, geëxporteerd, en op de v2-route reist hij als **grijze waarde** mee in de vingerafdruk met de noot *"overgenomen uit v1, niet v2-afgeleid"*. De naam is niet de voor de hand liggende: `noAppWideFloor.test.ts` verbiedt de stam van de verwijderde app-brede vloerconstante, en die guard ving eerst de constante en daarna het commentaar waarin de vangst werd uitgelegd. Precies waar een botte guard voor is.
  3. *Wie leest `ampFloorOhm` en `zSlackOhm` nog meer.* Elke andere lezer (`3058` reparatie-trigger, `3148` de noot, `3356` het snapdoel, `3673` de eindacceptatie, `1872` `zShortOhm` zelf) hangt aan `ampFloorOhm !== null` en niet aan de barrière — die vuren dus al zodra er een vloer gesteld is en het aanzetten van de barrière activeert daar niets nieuws. **Twee plekken hingen wél aan de barrièrevlag en hadden er niets mee te maken**, en dat is de vondst die de ingreep vorm gaf:

     - `2303`+ de corridor-annulering `barr -= 2 * m.corridorSq` — "takgetrouwheid wijkt voor de vloer";
     - `2342` `if (midB !== undefined && !zFloorBarrier && …)` — de blok-coördinaatverfijning wordt overgeslagen.

     Beide zijn gemeten **vóór de reparatiepas**: een lokale hertuning vanaf een afgerond netwerk, zonder vrijheid, die de corridor moet uitgeven om de dip op te tillen. Geen van beide is ooit een uitspraak geweest over een zoektocht die de vloer in haar doelfunctie heeft. Ze hingen aan die vlag omdat tot nu toe "de barrière staat aan" en "dit is de reparatiepas" **dezelfde bit** waren. Was dat zo gebleven, dan had "de vloer is een zoekdoel" er stilzwijgend ook "de corridor telt niet meer en de diepe polish vervalt" bij betekend — twee wijzigingen meer dan er gevraagd is. Daarom draagt `tune()` sinds deze sessie een aparte parameter `zFloorRepairPass`, die alleen de reparatie-aanroepen zetten, en hangen die twee gedragingen daaraan. Met de optie afwezig is elke aanroep byte-identiek aan voorheen; `floorAsGoal.test.ts` scant de bron zodat de scheiding een controleerbare bewering is en geen belofte.

  **Wat er gebouwd is.** `zFloorBarrier?: boolean` in `NetOptimizeOptions`, default `false`; het interne `zFloorBarrier` initialiseert uit `zFloorGoal`, dat op één plek naast `ampFloorOhm` wordt afgeleid en een gestelde vloer EIST (geen vloer ⇒ geen barrière, P4). Op de v2-route is het een **keuze**-sleutel (26 nu, 25 bij F4c; `NetOptimizeOptions` telt 38 sleutels): hij bepaalt wat "goed" is, en de kandidaat wapent hem zodra er een vloer gesteld is, of verklaart hem ABSENT met de P4-reden als er geen is. Nooit `false` bij afwezigheid — `false` zou zeggen dat iemand besloten heeft dat de vloer niet mag sturen, en met een leeg veld heeft niemand iets besloten. De ketens hoefden niets: de hook wordt in beide al als laatste gespreid, dus een gestelde keuze wint per constructie van een overgeërfde.

  ---

  **DE METING: VIJFTIEN KANDIDATEN, TWEE ARMEN, ÉÉN VERSCHIL.** `scripts/measure-v30-floor-goal.ts`, dertig ketenruns, ~30 min. Hetzelfde veld, dezelfde seed (20260827), dezelfde beschermingen, dezelfde gewapende poort. Het enige verschil is `zFloorBarrier`. De "vóór"-arm reproduceert de vorige sessie exact (min |Z| 0,86–1,38 Ω, RMS 2,72–3,58 dB), wat de arm zelf valideert.

  | | vóór (veto) | ná (zoekdoel) |
  | --- | --- | --- |
  | kandidaten | 15 | 15 |
  | haalt de vloer (poort in de run) | **0** | **11** |
  | shortlist | 0 | **10** |
  | netwerk byte-identiek aan de andere arm | — | 4 van 15 |

  Per kandidaat, met de prijs erbij. `min |Z|` is de poortwaarde uit de run; SPL, RMS en fase zijn `buildReport` op het GELEVERDE netwerk — ook voor de kandidaten die de poort weigert, want anders meet de tabel alleen de overlevers.

  | kandidaat (W-M · M-T) | min \|Z\| vóór → ná | vloer | SPL ± vóór → ná | RMS vóór → ná | W-M fase vóór → ná | M-T fase vóór → ná |
  | --- | --- | --- | --- | --- | --- | --- |
  | 396,7 · 1294 | 0,04 → 0,04 | nee → nee | 4,41 → 4,41 | 2,80 → 2,80 | 9,3 → 9,3 | 65,6 → 65,6 |
  | 396,7 · 1491,4 | 1,04 → **2,61** | nee → **ja** | 5,57 → 3,70 | 3,35 → 1,71 | 4,5 → 11,8 | 16,0 → 30,5 |
  | 396,7 · 1719 | 1,16 → **2,59** | nee → **ja** | 5,48 → 3,78 | 3,24 → 1,79 | 6,4 → 7,2 | 17,2 → 31,5 |
  | 396,7 · 1981,2 | 1,27 → **2,62** | nee → **ja** | 5,32 → 3,62 | 3,10 → 1,86 | 12,9 → 12,1 | 17,3 → 31,1 |
  | 396,7 · 2283,5 | 1,38 → **2,59** | nee → **ja** | 5,15 → 3,43 | 2,96 → 1,87 | 20,6 → 11,2 | 20,4 → 26,7 |
  | 466,5 · 1294 | 0,07 → **2,58** | nee → **ja** | 4,39 → 4,50 | 2,72 → 2,49 | 12,5 → 13,1 | **67,0 → 22,2** |
  | 466,5 · 1491,4 | 0,92 → 0,92 | nee → nee | 6,03 → 6,03 | 3,51 → 3,51 | 10,2 → 10,2 | 19,1 → 19,1 |
  | 466,5 · 1719 | 1,01 → 1,01 | nee → nee | 5,92 → 5,92 | 3,40 → 3,40 | 6,9 → 6,9 | 19,2 → 19,2 |
  | 466,5 · 1981,2 | 1,14 → **2,60** | nee → **ja** | 5,67 → 3,44 | 3,24 → 1,81 | 10,5 → 17,0 | 17,9 → 34,0 |
  | 466,5 · 2283,5 | 1,23 → **2,59** | nee → **ja** | 5,45 → 3,37 | 3,09 → 1,84 | 19,0 → 16,7 | 20,4 → 29,0 |
  | 548,5 · 1294 | 0,86 → 0,86 | nee → nee | 6,16 → 6,16 | 3,58 → 3,58 | 15,5 → 15,5 | 19,9 → 19,9 |
  | 548,5 · 1491,4 | 0,87 → **2,61** | nee → **ja** | 6,21 → 4,20 | 3,53 → 1,88 | 13,1 → 20,8 | 20,4 → 27,8 |
  | 548,5 · 1719 | 0,95 → **2,60** | nee → **ja** | 6,15 → 4,35 | 3,48 → 1,96 | **8,4 → 41,2** | 20,0 → 11,2 |
  | 548,5 · 1981,2 | 1,05 → **2,59** | nee → **ja** | 5,87 → 4,17 | 3,34 → 1,86 | **10,0 → 40,5** | 18,0 → 13,8 |
  | 548,5 · 2283,5 | 1,17 → **2,60** | nee → **ja** | 5,59 → 3,48 | 3,17 → 1,89 | 18,1 → 19,9 | 20,1 → 31,2 |

  **De prijs is niet wat de opdracht verwachtte, en dat is de hoofdbevinding.** De opdracht schreef: *"een deel haalt de vloer nu wél tegen een SPL/fase-kost"*. De SPL-kost is er niet — hij is een OPBRENGST. Elke kandidaat die de vloer haalt is óók vlakker geworden: RMS van 2,96–3,58 naar 1,71–1,96 dB, SPL-venster van ±5,15–6,21 naar ±3,37–4,35 dB, rimpel van 5,4–6,4 naar 3,6–4,6 dB. Dat is geen toeval en geen wonder: de "vóór"-netwerken waren voor een groot deel helemaal geen getunede netwerken. De reparatiepas ging bij alle vijftien af, mislukte bij alle vijftien, en een mislukte reparatie wordt teruggedraaid — wat er geleverd werd was wat er vóór de reparatie stond, en bij een deel was dat door de poorthook al teruggezet op het ZAAD. De vloer als zoekdoel levert dus niet "vlakheid ingeruild voor ohms" maar "een zoektocht die afloopt in plaats van eentje die wordt weggegooid".

  De **fase** is wel een prijs, en een echte. M-T-tracking gaat op de meeste kandidaten van 16–20° naar 27–34°. W-M is gemengd en op twee kandidaten ronduit slecht (8,4 → 41,2° en 10,0 → 40,5°, beide op de 548,5 Hz-as). Eén kandidaat gaat spectaculair de goede kant op (466,5 · 1294: M-T 67,0 → 22,2°), en dat is dezelfde kandidaat die van 0,07 Ω naar 2,58 Ω sprong — bij zo'n netwerk zegt de oude fasewaarde niets, want zij is gemeten aan iets dat niet gebouwd kan worden.

  Ter vergelijking, en niet ter conclusie: de v1-baselines staan op RMS 0,60–0,87 dB en fase 3,4–23,8°. Het gat op vlakheid is van ~2,5 dB naar ~1,1–1,3 dB gekrompen; op fase is het gegroeid. **Dit blijft één ketenpas per kandidaat, en de tabel spreekt over die pas, niet over wat een tuner kán.**

  ---

  **HET CORPUS.** De tien bevroren `KAND-V2-*`-netlists zijn hernoemd naar `V28_KAND_1..10` — dezelfde bestanden, byte-identiek gekopieerd onder een gedateerde naam, met hun klasse-B-blokken mee. Dat is geen referentie aanpassen: het zijn dezelfde netlists en dezelfde getallen, en zij blijven staan als de "vóór"-helft van de vergelijking hierboven, reproduceerbaar uit de repository zelf. De nieuwe shortlist (tien van vijftien) staat ernaast onder `KAND_V2_1..10`, opgewekt met dezelfde seed op hetzelfde veld.

  De uitzonderingslijst is daarmee van tien naar dertien namen gegaan en van vorm veranderd. Tien zijn de V28-netlists, die de vloer niet halen om de reden die V30 heeft vastgesteld. **De andere drie zijn een nieuwe bevinding en staan als V32 open:** `KAND_V2_1`, `_2` en `_6` PASSEERDEN de poort in hun eigen run (2,59–2,61 Ω) en missen de vloer als je ze als bestand nameet (2,36–2,45 Ω). Geen tegenspraak maar twee rasters, en de tuner had het zelf al gemerkt — zie V32.

  **Wat er in de code veranderde.** `netOptimizer.ts` (de optie, de afleiding `zFloorGoal`, de gesplitste `zFloorRepairPass`, het benoemde gewicht, en de doctrine-noot boven `BOUNDS` die nu zijn eigen uitzondering benoemt), `optimizer/choices.ts` (de sleutel geclassificeerd, `greyValues`), `optimizer/candidateDeclaration.ts` (de afleiding met haar P4-tegenhanger), `casus1.fixture.ts` (`casus1FilterFromParts`, uitgesneden zodat een geweigerde kandidaat óók gemeten kan worden), de twee scripts, het nieuwe meetscript, `floorAsGoal.test.ts`, `choiceKeyGuard.test.ts`, `goldenClassification.test.ts`, `frozenNetlistGates.test.ts`. **Onaangeraakt:** de reparatiepas zelf, `safety`, elke poort, `crossover3Variants`, de logica van beide ketens, en de v1-route — `toggleRegression.test.ts` is byte-identiek, en dát is het bewijs dat de default `false` doet wat hij zegt.

- V31 (**GEREPAREERD** op 27-08-2026 — een verworpen kandidaat levert een VERWERPING in plaats van zijn zaad; de arbitrage zelf blijft open) — opgeworpen bij de V30-vervolgsessie, 27-08-2026.

  **De aanleiding, gemeten.** Van de vijftien kandidaten haalden er elf de vloer zodra zij een zoekdoel was. De andere vier leverden een netwerk dat **byte-identiek** is aan hun "vóór"-arm, en de reden is niet dat de barrière niets deed. Alle vier keerden vroeg terug: het getypte pass-resultaat `ampFloorRepair` ontbreekt op het teruggegeven object, wat alleen gebeurt op het pad waar de **volle-band veiligheidspoort de hele tune verwerpt** en `optimizeNetworkValues` het zaad teruggeeft.

  | kandidaat | geleverd min \|Z\| | `safetyKinds` | wat de poort zei |
  | --- | --- | --- | --- |
  | 396,7 · 1294 | 0,035 Ω | `protection` | *tweeter protection got worse* |
  | 466,5 · 1491,4 | 0,924 Ω | `protection` | *tweeter protection got worse* |
  | 466,5 · 1719 | 1,014 Ω | `protection` | *tweeter protection got worse* |
  | 548,5 · 1294 | 0,859 Ω | `valley` | *the crossing sank into a 11 dB hole* |

  **En de verworpen tune wás beter.** Bij de eerste noteert `ampFloorNote` letterlijk *"the rejected tune — amp-load floor: system impedance dips to 1,8 Ω"*: de barrière tilde het netwerk van 0,035 Ω naar 1,8 Ω, bereikte de vloer niet, en de veiligheidspoort gooide daarna het hele resultaat weg. Wat de ontwerper krijgt is 0,035 Ω. **Een netwerk dat op twee eisen tegelijk faalt wordt hier vervangen door een netwerk dat op één ervan veel erger faalt.**

  Dat is een uitspraak over de ARBITRAGE en niet over de veiligheidspoort. Die poort heeft gelijk: een tune die de tweeterbescherming verslechtert mag niet geleverd worden, en zonder hem leverde de eerste V27-fixture 0,00 Ω met een keurige rimpel. Het probleem is dat de arbitrage tussen "de versterker moet dit kunnen drijven" en "de tweeter moet dit overleven" vandaag een **alles-of-niets-veto op de hele tune** is, met terugval op een zaad dat op geen van beide is beoordeeld. Drie mogelijke vormen, geen ervan hier gekozen:

  1. **Beide in de doelfunctie.** De tweeterbescherming krijgt, net als de vloer nu, een barrièreterm, zodat de zoektocht de afruil zelf maakt in plaats van hem aan een veto over te laten. Risico: dit is precies de weg waarlangs `fxOf` volloopt met harde eisen, en de netOptimizer-noot boven `BOUNDS` telt al twee dure metingen die daartegen pleiten.
  2. **Terugval op de beste toelaatbare tussenstand** in plaats van op het zaad. Goedkoop en eerlijk, maar het vraagt dat de tuner tussenstanden bewaart en dat "toelaatbaar" al tijdens de zoektocht bekend is.
  3. **Weigeren met naam en toenaam.** De kandidaat levert niets en meldt "geen netwerk gevonden dat beide eisen haalt", in plaats van een zaad dat als ontwerp leest. Het minst werk en het meest in de geest van P4 — maar het verandert de contractvorm van de keten.

  **Wat het zou beslechten:** één meting die er niet is — een run waarin de barrière en de tweeterbescherming allebei in de doelfunctie zitten, op deze vier kandidaten, naast de huidige. Zolang die er niet is, is elke keuze hierboven een voorkeur. **Open.**

  ---

  **V31 — VERVOLGSESSIE, 27-08-2026: OPTIE 3 GENOMEN. DE ARBITRAGE BLIJFT OPEN.**

  **DE INVENTARISATIE.** Regelnummers van de boom vóór deze sessie (`851c579`).

  | stap | bestand:regel | wat er gebeurt |
  | --- | --- | --- |
  | de veiligheidspoort verwerpt | `netOptimizer.ts:3915` | `return { parts: cloneParts(parts), … }` — het ZAAD, met `tuned: 0`, `safetyNote` en `safetyKinds`, en zónder `ampFloorRepair` |
  | de gevoeligheidspoort verwerpt (solo) | `netOptimizer.ts:3836` | dezelfde vorm, zonder `safetyKinds` — geen enkele meerwegroute wapent hem |
  | de worker neemt het over | `worker.ts:834` | `const result = run(…)`, en niets kijkt naar `safetyNote` |
  | het zaad wordt gemeten | `worker.ts:868` | `judge(result)` op het ZAAD; die getallen dragen het label van de kandidaat |
  | het bereikt de shortlist | `shortlist.ts:176` | `parts: c.parts` — een rij, dus een aanbod om te bouwen |
  | en het scherm | `App.tsx:6940` | `v2Field.push({ parts: c.result.parts, … })` |

  Twee dingen die de vorm bepaalden. **De detectie moet STRUCTUREEL zijn, niet tekstueel:** `netOptimizer.ts` zegt zelf bij `safetyKinds` dat de prozanoot nooit gelezen mag worden om iets te beslissen (dat is hoe `zOk` vier dingen tegelijk ging betekenen). `safetyNote` bestáát op precies de twee returns die een hele tune weggooien en nergens anders — dus de AANWEZIGHEID ervan is het signaal, en de tekst blijft voor een mens. **En de veiligheidsregel mocht niet veranderen:** zij heeft gelijk, en de opdracht verbood het.

  **WAT ER GEBOUWD IS — DRIE LAGEN, GEEN ERVAN EEN BESLUIT.**

  1. `netOptimizer.ts` krijgt één instrumentatie-optie, `rejectedTuneReport` (POLISH; sleuteltelling 38 → 39). Aan: de twee wholesale-returns dragen `rejectedTune` (de metrieken van wat werd weggegooid) en `rejectedParts`. Uit — élke v1-run — is het resultaatobject byte-identiek aan voorheen. Geen enkele regel leest deze velden; ze veranderen niets.
  2. `worker.ts` herkent de verwerping, en **trekt het netwerk in**: `result.parts` wordt leeg, de poorten worden niet geëvalueerd, `measurements` wordt de niet-geoordeelde toestand, en `rejectedParts` wordt gestript vóór de terugreis — het beste tussenresultaat wordt hier gemeten (min \|Z\|, SPL-venster, RMS, fase) en gaat als GETALLEN mee, nooit als onderdelen. Wat een aanroeper krijgt is `rejection: { kinds, reason, rejectedTune, note }`.
  3. `shortlist.ts` krijgt een DERDE uitgang naast "een eis" en "een poort". Bewust apart: de ladder mag de eerste verruimen, mag de tweede nooit aanraken, en heeft bij de derde niets te verruimen — er ís geen ontwerp. De verwerping verschijnt in `rejected` mét de regel die haar veroorzaakte, nooit als rij; en de diagnose ("wat kwam het dichtst in de buurt") kijkt niet meer naar een kandidaat die niets geleverd heeft, want dat zou het zaad tot beste bijna-misser maken.

  **DE METING, EN ZIJ ZEGT IETS ANDERS DAN V30 VERWACHTTE.** Op het opnieuw opgewekte veld (dezelfde seed, dezelfde vloer, ná V32) leveren er nog **twee** van vijftien geen netwerk, allebei op `protection`:

  | kandidaat (W-M · M-T) | regel | de GEWEIGERDE tune: min \|Z\| | SPL-venster | RMS |
  | --- | --- | --- | --- | --- |
  | 466,5 · 1491,4 | `protection` | 2,59 Ω | **±72,52 dB** | 1,70 dB |
  | 548,5 · 1294 | `protection` | 2,59 Ω | **±72,70 dB** | 1,43 dB |

  **En hier kantelt het oordeel over de arbitrage.** V30 noteerde dat de verworpen tune BETER was (de barrière tilde 0,035 → 1,8 Ω en het resultaat werd weggegooid). Zodra de poort de volle sweep leest, is dat beeld weg: de geweigerde tunes hálen de vloer nu (2,59 Ω) en hebben een SPL-venster van ±72 dB — één diepe uitdovingsnotch, want de RMS is met 1,4–1,7 dB gewoon netjes. Dat is precies wat een verslechterde tweeterbescherming eruit hoort te zien, en het is de metriek die de veiligheidspoort meet (`protSqDb`). **De poort had gelijk, en V31's reparatie is nu juist wat dat laat zien**: vóór V31 kreeg de ontwerper het zaad met de getallen van het zaad; nu krijgt hij "geweigerd wegens tweeterbescherming, en wat geweigerd werd stond op 2,59 Ω met een venster van ±72 dB".

  **WAT DAARMEE OPEN BLIJFT, en het is de kern van V31.** De arbitrage tussen "de versterker moet dit kunnen drijven" en "de tweeter moet dit overleven" is nog steeds een alles-of-niets-veto. Optie 3 uit de lijst hierboven is genomen — weigeren met naam en toenaam — en dat is de kleinste van de drie: hij repareert wat er GERAPPORTEERD wordt, niet wat er GEZOCHT wordt. Optie 1 (beide in de doelfunctie) en optie 2 (terugval op de beste toelaatbare tussenstand) staan onverkort open, en de meting die ertussen zou beslissen is nog steeds niet gedaan. Wat deze sessie wél heeft toegevoegd is dat die meting nu goedkoper is: het `rejectedTune`-blok maakt zichtbaar wat een veto kost, per kandidaat, zonder de run opnieuw te draaien.

  **WAT ER IN DE CODE VERANDERDE.** `netOptimizer.ts` (één optie, twee spreads, nul besluiten), `optimizer/worker.ts` (`CandidateRejection`, de intrekking), `optimizer/shortlist.ts` (de derde uitgang, `rejected`, selectieversie 1.0 → 1.1), `optimizer/choices.ts` (de sleutel geclassificeerd), `App.tsx` (de verwerping reist mee het veld in), plus `wholesaleRejection.test.ts` en de generator. **Onaangeraakt:** de veiligheidspoort zelf, elke veiligheidsregel, de barrière, het gewicht en de reparatiepas.

- V32 (**GESLOTEN** op 27-08-2026 — elke elektrische poort oordeelt op de gemeten impedantiesweep) — opgeworpen bij de V30-vervolgsessie, 27-08-2026.

  **De aanleiding.** Drie van de tien nieuw bevroren netlists — `KAND_V2_1`, `_2`, `_6` — passeerden `M-B/|Z|` in hun eigen ketenrun met 2,594–2,606 Ω, en missen dezelfde vloer als je het BESTAND nameet: 2,447 / 2,358 / 2,388 Ω. Geen van beide metingen is fout; zij kijken naar een ander gebied. De minima liggen op **82,5 / 83,7 / 82,1 Hz**, en het analyseraster van de keteninvoer begint op 200 Hz.

  **En dit is niet "de keten kijkt niet laag genoeg".** Nagemeten, want dat was de eerste verklaring en zij was fout:

  | raster | bereik | wie leest het |
  | --- | --- | --- |
  | `CASUS1_V2_GRID` (analyse) | 200 Hz – 20 kHz, 96 punten | de v2-POORTREFERENTIE, die hierop bevroren wordt |
  | het `safety`-raster | **20,5 Hz** – 20 kHz, 240 punten | de TUNER, voor `zShortOhm`, de reparatietrigger en de eindacceptatie |

  De tuner ziet die dip dus wél. Sterker: hij heeft erop gereageerd. In `casus1_v2_herkomst.json` staat per kandidaat `pas.ampFloorRepair`, en het patroon is exact:

  > **Alle vier de kandidaten met `ampFloorRepair: 'failed'` zijn precies de vier waarvan het minimum onder 200 Hz onder de vloer ligt. Alle zeven met `'none'` halen de vloer ook op de volle sweep.** Vier op vier, zeven op zeven.

  De tuner probeerde te repareren, faalde, en leverde af; de poort — die alleen boven 200 Hz keek — zei geslaagd. **Twee oordelen over dezelfde eis, op twee rasters, en het strengste van de twee is niet het oordeel dat wordt afgedrukt.**

  **Waarom de rasterbodem daar ligt, en waarom dat voor impedantie niet klopt.** 200 Hz is waar de VERRE-VELDMETINGEN van deze set beginnen. Voor een responsie-eis is die grens juist — een respons die niet gemeten is, wordt niet beoordeeld. Voor een impedantie-eis is zij verkeerd, en `netOptimizer.ts` zegt dat zelf al bij `band`: *"the amplifier-load floor and its repair pass deliberately keep working on the FULL grid regardless: they are impedance criteria, and an impedance measurement has no gate"*. Binnen de tuner wordt die regel nageleefd; de v2-poortreferentie is er nooit aan gehouden.

  Het is geen resolutiekwestie. Het vierde grensgeval, `KAND_V2_10`, heeft zijn minimum op 420 Hz — midden in het raster — en haalt de vloer met 0,004 Ω. Wat hier bijt is de BODEM, niet de dichtheid.

  **Een vermoeden, niet getoetst.** De vloer als zoekdoel duwt het netwerk naar de laagste \|Z\| die de DOELFUNCTIE ziet, en de doelfunctie leest `zShortOhm` — dus in principe wel het veiligheidsraster. Toch liggen drie van de tien minima nu op ~82 Hz, terwijl de tien V28-netlists (zonder barrière) er geen enkele onder 800 Hz hadden. Of dat verplaatsing is of toeval van drie gevallen, zegt deze sessie niet.

  **De richting van de reparatie is duidelijk en bewust niet genomen:** de impedantiekant van de v2-poortreferentie hoort de volle gemeten sweep te dekken, net als het veiligheidsraster, ook waar er geen responsie is. Dat raakt `casus1V2.fixture.ts`, `gates.ts` en de vorm van `GateReference`; het verandert de poortuitslagen van élk bestaand v2-corpus; en het verdient dezelfde behandeling als V30 zelf — een eigen sessie met een vóór/ná-meting, niet een correctie die onderweg meelift. **De drie netlists staan intussen in `vloeruitzonderingen` met deze reden erbij en mogen niet gebouwd worden.** Open.

  ---

  **V32 — VERVOLGSESSIE, 27-08-2026: ELKE ELEKTRISCHE POORT OORDEELT OP DE GEMETEN SWEEP. GESLOTEN.**

  **DE INVENTARISATIE EERST**, want zij bleek breder dan M-B/|Z|. Alle regelnummers zijn die van de boom VÓÓR deze sessie (`851c579`).

  | wie | bestand:regel (vóór) | oordeelde op | hoort te oordelen op |
  | --- | --- | --- | --- |
  | de bevroren referentie | `gates.ts:525` (`buildAnalysis(netlist, ref.grid, …)`) | het ketenraster | — (zij is de bron van de vier hieronder) |
  | M-A, dissipatiefractie | `gates.ts:540` | het ketenraster | de sweep |
  | M-B/EPDR | `gates.ts:542` | het ketenraster | de sweep |
  | M-B/\|Z\| | `gates.ts:542` (`minZOhm` uit dezelfde `epdr()`) | het ketenraster | de sweep |
  | M-C, spanning op f_s | `gates.ts:568` | het ketenraster | de sweep |
  | "hoogdoorlaatbeschermd" | `gates.ts:466`, `558` | het ketenraster | de sweep |
  | doorlaatband-\|Z\|-mediaan (voedt twee A5d.6-inversies) | `worker.ts:503` | het ketenraster | de sweep |
  | dezelfde mediaan, in het rapport | `report.ts:769` | **de ruwe sweep** | — (die was al goed) |
  | het analyseraster van het rapport | `report.ts:351` | de sweep-unie, 1600 punten | — (die was al goed) |

  Drie dingen vielen daarbij op, en alle drie hebben de vorm van de ingreep bepaald.

  1. **Het is niet één poort maar zes lezers**, en zij lezen allemaal uit dezelfde twee regels: `dissipation(analysis)` en `epdr(analysis)` op `ref.grid`. Eén raster verzetten repareert ze alle zes tegelijk — of vergeet ze alle zes tegelijk.
  2. **Het rapport deed het al goed.** `report.ts` bouwde zijn analyseraster uit de UNIE van de driversweeps (1600 punten, randen vlak gehouden, met een `problems`-regel erbij) en las de mediaan van de ruwe sweep. De v2-route deed geen van beide. Dit was dus nooit "welk raster is juist" maar "waarom zijn er twee implementaties" — en één ervan had het antwoord al.
  3. **`netOptimizer.ts` draagt de regel zelf**, bij `band`: *"the amplifier-load floor and its repair pass deliberately keep working on the FULL grid regardless: they are impedance criteria, and an impedance measurement has no gate."* De tuner leefde die na; de poortreferentie is er nooit aan gehouden.

  **WAT ER GEBOUWD IS.** Eén functie, `impedanceReferenceFrom` in het nieuwe `optimizer/impedanceReference.ts`, en twee aanroepers: `report.ts` (voor zijn analyseraster) en `freezeGateReference` (voor de nieuwe helft `GateReference.impedance`). Zelfde uitgestrektheid, zelfde resolutie (`ANALYSIS_GRID_POINTS`), zelfde randbehandeling, zelfde zin erover. "Poort en paneel zeggen hetzelfde" is daarmee een IDENTITEIT geworden in plaats van een toevalligheid die standhoudt tot iemand er één bewerkt.

  `evaluateGates` splitst sindsdien in twee analyses: de RESPONSANALYSE op `ref.grid` leidt nog uitsluitend de kruispunten af (dat is een responsgrootheid en haar bodem hoort de verre-veldspan te zijn), en de ELEKTRISCHE analyse op `ref.impedance.grid` levert élke ohm, elke dB en de beschermingsafleiding.

  **GEEN SWEEP, GEEN OORDEEL, EN GEEN TERUGVAL.** Ontbreekt de sweep — of ontbreekt hij voor één tak, want een systeemimpedantie is geen grootheid per driver — dan levert de poort GEEN waarde, met een zin die de ontbrekende invoer noemt (de lek-2-vorm van F4b). Terugvallen op het responsraster zou precies het oordeel herstellen dat hier wordt ingetrokken, en het stil doen. Dat betekende wel dat de casus-1-fixture voortaan de gemeten feiten móest meesturen: zij stuurde er nul, en `factsForWorker` — het bruggetje dat `App.tsx` al gebruikt — stuurt ze nu alle vijf. Halve feiten sturen (de sweep wél, het geldigheidsinterval van dezelfde meting niet) is de incoherentie waar F4b's lek 2 over ging.

  **DE ENE ZACHTE PLEK, GEMETEN IN PLAATS VAN BEREDENEERD.** Het oordeelraster is de UNIE van de sweeps en niet de doorsnede — de doorsnede is op deze set 200 Hz en dat is de blindheid zelf, van de andere kant benaderd. De prijs: de tweetersweep begint op 199,95 Hz, dus onder die grens wordt de tweeterimpedantie vlak gehouden en rust élk oordeel op 82 Hz deels op extrapolatie. Het fysische antwoord is dat een seriecondensator die tak daar allang uit beeld heeft gehaald. Dat is een argument; hier is de meting: het geëxtrapoleerde gebied maal tien en maal een tiende — een factor honderd — beweegt het systeemminimum op géén enkele bevroren netlist, tot vier decimalen. Vastgelegd in `frozenNetlistGates.test.ts`, zodat het antwoord op een ontwerp dat er ooit wél van afhangt een tweetersweep is die lager reikt, en geen ruimere test.

  ---

  **DE METING: WAT DE REPARATIE MET HET CORPUS DEED.** Zelfde veld, zelfde seed (20260827), zelfde vloer, zelfde beschermingen. De "vóór"-helft is geen tweede run maar het BEVROREN V30-corpus, want V32 is geen optie die je uit kunt zetten; beide helften gaan door hetzelfde `buildReport`-pad. `scripts/compare-v30-v32-corpus.ts`, seconden.

  | | vóór (V30-corpus) | ná (V31/V32-corpus) |
  | --- | --- | --- |
  | veld | 15 | 15 |
  | leverde geen netwerk (V31) | 4 (als zaad afgeleverd) | **2 (als verwerping)** |
  | netwerk geleverd dat een poort weigert | 0 zichtbaar | **6** |
  | shortlist / bevroren | 10 | **7** |
  | haalt de vloer ALS BESTAND | **7 van 10** | **7 van 7** |

  **De drie die uitvallen zijn precies de drie die V32 aanwees**, en niets anders beweegt:

  | kandidaat (W-M · M-T) | min \|Z\| als bestand | @ Hz | vóór → ná |
  | --- | --- | --- | --- |
  | 396,7 · 1491,4 | 2,45 | 82,5 | bevroren → **uit de shortlist** |
  | 396,7 · 1719 | 2,36 | 83,7 | bevroren → **uit de shortlist** |
  | 396,7 · 2283,5 | 2,39 | 82,1 | bevroren → **uit de shortlist** |
  | 466,5 · 1294 | 2,55 | 420,2 | bevroren → bevroren |
  | 466,5 · 1981,2 | 2,59 | 1125,3 | bevroren → bevroren |
  | 466,5 · 2283,5 | 2,58 | 1231,8 | bevroren → bevroren |
  | 548,5 · 1491,4 | 2,60 | 1032,9 | bevroren → bevroren |
  | 548,5 · 1719 | 2,57 | 132,2 | bevroren → bevroren |
  | 548,5 · 1981,2 | 2,57 | 132,2 | bevroren → bevroren |
  | 548,5 · 2283,5 | 2,59 | 1243,5 | bevroren → bevroren |

  **De zeven overlevers zijn BYTE-IDENTIEK aan hun V30-voorgangers** — nagemeten, onderdeel voor onderdeel, en het is de scherpste uitspraak die deze sessie kan doen: V32 heeft geen enkel ontwerp veranderd, het heeft er drie ingetrokken die niet gebouwd hadden mogen worden. SPL, RMS en beide fasekolommen staan in de vergelijkingstabel en zijn overal identiek (`compare-v30-v32-corpus.ts`).

  De uitzonderingslijst is daarmee van dertien namen naar dertien namen gegaan en van SOORT veranderd: **geen enkele LEVENDE netlist staat er nog in.** Tien zijn V28 (bevroren vóór de vloer een zoekdoel was) en drie zijn V30 (bevroren toen de poort nog blind was onder 200 Hz) — beide gedateerde corpora, meetobject en geen ontwerp. De lijst hoorde leeg te raken van levende netlists, en dat is gebeurd.

  **WAT DE REPARATIE ZICHTBAAR MAAKTE EN NIET OPLOST — DE 396,7 Hz-AS.** Van de vijftien kandidaten leveren er zes een netwerk dat de vloer mist, en vijf daarvan zitten op de 396,7 Hz-as: 0,01 / 1,04 / 1,16 / 1,27 / 1,38 Ω. Dat zijn exact de "vóór"-waarden van de V30-tabel, en de reden is te lezen in `gateRefusals`: *"value tune refused: M-B/\|Z\|: 2.42 Ω falls below the stated floor of 2.60 Ω"*. De poort weigert nu terecht, `tune()` valt terug op het zaad (`netOptimizer.ts:2791`, `cur = asIs(seedParts)`), en wat er wordt afgeleverd is ongetuned. **De oorzaak is dat de zoektocht niet kan mikken op wat de poort handhaaft:** de barrièreterm leest `m.zShortOhm` van de metriek op het EVALUATIERASTER (`netOptimizer.ts:2401` op `1953`), dus zij ziet de dip op 82 Hz niet, terwijl de poort hem sinds V32 wél ziet. Doelfunctie en poort kijken nu naar twee verschillende gebieden — dezelfde vorm als V30, één laag verder. De reparatie ligt voor de hand (`zShortOhm` van het veiligheidsraster laten meewegen in de barrière) en is deze sessie NIET genomen: de opdracht verbood elke wijziging aan de barrière, en zo'n wijziging verdient dezelfde behandeling als V30 en V32 — een eigen sessie met een vóór/ná-meting. **Staat als V33 open.**

  **WAT ER IN DE CODE VERANDERDE.** Nieuw: `optimizer/impedanceReference.ts`, `optimizer/gateGrid.test.ts`. Gewijzigd: `optimizer/gates.ts` (de tweede helft van de referentie, de gesplitste analyses, `whyNull` en `judged_on`), `report.ts` (rasterbouw via de gedeelde functie), `optimizer/worker.ts` (sweeps in de referentie, de mediaan van de sweep, de noten), `optimizer/v2.fixture.ts` (eigen sweeps), `casus1V2.fixture.ts` (`casus1V2Facts`), de drie scripts, `frozenNetlistGates.test.ts`, `borderFacts.test.ts`, `f4cRegression.test.ts`. **Onaangeraakt:** het ketenraster, de barrière, het gewicht, de reparatiepas, `safety`, en de v1-route — `toggleRegression.test.ts` is byte-identiek.

- V33 (**GESLOTEN** op 27-08-2026 — doel en poort lezen per constructie één getal, en een poort die de hele tune weigert levert een verwerping) — opgeworpen bij de V31/V32-sessie, 27-08-2026.

  **De aanleiding, gemeten.** Van de vijftien kandidaten leveren er zes een netwerk dat de gestelde vloer mist, en vijf daarvan zitten op de 396,7 Hz-as: 0,01 / 1,04 / 1,16 / 1,27 / 1,38 Ω. Dat zijn exact de "vóór"-waarden uit V30's tabel — dus deze kandidaten leveren wat zij leverden toen de vloer nog géén zoekdoel was.

  **Waarom.** `gateRefusals` zegt het letterlijk: *"value tune refused: M-B/|Z|: 2.42 Ω falls below the stated floor of 2.60 Ω"*. De poort weigert de waardetune, `tune()` valt terug op het zaad (`netOptimizer.ts:2791`), en wat wordt afgeleverd is ongetuned. De barrièreterm die de zoektocht naar de vloer moet duwen leest `m.zShortOhm` van de metriek op het EVALUATIERASTER — 200 Hz en hoger op deze set. Sinds V32 handhaaft de poort op de volle gemeten sweep. **Doelfunctie en poort kijken dus opnieuw naar twee verschillende gebieden, en dat is dezelfde vorm als V30, één laag verder.**

  De voor de hand liggende reparatie is `worstZOf` (die het veiligheidsraster al meeneemt en al bestaat, `netOptimizer.ts:3145`) ook de barrièreterm te laten voeden. **Bewust niet genomen:** de opdracht van deze sessie verbood elke wijziging aan de barrière, aan het gewicht en aan de reparatiepas, en zo'n wijziging verdient dezelfde behandeling als V30 en V32 — een eigen sessie met een vóór/ná-meting op hetzelfde veld met dezelfde seed, niet een correctie die onderweg meelift. Het risico dat gewogen moet worden staat al in de noot boven `BOUNDS`: de vloer als fx-term is twee keer gemeten en beide keren duur geweest, en de barrière is precies de vorm die dat moest omzeilen.

  **Wat er intussen NIET misgaat:** deze vijf worden door de poort geweigerd en komen niet in de shortlist. Er wordt dus niets onbouwbaars aangeboden — het veld is alleen kleiner dan het zou kunnen zijn. **Open.**

  ---

  **V33 — VERVOLGSESSIE, 27-08-2026: DE BARRIÈRE LEEST DE POORT HAAR EIGEN GETAL. GESLOTEN.**

  **DE INVENTARISATIE EERST**, want zij bepaalde de vorm van de ingreep en zij leverde één bevinding op die de opdracht niet voorzag. Alle regelnummers zijn die van de boom VÓÓR deze sessie (`4cb9cc6`).

  *1. Waar de barrière `zShortOhm` las.* `netOptimizer.ts:2442`, binnen `objective`, op de metriek van regel `2402` — en die draait op `optW.freq`, het GEDECIMEERDE EVALUATIERASTER (`1243`, `1256`): het ketenraster van de casus met stapgrootte `grid.length / 150`, wat op casus 1 stapgrootte 1 is en dus 96 punten van 200 Hz tot 20 kHz. `zShortOhm` zelf wordt op `1994` uit `zMinOhm` van dát raster afgeleid.

  *2. Heeft de tuner al een raster tot 20 Hz — en waarom las de barrière dat niet?* Ja, en dat is precies de tegenstelling die V32 al noteerde. `opts.safety` draagt een eigen raster (op casus 1 20,5 Hz–20 kHz, 240 punten), en `worstZOf` (`3184`) neemt het MAXIMUM van het tekort op het evaluatieraster en op dat veiligheidsraster. Wie leest `worstZOf`: de reparatie-trigger, de acceptatie van de reparatie, en het geleverde eindoordeel. Wie las hem NIET: de barrièreterm. De veiligheidsREGEL las dus wél laag en het zoekDOEL niet — één requirement, twee gebieden, en de strengste lezing zat in de regel die achteraf oordeelt.

  Waarom de barrière hem niet las is geen vergissing maar een plaats: de barrière zit BINNEN `objective`, waar het evaluatieraster het enige raster is dat toch al berekend wordt, en `worstZOf` zit in de ACCEPTATIE ná de tune. Dat was verdedigbaar zolang de barrière alleen door de reparatiepas werd gezet — één lokale hertuning vanaf een afgerond netwerk, waarna dezelfde acceptatie hem alsnog op het veiligheidsraster afrekende. V30 heeft hem een zoekterm gemaakt en die plaats niet verlegd; V33 is dat.

  *3. Wat er gebeurt als `gateViolation` binnen `tune()` een stap weigert.* Er zijn acht aanroepen van `gateOk`, en zij zijn niet gelijk. Zeven weigeren een STAP en houden `cur` vast — de basin-challenge (`2642`), de auditverwijdering (`2794`), de doelbarrière-tune (`2862`), de prune (`2977`), de escalatie (`3007`), de na-structuur-settle (`3019`) en de condensatorkrimp (`3147`). Dat is een weigering die niets weggooit: wat er stond blijft staan, de regel komt in `gateRefusals`, en er is niets aan te repareren.

  De achtste is anders. `netOptimizer.ts:2832` — `if (opts.gateViolation && !gateOk(cur.parts, 'value tune')) cur = asIs(seedParts);` — gooit de HELE waardetune weg en zet de werkstand terug op het zaad (`asIs`, `2820`, met `freeCount: 0`: er is niets getuned). De run gaat van daaraf verder, en wat er uiteindelijk uitkomt reist als een gewoon resultaat naar `worker.ts:993` (`const delivered = run(...)`), wordt daar op `1077` gemeten alsof het een ontwerp is, en bereikt `shortlist.ts:221` (`parts: c.parts`) als een RIJ — een aanbod om te bouwen. Dat er niets getuned is, is nergens in dat pad zichtbaar: `tuned` staat op 0, maar de shortlist leest dat veld niet. Dit is de vijf-van-vijftien van V33: `gateRefusals` zegt *"value tune refused: M-B/|Z|: 2.42 Ω falls below the stated floor of 2.60 Ω"*, en de rij die verschijnt draagt 0,01–1,38 Ω.

  *4. Draagt er ná V32 en ná deze sessie nog een lezer van het KETENRASTER een oordeel of een doel?* **Ja, twee families, en geen van beide is hier omgezet — de opdracht zei noemen.**

  - **De bronweerstandsprobe.** `rSourceOf` (`1084`) roept `sourceResistanceOhm(ps, { grid, driverZ, … })` aan met het KETENRASTER, en die waarde voedt vier dingen die allemaal oordelen: de harde diskwalificatie `rSourceDisqualifyOhm` (`1171`–`1175`), de structuurzet-bewaking `rsSafe` (`2881`–`2883`), de audittier van 1,0 Ω (`3410`) en het geleverde rapport (`3849`). Daarnaast is er een DOEL: `dissRatio` (`1533`) = R_source/R_e op dezelfde probe, dat via `dissW · dissRatio²` rechtstreeks in `fxOf` zit (`2166`).

    En op casus 1 is dat geen theoretisch bezwaar. `sourceProbeIndex` valt terug op "de impedantiepiek in het onderste kwart van het raster" wanneer er geen f_b gesteld is, en op deze meetset levert dat voor de woofer **index 24, 640,2 Hz** — de BOVENrand van zijn eigen zoekvenster (`stop = max(400, grid[24])`), niet een resonantie: de resonantie van deze woofer ligt onder de rasterbodem. De bewaking die daar bestaat (`inBand: best > 0`) verwerpt alleen index 0. Nagemeten deze sessie, met `sourceProbeIndex` op de casus-1-keteninvoer: woofer 640,2 Hz `inBand: true`, mid 200,0 Hz `inBand: false`, tweeter 640,2 Hz `inBand: true`. De dissipatieterm en de diskwalificatiegrens van casus 1 worden dus gewogen op een frequentie die de rasterrand aanwijst. **Opgeworpen als V34.**

  - **De relatieve impedantiebewaking in de structuurzetten.** `safe` (`2767`), `safeEsc` (`2893`) en de basin-challenge (`2663`) vergelijken `m.zShortOhm <= ref.zShortOhm + 0,1` uitsluitend op het evaluatieraster. Dat zijn veiligheidsregels, de opdracht verbood ze aan te raken, en ze zijn RELATIEF (zij vergelijken twee netwerken op hetzelfde raster) — dus zij liegen niet zoals een absolute poort dat zou doen. Genoemd, niet omgezet.

  **WAT ER GEBOUWD IS — TWEE DINGEN, EN ALLEBEI EEN VORM DIE AL BESTOND.**

  1. **De bron van de kortste-impedantie-grootheid is een KEUZE geworden, met DRIE waarden.** `zFloorBarrierSource?: 'grid' | 'safety' | 'sweep'`, default afwezig = `'grid'` = wat de barrière altijd al las. Dat is niet beleefdheid maar noodzaak: de reparatiepas op de v1-route roept diezelfde barrière aan, en die bron mocht daar niet bewegen.

     | waarde | raster | wie leest hem |
     | --- | --- | --- |
     | `'grid'` | het gedecimeerde evaluatieraster, op casus 1 96 punten vanaf 200 Hz | de default, en dus élke v1-run |
     | `'safety'` | het volle-band veiligheidsraster van de tuner (`opts.safety`), op casus 1 240 punten, 20,5 Hz–20 kHz | **de v2-route** |
     | `'sweep'` | de gemeten impedantiesweeps van de drivers, `ANALYSIS_GRID_POINTS` = 1600 punten, 10–20 317 Hz — het raster waarop de poort oordeelt | de referentiearm van deze entry |

     Alle drie gaan door **dezelfde lezer** (`systemMinImpedanceOhm` → `minImpedanceAt`), en dat is de vorm van de ingreep: het RASTER is een parameter, geen tweede implementatie. De data voor `'sweep'` reist ernaast als `zFloorBarrierImpedance` (POLISH), gevuld door de worker uit precies het `ImpedanceReference`-object waarop de poort bevroren is; `'safety'` heeft niets nodig, want de veiligheidsset is al een keuze die de kandidaat stelt. Twee sleutels en niet één, om dezelfde reden als V30 en V33 twee entries zijn: WELKE band het doel meet is een keuze, WAT er op die band staat is de meting die de run al in handen heeft. Sleuteltelling 39 → 41.

     Eén regel in `netOptimizer.ts` veranderde: `barr += AMP_FLOOR_BARRIER_WEIGHT * (barrierShortOhm(m, work) / ampFloorOhm!) ** 2`. Op `'grid'` geeft `barrierShortOhm` letterlijk `m.zShortOhm` terug — zelfde uitdrukking, zelfde volgorde, dus byte-identiek.

     **`minImpedanceAt` is de gedeelde regel.** Zij staat in `impedanceFloor.ts`, naast `meetsAmpFloor`, en zij is de énige plek waar wordt beslist wat "de kortste impedantie" is (eerste index wint, strikte `<`, geen epsilon). `epdr()` — waar de poortwaarde vandaan komt — leest hem sinds deze sessie ook. Op `'sweep'` levert dat een IDENTITEIT: `frozenNetlistGates.test.ts` assert dat de barrièregrootheid en de poortwaarde voor elke bevroren netlist met `toBe` gelijk zijn, niet met een tolerantie.

     **WAAROM DE v2-ROUTE TOCH `'safety'` STELT, EN NIET DE IDENTITEIT.** Omdat de identiteit een prijs heeft die niemand betaalt: de sweeplezing maakt van een casus-1-ketenrun elf minuten in plaats van één (gemeten, zie hieronder). `'safety'` heeft dezelfde UITGESTREKTHEID en dezelfde lezer, en verschilt alleen in resolutie — dus de vraag is niet "is het hetzelfde getal" maar "hoe ver ligt het ervandaan", en dat is een meting:

     | | waarde |
     | --- | --- |
     | vloerspeling waarmee de tuner zelf werkt (`ampFloorSlackOhm`, 2 % van 2,6 Ω) | **0,0520 Ω** |
     | grootste verschil op het LEVENDE corpus (10 kandidaten + 3 v1-baselines) | **0,0075 Ω** (KAND_V2_5) |
     | grootste verschil over het HELE casusboek, gedateerde corpora erbij | 0,0728 Ω — `V28_KAND_2` |
     | netlists waarop de twee rasters een ANDER OORDEEL over de vloer vellen | **0** |

     Het levende corpus leest dus zeven keer dichter bij de poortwaarde dan de speling die deze app al hanteert. De ene uitschieter is eerlijk en hij staat in de test: `V28_KAND_2` heeft een minimum van 0,006 Ω — een kortsluiting met een dip zo smal dat 240 punten ernaast landen — en juist daar veroordelen béíde lezingen hem. Dat laatste is de assert die er werkelijk toe doet en hij loopt over élke bevroren netlist: **de twee rasters zijn het op geen enkele netlist oneens over de vraag of de gestelde vloer gehaald wordt.** Een zoektocht die op het ene mikt, mikt daarmee nergens op een netwerk dat de poort op het andere zou weigeren.

     Beide asserts staan naast elkaar in `frozenNetlistGates.test.ts`, met de grootste afwijking in de faalboodschap: gaat het ooit mis, dan zegt de suite met hoeveel, en het antwoord is dan een dichter veiligheidsraster of de dure bron — niet een ruimere test.

     **GEEN TERUGVAL.** Een kandidaat die een bron noemt en er de data niet bij krijgt, krijgt géén stilzwijgende terugkeer naar het evaluatieraster: de term gaat inert en de run zegt het in `zFloorSourceNote`. Terugvallen zou precies de lezing herstellen die V32 introk, in de enige plek waar niemand kijkt. `barrierSource.test.ts` toetst dat zoals het gecontroleerd moet worden — het geleverde netwerk is aantoonbaar NIET het netwerk dat `'grid'` levert, want dát is wat een terugval zou opleveren en niets anders.

     **DE BRON RAAKT OOK DE REPARATIEPAS, en dat is dezelfde reparatie één pas verder.** De barrière van de reparatiepas duwde op het evaluatieraster terwijl de ACCEPTATIE van diezelfde pas op het veiligheidsraster oordeelde (`worstZOf`) — dus op een ontwerp waarvan het minimum onder de rasterbodem ligt duwde de reparatie waar niets te duwen viel en werd zij afgerekend waar wél iets zat. V32 mat vier kandidaten met `ampFloorRepair: 'failed'`, alle vier met hun minimum onder 200 Hz. Eén bron voor één term laat die twee samenvallen. Dat is geen wijziging AAN de reparatiepas: het is dezelfde ene regel die hem bereikt.

  2. **Een poort die de hele waardetune weigert levert een VERWERPING.** De V31-vorm, één regel naar buiten. `netOptimizer.ts` onthoudt de geweigerde tune, en aan het eind — ná de reparatiepas en ná de veiligheidspoort, die hun voorrang houden — levert de run een verwerping in plaats van een netwerk. De vorm is geharmoniseerd: beide wholesale-paden vullen sinds nu één veld, `refusal { by, kinds, reason, note }`, zodat de shortlist precies één soort verwerping kent en de worker één vraag stelt in plaats van twee.

     **De tweede voorwaarde is geen decoratie**, en zij is het enige waarin deze ingreep afwijkt van "weiger en klaar": de verwerping staat alleen wanneer óók het uiteindelijk GELEVERDE netwerk door de poort geweigerd wordt. Na `cur = asIs(seedParts)` gaat de run verder, en de passen die volgen — de herzaai-challenge, de driftvangst, de doelbarrière, prune, escalatie — zijn echte zoektochten die elk vóór acceptatie langs dezelfde poort gaan. Landt een van hen ergens dat de poort accepteert, dan HEEFT deze run een toelaatbaar ontwerp gevonden, en dat "geen netwerk" noemen zou een geldig antwoord weggooien. Beide takken staan als test (`wholesaleRejection.test.ts`).

     `refusal` verschijnt alleen op een run die een v2-mechanisme wapende (de poorthook of het `rejectedTuneReport`), dus elk v1-resultaatobject is onveranderd — dezelfde bewaking die `rejectedTune` sinds V31 draagt.

  ---

  **DE METING: DRIE ARMEN OP ÉÉN VELD.** Zelfde vijftien kandidaten, zelfde seed (20260827), zelfde gestelde vloer, zelfde beschermingen. Het enige verschil is waar de barrière zijn tekort leest. De "grid"-arm is geen nieuwe run maar het BEVROREN V32-corpus, want dat is precies wat die bron opleverde.

  | | `'grid'` (V32-corpus) | `'sweep'` | `'safety'` (levend) |
  | --- | --- | --- | --- |
  | veld | 15 | 15 | 15 |
  | leverde een netwerk dat een POORT weigert | **6** | **0** | **0** |
  | leverde geen netwerk (zichtbare verwerping) | 2 | 5 | 4 |
  | bevroren | 7 | 10 | 10 |
  | haalt de vloer ALS BESTAND | 7 van 7 | 10 van 10 | 10 van 10 |
  | `ampFloorRepair: 'failed'` | **6** | **0** | **0** |
  | wandkloktijd, vijftien ketenruns | ~14 min | **4 u 23 min** | **44,6 min** |
  | per kandidaat | 45–66 s | 603–2740 s | 113–237 s |

  **De scherpste rij is `ampFloorRepair`.** In de `'grid'`-arm vuurde de reparatiepas op zes kandidaten en mislukte op alle zes — en dat zijn exact de zes waarvan het minimum onder de rasterbodem lag. De pas duwde waar niets te duwen viel (haar barrière las het evaluatieraster) en werd afgerekend waar wél iets zat (haar acceptatie leest `worstZOf`, inclusief het veiligheidsraster). In beide V33-armen hoeft zij geen enkele keer te vuren: de zoektocht landt zelf op de vloer. Dat is de reparatiepas die meelift op één regel, niet een tweede ingreep.

  **En de zes onbouwbare aanbiedingen zijn nul geworden.** De 396,7 Hz-as leverde in de `'grid'`-arm vijf ongetunede zaden van 0,01–1,38 Ω; nu levert zij getunede netwerken die de vloer halen, of een verwerping met de regel erbij (*"M-B/|Z|: 2,49 Ω falls below the stated floor of 2,60 Ω"*). Geen van beide armen biedt nog iets aan dat een poort weigert.

  ---

  **`'SWEEP'` TEGEN `'SAFETY'` — EN ZIJ ZIJN NIET BYTE-IDENTIEK.** Dat was de vraag die deze twee armen moesten beantwoorden, en het antwoord is nee: van de negen kandidaten die in beide armen een netwerk leveren, levert er **geen enkele hetzelfde netwerk**. Eén kandidaat kantelt van verwerping naar ontwerp (396,7 · 2283,5), één valt uit de shortlist doordat de spreiding anders kiest (396,7 · 1981,2, die wél geleverd wordt).

  | kandidaat (W-M · M-T) | min \|Z\| sweep → safety | RMS | SPL ± | M-T fase |
  | --- | --- | --- | --- | --- |
  | 396,7 · 1719 | 2,55 → 2,56 | 1,85 → 1,76 | 3,86 → 3,67 | 29,96 → 26,31 |
  | 396,7 · 1981,2 | 2,56 → *niet bevroren* | 1,75 → — | 3,53 → — | 26,39 → — |
  | 396,7 · 2283,5 | *verworpen* → 2,56 | — → 1,75 | — → 3,42 | — → 22,41 |
  | 466,5 · 1719 | 2,61 → 2,63 | 1,91 → 1,89 | 4,00 → 3,94 | 31,66 → 31,67 |
  | 466,5 · 1981,2 | 2,60 → 2,61 | 2,00 → 1,85 | 3,75 → 3,43 | 14,81 → 32,11 |
  | 466,5 · 2283,5 | 2,59 → 2,59 | 1,88 → 1,86 | 3,39 → 3,40 | 28,87 → 26,70 |
  | 548,5 · 1294 | 2,61 → 2,61 | 1,96 → 1,93 | 4,34 → 4,30 | 33,36 → 34,37 |
  | 548,5 · 1491,4 | 2,60 → 2,58 | **1,70 → 2,25** | 3,79 → 3,96 | **16,42 → 56,16** |
  | 548,5 · 1719 | 2,60 → 2,59 | 1,70 → 1,90 | 4,05 → 4,54 | 10,46 → 6,65 |
  | 548,5 · 1981,2 | 2,60 → 2,59 | 1,82 → 1,92 | 3,97 → 4,13 | 4,18 → 5,29 |
  | 548,5 · 2283,5 | 2,59 → 2,59 | 1,79 → 1,96 | 3,88 → 3,86 | 3,75 → 5,30 |

  **HOE GEVOELIG DE ZOEKTOCHT IS VOOR DE BARRIÈREWAARDE — dat is wat deze tabel meet, en het is meer dan verwacht.** De twee lezingen verschillen op dit corpus met ten hoogste **0,0075 Ω** (gemeten, tegen een vloerspeling van 0,0520 Ω). Dat verschil verplaatst waar de simplex uitkomt: meestal met een paar honderdsten dB en een graad of twee, op 466,5 · 1981,2 met 17° M-T-fase, en op 548,5 · 1491,4 met **40° M-T-fase en 0,55 dB RMS**. Een grootheid die zeven keer kleiner is dan wat deze app zelf "niet te onderscheiden van gehaald" noemt, beslist dus over welk ontwerp er uit de doos komt.

  Dat is geen argument tegen `'safety'` en ook geen argument vóór `'sweep'`: het is een uitspraak over de ZOEKTOCHT. De vloer als barrièreterm zit met gewicht 1200 in een landschap waarin de simplex tussen basins kiest, en beide lezingen mikken op hetzelfde punt — de een preciezer dan de ander, allebei ruim binnen de tolerantie waarop geoordeeld wordt. Wat eruit komt is per kandidaat een ander lokaal optimum en per VELD nauwelijks te onderscheiden:

  | corpus (n = 10) | min \|Z\| | RMS-vlakheid | SPL ± | M-T fase |
  | --- | --- | --- | --- | --- |
  | `'sweep'` | 2,55–2,61 (med 2,60) | 1,70–2,00 (med **1,83**) | 3,39–4,34 (med 3,87) | 3,75–33,36 (med **21,41**) |
  | `'safety'` | 2,56–2,63 (med 2,59) | 1,75–2,25 (med **1,90**) | 3,40–4,54 (med 3,90) | 5,29–56,16 (med **26,50**) |
  | *ter vergelijking:* `'grid'` (n = 7) | 2,55–2,60 (med 2,58) | 1,81–2,49 (med 1,88) | 3,37–4,50 (med 4,17) | 11,15–34,01 (med 27,78) |

  De dure arm is dus een beetje beter — 0,07 dB mediane RMS en 5° mediane M-T-fase — en kost zes keer zoveel rekentijd. **Dat is de afruil, gemeten, en de v2-route neemt `'safety'`.** Wie het andere antwoord wil, stelt `zFloorBarrierSource: 'sweep'` op de kandidaat; beide corpora staan in de repository, dus de vergelijking is na te lezen zonder ook maar iets opnieuw te draaien.

  **Wat GEEN van beide armen oplost** staat er ook: `466,5 · 1491,4` wordt in allebei door `protection` verworpen, en dat is de arbitrage die V31 openliet — de afruil tussen de versterkervloer en de tweeterbescherming is nog steeds een alles-of-niets-veto. V33 heeft die weigering alleen leesbaar gemaakt, niet opgelost.

  ---

  **WAAR DE PRIJS VANDAAN KOMT.** De barrière lost het netwerk bij élke objectief-evaluatie op, op het raster van zijn bron. Nagemeten kosten per netwerkoplossing op deze casus: **0,507 ms op 96 punten, 1,257 ms op 240, 8,886 ms op 1600.** De hele runtijd van deze tuner zit in die oplossing — een ketenrun doet er ~88 000 — dus de verhouding tussen de rasters is de verhouding tussen de runtijden, en dat is precies wat de tabel hierboven laat zien. Ter controle op één kandidaat, beide uitersten: 44,0 s tegen 669,8 s bij 88 008 tegen 86 399 evaluaties.

  `'safety'` koopt de uitgestrektheid zonder de resolutie. Dat is de hele reden dat de bron drie waarden heeft in plaats van twee, en het is ook de reden dat de dure arm bewaard is als gedateerd corpus in plaats van weggegooid: een referentiemeting die je niet meer kunt naslaan is een zin die iemand ooit heeft getypt.

  **BIJVANGST, EN ZIJ IS DEZELFDE FOUT VOOR DE DERDE KEER.** `goldenClassification.test.ts` bepaalde welke bevroren netlists een klasse moeten dragen met een met de hand bijgehouden FAMILIELIJST — `KAND_V2_*` en `V28_KAND_*`. V32 vroor een tweede gedateerd corpus in (`V30_KAND_*`) en niemand liep terug: tien klasse-B-blokken hebben een oplevering lang in het referentiebestand gestaan zonder ooit op een klasse gecontroleerd te zijn. Dat is exact het gat dat dat blok bij V28 zelf sloot, één laag verder. De lijst is daarom weg: **elke netlist die het casusboek NOEMT en die geen v1-baseline is, moet een geclassificeerd blok hebben.** Een nieuw corpus doet mee door te bestaan.

  **WAT ER IN DE CODE VERANDERDE.** Nieuw: `optimizer/barrierSource.test.ts`, `scripts/compare-corpora.ts` (de opvolger van `compare-v30-v32-corpus.ts`, met beide corpora als argument — de oude had zijn "ná"-helft hard op het levende corpus staan en maakte na de eerste regeneratie stilzwijgend een ándere tabel dan die waarvoor hij geschreven was). Gewijzigd: `impedanceFloor.ts` (`minImpedanceAt` en `ampFloorSlackOhm` — de vloerspeling had twee huizen en heeft er nu één, want sinds V33 vraagt óók een test hem op), `netOptimizer.ts` (twee opties, `systemMinImpedanceOhm`, `barrierShortOhm`, `barrierGrid`, `zFloorSourceNote`, het geharmoniseerde `refusal`-veld op alle drie de wholesale-returns, en de vastgehouden geweigerde waardetune), `metrics/electrical.ts` (`epdr` leest het minimum via de gedeelde functie), `optimizer/choices.ts` (twee sleutels geclassificeerd, 39 → 41), `optimizer/candidateDeclaration.ts` (de V33-afleiding met haar P4-tegenhanger), `optimizer/worker.ts` (de reference voedt de dure bron; één detectievraag in plaats van twee; de bronnoot in de notities), `optimizer/v2.fixture.ts` (een veiligheidsset, zodat de tweewegcasus de `'safety'`-bron kan oefenen), de generator en de recorder (de gedateerde corpora worden afgeleid in plaats van opgesomd; alleen hun REDEN staat nog met de hand geregistreerd), `frozenNetlistGates.test.ts`, `wholesaleRejection.test.ts`, `choiceKeyGuard.test.ts`, `goldenClassification.test.ts`, `casus1V2Candidates.test.ts`.

  **ONAANGERAAKT:** het gewicht `AMP_FLOOR_BARRIER_WEIGHT`, de reparatiepas, `safety` en élke veiligheidsregel, het ketenraster, de poorten zelf, `crossover3Variants`, de logica van beide ketens, en de v1-route — `toggleRegression.test.ts` is byte-identiek, `workerRouteRegression.test.ts` levert zijn opgeslagen netwerk nog steeds byte voor byte (die baseline heeft geen gestelde vloer, dus daar is de barrière uit), en `f4cRegression.test.ts` reproduceert beide vormen op twee seeds.

- V34 (**GESLOTEN** op 28-08-2026 — de probe leest waar de grootheid woont, en de grens die hem oordeelde is op de v2-route ingetrokken) — opgeworpen bij de V33-sessie, 27-08-2026.

  **De aanleiding.** V33's inventarisatie stelde de vraag die de opdracht stelde — draagt er ná V32 nog een lezer van het KETENRASTER een oordeel of een doel — en het antwoord is ja. De grootste is de bronweerstand aan de laagste weg. `sourceResistanceOhm` (`partAudit.ts:541`) krijgt het ketenraster mee, en de waarde die eruit komt voedt vier oordelen en één doel:

  | wie | bestand:regel (boom `4cb9cc6`) | wat het is |
  | --- | --- | --- |
  | `rSourceDisqualifyOhm` | `netOptimizer.ts:1171`–`1175` | harde diskwalificatie — op casus 1 gewapend op 2,0 Ω |
  | `rsSafe`, structuurzetten | `netOptimizer.ts:2881`–`2883` | een zet mag de laagste weg niet over de audittier duwen |
  | audittier | `netOptimizer.ts:3410` | 1,0 Ω, het rapportoordeel per onderdeel |
  | geleverd rapport | `netOptimizer.ts:3849` | wat de ranking en de scan-tabel tonen |
  | `dissRatio` → `fxOf` | `netOptimizer.ts:1533`, `2166` | een DOEL: `dissipationWeight · (R_source/R_e)²`, op casus 1 0,05 |

  **En de meting, want dit is geen theoretisch bezwaar.** `sourceProbeIndex` (`partAudit.ts:449`) wil de probe op f_b zetten; is er geen f_b gesteld, dan neemt hij "de impedantiepiek in het onderste kwart van het raster", met `stop = max(400, grid[grid.length/4])`. Op de casus-1-keteninvoer levert dat:

  | weg | index | frequentie | `inBand` |
  | --- | --- | --- | --- |
  | woofer | 24 | **640,2 Hz** | true |
  | mid | 0 | 200,0 Hz | false |
  | tweeter | 24 | 640,2 Hz | true |

  640,2 Hz **is** `grid[24]`, oftewel de bovenrand van het zoekvenster zelf. Het is geen resonantie: de resonantie van deze woofer ligt onder de rasterbodem van 200 Hz, precies zoals de noot bij de DC-terugval in `netOptimizer.ts` al zegt (*"the low driver's impedance peak lies below the grid, which is the normal case for a woofer measured from 200 Hz"*). De bewaking die daarvoor bestaat verwerpt alleen index 0 — een maximum óp het eerste rasterpunt — en vangt de bovenrand niet.

  Dat is exact de fout die ISSUE #14 al eens repareerde, één rand verder. Toen werd er op `grid[0] = 210 Hz` geprobed, wat op die woofer de parallelresonantie van de low-pass was; de reparatie was "een bekende f_b buiten het raster is geen reden om ergens anders te meten maar om te stoppen met meten". Wat er niet bij is gekomen is dat óók de terugval zelf een rand kan aanwijzen.

  **EN DE GRENS ZELF IS EEN PROJECTGETAL ZONDER HUIS — P6, NET BUITEN ZIJN BEREIK.** De harde diskwalificatie is `2,0 Ω` en zij staat als DEFAULT op twee plekken in v1 (`designChain.ts:429`, `threeWayChain.ts:495`, plus de doc-noot op `threeWayChain.ts:96`), en een derde keer overgeschreven in de casus-1-fixture (`casus1V2.fixture.ts:135`, "de eigen standaard van de app"). De audittier ernaast is `1,0 Ω` en staat twee keer in `netOptimizer.ts` als `?? 1.0` (`1237`, `3410`). Geen van beide is uit een meting afgeleid, geen van beide draagt een motivering, en geen van beide heeft één huis. P6 verbiedt precies dit patroon — maar zijn tekst en zijn lint (`p6Lint.test.ts`) dekken `src/lib/engine2/`, en deze getallen wonen er net buiten. Dat is een scopegrens, geen vrijbrief: `ampMinLoadOhm` is langs exact dezelfde weg opgeruimd (F0: er is geen default, de ontwerper vult hem in of niemand), en `impedanceFloor.ts` bestaat omdat dezelfde vraag op drie plekken drie drempels had. Zolang de grens 2,0 Ω is en op 640,2 Hz wordt gemeten, staan er twee onafhankelijke problemen op één regel.

  **Wat er niet aan de hand is.** De aflezing is niet betekenisloos — 640 Hz ligt in de doorlaatband van de woofer en de bronweerstand die je daar meet is een echte bronweerstand. Zij is alleen niet de grootheid waar de regel over gaat: `rSourceDisqualifyOhm` en de dissipatieterm bestaan om te voorkomen dat een serieweerstand de demping bij f_b uitgeeft, en dat is een uitspraak over de RESONANTIE van de woofer. Op 640 Hz beantwoordt hij een andere vraag met hetzelfde getal — de vorm die V21 beschrijft.

  **Drie mogelijke uitkomsten, geen ervan hier gekozen.**
  1. **De probe leest de gemeten impedantiesweep**, net als elke elektrische poort sinds V32 en net als de barrière sinds V33. Dan valt f_b binnen bereik en is de vraag beantwoordbaar. Kost: `sourceResistanceOhm` en `seenImpedance` moeten een tweede raster kunnen krijgen, en dat raakt de v1-route en dus de toggle-invariant — precies waarom V33 dit niet meenam.
  2. **De terugval wordt strenger**: een piek die op een van beide RANDEN van het zoekvenster ligt telt niet als resonantie, en dan valt de probe terug op de DC-limiet (die mag veroordelen maar nooit vrijpleiten). Klein, maar het verandert de uitkomst van élke bestaande v1-run met een woofer onder de rasterbodem.
  3. **De ontwerper stelt f_b.** Het veld bestaat (`audit.fbHz`), casus 1 vult het niet, en met een gestelde f_b buiten het raster stopt de probe uit zichzelf. Dan is dit een P4-vraag en geen engine-vraag.

  En daarnaast, los van de drie: **de twee grenzen krijgen één huis en een motivering**, zoals `ampMinLoadOhm` die heeft gekregen. Dat is een kleinere ingreep dan de drie hierboven en zij hangt er niet van af.

  **Wat het zou beslechten:** één meting die er niet is — dezelfde vijftien kandidaten met de probe op de sweep naast de huidige, met `dissRatio` en de diskwalificatiegrens erbij per kandidaat. Zolang die er niet is, is elke keuze hierboven een voorkeur. **Open.** *(Die meting is bij de vervolgsessie hieronder gedaan, en zij heeft de keuze niet zozeer beslecht als wel verlegd: uitkomst 1 en de intrekking van de grens bleken dezelfde ingreep.)*

  ---

  **V34 — VERVOLGSESSIE, 28-08-2026: DE PROBE LEEST WAAR DE GROOTHEID WOONT, EN DE GRENS DIE HEM OORDEELT IS INGETROKKEN. GESLOTEN.**

  **DE INVENTARISATIE EERST**, want zij is de reden dat dit één entry is en geen twee. Alle regelnummers zijn die van de boom VÓÓR deze sessie (`52a6ca4`).

  **1. De probe, zijn raster en zijn zoekvenster.** `sourceResistanceOhm` (`partAudit.ts:541`) krijgt een raster mee en meet de reële Thevenin-weerstand die de laagste driver ziet. Wélke frequentie dat is beslist `sourceProbeIndex` (`partAudit.ts:449`): met een gestelde boxafstemming het rasterpunt dat er het dichtst bij ligt, en zonder — casus 1 vult `audit.fbHz` niet in — **de impedantiepiek over het onderste deel van het raster**, met `stop = max(400, grid[⌊n/4⌋])`. De bewaking die daarbij hoort verwierp één rand: `inBand: best > 0`.

  Nagemeten met `scripts/measure-v34-probe.ts`, op de drie rasters die deze app werkelijk in handen heeft:

  | raster | punten | uitgestrektheid | zoekvenster | waar de probe de WOOFER vindt |
  | --- | --- | --- | --- | --- |
  | ketenraster (`CASUS1_V2_GRID`) | 96 | 200–20 000 Hz | idx 0..24 (200–**640,2** Hz) | **idx 24 = 640,2 Hz — de BOVENRAND** |
  | veiligheidsraster (`safety.freqs`) | 240 | 20,5–20 000 Hz | idx 0..103 (20,5–398,2 Hz) | idx 32 = 51,5 Hz, \|Z\| 19,32 Ω |
  | poortraster (`impedanceReferenceFrom`) | 1600 | 10,1–20 317 Hz | idx 0..773 (10,1–398,7 Hz) | idx 346 = 52,3 Hz, \|Z\| 19,81 Ω |

  De 640,2 Hz van V33 reproduceert exact, en `640,2 = grid[24] = stop`: het is de bovenrand van het zoekvenster zelf. Dat het geen resonantie is, is nu ook gemeten in plaats van beredeneerd — **dit wooferpaar is bassreflex**, en zijn impedantiekromme onder 200 Hz draagt twee pieken met een dal ertussen: 11,72 Ω @ 17,0 Hz, **3,93 Ω @ ~31 Hz**, 18,90 Ω @ 50,9 Hz. Die 31 Hz is precies de poortafstemming die de ISSUE #14-noot noemt. Alle drie liggen onder de rasterbodem van 200 Hz. Wat op 640 Hz gelezen werd is de impedantie die uit de doorlaatband van de woofer omhoog loopt.

  **2. Wat er aan die aflezing hangt, en of het rapportage is of een oordeel.** Zes lezers, en vijf ervan oordelen:

  | lezer | wat het is | oordeel of rapportage |
  | --- | --- | --- |
  | `rSourceDisqualifyOhm` (`netOptimizer.ts`, `constraintViolation`) | harde diskwalificatie, en op de v2-route gewapend op 2,0 Ω | **oordeel** — zet `infeasible` op het geleverde netwerk |
  | `rsSafe`, structuurzetten (`netOptimizer.ts:3157`) | een zet mag de laagste weg niet over de audittier duwen | **oordeel** — het weigert zetten |
  | audittier `thr.rSourceOhm` (`partAudit.ts:691`) | `crossesRs` in de onderdelenaudit | **oordeel** — een onderdeel dat de tier kruist heet `earned` en wordt dus NIET verwijderd |
  | audittier in de snap (`netOptimizer.ts:3688`) | `branchDcrBudgetOhms(re, tier)` begrenst de DCR per tak | **oordeel** — het snoeit de catalogusruimte |
  | `net.after.rSourceOhm` (`netOptimizer.ts:4127`) → keten | de ranking diskwalificeert erop (`threeWayChain.ts:495`) | **oordeel** |
  | `dissRatio` → `fxOf` (`netOptimizer.ts:1791`, `2424`) | `dissipationWeight · (R_source/R_e)²` | doel, gewicht 0,05 |

  De opdracht vroeg dit expliciet voor de audittier, en het antwoord is dus: **hij draagt een oordeel, op twee plekken.** Dat betekent dat dezelfde regel geldt als voor `rSourceDisqualifyOhm`.

  **3. De twee literalen, en waar de v1-route staat.** 2,0 Ω stond op vier plekken (`designChain.ts:429` als parameterdefault, `threeWayChain.ts:495` als `?? 2.0`, de doc-noot op `threeWayChain.ts:96`, en `casus1V2.fixture.ts:135`); 1,0 Ω op vier (`partAudit.ts:88`, `netOptimizer.ts:1495` en `:3688`, `casus1V2.fixture.ts:136`), plus de twee UI-defaults in `App.tsx`. Geen van beide droeg een afleiding. **Op de v1-route mag daar niets van bewegen** — dat is de toggle-invariant, en zij is geen richtlijn — dus alles wat deze sessie doet is opt-in.

  **WAAROM DIT ÉÉN ENTRY IS EN GEEN TWEE, EN DAT IS DE VONDST VAN DE SESSIE.** De probe repareren en de grens laten staan is slechter dan geen van beide doen. Gemeten, per bevroren netlist, met de strikte randregel:

  | netlist | ketenraster | veiligheidsraster | poortraster | DC-limiet |
  | --- | --- | --- | --- | --- |
  | HUIDIG | 3,756 | **3,978** | 3,985 | 3,756 |
  | KAND_A | 4,423 | **4,585** | 4,590 | 4,423 |
  | KAND_B | 2,352 | **2,552** | 2,558 | 2,352 |

  Met de OUDE randregel leest het ketenraster diezelfde drie op **0,503 / 0,465 / 0,678 Ω** — het cijfer waarop de app tot vandaag diskwalificeerde. De gestelde grens is 2,0 Ω. Dus: op 640 Hz haalt iedereen hem ruim, op de echte piek haalt **geen van de drie v1-baselines** hem, HUIDIG — het eigen, beste, handgebouwde filter van de ontwerper — voorop. Een reparatie die alleen de probe verzet, zou het referentieontwerp van deze casus hebben weggegooid op een grens die in `manifest_en_geometrie.gestelde_eisen` niet voorkomt.

  **En de aflezing op het ketenraster is met de strikte regel exact de DC-limiet**, op elke netlist zonder uitzondering: waar de probe geweigerd wordt, is er niets gemeten. Dat is de scherpste formulering van de vondst — het getal waarop gediskwalificeerd werd was, met de strikte regel toegepast, nooit een meting van de grootheid waar de regel over gaat.

  **WAT ER IS GEBOUWD.**

  **(1) De randregel is een echte bewaking geworden, en zij is een parameter.** `ProbeEdgeRule` in `partAudit.ts`: `'first'` verwerpt alleen index 0 — de historische regel, dus de default, dus v1 byte-onaangeraakt — en `'both'` verwerpt elke rand van het zoekvenster. De regel geldt alléén voor de TERUGVAL: een gestelde boxafstemming die op een rand valt is het antwoord op een vraag die de ontwerper stelde, niet een zoekartefact, en hem weigeren zou de remedie van ISSUE #14 zelf breken. Een geweigerde landing valt terug op de serie-pad-DC-limiet, die mag veroordelen maar nooit vrijpleiten — dezelfde regel die er sinds #14 staat, nu ook aan de bovenkant.

  **(2) Het raster is een KEUZE-sleutel, in de V33-vorm.** `rSourceProbeSource`: `'grid'` (default, evaluatieraster, historische randregel) en `'safety'` (het volle-band-veiligheidsraster van de tuner, strikte randregel). Eén beslissing in de tuner (`probeOn`) wapent beide; in de code zijn het twee parameters, zodat een falende test zegt wélke van de twee bewoog. Alle vijf de lezers gaan er doorheen, óók de onderdelenaudit — die krijgt een `probe`-context naast zijn analyseraster, want zijn ΔSPL en Δfase zijn responsvragen en horen op het analyseraster, en de bronweerstand bij de boxafstemming is een impedantievraag over een frequentie dat raster meestal niet bevat.

  **TWEE WAARDEN EN NIET DRIE, EN DAT IS HET VERSCHIL MET V33.** V33 had een derde nodig (`'sweep'`) omdat de barrière moest mikken op het getal dat een POORT handhaaft, en alleen de poortreferentie ís dat getal per constructie. Niets poortent de bronweerstand, dus er is niets om identiek aan te zijn. Het verschil tussen veiligheidsraster en poortraster is dan een meting in plaats van een argument: beide vinden de wooferpiek binnen één rasterstap van elkaar (51,5 tegen 52,3 Hz), het grootste verschil over élke bevroren netlist in het casusboek is **0,0129 Ω** (bij `V28_KAND_2`, een netwerk met 0,001 Ω belasting), en op géén enkele netlist vellen zij een ander oordeel over een van beide tiers. Een derde waarde die niemand kan betalen om dat te kopen, zou decoratie zijn.

  **GEEN TERUGVAL, NADRUKKELIJK.** Een genoemde bron zonder data probet NIETS: `rSourceOhm` is null, de dissipatieterm valt weg, de diskwalificatie kan niet vuren, en `rSourceProbeNote` zegt het. Dat is dezelfde regel als V32 (een poort zonder sweep oordeelt niet) en V33 (een barrière zonder bron stuurt niet), toegepast op een meting. De test die dat vasthoudt vergelijkt niet de netwerken maar het GELEVERDE getal, want een stille terugval levert precies het rastergetal en niets anders.

  **(3) De twee grenzen zijn op de v2-route INGETROKKEN, en hebben op de v1-route één huis gekregen.** Casus 1 stelt in `gestelde_eisen` geen bronweerstandseis, dus de kandidaat draagt er geen: `rSourceDisqualifyOhm` is ABSENT met de P4-reden en de audittier staat op `null` — de audit DRAAIT (hij is een bescherming, V26 rij 33), zijn bronweerstandstier oordeelt niets.

  **En daar zat een gat dat F4d niet had gedicht.** `rSourceDisqualifyOhm` is sinds F4c een keuze-sleutel, wat betekent dat hij op de v2-route alleen vanuit de kandidaat mag wapenen. Dat was niet zo: de sleutel bereikt de tuner via `collect.choices` alléén wanneer de kandidaat hem STELT, en de keten resolvet hem daarnáást, BUITEN de tuner om (`threeWayChain.ts`'s eigen `?? 2.0`), waar `choices.ts` niet bij komt. "De ontwerper stelde niets" en "de ontwerper stelde 2,0 Ω" kwamen dus langs verschillende wegen op dezelfde plek uit. `withDeclaredSourceLimit` in de worker sluit dat: is er een verklaring, dan is die de autoriteit, en een niet-gestelde sleutel wordt een expliciete `null` op de wire. Geen verklaring ⇒ de identiteit, wat élke v1-aanroeper byte-identiek houdt. `null` en `undefined` zijn met opzet verschillende toestanden — de eerste is "de ontwerper stelde er geen", de tweede is "er is niets gezegd", en de keten geeft alleen op de tweede haar historische default.

  Voor de v1-route zelf: `DEFAULT_R_SOURCE_TIER_OHM`, `DEFAULT_R_SOURCE_DISQUALIFY_OHM` en `SOURCE_PROBE_WINDOW_TOP_HZ` staan sinds V34 in `partAudit.ts`, naast de probe waarvan zij de aflezing oordelen, elk met een motivering en met de kanttekening dat geen van beide is afgeleid. Langs dezelfde weg als `ampMinLoadOhm` bij F0 en `meetsAmpFloor` bij de vloersessie. P6 dekt `src/lib/engine2/` en deze twee wonen er net buiten — een scopegrens is geen vrijbrief.

  **DE GREP-BARE CLAIM DIE DE OPDRACHT VROEG.** Ná V34 neemt op de v2-route **geen enkele poort, geen enkele A5d.6-inversie, geen enkele doelfunctieterm en geen enkele probe een ELEKTRISCH oordeel op het ketenraster.** De poorten lezen sinds V32 de gemeten sweep, de barrière sinds V33 het veiligheidsraster met dezelfde uitgestrektheid, de doorlaatband-impedantiemediaan sinds V32 de sweep, en de bronweerstandsprobe sinds V34 het veiligheidsraster. Wat wél op het ketenraster blijft en waarom:

  | wat | waarom dat correct is |
  | --- | --- |
  | rimpel, gemiddelde afwijking, fase, kruispuntdip, tweeterbescherming, breakup-lek | RESPONSgrootheden, en een respons hééft een meetpoort: buiten het verre-veldvenster is er geen meting om over te oordelen. Dat is precies de asymmetrie die `impedanceReference.ts` bovenaan uitspreekt. Ze worden bovendien op het veiligheidsraster hérmeten door de volle-band-veiligheidspoort. |
  | `m.zShortOhm` in `safe()` / `safeEsc()` (vijf vergelijkingen; regelnummers in de boom ná deze sessie) | RELATIEF, nooit absoluut: `m.zShortOhm <= ref.zShortOhm + 0,1`, twee netwerken op hetzelfde raster. Het is een "word niet slechter"-bewaking bij een structuurzet, geen oordeel over een gestelde vloer. Élk absoluut vloeroordeel loopt via `worstZOf` / `zMinOf` / `barrierShortOhm`, en die drie nemen het veiligheidsraster mee. |
  | `metricsOn`'s eigen `zMinOhm` / `zShortOhm` als velden | grondstof, geen oordeel. Er is geen consument die ze absoluut leest zonder door een van de drie functies hierboven te gaan — nagemeten met een grep over alle veertien voorkomens. |

  Wat er dus NIET onder valt, en met opzet: de v1-route. Daar leest alles nog wat het altijd las, en dat is de toggle-invariant.

  **DE VÓÓR/NÁ-METING.** Het veld is opnieuw opgewekt met dezelfde seed (20260827), hetzelfde raster en dezelfde vijftien kandidaten; het enige verschil is deze sessie. Vijftien ketenruns, 115–224 s per stuk, **41 minuten** totaal — praktisch dezelfde prijs als V33's `'safety'`-arm, want de probe scant een raster en lost niets extra's op. Het corpus dat het vervangt staat als `V33_KAND_*` in de repository (`compare-corpora.ts v33 live` reproduceert de tabel).

  | kandidaat (W-M · M-T) | min \|Z\| vóór | min \|Z\| ná | @ Hz ná | vloer vóór → ná | SPL ± vóór → ná | RMS vóór → ná | W-M fase vóór → ná | M-T fase vóór → ná |
  |---|---|---|---|---|---|---|---|---|
  | 396.7 · 1294 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** |
  | 396.7 · 1491.4 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** |
  | 396.7 · 1719 | 2.56 | 2.56 | 80.97 | **ja** → **ja** | 3.67 → 3.67 | 1.76 → 1.76 | 16.74 → 16.74 | 26.31 → 26.31 |
  | 396.7 · 1981.2 | — | 2.57 | 1119.92 | — → **ja** | — → 3.57 | — → 1.81 | — → 17.07 | — → 29.06 |
  | 396.7 · 2283.5 | 2.56 | 2.56 | 83.31 | **ja** → **ja** | 3.42 → 3.42 | 1.75 → 1.75 | 20.51 → 20.51 | 22.41 → 22.41 |
  | 466.5 · 1294 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** |
  | 466.5 · 1491.4 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** |
  | 466.5 · 1719 | 2.63 | 2.60 | 1067.87 | **ja** → **ja** | 3.94 → 3.72 | 1.89 → 1.80 | 15.16 → 16.74 | 31.67 → 33.30 |
  | 466.5 · 1981.2 | 2.61 | 2.61 | 1163.38 | **ja** → **ja** | 3.43 → 3.36 | 1.85 → 1.85 | 16.06 → 13.34 | 32.11 → 32.09 |
  | 466.5 · 2283.5 | 2.59 | 2.58 | 1208.53 | **ja** → **ja** | 3.40 → 3.35 | 1.86 → 1.90 | 12.60 → 15.15 | 26.70 → 25.53 |
  | 548.5 · 1294 | 2.61 | 2.59 | 966.31 | **ja** → **ja** | 4.30 → 4.39 | 1.93 → 2.08 | 14.47 → 16.91 | 34.37 → 30.75 |
  | 548.5 · 1491.4 | 2.58 | **verworpen** | — | **ja** → — | 3.96 → **verworpen** | 2.25 → **verworpen** | 19.93 → **verworpen** | 56.16 → **verworpen** |
  | 548.5 · 1719 | 2.59 | 2.59 | 227.41 | **ja** → **ja** | 4.54 → 3.98 | 1.90 → 1.83 | 36.40 → 31.78 | 6.65 → 10.28 |
  | 548.5 · 1981.2 | 2.59 | 2.58 | 132.19 | **ja** → **ja** | 4.13 → 3.85 | 1.92 → 1.69 | 45.41 → 38.00 | 5.29 → 10.85 |
  | 548.5 · 2283.5 | 2.59 | 2.58 | 1072.97 | **ja** → **ja** | 3.86 → 3.86 | 1.96 → 1.88 | 45.94 → 48.22 | 5.30 → 4.68 |

  **Bevroren: 10 vóór → 10 ná; alle tien halen de vloer als bestand, vóór én ná.** Eén kandidaat valt uit de shortlist (`548,5 · 1491,4`) en één komt erin (`396,7 · 1981,2`). Vijf van de vijftien leveren geen netwerk tegen vier bij V33.

  **EN DE VERWACHTING WAS FOUT, PRECIES ZOALS V33 LEERT.** De opdracht schreef "verwacht klein of geen verschil — de probe was rapportage plus diskwalificatie, geen doel". Zeven van de negen overgenomen rijen bewegen, en drie ervan ruim buiten afrondingsruis: `548,5 · 1981,2` gaat van ±4,13 naar ±3,85 dB met RMS 1,92 → 1,69 dB en W-M-fase 45,4° → 38,0°; `548,5 · 1719` van ±4,54 naar ±3,98 dB; `466,5 · 1719` van ±3,94 naar ±3,72 dB. En `548,5 · 1491,4` levert nu **helemaal geen netwerk**: `M-B/\|Z\|` weigert zijn hele waardetune op 2,45 Ω tegen de gestelde 2,60 Ω, waar hij vóór deze sessie een netwerk van 2,58 Ω afleverde.

  **De reden dat er iets beweegt is niet de probe maar wat er aan de probe hing.** Op casus 1 doet V34 vier dingen tegelijk, en drie ervan zijn intrekkingen:

  1. ~~`dissRatio` is niet langer `null`. Op het ketenraster werd de probe geweigerd (index 0 voor de mid, de bovenrand voor de woofer) en viel de dissipatieterm dus **volledig weg**; op het veiligheidsraster meet hij wél, dus de term doet mee. Klein — het gewicht is 0,05 en de ratio ~0,04 — maar niet nul, en de doelfunctie is niet convex.~~ **ERRATUM (V36, nagemeten 28-08-2026; AANGEVULD BIJ V37, 28-08-2026).** De weigering die hier beschreven wordt is de STRIKTE randregel op het ketenraster, een combinatie die de v2-route nooit gedraaid heeft: vóór V34 stond zij op de historische regel, en de tabel drie alinea's hierboven zegt het zelf — `woofer | 24 | 640,2 Hz | inBand true`. De term viel dus **niet volledig weg**; hij mat op 640,2 Hz, met een ratio van 0,36 tot 0,76 in plaats van ~0,04. Wat V34 met deze term deed is hem **veertig keer kleiner** maken — precies 40,1× — en de reden is dat de NOEMER meeverhuisde: `re` is `Re(Z)` BIJ de probe, dus op de impedantiepiek 19,31 Ω in plaats van 3,46 Ω, tegen een gemeten R_e van 3,05 Ω. De teller werd bij V34 juister (de bronweerstand bij een echte resonantie in plaats van bij een venstergrens) en de noemer precies even veel onjuister. **V37 heeft die noemer op de v2-route gerepareerd** — de term deelt sinds dan door de opgeloste R_e, hetzelfde getal dat M-E publiceert en de Q_es-inversie gebruikt — en dáármee is punt 1 pas afgelopen. Zie V36 (de meting) en V37 (de reparatie en de vóór/ná over het hele veld).
  2. `rsSafe`, de structuurzet-bewaking, is UIT: hij leest `rSourceLimit`, en die is nu `null` ⇒ 0. Structuurzetten die vroeger geweigerd werden omdat zij de laagste weg over de 1,0 Ω-tier duwden, worden nu overwogen.
  3. `crossesRs` in de onderdelenaudit is uit, dus een onderdeel wordt niet meer `earned` door een tier die niemand stelde — het kan nu als `inert` verwijderd worden.
  4. De harde diskwalificatie op 2,0 Ω is uit.

  **Alle vier volgen uit P4 en niet uit een smaakoordeel**, en dat is het verschil met een gewichtswijziging: er is niets bijgesteld, er is een grens weggehaald die er niet hoorde te staan. Wat er NIET is veranderd: de fxOf-term zelf, `AMP_FLOOR_BARRIER_WEIGHT`, `dissipationWeight` (0,05, ongewijzigd), het ketenraster, de barrière, `safety`, de poorten, en de v1-route.

  **WAT ER OPEN BLIJFT, EN HET IS SCHERPER GEWORDEN.** V34's derde mogelijke uitkomst — *de ontwerper stelt f_b* — is niet genomen en is nu beter te beargumenteren dan bij het opwerpen. De terugval neemt de PIEK, en dit wooferpaar is bassreflex: zijn twee pieken liggen op 17 en 51 Hz met het dal — de werkelijke poortafstemming, ~31 Hz — ertussen. De probe landt dus sinds V34 op 51,5 Hz, wat een echte resonantie is en dus veel dichter bij de bedoelde grootheid dan 640 Hz, maar het is **niet f_b**. Wat `rSourceDisqualifyOhm` en de dissipatieterm willen weten is de demping BIJ de afstemming. Zolang `audit.fbHz` leeg blijft is de aflezing "de bronweerstand bij de bovenste impedantiepiek van de laagste weg", en dat hoort zo te heten. Dat is een P4-vraag (het veld bestaat) en geen enginevraag, en zij staat als **V35** open.

  Tweede open punt, kleiner: `sourceProbeIndex` neemt de terugval-piek en niet het lokale MINIMUM tussen twee pieken. Voor een gesloten kast is piek = f_c en klopt het; voor een bassreflexkast is f_b het dal. Een terugval die dat onderscheid maakt is afleidbaar uit de kromme zelf (twee pieken met een dal ertussen ⇒ bassreflex ⇒ neem het dal), en zij is deze sessie NIET gebouwd: hij verandert de uitkomst van élke bestaande run met een bassreflexwoofer en verdient dezelfde behandeling als V30, V32, V33 en V34 — een eigen sessie met een vóór/ná-meting. Ook onder V35.

  **WAT ER IN DE CODE VERANDERDE.** Nieuw: `optimizer/probeSource.test.ts`, `scripts/measure-v34-probe.ts` (de meting waarop deze entry rust — drie rasters, waar de probe landt, en de bronweerstand van élke bevroren netlist op alle drie), `scripts/freeze-live-corpus.ts` (het bevriezen van een corpus is vier keer met de hand gedaan en het zijn vijf bewerkingen die allemaal moeten landen). Gewijzigd: `partAudit.ts` (`ProbeEdgeRule`, de drie benoemde constanten, `AuditContext.probe`, `AuditThresholds.rSourceOhm` nullable, `crossesRs` en `rSourceWarn` null-bewust, `rSourceAtGridEdge` op de nieuwe regel), `netOptimizer.ts` (`rSourceProbeSource`, `probeOn`, `rSourceProbeNote`, `rSourceOf`/`rsSafe`/`metricsOn`/`runAudit` door één lezer, `rSourceLimit` met drie toestanden), `designChain.ts` en `threeWayChain.ts` (de gedeelde constanten, `null` = geen grens), `minimize.ts` en `App.tsx` (de constanten in plaats van hun eigen kopie), `optimizer/choices.ts` (41 → 42), `optimizer/candidateDeclaration.ts` (de V34-afleiding met haar P4-tegenhanger), `optimizer/worker.ts` (`withDeclaredSourceLimit`, de probenoot in de notities), `casus1V2.fixture.ts` (de twee defaults ingetrokken, de bron gesteld), de generator (`probe_raster`, `bronweerstandsgrens`, `audittier_ohm` met hun redenen), de recorder en `compare-corpora.ts` (het V33-corpus geregistreerd), `frozenNetlistGates.test.ts`, `choiceKeyGuard.test.ts`, `casus1V2Candidates.test.ts`.

  **ONAANGERAAKT:** de fxOf-term en élk gewicht, het ketenraster, de amp-vloerbarrière, `safety` en elke veiligheidsregel, de poorten zelf, `crossover3Variants`, de logica van beide ketens, en de v1-route — `toggleRegression.test.ts` is byte-identiek, `workerRouteRegression.test.ts` levert zijn opgeslagen netwerk nog steeds byte voor byte, en `f4cRegression.test.ts` reproduceert beide vormen op twee seeds.

- V36 (**GESLOTEN** op 28-08-2026 — de term leest de gestelde probe, hij is niet ingetrokken en niet dood; hij is te klein om iets te beslissen) — opgeworpen als vervolgvraag bij de V34-sessie, 28-08-2026.

  **De vraag, en het antwoord was geen van de twee die verwacht werden.** De opdracht stelde twee gedaanten: (a) de dissipatieterm leest de opgeloste probe maar is per P4 INGETROKKEN — dan botst dat met A3j, want een grijze sleutel wordt expliciet overgenomen en nooit stil op nul gezet; (b) hij leest nog de ketenraster-probe die sinds V34's strikte randregel niets meer teruggeeft — dan is dit V33 in een vierde gedaante, doel en oordeel op twee rasters. **Gemeten: geen van beide.** De term leeft, hij leest hetzelfde raster als élke andere lezer van diezelfde probe, en de reparatie die de opdracht klaarlegde was niet nodig. Wat er wél uit de meting kwam is een ander soort bevinding, en zij is scherper dan beide gedaanten.

  **WAAR HIJ LEEST.** `netOptimizer.ts:2002` — `if (dissW > 0) dissRatio = rSourceOhm / re;` — binnen het `probeOn`-blok van `metricsOn` (`1969`–`1990`). `probeOn` (`1222`) is sinds V34 de ENE plek die beslist waar de bronweerstandsprobe leest, en hij heeft vijf lezers: de harde diskwalificatie, de structuurzet-bewaking, de audittier, het geleverde rapport, en deze term. Op de v2-route staat `rSourceProbeSource: 'safety'`, dus alle vijf lezen het veiligheidsraster. Er is geen tweede implementatie en geen terugval: een genoemde bron zonder data probet niets, en dan is er geen verhouding — `dissipationTerm.test.ts` assert dat als de vijfde claim.

  **WAT DE TERM BIJDRAAGT, GEMETEN OP HET LEVENDE CORPUS.** `npx vite-node scripts/measure-v36-dissipation.ts`, seconden, geen ketenrun. De "vóór"-arm is het ketenraster met de historische randregel — precies wat de v2-route tot V34 deed; de "ná"-arm is het veiligheidsraster met de strikte regel, wat zij nu doet.

  | netlist | vóór: Hz / R_s / noemer / term | ná: Hz / R_s / noemer / term | fx (2 termen) | aandeel ná |
  | --- | --- | --- | --- | --- |
  | HUIDIG | 640,2 / 0,503 / 3,46 / 1,06e-3 | 51,5 / 3,978 / 19,31 / 2,12e-3 | 2,88 | 0,074 % |
  | KAND_A | 640,2 / 0,465 / 3,46 / 9,04e-4 | 51,5 / 4,585 / 19,31 / 2,82e-3 | 0,82 | 0,344 % |
  | KAND_B | 640,2 / 0,678 / 3,46 / 1,92e-3 | 51,5 / 2,552 / 19,31 / 8,73e-4 | 0,55 | 0,159 % |
  | KAND_V2_1 | 640,2 / 1,577 / 3,46 / 1,04e-2 | 51,5 / 1,093 / 19,31 / 1,60e-4 | 9,27 | 0,0017 % |
  | KAND_V2_6 | 640,2 / 1,903 / 3,46 / 1,51e-2 | 51,5 / 1,445 / 19,31 / 2,80e-4 | 7,85 | 0,0036 % |
  | KAND_V2_9 | 640,2 / 2,625 / 3,46 / 2,88e-2 | 51,5 / 2,573 / 19,31 / 8,88e-4 | 6,49 | 0,014 % |

  **Het grootste aandeel van de dissipatieterm in de objectiefwaarde is 0,34 % ná en 0,44 % vóór, tegen een uitdagingsdrempel van 1 %.** De tuner beslist met procentuele poorten — een uitdaging wordt aangenomen bij 1 % verbetering, een tak gesnoeid bij 10 % — dus deze term kan geen van die beslissingen omdraaien, en dat gold vóór V34 net zo goed. `fx` in de tabel is de som van de twee dominante termen van `fxOf` (`2(1−p)·rms² + 2p·(φ/15)²`, met p = 0,50 uit `phasePriority`), herrekend uit het geleverde rapport; élke term die eraan ontbreekt maakt de noemer alleen groter, dus wat er staat is de **gunstigste** lezing voor de dissipatieterm.

  **ERRATUM OP DE V34-ENTRY, en de V34-entry weerlegt zichzelf.** Punt 1 van "V34 doet vier dingen tegelijk" zegt: *"`dissRatio` is niet langer `null`. Op het ketenraster werd de probe geweigerd … en viel de dissipatieterm dus volledig weg."* Dat klopt niet. De weigering die daar beschreven wordt is de STRIKTE randregel op het ketenraster — een combinatie die op de v2-route nooit gedraaid heeft. Vóór V34 stond die route op de historische regel, en V34's eigen tabel drie alinea's eerder zegt het al: `woofer | 24 | 640,2 Hz | inBand true`. De term viel dus niet weg; hij mat op 640,2 Hz, met de waarden in de tabel hierboven. Ook de ratio "~0,04" hoort bij het veiligheidsraster en niet bij de toestand ervóór: op het ketenraster stond hij op 0,36 tot 0,76. Wat V34 met deze term deed is hem **veertig keer kleiner maken**, niet hem aanzetten.

  **WAAROM VEERTIG KEER KLEINER, EN DAT IS DE BEVINDING.** De term deelt door `re = Math.max(0.5, pZl[k].re)` — de reële impedantie van de laagste weg BIJ de probe. Vóór V34 zat die probe op 640,2 Hz, waar de woofer 3,46 Ω leest, dicht bij zijn gemeten DC-weerstand van 3,05 Ω. Sinds V34 zit hij op de impedantiePIEK, en daar is de noemer 19,31 Ω — **een factor 6,33 boven R_e, en dat kwadrateert tot 40,1**. De teller is intussen juister geworden (de bronweerstand bij een echte resonantie in plaats van bij een venstergrens); de noemer is precies even veel onjuister geworden.

  Dat de noemer R_e HOORT te zijn is geen smaakoordeel maar de reden dat de term bestaat. A3j rij 23: *"stuurt weg van serieweerstand vóór de laagste tak. De term bestaat omdat de tuner zonder niveau-anker een serie-R als goedkoopste niveauregeling gebruikt (19-08: R_s 7,15 Ω, Q_es ×3,24 won de ranking)."* De schade heet Q_es-vermenigvuldiging, en die is `1 + R_source/R_e` met R_e de DC-weerstand. De controle staat in de meting: de kolom `R_s/R_e` reproduceert **exact** de `Qes_mult`-referenties van het casusboek (HUIDIG 2,30 tegen 2,31; KAND_A 2,50; KAND_B 1,84; KAND_V2_9 1,84), terwijl de kolom die de term gebruikt daar een factor 6,33 onder zit. Met R_e als noemer zou de term op HUIDIG 8,5e-2 waard zijn tegen een fx van 2,88 — 3 %, boven de uitdagingsdrempel, en dus een term die werkelijk stuurt.

  **DIT IS DEZE SESSIE NIET GEREPAREERD**, en dat is dezelfde beslissing die V33 over V34 nam en V34 over V35: de reparatie verandert de uitkomst van élke v2-run, dus zij verdient een eigen sessie met een vóór/ná-meting over het hele veld. Zij staat als **V37** open. Wat deze sessie wél doet is het getal vastleggen: `manifest_en_geometrie.v36_dissipatie.noemer_is_R_e` staat op `false` met de reden erbij, en `frozenNetlistGates.test.ts` assert dat de noemer meetbaar boven R_e ligt — een reparatie breekt daar zichtbaar op in plaats van stil door te schuiven.

  **A3j IS NIET GESCHONDEN EN HOEFT NIET GEAMENDEERD.** Gedaante (a) zou dat wel hebben betekend. `dissipationWeight` is een GRIJZE sleutel, hij staat op 0,05 (de app-standaard, overgenomen uit v1), en hij bereikt de tuner EXPLICIET via de kandidaatverklaring — `casus1V2.fixture.ts:130`, `choices.ts:GREY_KEYS`, `choiceKeyGuard.test.ts`. Er is niets stil op nul gezet en er is dus ook geen amendement nodig. Het gewicht is deze sessie ook niet bijgesteld, en dat is een besluit: een gewicht ophogen om een verkeerd gemeten grootheid te compenseren is de fout twee keer maken. Eerst de noemer (V37), dan pas de vraag of het gewicht klopt.

  **WAT DISSIPATIE VANDAAG NOG BEWAAKT OP DE v2-ROUTE — de inventarisatie die de opdracht vroeg.**

  | mechanisme | toestand op casus 1 | waarom |
  | --- | --- | --- |
  | M-A, poort op de dissipatiefractie | **ongewapend** | casus 1 stelt geen `maxDissipationFraction`; leeg veld = geen oordeel (P4) |
  | `rSourceDisqualifyOhm`, harde diskwalificatie | **ingetrokken** | V34: niemand stelde 2,0 Ω |
  | audittier `rSourceOhm` | **`null`** | V34: niemand stelde 1,0 Ω; de audit draait, zijn tier oordeelt niets |
  | `rsSafe`, structuurzet-bewaking | **uit** | leest dezelfde tier |
  | Q_es-budget (`qesMultiplierMax`) | **ongewapend** | `v2_budgetten_gewapend` is leeg |
  | `dissRatio` in `fxOf` | **aan, ≤ 0,34 % van fx** | leeft, stuurt niets — deze entry |
  | rapportage (M-A-waarde in de poortcel, dissipatiekolom) | **aan** | een waarde zonder oordeel, precies wat P4 voorschrijft |

  **De vraag die daarachter zat is dus terecht.** Sinds V30 mág de tuner serie-R inzetten om de vloer te halen, en wat hem tegenhoudt om de vloer met weerstand te kopen is vandaag: niets dat bijt. Het veld laat allebei de uitkomsten zien en dat is het bewijsmateriaal: `KAND_V2_2/3/4` halen de vloer met **0,9 %** dissipatie en Q_es ×1,00, `KAND_V2_9` met **34,7 %** en Q_es ×1,84 — 28,7 W in één weerstand bij 100 W. De zoektocht onderscheidt die twee niet; de shortlist doet dat sinds deze oplevering wél, als kolom.

  **WAT ER GEBOUWD IS.**

  1. **De shortlist toont de watt naast de fractie.** De FRACTIE stond er al sinds F3 (de M-A-poortwaarde, inactief, met haar waarde). De WATT kon er niet staan: een fractie is per constructie schaalvrij (A4 zegt dat met zoveel woorden) en een watt heeft het gestelde versterkervermogen nodig, dat de v2-run niet meekreeg. Dus reisde `V2RunSettings.amplifierPowerW` mee — uitsluitend rapportage, geen vingerafdruk-ingrediënt — en draagt `ShortlistRow.dissipation` nu de fractie, de grootste discrete weerstand en zijn watt. **Kolom, geen criterium:** `shortlist.test.ts` assert dat een veld waarin één kandidaat 95 % verstookt een BYTE-IDENTIEKE lijst oplevert, in dezelfde volgorde, met dezelfde stempel. Parasieten tellen niet mee, om dezelfde reden als in `totalFraction`: de DCR van een spoel is geen onderdeel waar iemand een wattage voor kiest, en hem de kolom laten winnen zou een bouwer naar een niet-bestaand onderdeel wijzen.
  2. **Het corpus draagt de waarde.** `kandidaten.KAND_V2_*.grootste_R_W_bij_100W` — het veld dat de drie v1-kandidaten sinds F1 dragen en het v2-corpus niet, waardoor een ontwerp met 23 % dissipatie in het casusboek stond zonder dat ergens te lezen was dat er 17,9 W in één weerstand zit. Elf metrieken per kandidaat in plaats van tien. Plus `manifest_en_geometrie.v36_dissipatie`: per netlist de fractie, de grootste weerstand met zijn watt, `Qes_mult`, en beide armen van de doelfunctieterm — afgeleid door de recorder, nooit getypt, en door `frozenNetlistGates.test.ts` tegen de metriek zelf gehouden.
  3. **De vóór/ná-tabel heeft twee kolommen erbij.** `compare-corpora.ts` drukt dissipatie % en grootste R (W) af per kandidaat, plus het corpusgemiddelde.

  **GEEN REGENERATIE, EN DAT IS DE HELE WINST VAN EERST METEN.** De opdracht schreef regeneratie voor als de term "weer zou gaan leven". Hij leefde al; er is geen regel in de zoektocht veranderd, dus het veld is bit voor bit hetzelfde en 41 minuten ketenruns zijn niet gedraaid. De dissipatie van het BESTAANDE corpus is in plaats daarvan gemeten en vastgelegd. Wat `compare-corpora.ts v33 live` er nu bij afdrukt is de V34-tabel met de dissipatiekolom: gemiddeld **22,1 % → 19,7 %**, grootste enkele weerstand **15,1 W → 14,2 W** bij 100 W, met twee rijen die ver bewegen (`466,5 · 2283,5` 22,97 % → 34,66 % en 16,4 → 28,7 W; `466,5 · 1719` 39,03 % → 22,89 %). Dat is geen effect van de term — die werd op deze kandidaten juist veertig keer kleiner — maar van wat er bij V34 aan de probe hing, en het is precies het soort beweging dat een ongestuurde grootheid vertoont.

  **WAT ER IN DE CODE VERANDERDE.** Nieuw: `optimizer/dissipationTerm.test.ts`, `scripts/measure-v36-dissipation.ts` (de meting waarop deze entry rust — beide armen per netlist, de termbijdrage naast de objectiefwaarde, en de noemer naast R_e). Gewijzigd: `optimizer/shortlist.ts` (`DissipationColumn`, op `ShortlistInput` en `ShortlistRow`), `optimizer/worker.ts` (`V2RunSettings.amplifierPowerW`, `dissipationColumnOf`, het veld op `V2CandidateResult`), `App.tsx` (het vermogen in de scaninstellingen, de kolom in het veld, de kolom in de tabel), de recorder (`grootste_R_W_bij_100W` en het `v36_dissipatie`-blok), `compare-corpora.ts` (twee kolommen en een corpusgemiddelde), `shortlist.test.ts`, `frozenNetlistGates.test.ts`, `casus1V2Candidates.test.ts`.

  **Bijvangst, en zij verklaart een fout die deze sessie zelf maakte:** `scripts/` valt buiten `tsc -b`. De testscope in `tsconfig.test.json` is `src/**`, en er is geen scope die `scripts/` dekt — dus `casus1Filter(key, …).parts` op een `FilterInput` dat geen `parts` heeft, kwam niet als typefout terug maar als een kolom vol `null` in het referentiebestand. Gevonden doordat het blok werd nagekeken; het staat hier omdat de volgende die een script schrijft dat referentiegetallen wegschrijft, dit hoort te weten. Niet gerepareerd deze sessie: `scripts/` in de build trekken raakt vijf scripts tegelijk en hoort een eigen oplevering te zijn.

  **ONAANGERAAKT:** M-A en élke andere poort, de audittier, `dissipationWeight` en élk ander gewicht, de fxOf-term zelf, `probeOn` en de randregel, de barrière, `safety`, het ketenraster, de generator, de netlists (bit voor bit), en de v1-route — `toggleRegression.test.ts` is byte-identiek, `workerRouteRegression.test.ts` levert zijn opgeslagen netwerk nog steeds byte voor byte, en `f4cRegression.test.ts` reproduceert beide vormen op twee seeds.

- V37 (**GESLOTEN** op 28-08-2026 — de noemer van de dissipatieterm is de opgeloste R_e, en de referentie die dat controleert stond al in het casusboek) — opgeworpen bij de V36-sessie, 28-08-2026.

  **De vondst stond, en zij was al helemaal uitgeschreven.** V36 mat waar de dissipatieterm zijn probe leest, vond dat die vraag geen bevinding opleverde, en liep tegen een andere aan: de term heet `dissipationWeight · (R_source/R_e)²` en deelde niet door R_e. Hij deelde door `re = Math.max(0.5, pZl[k].re)` — de reële impedantie van de laagste weg BIJ de probe — en sinds V34 zit die probe op de impedantiePIEK van het wooferpaar. Gemeten op casus 1: **19,31 Ω tegen een met een meter gemeten R_e van 3,05 Ω, een factor 6,33 die tot 40,1 kwadrateert.** Deze sessie repareert dat op de v2-route en meet wat het kost.

  **DE INVENTARISATIE, EERST, EN ZIJ HEEFT DE VORM VAN DE REPARATIE BEPAALD.**

  1. **De teller is PER TAK en niet per systeem.** `netOptimizer.ts` roept `seenImpedance(net, [lowDrv.id], lowDrv.nodes, …)` aan: de Thévenin-weerstand gezien vanaf de klemmen van de LAAGSTE driver, met die driver uit het netwerk gehaald. Dat is exact dezelfde grootheid als `TheveninResult.rsOhm` in `metrics/electrical.ts:324` — M-E rekent hem met de twee-belastingenmethode, `netOptimizer` met een probebron, en beide beschrijven één tak. De laagste weg is `pickSlotsN(sol.drivers)`, `woofer ?? mid ?? tweeter`; op casus 1 is dat het wooferpaar. **De noemer hoort dus de R_e van DIE tak te zijn**, en niet een systeemwaarde en niet die van een andere driver.
  2. **De v1-route deelt door `Re(Z)` bij de probefrequentie, en die noemer mag niet bewegen.** Toggle-invariant: met `engineV2Enabled` uit is het gedrag byte-identiek, en de tuner is v1-code die élke bestaande aanroeper deelt. De nieuwe sleutel heeft daarom `'probe'` als default en `dissipationTerm.test.ts` assert dat afwezig en `'probe'` byte-identieke netwerken opleveren (P2).
  3. **De termbijdrage met R_e als noemer, gemeten vóór de reparatie.** `scripts/measure-v36-dissipation.ts` drukt de kolom al af. Op de drie v1-baselines, met `fx` = de twee dominante termen van `fxOf` herrekend uit het geleverde rapport: HUIDIG **0,07 % → 2,95 %**, KAND_A **0,34 % → 13,78 %**, KAND_B **0,16 % → 6,39 %**. De uitdagingsdrempel van de tuner is 1 %. De verwachting "~3 %" uit de opdracht was dus een meting vóór de reparatie en zij klopte.

  **DE CONTROLE IS DE REFERENTIE, EN DAT IS DE HELE ACCEPTATIE.** M-E rekent `Q_es_mult = (R_e + R_s)/R_e = 1 + R_s/R_e` op precies de R_e die de A5c.1-hiërarchie oploste, en `kandidaten.*.Qes_mult` staat als klasse-B-referentie in het casusboek — mét zijn parameterblok (`_M_E_parameters.R_e_ohm = 3,05 Ω`, V15). Als de dissipatieterm dezelfde grootheid meet, dan IS `1 + verhouding` die referentie. Nagemeten op alle zestig bevroren netlists:

  | noemer | reproduceert `Qes_mult` |
  | --- | --- |
  | de opgeloste R_e | ja — grootste afwijking **0,36 %**, tegen een tolerantieklasse van 5 % (`exponent_pct`) |
  | `Re(Z)` bij de probe (de piek) | nee — minstens **18 %** ernaast op élke netlist waarvan de referentie werkelijk boven 1 ligt |

  Het restje van 0,36 % is geen speling maar een bekende: M-E leest bij `f_s` op het rapportraster (52,26 Hz), de term bij de probe op het veiligheidsraster (51,54 Hz). Twee metingen van één grootheid, 0,7 Hz uit elkaar. `frozenNetlistGates.test.ts` assert beide helften — de reproductie én de tegenproef — want zonder die tweede is "hij deelt door R_e" niet te onderscheiden van "hij deelt door iets wat er toevallig op lijkt" (V23).

  **WAT ER GEBOUWD IS.**

  1. **`dissipationReferenceSource`, een KEUZE-sleutel met twee waarden.** `'probe'` = `Re(Z)` bij de probe, default, en dus is elke v1-run byte-onaangeraakt; `'re'` = de opgeloste R_e van de laagste weg. Keuze en geen polish, om de reden waarom `band` er een is: hij definieert de grootheid die een gewogen term meet. Twee zoektochten die door 3,05 en door 19,31 Ω delen zoeken een ander netwerk — 3 % van de objectiefwaarde tegen 0,07 %.
  2. **`dissipationReferenceReOhm`, polish ernaast.** De meting die de keuze noemt, aangereikt door de aanroeper die haar al in handen heeft — precies de vorm die V33 koos voor `zFloorBarrierSource` / `zFloorBarrierImpedance`. De worker leest hem uit `facts.reOhm`, hetzelfde object waaruit de M-E-inversie (`bounds.ts`, `maxSeriesResistanceFromQes`) zijn R_e haalt. **Eén R_e, één herkomst, sinds V37 drie lezers**, en dat is F4b's lek 1 in zijn eindtoestand: de ingestpas lost op, `measurementFacts` draagt over, de worker consumeert, en er is nergens een tweede wandeling door de hiërarchie.
  3. **Geen terugval, voor de derde keer en om dezelfde reden.** Een genoemde bron zonder opgeloste R_e voor de laagste weg levert **geen verhouding**: de term telt niets op en `dissipationRefNote` zegt welke invoer ontbrak, in de vorm van lek 2. Een stille terugval op de probe-aflezing zou precies het getal terugbrengen dat deze sessie intrekt, op de ene plek waar niemand kijkt (V32, V33, V34).
  4. **De kandidaat stelt hem onvoorwaardelijk, en dat is de ene afleiding in `candidateDeclaration.ts` die aan niets hangt.** V30, V33 en V34 hangen alle drie aan een andere instelling — geen vloer, geen barrière; geen barrière, geen band; geen veiligheidsset, geen breder raster. V37 hangt aan niets, omdat de vraag niet voorwaardelijk is: `dissipationWeight` is een GRIJZE sleutel (A3j), dus een v2-kandidaat stelt hem altijd expliciet en de term is altijd levend — en een levende term meet altijd iets. WELK iets volgt uit waar de term voor is, en dat staat in A3j rij 23 en A4 M-E. P4 wordt één laag lager beantwoord: of er een R_e is OPGELOST is een meetfeit en geen ontwerpersinstelling, dus de kandidaat noemt de grootheid en de TUNER meldt de afwezigheid.
  5. **De typecheck dekt `scripts/`.** De bijvangst die V36 opschreef en niet repareerde. `tsconfig.scripts.json` is een vierde project onder `tsc -b`, en hij ving meteen twee gevallen van dezelfde klasse als V36's kolom vol `null`: `let out: T | null = null` toegewezen bínnen een callback wordt door TypeScript tot `never` versmald, dus élke aflezing eruit was een fout die de build niet zag (twee scripts, 67 fouten), en `tuned` — een TELLING van de vrije componentwaarden — werd in beide scripts naar `boolean` gecast en als `true`/`false` opgeschreven. Het opgeschreven getal was toevallig al een getal; het TYPE loog. Verzamelen gebeurt nu in een array, wat de compiler wél kan volgen.

  **BIJVANGST: een gedateerd corpus wees naar het verkeerde bestand.** `freeze-live-corpus.ts` neemt het klasse-B-blok mee — dat is precies waarvoor het geschreven is — maar nam ook zijn `klasse_toelichting` verbatim over, en die noemt de LEVENDE sleutel ("Metrieken op de VASTE netlist `…netlists.KAND_V2_3`"). In een gedateerd blok wijst die zin dus naar de netlist die de eerstvolgende regeneratie overschrijft: het verkeerde bestand, onder een naam die zegt dat het het goede is. Twee corpora dragen die zin — `V33_KAND_*`, bevroren door het script bij V34, en `V34_KAND_*`, bevroren deze sessie. Het script schrijft de zin nu opnieuw met de eigen sleutel, de herkomst van de kopie en een verwijzing naar `<corpus>.reden`, en beide families zijn bijgewerkt. De handmatig bevroren corpora (V28, V30, V32, V33-sweep) hadden dit niet: hun toelichtingen zijn indertijd met de hand geschreven en noemen zichzelf.

  **WAT DE REPARATIE KOSTTE, OP HET HELE VELD.** Het levende corpus is opnieuw opgewekt op `'safety'`, en het corpus dat er stond is bevroren als `V34_KAND_*` — de "vóór"-helft, byte-identieke bestanden met hun klasse-B-blokken mee, via `scripts/freeze-live-corpus.ts`. De tabel is `npx vite-node scripts/compare-corpora.ts v34 live`, en zij is de default geworden.

  **De vóór/ná, per kandidaat.** Vijftien kandidaten in, vier zonder netwerk eruit (drie geweigerd door `M-B/|Z|`, één door de tweeterbescherming), elf geleverd, tien bevroren. Tien vóór en tien ná; alle twintig halen de gestelde vloer als bestand.

  | kandidaat (W-M · M-T) | min \|Z\| vóór | min \|Z\| ná | @ Hz ná | vloer vóór → ná | SPL ± vóór → ná | RMS vóór → ná | W-M fase vóór → ná | M-T fase vóór → ná | dissipatie % vóór → ná | grootste R (W) vóór → ná |
  |---|---|---|---|---|---|---|---|---|---|---|
  | 396.7 · 1294 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** |
  | 396.7 · 1491.4 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** |
  | 396.7 · 1719 | 2.56 | 2.56 | 80.97 | **ja** → **ja** | 3.67 → 3.67 | 1.76 → 1.76 | 16.74 → 16.74 | 26.31 → 26.31 | 0.93 → 0.93 | 0.70 → 0.70 |
  | 396.7 · 1981.2 | 2.57 | geen netlist | — | **ja** → — | 3.57 → geen netlist | 1.81 → geen netlist | 17.07 → geen netlist | 29.06 → geen netlist | 0.86 → geen netlist | 0.65 → geen netlist |
  | 396.7 · 2283.5 | 2.56 | 2.56 | 83.31 | **ja** → **ja** | 3.42 → 3.42 | 1.75 → 1.75 | 20.51 → 20.51 | 22.41 → 22.41 | 0.86 → 0.86 | 0.66 → 0.66 |
  | 466.5 · 1294 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** |
  | 466.5 · 1491.4 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** |
  | 466.5 · 1719 | 2.60 | 2.61 | 1062.80 | **ja** → **ja** | 3.72 → 3.86 | 1.80 → 1.88 | 16.74 → 14.42 | 33.30 → 31.81 | 22.89 → 35.75 | 17.63 → 29.12 |
  | 466.5 · 1981.2 | 2.61 | 2.61 | 1157.86 | **ja** → **ja** | 3.36 → 3.93 | 1.85 → 2.05 | 13.34 → 16.33 | 32.09 → 30.75 | 26.17 → 31.46 | 18.22 → 20.76 |
  | 466.5 · 2283.5 | 2.58 | 2.60 | 1202.79 | **ja** → **ja** | 3.35 → 3.25 | 1.90 → 1.80 | 15.15 → 17.33 | 25.53 → 26.47 | 34.66 → 22.80 | 28.73 → 17.98 |
  | 548.5 · 1294 | 2.59 | 2.59 | 970.92 | **ja** → **ja** | 4.39 → 4.43 | 2.08 → 2.14 | 16.91 → 14.20 | 30.75 → 33.36 | 30.28 → 33.38 | 15.21 → 14.92 |
  | 548.5 · 1491.4 | — | 3.53 | 1461.93 | — → **ja** | — → 5.47 | — → 3.83 | — → 81.39 | — → 114.03 | — → 26.27 | — → 16.38 |
  | 548.5 · 1719 | 2.59 | 2.57 | 904.03 | **ja** → **ja** | 3.98 → 4.16 | 1.83 → 1.77 | 31.78 → 29.87 | 10.28 → 8.11 | 28.89 → 20.99 | 21.70 → 14.21 |
  | 548.5 · 1981.2 | 2.58 | 2.58 | 132.19 | **ja** → **ja** | 3.85 → 3.65 | 1.69 → 1.92 | 38.00 → 42.40 | 10.85 → 19.92 | 23.14 → 22.42 | 17.86 → 17.01 |
  | 548.5 · 2283.5 | 2.58 | 2.59 | 1072.97 | **ja** → **ja** | 3.86 → 3.85 | 1.88 → 1.88 | 48.22 → 46.87 | 4.68 → 5.47 | 28.56 → 27.42 | 20.68 → 19.80 |

  **DE SCHOONSTE AFLEZING STAAT IN DE TWEE RIJEN DIE NIET BEWOGEN.** `396,7 · 1719` en `396,7 · 2283,5` zijn ONDERDEEL VOOR ONDERDEEL identiek aan hun V34-tegenhanger — alleen het naamveld verschilt, want de shortlist nummert opnieuw. Dat zijn precies de twee kandidaten waarvan de dissipatieterm NUL is: hun `Qes_mult` staat op 1,00, hun bronweerstand op 0,001 Ω. De zeven kandidaten met een term ≠ 0 zijn alle zeven bewogen. Een wijziging die alleen daar aankomt waar de term bestaat, en nergens anders, is zo scherp als een vóór/ná op een niet-convexe zoektocht kan zijn.

  **WAT DE TERM MEET, NAAST WAT DE TABEL AFDRUKT.** De dissipatiekolom hierboven is M-A: het aandeel van het versterkervermogen dat in de discrete weerstanden verdwijnt, over het HELE netwerk. Dat is niet de grootheid die de term stuurt — die is de bronweerstand die de LAAGSTE weg ziet, één tak, bij de probe. Beide horen erbij en zij bewegen niet dezelfde kant op:

  | grootheid | vóór (V34) | ná (V37) |
  | --- | --- | --- |
  | M-A dissipatie, corpusgemiddelde | 19,7 % | **22,2 %** |
  | grootste enkele weerstand, corpusgemiddelde | 14,2 W | **15,2 W** |
  | R_source van de laagste weg, gemiddelde over de negen gepaarde kandidaten | 1,157 Ω | **1,110 Ω** |
  | de dissipatieterm zelf, zelfde negen | 0,0102 | **0,0100** |

  **EN DAT IS EEN EERLIJKE UITKOMST DIE KLEINER IS DAN DE INGREEP.** De term is veertig keer groter geworden en de grootheid die hij bestraft is corpusbreed 4 % gezakt. Individuele kandidaten bewegen veel verder, en in beide richtingen: `466,5 · 2283,5` gaat van 2,573 naar 1,405 Ω (en van 34,7 % naar 22,8 % M-A), `466,5 · 1719` juist van 1,414 naar 2,784 Ω. Wat de term koopt is dus geen corpusbrede daling maar het feit dat hij voor het eerst de grootheid weegt die hij bedoelt; de zoektocht doet daar wat een niet-convexe zoektocht doet.

  **WAT ER GRATIS BIJ KWAM EN WAT ERAF GING.** `548,5 · 1491,4` levert voor het eerst sinds V33 een netwerk — bij V33 weigerde `M-B/|Z|` zijn hele waardetune op 2,45 Ω, nu komt hij op 3,53 Ω uit — en de shortlist neemt hem op grond van spreiding op. Het is geen goed ontwerp: 5,47 dB venster, 3,83 dB RMS, 114° M-T-fase. `396,7 · 1981,2` valt eruit. Zijn dissipatieterm is nul — bronweerstand 0,001 Ω, `Qes_mult` 1,00 — dus V37 kan zijn eigen tune niet verplaatst hebben; wat hem eruit duwt is de samenstelling van het veld. Byte voor byte is dat niet na te rekenen, want een kandidaat die de shortlist niet haalt wordt geen bestand: de twee rijen hierboven die wél gebleven zijn dragen die claim. Dat is de shortlist die doet wat zij hoort te doen — spreiding boven rangschikking (A5e.1) — en het is óók de reden dat het corpusgemiddelde van M-A stijgt: er komt een rij bij met 26,3 %.

  **DE KOSTEN.** Vijftien ketenruns, gemeten 115–223 s per kandidaat, **40 minuten wandkloktijd** op `'safety'`. Dezelfde orde als V34 (41 min): V37 verandert een deling en geen raster, dus de prijs van de barrière is onveranderd.

  **HET CORPUSNIVEAU IS DE MAAT, NIET DE INDIVIDUELE KANDIDAAT, en dat is geen uitvlucht maar de V33-gevoeligheid.** De doelfunctie is niet convex en de zoektocht is deterministisch maar niet stabiel onder een storing: V33 mat dat zeven van de negen overgenomen rijen bewogen bij een wijziging waarvan verwacht werd dat zij niets zou doen. Een term veertig keer groter maken beweegt de netwerken hoe dan ook. Wat je kunt vragen is of het corpus als geheel de kant op gaat die de term bedoelt.

  **DIT IS DE EERSTE GRIJZE v1-WAARDE DIE OP DE v2-ROUTE ZICHTBAAR WERK DOET.** `dissipationWeight` staat op 0,05 — de app-standaard, overgenomen uit v1, expliciet gesteld door de kandidaat en nooit stil op nul (A3j). Tot V37 kon hij niets beslissen: `frozenNetlistGates.test.ts` assert dat de term op de piekhoogte op géén enkele bevroren netlist de uitdagingsdrempel van 1 % haalde (grootste aandeel 0,57 %), en op R_e haalt hij hem wel (grootste aandeel 22,7 %). Dat is precies de rol die `AMP_FLOOR_BARRIER_WEIGHT` bij V30 kreeg en die `greyValues` in de vingerafdruk vastlegt: een constante die elders is afgeregeld en hier draagt. **Het gewicht is deze sessie NIET bijgesteld**, en die volgorde is een besluit dat V36 al nam: eerst de noemer, dán pas de vraag of het gewicht klopt. Een gewicht ophogen om een verkeerd gemeten grootheid te compenseren is de fout twee keer maken; een gewicht verlagen omdat de grootheid eindelijk klopt, zou hetzelfde zijn.

  **WAT ER IN DE CODE VERANDERDE.** Nieuw: `tsconfig.scripts.json` (het vierde project onder `tsc -b`). Gewijzigd: `netOptimizer.ts` (`dissipationReferenceSource`, `dissipationReferenceReOhm`, `dissRefSource`/`resolvedReOf`, de noemerkeuze in `metricsOn`, `seedLowModel` uit de probenoot gelicht zodat twee notities niet twee drivers kunnen noemen, `dissipationRefNote`), `optimizer/choices.ts` (twee sleutels geclassificeerd, 42 → 44), `optimizer/candidateDeclaration.ts` (de onvoorwaardelijke V37-afleiding), `optimizer/worker.ts` (de R_e-overdracht uit `facts.reOhm`, de noot in de notities, en de melding wanneer er niets is opgelost), `optimizer/dissipationTerm.test.ts` (vijf V37-claims), `frozenNetlistGates.test.ts` (de Qes-reproductie met tegenproef, en de vóór/ná van de uitdagingsdrempel), `choiceKeyGuard.test.ts`, `casus1V2Candidates.test.ts`, de generator (`dissipatie_noemer` en het gewicht met hun redenen; de twee typefouten), `measure-v30-floor-goal.ts` (dezelfde twee), de recorder (`term_op_R_e`, twee benoemde noemers, het V34-corpus geregistreerd), `compare-corpora.ts` (`v34` als corpus, en als default-vóór), `measure-v36-dissipation.ts` (de laatste tabel is nu een vóór/ná), `freeze-live-corpus.ts` (de `klasse_toelichting` van het meegenomen blok wordt herschreven), en de twintig `V33_KAND_*`/`V34_KAND_*`-blokken die de oude zin droegen.

  **ONAANGERAAKT:** `dissipationWeight` en élk ander gewicht, M-A, de audittier, élke poort, de bronweerstandsprobe en zijn bron-sleutel (V35 blijft open), de barrière, `safety`, het ketenraster, de logica van beide ketens, en de v1-route — `toggleRegression.test.ts` is byte-identiek, `workerRouteRegression.test.ts` levert zijn opgeslagen netwerk nog steeds byte voor byte, en `f4cRegression.test.ts` reproduceert beide vormen op twee seeds.

- V38 (**MEETSESSIE** op 28-08-2026 — het gat naar HUIDIG ontleed; geen enkele regel engine, keten, tuner of poort gewijzigd) — opgeworpen als eigen opdracht.

  **DE VRAAG.** HUIDIG meet 0,60 dB RMS-vlakheid, het beste levende v2-corpus 1,75. Wat bouwt het handwerk dat de keten niet bouwt, hoeveel van het gat verklaart elk element, en welk deel is geen topologie maar de zoektocht of de synthese? Deze sessie meet en besluit niets: `src/lib/` is onaangeraakt, het levende corpus staat er nog, en de uitkomst is een beslislijst.

  ---

  **DE MEETBANK, EN WAT ZIJ NIET IS.** Alle armen delen één opzet (`scripts/v38-bench.ts`): de tuner-opties van de v2-route, dezelfde metriekvector door `buildReport`, dezelfde netlist-loader. Twee scripts die elk hun eigen opties samenstellen leveren twee tabellen op die niet mogen worden afgetrokken, en de aftrekking IS de opdracht.

  Zij wijkt op drie punten af van de v2-route, elk een besluit:

  - **geen `staged`** — die zet de trapmethode aan, en die SNOEIT en ESCALEERT onderdelen. Een ablatie waarin de tuner het weggehaalde onderdeel terug mag zetten meet niets.
  - **geen `branchTargets`** — die leiband komt uit de ontwerpstap van de keten; die stap draait hier niet.
  - **geen `gateViolation`-hook** — een poort die de hele tune weigert levert het ZAAD terug (V31/V33), en een arm die zijn zaad teruggeeft is geen meetpunt maar een lege regel. De poort oordeelt ná afloop met `buildReport`, zoals `compare-corpora.ts` het doet. De gestelde vloer stuurt wél: zij wapent de reparatiepas én is zoekdoel (V30/V33).

  **DE BANK IS DAARMEE ZWAKKER DAN DE ROUTE, en dat is gemeten in plaats van geschat.** Op `396,7 · 1719` levert de bank 3,22 dB waar de volle route 1,76 levert; op `396,7 · 2283,5` 2,08 tegen 1,75. Eén getal zou hier meer suggereren dan gemeten is, dus staan er twee: **1,46 en 0,33 dB**. Arm-tegen-arm is de meting; het absolute niveau is dat van de bank.

  **EN DE TOPOLOGIE LIGT NIET VAST, ook zonder `staged`.** De ONDERDELENAUDIT blijft gewapend (V26 rij 33) en verwijdert componenten. Op vier van de tien gegladde armen haalde zij `C·L10` weg — een vierde-orde-pool in de tweetertak. Elk script schrijft daarom de geleverde netlist mee, zodat per arm na te meten is wat er verdween; een Δ die stilzwijgend ook een audit-verwijdering bevat is geen groepsbijdrage. Dat is niet theoretisch: **precies één Δ per reeks is er door vervuild**, en beide staan hieronder met naam.

  ---

  **STAP 1 — DE TOPOLOGIE-DIFF.**

  HUIDIG draagt vijf groepen die geen filterpool zijn. KAND-A en KAND-B dragen dezelfde vijf, met dezelfde partIds. Het levende corpus draagt er **nul** van: geen enkele val, gedempte val, Zobel of shunt-shelf in tien netlists. Wat elke groep DOET is gemeten door het netwerk twee keer op te lossen — met en zonder — en niet uit het schema afgelezen; de "aanleiding" is de dichtstbijzijnde vondst van de opnamepas op dezelfde driver, met de octaafafstand erbij.

| groep | tak | Δ doorlaatband | piek Δ | breedte | dichtstbijzijnde gemeten aanleiding | in KAND_V2 |
| --- | --- | --- | --- | --- | --- | --- |
| `L10+C11` (val) | woofer | −0,03 dB | −17,91 dB @ 1307 Hz | 0,99 okt | breakup +3,25 dB @ 1394 Hz (**+0,09 okt**) | 0 van 10 |
| `B·L14+B·C15+B·R16` (gedempte val) | mid | −0,00 dB | −6,66 dB @ 4596 Hz | 0,24 okt | breakup +2,95 dB @ 5690 Hz (+0,31 okt) | 0 van 10 |
| `C·L13+C·R15` (shunt-shelf) | tweeter | −0,14 dB | −3,29 dB @ 1040 Hz | 0,53 okt | Z-piek 16,6 Ω @ 924 Hz — f_s (**−0,17 okt**) | 0 van 10 |
| `R8` (3,30 Ω serie) | woofer | **−3,53 dB** | −20,15 dB @ 1889 Hz | 1,15 okt | niveauwerk (A5d.4) | 1–2 series-pad per netlist |
| `B·R9` (4,70 Ω serie) | mid | **−1,43 dB** | −6,58 dB @ 4099 Hz | 0,81 okt | niveauwerk (A5d.4) | ja |

  De kolom "Δ doorlaatband" doet het onderscheidende werk: een groep die vlak over de eigen doorlaatband werkt is NIVEAUwerk, een groep die daar niets doet en ergens een smalle hap neemt is een VAL. Zonder die kolom is elke rij een piek in de stopband en zegt de tabel niets.

  Op alle drie de v1-netlists landen dezelfde drie niet-niveau-groepen op dezelfde plek: de wooferval op 1040–1307 Hz (binnen 0,25 okt van een gemeten wooferbreakup), de tweeter-shelf op 893–1211 Hz (binnen 0,26 okt van de gemeten tweeter-f_s), de mid-val op 4596–5285 Hz. Alleen die laatste staat er **niet** op: 0,11–0,31 octaaf ONDER de dichtstbijzijnde gemeten mid-breakup (5690 Hz). Dat is een rij zonder aanleiding, en zij gaat als zodanig de beslislijst in.

  ---

  **WAAROM DE KETEN ZE NIET BOUWT — TWEE OORZAKEN, ALLEBEI BOVENSTROOMS VAN DE TUNER.**

  **(1) De lean-drempel rijdt mee op een andere instelling.** `threeWayChain.ts` stelt `corrections = (s.targets ? 'lean' : 'auto')` en `leanTargetDb = s.targets?.rippleDb`. `'lean'` fit eerst de kale ladder en koopt alleen correcties als die fit de drempel MIST. De eigen standaard van `synthesize` is 0,5 dB; de v2-route geeft `targets.rippleDb` mee, en dat is 2,5 dB — het stopdoel van de trapmethode, vijf keer zo ruim. Gemeten over het hele veld (15 kandidaten × 3 takken):

  | | takken |
  | --- | --- |
  | kale ladder onder 2,5 dB (wat de v2-route hanteert) | **45 van 45** |
  | kale ladder onder 0,5 dB (de eigen standaard) | **0 van 45** |
  | takken waar `'auto'` méér onderdelen zou bouwen | 45 van 45 |

  Er wordt dus nooit een Zobel, een Fs-val of een top-octaaf-hold gekocht, en met de eigen standaard zou dat op élke tak wél gebeuren. Onder `'auto'` bouwt elke kandidaat een `zobel ×1` en een `damped-trap ×1` erbij.

  **(2) Het EQ-budget is niet gesteld.** Een val op een BREAKUP komt in `deriveTopology` langs precies één weg: een EQ-band in de spec. Het budget is `Chain3Settings.eqBands`, en `CASUS1_V2_SETTINGS` stelt hem niet — dus nul. De app zelf staat op **twee** (`vfEqBands`, `App.tsx:5569`). Nagemeten: met 2 ontwerpt de stap wél banden (woofer lowShelf 1159 Hz, mid peak 966 Hz, tweeter peaks 3216 en 4754 Hz), met 0 geen enkele, en zonder band kan geen enkele waardetune er een maken.

  **Dat is V27's procesles voor de derde keer.** V27 ving `synthMode: 'filter'` waar de app `'acoustic'` draait, en een fixture zonder beschermingen die een dode kortsluiting opleverde. De regel die daar is opgeschreven — *een run-fixture die met een vergelijking als doel wordt gebouwd, draait de instellingen van de app en niet een minimale set* — is hier opnieuw geschonden, met een sleutel die niemand heeft gemist omdat afwezig hier stil "nul" betekent.

  **WAT DIE TOPOLOGIE WAARD IS NA HET TUNEN**, want een zaad draagt geen claim over de levering — de horizonpost over het synthese-verlies is precies daarop stukgelopen. Vier cellen op `396,7 · 1719`, allemaal door dezelfde waardetune:

  | EQ | correcties | zaad | RMS | SPL ± | W-M fase | M-T fase | min \|Z\| | EPDR | dissipatie |
  | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
  | 0 | lean *(de v2-route)* | 18 | 3,22 | 5,44 | 38,81° | 31,20° | **0,68 Ω** | 0,49 Ω | 1,0 % |
  | 0 | auto | 27 | **2,57** | 6,41 | **3,32°** | 11,36° | 2,56 Ω | 1,87 Ω | 45,4 % |
  | 2 | lean | 34 | **2,31** | 4,64 | 21,34° | 37,03° | 2,51 Ω | 1,30 Ω | 38,5 % |
  | 2 | auto | 38 | 3,02 | 6,31 | 6,29° | 18,52° | **3,23 Ω** | **3,23 Ω** | 65,4 % |

  En dezelfde vier op `396,7 · 2283,5`:

  | EQ | correcties | zaad | RMS | SPL ± | W-M fase | M-T fase | min \|Z\| | EPDR | dissipatie |
  | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
  | 0 | lean *(de v2-route)* | 18 | **2,08** | 4,53 | 19,16° | 15,05° | 2,58 Ω | 1,29 Ω | 0,6 % |
  | 0 | auto | 27 | 3,65 | 8,04 | 4,40° | 20,28° | 2,82 Ω | 2,41 Ω | 39,3 % |
  | 2 | lean | 32 | 2,51 | 4,41 | 15,17° | 22,89° | **1,41 Ω** | 0,71 Ω | 30,1 % |
  | 2 | auto | 41 | 3,15 | 6,93 | **3,61°** | 28,77° | 2,61 Ω | **3,64 Ω** | 73,3 % |

  **Op RMS is er geen consistente winst**: op de eerste kandidaat is de rijkste topologie de op één na slechtste, op de tweede is de KAALSTE de beste. Maar op twee andere assen wint `'auto'` **acht van de acht keer**:

  | as | kandidaat 1 (lean eq0 → auto eq2) | kandidaat 2 (lean eq0 → auto eq2) |
  | --- | --- | --- |
  | W-M fasetracking | 38,81° → **6,29°** (auto eq0: 3,32°) | 19,16° → **3,61°** (auto eq0: 4,40°) |
  | min \|Z\| | 0,68 Ω (mist de vloer) → **3,23 Ω** | 2,58 → **2,61 Ω** (lean eq2 zakt naar 1,41 en mist hem) |
  | EPDR | 0,49 → **3,23 Ω** | 1,29 → **3,64 Ω** |

  Betaald in dissipatie (1,0 → 65,4 % en 0,6 → 73,3 %), die casus 1 niet begrenst (P4). Dat is een afruil met n=2 kandidaten, geen verbetering, en de beslislijst somt hem zo op. Wat er wél hard uit komt: **de kale v2-cel is de enige die de gestelde versterkervloer met een bijna-kortsluiting mist** (0,68 Ω), en elke cel met correcties haalt hem.

  ---

  **STAP 2 — DE WATTENVAL, EN WAAROM ER TWEE ZIJN.**

  De ablatie loopt cumulatief van buiten naar binnen, filterkern blijft staan, met vier controle-armen ervóór. Die controles zijn niet decoratie: de eerste rookproef leverde 2,76 dB voor HUIDIG's eigen topologie mét zijn eigen waarden, en zonder controle zou dat als "de ablatie van de eerste groep" zijn opgeschreven — de fout die V27 optekende.

  **Op de maat die de v2-route vandaag gebruikt is de wattenval onmeetbaar.** Elke arm landt rond 2–3 dB en het weghalen van HUIDIG's handwerk maakt het geleverde netwerk VLAKKER: 0,00 / −0,50 / −0,37 / −0,24 / −0,01, samen −1,12 dB. Een tabel waarin elke groep negatief bijdraagt meet niet de groepen maar de bodem van de maat waarop hij is opgeschreven. Daarom staat hij er, en daarom staat er een tweede naast.

  **Op de eerlijke maat (`errorSmoothOct: 0`) meet hij wél:**

| arm | verwijderd | rol | onderd. | RMS | Δ | SPL ± | W-M fase | M-T fase | min \|Z\| | vloer | dissipatie | Q_es× | audit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HUIDIG, bevroren | — | — | 23 | 0,60 | — | 1,34 | 23,83° | 7,04° | 3,46 | ja | 45,8 % | 2,31 | — |
| 0c — alles, her-gepolijst | — | — | 23 | **0,53** | — | 0,91 | 53,09° | 6,54° | 2,61 | ja | 53,2 % | 2,64 | schoon |
| arm 1 | mid gedempte val | damped-trap | 20 | 0,54 | +0,01 | 0,98 | 51,09° | 5,77° | 2,89 | ja | 51,5 % | 2,73 | schoon |
| arm 2 | + mid niveau-R | series-pad | 18 | 1,15 | +0,61 | 2,38 | 41,44° | 5,18° | 2,59 | ja | 26,0 % | 2,79 | **`C·L10` mee weg** |
| arm 3 | + tweeter shelf | shunt-shelf | 17 | 1,49 | +0,34 | 3,20 | 25,32° | 8,41° | 2,59 | ja | 26,6 % | 3,18 | **`C·L10` terug** |
| arm 4 | + wooferval | trap | 15 | 1,57 | +0,08 | 3,18 | 38,17° | 9,50° | 2,59 | ja | 25,3 % | 4,22 | schoon |
| arm 5 | + woofer niveau-R | series-pad | 14 | 1,86 | +0,29 | 4,05 | 72,65° | 13,96° | 1,86 | **nee** | 0,0 % | 1,16 | schoon |
| | | | | | **som +1,33** | | | | | | | | |

  **De Δ's van arm 2 en arm 3 zijn elk apart vervuild** — de audit haalt `C·L10` op arm 2 weg en op arm 3 staat hij er weer — maar SAMEN zijn ze schoon, want arm 1 en arm 3 dragen allebei geen audit-verwijdering: **arm 1 → arm 3 is +0,95 dB**. Dat is het hele nut van de kolom.

  **DE OPTELLING, EN ZIJ KLOPT.** Gestript van alle vijf de groepen levert HUIDIG's topologie 1,86 dB; het beste levende corpus — dat geen van die vijf groepen heeft — staat op 1,75 dB, 0,11 dB ernaast. En 0,53 + 1,33 = 1,86 exact. Het gemeten gat HUIDIG → corpus (1,15 dB) valt dus uiteen in: **groepen +1,33 dB**, her-polijstingswinst **−0,07 dB** (de tuner doet het ongegladd iets beter dan de ontwerper), en **+0,11 dB** restverschil tussen HUIDIG-gestript en het corpus — twee verschillende topologieën die na het strippen dicht bij elkaar liggen. Waar hij niet optelt staat dat erbij: de twee middelste Δ's zijn alleen als paar geldig.

  **De rangorde die eruit volgt** — en dit IS de volgorde van de beslislijst: de mid-niveauweerstand (+0,61), de tweeter-shelf (+0,34), de woofer-niveauweerstand (+0,29), de wooferval (+0,08), de mid-val (+0,01).

  Dat de WOOFERVAL, de enige groep die pal op een gemeten breakup staat, 0,08 dB bijdraagt en de twee NIVEAUWEERSTANDEN samen 0,90, is de bevinding onder de bevinding: wat HUIDIG voorheeft is niet in de eerste plaats zijn vallen maar zijn niveauwerk.

  ---

  **WAT DE HER-POLIJSTING KOCHT EN WAT ZIJ BETAALDE.** "De doelfunctie loopt weg" mag alleen als er op géén enkele gewogen as iets terugkwam. Er kwam iets terug, en het is precies één ding. Controle 0c (gegladd) tegen HUIDIG's zaad, in de eenheden van de tuner:

  | as | voor | na | |
  | --- | --- | --- | --- |
  | fase (band) | 14,19° | 8,73° | **gekocht** |
  | paarfase W-M | 22,28° | 9,65° | **gekocht** |
  | rippelpiek | 1,40 dB | 6,42 dB | betaald |
  | gem. afwijking | 0,45 dB | 2,02 dB | betaald |
  | paarfase M-T | 7,04° | 7,99° | betaald |
  | min \|Z\| | 3,46 Ω | 2,60 Ω | betaald |
  | R_source | 3,98 Ω | 5,53 Ω | betaald |
  | dissRatio | 1,30 | 1,81 | betaald |
  | power-std / power-fold | weegt 0 | weegt 0 | n.v.t. |

  **De in-room-as kan niets teruggegeven hebben, en dat is gemeten en niet aangenomen:** `directivityWeight` staat op 0 in `CASUS1_V2_SETTINGS` én er reist geen `angleData` mee, dus `dW = 0` en beide power-termen wegen nul. Een as die niets weegt is geen verklaring.

  Het is dus een AFRUIL: 5,5° fase gekocht, al het andere betaald. **En 0d laat zien dat die afruil niet nodig was** — ongegladd verbetert dezelfde her-polijsting rippelpiek (1,40 → 1,15) én fase (14,19° → 11,00°) tegelijk.

  **DE DOELCURVES ZIJN GELIJK, NAGEGAAN.** `judgeResponse` rekent `rmsDeviationDb` t.o.v. de doelcurve gerefereerd aan het BANDGEMIDDELDE (`response.ts`); de amplitudeterm van de zoektocht is `bandStd` — de standaarddeviatie om datzelfde bandgemiddelde (`netOptimizer.ts:1887`). Zelfde vlakke doelcurve, zelfde niveauvrijheid, zelfde statistiek: er hoeft niets omgerekend te worden. Wat verschilt is de gladding en de band, en dat is precies de naad hieronder.

  ---

  **DE BEVINDING: DE ZOEKGLADDING, EN ZIJ IS GROTER DAN "1/12 TEGEN 1/6".**

  `smoothMag` gladt de DRIVERMAGNITUDES met 1/12 octaaf, laat de FASE ongemoeid, en sommeert de takken dan complex. Op élke gegladde arm ziet de zoektocht daardoor een som met een kenmerk van **43–47 dB** waar de echte som 4,4–6,4 dB rimpelpiek heeft. Met `errorSmoothOct: 0` vallen de twee samen (1,15 = 1,15), precies zoals de code belooft.

  De ene-sleutel-vergelijking, in beide richtingen gemeten, in twee onafhankelijke runs:

  | | gegladd | ongegladd |
  | --- | --- | --- |
  | gegladde reeks | 0c: **2,98** | 0d: **0,53** |
  | ongegladde reeks | 0d: **2,98** | 0c: **0,53** |

  Symmetrisch tot op de decimaal. Eén sleutel, 2,45 dB — en ongegladd landt de her-polijsting op 0,53 dB, **onder HUIDIG's eigen 0,60**, met een venster van ±0,91 tegen ±1,34, en zij haalt de gestelde vloer waar de gegladde arm hem mist.

  **HET GENERALISEERT NAAR GEGENEREERDE KANDIDATEN**, wat het onderscheidt van een eigenaardigheid van HUIDIG:

  | kandidaat | gladding | RMS | min \|Z\| | vloer | rippelpiek ruw / zoals de zoektocht hem ziet |
  | --- | --- | --- | --- | --- | --- |
  | 396,7 · 1719 | 1/12 okt | 3,22 | 0,68 Ω | **nee** | 6,07 / **46,47** |
  | 396,7 · 1719 | uit | **1,83** | 2,59 Ω | ja | 4,00 / 4,00 |
  | 396,7 · 2283,5 | 1/12 okt | 2,08 | 2,58 Ω | ja | 4,84 / **47,45** |
  | 396,7 · 2283,5 | uit | **1,53** | 2,60 Ω | ja | 4,68 / 4,68 |

  Drie topologieën, dezelfde richting, 0,55–2,45 dB. Op `396,7 · 2283,5` levert de bank ZONDER gladding 1,53 dB, beter dan de volle v2-route MET gladding op dezelfde kandidaat (1,75) — terwijl die bank verder zwakker is.

  **Dit is géén bug-melding en de sessie repareert niets.** `errorSmoothOct` is gedocumenteerd gedrag, staat als POLISH geclassificeerd (A3j), en F3c bouwde er al een zichtbaarheidsnotitie voor (`smoothingConsistency`). Wat V38 toevoegt is de MAAT: op deze casus is die polish-sleutel het hele gat.

  **DE TWEEDE NAAD, en zij zit op de as waarvoor de afruil is gemaakt.** Op HUIDIG's zaad zijn de twee fasematen het eens (tuner 22,28° tegen rapport 23,83° voor W-M). Op het geleverde netwerk lopen ze uiteen in TEGENGESTELDE RICHTING: de tuner leest 9,65°, het rapport 47,68°. Nagemeten dat het niet de band is — beide netwerken worden op 397–715 Hz geoordeeld met 42,95 % dekking, en dat is dezelfde band. HUIDIG kruist W-M op 359,7 Hz, ónder de meetgeldigheidsvloer, dus dat oordeel kijkt uitsluitend BOVEN het kruispunt. Welke van de twee de luidspreker beschrijft is met deze sessie niet uitgemaakt; dát ze het oneens zijn wel.

  ---

  **STAP 3 — DE TRANSPLANTATIE: BLIJFT ER EEN REST?**

  HUIDIG's topologie, waarden uit vier zaden die 0,60 tot 12,72 dB uiteen liggen, overname vastgehouden:

  | zaad | RMS zaad | RMS geleverd | W-M | M-T | min \|Z\| | overnames |
  | --- | --- | --- | --- | --- | --- | --- |
  | warm (HUIDIG zelf) | 0,60 | 2,98 | 47,68° | 7,77° | 2,53 Ω | 358/2370 |
  | koud (midden van de doos) | 4,00 | 3,02 | 45,55° | 6,13° | 2,53 Ω | 358/2370 |
  | koud-1 | 12,72 | 3,13 | 42,02° | 20,22° | 2,53 Ω | 358/2370 |
  | koud-2 | 3,90 | **2,69** | 45,73° | 5,69° | 3,44 Ω | 358/2370 |

  Alle vier op dezelfde geleverde overnames, spreiding 0,44 dB. **De zoektocht loopt niet vast en mist HUIDIG niet door pech**: hij convergeert betrouwbaar, en het punt waarheen hij convergeert is 2,7–3,1 dB. De rest is 2,09 dB — en met `errorSmoothOct: 0` op dezelfde topologie is zij **negatief** (0,53 tegen 0,60). Er blijft dus niets over voor topologie.

  **HET SYNTHESE-FASEVERLIES VERKLAART HEM NIET, en dat hoefde niet opnieuw gemeten te worden.** De hypothese — *de ontwerpstap modelleert zijn EQ-banden fase-vrij* — is in `OVERDRACHT-2026-08.md` al WEERLEGD: `evalEqBand` is een complexe analoge biquad (peak én beide shelves), dus de ontwerpstap rekent met volledige minimumfase. Bij V38 nagelezen in `src/lib/filters.ts:163`; het staat er nog zo. Bovendien komt er in de transplantatie geen ontwerpstap en geen EQ-band voorbij — de topologie is gegeven en alleen waarden bewegen. Een rest die dáár overblijft kan per constructie geen synthese-faseverlies zijn.

  ---

  **TWEE NUL-RESULTATEN, die allebei een verklaring wegnemen.**

  **De venstergrens kost niets.** HUIDIG kruist W-M op 359,7 Hz, 0,14 octaaf onder de A5d.3-vloer van 396,7 Hz, en de generator mag daar per beleid niet komen — meetgeldigheid, en terecht. Gemeten als eigen post, zelfde topologie, zelfde zaad, alleen een andere kooi:

  | kooi | overnames | RMS | W-M fase | M-T fase | min \|Z\| | dissipatie | Q_es× |
  | --- | --- | --- | --- | --- | --- | --- | --- |
  | HUIDIG's eigen ±2 % (0c) | 358/2370 | 2,98 | 47,68° | 7,77° | 2,53 Ω | 58,9 % | 2,82 |
  | A5d.3-venster (0b) | 554/2370 | **2,96** | **19,79°** | 7,83° | 2,53 Ω | **42,8 %** | **1,93** |

  Bijdrage aan het gat: **−0,02 dB**. De vloer levert 27,9° W-M-fase op, 16 procentpunt dissipatie en Q_es× van 2,82 naar 1,93. Ongegladd draait hij dezelfde kant op: 0b 0,43 tegen 0c 0,53. HUIDIG's kruispunt onder de meetgeldigheidsvloer is dus NIET waar zijn voorsprong vandaan komt, en de venstergrens vervalt als post in de wattenval. De groundplane-hermeting van de horizonlijst blijft de moeite waard — zij opent dat gebied echt — maar zij is op deze casus geen verklaring voor het gat.

  **De zoektocht is niet de beperking.** Zie de vier zaden hierboven.

  ---

  **STAP 4 — DE BESLISLIJST. Zij somt op; Sander besluit.** Volgorde is verwacht rendement, en dat is de wattenval plus de ene-sleutel-metingen.

  **A. De zoekgladding (`errorSmoothOct`) — 0,55 tot 2,45 dB, op drie topologieën.** Geen kandidaat- en geen topologiekwestie: de zoektocht gladt drivermagnitudes en niet hun fase, en sommeert dan complex. Wat dat waard is staat hierboven; wat het KOST is niet gemeten (de gladding bestaat om de zoekruimte glad te maken, en een ongegladde zoektocht kan op andere casussen slechter converteren — hier werd hij juist sneller: 478 s tegen 891 s). Vier vormen liggen open, geen ervan hier gekozen: (i) laten staan en de F3c-notitie aanscherpen; (ii) de fase meegladden zodat de gegladde som een echte som blijft; (iii) een kandidaat de bron laten stellen zoals bij V33/V34/V37; (iv) de gladding alleen op de zoekmaat en niet op de leveringsmaat. Dit verdient dezelfde behandeling als V30/V32/V33/V34: een eigen sessie met een vóór/ná op het hele veld.

  **B. `leanTargetDb` — 45 van 45 takken, en hij is niet eens een sleutel.** De drempel die bepaalt of een tak een Zobel, een Fs-val of een top-octaaf-hold koopt, wordt binnen de keten AFGELEID uit `targets.rippleDb`. Een kandidaat kan hem principieel niet stellen: er is geen sleutel om te stellen. Dat is niet "nog niet verklaard" maar "niet verklaarbaar", en het is de scherpste vorm van de erf-fout die F4d beëindigde.

  **C. `eqBands` — de app stelt 2, de v2-fixture stelt niets.** De enige weg naar een breakup-val. Afwezig betekent hier stil NUL en niet "geen oordeel", wat het tegendeel is van P4.

  **D. Het dekkingsgat waar B en C in vallen.** A3j's toetsbaarheid — `CHOICE_KEYS`/`GREY_KEYS`/`POLISH_KEYS`, de volledigheidsassert, en `choiceKeyGuard.test.ts`'s "een sleutel die er bovenstrooms bijkomt zonder klasse breekt de build" — dekt de 44 sleutels van `NetOptimizeOptions` en niets anders. `Chain3Settings` (≈32 sleutels) is nergens geclassificeerd; hij komt in `engine2/` alleen in twee commentaarregels voor. `eqBands` is naar A3j's eigen woorden een KEUZE ("wat de topologie IS") en heeft geen klasse, geen verklaring en geen dekkingsgarantie. Wat V38 hier oplevert is geen reparatie maar de vaststelling dat de garantie één laag te laag ophoudt.

  **E. Per groep, wat een kandidaat P6-schoon zou kunnen dragen.** De metriek levert frequentie en Q, de kandidaat draagt de structuur, de tuner polijst de waarden:

  | groep | kan de kandidaat hem dragen? | waaruit |
  | --- | --- | --- |
  | wooferval | **ja** | `breakups.peaks`: f = 1394 Hz, +3,25 dB, Q 6,7 — f, diepte en Q zijn alle drie gemeten |
  | tweeter shunt-shelf | **ja** | `impedance`: f_s 924,3 Hz, 16,6 Ω, Q 1,07, R_e 5,227 Ω — een Fs-dempingsnetwerk is hieruit exact te parameteriseren |
  | Zobel (heeft HUIDIG niet; `'auto'` bouwt hem) | **ja voor woofer en mid, NEE voor de tweeter** | `semiInductance`: woofer n = 0,849 geldig, mid n = 0,603 geldig, tweeter ONGELDIG — de fit weigert (V8e). Een kandidaat die hem daar tóch voorstelt verzint |
  | mid gedempte val | **nee, niet op deze plek** | de dichtstbijzijnde gemeten aanleiding ligt 0,31 okt hoger. Wat HUIDIG daar doet is niet uit de opnamepas af te leiden |
  | niveauwerk (`R8`, `B·R9`) | **gedeeltelijk** | A5d.4 levert een verankerd budget (anker = mid; woofer 0,89 dB, tweeter 3,44 dB) maar "as measured": A5d.4(a) wil het ankerniveau ná baffle step, en dat is het doelcurve-object — **A5e.2, geparkeerd**. HUIDIG betaalt 3,53 dB op de woofer waar het budget 0,89 zegt; dat verschil IS de baffle-step-compensatie die het blok nog niet kan uitdrukken, en het blok zegt dat zelf in zijn notities |

  Twee posten hebben dus geen gemeten aanleiding en kunnen door de generator niet worden voorgesteld zonder te verzinnen: de mid-val op zijn feitelijke plek, en het deel van het niveauwerk dat aan de doelcurve hangt. Dat laatste is niet nieuw — het is A5e.2 — maar V38 zet er een getal bij: **0,90 van de 1,33 dB van de wattenval zit in de twee niveauweerstanden.**

  **F. De twee fasematen zijn het oneens.** Zie de tweede naad. Zolang dat zo is, is "de tuner kocht fase" een uitspraak in de eenheden van de tuner en niet in die van het rapport, en elke afruil die op fase wordt verdedigd draagt die onzekerheid mee.

  ---

  **WAT ER IN DE CODE VERANDERDE: NIETS ONDER `src/`.** Nieuw onder `scripts/`: `v38-bench.ts` (de gedeelde meetbank), `v38-groups.ts` (decompositie, gemeten groepseffect, ablatie), `measure-v38-topology.ts`, `measure-v38-corrections.ts`, `measure-v38-ablation.ts`, `measure-v38-transplant.ts`, `measure-v38-corrections-tuned.ts`, `measure-v38-smoothing.ts`. Nieuw onder `test-fixtures/`: zeven `casus1_v38_*.json` met de armen, hun volle vector en hun geleverde netlists. `CLAUDE.md` documenteert de commando's en de bank-kalibratie. Het levende corpus, de golden refs en elke test zijn onaangeraakt.

  **Openstaand in deze casus:** groundplane-metingen onder het onderste kruisgebied vóór onderdelenbestelling; HD-sweep; 30°-meting tweeter voor M-G-compleetheid; verzadigings-/formaatcheck grote P-core shunt-spoel.

- V38-fix (28-08-2026 — **BREAKING, alleen v2-runs**: de zoekmaat gladt niet langer vóór de sommatie) — opgeworpen als eigen opdracht uit V38, beslislijst A.

  **DE OPDRACHT.** V38 mat en besliste niets. Deze sessie repareert precies één ding: op de v2-route stelt de kandidaat `errorSmoothOct` expliciet, en de waarde is wat de inventarisatie als de juiste reparatie mat. De default van de tuner is onaangeraakt, `smoothMag` is onaangeraakt, en met de vlag uit is de app byte-identiek.

  ---

  **INVENTARISATIE 1 — WAAR GLADT `smoothMag`, EN WIE LEEST DEZE SLEUTEL NOG MEER?**

  `netOptimizer.ts:1852–1864`. Per DRIVER, vóór de decimatie naar het binnenste raster, en dus vóór de complexe sommatie: `optW`, `optT`, `optM` en élke hoekenset gaan er doorheen. De fase blijft ongemoeid — de code zegt dat zelf, en dat is geen nalatigheid maar de definitie van de sleutel. De tweede lezer staat in hetzelfde bestand op regel 4390 en is uitsluitend RAPPORTAGE: `ripplePeakSmoothedDb`, de piek zoals de zoektocht hem zag, afgedrukt naast de rauwe.

  Buiten de tuner zijn er drie soorten lezers, en één ervan is een echte tweede zoektocht:

| lezer | wat hij ermee doet | raakt de v2-driewegroute? |
|---|---|---|
| `vfOptimizer.ts:424` | dezelfde constructie, in de VIRTUELE-FILTER-ontwerpstap: per driver gegladd, fase ongemoeid, daarna gesommeerd | **nee.** Hij hangt aan `designChain` (de tweewegroute). `threeWayChain` gebruikt hem niet; de driewegontwerpstap is `designThreeWay` + `synthesize` en die gladden nergens. |
| `designChain.ts:163, 315` en `threeWayChain.ts:381` | doorgeefluiken uit `Chain3Settings` naar tuner en ontwerpstap | ja — en dit is precies het pad dat de hook van de kandidaat overschrijft (hij wordt LAATST gemerged). |
| `App.tsx:5583` + `smoothingConsistency.ts` | de voorkeur van de ontwerper en F3c's zichtbaarheidsregel ernaast | zie hieronder. |

  **Dat de tweeweg-ONTWERPSTAP buiten deze reparatie valt is een besluit en geen vergetelheid.** De verklaring van de kandidaat dekt `NetOptimizeOptions`; de ontwerpstap leest `ChainSettings`, en dat is exact het dekkingsgat dat V38 als beslispunt D optekende — A3j's toetsbaarheid houdt één laag te laag op. Op de tweewegroute meet de waardetuner sinds V38-fix ongegladd terwijl de virtuele-filterstap ervóór nog gladt. Gemeld in plaats van stilzwijgend meegenomen: V39-familie.

  ---

  **INVENTARISATIE 2 — WAT KOST `errorSmoothOct: 0` IN ZOEKGEDRAG?**

  Eén kandidaat, twee armen, alles verder gelijk (`test-fixtures/casus1_v38_gladding.json`):

| kandidaat | gladding | evaluaties | wandkloktijd | onderdelen | RMS geleverd |
| --- | --- | --- | --- | --- | --- |
| 396,7 · 1719 | 1/12 okt | 170 540 | 279 s | 18 | 3,22 |
| 396,7 · 1719 | uit | **104 440** | **169 s** | 16 | **1,83** |
| 396,7 · 2283,5 | 1/12 okt | 93 336 | 157 s | 16 | 2,08 |
| 396,7 · 2283,5 | uit | 104 963 | 169 s | 17 | **1,53** |

  Op de ablatiereeks van V38 was hetzelfde te zien op HUIDIG's topologie: 478 s ongegladd tegen 891 s gegladd. **Het evaluatiebudget beweegt beide kanten op** (−39 % en +12 %) en de wandkloktijd volgt het; er is dus geen aanwijzing dat de ongegladde maat de zoektocht duurder maakt, en ook geen bewijs dat zij hem structureel goedkoper maakt. Wat er wél staat: op geen enkele arm is hij duurder dan de gegladde arm van dezelfde kandidaat met meer dan 12 %.

  **DE CONVERGENTIEMETING, HERHAALD OP DE NIEUWE MAAT.** V38 leidde uit vier zaden 12 dB uiteen af dat de zoektocht niet de beperking is: zij landden allemaal op 2,7–3,1 dB, spreiding 0,44 dB. Die uitspraak is gedaan op de maat die deze sessie vervangt, dus zij moest opnieuw. Zelfde topologie (HUIDIG), zelfde kooi, zelfde zaden, alleen `errorSmoothOct: 0` (`V38_ERRSMOOTH=0 npx vite-node scripts/measure-v38-transplant.ts`):

| zaad | RMS zaad | geleverd GEGLADD (V38) | geleverd ONGEGLADD (V38-fix) | wandkloktijd ongegladd |
| --- | --- | --- | --- | --- |
| HUIDIG, bevroren (geen tune) | 0,60 | — | — | — |
| warm (HUIDIG zelf) | 0,60 | 2,98 | **0,53** | 478 s |
| koud (midden van de doos) | 4,00 | 3,02 | **0,53** | 561 s |
| koud-1 (log-uniform) | 12,72 | 3,13 | **0,55** | 327 s |
| koud-2 (log-uniform) | 3,90 | 2,69 | 0,90 | 505 s |
| **spreiding** | | **0,44 dB** | **0,37 dB** | |

  **De convergentie is niet verslechterd, en dat is de vraag die gesteld moest worden.** Vier zaden die 12 dB uiteen liggen landen op 0,53 / 0,53 / 0,55 / 0,90 dB; de spreiding is 0,37 dB tegen 0,44 op de oude maat. Drie van de vier komen ónder HUIDIG's eigen 0,60 uit. De vierde niet — koud-2 landt op 0,90 — en dat wordt hier gemeld in plaats van weggelaten: de ongegladde maat is niet immuun voor een ongelukkige start, hij is alleen niet slechter dan de gegladde en hij landt twee decibel lager. In de eenheden van de tuner is dezelfde arm de enige die op een andere bronweerstand uitkomt (2,71 Ω tegen 5,01–5,60 Ω), dus het is een ander lokaal minimum en geen vastloper.

  ---

  **INVENTARISATIE 3 — IS 0 DE JUISTE REPARATIE, OF GLADDEN-NÁ-SOMMATIE? EN DE CORRECTIE OP V38's MECHANISME.**

  De vraag moest met een meting beantwoord worden, en de meting gaf een ander antwoord dan de vraag veronderstelde. **De 43–47 dB die V38 optekende komt NIET van de ontkoppeling van magnitude en fase.**

  Drie krommen op hetzelfde netwerk, per bevroren netlist, zonder één tune (`scripts/measure-v38fix-search-measure.ts`, 80 netlists):

  - **ruw** — de echte complexe som. Wat élk oordeel leest en wat 0 meet.
  - **ná som** — diezelfde som, daarna gegladd. De ongebouwde variant; hier bestaat per constructie geen ontkoppeling.
  - **vóór som** — de som van gegladde magnitudes met ongemoeide fase. Wat de zoektocht tot nu toe las.

| grootheid | ruw | ná som | vóór som |
| --- | --- | --- | --- |
| rimpelpiek, over het corpus | 1,36 – 7,40 dB | 43,59 – 49,86 dB | 43,59 – 49,87 dB |
| amplitudeterm (spreiding om het bandgemiddelde) | 0,60 – 3,81 dB | 9,59 – 10,93 dB | 9,60 – 10,93 dB |
| verschil vóór/ná sommatie (= de ontkoppeling) | — | — | **0,000 – 0,298 dB** |

  **Gladden ná de sommatie repareert dus niets.** De ontkoppeling bestaat en is meetbaar, maar zij draagt op élke bevroren netlist hoogstens **6 %** van de echte rimpelpiek.

  **WAT DE 43 dB WEL DRAAGT: DE STILLE GEEST OVER DE BANDRAND.** Het ketenraster loopt van 200 tot 20 000 Hz; de gemeten uitgestrektheid van alle drie de wegen houdt op bij 19 053,6 Hz. Het laatste rasterpunt is daardoor de stille geest van de app: −400 dB, "hier is niet gemeten". Dat punt ligt **buiten** de beoordeelde band (397–19 500 Hz), dus geen enkel oordeel raakt het aan. Een gladdingskern van 1/12 octaaf reikt er wél overheen, en zij trekt het laatste punt *binnen* de band van 130,95 dB naar **43,67 dB**. Eén rasterpunt draagt de hele bevinding — en het zit óók in de som, wat verklaart waarom de volgorde van gladden en sommeren er niets aan verandert.

  **Elke breedte boven nul reikt over dezelfde rand.** Daarmee is de keuze geen afweging meer: 0 is de reparatie, en de variant "gladden ná de sommatie" is een genoteerde mogelijkheid gebleven in plaats van een bouwopdracht — zij is gemeten en zij lost het niet op.

  **EN DE OFFSET IS GEEN OFFSET.** Trok de gladding er een constante bij op, dan zou de zoektocht nog steeds de goede kant op lopen. Zij COMPRIMEERT: de echte spreiding loopt over dit corpus van 0,60 tot 3,81 dB, een factor **6,40**, en de zoekmaat leest 9,60 tot 10,93, een factor **1,14**. Gevolg, en dit is de scherpste vorm van de bevinding: **het ontwerp dat het oordeel het slechtste van het corpus vindt (`V37_KAND_10`, 3,81 dB) staat op de zoekmaat 16e van 80.** HUIDIG, het beste, staat 5e. De maat waarop gezocht wordt kan de beste ontwerpen niet van de slechtste onderscheiden. Twee rijen naast elkaar zeggen het in één oogopslag:

| netlist | wat het OORDEEL leest | wat de ZOEKTOCHT las |
| --- | --- | --- |
| HUIDIG (het beste ontwerp van het corpus) | **0,60 dB** | 9,78 dB |
| `V37_KAND_10` (het slechtste) | **3,81 dB** | 10,19 dB |

  Een verschil van 3,2 dB dat als 0,4 dB aankomt.

  ---

  **WAT ER GEBOUWD IS — één sleutel, drie regels code, en een herclassificatie.**

  `errorSmoothOct` verhuist van POLISH naar CHOICE (`choices.ts`), en `declareCandidateChoices` stelt hem ONVOORWAARDELIJK op `SEARCH_SMOOTHING_OCTAVES` = 0. Dat is de tweede onvoorwaardelijke afleiding in die module, naast V37's, en om dezelfde reden: de vraag is niet voorwaardelijk. Elke kandidaat wordt op de amplitude van zijn complexe som beoordeeld, dus elke kandidaat moet zeggen waarvan zijn zoektocht de spreiding minimaliseert.

  **NUL IS GEEN CASUS-1-GETAL** (P6), en dat verschil is de reden dat de constante bij `WINDOW_SMOOTHING_OCTAVES` in `constants.ts` staat en niet in een fixture: het is "meet de kromme die beoordeeld wordt". Een expliciete breedte wint nog steeds van de afleiding, zodat de vóór/ná een run is die je kunt vrágen.

  **DE HERCLASSIFICATIE IS DE ENIGE IN DE A3j-TABEL.** De reden waarom hij polish werd is nog steeds letterlijk juist; wat eruit werd afgeleid — dat een resolutieknop niet kan bepalen wélk netwerk wint — is gemeten en weerlegd. Zie de gedateerde correctie op rij 11 van de V26-bijlage, met daarnaast de andere polish-sleutels nagelopen op dezelfde aanname: `onStage` en `onGateEvaluated` kunnen structureel geen uitkomst verplaatsen (ze geven `void` terug en de engine leest nooit een teruggave), en **`maxIterations` is de enige echte overlevende** — hij bepaalt waar de zoektocht stopt, niemand stelt hem op de v2-route tenzij een determinismebudget dat doet, en niemand heeft ooit gemeten wat hij kost. V39-familie, gemeld en niet omgezet: de les van rij 11 is nu juist dat een classificatie verandert wanneer een MÉTING haar verandert.

  **DE F3c-ZICHTBAARHEIDSREGEL IS MEEVERHUISD.** Zij drukte de voorkeur van de ontwerper af ("de tuner zoekt op 1/12 octaaf") en dat zou na deze wijziging een getal zijn dat de v2-run niet gebruikt — precies de stille onenigheid waarvoor die regel bestaat. Zij leest nu de breedte waarop de RUN zoekt. Eén geval overdrijft en het staat er met naam: valt de kandidaatgenerator terug op de v1-generator omdat er geen A5d.3-venster afgeleid kon worden, dan reist er geen verklaring mee en zoekt de run tóch op de voorkeur. Die terugval meldt zichzelf luid in de runnotities op het moment dat hij gebeurt.

  ---

  **DE VÓÓR/NÁ OP HET HELE VELD.**

  Vijftien kandidaten, `'safety'` als barrièrebron, zelfde seed, zelfde poorten en budgetten (`compare-corpora.ts v37 live`). Beide fasematen staan er als APARTE kolommen, met naam: het rapport oordeelt één octaaf rond het kruispunt geknipt op meetgeldigheid, de tuner leest `pairPhaseDeg`. Op de bestanden bewegen zij dezelfde kant op; dat zij op HUIDIG's GETUNDE netwerk tegengesteld bewegen is V40 en staat hieronder.

| kandidaat (W-M · M-T) | min \|Z\| vóór | min \|Z\| ná | @ Hz ná | vloer vóór → ná | SPL ± vóór → ná | RMS vóór → ná | W-M fase RAPPORT vóór → ná | W-M fase TUNER vóór → ná | M-T fase RAPPORT vóór → ná | M-T fase TUNER vóór → ná | dissipatie % vóór → ná | grootste R (W) vóór → ná | EPDR vóór → ná | Q_es× vóór → ná | smalste piek ná (dB @ Hz) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 396.7 · 1294 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — |
| 396.7 · 1491.4 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — |
| 396.7 · 1719 | 2.56 | 2.56 | 1008.60 | **ja** → **ja** | 3.67 → 3.87 | 1.76 → 1.92 | 16.74 → 9.95 | 16.73 → 15.78 | 26.31 → 29.56 | 22.55 → 26.50 | 0.93 → 1.54 | 0.70 → 1.19 | 1.28 → 1.28 | 1.00 → 1.00 | — |
| 396.7 · 1981.2 | — | 2.57 | 83.31 | — → **ja** | — → 4.07 | — → 2.01 | — → 23.20 | — → 20.72 | — → 11.64 | — → 13.24 | — → 2.03 | — → 1.26 | — → 1.29 | — → 1.00 | — |
| 396.7 · 2283.5 | 2.56 | 2.57 | 1174.51 | **ja** → **ja** | 3.42 → 3.37 | 1.75 → 1.77 | 20.51 → 22.40 | 17.94 → 15.99 | 22.41 → 21.91 | 15.89 → 17.29 | 0.86 → 0.99 | 0.66 → 0.74 | 1.28 → 1.29 | 1.00 → 1.00 | — |
| 466.5 · 1294 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — |
| 466.5 · 1491.4 | — | 2.59 | 132.19 | — → **ja** | — → 3.94 | — → 1.81 | — → 17.83 | — → 59.15 | — → 11.72 | — → 10.72 | — → 28.25 | — → 18.30 | — → 1.29 | — → 1.39 | — |
| 466.5 · 1719 | 2.61 | 2.59 | 404.48 | **ja** → **ja** | 3.86 → 2.83 | 1.88 → 1.91 | 14.42 → 18.90 | 13.96 → 15.09 | 31.81 → 31.34 | 28.28 → 26.59 | 35.75 → 22.36 | 29.12 → 18.86 | 1.30 → 1.34 | 1.91 → 1.50 | — |
| 466.5 · 1981.2 | 2.61 | 2.61 | 1146.89 | **ja** → **ja** | 3.93 → 3.56 | 2.05 → 1.92 | 16.33 → 13.47 | 15.23 → 9.75 | 30.75 → 30.81 | 24.26 → 28.43 | 31.46 → 35.50 | 20.76 → 27.83 | 1.31 → 1.31 | 1.47 → 1.96 | — |
| 466.5 · 2283.5 | 2.60 | 2.56 | 414.22 | **ja** → **ja** | 3.25 → 2.56 | 1.80 → 1.69 | 17.33 → 16.81 | 15.07 → 11.84 | 26.47 → 26.99 | 21.50 → 23.21 | 22.80 → 32.92 | 17.98 → 30.23 | 1.30 → 1.39 | 1.46 → 2.06 | — |
| 548.5 · 1294 | 2.59 | geen netlist | — | **ja** → — | 4.43 → geen netlist | 2.14 → geen netlist | 14.20 → geen netlist | 17.87 → geen netlist | 33.36 → geen netlist | 29.05 → geen netlist | 33.38 → geen netlist | 14.92 → geen netlist | 1.31 → geen netlist | 1.34 → geen netlist | — |
| 548.5 · 1491.4 | 3.53 | geen netlist | — | **ja** → — | 5.47 → geen netlist | 3.83 → geen netlist | 81.39 → geen netlist | 65.74 → geen netlist | 114.03 → geen netlist | 97.71 → geen netlist | 26.27 → geen netlist | 16.38 → geen netlist | 1.77 → geen netlist | 1.45 → geen netlist | — |
| 548.5 · 1719 | 2.57 | 2.60 | 980.21 | **ja** → **ja** | 4.16 → 4.01 | 1.77 → 2.08 | 29.87 → 36.55 | 61.31 → 52.05 | 8.11 → 15.99 | 3.63 → 11.92 | 20.99 → 25.03 | 14.21 → 19.60 | 1.30 → 1.31 | 1.28 → 1.43 | — |
| 548.5 · 1981.2 | 2.58 | 2.58 | 428.25 | **ja** → **ja** | 3.65 → 2.68 | 1.92 → 1.75 | 42.40 → 20.27 | 47.44 → 14.05 | 19.92 → 26.41 | 13.33 → 21.26 | 22.42 → 33.77 | 17.01 → 30.36 | 1.30 → 1.39 | 1.35 → 2.03 | — |
| 548.5 · 2283.5 | 2.59 | 2.59 | 424.19 | **ja** → **ja** | 3.85 → 2.56 | 1.88 → 1.68 | 46.87 → 20.54 | 48.91 → 12.13 | 5.47 → 26.08 | 5.21 → 23.49 | 27.42 → 34.44 | 19.80 → 31.73 | 1.30 → 1.38 | 1.45 → 2.14 | — |

  **De corpusgemiddelden, en zij zijn eerlijker dan de beste rij:**

| grootheid | V37-corpus | levend corpus | |
| --- | --- | --- | --- |
| RMS-vlakheid, gemiddeld | 2,08 dB | **1,85 dB** | −0,23 |
| RMS-vlakheid, bereik | 1,75 – 3,83 | **1,68 – 2,08** | de uitschieter is weg |
| SPL-venster ±, gemiddeld | 3,97 dB | **3,35 dB** | −0,62 |
| W-M fase, RAPPORT | 30,0° | **20,0°** | −10,0 |
| W-M fase, TUNER | 32,0° | **22,7°** | −9,3 |
| M-T fase, RAPPORT | 31,9° | **23,2°** | −8,7 |
| M-T fase, TUNER | 26,1° | **20,3°** | −5,8 |
| dissipatie (M-A), gemiddeld | 22,2 % | 21,7 % | een kolom, geen oordeel (P4) |
| haalt de gestelde vloer | 10 van 10 | 10 van 10 | |
| kandidaten zonder netwerk | 4 van 15 | **3 van 15** | alle drie door M-B/\|Z\| |

  **HET VELD IS BETER GEWORDEN OP ELKE AS DIE HET WEEGT, MAAR MINDER DAN DE BANK VOORSPELDE, en dat verschil is niet vaag.** De verwachting bij aanvang was een veld richting 1,5–1,8 dB; gemeten is 1,68–2,08 met een gemiddelde van 1,85. De reden staat al in V38: de MEETBANK is zwakker dan de volle route — zij draait zonder `staged` en zonder `branchTargets`, en op `396,7 · 1719` levert zij 3,22 dB waar de route 1,76 levert. Wat op de bank 1,39 dB winst was, is op de route 0,07 tot 0,23 dB, want de route zat daar al veel dichter bij haar eigen bodem. De winst is dus echt en klein op RMS, en groot op FASE — tien graden op de W-M-koppeling, op beide matens tegelijk.

  **WAT ER OOK VERANDERT, en het is de eerlijkste rij van de tabel:** twee kandidaten vallen uit de shortlist (`548,5 · 1294` en `548,5 · 1491,4`) en twee komen erin (`396,7 · 1981,2` en `466,5 · 1491,4`). De uitvaller `548,5 · 1491,4` is precies de netlist die het V37-corpus met 3,83 dB als slechtste droeg — het ontwerp waarvan de zoekmaat niet kon zien dat het slecht was. Het veld verliest zijn uitschieter niet doordat een poort hem weigert maar doordat de spreiding hem niet meer selecteert.

  ---

  **WAT ER NIET GEREPAREERD IS, en het staat hier omdat het anders onzichtbaar is.**

  1. **De v1-route leest de gegladde maat nog steeds.** Dit is geen eigenschap van casus 1 maar van `smoothDbGaussian` op een raster met dode punten, en die dode punten zijn de STILLE-GEEST-conventie van de app zelf: op een drieweg-unieraster draagt elke tak stilte buiten zijn eigen gemeten uitgestrektheid (`designSolve`, hier herhaald door de ketenfixture). Elk project waarvan het analyseraster voorbij die uitgestrektheid loopt heeft dezelfde geest op dezelfde plek. De opdracht was expliciet — geen wijziging aan `smoothMag` of aan enige andere gladding — en er is er geen gedaan. **Open.**
  2. **`WINDOW_SMOOTHING_OCTAVES` blijft 1/6** (A5e.1) — dat is het OORDEEL en niet de zoekmaat, en de opdracht sloot het uit. **Maar de reden dat hij er niet door geraakt wordt is NIET zijn breedte en niet zijn volgorde, en dat is nagegaan in plaats van aangenomen:** `judgeResponse` gladt óók over het volle raster en leest daarna alleen binnen de band, precies de constructie die hierboven 43 dB oplevert. Hij ontsnapt omdat zijn RASTER geen dood punt draagt — de acceptatie meet op het rapportraster (band tot 19 999,5 Hz) en niet op het ketenraster met zijn geest op 20 000. Gemeten: HUIDIG leest daar ±1,34 dB. De naad tussen zoeken en oordelen is dus breder dan V38 hem beschreef: zij verschillen niet alleen in breedte maar in RASTER, en de tweede helft daarvan is nieuw. **Open**, en het is precies de vorm van bevinding die dit project met een eigen sessie afhandelt.
  3. **De fasematen zijn niet aangeraakt** — dat is V40, en op de ongegladde maat wordt het gat tussen tuner en rapport niet kleiner maar groter (tuner 11,00°, rapport 53,09° op W-M, tegen 9,65° en 47,68° gegladd). De reparatie van de zoekmaat neemt die tegenspraak dus niet weg.

- V42 (29-08-2026 — **BREAKING, alleen v2-runs**: het LF-bult-budget wordt een gestelde eis, en de inversie plafonneert de SOM) — opgeworpen als eigen opdracht. **Een negatief resultaat, en het staat hier voluit omdat juist die verdwijnen.**

  **DE OPDRACHT.** Sander stelt `lf_bult_budget_dB: 2,5` — het maximale extra niveau dat het elektrische filter rond de bovenste reflexpiek mag opslingeren. Daarmee zou de opslingering ophouden een eigenschap van de uitkomst te zijn en een grens in de zoektocht worden. De inversie zelf en de metriek zijn niet aangeraakt; wat V42 verandert is de INVOER (een gesteld budget) en de VERTALING (som in plaats van per component).

  ---

  **INVENTARISATIE 1 — PER SPOEL OF OVER DE SOM? Per spoel, en de code wist het.**

  `bounds.ts`, de tak `'bump-series-l'`: hij schreef alleen `valueCeilings`, één plafond per spoel, en duwde er een notitie bij die het hardop zei — *"the inversion is exact for one; with several in series the total is what the metric sees, and the gate remains the authority."* Dat was een accurate beschrijving van een gat. `maxSeriesInductanceFromBump` lost op voor de TOTALE seriereactantie die de driver ziet (`jωL` in één term), dus een keten die over twee spoelen verdeeld is werd door een per-component-box op 2 × maxSI begrensd. Op casus 1 is dat niet de uitzondering maar de regel:

  | netlist | spoelen op de wooferweg | totaal |
  |---|---|---|
  | HUIDIG | 3,00 | 3,00 mH |
  | V41_KAND_1 | 5,39 + 1,95 | **7,34 mH** |
  | zes andere V41-netlists | twee spoelen elk | 4,15 – 6,60 mH |
  | V41_KAND_3 | 2,29 | 2,29 mH |
  | klasse-A-inversie bij 0,5 Ω | | **2,43 mH** |

  Zeven van de acht droegen er twee. **Dat is dus de reparatie van deze sessie**, in de vorm die `qes-series-r` sinds F2 draagt: dezelfde opgeloste `maxSI`, gearchiveerd als som over de vrije seriespoelen van de weg, met de GESLOTEN spoelen eerst van het budget afgetrokken — een vergrendelde spoel is reactantie die de driver ziet en die de tuner niet kan verplaatsen, precies zoals de DCR van een spoel in de weerstandstak. Het per-component-plafond blijft ernaast staan als de noodzakelijke voorwaarde. Invoer en vertaling; geen formule aangeraakt.

  **De eenheden zijn nagegaan vóórdat de projectie vertrouwd werd.** `valueSumCeilings` werd tot nu toe alleen door `qes-series-r` gebruikt, en R heeft SI-factor 1 — een mH/H-verwisseling zou daar nooit zijn opgevallen. `crossoverToNetlist` schrijft `value: mH * 1e-3`, dus `free[i].value` en `maxSI` staan allebei in henry en `projectSums` klopt voor spoelen.

  **INVENTARISATIE 2 — DE INVOER IS METING EN NERGENS KETENRASTER.** Nabije veld op zijn eigen raster met zijn eigen geldigheid (`nearFieldByModel`), impedantie als de GEMETEN sweep op zijn eigen raster (`impedanceByModel`, en F4b2 liet die oversteken juist zodat het ketenraster niet gesubstitueerd kon worden), `fPeakHz` uit de resonantieclassificatie. De ketenrasterfamilie zit er nergens meer in.

  **INVENTARISATIE 3 — DEZELFDE GROOTHEID.** `lfBump().extraDb` is `loaded − bare`: de grootste opslingering die de elektrische overdracht bovenop de kale driver legt, in de band afgeleid uit f_p en genormaliseerd op de referentiefrequentie. Dat is precies waarin het budget is uitgedrukt, dus de vóór/ná-kolom en de eis delen hun eenheid.

  ---

  **DE EIS IS STRENGER DAN HET EIGEN REFERENTIEFILTER VAN DE ONTWERPER, en dat is vóór de run gemeten.**

  | netlist | LF-bult |
  |---|---|
  | HUIDIG | **3,78 dB** |
  | KAND_A | **4,30 dB** |
  | KAND_B | **3,36 dB** |
  | gesteld budget | 2,5 dB |

  Bij de versterkervloer haalt HUIDIG de eis met marge, en dát is het bewijs dat de eis geen bouwbaar ontwerp uitsluit. Hier is dat bewijs er niet: alle drie de v1-baselines overschrijden het budget. Het bewijs dat de eis haalbaar IS komt van het V28-corpus, dat op dezelfde drivers netlists van 1,49–1,84 dB draagt. Beide feiten staan nu in het manifest naast het getal, en `frozenNetlistGates.test.ts` assert ze allebei — bereikbaar én niet vacuüm.

  ---

  **DE VÓÓR/NÁ OP HET HELE VELD.** Vijftien kandidaten, `'safety'` als barrièrebron, zelfde seed, zelfde poorten (`compare-corpora.ts v41 live`). De laatste twee kolommen zijn de doelgrootheid en de knop die haar zou moeten sturen.
  | kandidaat (W-M · M-T) | min \|Z\| vóór | min \|Z\| ná | @ Hz ná | vloer vóór → ná | SPL ± vóór → ná | RMS vóór → ná | W-M fase RAPPORT vóór → ná | W-M fase TUNER vóór → ná | M-T fase RAPPORT vóór → ná | M-T fase TUNER vóór → ná | dissipatie % vóór → ná | grootste R (W) vóór → ná | EPDR vóór → ná | Q_es× vóór → ná | smalste piek ná (dB @ Hz) | correctiegroepen vóór → ná | LF-bult dB vóór → ná | serie-L mH vóór → ná |
  |---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
  | 396.7 · 1294 | 3.50 | **verworpen** | — | **ja** → — | 0.93 → **verworpen** | 0.54 → **verworpen** | 3.79 → **verworpen** | 2.25 → **verworpen** | 5.88 → **verworpen** | 4.92 → **verworpen** | 47.43 → **verworpen** | 27.81 → **verworpen** | 1.81 → **verworpen** | 1.59 → **verworpen** | — | shunt-shelf×1 series-pad×2 → **verworpen** | 5.98 → **verworpen** | 6.33 → **verworpen** |
  | 396.7 · 1491.4 | 3.40 | **verworpen** | — | **ja** → — | 0.84 → **verworpen** | 0.49 → **verworpen** | 3.93 → **verworpen** | 2.99 → **verworpen** | 5.46 → **verworpen** | 4.57 → **verworpen** | 52.31 → **verworpen** | 23.62 → **verworpen** | 1.73 → **verworpen** | 1.56 → **verworpen** | — | damped-trap×1 series-pad×2 shunt-pad×1 → **verworpen** | 6.10 → **verworpen** | 6.35 → **verworpen** |
  | 396.7 · 1719 | 2.64 | **verworpen** | — | **ja** → — | 3.83 → **verworpen** | 1.82 → **verworpen** | 14.03 → **verworpen** | 17.46 → **verworpen** | 22.51 → **verworpen** | 17.52 → **verworpen** | 27.91 → **verworpen** | 11.43 → **verworpen** | 1.34 → **verworpen** | 1.33 → **verworpen** | — | damped-trap×2 series-pad×3 shunt-pad×1 → **verworpen** | 3.62 → **verworpen** | 4.23 → **verworpen** |
  | 396.7 · 1981.2 | 3.29 | 3.29 | 72.92 | **ja** → **ja** | 0.78 → 0.78 | 0.48 → 0.48 | 4.55 → 4.55 | 2.14 → 2.14 | 5.67 → 5.67 | 4.78 → 4.78 | 40.27 → 40.27 | 28.18 → 28.18 | 1.67 → 1.67 | 1.33 → 1.33 | — | damped-trap×2 shunt-shelf×1 series-pad×2 → damped-trap×2 shunt-shelf×1 series-pad×2 | 7.93 → 7.93 | 7.34 → 7.34 |
  | 396.7 · 2283.5 | 3.75 | **verworpen** | — | **ja** → — | 1.05 → **verworpen** | 0.53 → **verworpen** | 3.95 → **verworpen** | 2.54 → **verworpen** | 7.52 → **verworpen** | 5.83 → **verworpen** | 43.91 → **verworpen** | 24.64 → **verworpen** | 1.92 → **verworpen** | 1.52 → **verworpen** | — | zobel×1 shunt-shelf×1 series-pad×3 → **verworpen** | 6.56 → **verworpen** | 6.55 → **verworpen** |
  | 466.5 · 1294 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — | — → **verworpen** | — → **verworpen** | — → **verworpen** |
  | 466.5 · 1491.4 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — | — → **verworpen** | — → **verworpen** | — → **verworpen** |
  | 466.5 · 1719 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — | — → **verworpen** | — → **verworpen** | — → **verworpen** |
  | 466.5 · 1981.2 | 2.64 | 2.64 | 10045.66 | **ja** → **ja** | 3.00 → 3.00 | 1.86 → 1.86 | 20.09 → 20.09 | 19.84 → 19.84 | 25.21 → 25.21 | 13.00 → 13.00 | 40.38 → 40.38 | 16.93 → 16.93 | 1.33 → 1.33 | 1.86 → 1.86 | — | damped-trap×2 series-pad×3 shunt-pad×2 → damped-trap×2 series-pad×3 shunt-pad×2 | 4.38 → 4.38 | 4.15 → 4.15 |
  | 466.5 · 2283.5 | 3.64 | 3.64 | 75.75 | **ja** → **ja** | 1.17 → 1.17 | 0.54 → 0.54 | 4.34 → 4.34 | 2.76 → 2.76 | 5.48 → 5.48 | 4.34 → 4.34 | 40.44 → 40.44 | 26.39 → 26.39 | 1.83 → 1.83 | 1.41 → 1.41 | — | shunt-shelf×1 series-pad×2 → shunt-shelf×1 series-pad×2 | 7.17 → 7.17 | 6.60 → 6.60 |
  | 548.5 · 1294 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — | — → **verworpen** | — → **verworpen** | — → **verworpen** |
  | 548.5 · 1491.4 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — | — → **verworpen** | — → **verworpen** | — → **verworpen** |
  | 548.5 · 1719 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — | — → **verworpen** | — → **verworpen** | — → **verworpen** |
  | 548.5 · 1981.2 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — | — → **verworpen** | — → **verworpen** | — → **verworpen** |
  | 548.5 · 2283.5 | 2.99 | 2.99 | 1062.80 | **ja** → **ja** | 0.93 → 0.93 | 0.53 → 0.53 | 6.45 → 6.45 | 5.36 → 5.36 | 4.77 → 4.77 | 3.43 → 3.43 | 63.14 → 63.14 | 33.81 → 33.81 | 1.56 → 1.56 | 2.29 → 2.29 | — | shunt-shelf×1 series-pad×2 shunt-pad×1 → shunt-shelf×1 series-pad×2 shunt-pad×1 | 3.85 → 3.85 | 2.29 → 2.29 |

  | grootheid | V41-corpus | levend corpus | |
  | --- | --- | --- | --- |
  | netlists | 8 | **4** | vier eruit, nul erbij |
  | LF-bult, gemiddeld | 5,7 dB | **5,8 dB** | de doelgrootheid bewoog NIET |
  | boven het gestelde budget | 8 van 8 | **4 van 4** | idem |
  | totale serie-L laagste weg | 5,5 mH | 5,1 mH | |
  | RMS-vlakheid, gemiddeld | 0,85 dB | 0,93 dB | |
  | dissipatie | 44,5 % | 46,1 % | |
  | haalt de vloer | 8 van 8 | 4 van 4 | |

  **EN DE VIER OVERLEVENDEN ZIJN ONDERDEEL VOOR ONDERDEEL IDENTIEK AAN HUN V41-VOORGANGER.** Nagemeten, niet aangenomen: `KAND_V2_1 = V41_KAND_1`, `2 = V41_KAND_3`, `3 = V41_KAND_5`, `4 = V41_KAND_8`, op het `savedAt`-stempel en de naam na. Het gestelde budget heeft dus de helft van het veld verwijderd en geen enkel ontwerp dat overbleef veranderd.

  ---

  **WAAROM — EN DIT IS DE BEVINDING VAN V42.**

  De opslingering hangt niet alleen aan de spoel. De elektrische overdracht is

      H_el(f) = Z(f) / (Z(f) + R_pad + jωL)

  en bij de reflexpiek is |Z| hoog, zodat H_el daar dicht bij 1 blijft, terwijl hij bij de referentiefrequentie — waar |Z| laag is — wegzakt. **SERIEWEERSTAND tilt de piek dus in zijn eentje al op**, en dat is dezelfde natuurkunde als de Q_es-vermenigvuldiging van M-E. Boven ongeveer 1,7 Ω padweerstand is de gestelde 2,5 dB al op vóórdat er één spoel in het pad zit; `maxSeriesInductanceFromBump` geeft dan `null` en er komt GEEN plafond — geen fout, maar het antwoord (V12).

  Gemeten met `scripts/measure-v42-bump-bound.ts`:

  | netlist | pad R | plafond |
  |---|---|---|
  | HUIDIG | 3,76 Ω | **geen grens** |
  | V41_KAND_1 | 1,00 Ω | 1,81 mH |
  | V41_KAND_2 | 1,72 Ω | **geen grens** |
  | V41_KAND_3 | 3,79 Ω | **geen grens** |
  | V41_KAND_4 | 1,59 Ω | **geen grens** |
  | V41_KAND_5 | 1,26 Ω | 1,31 mH |
  | V41_KAND_6 | 1,79 Ω | **geen grens** |
  | V41_KAND_7 | 1,01 Ω | 1,80 mH |
  | V41_KAND_8 | 2,60 Ω | **geen grens** |

  Zes van de negen krijgen geen grens. Daarmee valt het veld uiteen in twee helften, en beide werken tegen de eis:

  - **Waar de inversie GEEN grens oplevert, verandert er niets.** Vier kandidaten kwamen byte-identiek terug — drie die bij V41 al verworpen waren met exact dezelfde getallen, en `396,7 · 1981,2` dat opnieuw 1,18 dB / 3,5° / 3,29 Ω leverde. Het budget is daar inert.
  - **Waar de inversie WEL bond, brak zij de versterkervloer.** Vier kandidaten die bij V41 een netwerk leverden (0,48–0,54 dB RMS, de beste van het hele project) kwamen terug op 1,93 / 2,27 / 2,34 / 2,41 Ω tegen een vloer van 2,60. De seriespoel deed dubbel werk: filteren én de takimpedantie rond het kruispunt omhoog houden. Wie haar wegneemt, verliest het tweede.

  **Dat de padweerstand van de geleverde netlist niet die van het ZAAD is, is nagegaan en verandert de conclusie niet.** De grens wordt tijdens de run opgelost bij de padweerstand van het zaad; het zaad bestaat alleen tijdens de run. Maar de gevolgtrekking staat langs een andere weg vast: `projectSums` schaalt de vrije spoelen ómlaag binnen de doelfunctie zodra hun som het plafond overschrijdt, dus een netlist die 7,34 mH aflevert kán geen actief plafond van 1,81 mH gehad hebben. Byte-identiek + 7,34 mH bewijst dat er geen grens actief was.

  ---

  **WAT DIT BETEKENT VOOR DE EIS, en het is geen reden om het getal op te rekken.**

  Het budget is in de praktijk een grens op de **totale bronimpedantie bij resonantie**, waarvan de spoel één term is en de serieweerstand de andere. Wie hem als spoelplafond leest, leest hem op de helft van de ontwerpen verkeerd. En de twee gestelde eisen van deze casus trekken aan hetzelfde onderdeel: de LF-bult wil de seriespoel kleiner, de versterkervloer wil de takimpedantie hoger.

  **Er is daarom GEEN "elke netlist onder het budget"-assert gebouwd.** Die claim zou een uitzonderingslijst ter grootte van het hele corpus vragen, en dat is de vrijstelling die dit project verbiedt. `frozenNetlistGates.test.ts` assert wat waar is en kán falen: de metriek wordt overal gerapporteerd, de OPGESCHREVEN bevinding klopt nog met een verse meting (per netlist, niet als gemiddelde), de eis is bereikbaar op deze drivers, en zij is niet vacuüm. Het negatieve resultaat is daarmee vastgelegd in plaats van weggetest.

  ---

  **DE LCR-/PARALLEL-R-VRAAG — OPEN, MÉT MEETUITSLAG, EN SCHERPER GESTELD DAN BIJ V38.**

  V38 vroeg of de generator een LCR of een parallelweerstand mag voorstellen. Deze sessie levert de gemeten aanleiding, en zij herformuleert de vraag: **hoe begrens je de bronimpedantie bij resonantie zonder de versterkervloer te breken?** Het antwoord is niet "een kleinere spoel" — dat is precies gemeten en het kost het netwerk. Wat er op tafel ligt en NIET gebouwd is (de opdracht sloot het uit):

  1. een parallelweerstand over de seriespoel, die de bult begrenst zonder de doorlaatband­impedantie weg te nemen;
  2. een LCR-dempingsnetwerk over de driver op f_p, dat de piek zelf verlaagt in plaats van de bron te beperken;
  3. de eis uitdrukken als een grens op R_pad + jωL samen — één grootheid in plaats van twee, en dan is het een tweede inversie en geen topologievoorstel.

  Sander beslist welke van de drie de generator mag voorstellen. Geen ervan is gebouwd.

  ---

  **V27's PROCESLES, VOOR DE VIERDE KEER — en deze keer ving de suite hem.**

  De acceptatietest bouwde zijn eigen payload met `budgets: {}`. Zodra V42 het budget in de
  GENERATOR wapende, reproduceerde die test dus niet meer de run waarover hij een uitspraak doet:
  hij nam een kandidaat die het verslag als VERWORPEN registreert, draaide hem zonder het budget
  dat hem weigerde, kreeg een netwerk terug en viel om. Precies de vorm die V27 optekende — een
  run-fixture die afwijkt van de route die zij zegt te meten — en die V38 als beslispunt C nog
  eens tegenkwam.

  Het verschil met de vorige drie keer is dat hij nu ZICHTBAAR was: de volle suite ging rood met
  de zin *"the run delivered a network where a refusal was recorded"*. De reparatie is de regel
  die `casus1V2.fixture.ts` bovenaan zelf stelt en die op dit blok nog niet was toegepast: één
  definitie, twee consumenten. `CASUS1_V2_GATES` en `CASUS1_V2_BUDGETS` staan sinds V42 in de
  fixture en worden door het generatiescript én door beide payloads in de acceptatietest gespreid.
  Er is geen derde plek meer waar iemand kan vergeten mee te bewegen.

  ---

  **WAT ER IN DE CODE VERANDERDE.** `bounds.ts`: de `'bump-series-l'`-tak levert een som-plafond met vergrendelde spoelen van het budget af (invoer/vertaling, geen formule). Nieuw: `scripts/measure-v42-bump-bound.ts`. Het manifest draagt `lf_bult_budget_dB` met motivering, invoerpunt en grens, plus de gemeten bult van de drie referentiefilters en het blok `v42_bult_bevinding`. `casus1.fixture.ts` leest het budget (`casus1LfBumpBudgetDb`), `casus1V2.fixture.ts` exporteert het, het generatiescript wapent het en schrijft sinds V42 per kandidaat op of er werkelijk een plafond kwam — dat kanaal had tot nu toe geen lezer, en het lag precies op de claim van deze sessie. `compare-corpora.ts` draagt twee kolommen erbij. `casus1V2.fixture.ts` krijgt `CASUS1_V2_GATES` en `CASUS1_V2_BUDGETS` zodat de gewapende eisen één huis hebben. Tests: `lfBumpBorder.test.ts` (drie V42-claims op het echte 5,39+1,95-geval), `frozenNetlistGates.test.ts` (vier), en `casus1V2Candidates.test.ts` spreidt sindsdien dezelfde blokken.

  **Wat er NIET veranderd is:** de inversieformule, de metriek, en er is geen LCR- of parallel-R-generatie bij. Het budget is niet opgerekt en niet ontwapend.

  **Openstaand in deze casus:** de LCR-/parallel-R-vraag hierboven; de twee posten uit V41 (`audit.fbHz`, het grijze `costWeight`); en verder onveranderd — groundplane-metingen onder het onderste kruisgebied vóór onderdelenbestelling; HD-sweep; 30°-meting tweeter voor M-G-compleetheid; verzadigings-/formaatcheck grote P-core shunt-spoel.

- V41 (28-08-2026 — **BREAKING, alleen v2-runs**: de kandidaat draagt de twee instellingen die de ontwerp- en synthesestap lezen) — opgeworpen als eigen opdracht uit V38, beslislijst B en C.

  **DE OPDRACHT.** V38 mat en besliste niets; V38-fix repareerde beslispunt A. Deze sessie doet B en C: `leanTargetDb` en `eqBands` worden kandidaat-gedragen sleutels op de v2-route, in de vorm van F4c. Alles buiten die twee blijft staan — de fasematen zijn V40 en zijn niet aangeraakt, en er is geen nieuw topologievoorstel bij (beslispunt E blijft open). Met de vlag uit is de app byte-identiek, en elke v1-aanroeper leest wat hij las.

  ---

  **INVENTARISATIE 1 — WIE LEEST `targets.rippleDb`, EN MAG DIE LEZING BEWEGEN?**

  Drie lezers op de driewegroute, en dat is het hele argument voor de vorm die V41 gekozen heeft:

| lezer | wat hij ermee doet | mag hij bewegen? |
|---|---|---|
| `threeWayChain.ts:348` → `synthesize({ leanTargetDb })` | de drempel waaronder de kale ladder "goed genoeg" heet en er géén Zobel, Fs-val of top-octaaf-hold gekocht wordt | **ja** — dit is wat V38 mat |
| `threeWayChain.ts:423` → `staged` | het STOPDOEL van de trapmethode in de tuner: waar de snoeipas en de escalatie mogen ophouden | **nee**, dat is een oordeel |
| `threeWayChain.ts:1087` → `rankChain3Results` | de "doelen gehaald"-toets van de v1-rangschikking | **nee**, dat is een oordeel |

  Vandaar een APARTE sleutel en niet een ander getal in `targets`: het getal verplaatsen zou alle drie verplaatsen. `Chain3Settings.leanTargetDb` is nieuw, en ongesteld is de identiteit — `s.leanTargetDb ?? s.targets?.rippleDb`, wat élke v1-aanroeper byte-identiek houdt. De eigen standaard van `synthesize` is 0,5 dB en heeft sinds V41 één huis (`SYNTHESIS_LEAN_DEFAULT_DB` in `synthesis.ts`), omdat de kandidaat hem nu ook noemt.

  **INVENTARISATIE 2 — WAAR KOMT `eqBands` DE DRIEWEGROUTE BINNEN?**

  `App.tsx` → `Chain3Settings.eqBands` → `designThreeWay({ eqBandsPerBranch })` → `deriveTopology`. Eén weg, één lezer, en géén poort of oordeel die hem ook leest — dus hier hoefde niets uit elkaar gehaald te worden. De app stelt 2 (`vfEqBands`); de v2-fixture stelde niets, en `input.eqBandsPerBranch ?? 0` maakt daar een stille NUL van. Ook dit getal heeft sinds V41 één huis (`DEFAULT_EQ_BANDS_PER_DRIVER` in `vfOptimizer.ts`, waar de eigen standaard van de gulzige ontwerpstap al stond) en de `useState` in de app leest hetzelfde huis.

  ---

  **INVENTARISATIE 3 — DE FIXTURE TEGEN DE APP-ROUTE, VELD VOOR VELD.**

  De F4b-les luidt dat een run-fixture die met een vergelijking als doel gebouwd is de instellingen van de APP draait en niet een minimale set (V27 schreef hem op, V38 schond hem voor de derde keer). Dus is `CASUS1_V2_SETTINGS` deze sessie veld voor veld tegen het `settings`-blok van `App.tsx` gelegd. Wat eruit kwam, volledig — ook wat NIET omgezet is, want een lijst die alleen de gerepareerde regels noemt leest als een lijst zonder rest:

| veld | app-route | fixture | oordeel |
|---|---|---|---|
| `eqBands` | 2 | **afwezig ⇒ stil nul** | **omgezet (V41)** |
| lean-drempel | — (bestond niet als sleutel) | afgeleid uit `targets.rippleDb` = 2,5 | **omgezet (V41)** |
| `costWeight` | **0,015** | **0,0015** | **afwijking, aantoonbaar inert, NIET omgezet** — de tuner leest hem uitsluitend binnen `if (opts.catalogSnap && hasImportedCatalog())` (`netOptimizer.ts:4009`) en deze casus zet `catalogSnap: false`. Maar hij is GRIJS (A3j), en juist een grijze sleutel hoort expliciet en juist gesteld te worden: wat er staat is de legacy-default van de tuner, niet wat de app stuurt. Gemeld, niet stilzwijgend rechtgezet — een tiende van een gewicht veranderen in de sessie die het veld regenereert, maakt de vóór/ná van V41 onleesbaar |
| `audit.fbHz` | de kastafstemming die de ontwerper invult | **afwezig** | **afwijking, NIET inert, NIET omgezet.** Dit is de scherpste vondst van de inventarisatie. `fbHz` is bij de tuner geen decoratie: hij is het ANKER van de bronweerstandsprobe (`netOptimizer.ts:1574`, `sourceProbeIndex(..., opts.audit?.fbHz, ...)`) en hij is de referentiefrequentie van de dissipatieterm (`:1823`, `dissRefHz`). Zonder hem ZOEKT de probe zijn piek, wat precies is wat V34 mat en verankerde. Casus 1 KENT een kastafstemming — `afgeleide_parameters.woofer.fb` = 31,3 Hz — maar dat is een AFGELEID meetfeit en geen ontwerpersinstelling, en het steekt de grens naar de tuner niet over. Dat is de vorm van F4b's lekken, één grootheid verder, en het verdient dezelfde behandeling: een eigen sessie met een vóór/ná, niet een regel die er hier bij geschreven wordt. **Open** |
| `directivityWeight` | 0,25 | 0 | afwijking, aantoonbaar inert: `dW = angleData ? … : 0` en er reist geen `angleData` mee (V38 mat dit al). Niet omgezet |
| `diWeight` | 0,3 | afwezig | GEEN afwijking: `designThreeWay` heeft 0,3 als eigen standaard (`threeWayDesign.ts:240`) |
| `acousticSlopes` | `acousticSlopesValue()` | afwezig | GEEN afwijking: die functie geeft `undefined` terug zolang elke helling op 'auto' staat, wat de eigen standaard van de app is. De kandidaat verklaart hem bovendien expliciet ABSENT met de P4-reden |
| `snapPrefs` | `snapPrefsValue()` | afwezig | inert bij `catalogSnap: false`; ook hier verklaart de kandidaat hem ABSENT |
| `hpFloorHz` | `tweeterHpFloor` (≥ 2·Fs) | afwezig | afwijking, redundant op déze route: de kniegrenzen van de ontwerpstap komen uit de kooi van de kandidaat, en die kooi komt uit A5d.3, dat de Fs-regel al draagt. Niet omgezet |
| `xoLowPin` / `xoHighPin`, `structureLow/High`, `xoFloorPairs` | ontwerperspins en v1-fysicavloeren | de kandidaat | OPZET (F4d, audit §6.3) |
| `rSourceDisqualifyOhm`, `audit.thresholds.rSourceOhm` | 2,0 / 1,0 | afwezig / `null` | OPZET (V34, P4) |
| `errorSmoothOct` | 1/12 | afwezig, kandidaat stelt 0 | OPZET (V38-fix) |
| `phasePriority`, `targets`, `breakupGuard`, `ampTarget`, `phaseMetric`, `powerMetric`, `powerFoldWeight`, `dissipationWeight`, `synthMode`, `catalogSnap`, `ampMinLoadOhm`, `safety` | — | — | gelijk |

  Twee posten blijven dus als OPEN op de lijst staan (`audit.fbHz` en het grijze `costWeight`), en zij staan hier omdat dit de enige plek is waar ze niet onzichtbaar zijn.

  ---

  **WAT ER GEBOUWD IS, EN WAAROM HET EEN TWEEDE LIJST IS.**

  A3j's toetsbaarheid — `CHOICE_KEYS`/`GREY_KEYS`/`POLISH_KEYS`, de volledigheidsassert en
  `choiceKeyGuard.test.ts` — dekt de 44 sleutels van `NetOptimizeOptions` en niets anders. Dat is
  beslispunt D, en V39 bezit het. V41 sluit niet de laag maar de twee sleutels die een MÉTING
  veroordeeld heeft, en `chainChoices.ts` zegt dat zelf hardop: `CHAIN_CHOICE_KEYS` dekt twee
  sleutels van `Chain3Settings` en beweert niets over de andere dertig. Dat is de norm die rij 11
  van de A3j-tabel stelt — een classificatie beweegt wanneer een meting haar beweegt, niet op
  vermoeden. Een lijst die uit voorzorg de hele laag zou claimen, zou precies de les omkeren.

  De vorm is die van V34's `withDeclaredSourceLimit`, één laag breder: `withDeclaredChainChoices`
  herschrijft de ketensettings uit de verklaring van de kandidaat, en **zonder verklaring is hij de
  identiteit**. Dat is wat elke v1-aanroeper en elke v2-payload zonder kandidaat byte-identiek
  houdt. De verklaring is sinds V41 **verplicht** op `V2CandidatePayload`, en dat is de
  compiler-als-guard van F4c: een kandidaatbouwer die haar vergeet compileert niet, in plaats van
  stil terug te vallen op wat de keten toevallig droeg.

  **WAT DE TWEEWEGROUTE NIET KRIJGT, en het is een besluit.** `withDeclaredChainChoices` draait
  alleen op de driewegroute. `ChainSettings` noemt het EQ-budget `eqBandsPerDriver` en leidt zijn
  lean-drempel binnen `designChain.ts` af, dus honoreren zou een tweede afbeelding van twee
  sleutels op een tweede vocabulaire zijn — en de tweewegroute is nog steeds v1 (TODO(F2c)). De
  ketenverklaring REIST er wel en wordt er niet gelezen; de worker zegt dat in zijn notities in
  plaats van een lezer te laten aannemen dat zij toegepast is. Exact dezelfde grens die V38-fix
  trok voor de virtuele-filterstap. **V39-familie.**

  ---

  **DE PRIJS, EN ZIJ IS DE GROOTSTE VAN ALLE V-SESSIES.**

  Een regeneratie van het veld kostte bij V38-fix 42 minuten (116–218 s per kandidaat). Bij V41
  kost zij UREN, en de reden is geen ongeluk maar de ingreep zelf: de synthesestap koopt nu
  correctienetwerken, dus het ZAAD draagt aanzienlijk meer onderdelen, en het iteratiebudget van
  de tuner is `max(700, 140 · vrij)` — superlineair in het aantal vrije waarden. V38 mat het al op
  de bank: op `396,7 · 1719` groeit het zaad van 18 naar 34 onderdelen bij EQ 2 en `lean`, en naar
  38 bij `auto`. Dit is de eerste V-sessie waarin het veld duurder is geworden door wat het BOUWT
  in plaats van door waar het KIJKT.

  ---

  **DE VÓÓR/NÁ OP HET HELE VELD.**

  Vijftien kandidaten, `'safety'` als barrièrebron, zelfde seed, zelfde poorten en budgetten
  (`compare-corpora.ts v38fix live`). Beide fasematen staan er als aparte kolommen (V40), en de
  laatste kolom is nieuw: de CORRECTIEGROEPEN, geteld uit de geleverde netlist.

  | kandidaat (W-M · M-T) | min \|Z\| vóór | min \|Z\| ná | @ Hz ná | vloer vóór → ná | SPL ± vóór → ná | RMS vóór → ná | W-M fase RAPPORT vóór → ná | W-M fase TUNER vóór → ná | M-T fase RAPPORT vóór → ná | M-T fase TUNER vóór → ná | dissipatie % vóór → ná | grootste R (W) vóór → ná | EPDR vóór → ná | Q_es× vóór → ná | smalste piek ná (dB @ Hz) | correctiegroepen vóór → ná |
  |---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
  | 396.7 · 1294 | — | 3.50 | 77.57 | — → **ja** | — → 0.93 | — → 0.54 | — → 3.79 | — → 2.25 | — → 5.88 | — → 4.92 | — → 47.43 | — → 27.81 | — → 1.81 | — → 1.59 | — | — → shunt-shelf×1 series-pad×2 |
  | 396.7 · 1491.4 | — | 3.40 | 853.85 | — → **ja** | — → 0.84 | — → 0.49 | — → 3.93 | — → 2.99 | — → 5.46 | — → 4.57 | — → 52.31 | — → 23.62 | — → 1.73 | — → 1.56 | — | — → damped-trap×1 series-pad×2 shunt-pad×1 |
  | 396.7 · 1719 | 2.56 | 2.64 | 975.55 | **ja** → **ja** | 3.87 → 3.83 | 1.92 → 1.82 | 9.95 → 14.03 | 15.78 → 17.46 | 29.56 → 22.51 | 26.50 → 17.52 | 1.54 → 27.91 | 1.19 → 11.43 | 1.28 → 1.34 | 1.00 → 1.33 | — | series-pad×1 shunt-pad×1 → damped-trap×2 series-pad×3 shunt-pad×1 |
  | 396.7 · 1981.2 | 2.57 | 3.29 | 72.92 | **ja** → **ja** | 4.07 → 0.78 | 2.01 → 0.48 | 23.20 → 4.55 | 20.72 → 2.14 | 11.64 → 5.67 | 13.24 → 4.78 | 2.03 → 40.27 | 1.26 → 28.18 | 1.29 → 1.67 | 1.00 → 1.33 | — | series-pad×1 shunt-pad×1 → damped-trap×2 shunt-shelf×1 series-pad×2 |
  | 396.7 · 2283.5 | 2.57 | 3.75 | 75.03 | **ja** → **ja** | 3.37 → 1.05 | 1.77 → 0.53 | 22.40 → 3.95 | 15.99 → 2.54 | 21.91 → 7.52 | 17.29 → 5.83 | 0.99 → 43.91 | 0.74 → 24.64 | 1.29 → 1.92 | 1.00 → 1.52 | — | series-pad×1 shunt-pad×1 → zobel×1 shunt-shelf×1 series-pad×3 |
  | 466.5 · 1294 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — | — → **verworpen** |
  | 466.5 · 1491.4 | 2.59 | **verworpen** | — | **ja** → — | 3.94 → **verworpen** | 1.81 → **verworpen** | 17.83 → **verworpen** | 59.15 → **verworpen** | 11.72 → **verworpen** | 10.72 → **verworpen** | 28.25 → **verworpen** | 18.30 → **verworpen** | 1.29 → **verworpen** | 1.39 → **verworpen** | — | series-pad×2 shunt-pad×2 → **verworpen** |
  | 466.5 · 1719 | 2.59 | **verworpen** | — | **ja** → — | 2.83 → **verworpen** | 1.91 → **verworpen** | 18.90 → **verworpen** | 15.09 → **verworpen** | 31.34 → **verworpen** | 26.59 → **verworpen** | 22.36 → **verworpen** | 18.86 → **verworpen** | 1.34 → **verworpen** | 1.50 → **verworpen** | — | series-pad×1 shunt-pad×2 → **verworpen** |
  | 466.5 · 1981.2 | 2.61 | 2.64 | 10045.66 | **ja** → **ja** | 3.56 → 3.00 | 1.92 → 1.86 | 13.47 → 20.09 | 9.75 → 19.84 | 30.81 → 25.21 | 28.43 → 13.00 | 35.50 → 40.38 | 27.83 → 16.93 | 1.31 → 1.33 | 1.96 → 1.86 | — | series-pad×2 shunt-pad×2 → damped-trap×2 series-pad×3 shunt-pad×2 |
  | 466.5 · 2283.5 | 2.56 | 3.64 | 75.75 | **ja** → **ja** | 2.56 → 1.17 | 1.69 → 0.54 | 16.81 → 4.34 | 11.84 → 2.76 | 26.99 → 5.48 | 23.21 → 4.34 | 32.92 → 40.44 | 30.23 → 26.39 | 1.39 → 1.83 | 2.06 → 1.41 | — | series-pad×2 shunt-pad×2 → shunt-shelf×1 series-pad×2 |
  | 548.5 · 1294 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — | — → **verworpen** |
  | 548.5 · 1491.4 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — | — → **verworpen** |
  | 548.5 · 1719 | 2.60 | **verworpen** | — | **ja** → — | 4.01 → **verworpen** | 2.08 → **verworpen** | 36.55 → **verworpen** | 52.05 → **verworpen** | 15.99 → **verworpen** | 11.92 → **verworpen** | 25.03 → **verworpen** | 19.60 → **verworpen** | 1.31 → **verworpen** | 1.43 → **verworpen** | — | series-pad×2 shunt-pad×2 → **verworpen** |
  | 548.5 · 1981.2 | 2.58 | **verworpen** | — | **ja** → — | 2.68 → **verworpen** | 1.75 → **verworpen** | 20.27 → **verworpen** | 14.05 → **verworpen** | 26.41 → **verworpen** | 21.26 → **verworpen** | 33.77 → **verworpen** | 30.36 → **verworpen** | 1.39 → **verworpen** | 2.03 → **verworpen** | — | series-pad×1 shunt-pad×2 → **verworpen** |
  | 548.5 · 2283.5 | 2.59 | 2.99 | 1062.80 | **ja** → **ja** | 2.56 → 0.93 | 1.68 → 0.53 | 20.54 → 6.45 | 12.13 → 5.36 | 26.08 → 4.77 | 23.49 → 3.43 | 34.44 → 63.14 | 31.73 → 33.81 | 1.38 → 1.56 | 2.14 → 2.29 | — | series-pad×2 shunt-pad×2 → shunt-shelf×1 series-pad×2 shunt-pad×1 |
  **DE CORPUSGEMIDDELDEN, en zij zijn eerlijker dan de beste rij:**

| grootheid | V38-fix-corpus | levend corpus | |
| --- | --- | --- | --- |
| RMS-vlakheid, gemiddeld | 1,85 dB | **0,85 dB** | −1,00 |
| RMS-vlakheid, bereik | 1,68 – 2,08 | **0,48 – 1,86** | zes van de acht onder 0,55 |
| SPL-venster ±, gemiddeld | 3,35 dB | **1,57 dB** | −1,78 |
| W-M fase, RAPPORT | 20,0° | **7,6°** | −12,4 |
| W-M fase, TUNER | 22,7° | **6,9°** | −15,8 |
| M-T fase, RAPPORT | 23,2° | **10,3°** | −12,9 |
| M-T fase, TUNER | 20,3° | **7,3°** | −13,0 |
| dissipatie (M-A), gemiddeld | 21,7 % | **44,5 %** | +22,8 — de prijs, en casus 1 begrenst hem niet (P4) |
| grootste enkele weerstand | 18,0 W | **24,1 W** | bij 100 W |
| haalt de gestelde vloer | 10 van 10 | **8 van 8** | |
| kandidaten zonder netwerk | 3 van 15 | **7 van 15** | de andere prijs |

  **DE GEKOCHTE GROEPEN — dit IS beslispunt B en C, in één regel.** Het V38-fix-corpus droeg over
  tien netlists NUL vallen, NUL gedempte vallen, NUL Zobels en NUL shunt-shelves; alles wat erin
  stond was niveauwerk. Het levende corpus, over acht netlists:

| rol | vóór | ná |
| --- | --- | --- |
| val (`trap`) | 0 | 0 |
| gedempte val (`damped-trap`) | 0 | **7** |
| Zobel | 0 | **1** |
| shunt-shelf | 0 | **5** |
| serie-niveauweerstand | 15 | 19 |
| shunt-niveauweerstand | 17 | 5 |

  **Het antwoord op "koopt hij de niveauweerstanden vanzelf" is dus: die kocht hij al, en wat hij
  er nu bij koopt is iets anders.** Het niveauwerk stond er vóór V41 ook (15 serie- en 17
  shunt-benen over tien netlists) — de wattenval van V38 wees ze als de grootste post aan en zij
  waren nooit weg. Wat ontbrak zijn de dempende groepen, en die komen er nu: zeven gedempte
  vallen, vijf shunt-shelves en één Zobel. De shunt-benen halveren daarbij bijna, wat past bij
  wat er gebeurt: een L-pad-been dat alleen niveau maakt wordt vervangen door een netwerk dat
  niveau én demping doet.

  **En de kale `trap` blijft NUL.** Dat is de eerlijkste regel van de tabel: de wooferval op de
  gemeten breakup bij 1394 Hz — de groep waar V38 het meest concreet over was — wordt nog steeds
  niet gebouwd. Wat de EQ-band oplevert is een GEDEMPTE val, niet de scherpe. Beslispunt E blijft
  dus open, en met een preciezere formulering dan V38 hem kon geven.

  ---

  **WAT HET GEKOST HEEFT, en het staat hier omdat de winst anders te mooi leest.**

  1. **Het veld is gekrompen: 10 netlists → 8, en 7 van de 15 kandidaten leveren niets** (was 3).
     De vier verliezers stonden alle vier IN het V38-fix-corpus. **Vijf** van de zeven weigeringen
     zijn `M-B/|Z|` (de gestelde vloer) en twee zijn "tweeter protection got worse"; één van de
     zeven (`466,5 · 1294`) was ook vóór V41 al verworpen, de andere zes zijn nieuw. De geweigerde tunes zijn niet marginaal maar catastrofaal — ±71 tot ±76 dB
     SPL-venster, en op `548,5 · 1491,4` een geleverde 0,14 Ω met een gemeten 0,02 Ω. **De
     beschermingen doen precies waarvoor ze bestaan**, en dat is de reden dat dit een gekrompen
     veld is en geen onveilig veld: `safety`, `audit` en de poorten stonden gewapend, zoals V27's
     procesregel eist.
  2. **De dissipatie verdubbelt** (21,7 % → 44,5 %) en de grootste enkele weerstand gaat van 18,0
     naar 24,1 W bij 100 W. Een correctiegroep is een shunt; dat is wat hij kost. Casus 1 stelt
     geen dissipatiegrens (P4), dus dit is een KOLOM en geen oordeel — maar het is de kolom die
     een bouwer als eerste wil zien.
  3. **Een regeneratie kost nu uren in plaats van drie kwartier**: 15 756 s (4 u 23 min) tegen 42
     minuten bij V38-fix, 567–1697 s per kandidaat. Zie hierboven waarom.

  **WAT ER NIET GEBEURD IS: de belastingimpedantie wordt BETER, niet slechter.** Dat was de zorg
  waarmee deze sessie begon — correctiegroepen zijn shunts, en sinds V30 is de vloer een zoekdoel.
  Gemeten: elk van de acht haalt de vloer, en zes van de acht met een ruimere marge dan hun
  voorganger (min |Z| 2,99–3,75 Ω tegen 2,56–2,61 Ω). De twee die niet stijgen zijn precies de
  twee die ook op RMS blijven staan.

  ---

  **DE VERWACHTING TEGEN DE MÉTING, want de opdracht droeg er een.**

  Verwacht was een veld "richting ~1,0–1,4 dB". Gemeten is **0,85 dB gemiddeld**, met zes van de
  acht op 0,48–0,54 — **onder HUIDIG's eigen 0,60 dB**, en dat is het getal waar V38 mee begon.
  Zes gegenereerde ontwerpen zijn op de maat waarop de vraag gesteld werd vlakker dan de
  referentiefilter van de ontwerper. De twee die achterblijven (1,82 en 1,86) zijn precies de twee
  die ook hun belastingimpedantie niet verbeteren.

  **De wattenval van V38 klopt daarmee, en niet op de manier waarop hij gelezen werd.** Die tabel
  zei: HUIDIG gestript van zijn vijf groepen levert 1,86 dB, het corpus stond op 1,75, en het
  verschil van +1,33 dB zit in de groepen — waarvan 0,90 in de twee niveauweerstanden. De
  gevolgtrekking die voor de hand lag is dat het corpus die niveauweerstanden miste. Dat was
  onjuist: het corpus had ze (15 serie- en 17 shunt-benen over tien netlists). Wat het miste zijn
  de DEMPENDE groepen, en die kosten in de ablatie weinig omdat zij bij HUIDIG bovenop een
  topologie liggen die zonder hen al werkt — terwijl zij op een gegenereerd veld het verschil
  maken tussen een tune die de vloer haalt en een die hem mist. Een ablatie meet wat een groep
  BIJDRAAGT aan een bestaand ontwerp; zij meet niet wat zijn afwezigheid een ZOEKTOCHT kost.

  ---

  **EEN VLAKKER VELD BRAK EEN V37-ASSERT, EN DE REPARATIE ZIT IN DE VERGELIJKING EN NIET IN DE
  DREMPEL.**

  `frozenNetlistGates.test.ts` droeg sinds V37 de "vóór"-helft van V36's bevinding: op de
  PIEKHOOGTE haalde de dissipatieterm nooit de uitdagingsdrempel van de tuner (1 %), dus hij was
  gewapend, kostte rekentijd en bewaakte niets. Na de regeneratie stond die assert op **1,22 %**
  en viel om.

  **De oorzaak is niet wat zij lijkt.** De term is niet gegroeid — de grootste piek-term ging van
  0,002819 naar 0,002067. Wat kromp is de NOEMER: de assert deelde door de kleinste RMS die het
  hele casusboek draagt, en V41 duwde die van boven 0,53 naar **0,48**. De assert brak dus door
  het SUCCES van deze sessie.

  Daarmee werd zichtbaar dat de vergelijking zelf niet klopte. Zij legde de term van de ENE netlist
  naast het objectief van een ANDERE, en dat is nergens een grootheid: de tuner telt de term op bij
  het objectief van het netwerk dat hij op dat moment evalueert. Zolang alle netlists in een smalle
  band lagen (1,68–2,08 bij V38-fix) was die conservatieve proxy onschadelijk; bij 0,48–1,86 is hij
  misleidend. **Elke netlist wordt nu tegen zijn eigen objectief gelegd** — de vergelijking die de
  engine maakt — en V37's bevinding staat daarmee ruimer overeind dan eerst: grootste
  piek-aandeel **0,74 %**, grootste R_e-aandeel **29,5 %**. De drempel van 1 % is niet aangeraakt,
  en dat is het hele punt: een tolerantie oprekken om een referentie te laten passen is precies
  wat dit project verbiedt. Nagemeten dat hij kán falen: de piek-term van `KAND_V2_3` met 1,5
  vermenigvuldigen zet hem op 1,10 % en de assert op rood.

  ---

  **WAT ER IN DE CODE VERANDERDE.** Nieuw: `src/lib/engine2/optimizer/chainChoices.ts` (de tweede
  classificatielijst, met `withDeclaredChainChoices`), `chainChoices.test.ts`,
  `src/lib/vituixBridge.ts` (de VituixCAD-brug, uit `App.tsx` gehaald zodat V40 hem scriptmatig
  kan gebruiken — gedrag ongewijzigd), `scripts/export-v40-vxp.ts`,
  `scripts/measure-v40-phase.ts`. Gewijzigd: `Chain3Settings` krijgt `leanTargetDb` (ongesteld =
  de historische afleiding); `synthesis.ts` en `vfOptimizer.ts` exporteren elk hun eigen standaard
  als benoemde constante; `candidateDeclaration.ts` krijgt `declareCandidateChainChoices`;
  `worker.ts` past de ketenverklaring toe op de driewegroute en meldt haar in de notities;
  `casus1V2.fixture.ts`, `App.tsx`, `compare-corpora.ts` (correctiegroep-kolom),
  `generate-casus1-v2-candidates.ts` (twee herkomstvelden) en drie testbestanden volgen. Het
  commentaar bij `VxpDriver.responseDelay` zei "ms" waar de code µs schrijft — gecorrigeerd.

  **Wat er NIET veranderd is:** geen enkele fasemaat (dat is V40), geen `smoothMag`, geen
  `WINDOW_SMOOTHING_OCTAVES`, geen vallen-generator en geen enkel nieuw topologievoorstel
  (beslispunt E blijft open, met een scherpere formulering: de kale val wordt nog steeds niet
  gebouwd). De tweewegroute is niet aangeraakt.

  **Openstaand in deze casus:** de twee posten uit de fixture-inventarisatie (`audit.fbHz` en het
  grijze `costWeight`), beslispunt E, en verder onveranderd — groundplane-metingen onder het
  onderste kruisgebied vóór onderdelenbestelling; HD-sweep; 30°-meting tweeter voor
  M-G-compleetheid; verzadigings-/formaatcheck grote P-core shunt-spoel.

- V40 (28-08-2026 — **LEVERING, geen besluit**: de twee fasematen ontleed en drie netlists naar VituixCAD) — opgeworpen bij V38-fix, hier voorzien van bewijsmateriaal. **GESLOTEN door V44 (30-08-2026), en niet door de VituixCAD-aflezing waar deze entry op wachtte.**

  > **Gedateerde noot, 30-08-2026 (V44).** De entry hieronder staat ongewijzigd; wat eronder volgt is wat er sindsdien van geworden is. De beslistabel aan het eind van deze entry — "VituixCAD reproduceert het RAPPORT-getal / het TUNER-getal / geen van beide" — is nooit ingevuld en hoefde dat ook niet: de ontleding die V44 eraan toevoegde (`measure-v40-overlap-band.ts`, punt voor punt over het hele casusboek) liet zien dat **beide verzamelingen een gemeten defect dragen, en dat de twee defecten haaks op elkaar staan**. De derde rij van die tabel — "geen van beide" — was dus het antwoord, en zij stond er als foutmodus in plaats van als uitkomst. Wat overeind blijft en het waard is bewaard te worden: de decompositie in DEFINITIE, RASTER en BAND, en de meting dat het hele gat de band is. Dat is wat V44 bruikbaar maakte. **De drie zips zijn vervangen** — zij heetten naar een LEVENDE corpussleutel en waren daardoor bij lezing al twee generaties oud; zie de nazorg in V44.


  **DE STAND.** De app draagt twee fasematen. Op HUIDIG's zaad zijn zij het eens (tuner 22,28°, rapport 23,83° voor W-M); op het netwerk dat dezelfde run aflevert lopen zij in tegengestelde richting uiteen (tuner 9,65°, rapport 47,68°), en op de ongegladde maat van V38-fix wordt dat gat groter in plaats van kleiner. Zolang dat staat is "de tuner kocht fase" een uitspraak in de eenheden van één van de twee. Deze sessie verandert **geen enkele fasemaat** — dat was uitgesloten in de opdracht — en levert twee dingen: een getallenblad dat het gat ontleedt, en drie VituixCAD-projecten.

  ---

  **HET GETALLENBLAD, EN HET ONTLEEDT HET GAT VERDER DAN VERWACHT.**

  `npx vite-node scripts/measure-v40-phase.ts` drukt per netlist en per driverpaar vijf getallen af. De eerste twee zijn wat de app afdrukt; de laatste twee rekenen **één formule** (gemiddelde |relatieve fase|) op **beide banden**, op het ketenraster, zodat BAND, RASTER en DEFINITIE uit elkaar liggen voordat er iets over gezegd wordt.

  Wat de twee maten precies zijn — en zij verschillen op twee assen tegelijk:

  | | RAPPORT (`system.phaseTracking`, A5.5) | TUNER (`pairPhaseDeg` → `computeIntegration`) |
  |---|---|---|
  | band | ±1 octaaf rond het kruispunt, **geknipt op meetgeldigheid** | het OVERLAPVENSTER: elk rasterpunt waar de twee takken binnen 20 dB van elkaar liggen |
  | beweegt mee met | het kruispunt | het NETWERK |
  | raster | het rapportraster | het ketenraster |
  | formule | gemiddelde \|arg(onder) − arg(boven)\| | dezelfde |

  **DE UITKOMST, en zij is scherper dan "ze zijn het oneens".** Op élke gemeten rij reproduceert de tunerkolom EXACT wanneer je één formule over het overlapvenster rekent, en de rapportkolom binnen ongeveer een graad wanneer je diezelfde formule over de rapportband rekent. **De twee definities zijn dus dezelfde formule, het raster draagt hooguit een graad, en het hele gat is de BAND.**

  De scherpste rij van het bevroren V38-fix-corpus, `466,5 · 1491,4`:

  | | ° |
  |---|---|
  | RAPPORT (eigen) | 17,83 |
  | TUNER (eigen) | **59,15** |
  | één formule op de OVERLAPband (200,0–815,7 Hz, 30 pt) | **59,15** |
  | één formule op de RAPPORTband (396,7–1051,6 Hz, 20 pt) | 17,05 |

  Het overlapvenster begint daar op **200,0 Hz** — de bodem van het ketenraster, en een vol octaaf ONDER de meetgeldigheidsvloer van 396,7 Hz waarop het rapport knipt. De tunermaat middelt daar dus fase over data die de app zelf niet vertrouwt. Op HUIDIG's W-M-paar loopt hetzelfde venster aan de andere kant door tot 20 000 Hz: beide takken liggen daar binnen 20 dB van elkaar terwijl ze allebei diep weg zijn.

  **WAT DIT WEL EN NIET BESLIST.** Het beslist het MECHANISME: de tegenspraak is geen andere natuurkunde en geen tweede implementatie van één grootheid, maar één formule over twee puntenverzamelingen waarvan er één niet op meetgeldigheid geknipt is. Het beslist NIET welke band de juiste vraag stelt — dat is een besluit over beleid, geen meting, en het is precies waarom V40 open blijft.

  ---

  **DE DRIE ZIPS, EN DE GETALLEN DIE ERBIJ HOREN.** Gekozen op de assen waar V40 over gaat, niet
  ingetypt: `HUIDIG` is het handwerk van de ontwerper, `KAND_V2_1` is de beste levende kandidaat
  van ná V41 (0,48 dB RMS), en `V38FIX_KAND_5` is de netlist waarop de twee maten het VERST
  uiteenlopen — die kandidaat (`466,5 · 1491,4`) levert sinds V41 geen netwerk meer, dus het
  bevroren bestand IS zijn opvolger als meetobject.

| zip | paar | kruispunt | RAPPORT ° | rapportband | dekking | TUNER ° | overlapband | één formule: overlap → rapport |
|---|---|---|---|---|---|---|---|---|
| `V40-HUIDIG` | W-M | 359,7 | **23,83** | 396,7–719,5 | 43,0 % | **22,28** | 254,9–20 000 | 22,28 → 24,22 |
| `V40-HUIDIG` | M-T | 2250,2 | 7,04 | 1125,1–4500,5 | 100 % | 7,04 | 1145,3–3848,0 | 7,04 → 6,97 |
| `V40-KAND_V2_1` | W-M | 408,3 | **4,55** | 396,7–816,7 | 52,1 % | **2,14** | 242,8–705,3 | 2,14 → 4,58 |
| `V40-KAND_V2_1` | M-T | 1946,6 | 5,67 | 973,3–3893,2 | 100 % | 4,78 | 1145,3–3666,0 | 4,78 → 5,53 |
| `V40-V38FIX_KAND_5` | W-M | 525,8 | **17,83** | 396,7–1051,6 | 70,3 % | **59,15** | **200,0**–815,7 | 59,15 → 17,05 |
| `V40-V38FIX_KAND_5` | M-T | 1418,9 | 11,72 | 709,5–2837,8 | 100 % | 10,72 | 856,3–2257,7 | 10,72 → 11,50 |

  Nagemeten over twintig rijen (HUIDIG, de acht levende kandidaten en het bevroren meetobject):
  de tunerkolom reproduceert **exact** op élke rij, de rapportkolom binnen **1,5°** in het
  slechtste geval. Daarmee is de decompositie hard: geen definitieverschil, hooguit anderhalve
  graad raster, en al het overige is de band.

  **DE ZIPS ZELF.** `npx vite-node scripts/export-v40-vxp.ts` schrijft in `test-fixtures/casus1/v40_vituix/` één zip per netlist, elk met het `.vxp` én zijn meetbestanden ernaast — precies zoals de exportknop van de app het doet, met dezelfde `serializeVxp`, dezelfde `zipStore` en dezelfde brugvertraging. Die brug is sinds V41 een module (`vituixBridge.ts`) in plaats van een lokale functie in `App.tsx`, want een tweede kopie van de brug ernaast zetten zou het oordeel dat zij moet dragen ongeldig maken.

  **WAT DE EXPORT ANDERS DOET DAN DE KNOP, met de reden, want een stilzwijgende afwijking maakt dit hele oordeel waardeloos:**

  1. **De responsen zijn afgeleid, niet de ruwe bestanden.** Casus 1's WOOFER is één weg gemeten als TWEE bestanden (V13) en VituixCAD wil er één per driverblok. Dus schrijft het script per driver de `onAxisFull` van de opnamepas weg — de ongeknipte complexe som waarop de app zélf ontwerpt — voor alle drie de wegen, zodat er één afleiding is en niet één afwijkende weg. Elk bestand draagt die herkomst in zijn kop.
  2. **De impedanties zijn omgezet naar ZMA-tekst.** Casus 1's `.lim` is binair ARTA en VituixCAD leest dat niet. **Dat is ook een bevinding over de app zelf, gemeld en niet gerepareerd:** wie in de app een `.lim` inlaadt en exporteert, krijgt dat bestand ongewijzigd in de exportmap en VituixCAD weigert het. Buiten het bereik van V41.
  3. **Geen hoekensets.** Casus 1 heeft er één (mid 30°), en één hoek op één driver is geen directiviteitsset; de app gebruikt hem op deze run zelf ook niet (`directivityWeight` 0, geen `angleData`).

  Bijvangst en gecorrigeerd: het commentaar bij `VxpDriver.responseDelay` zei "ms" terwijl de code altijd µs geschreven heeft — en die brug is op de KOAN-set gevalideerd tot op ~2°. Een commentaarfout, op precies het veld waar V40 nu van afhangt.

  ---

  **WAT SANDER DOET, EN WAT ELKE UITKOMST BETEKENT.**

  1. Pak één zip uit en open het `.vxp` in VituixCAD. Elke driver staat op `MinimumPhase=True` met zijn brugvertraging; het netwerk is CROSSOVER (variant 0).
  2. Lees de fasetracking van één driverpaar af **op de RAPPORTBAND uit het getallenblad** (de kolom `rapportband Hz`) — dezelfde band, dezelfde twee takken.
  3. Vergelijk met de twee getallen van datzelfde paar.

  | uitkomst | wat het betekent | welke kolommen de verliezende maat droegen |
  |---|---|---|
  | VituixCAD reproduceert het RAPPORT-getal | de rapportmaat beschrijft de luidspreker; de tunermaat middelt over een band die de meetgeldigheid niet respecteert | de kolommen `W-M fase TUNER` en `M-T fase TUNER` in de vóór/ná-tabellen van **V38-fix** en **V41**, plus de `pairPhaseDeg`-regels in de wattenval- en transplantatietabellen van **V38** en de her-polijstingstabel (`paarfase W-M 22,28 → 9,65`) |
  | VituixCAD reproduceert het TUNER-getal | de knip op meetgeldigheid verwijdert iets dat er hoort te zijn; het rapport onderschat | de kolommen `W-M fase RAPPORT` en `M-T fase RAPPORT` in dezelfde twee tabellen, plus élke A5.5-fasetracking in het paneel en in `goldenCasus1.test.ts` |
  | geen van beide | de brug klopt niet, of het netwerk is anders aangekomen dan het bedoeld was | dan is de eerste vraag de export en niet de maat: vergelijk eerst de SPL-som van VituixCAD met `SPL ±` uit de tabel |

  **Zolang dit open staat draagt elke afruil die op fase verdedigd wordt deze onzekerheid mee** — dat is ongewijzigd sinds V38-fix, en het getallenblad maakt hem alleen preciezer: het is niet de definitie en niet het raster, het is de band.

- V43 (29-08-2026 — **BREAKING, alleen v2-runs**: de LF-bult wordt ontleed, en het budget verhuist naar de resonante component met een herijkt getal) — opgeworpen als eigen opdracht uit V42. **In twee helften uitgevoerd, met een meetbesluit ertussen; die tweedeling is zelf een bevinding en staat hieronder voluit.**

  **DE OPDRACHT.** V42 mat dat `lfBump().extraDb` twee mechanismen bij elkaar optelt — een brede resistieve lift en een smalle resonante opslingering — en dat het gestelde 2,5 dB-budget boven ~1,7 Ω padweerstand al op is vóórdat er een spoel bestaat. V43 haalt die twee uit elkaar en zet de eis op de tweede.

  ---

  **DE METRIEK.** M-D levert sinds V43 drie getallen op één band in één pas: `extraDb` (ongewijzigd en bit-identiek — de grootheid waarin élke staande referentie is uitgedrukt), `liftDb` en `resonantDb`. De registerrij staat in A4 M-D. De tweede kromme komt van een **resistief equivalent**: dezelfde topologie, dezelfde waarden, spoel → DCR (een ideale spoel dus een kortsluiting, met knoopsamenvoeging), condensator → open, en de DRIVER houdt zijn gemeten impedantie — de motionele piek is juist de grootheid waarover de twee krommen vergeleken worden. `liftDb + resonantDb = extraDb` per constructie, en dat maakt elke bestaande `lf_bult_extra_dB`-referentie de brug naar de twee nieuwe.

  **DE ONTLEDING VAN DE DRIE REFERENTIEFILTERS — EN ZIJ KEERT V42's BEELD OM.**

  | netlist | pad R | `extraDb` | lift | opslingering |
  |---|---|---|---|---|
  | HUIDIG | 3,76 Ω | 3,75 | **4,69** | **−0,94** |
  | KAND_A | 4,42 Ω | 4,25 | **5,15** | **−0,90** |
  | KAND_B | 2,35 Ω | 3,41 | **3,46** | **−0,05** |

  V42 stelde vast dat de eis strenger was dan het eigen referentiefilter van de ontwerper: alle drie de baselines overschreden de 2,5 dB. Ontleed blijkt die overschrijding **volledig niveauwerk** — de spoelen van deze drie ontwerpen voegen op hun eigen resistieve equivalent níets toe. Wat het budget op HUIDIG veroordeelde was R8 die baffle-step-werk doet, en dat is ankerdomein (A5e.2), niet de spoelregel.

  **DE NEGATIEVE OPSLINGERING IS GEEN FOUT EN VERDIENT ZIJN EIGEN ZIN.** M-D normaliseert op f_ref (≈ 3·f_p, hier 157 Hz). HUIDIG's wooferpad draagt daar een doorlaatband­resonantie tussen zijn seriespoel en zijn 108 µF shunt, dus de geladen kromme wordt júist bij de normalisatiefrequentie opgetild en leest ten opzichte van haar resistieve equivalent lager. De opslingering is dus "wat reactantie bij de piek doet **ten opzichte van wat zij bij f_ref doet**". Dat is dezelfde relativiteit die `extraDb` altijd al droeg; de ontleding maakt haar alleen zichtbaar.

  **DE VIER DOOR V42 VERWORPEN ONTWERPEN, ONTLEED.** De vraag was hoeveel van hun overschrijding lift was en hoeveel opslingering.

  | netlist | RMS | pad R | `extraDb` | lift | opslingering |
  |---|---|---|---|---|---|
  | V41_KAND_2 | 0,49 | 1,72 Ω | 6,10 | 2,76 (45 %) | **3,34** |
  | V41_KAND_4 | 0,53 | 1,59 Ω | 6,56 | 2,60 (40 %) | **3,96** |
  | V41_KAND_6 | 0,54 | 1,79 Ω | 5,98 | 2,84 (47 %) | **3,14** |
  | V41_KAND_7 | 1,82 | 1,01 Ω | 3,62 | 1,80 (50 %) | **1,82** |

  **Ongeveer half om half.** De verwachting was dat hun schending grotendeels lift zou zijn en dat zij onder een geherformuleerd budget zouden terugkeren; dat is niet zo, en alle vier blijven boven 1,4 dB.

  ---

  **HET MEETBESLUIT TUSSEN DE TWEE HELFTEN, en dit is de reden dat de sessie in tweeën is uitgevoerd.**

  De opdracht schreef één controle voor: de klasse-A-referentie `maxL_bij_Rs0_5_budget2_5dB_mH` moest vrijwel gelijk blijven, want bij lage padweerstand zou de lift klein zijn. **Zij is dat niet.** Bij 0,5 Ω is de resistieve lift al 0,967 dB van de gestelde 2,5 — 39 % van het budget — en het plafond zou van 2,432 naar 3,162 mH gaan, +30 %. Alleen de grootheid verplaatsen zou de eis dus stilletjes met een derde hebben opgerekt. De sessie is daar gestopt en heeft de vraag teruggelegd; het antwoord was **optie 1 met één staande eis** en een herijking.

  **DE HERIJKING, GEMETEN EN NIET GEKOZEN.** De ervaringsregel van de ontwerper is een spoelregel: ~4,7 mH bij 8 Ω, dus ~2,35 mH bij dit ~4 Ω wooferpaar. Wat die spoel op de gemeten Z-piek en het gemeten nabije veld aan resonante opslingering oplevert bij 0,5 Ω padweerstand is **1,433 dB**, afgerond op één decimaal **1,4**. De vuistregelband 2,2–2,7 mH levert 1,26–1,87 dB. De eis reproduceert de regel dus in plaats van haar te vervangen.

  **DE INVERSIE IN DRIE VORMEN** (`scripts/measure-v43-decomposition.ts`, tweede tabel; vastgelegd als `manifest_en_geometrie.v43_inversie_bevinding` met een assert per kolom):

  | pad R | lift bij L = 0 | SOM @ 2,5 dB (V42) | OPSLING. @ 2,5 dB (niet genomen) | **OPSLING. @ 1,4 dB (nu)** |
  |---|---|---|---|---|
  | 0,00 Ω | 0,000 dB | 2,857 mH | 2,857 mH | **2,130 mH** |
  | 0,25 Ω | 0,506 dB | 2,662 mH | 3,008 mH | **2,225 mH** |
  | **0,50 Ω** | **0,967 dB** | **2,432 mH** | **3,162 mH** | **2,322 mH** |
  | 1,00 Ω | 1,798 dB | 1,806 mH | 3,493 mH | **2,544 mH** |
  | 1,50 Ω | 2,518 dB | **geen grens** | 3,846 mH | **2,791 mH** |
  | 1,70 Ω | 2,777 dB | **geen grens** | 3,992 mH | **2,894 mH** |
  | 2,00 Ω | 3,139 dB | **geen grens** | 4,215 mH | **3,053 mH** |
  | 2,60 Ω | 3,781 dB | **geen grens** | 4,665 mH | **3,325 mH** |
  | 3,00 Ω | 4,156 dB | **geen grens** | 4,938 mH | **3,504 mH** |
  | 3,76 Ω | 4,776 dB | **geen grens** | 5,465 mH | **3,852 mH** |

  Drie dingen staan in die tabel, en zij dragen samen de herdefinitie.

  1. **Grootheid én getal, of geen van beide.** 2,432 → 2,322 mH is −4,5 %; de klasse-A-referentie staat vrijwel waar zij stond. Alleen de grootheid verplaatsen zou +30 % zijn geweest. Beide waarden staan in het referentiebestand (`_maxL_op_de_som_V42` als brug, `waarde_zonder_herijking` als de niet-genomen stap) en `boundInversions.test.ts` assert alle drie.
  2. **De eis zwijgt nergens meer.** Op `extraDb` gaf de inversie boven ~1,5 Ω géén grens; op `resonantDb` is de opslingering bij L = 0 per definitie exact nul, dus er is **altijd** een plafond. Dat is de grootste gedragswijziging van V43 en zij is groter dan de getalsverandering: de eis was op zes van de negen bevroren netlists inert.
  3. **Meer padwerk mag meer spoel, en dat is de bedoeling.** De derde kolom loopt van 2,13 mH bij nul tot 3,85 mH bij HUIDIG's eigen 3,76 Ω, omdat demping de opslingering werkelijk onderdrukt. De vuistregel kan dat niet zien — zij kent alleen de spoel — en dat is precies waarom M-D haar vervangt (zij mist R, DCR, piek-Q en kastafstemming). Alle tien de waarden blijven onder de 4,7 mH die de regel voor een 8 Ω-driver noemt. Geen versoepeling maar de grootheid die de regel bedoelde.

  **DE LIFT KRIJGT GÉÉN EIGEN BUDGET, en dat is een besluit met een reden.** Hoeveel van HUIDIG's 4,69 dB lift gewenst baffle-step-werk is, is de ankervraag: doelcurve plus dempingsmarge, oftewel A5e.2, en dat besluit is geparkeerd. Een tweede eis erop zou het onder een andere naam nemen. **Optie 3 van V42 — één grens op `R_pad + jωL` samen — is expliciet vervallen**, want zij herkoppelt precies wat deze sessie gescheiden heeft.

  **DE TWEE FEITEN DIE ELKE GESTELDE EIS HOORT TE DRAGEN, en hier keert de spiegel om.** Bij de versterkervloer haalt HUIDIG de eis met marge, en dát is het bewijs dat de eis geen bouwbaar ontwerp uitsluit. Onder V42's 2,5 dB op de som ontbrak dat bewijs — alle drie de baselines overschreden haar — en het moest van het V28-corpus komen. Op de resonante component halen alle drie de referentiefilters de 1,4 dB ruim (−0,94 / −0,90 / −0,05). **Haalbaar** is dus weer bewezen door het eigen filter van de ontwerper, en **niet vacuüm** door de netlists in het casusboek die de eis wél overschrijden. `frozenNetlistGates.test.ts` assert beide.

  ---

  **DE VÓÓR/NÁ OP HET HELE VELD.** Vijftien kandidaten, `'safety'` als barrièrebron, zelfde seed, zelfde poorten, het nieuwe budget gewapend (`compare-corpora.ts v42 live`). De generator kostte **4 u 52 min** (634–2436 s per kandidaat).

| kandidaat (W-M · M-T) | min \|Z\| vóór | min \|Z\| ná | @ Hz ná | vloer vóór → ná | SPL ± vóór → ná | RMS vóór → ná | W-M fase RAPPORT vóór → ná | W-M fase TUNER vóór → ná | M-T fase RAPPORT vóór → ná | M-T fase TUNER vóór → ná | dissipatie % vóór → ná | grootste R (W) vóór → ná | EPDR vóór → ná | Q_es× vóór → ná | smalste piek ná (dB @ Hz) | correctiegroepen vóór → ná | LF-bult dB vóór → ná | lift dB vóór → ná | opslingering dB vóór → ná | serie-L mH vóór → ná |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 396.7 · 1294 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** |
| 396.7 · 1491.4 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** |
| 396.7 · 1719 | — | 2.61 | 235.11 | — → **ja** | — → 4.42 | — → 2.17 | — → 32.32 | — → 27.58 | — → 15.30 | — → 14.11 | — → 29.21 | — → 14.09 | — → 1.34 | — → 1.34 | — | — → trap×1 damped-trap×2 series-pad×3 shunt-pad×1 | — → 1.05 | — → 1.85 | — → -0.80 | — → 2.57 |
| 396.7 · 1981.2 | 3.29 | 2.60 | 263.56 | **ja** → **ja** | 0.78 → 1.84 | 0.48 → 0.83 | 4.55 → 26.86 | 2.14 → 16.86 | 5.67 → 6.07 | 4.78 → 4.80 | 40.27 → 65.75 | 28.18 → 27.35 | 1.67 → 1.31 | 1.33 → 2.90 | — | damped-trap×2 shunt-shelf×1 series-pad×2 → damped-trap×1 shunt-shelf×2 series-pad×3 shunt-pad×1 | 7.93 → 4.20 | 1.79 → 5.93 | 6.14 → -1.72 | 7.34 → 2.82 |
| 396.7 · 2283.5 | — | 2.59 | 1003.81 | — → **ja** | — → 1.59 | — → 0.78 | — → 24.15 | — → 22.84 | — → 4.29 | — → 3.56 | — → 60.53 | — → 28.49 | — → 1.30 | — → 2.16 | — | — → damped-trap×3 series-pad×3 shunt-pad×1 | — → 2.88 | — → 4.52 | — → -1.63 | — → 2.70 |
| 466.5 · 1294 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** |
| 466.5 · 1491.4 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** |
| 466.5 · 1719 | — | 2.62 | 975.55 | — → **ja** | — → 3.82 | — → 2.12 | — → 16.62 | — → 18.14 | — → 41.54 | — → 35.86 | — → 41.14 | — → 13.93 | — → 1.31 | — → 1.74 | — | — → damped-trap×2 shunt-shelf×1 series-pad×3 shunt-pad×2 | — → 2.67 | — → 3.34 | — → -0.68 | — → 2.92 |
| 466.5 · 1981.2 | 2.64 | 2.56 | 449.12 | **ja** → **ja** | 3.00 → 2.29 | 1.86 → 1.49 | 20.09 → 20.93 | 19.84 → 16.88 | 25.21 → 19.85 | 13.00 → 14.16 | 40.38 → 48.85 | 16.93 → 17.22 | 1.33 → 1.31 | 1.86 → 2.03 | — | damped-trap×2 series-pad×3 shunt-pad×2 → trap×2 damped-trap×1 series-pad×3 shunt-pad×2 | 4.38 → 4.34 | 3.70 → 4.13 | 0.68 → 0.22 | 4.15 → 3.27 |
| 466.5 · 2283.5 | 3.64 | 2.94 | 357.40 | **ja** → **ja** | 1.17 → 0.95 | 0.54 → 0.51 | 4.34 → 4.19 | 2.76 → 2.67 | 5.48 → 5.18 | 4.34 → 3.97 | 40.44 → 75.90 | 26.39 → 42.17 | 1.83 → 1.47 | 1.41 → 1.71 | — | shunt-shelf×1 series-pad×2 → zobel×1 shunt-shelf×1 series-pad×3 shunt-pad×1 | 7.17 → 2.60 | 2.17 → 3.23 | 5.01 → -0.63 | 6.60 → 3.23 |
| 548.5 · 1294 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** |
| 548.5 · 1491.4 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** |
| 548.5 · 1719 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** |
| 548.5 · 1981.2 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** |
| 548.5 · 2283.5 | 2.99 | 3.97 | 1093.59 | **ja** → **ja** | 0.93 → 1.09 | 0.53 → 0.56 | 6.45 → 6.06 | 5.36 → 5.91 | 4.77 → 4.35 | 3.43 → 3.43 | 63.14 → 46.02 | 33.81 → 24.87 | 1.56 → 2.06 | 2.29 → 1.78 | — | shunt-shelf×1 series-pad×2 shunt-pad×1 → shunt-shelf×1 series-pad×2 shunt-pad×1 | 3.85 → 3.60 | 4.71 → 3.50 | -0.87 → 0.10 | 2.29 → 3.57 |
  | grootheid | V42-corpus | levend corpus | |
  | --- | --- | --- | --- |
  | netlists | 4 | **7** | drie erbij, nul eruit |
  | **opslingering, gemiddeld** | **2,7 dB** | **−0,7 dB** | **de doelgrootheid bewoog** |
  | **boven het gestelde budget** | **2 van 4** | **0 van 7** | |
  | lift, gemiddeld | 3,1 dB | **3,8 dB** | omhoog — zie hieronder |
  | LF-bult (som), gemiddeld | 5,8 dB | 3,0 dB | |
  | totale serie-L laagste weg | 5,1 mH | **3,0 mH** | het plafond werkt |
  | RMS-vlakheid, gemiddeld | 0,93 dB | 1,21 dB | |
  | W-M fase RAPPORT, gemiddeld | 8,9° | 18,7° | |
  | dissipatie | 46,1 % | 52,5 % | |
  | haalt de vloer | 4 van 4 | 7 van 7 | |

  **DE EIS WERKT, EN ZIJ IS BETAALD.** Dit is het spiegelbeeld van V42, waar het budget de helft van het veld verwijderde en geen enkel ontwerp veranderde. Nu verandert hij élk ontwerp: de totale seriespoel van de wooferweg gaat van gemiddeld 5,1 naar 3,0 mH, de opslingering van +2,7 naar −0,7 dB, en **geen van de zeven netlists overschrijdt de eis nog**. Het veld GROEIT bovendien van vier naar zeven — drie kandidaten die V42 verwierp leveren nu een netwerk — want de kleinere spoel maakt de takimpedantie rond het kruispunt niet meer automatisch te laag.

  De prijs staat in dezelfde tabel en wordt niet weggeschreven: RMS-vlakheid 0,93 → 1,21 dB gemiddeld, W-M fase 8,9° → 18,7°, dissipatie 46,1 → 52,5 %. Drie van de zeven nieuwe netlists zijn ronduit slechter dan wat V42 had (2,17 / 2,12 / 1,49 dB RMS); twee zijn vrijwel gelijk (0,51 en 0,56 dB). **De beste ontwerpen van het project — 0,48 dB — zijn niet teruggekomen.** Wie de vlakste respons wil, wil de grote spoel; de eis verbiedt hem. Dat is geen defect van de eis maar wat een eis is.

  **EN DE LIFT LIEP OMHOOG TERWIJL DE OPSLINGERING OMLAAG GING — 3,1 → 3,8 dB.** Dat is de scherpste bevinding van de tweede helft, en zij was voorspelbaar noch weggeschreven: de zoektocht compenseert de verloren seriespoel met serieWEERSTAND, en serieweerstand tilt het laag op precies de brede, gedempte manier die V43 buiten het budget heeft gelaten. De dissipatie beweegt mee (46,1 → 52,5 %). **De twee helften ruilen dus tegen elkaar, en één ervan begrenzen verplaatst het ontwerp naar de andere.** Dat maakt het ankerbesluit (A5e.2) niet alleen onafgemaakt maar nu ook dringend: zolang niemand zegt hoeveel resistieve lift gewénst is, heeft de zoektocht daar een onbewaakte uitweg. Het is óók het scherpste argument voor de LCR-/parallel-R-vraag: een LCR over de driver op f_p verlaagt de piek zelf en zou beide helften tegelijk kleiner maken in plaats van de ene in de andere te duwen.

  **DE ACHT VERWORPEN KANDIDATEN, met reden en met wat de geweigerde tune had bereikt** (V31-vorm; het verslag drukt ze af omdat een kandidaat die niets oplevert anders onzichtbaar is):

  | kandidaat | geweigerd door | de geweigerde tune stond op | reden |
  |---|---|---|---|
  | 396,7 · 1294 | gate | 2,55 Ω · ±71,47 dB · RMS 1,05 | M-B/\|Z\|: 2,55 Ω onder de gestelde 2,60 |
  | 396,7 · 1491,4 | gate | 2,55 Ω · ±71,91 dB · RMS 1,07 | M-B/\|Z\|: 2,55 Ω onder de gestelde 2,60 |
  | 466,5 · 1294 | protection | 2,58 Ω · ±73,94 dB · RMS 1,96 | tweeter protection got worse |
  | 466,5 · 1491,4 | protection | 2,57 Ω · ±73,43 dB · RMS 2,08 | tweeter protection got worse |
  | 548,5 · 1294 | gate | 0,09 Ω · ±73,27 dB · RMS 1,60 | M-B/\|Z\|: 0,01 Ω onder de gestelde 2,60 |
  | 548,5 · 1491,4 | gate | 0,10 Ω · ±72,06 dB · RMS 1,28 | M-B/\|Z\|: 0,01 Ω onder de gestelde 2,60 |
  | 548,5 · 1719 | protection | 2,82 Ω · ±72,36 dB · RMS 2,05 | tweeter protection got worse |
  | 548,5 · 1981,2 | gate | 2,59 Ω · ±72,74 dB · RMS 1,72 | M-B/\|Z\|: 2,27 Ω onder de gestelde 2,60 |

  **Geen van de acht is door het LF-budget geweigerd, en dat kan ook niet:** M-D heeft geen poort-id en het budget begrenst de zoekruimte in plaats van een uitkomst te veroordelen. Wat ze weigert is de versterkervloer (vijf) en de tweeterbescherming (drie) — dezelfde twee die V42's veld ook dunden. **De vier laagste M-T-kruispunten (1294 en 1491,4 Hz) leveren op geen enkele wooferkruising een netwerk**, en dat patroon staat er nu drie corpora achter elkaar: het is een eigenschap van deze drivers en niet van deze eis.

  ---

  **EEN OPEN PUNT DAT V43 GROTER MAAKT DAN HET WAS.** Het plafond wordt tijdens de run ÉÉN KEER opgelost, bij de padweerstand van het ZAAD, en daarna ligt het vast — terwijl de zoektocht die padweerstand vervolgens verandert (en blijkens de liftkolom systematisch omhóóg). Onder V42 was dat zelden merkbaar omdat de grens op de helft van de ontwerpen helemaal niet bond; sinds V43 bindt zij altijd, dus het verschil tussen zaad- en leveringspadweerstand vertaalt zich nu in élke run naar een plafond dat strenger of losser is dan de geleverde netlist verdient. Gemeten voorbeeld uit dit corpus: `KAND_V2_4` levert 5,80 Ω padweerstand af, en bij díe padweerstand staat de eis 4,83 mH toe — terwijl de grens bij een zaad zonder padwerk op 2,13 mH wordt opgelost. Een factor 2,3 tussen wat de zoektocht kreeg en wat de geleverde netlist verdiend zou hebben. **Open**, en het is een eigen sessie waard: een grens die tijdens de zoektocht meebeweegt is een ander mechanisme dan een grens uit een doos.

  ---

  **WAT ER NIET GEBOUWD IS.** Geen ankerbesluit (A5e.2 blijft geparkeerd, en de liftkolom hierboven is precies waarom hij dringend is), geen LCR-generatie, geen wijziging aan V42's som-plafond-machinerie, en geen v2-default die een casus-1-getal is: 1,4 dB staat uitsluitend in `manifest_en_geometrie.gestelde_eisen` en de fixture leest hem daarvandaan.

- V44 (30-08-2026 — **BREAKING, alleen v2-runs**: de fasematen worden er één, en het is geen van de twee die er stonden) — opgeworpen als V40 bij V38-fix, gemeten bij V41, hier beslist. **De inventarisatie is de motivering: elke uitsluiting in de nieuwe maat is een bestaande doctrine, geen nieuwe.**

  **DE STAND WAARUIT DIT VOLGT.** De app droeg twee fasematen. Het RAPPORT (`system.phaseTracking`) middelde |Δφ| over ±1 octaaf rond het kruispunt, geknipt op meetgeldigheid; de TUNER (`pairPhaseDeg`) middelde diezelfde grootheid over het overlapvenster — elk rasterpunt waar de takken binnen 20 dB van elkaar liggen — zonder enige knip. V41 mat dat zij dezelfde FORMULE zijn op verschillende PUNTEN, en dat het raster hooguit anderhalve graad draagt. Wat toen open bleef was welke van de twee de luidspreker beschrijft.

  **DAT WAS DE VERKEERDE VRAAG, en de ontleding punt-voor-punt liet dat zien.** `scripts/measure-v40-overlap-band.ts` (nieuw) telt per netlist en per driverpaar welke punten ALLEEN de tuner meetelt, en waarom zij binnenkwamen. Over de 198 paar-rijen van de 99 BEVROREN netlists (het levende corpus is uitgesloten, want dat beweegt met deze ingreep mee):

  | de tuner telde extra mee | punten | wat zij zijn |
  | --- | --- | --- |
  | onder de meetgeldigheidsvloer | **911** van 1048 (87 %) | data die de meetbestanden ZELF buiten hun geldige band leggen — de vloer van casus 1 staat in de KOP van alle drie de metingen, hij is geen app-heuristiek |
  | dode punten | **14** | beide takken op de stille-geestvloer. Op HUIDIG is dat 20 kHz met −475 en −462 dB: |Δ| = 13,1 ≤ 20, dus het punt telt mee, en wat het bijdraagt is uitsluitend het faseverschil van de FILTERS — er zit geen meting in. De stille geest van V38-fix, één metriek verderop |
  | echte, geldige data buiten ±1 octaaf | 123 | géén defect: het antwoord op een andere vraag |

  **En het is niet eenzijdig — dat is de vondst die de beslissing draaide.** Het rapport telt punten mee waar de takken meer dan 20 dB uiteen liggen en de fase de som dus niet kan bewegen. Op `V28_KAND_1` mid→tweeter zijn dat dertien punten van gemiddeld **146,21°**, waarmee het rapport 90,73° las tegen 29,74° voor de tuner; op `V28_KAND_2` is het 148,79° en 88,36 tegen 26,31. Over het corpus staat het rapport op 109 rijen hoger, de tuner op 58. **Nog een cijfer dat de tweedeling scherp maakt:** alle 99 woofer→mid-rijen dragen tuner-only punten en slechts 11 van de 99 mid→tweeter-rijen — het defect van de tuner zit op de LAGE kruising, waar het overnamegebied onder de meetvloer reikt, en dat van het rapport op de HOGE, waar de takken snel uiteen lopen. **Beide maten hebben een gemeten defect, en de twee defecten staan haaks op elkaar.** Dus is het antwoord hun DOORSNEDE, en niet een van beide.

  ---

  **DE MAAT: M-K, met drie gronden tegelijk.** De registerrij staat in A4. De formule is ongewijzigd; wat vastgelegd is, is de toelating, en elke grond is een doctrine die dit project al draagt:

  | grond | wat zij weert | wiens les |
  | --- | --- | --- |
  | (a) binnen de meetgeldigheid van BEIDE takken | 911 punten | V15 / F4b-lek 2 — een gemiddelde over data die de meting niet draagt, is een uitspraak over de reconstructie |
  | (b) BEIDE takken boven de stille-geestvloer | de 14 dode punten | V38-fix — twee even dode takken liggen per definitie binnen élk RELATIEF niveauvenster |
  | (c) \|niveauverschil na filter\| ≤ het overlapvenster | de 146°-punten van het rapport | het bestaande tuner-criterium, ongewijzigd overgenomen uit `integration.ts`: fase waar de som hem niet voelt, telt niet |

  **De ±1-octaafband vervalt als toelating.** Zij was een BENADERING van "waar de twee takken elkaar overnemen"; grond (c) meet dat gebied rechtstreeks, op het geleverde netwerk. De 123 geldige punten die erbuiten vielen horen er daarmee bij. Gevolg dat de moeite waard is om op te schrijven: **het kruispunt stuurt de maat niet meer.** Verplaats het kruispunt en M-K staat stil; alleen de controlekolom beweegt (geassert in `metrics/phaseIntegration.test.ts`).

  **ÉÉN IMPLEMENTATIE, TWEE LEZERS — de V32-vorm.** `src/lib/phaseAdmission.ts` beslist als enige welke punten meetellen; `engine2/metrics/phaseIntegration.ts` is de rapportlezer, `netOptimizer.ts` de tuner-lezer achter de keuze-sleutel `phaseAdmission`. Het bestand staat in `src/lib/` en niet in `engine2/` om de reden die `impedanceFloor.ts` en `partAudit.ts` al dragen: de tuner mag niets uit `engine2/` importeren (toggleRegression), dus een gedeelde regel woont daar waar beide erbij kunnen. Het overlapvenster zelf heeft óók één huis gekregen (`DEFAULT_OVERLAP_WINDOW_DB` en `inOverlapWindow` in `integration.ts`), zodat grond (c) de vergelijking leest in plaats van hem na te bouwen.

  **DE TWEE OUDE MATEN ZIJN NIET WEG.** Zij reizen mee als benoemde controlekolommen (`control.octaveClipped`, `control.overlapWindow`) — in het rapport, in het paneel, in de shortlist, in `compare-corpora.ts` en in het referentiebestand (`manifest_en_geometrie.v44_fasematen`). Zij oordelen niets: geen poort, geen eis, geen sorteersleutel leest ze. **Dat zij het oneens waren is zelf een bewaakte eigenschap**, en `frozenNetlistGates.test.ts` assert dat: er moeten netlists zijn waar de ene hoger leest dan M-K en netlists waar zij lager leest, voor allebei de kolommen, plus handovers waar de twee aan WEERSZIJDEN van M-K vallen — wat geen enkele monotone herschaling van één getal kan. Verdwijnt die tegenspraak, dan is er aan een van beide iets veranderd zonder dat iemand het besloot.

  **DE SLEUTELS.** `phaseAdmission` is CHOICE (`'overlap'` = de historische verzameling en élke v1-run; `'measured'` = de drie gronden), `phaseAdmissionFacts` is POLISH — de geldige band uit de opnamepas en de geestconventie van de aanroeper, allebei metingen die de run al in handen heeft. Vierde paar in dezelfde vorm als V33, V34 en V37; sleuteltelling 44 → 46, verdeling 30/5/9 → 31/5/10. **Correctie op de opdracht die dit mogelijk maakte:** `phaseMetric` kón dit niet stellen. Beide waarden ervan middelen over het overlapvenster — `'band'` ongewogen plus een P95-term, `'overlap'` overlapgewogen — dus die sleutel noemt de WEGING en niet de toelating. Twee sleutels, twee vragen; ze samenvoegen zou één van de twee antwoorden onbereikbaar maken.

  **DE DEKKING IS MEEVERHUISD, en dat is een besluit.** Zij wordt sinds V44 gemeten tegen het OVERNAMEGEBIED (de band die grond (c) van dit netwerk afleest) en niet tegen een octaafvenster: zij zegt hoeveel van dat gebied de meetgeldigheid en de geestvloer overlieten. Op casus 1 is dat 100 % op mid→tweeter en 42–56 % op woofer→mid — bijna de helft van het overnamegebied van de laagste kruising ligt onder de 397 Hz-vloer, en dát is het getal dat V15 wilde laten zien.

  ---

  **LEESINSTRUCTIE VOOR DE ENTRIES V30 T/M V43 — welke fase-kolommen wat betekenen.**

  Elke entry van V30 tot en met V43 draagt fase-kolommen, en zij zijn geen van alle M-K. Zij worden hier NIET herschreven; dit is de sleutel waarmee ze gelezen moeten worden.

  | waar | wat er staat | hoe te herlezen |
  | --- | --- | --- |
  | kolommen `W-M fase RAPPORT` / `M-T fase RAPPORT` in de vóór/ná-tabellen van V38-fix, V41, V42, V43 | de OCTAAFGEKNIPTE maat | **verdacht in één richting**: zij telt punten mee waar één tak allang weg is. Zij overschat waar de takken snel uiteen lopen — op M-T-paren is dat het grootst (`V28_KAND_1`: 90,7° tegen 29,7°) |
  | kolommen `W-M fase TUNER` / `M-T fase TUNER` in dezelfde tabellen | het KALE OVERLAPVENSTER | **verdacht in de andere richting**: zij telt punten mee onder de meetgeldigheidsvloer en op de stille geest. Zij overschat waar het overnamegebied onder 397 Hz reikt — op W-M-paren is dat het grootst (`V38FIX_KAND_5`: 59,15° tegen 17,05°). **En zij is scherp te maken: alle 99 W-M-rijen van het casusboek dragen zulke punten en slechts 11 van de 99 M-T-rijen.** Een TUNER-kolom op W-M is dus altijd verdacht, en een afruil die in een oude entry op W-M is opgeschreven kan van teken omslaan; een TUNER-kolom op M-T is op negen van de tien netlists gewoon de gedeelde verzameling en mag als betrouwbaar gelezen worden. Overschat de vlakte niet in de andere richting: de sub-vloerpunten lazen op het V43-corpus vaker LAGER dan de geldige, dus zij VLEIDEN de tuner even vaak als zij hem straffen |
  | de `pairPhaseDeg`-regels in de wattenval- en transplantatietabellen van V38, en de her-polijstingstabel (`paarfase W-M 22,28 → 9,65`) | het KALE OVERLAPVENSTER | idem. De 22,28 → 9,65 die V40 opwierp is dus een beweging in de eenheden van de verdachte maat, en de tegenspraak met het rapport (23,83 → 47,68) is precies wat V44 verklaart |
  | `kandidaten.*.wm_fase_oct` / `.mt_fase_oct` in het referentiebestand | tot V43 de OCTAAFGEKNIPTE maat, sinds V44 **M-K** | de oude waarden staan onder `*_octaafgeknipt_V43` en reproduceren nog steeds als controlekolom — dat is de brug (V15's vorm) |
  | élke A5.5-fasetracking in het paneel en in `goldenCasus1.test.ts` | tot V43 de OCTAAFGEKNIPTE maat, sinds V44 M-K met beide controles ernaast | zie hierboven |

  **Wat er NIET uit volgt:** dat een besluit uit V30–V43 onjuist was. Geen enkel van die besluiten hing aan een fase-DREMPEL — casus 1 stelt er geen — en de fase-kolommen waren daar rapportage. Wat wél volgt is dat een ZIN als "de tuner kocht hier fase" uit die entries in de eenheden van de verdachte maat staat, en dat het teken van zo'n beweging kan omslaan wanneer je hem in M-K herleest. Dat is niet hypothetisch: `compare-corpora.ts` drukt alle drie de kolommen af, en de V44-tabel hieronder laat rijen zien waar zij dat werkelijk doen.

  ---

  ---

  **DE VÓÓR/NÁ OP HET HELE VELD — en de meetlat is meeverhuisd, dus de tabel zegt het erbij.**

  Vijftien kandidaten, `'safety'` als barrièrebron, zelfde seed, zelfde poorten en budgetten
  (`compare-corpora.ts v43 live`). **Er staan sinds V44 DRIE fasekolommen per paar in plaats van
  twee, en zij komen alle drie uit hetzelfde rapport** — `M-K` is de maat, `octaaf (ctl)` en
  `overlap (ctl)` zijn de twee vervangen maten als controle. Dat de vóór-helft óók in M-K gemeten
  wordt is de hele reden dat deze tabel iets betekent: het V43-corpus is met de OUDE maat gezócht
  en met de NIEUWE nagemeten, dus er is precies één kolom waarin vóór en ná dezelfde grootheid
  dragen. Elke uitspraak hieronder over "beter" of "slechter" staat in die kolom; de twee andere
  zeggen alleen hoe groot de herdefinitie was. De aparte TUNERRUN per netlist is vervallen — sinds
  V44 leest de tuner dezelfde functie als het rapport, dus die run zou dezelfde grootheid op een
  ander raster afdrukken (V40 mat dat verschil op hoogstens 1,5°).

  | kandidaat (W-M · M-T) | min \|Z\| vóór | min \|Z\| ná | @ Hz ná | vloer vóór → ná | SPL ± vóór → ná | W-M fase M-K vóór → ná | W-M fase octaaf (ctl) vóór → ná | W-M fase overlap (ctl) vóór → ná | M-T fase M-K vóór → ná | M-T fase octaaf (ctl) vóór → ná | M-T fase overlap (ctl) vóór → ná | RMS vóór → ná | dissipatie % vóór → ná | grootste R (W) vóór → ná | EPDR vóór → ná | Q_es× vóór → ná | smalste piek ná (dB @ Hz) | correctiegroepen vóór → ná | LF-bult dB vóór → ná | lift dB vóór → ná | opslingering dB vóór → ná | serie-L mH vóór → ná |
  |---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
  | 396.7 · 1294 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** |
  | 396.7 · 1491.4 | — | 2.58 | 226.33 | — → **ja** | — → 1.60 | — → 26.49 | — → 26.08 | — → 24.35 | — → 5.35 | — → 6.52 | — → 5.35 | — → 0.90 | — → 49.62 | — → 25.40 | — → 1.29 | — → 1.33 | 0.73 @ 2859.87 | — → trap×1 damped-trap×3 series-pad×4 shunt-pad×1 | — → 0.94 | — → 1.79 | — → -0.85 | — → 2.55 |
  | 396.7 · 1719 | 2.61 | 2.59 | 230.68 | **ja** → **ja** | 4.42 → 4.97 | 27.43 → 22.92 | 32.32 → 27.00 | 28.68 → 26.94 | 14.57 → 23.90 | 15.30 → 23.41 | 14.57 → 23.84 | 2.17 → 2.42 | 29.21 → 26.41 | 14.09 → 13.65 | 1.34 → 1.31 | 1.34 → 1.32 | — | trap×1 damped-trap×2 series-pad×3 shunt-pad×1 → trap×2 damped-trap×1 series-pad×2 shunt-pad×1 | 1.05 → 0.95 | 1.85 → 1.77 | -0.80 → -0.82 | 2.57 → 2.57 |
  | 396.7 · 1981.2 | 2.60 | 2.63 | 263.56 | **ja** → **ja** | 1.84 → 1.51 | 26.56 → 21.66 | 26.86 → 21.95 | 18.12 → 22.13 | 4.77 → 4.24 | 6.07 → 5.24 | 4.77 → 4.24 | 0.83 → 0.74 | 65.75 → 68.18 | 27.35 → 33.70 | 1.31 → 1.33 | 2.90 → 2.85 | — | damped-trap×1 shunt-shelf×2 series-pad×3 shunt-pad×1 → damped-trap×4 series-pad×3 shunt-pad×1 | 4.20 → 4.16 | 5.93 → 5.85 | -1.72 → -1.70 | 2.82 → 2.82 |
  | 396.7 · 2283.5 | 2.59 | 2.59 | 758.07 | **ja** → **ja** | 1.59 → 1.40 | 24.41 → 22.06 | 24.15 → 21.92 | 22.97 → 23.05 | 3.45 → 4.18 | 4.29 → 4.59 | 3.45 → 4.18 | 0.78 → 0.63 | 60.53 → 65.05 | 28.49 → 32.07 | 1.30 → 1.31 | 2.16 → 2.31 | — | damped-trap×3 series-pad×3 shunt-pad×1 → damped-trap×4 series-pad×3 shunt-pad×1 | 2.88 → 3.14 | 4.52 → 4.85 | -1.63 → -1.71 | 2.70 → 2.70 |
  | 466.5 · 1294 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** |
  | 466.5 · 1491.4 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** |
  | 466.5 · 1719 | 2.62 | **verworpen** | — | **ja** → — | 3.82 → **verworpen** | 15.84 → **verworpen** | 16.62 → **verworpen** | 18.16 → **verworpen** | 36.18 → **verworpen** | 41.54 → **verworpen** | 36.18 → **verworpen** | 2.12 → **verworpen** | 41.14 → **verworpen** | 13.93 → **verworpen** | 1.31 → **verworpen** | 1.74 → **verworpen** | — | damped-trap×2 shunt-shelf×1 series-pad×3 shunt-pad×2 → **verworpen** | 2.67 → **verworpen** | 3.34 → **verworpen** | -0.68 → **verworpen** | 2.92 → **verworpen** |
  | 466.5 · 1981.2 | 2.56 | 2.61 | 9578.79 | **ja** → **ja** | 2.29 → 3.87 | 22.57 → 11.30 | 20.93 → 10.88 | 17.58 → 15.34 | 13.68 → 16.97 | 19.85 → 23.03 | 13.68 → 16.97 | 1.49 → 1.81 | 48.85 → 51.01 | 17.22 → 18.71 | 1.31 → 1.30 | 2.03 → 1.88 | — | trap×2 damped-trap×1 series-pad×3 shunt-pad×2 → damped-trap×2 series-pad×3 shunt-pad×2 | 4.34 → 4.25 | 4.13 → 3.68 | 0.22 → 0.57 | 3.27 → 3.27 |
  | 466.5 · 2283.5 | 2.94 | 3.61 | 312.81 | **ja** → **ja** | 0.95 → 0.97 | 3.40 → 5.02 | 4.19 → 5.67 | 2.63 → 8.24 | 4.21 → 3.90 | 5.18 → 4.36 | 4.21 → 3.90 | 0.51 → 0.53 | 75.90 → 61.71 | 42.17 → 21.41 | 1.47 → 1.85 | 1.71 → 2.12 | — | zobel×1 shunt-shelf×1 series-pad×3 shunt-pad×1 → shunt-shelf×1 series-pad×2 shunt-pad×1 | 2.60 → 4.53 | 3.23 → 4.35 | -0.63 → 0.18 | 3.23 → 3.24 |
  | 548.5 · 1294 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** |
  | 548.5 · 1491.4 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** |
  | 548.5 · 1719 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** |
  | 548.5 · 1981.2 | — | **verworpen** | — | — → — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** | — → **verworpen** |
  | 548.5 · 2283.5 | 3.97 | 3.46 | 1078.09 | **ja** → **ja** | 1.09 → 0.86 | 5.54 → 4.65 | 6.06 → 5.16 | 5.85 → 5.15 | 3.52 → 4.14 | 4.35 → 4.87 | 3.52 → 4.14 | 0.56 → 0.47 | 46.02 → 58.41 | 24.87 → 30.92 | 2.06 → 1.78 | 1.78 → 1.99 | — | shunt-shelf×1 series-pad×2 shunt-pad×1 → zobel×1 shunt-shelf×1 series-pad×2 | 3.60 → 3.54 | 3.50 → 3.99 | 0.10 → -0.45 | 3.57 → 2.29 |

  **DE CORPUSGEMIDDELDEN, en dan de eerlijker vergelijking eronder.** Het corpus is van
  samenstelling veranderd — `466.5 · 1719` is eruit gevallen (de tweeterbescherming weigerde de
  tune) en `396.7 · 1491.4` is erbij gekomen — dus een corpusgemiddelde vergelijkt deels twee
  verschillende verzamelingen ontwerpen.

| grootheid | V43-corpus | levend corpus | |
| --- | --- | --- | --- |
| W-M fase, **M-K** | 18,0° | **16,3°** | −1,7 |
| W-M fase, octaafgeknipt (ctl) | 18,7° | 17,0° | controlekolom |
| W-M fase, overlapvenster (ctl) | 16,3° | 17,9° | controlekolom — **en het teken draait om** |
| M-T fase, **M-K** | 11,5° | **9,0°** | −2,5 — **maar zie hieronder: dit is de wissel en niet de ingreep** |
| M-T fase, octaafgeknipt (ctl) | 13,8° | 10,3° | controlekolom |
| M-T fase, overlapvenster (ctl) | 11,5° | 8,9° | controlekolom |
| RMS-vlakheid, gemiddeld | 1,21 dB | **1,07 dB** | vertekend door de wissel: 2,12 eruit, 0,90 erin |
| dissipatie (M-A), gemiddeld | 52,5 % | 54,3 % | +1,8 — een kolom, geen oordeel (P4) |
| grootste enkele weerstand | 24,0 W | 25,1 W | bij 100 W |
| haalt de gestelde vloer | 7 van 7 | 7 van 7 | |
| LF-opslingering boven het budget | 0 van 7 | 0 van 7 | 1,4 dB, V43 |
| kandidaten zonder netwerk | 8 van 15 | 8 van 15 | dezelfde telling, één andere naam |

  **De wissel vertekent twee van deze rijen en zij trekken naar tegengestelde kanten**, dus zij
  zijn zonder de tabel eronder niet te lezen. De vertrekkende `466.5 · 1719` droeg W-M 15,84° en
  M-T 36,18°, de aankomende `396.7 · 1491.4` draagt 26,49° en 5,35°: dat maakt het
  W-M-corpusgemiddelde te braaf (−1,7 waar de gedeelde rijen −3,72 doen) en het M-T-gemiddelde
  vals gunstig (−2,5 waar de gedeelde rijen +2,19 doen).

  **GEKOPPELD OP KRUISPUNT — zes van de zeven handovers komen in beide corpora voor, en dit is de
  vergelijking waarop de conclusie rust.** Zij haalt de wissel eruit:

| grootheid (zes gedeelde rijen) | V43-corpus | levend corpus | |
| --- | --- | --- | --- |
| W-M fase, **M-K** | 18,32° | **14,60°** | **−3,72** — beter op vijf van de zes rijen |
| W-M fase, overlapvenster (ctl) | 15,97° | 16,81° | **+0,84 — de andere kant op** |
| M-T fase, **M-K** | 7,37° | **9,55°** | **+2,19** — de prijs, en zij staat niet waar hij verwacht werd |
| RMS-vlakheid | 1,06 dB | 1,10 dB | +0,04 |
| dissipatie (M-A) | 54,4 % | 55,1 % | +0,8 |

  **WAT DIT LAAT ZIEN, in drie stukken.**

  **1. Op W-M is de reparatie precies wat zij hoorde te zijn, en het mechanisme is te zien.**
  `measure-v40-overlap-band.ts` op het V43-corpus telt per woofer→mid-rij vijf tot elf punten die
  alléén de oude tunerverzameling meetelde, en zij zijn op alle zeven rijen bijna allemaal hetzelfde
  ding: data onder de 396,7 Hz-meetgeldigheidsvloer. **Op vijf van de zeven rijen lazen die punten
  LAGER dan de punten die de twee verzamelingen DELEN** — op `V43_KAND_4` 2,07° tegen 26,72°,
  waardoor de tuner 16,86° zag terwijl de gedeelde punten 26,72° droegen. De ongeldige punten waren
  dus geen ruis maar een KREDIET: zij vertelden de zoektocht dat de lage kruising al goed stond.
  Trek ze eruit en de zoektocht gaat er alsnog voor werken — vandaar −3,72° op M-K. Op het levende
  corpus is het beeld omgekeerd: daar lezen de uitgesloten punten op zes van de zeven rijen juist
  HOGER dan de gedeelde (`KAND_V2_2`: 15,95° tegen 4,73°), want daar wordt niet meer voor betaald.
  (Die kolommen staan op het KETENRASTER van 96 punten en zijn dus een ontleding van het mechanisme,
  niet de rapportgetallen uit de tabel hierboven; M-K zelf staat in de eerste fasekolom.)

  **2. De prijs staat op M-T-fase, en dat was niet de verwachting.** De bouwsessie voorzag een
  tiende dB RMS of wat dissipatie; die zijn er ook (+0,04 dB en +0,8 procentpunt), maar het grootste
  verschil is M-T-fase: +2,19° gemiddeld, en op `396.7 · 1719` +9,33°. **Dat is REALLOCATIE en geen
  meetartefact, en dat is na te gaan in plaats van aan te nemen:** op mid→tweeter is M-K in twaalf
  van de dertien rijen van deze tabel op de honderdste graad gelijk aan de overlapvenster-controle
  — de ene uitzondering is `396.7 · 1719` ná (23,90° tegen 23,84°) — en
  `measure-v40-overlap-band.ts` telt in beide corpora op zes van de zeven M-T-rijen NUL
  alleen-tuner-punten (de zevende draagt er één). De toelating heeft daar dus niets
  weggenomen — wat de tuner op M-T leest is wat hij altijd al las. Wat wél veranderde is dat W-M
  eerlijk werd, en `phasePriority` 0,5 verdeelt één budget over twee kruisingen: de zoektocht koopt
  nu W-M en betaalt op M-T. Het rapport-getal voor M-T is wél verschoven (de octaafcontrole staat
  1,3° hoger dan M-K), maar dat is de herdefinitie en niet de zoektocht.

  **3. De tegenspraak die de leesinstructie voorspelde staat in de tabel.** In de eenheden van de
  oude tunermaat is W-M-fase over de gedeelde rijen VERSLECHTERD (+0,84°) terwijl M-K met 3,72°
  verbeterde; op `396.7 · 1981.2` is het per rij te zien — M-K −4,90° tegen overlapvenster +4,01°.
  Wie deze oplevering in de eenheden van V30–V43 zou navertellen, zou dus opschrijven dat V44 op de
  lage kruising fase heeft INGELEVERD — het tegendeel van wat er gebeurde, met een teken dat
  uitsluitend van de meetlat komt. Dat is exact de fout waar de leesinstructie hierboven voor
  bestaat, en zij is hier voor het eerst in een echte tabel te zien in plaats van beredeneerd.

  ---

  **NAZORG: DE ZIPS, en dit is een fout die eerst gerepareerd moest worden.** De drie V40-projecten heetten `V40-HUIDIG.zip`, `V40-KAND_V2_1.zip` en `V40-V38FIX_KAND_5.zip`. De tweede naam wijst naar een LEVENDE corpussleutel, en die is sinds de export twee keer opnieuw opgewekt (V42 en V43): de zip bevatte de V41-netlist (L1 = 5,391 mH) terwijl `KAND_V2_1` in de repo inmiddels 2,118 mH droeg, met een ander kruispunt (408,3 tegen 470,1 Hz) en een andere onderdelenlijst. Een aflezing uit die zip zou tegen de verkeerde rij van het getallenblad zijn gelegd. **Nagemeten en niet aangenomen:** de zip is waarde-voor-waarde `V41_KAND_1`. De export heet sindsdien naar de BEVROREN sleutel plus de commit (`V41_KAND_1@c5e848b.zip`), en `export-v40-vxp.ts` exporteert nog uitsluitend bevroren netlists — een levende kan als argument, maar wordt niet meegeleverd omdat zijn zip bij de eerstvolgende regeneratie een ander netwerk zou beschrijven onder dezelfde naam.

  **NAZORG 2: TWEE DOCUMENTATIEVELDEN ZIJN MET DE HAND BIJGESCHREVEN, en het hoort hier te staan.**
  `meetopstelling.fase_toelating` en `..._waarom` zijn bij V44 aan `generate-casus1-v2-candidates.ts`
  toegevoegd terwijl de regeneratie al liep, dus het herkomstbestand dat die run schreef mist ze.
  Opnieuw draaien kost bijna vijf uur en is er niet voor gedaan; de twee velden zijn nageschreven,
  de tekst LETTERLIJK uit de generatorbron gelezen zodat de eerstvolgende regeneratie hetzelfde
  bestand oplevert. **Dat de RUN zelf de keuze wél droeg is nagegaan en niet aangenomen**, uit twee
  dingen die de run zelf opschreef: `meetopstelling.beschermingen_via_kandidaat` — een lijst die uit
  de verklaring wordt afgeleid en niet met de hand geschreven — noemt `phaseAdmission`, en het
  `facts`-ingrediënt van de vingerafdruk is bewogen (`eafd901a` → `3e82255c`), wat precies de zesde
  meetfeit-sleutel is die V44 toevoegde. De live-reproductie in `casus1V2Candidates.test.ts` is de
  derde en hardste controle: zij draait de bevroren netlist opnieuw door de échte route.

  **Het getallenblad is meeverhuisd.** `measure-v40-phase.ts` zet M-K vooraan met zijn band, zijn puntental en zijn afwijzingen per grond, en de twee oude maten erachter als controle. De vraag aan VituixCAD is daarmee veranderd: zij was "welke van deze twee reproduceert", zij is nu "reproduceert M-K" — een VALIDATIE van een gebouwde maat in plaats van een scheidsrechter tussen twee ongebouwde. De band waarop afgelezen moet worden staat per rij, want die is niet meer uit het kruispunt af te leiden.

- V45 (30/31-08-2026 — **BREAKING, alleen v2-runs**: A5e.2 gesloten — het niveau-anker wordt een gestelde eis, en de doelcurve stuurt eindelijk óók de zoektocht) — geparkeerd sinds F1, dringend verklaard bij V43, hier beslist. **Twee van de drie verwachtingen waarmee deze sessie begon bleken bij het meten onjuist, en dat is de belangrijkste inhoud van deze entry.**

  **WAT HET WAS.** A5d.4(a) wil het ankerniveau NA baffle step in de beoogde opstelling. Dat is een eigenschap van het doelcurve-object, en dat object bestond alleen als vocabulaire: `flat` werkte, `tilt` en `hold-current` weigerden netjes, en verder was er niets. Daardoor stonden er sinds F1 drie dingen stil, en pas bij elkaar opgeteld is het een gat:

  - `verankerde_gaps_dB` vergeleek de KALE gemeten niveaus en droeg een `status`-veld dat zei dat zijn waarden geen acceptatiecriterium waren;
  - `worker.ts` gaf de A5d.6-inversie `gapBudgetDb: null` onder een `TODO(A5e.2)`, dus `gap-pad-r` sloeg élke weg over en een ontwerper die `dampingMarginDb` invulde kreeg een veld dat op de zoekroute niets deed (V23 telde het als het derde dode budget, F4b maakte het zichtbaar zonder het te repareren);
  - en — het gat dat niemand had opgeschreven — een gesteld doelcurve-object werd sinds F3 door het OORDEEL gelezen (A5e.1: venster en RMS-afwijking) en door de ZOEKTOCHT niet. `bandStd` meet de spreiding van de som rond haar eigen bandgemiddelde, dus "perfect" is per definitie een rechte lijn. Een ontwerp werd GEZOCHT tegen vlak en GEOORDEELD tegen een plateau, en van die twee heeft de zoektocht het hele iteratiebudget: zij wint, en het oordeel legt de nederlaag vast.

  ---

  **STAP 1 — METEN VÓÓR STELLEN, EN TWEE VERWACHTINGEN SNEUVELDEN.** `scripts/measure-a5e2-anchor.ts` (nieuw, seconden, geen ketenrun) drukt vier tabellen af: het gerealiseerde basplateau per bevroren netlist in vier bandlezingen, de baffle step uit de gemeten kastbreedte, M-E op de laagste weg, en de gerealiseerde verzwakking per weg tegen het verankerde gap-budget.

  **De baffle step klopte, als enige van de drie.** `baffleStepHz(260) = 442,3 Hz`, tegen een verwachting van ~440.

  **HUIDIG's plateau is −1,08 dB en niet −2 à −3.** De ver-veldgeldigheidsvloer van deze sessie is 396,7 Hz en f_p van de woofer is 52,4 Hz: bijna drie octaven ertussen. De voorgeschreven band `[f_p, W-M-overname]`, geclipt op meetgeldigheid zoals voorgeschreven, is daarmee geen plateau maar een **sliver van een kwart octaaf (396,7–466,4 Hz) die BOVEN de baffle step ligt**.

  | | geclipt (397–466) | ongeclipt (52–466) | ongeclipt tot eigen kruispunt |
  | --- | --- | --- | --- |
  | HUIDIG | **−1,08** | −1,94 | −2,04 |
  | KAND_A | −1,24 | −1,59 | −1,59 |
  | KAND_B | −0,80 | +0,05 | +0,05 |

  De −2 à −3 dB verschijnt alleen in de ongeclipte kolommen, en die lezen ver-velddata waarvan A5b.1 zegt dat zij er niet is.

  **HUIDIG's Q_es-vermenigvuldiging is 2,31 en niet 1,3 à 1,4.** Dat is niet eens een nieuwe meting: het staat als klasse-B-referentie in dit casusboek (`kandidaten.HUIDIG_2e.Qes_mult`). Nagemeten: HUIDIG 2,31 op R_e = 3,05 Ω (2,37 op de 2,90 van de inversie), KAND_A 2,51, KAND_B 1,84; het levende corpus 1,32–2,85. **De schatting van 1,3 à 1,4 stond op R8 alleen** — de niveauweerstand — en niet op de HELE serieweerstand van het pad, waar M-E over gaat: HUIDIG draagt 3,756 Ω padweerstand. Een gestelde 1,3 à 1,4 zou alle drie de referentiefilters van de ontwerper hebben veroordeeld, wat exact de fout is die V42 maakte en V43 moest terugdraaien.

  **En de derde meting is de scherpste, want zij veroordeelde een heel mechanisme.** De gerealiseerde verzwakking per weg, tegen het verankerde gap-budget dat `gap-pad-r` erop zou loslaten:

  | netlist | woofer A / budget | mid (ANKER — budget 0 per definitie) | tweeter A / budget |
  | --- | --- | --- | --- |
  | HUIDIG | doorlaatband **leeg** (kruispunt 359,7 Hz ligt onder de vloer) | **7,51** | 0,00 / 3,44 |
  | KAND_A | 7,24 / 0,89 | **8,64** | 0,00 / 3,44 |
  | KAND_B | 4,59 / 0,89 | **8,98** | 0,00 / 3,44 |

  Drie dingen tegelijk. De woofer betaalt 4,6–8,5 dB tegen een budget van 0,89. De **ankerweg** — die per A5d.4 nul budget krijgt omdat zij het niveau is waar alles naartoe komt — is in élk referentiefilter de zwaarst gepadde weg. En op HUIDIG is de wooferdoorlaatband leeg, dus daar is niet eens een |Z|-referentie om de grens op te lossen.

  **De bevinding daaronder is een bevinding over het MODEL en niet over de getallen:** serieweerstand in een passieve tak doet filterwerk — Q-vorming, impedantievlakking, spoel-DCR — en niet alleen niveauwerk, en A5d.4 drukt dat niet uit. Een plateau-krediet van 1 à 3 dB dekt geen van die gaten. `gap-pad-r` gewapend op casus 1 knipt niet de weerstandsvlucht af; het veroordeelt het hele casusboek, inclusief de drie referentiefilters. Dat is de V42-fout in een nieuwe jas, en zij is hier vóór het stellen gevangen in plaats van erna.

  ---

  **DE BESLISSING, en zij is op drie punten anders dan de opdracht.**

  **(1) Het plateau wordt GESTELD op 2,5 dB en is NIET gemeten.** De tussenstap die geprobeerd is en faalde staat erbij, want zij is het bewijs dat de eerlijke route dicht zit. Het voorstel was: de 396,7-vloer is de MID-geldigheid die op de som wordt toegepast, de woofer-FRD's zijn NF/FF-gemerged en dragen geldige data lager, dus leg hun werkelijke LF-geldigheid vast en meet het plateau alsnog. **Alle drie de helften van die premisse zijn nagemeten en geen ervan houdt stand.** (a) Alle vijf de ver-veldbestanden dragen dezelfde ARTA-gate — referentietijd 2,5 ms, rechtervenster 5,021 ms — dus 396,7 Hz is de EIGEN header van `woofer_up_hor_0.txt` net zo goed als van `mid_hor_0.txt`. (b) Die wooferbestanden zijn geen merge: `Source file = woofer up hor 0.pir`, FFT 32768, kale gepoorte ver-veldmeting, met de nabije velden als aparte `.pir`-opnamen die het manifest als `NF` tagt. Er is geen merge-herkomst om vast te leggen. (c) En de controle die als beslissingsregel was gesteld — "mid weglaten onder de vloer beweegt het plateau < 0,1 dB" — faalt vijfvoudig: **−0,514 dB op HUIDIG** (KAND_A −0,452, KAND_B −0,322), gemeten op een reconstructie van de som die bit-identiek is aan wat het rapport zelf oplevert. De som onder 400 Hz rust dus meetbaar op takken zonder geldigheid.

  **Dieper dan alle drie:** dit plateau is uit deze meetset niet te meten zonder eerst de baffle-step-DIEPTE aan te nemen die de eis juist bedoelt — de NF/FF-merge zet haar terug met `baffleStepDepthDb` als knop. Dat is circulair. Het getal is daarom gesteld met de opstelling als motivering (< ~50 cm van de achterwand, de wandbijdrage vult het laag in-room aan) en draagt in het manifest hardop het veld `basplateau_waarom_niet_gemeten`. **Hermeten na een groundplane-meting** is de open entry.

  **(2) `qesMultiplierMax` wordt 2,4 — het strengste getal op één decimaal dat HUIDIG nog toelaat.** Dezelfde bewijs-haalbaar-vorm als de versterkervloer: het goedgekeurde ontwerp haalt de eis (3,756 Ω padweerstand tegen een plafond van 4,27 Ω op de R_e die deze route oplost), en zij bindt aantoonbaar — het V43-corpus loopt tot 5,795 Ω en het levende V44-corpus tot 5,651. KAND_A (2,51) valt erbuiten en krijgt daarvoor geen uitzondering in de eis.

  **(3) `gap-pad-r` gaat LEVEN maar wordt op casus 1 NIET gewapend.** De mechaniek steekt de grens over — dat is wat A5e.2 sluit — en casus 1 stelt geen dempingsmarge, dus zij levert daar geen grens (P4). De weerstandsvlucht wordt gedekt door `qesMultiplierMax` en door de doelcurve, niet door dit budget. Dat de inversie werkelijk bereikbaar is, is gemeten en niet beweerd: met een gestelde marge van 1 dB levert zij op HUIDIG's woofer 1,045 Ω. De vier-inversies-tabel van V25 staat daarmee op **4 van 4 bereikbaar**.

  ---

  **DE DOELCURVE ALS OBJECT.** `bass-plateau` is de derde vorm in het vocabulaire, en haar twee parameters komen met opzet uit tegengestelde bronnen (P6):

  - `plateauDepthDb` is GESTELD — hoeveel het on-axis laag bewust onder het anker ligt. Geen meting kan dat opleveren; het is een voicing-besluit over een opstelling.
  - `stepHz` is GEMETEN — `baffleStepHz` van de kastbreedte in `manifest_en_geometrie.geometrie.baffle_mm`, en van niets anders. Die maat is bij V45 aan het manifest toegevoegd; tot dan las niets in de engine haar en stond zij alleen in de projectinvoer van de app.

  De VORM is de eigen shelf van de app (`baffleStepShelfDb`), niet een tweede mening over baffle step. Een `bass-plateau` waarvan één helft ontbreekt levert GEEN offsets en noemt wat er miste; `tilt` en `hold-current` weigeren zoals altijd.

  **TWEE LEZERS VAN ÉÉN GETAL, en zij lezen het op twee manieren.** (a) A5d.4(a) — de verankerde gaps vergelijken elke weg op haar eigen DOELNIVEAU: de shelf, energiegemiddeld over de eigen niveauband van die weg, met het teken omgedraaid. Een weg die de voicing lager zet wordt dat bedrag gecrediteerd. (b) De zoektocht — sinds V45 meet de amplitudeterm de spreiding van (som − doel). Alleen VERSCHILLEN tussen wegen verplaatsen een anker, dus een curve die alle wegen even veel verschuift verandert het ankerblok niet, en dat is correct.

  **DE SLEUTELS.** `amplitudeReference` is CHOICE (`'flat'` = de historische term en élke v1-run; `'target'` = spreiding rond de voicing), `amplitudeTargetDb` is POLISH — de doelcurve van het ONTWERP, gesampeld door de kant die hem al heeft. Vijfde paar in dezelfde vorm als V33, V34, V37 en V44; sleuteltelling 46 → 48, verdeling 31/5/10 → 32/5/11. **Niet te verwarren met `ampTarget`**, en de namen liggen ongelukkig dicht bij elkaar: die kiest WELKE som vlak gemaakt wordt (on-as of luistervenster), deze wat er als vlak TELT voor die som. Twee sleutels, twee vragen. De verklaring leidt hem af zoals V30 `zFloorBarrier` afleidt, met **drie** toestanden in plaats van twee — geen curve, een `flat` curve (de identiteit, dus niet wapenen: een mechanisme dat aantoonbaar niets kan bewegen hoort niet in een run te staan alsof het iets deed) en een curve die iets zegt.

  **HET VERANKERDE BUDGET STEEKT OVER ALS MEETFEIT.** Zevende feit in `MeasurementFactsPayload`, met de ANKER-naam ernaast, en die naam is nodig: "deze weg heeft geen verzwakkingsbudget" heeft twee betekenissen die niet gelijk mogen lezen — het anker heeft er per definitie geen, elke andere weg zonder budget mist een meting. Er is geen terugval en er mag er geen zijn: de ketenkant heeft geen ver-veldniveaus en geen A5d.3-vensters, dus alles wat zij zelf zou uitrekenen is een slechtere tweede implementatie van A5d.4 (de les van F4b-lek 1). Het `facts`-ingrediënt van de vingerafdruk telt daarmee zeven feiten.

  **WAT HET MET DE VERANKERDE GAPS DOET, in getallen.** De shelf, energiegemiddeld over de eigen niveauband van elke weg, crediteert de woofer +1,27 dB, de mid +0,84 en de tweeter +0,21. Omdat alleen VERSCHILLEN tellen wordt het wooferbudget 0,895 → **1,328 dB** en het tweeterbudget 3,444 → **2,818 dB**. `verankerde_gaps_dB` is daarmee van een blok met een `status`-veld dat zei dat zijn waarden niet meetellen een ACCEPTATIECRITERIUM geworden; de oude waarden staan als gedateerde brug ernaast (de handberekening van 25-08: 1,5 en 4,1; de engine op kale niveaus: 0,895 en 3,444), en de golden-suite assert dat de brug reproduceert **mét** de tegenproef dat de nieuwe waarden daar aantoonbaar van verschillen. Het blok blijft klasse A: alle drie de referentiefilters leveren hetzelfde ankerblok, nagemeten.

  **DE ASYMMETRIE DIE F4b MOEST OPBIECHTEN IS WEG.** Tot V45 werd de dempingsmarge in het RAPPORT toegepast en op de ZOEKROUTE niet; beide oppervlakken inverteren nu dezelfde grens uit dezelfde verankerde budgetten. De `TODO(A5e.2)` bestaat niet meer in `worker.ts` — `grep` bevestigt het en `borderFacts.test.ts` assert het.

  ---

  **HET V43-OPEN PUNT: DE GELEVERDE-NETWERK-TOETS.** `bump-series-l` lost zijn plafond op bij de padweerstand van het ZAAD en daarna ligt het vast, terwijl de zoektocht die padweerstand vrij mag verhogen — en meer serieweerstand DEMPT de resonante helft. Het stale plafond is dus conservatief en niet fout, maar "conservatief" is niet hetzelfde als "veilig" en niemand had gemeten welke van de twee het was. Sinds V45 wordt het GELEVERDE netwerk op `resonantDb` tegen hetzelfde gestelde budget getoetst, in V31-vorm: weigering met reden, netwerk ingetrokken. De refusal draagt `by: 'stated-budget'` en `kinds: ['budget']` en leent de categorie van de poort NIET — een aanroeper die op `by` schakelt zou anders te horen krijgen dat een poort sprak terwijl er geen poort was (A3g). De toetsing hergebruikt `lfBump` op hetzelfde raster en dezelfde gemeten impedanties als de poortreferentie en het rapport, dus paneel en run kunnen het niet oneens zijn.

  **Het stale plafond zelf blijft een OPEN PUNT.** De inversie iteratief heroplossen tijdens de tune is een eigen sessie — het vraagt een netwerkoplossing per evaluatie — en of hij ooit nodig is, is nu meetbaar: als deze toets nooit vuurt, kost de staleness niets.

  ---

  **NOG EEN OPEN PUNT, GEMETEN EN NIET VERMOED: de Q_es-eis is strenger dan haar eigen metriek.** De eis is uitgedrukt in M-E (`q = 1 + R_s/R_e`, met R_s de Thévenin-bronweerstand op f_p), maar de A5d.6-inversie kan alleen de DC-SERIEWEERSTAND van het pad begrenzen — dat is het enige wat in een zoekruimte staat. Die twee lopen op dit casusboek **naar beide kanten** uiteen. Waar de weg reactantie in zijn eigen pad draagt leest M-E HOGER (HUIDIG +0,08, `V28_KAND_2` +0,12). Waar er een SHUNT over de driver staat leest M-E LAGER, want die shunt verlaagt de bronimpedantie die de driver werkelijk ziet: op `V43_KAND_1` is dat 2,17 Ω tegen 4,46 Ω padweerstand, dus q = 1,71 waar de inversie op 2,46 begrenst. **Gevolg: op een netlist met een shunt kan de eis zoals gehandhaafd een ontwerp weigeren dat M-E zou goedkeuren.** Dat is de veilige kant — te streng en nooit te ruim — maar het is een eigenschap die alleen een meting kan vaststellen, dus zij staat in het manifest en in `frozenNetlistGates.test.ts` en niet in een aanname.

  ---

  ---

  **DE VÓÓR/NÁ, en zij is GEMENGD — dat staat hier vooraan omdat het de eerlijke lezing is.** Het veld is opnieuw opgewekt met de doelcurve, de Q_es-grens en het verankerde budget alle drie gewapend: **5 u 56 min** voor vijftien ketenruns (513–3762 s per kandidaat), de duurste regeneratie tot nu toe. Zeven kandidaten leverden een netwerk en alle zeven haalden de shortlist, precies als bij V44; één rij eruit (`396.7 · 1719`, verworpen door de vloerpoort op 2,55 Ω) en één erin (`396.7 · 1294`).

  | grootheid | V44 | V45 | richting |
  | --- | --- | --- | --- |
  | netlists in de shortlist | 7 van 15 | 7 van 15 | gelijk |
  | halen de gestelde vloer | 7 van 7 | 7 van 7 | gelijk |
  | **M-D LIFT** (de resistieve helft) | 3,8 dB | **3,2 dB** | **omlaag** |
  | M-D bult (`extraDb`) | 3,1 dB | 2,3 dB | omlaag |
  | M-D opslingering | −0,7 dB | −0,9 dB | ruim binnen het budget |
  | totale serie-L laagste weg | 2,8 mH | 2,7 mH | vrijwel gelijk |
  | **dissipatie (M-A)** | 54,3 % | **60,4 %** | **omhoog** |
  | grootste enkele weerstand bij 100 W | 25,1 W | 30,9 W | omhoog |
  | **W-M fase (M-K)** | 16,3° | **25,3°** | **slechter** |
  | M-T fase (M-K) | 9,0° | 8,1° | iets beter |
  | Q_es-grens overschreden | 1 van 7 (`V44_KAND_5`, 5,65 Ω) | **0 van 7** | de eis bindt |

  **DE Q_es-GRENS BINDT AANTOONBAAR, en niet alleen statistisch: twee van de zeven netlists landen EXACT op het plafond** (`KAND_V2_1` en `KAND_V2_4`, allebei 4,27 Ω padweerstand tegen een plafond van 4,27). Dat is een zoekruimte die tegen haar wand aan ligt, en het is het scherpste bewijs dat de grens de zoektocht werkelijk stuurt in plaats van achteraf te oordelen.

  **DE LIFT IS OMLAAG GEGAAN, en dat is precies wat V43 vroeg.** V43's tweede helft mat dat de zoektocht een begrensde spoel compenseerde met serieWEERSTAND en dat de lift daardoor van 3,1 naar 3,8 dB liep — "een onbewaakte uitweg", in de woorden van die entry. Die uitweg is nu dicht: 3,8 → 3,2 dB, met de spoel op zijn plaats (2,8 → 2,7 mH). Twee mechanismen tegelijk deden dat en zij zijn niet te scheiden zonder een derde arm: de Q_es-grens plafonneert de weerstand die de lift veroorzaakt, en de doelcurve maakt het bas-niveau dat die weerstand kocht een DOEL in plaats van een afwijking.

  **MAAR DE DISSIPATIE IS GESTEGEN EN DE W-M-FASE IS SLECHTER, en dat wordt hier niet weggeschreven.** De weerstand is niet verdwenen maar VERPLAATST: de Q_es-grens bewaakt alleen de LAAGSTE weg, en het corpus telt sindsdien meer shunt-pads (7 → 9) en meer series-pads (19 → 20) op de andere twee. Dissipatie is op casus 1 een KOLOM en geen eis (P4), dus niets veroordeelt dat — maar het is exact het patroon dat V43 op de spoel zag, één weg opgeschoven, en het hoort in de open punten. De fasedegradatie op W-M (16,3 → 25,3°) is de tweede prijs; zij is bovendien ONGELIJK verdeeld — `396.7 · 1491.4` gaat van 26,5° naar 60,0° — en op een casus die geen fase-eis STELT veroordeelt ook dat niets. **Wie de volgende sessie doet begint hier**, en de vraag is of `qesMultiplierMax` per weg hoort te bestaan in plaats van alleen op de laagste.

  ---

  **TWEE BEWAKERS BLEKEN NIET TE BEWAKEN WAT ZIJ BELOOFDEN, en allebei zijn zij door deze sessie zelf betrapt.**

  · **De feiten-dekkingsassert in `determinism.test.ts` telde zijn EIGEN lijst.** Er stond `expect(Object.keys(variants).length).toBe(6)` onder een commentaar dat beloofde dat élk veld van `MeasurementFactsPayload` erboven geoefend wordt — precies om te voorkomen dat een nieuw feit ongetest in de vingerafdruk meelift. V45 voegde twee velden toe, schreef geen varianten, en de telling was nog steeds 6: groen. Een bewaker die telt wat een sessie met de hand bijhoudt, kan niet zien wat die sessie vergat. De veldenlijst komt nu uit de BRON van het payload-type (de techniek die `choiceKeyGuard.test.ts` op `NetOptimizeOptions` gebruikt), met de assert twee kanten op, en nagemeten dat hij kán falen: één variant weghalen noemt het vergeten veld bij naam.

  · **`freeze-live-corpus.ts` accepteerde een verkeerde bestandsprefix zonder mokken.** Het corpus is bevroren met `V44_KAND` waar de conventie `V44-KAND` is. De referentie-SLEUTELS kwamen gewoon goed — de `-`→`_`-herschrijving is een no-op op een underscore — dus het manifest las `V44_KAND_1` zoals bedoeld, terwijl de BESTANDEN `V44_KAND-1` heetten in een casusboek waar elk ander corpus `V43-KAND-1` heet, en de corpusomschrijving "HET GEDATEERDE V44_KAND-CORPUS" werd. Niets faalde. Hernoemd, en het script weigert de vorm nu met de reden erbij.

  ---

  **WAT ER NIET GEBOUWD IS.** Geen tilt en geen in-room-doel (optie C, expliciet uitgesteld). Geen LCR-generatie. Geen wijziging aan het anker zelf als grootheid — het blijft de stilste weg, en de haalbaarheidswaarschuwing van A5d.4(b) staat ongewijzigd. Geen fasemaat-wijziging: M-K staat, en Sanders VituixCAD-validatie loopt parallel en blokkeert niet — status ongewijzigd sinds V44. Geen dempingsmarge op casus 1. En geen v2-default die een casus-1-getal is: de plateaudiepte en de Q_es-grens staan uitsluitend in `manifest_en_geometrie.gestelde_eisen` en de fixture leest ze daarvandaan.

- V46 (31-08-2026 — **geen gedragswijziging**: de CI-laag, en de A5e.4-precisering die eronder ligt) — de deploy stond stil sinds F3c omdat GitHub Actions `npx vitest run` draaide en die run daar niet groen kán worden. Dit is de meting die uitlegt waarom, en de taakverdeling die eruit volgt.

  **WAT HET WAS.** `.github/workflows/deploy.yml` draaide de VOLLE suite op ubuntu/Node 22 en publiceerde daarna naar Pages. Zeven — met de `it.each`-uitrol acht — van die tests vergelijken een LIVE herberekend netwerk BYTE-VOOR-BYTE met een opgeslagen fixture: `f4cRegression` (drie × twee zaden), `workerRouteRegression` (één) en de live ketenrun in `casus1V2Candidates` (één). Die fixtures zijn opgenomen op darwin/arm64 onder Node 26. Zij faalden op CI, de workflow brak vóór de build, en de site bleef op de F3c-versie van 26-08 staan. Vier opleveringen lang.

  **DE MEETUITSLAG, en zij is scherper dan "floating point verschilt een beetje".** Op DEZELFDE machine, met alléén de Node-versie anders (26 → 22):

  | | Node 26 | Node 22 |
  | --- | --- | --- |
  | `avgDevDb` van het ZAAD (vast netwerk, geen zoektocht) | 1,1610824868774228 | 1,1610684586317268 |
  | L1 na de tune | 3,005 mH | **3,034 mH** |
  | C·R9 | 13,61 Ω | **7,08 Ω** |
  | evaluaties | 102 259 | 91 194 |

  Het zaad wijkt af op het VIJFDE significante cijfer — dat is een vast netwerk waar geen enkele zoektocht aan te pas komt, dus het verschil zit in de bibliotheekfuncties zelf. En de simplex is een deterministische afdaling door een multimodaal landschap: die 1e-5 aan het begin stuurt hem naar een ánder lokaal optimum, en dan is C·R9 bijna een factor twee anders. Daarnaast wijkt linux-x64/Node 22 op zijn beurt af van darwin-arm64/Node 22, dus **platform en runtime dragen onafhankelijk bij**.

  **AFRONDEN REPAREERT DIT NIET, en dat is de reden dat er geen "los" antwoord bestaat.** Bij een verschil in het laatste bit zou een `toPrecision`-stap volstaan. 3,005 tegen 3,034 mH is een ander ONTWERP, en een vergelijking die dat doorlaat bewaakt niet meer wat zij moet bewaken: precies de klasse fout die `f4cRegression.test.ts` in zijn eigen kop beschrijft ("een baseline die wordt herberekend uit de code die zij moet bewaken, bewaakt niets"), één laag verder.

  ---

  **DE PRECISERING VAN A5e.4, en zij is een precisering en geen versoepeling.** A5e.4 belooft dat twee runs met dezelfde seed byte-identiek zijn. Die belofte staat en is niet geschonden — maar zij geldt **per (machine, runtime)**, en dat stond nergens opgeschreven. Over machines heen geldt **equivalentie binnen de tolerantieklassen**, wat precies de vorm is die het casusboek voor élke andere referentie al gebruikt. **Een corpus dat elders wordt opgewekt is daarmee een LEGITIEM ander corpus en geen regressie**; wie op een andere machine regenereert krijgt zijn eigen, even geldige veld, en de klasse-A/B-referenties horen daar gewoon te reproduceren.

  Daaruit volgt waar de byte-referenties hun eigen herkomst horen te dragen, en dat is V15's procesregel één laag verder: een referentie die van een parameter afhangt legt die parameter vast, en een byte-referentie hangt meetbaar af van machine en runtime. Sinds V46 dragen `f4b2_v2_baseline.json` en `f4b2_v2_worker_baseline.json` een `opgenomen_op`-blok (met de hand nagedragen, en dat staat erbij), en `generate-casus1-v2-candidates.ts` schrijft het voortaan zelf in `casus1_v2_herkomst.json`.

  ---

  **DE TAAKVERDELING: CI BEWAAKT DE NATUURKUNDE, DE LOKALE SUITE BEWAAKT DE BYTES.** De acht niet-portable vergelijkingen dragen de tag `[bytes]` en `npm run test:ci` filtert hem weg, naast `[live]`. Twee tags op één geval is geen dubbelop maar het antwoord op twee vragen: `[live]` is PLANNING (dit kost twintig minuten), `[bytes]` is DRAAGWIJDTE (dit is niet portable).

  **De volle run verandert niet en blijft de acceptatie-autoriteit.** Wat CI draait is een deelverzameling, geen vervanging, en de `[bytes]`-tests blijven de verplichte lokale acceptatie vóór elke commit. Zij zijn niet zwakker geworden — alleen niet overal draaibaar.

  **En wat er dan op CI overblijft is met opzet de helft die er niet aan lijdt, gemeten en niet aangenomen:** op linux-x64/Node 22 reproduceerden `goldenCasus1` (46), `goldenClassification` (12) en `frozenNetlistGates` (49) volledig. Dat is geen toeval maar een eigenschap: klasse-A/B-referenties zijn rekenwerk op BEVROREN netlists, zonder zoektocht, dus er is geen simplex die op een 1e-5 een andere kant op kan lopen, en zij horen op élk platform binnen hun tolerantieklasse te reproduceren. **Wijkt díé laag af, dan is het een echte bug** — en dat is precies de claim die het waard is om bij elke push te draaien.

  ---

  **DE TAAKVERDELING IS ZELF NIET ZELFDRAGEND, en daarom is er een bewaker.** Zij bestaat uit een regex in `package.json` en een tag in een testnaam, en allebei kunnen stil groeien — de valkuil die V43 voor `[live]` opschreef, één tag verderop. `ciLayer.test.ts` sluit twee gaten tegelijk: (1) iemand tagt er nog een test bij en de CI-laag wordt leger zonder dat iets faalt, en (2) een van de DRAGENDE referentiebestanden krijgt een tag en verdwijnt uit CI — waarmee de enige claim die CI nog draagt verdwijnt. Vandaar een INVENTARIS in plaats van een belofte: de vijf getagde bronnamen staan voluit, zodat wie er een bij tagt hier langskomt en moet opschrijven wat hij uit CI haalt. De tagnamen worden op runtime samengesteld, om dezelfde reden als in `noAppWideFloor.test.ts` én om een tweede: `-t` matcht de VOLLEDIGE testnaam, dus een bewaker die het woord letterlijk in zijn eigen titel draagt filtert zichzelf uit de laag die hij bewaakt.

  De lijst van dragende bestanden staat met opzet UITGESCHREVEN, terwijl dit project afgeleide lijsten verkiest. De reden is dat er niets is om uit af te leiden: *"welke tests moeten op elk platform reproduceren"* is een BESLUIT en geen eigenschap van de boom. Wat wél afgeleid wordt is of ze nog bestaan en of ze getagd zijn.

  **WAT ER NIET GEBOUWD IS.** Geen enkele wijziging aan engine-code, aan V45 of aan het corpus. Geen poging om de byte-vergelijkingen portable te maken — dat zou betekenen dat je de tolerantie zo ver oprekt dat zij een ander ontwerp doorlaat, en dan kan de vergelijking net zo goed weg. Geen tweede CI-job op macOS: dat zou de bytes wél kunnen bewaken, maar het is een uitgave (runners, wachttijd) tegen een claim die de lokale suite vóór elke commit al hard maakt, en het is opgeschreven als optie in plaats van gebouwd.

- V47 (31-08-2026 — **BREAKING, alleen v2-runs**: de tweeterbescherming wordt een GESTELDE eis, en de meting keerde de aanleiding om) — de opdracht verwachtte dat de relatieve beschermingsregel te streng was. Zij was te LOS, en dat is de hele entry.

  **DE HOOFDBEVINDING, en zij staat vooraan omdat zij het ontwerp raakt en niet de code.** Het V45-veld heeft twee netlists GELEVERD die de tweeter op zijn eigen resonantie tien dB harder aandrijven dan het goedgekeurde ontwerp: `V45_KAND_5` op **−14,38 dB** en `V45_KAND_6` op **−15,10 dB**, tegen HUIDIG's −25,08. Zij stonden in de shortlist, klaar om te bouwen. Niets veroordeelde ze — en de reden dat niets ze veroordeelde is niet dat de bewaking te soepel stond, maar dat zij op een ANDERE band keek (zie de dekkingsvraag verderop). Beide zijn nu met naam, waarde en grens geregistreerd in `manifest_en_geometrie.v45_corpus.aandrijfuitzonderingen`, in het V30-vlagpatroon: boekhouding en geen vrijstelling, en `frozenNetlistGates.test.ts` herrekent ze.

  **WAT ER STOND.** De volle-band-veiligheidspoort van de tuner weigerde een tune in zijn geheel zodra het beschermingstekort van het geleverde netwerk meer dan 3 dB² boven dat van het ZAAD lag (`protSqDb`, het gemiddelde kwadratische tekort van de elektrische takoverdracht boven −15 dB, onder `xoF/3`). Casus 1 stelde niets op M-C, dus dit was het enige dat de bovenste driver van elk paar bewaakte. Een relatieve regel, en dat is de eerste helft van wat eraan mankeert: wat zij toestaat beweegt mee met wat het zaad toevallig droeg, en zij wordt toegepast IN PLAATS VAN een gestelde eis in plaats van ernaast. De tweede helft is erger en is pas bij de dekkingsmeting hieronder gevonden: haar BAND bereikt de tweeterresonantie op deze casus helemaal niet.

  **DE INVENTARISATIE, en zij is de reden dat deze sessie iets anders is geworden dan zij van plan was.** Alle vier de V45-kandidaten die de zaadregel weigerde zijn opnieuw gedraaid en hun weigering is ontleed.

  | kandidaat | zaad `protSqDb` | tune | speling | M-C van de geweigerde tune |
  | --- | --- | --- | --- | --- |
  | 466,5 · 1491,4 | **0,000** | 11,818 | 3,0 | **−8,56 dB** |
  | 466,5 · 1719 | **0,000** | 15,969 | 3,0 | **−3,43 dB** |
  | 548,5 · 1719 | **0,000** | 21,458 | 3,0 | **−12,29 dB** |
  | 548,5 · 1981,2 | **0,000** | 9,653 | 3,0 | **−6,82 dB** |

  Het zaad mat NUL — perfecte bescherming — dus de regel oordeelde tegen de scherpst denkbare referentie, precies zoals de opdracht vermoedde. Maar wat zij weigerde was geen bijna-goed ontwerp: die tunes drijven hun slechtst beschermde weg aan op −3,4 tot −12,3 dB, en dat zijn echte schendingen van de eis die deze sessie stelt.

  **DAT ZIJ ZE VING IS ECHTER NIET DE VERDIENSTE DIE HET LIJKT, en de dekkingsmeting verderop zegt waarom: zij ving ze op de MID en niet op de tweeter.** De beschermingsband loopt tot `xo/3` en de mid-f_s (88,8 Hz) valt daar bij elk W-M-kruispunt binnen; de tweeter-f_s (924 Hz) valt er nooit binnen. Dezelfde regel liet daarom de twee netlists uit de hoofdbevinding gewoon door — niet omdat hun zaad slecht was, maar omdat zij daar niets meet.

  **DE M-C-KOLOM WAS EERST LEEG, EN DAT WAS GEEN MEETFOUT.** `runCandidate` wist `rejectedParts` voordat het resultaat de worker verlaat (V31: een kandidaat die niets levert mag niets uitleveren dat iemand als netlist kan wegschrijven), dus van buitenaf is een geweigerd netwerk principieel onmeetbaar — en een leeg vakje leest als "geen resonantie" terwijl het "geen onderdelen" betekent. De worker meet M-C sinds V47 zelf op die onderdelen, via dezelfde `evaluateGates` waarmee hij een gelevérd netwerk oordeelt, en zet het als `rejectedTune.driveOnFsDb` in de weigering. Daarmee is van élke weigering leesbaar of zij een ontwerp gekost heeft dat de eis wél haalde.

  ---

  **DE DEKKINGSVRAAG, EN ZIJ IS HET SCHERPSTE STUK VAN DEZE SESSIE: DEKT DE ABSOLUTE EIS WAT DE RELATIEVE DEKTE?** De twee zijn verschillende grootheden — `protSqDb` is het gemiddelde kwadratische tekort boven de beschermingsvloer, GEÏNTEGREERD over de band onder `xo/3`; M-C leest ÉÉN punt, de eigen resonantie. Om die vraag te kunnen stellen is de regel uit de tuner gelicht naar `lib/protectionDeficit.ts` — één implementatie, twee lezers, dezelfde vorm als `impedanceFloor.ts` — en als CONTROLEKOLOM opgenomen in `compare-corpora.ts` en in de guards, in de vorm die V44 voor de fasematen invoerde: gerapporteerd, nooit een poort.

  **HET ANTWOORD, EN HET IS ABSOLUUT: DE RELATIEVE REGEL HEEFT IN 117 BEVROREN NETLISTS GEEN ENKELE KEER EEN TWEETERPROBLEEM GEREGISTREERD.** Op het tweeterpaar leest zij **exact 0,000 dB² op élke netlist van het hele casusboek** — inclusief de twee die de eis met tien dB overschrijden. Dat is geen soepeler versie van de eis; het is een maat die daar niets meet.

  **EN ZIJ IS NIET STUK, wat de vorige zin pas een bevinding maakt:** elders in het boek leest zij wél boven nul — `V38FIX_KAND_5` op 1,226 dB², `V37_KAND_3` op 0,063, `V33_KAND_5` op 0,018 — en die tekorten komen alle drie van een paar waarvan de bovenste weg **niet** de tweeter is.

  **TWEE EERDERE VERSIES VAN DEZE CLAIM WAREN TE BREED EN DE DATA HEEFT ZE ALLEBEI GEDOOD**, en dat hoort erbij omdat het de vorm bepaalt waarin zij nu staat. De eerste zei dat geen enkele netlist boven `3·f_s` = 2773 Hz kruist — er zijn er drie (`V28_KAND_2` 3949 Hz, `V28_KAND_1` 3818, `V33_KAND_10` 3312). De tweede zei dat geen netlist die de eis MIST zo hoog kruist — dat zijn er twee (`V28_KAND_1` op −19,38 dB, `V28_KAND_2` op −22,87). **Wat overbleef is sterker dan beide en heeft geen bandrekensom nodig:** ook op díé twee, waar de band de resonantie wel degelijk bereikt, leest de maat nul. Hoog genoeg kruisen is dus NOODZAKELIJK noch VOLDOENDE — de tweeteroverdracht is daar nog steeds onder de vloer, terwijl M-C op f_s tien dB erboven zit.

  De TEGENPROEF maakt het onontkoombaar: schaal élke condensator van HUIDIG op, en M-C loopt van −25,08 via −15,92 en −10,39 naar **+9,75 dB** — de tweeter tien dB BOVEN zijn doorlaatbandniveau op zijn eigen resonantie — terwijl `protSqDb` de hele weg exact 0,000 blijft. Het mechanisme is dat `xoF` meezakt met de capaciteit (2250 → 404 Hz), dus de band beweegt WEG van f_s in plaats van ernaartoe. De maat kan de fout per constructie niet naderen.

  **WAT ZIJ DAN WÉL MAT, op deze casus: de MID.** Diens f_s ligt op 88,8 Hz en valt bij elk W-M-kruispunt boven 266 Hz binnen de band — dus overal in dit veld, en dáár komen de drie tekorten hierboven vandaan. Het verklaart ook de weigeringen: de vier geweigerde tunes dragen M-C op de mid van **+4,5 / +0,5 / −1,7 / −5,3 dB**, en dát is waarop `protSqDb` vuurde. **De melding "tweeter protection got worse" ging op casus 1 dus over de mid.** De naam beschreef de bedoeling en niet de meting.

  **WAT ER OPEN BLIJFT, en dit is wat er vóór de LCR-vraag op tafel hoort.** De eis dekt op de tweeter STRIKT MEER dan de regel die zij vervangt, en op de mid dekt zij het RESONANTIEPUNT maar niet de hele band eronder — daar is de vervangen regel een integraal en de eis een punt. Een ontwerp dat op f_s netjes is en elders onder `xo/3` niet, is met wat er nu staat niet te betrappen. Op het huidige veld is dat geen open gat maar een onbewezen aanname: de controlekolom leest nul op alle vier de levende netlists, dus er is niets om te betrappen. Zij staat er juist om dat te blijven meten wanneer het veld verandert, en de eerste netlist die M-C haalt met een tekort boven nul is een bevinding die de vorm van de eis opnieuw ter discussie stelt.

  ---

  **WAT ER GESTELD IS.** `tweeter_drive_op_fs_max_dB = −25,0`, langs dezelfde weg als `qesMultiplierMax`: HUIDIG meet −25,084 dB op zijn slechtste beschermde weg, dus dat is de strengste waarde op één decimaal die het eigen referentiefilter van de ontwerper nog toelaat. Bij −25,1 zou HUIDIG veroordeeld worden — de V42-fout, niet herhaald.

  **DE EIS OORDEELT ÉLKE HOOGDOORLAATBESCHERMDE WEG, en op casus 1 is dat er twee.** Het getal is van een TWEETER-meting afgeleid en de mid wordt meegeoordeeld. Dat is nagegaan vóór het stellen en niet erna: HUIDIG leest −42,61 op de mid, KAND_A −46,83, KAND_B −34,17 — ruim eronder, dus de eis veroordeelt daar niets. **Op KAND_B is de slechtste weg trouwens de MID en niet de tweeter** (−34,17 tegen −35,18), wat laat zien dat "de tweeterwaarde" en "de waarde waarop de eis bijt" niet hetzelfde zijn. De midkolom bestond nog niet en is bij V47 gemeten (`scripts/measure-v47-drive.ts`).

  **WAT ER GEBOUWD IS.** De poort wordt gewapend langs het bestaande A5a-pad (`v2.gates.maxDriveOnFsDb`), waarmee ook de A5d.6-inversie `drive-series-c` invoer krijgt — de vier-inversies-tabel staat daarmee op 4 bereikbaar, 3 gewapend (`gap-pad-r` blijft ongewapend per A5e.2). Daarnaast één nieuwe keuze-sleutel: `protectionRule` (`'seed'` = default en historisch, `'stated'` = de zaadvergelijking vervalt). **Zij is de eerste van deze familie ZONDER polish-partner**, en die afwezigheid is het argument: waar `'stated'` naar wijkt is `maxDriveOnFsDb`, dat al als POORT op de wire staat en door dezelfde poortmachinerie geoordeeld wordt die de shortlist leest. Een tweede kopie ernaast is precies wat de vijf paren vóór haar vermijden. Sleuteltelling 48 → 49, verdeling 32/5/11 → 33/5/11.

  ---

  **DE VÓÓR/NÁ (`compare-corpora.ts v45 live`), en zij is drastisch.**

  | | V45 | V47 |
  | --- | --- | --- |
  | bevroren netlists | 7 | **4** |
  | kandidaten die geen netwerk leverden | 8 van 15 | **11 van 15** |
  | M-C op de slechtst beschermde weg, gemiddeld | −24,6 dB | **−28,5 dB** |
  | boven de gestelde −25,0 | **2 van 7** | **0 van 4** |
  | W-M fase M-K, gemiddeld | 25,3° | 13,1° |
  | M-T fase M-K, gemiddeld | 8,1° | 3,9° |
  | dissipatie, gemiddeld | 60,4 % | 62,2 % |
  | LF-lift / opslingering, gemiddeld | 3,2 / −0,9 dB | 4,7 / −1,1 dB |

  **DE FASEWINST IS SELECTIE EN GEEN AANKOOP, en dat hoort er hardop bij.** De opdracht vroeg of de doelcurve-sturing van V45 nu meer W-M-fase koopt. Het antwoord is nee: de corpusverbetering van 25,3° naar 13,1° komt vrijwel geheel doordat de twee netlists die 52,4° en 60,0° droegen het veld verlaten hebben — en dat zijn exact de twee die de nieuwe eis overschreden. Op de VIER overlevenden beweegt W-M nauwelijks en soms de verkeerde kant op (18,9→21,6 / 19,8→19,2 / 5,3→4,8 / 3,9→6,7). Wie de tabelregel zonder deze zin leest, schrijft een verbetering toe aan een mechanisme dat haar niet geleverd heeft.

  **WAT DE EIS KOSTTE, en dit is de eerlijke minpost.** Van de drie netlists die uit de shortlist vielen waren er twee schenders — die horen weg. De derde, `466,5 · 1981,2`, mat in V45 **−25,54 dB** en haalde de eis dus. Met de poort gewapend liep diezelfde kandidaat een ander pad, landde op −22,6 en werd in zijn geheel geweigerd. **Een gewapende poort is geen passieve waarnemer**: `gateViolation` weigert stappen en verlegt de zoektocht, dus zij kan een ontwerp kosten dat zonder haar aan haar voldeed. Dat is geen argument tegen de eis, maar het is wél de reden dat het veld van zeven naar vier ging en niet van zeven naar vijf.

  **EN DE MID KREEG VOOR HET EERST EEN GETAL.** In de weigeringsredenen van de geregenereerde run staat vier keer M-C op de MID: **+4,5 / +0,5 / −1,7 / −5,3 dB** — aangedreven op of BOVEN zijn doorlaatbandniveau op zijn eigen resonantie. De zaadregel vúúrde daarop (zie de dekkingsvraag), maar zij deed het zonder ooit een getal te noemen dat iemand kon nalezen, en het casusboek noteerde alleen `V_tweeter_op_fs_dB`. De eis vangt het nu mee mét de aflezing, en de kolom per WEG (`manifest_en_geometrie.v47_bescherming`) is wat het zichtbaar houdt.

  ---

  **DE REGENERATIE KOST GEEN ZES UUR MEER MAAR ZEVENENTWINTIG MINUTEN, en dat is een blijvende opbrengst los van V47.** `generate-casus1-v2-candidates.ts` draaide zijn vijftien ketenruns sequentieel op ÉÉN kern — 4 u 23 bij V41, 4 u 52 bij V43, 5 u 56 bij V45 — op een machine met achttien kernen. Dat is geen rekentijd maar wachttijd. Het script roept zichzelf nu aan met `V2_ONLY=<n>`, één proces per kandidaat, en voegt de shards samen in KANDIDAATVOLGORDE (nooit in de volgorde waarin zij klaar kwamen — dan zou de shortlist van de planning afhangen). **Gemeten: 1624 s tegen 21 357 s bij V45.**

  Het mag omdat er nergens in `netOptimizer.ts` of in `engine2/` module-scope mutable state staat — nagegaan en niet aangenomen — dus twee kandidaten kunnen elkaars uitkomst niet zien. **En het is GEMETEN in plaats van beredeneerd:** drie kandidaten zijn met de poort nog ongewapend als shard gedraaid en hun geleverde netlist is BYTE-IDENTIEK aan `KAND-V2-5`, `KAND-V2-6` en `KAND-V2-1` uit het V45-corpus. `V2_SEQUENTIAL=1` houdt de oude weg als arm om tegen af te zetten. A5e.4 blijft gelden zoals V46 hem preciseerde: byte-identiek per (machine, runtime), en een kind draait op dezelfde machine en runtime als zijn ouder.

  ---

  **DEZELFDE VAL VOOR DE DERDE KEER, EN NU IS ZIJ UITGESCHREVEN.** De V37-assert in `frozenNetlistGates.test.ts` claimt dat de dissipatieterm op de PIEKHOOGTE de uitdagingsdrempel van 1 % nooit haalt — de reden dat V37 hem naar R_e verplaatste. Die assert viel om op `KAND_V2_1`, met 1,053 %. **De term is niet gegroeid; de NOEMER is gekrompen.** Hij deelt door het objectief van de netlist zelf, en het objectief krimpt naarmate het veld vlakker wordt — de gewapende M-C-poort liet alleen de vlakste ontwerpen door, en `KAND_V2_1` draagt met RMS 0,48 het vlakste objectief van het hele boek.

  Dat is exact het mechanisme dat V41 al een keer mat (toen deelde de assert door de kleinste RMS van het HÉLE casusboek en sloeg zij om zodra V41 het veld vlakker maakte). De reparatie van toen — elke netlist tegen zijn EIGEN objectief — was juist en heeft het mechanisme niet weggenomen: elke vaste drempel op een aandeel-van-het-objectief beweegt mee met de kwaliteit van het veld. **De drempel is daarom NIET opgerekt** — dan zou zij precies zo ver meebewegen als nodig is om groen te blijven, en dat is geen bewaker meer. De strikte claim is GEANKERD op de netlists waarop V36 en V37 hem gedaan hebben (de gedateerde corpora, waar hij onveranderd staat op 0,736 %), dezelfde herankering die V43 op `v42_bult_bevinding` toepaste en om dezelfde reden. En het levende veld krijgt de claim die V37 werkelijk draagt, op élke netlist: de twee noemers liggen een ORDE VAN GROOTTE uit elkaar (1,05 % tegen 42,2 % op `KAND_V2_1`). Die vorm kan niet stil verouderen wanneer het veld beter wordt.

  **EEN BEWAKER HEEFT GEWERKT, EN HET WAS DE V42-VAL VOOR DE TWEEDE KEER.** `casus1V2Candidates.test.ts` bouwde zijn eigen poortblok (`{ ampMinLoadOhm }`) in plaats van `CASUS1_V2_GATES` te lezen. Toen V47 M-C wapende armde de generator twee poorten en de test één — dus de "reproductie door de échte route" zou een ANDERE route gedraaid hebben dan de route die de netlist maakte. Zijn eigen assert (`Object.keys(armedGates)` tegen `v2_poorten_gewapend`) ving het. Gerepareerd met de vorm die `casus1V2.fixture.ts` in zijn eigen kop voorschrijft: één definitie, gespreid op de gebruiksplek.

  **EN ÉÉN PLEK WAAR DE EIS NIET AANKWAM.** `frozenNetlistGates.test.ts` bouwt zijn rapporten met een eigen `BASE`-instellingenblok, en dat droeg wél de gestelde vloer en niet de gestelde aandrijfgrens — dus het rapport drukte `no limit set` af naast netlists die er in de RUN wel aan gehouden waren. De eis hoort in beide, om dezelfde reden als bij de vloer: het rapport is wat een mens leest. Gespreid, zodat een casus die niets stelt niets wapent.

  **WAT ER NIET GEBOUWD IS.** Geen wijziging aan de beschermings-inversie `drive-series-c` zelf en niet aan `safety`. Geen wijziging aan de relatieve regel op de v1-route: `protectionRule` afwezig is byte-identiek, en dat is als test vastgelegd op een run die de vergelijking WÉL bereikt. Geen v2-default die een casus-1-getal is: −25,0 staat uitsluitend in `manifest_en_geometrie.gestelde_eisen` en de fixture leest hem daarvandaan. Geen wijziging aan de plateau-eis. Geen LCR-generatie.

  **DE LCR-/PARALLEL-R-VRAAG, GEACTUALISEERD OP WAT ER NÁ DEZE POORT NOG GEWEIGERD WORDT.** Elf van de vijftien kandidaten leveren niets, en de redenen zijn nu leesbaar per kandidaat. Drie ervan missen de eis met minder dan 2,5 dB (−23,5 / −23,4 / −22,6) en drie struikelen (ook) over de versterkervloer. De vraag is daarmee scherper dan bij V43: **de zoektocht heeft op de lage kruisingen geen gereedschap om de tweeter onder de eis te krijgen zonder de belasting of de vlakheid op te offeren.** En de dekkingsmeting hierboven zegt waaróm dat gereedschap ontbreekt: de enige knop die de zoektocht heeft is de serie-C verkleinen, en die verlaagt de aandrijving op f_s door het KRUISPUNT op te schuiven — wat op de lage kruisingen precies is wat de kandidaat definieert. Een LCR over de driver verlaagt de PIEK zelf en ontkoppelt die twee. Een LCR over de driver op zijn resonantie verlaagt de PIEK zelf en zou precies daar ruimte maken; een serie-C verkleinen is wat de zoektocht nu al probeert en het botst op de vloer. Openstaand blijft verder: de twee posten uit V41 (`audit.fbHz`, het grijze `costWeight`); of `qesMultiplierMax` per weg hoort te bestaan in plaats van alleen op de laagste (V45); groundplane-metingen onder het onderste kruisgebied vóór onderdelenbestelling; HD-sweep; 30°-meting tweeter voor M-G-compleetheid.

  ---

  **GEDATEERDE CORRECTIE OP DEZE ENTRY (01-09-2026, V47-nazorg). De tabellen en tellingen hierboven zijn ONAANGERAAKT gelaten; wat hier staat corrigeert ze, in de errata-vorm die rij 11 van de A3j-bijlage al draagt.** Een entry die achteraf wordt bijgeslepen is niet meer na te lezen als het verslag van wat er die dag gemeten is; een correctie eronder is dat wel.

  **(1) HET ZIJN VIER VLOER-WEIGERINGEN EN GEEN DRIE.** De LCR-alinea hierboven zegt *"drie struikelen (ook) over de versterkervloer"*. Nageteld op de verse run van het slotrapport zijn het er vier: `396,7 · 1294` (2,52 Ω), `466,5 · 1294` (1,94 Ω), `548,5 · 1294` (2,06 Ω) en `548,5 · 1491,4` (0,02 Ω), alle vier tegen de gestelde 2,60 Ω, en alle vier met een M-C-overschrijding ernaast. De strekking van de alinea verandert niet — de vraag was en blijft dat de zoektocht op de lage kruisingen geen gereedschap heeft om de tweeter onder de eis te krijgen zónder de belasting op te offeren — maar hij wordt er ietsje scherper van: het is niet drie van de elf maar vier, en drie van die vier zijn het laagste M-T-kruispunt van het veld.

  **(2) DE VÓÓR/NÁ-TABEL DROEG TWEE COMPOSITIE-EFFECTEN, EN DE ENTRY VING ER ÉÉN.** Een corpusgemiddelde is een gemiddelde over de netlists die het corpus toevallig bevat, en een eis die netlists verwijdert verandert het zonder één netwerk aan te raken. Bij de fase is dat hierboven met zoveel woorden gezegd (*"de fasewinst is selectie en geen aankoop"*), en die alinea blijft juist — maar het GETAL ernaast in de tabel niet: gepaard over de vier kandidaten die in beide corpora staan gaat W-M van **11,96° naar 13,06°**, dus iets de verkeerde kant op, waar de tabelregel 25,3° → 13,1° afdrukt. Bij de DISSIPATIE is dezelfde val niet opgemerkt en zij wijst de andere kant op: de regel 60,4 % → 62,2 % leest als een verslechtering, terwijl diezelfde vier netlists van **69,05 % naar 62,23 %** gingen. Het corpusgemiddelde beschrijft dus het VELD en de gepaarde delta de INGREEP, en alleen de tweede mag als verbetering of verslechtering gelezen worden.

  Sinds deze nazorg drukt `compare-corpora.ts` naast élk corpusgemiddelde de gepaarde lezing af, met het aantal paren erbij, en `corpusPairing.test.ts` reproduceert beide gevallen op de bevroren corpora. De ankerproef ernaast is `V30 → V32`, en zij is volledig gedateerd: V32 heeft geen enkel ontwerp veranderd en alleen drie netlists ingetrokken, dus daar is élke gepaarde delta exact nul terwijl de corpusgemiddelden 19,2 → 27,0 % dissipatie en 17,3 → 20,4° fase afdrukken. Dat is hetzelfde effect zonder één bewegend netwerk eronder, en het is de scherpste vorm waarin de leesregel te tonen is.

  **(3) DE BEVINDING OVER DE ZAADREGEL IS EEN REGEL IN DEEL A GEWORDEN.** Wat V47 op casus 1 mat — een relatieve bewaking die aan het zaad hangt bewaakt het toeval van het zaad, en een bandbegrensde integraal bereikt een driver alleen waar zijn band de resonantie bevat — is generiek geformuleerd toegevoegd aan A2, met de band bij rij 31 van de A3j-bijlage. Deze entry is daar het casusbewijs onder; er staat geen casus-1-getal in de specificatie.

### UI-1 — de shortlist is de bron van de Working-tab (01-09-2026)

**AANLEIDING.** Sander draaide op de live site (`fb8f211`) een v2-run op casus 1 met gestelde eisen:
4 van de 9 kandidaten haalden de shortlist, de bovenste op 0,49 dB RMS. En de Working-tab was
**leeg** — *"No generator — add a source element. No drivers — nothing to listen to."* Erboven een
groene regel: *"Design ready — the winner is loaded in the Working tab"*. De grafieken toonden de
ongefilterde drivers gesommeerd (±16 dB, fase P95 175°) en vier statusbadges beoordeelden die som
alsof het een ontwerp was. Klikken op een shortlist-rij deed niets.

**HET MECHANISME, en het is opgebouwd uit drie stappen die elk apart verdedigbaar zijn.**

1. **De v1-ranglijst kent geen enkel v2-oordeel.** `rankChain3Results` weegt vlakheid, fase, prijs
   en belasting. Zij weet niets van een poort, niets van een eis en niets van een wholesale-
   weigering. Op de v2-route kon zij dus een kandidaat kronen die v2 had weggegooid — en dat deed
   zij: Sanders "winner" op 396,7/1294 Hz met Z min 0,8 Ω is een kandidaat die de veiligheidspoort
   in zijn geheel geweigerd had.
2. **Een geweigerde kandidaat draagt geen onderdelen.** V31 wist `parts` én `net.parts` voordat het
   resultaat de worker verlaat — met opzet, zodat niemand een zaad dat niemand beoordeeld heeft als
   netlist kan serialiseren. Wat V31 níét wist is `net.after`: die cijfers beschrijven het netwerk
   dat geweigerd is en zijn het verslag erover. Vandaar de 0,8 Ω in de regel: een echte meting aan
   een netwerk dat niet bestaat.
3. **Dus landde er een lege onderdelenlijst in de Working-tab.** `setWorkingDesign([])` zet
   `networkActive` er onvoorwaardelijk achter, en daarmee stond de app in een toestand waar zij geen
   woord voor had: een actief ontwerp zonder onderdelen. De editor meldde "No generator", de
   grafieken sommeerden de kale drivers, en de badges gaven die som een cijfer.

Elk van de drie stappen is voor zich correct. Samen leveren zij een groene regel die liegt.

**DE BEVINDING DIE ERONDER LIGT: DE UI-LAAG NA `handleV2Request` LAG BUITEN ELKE TEST.** De
workerroute heeft `workerRouteRegression`, de shortlist heeft `shortlist.test.ts`, de weigering
heeft `wholesaleRejection.test.ts` én sinds V31 een eigen live ketenrun. Wat de app vervolgens
mét die shortlist deed was vanaf de eerste v2-oplevering tot nu ongetest — en het was al die tijd
fout. Nagegaan en niet aangenomen: geen enkel testbestand noemt `workingDesign`, `WORKING_ID` of
`applyScanCandidate`.

**WAT ER GEBOUWD IS: ÉÉN FUNCTIE, IN DE V32-VORM.** `optimizer/selection.ts` —
`selectFromShortlist(shortlist, label?)` levert óf een ontwerp óf een getypeerde reden waarom er
geen is (`no-run` / `nothing-feasible` / `refused` / `unknown-label` / `empty-network`). De regel is
daarmee een WAARDE in plaats van een reeks `setState`-aanroepen binnen een bestand van achttienduizend
regels, en `selection.test.ts` (8 claims) leest hem zonder browser. `App.tsx` past het antwoord toe
via exact dezelfde `applyScanCandidate` die de scan-tabel altijd al gebruikte — zelfde velden,
zelfde volgorde — zodat een shortlist-rij en een scan-rij niet verschillend kunnen landen.

De vijfde reden, `empty-network`, is de wacht op het mechanisme zelf. Zij hoort onbereikbaar te
zijn (een weigering wordt nooit een rij) en staat er omdat een lege lijst die de Working-tab
bereikt precies dit incident is; haar zin zegt dan ook dat het een bugmelding is en geen
ontwerpbesluit.

**DE CLAIM DIE ER HET MEEST TOE DOET is niet "er wordt niets geladen".** Het defect was niet dat er
niets laadde — het was dat er iets ánders laadde. De zin bij een lege shortlist sluit de
v1-ranglijst daarom bij naam uit, want "0 van 9 gekwalificeerd" en "hier is de v1-winnaar" stonden
tegelijk op het scherm en waren allebei waar.

---

**STAP 0 — DE DEMODATA OP DE SITE TEGEN `test-fixtures/casus1`. HET IS EEN ANDER BESTAND, ÉN DE
AFLEIDING LIET DE HEADER VALLEN.**

Per bestand gehasht, header gelezen en de kromme herbemonsterd naast de fixture gelegd:

| bestand | n | vensterheader | grootste \|ΔdB\| tegen casus 1 |
| --- | --- | --- | --- |
| `mid-hor0.txt` | 500 | 5,021 / 2,5 → T 2,521 ms | **0,001** |
| `tweeter-hor0.txt` | 500 | 5,021 / 2,5 → T 2,521 ms | **0,001** |
| `woofer-pair-hor0.frd` | 500 | **geen** | 0,002 tegen `woofer_up ⊕ woofer_down` (complex) |

De demobundel **is** casus 1, herbemonsterd op een 500-punts logaritmisch raster. De mid en de
tweeter zijn de fixturebestanden tot op een duizendste dB. Het wooferbestand is de complexe SOM van
`woofer_up_hor_0` en `woofer_down_hor_0` — een legitieme afleiding, want de app tekent één
wooferweg — en **die afleiding schreef de ARTA-vensterregels weg**. Wat ervoor in de plaats kwam is
een prozaregel: `* bron: ARTA gated 5.021 ms, ref time 2.5 ms`.

**Twee parsers, één bestand, twee antwoorden.** `xoWindow.gateHeaderOf` (v1) accepteert de vorm
`ARTA gated 5.021 ms` en leest 5,021. `ingest/manifest.parseArtaHeader` (engine2) matcht op
VELDNAAM (`Naam = waarde`) en leest niets — en engine2 heeft bovendien de referentietijd nodig,
want de geldigheidsvloer is `1/T` met `T = rechter venster − referentietijd`. De v1-laag zag dus
een venster waar de v2-laag er geen zag.

**Wat dat kostte, gemeten in beide armen op dezelfde bundel:**

| | anker | wisselwaarschuwing | verdachte band |
| --- | --- | --- | --- |
| header weg (de site op 01-09) | **low** | nee | low |
| header hersteld | **mid** | ja | geen |

Dat is exact de inversie die `manualWindowAndLobing.test.ts` sinds F3b beschrijft, nu op de
demobundel in het echt. `mid` is ook het anker van de fixture (`goldenCasus1.test.ts` assert de
wisselwaarschuwing).

**DE REPARATIE IS DE DATA EN NIET DE PARSER.** De twee headerregels staan teruggezet op alle vijf
de afgeleide wooferbestanden, met in het bestand zelf waaróm: beide bronbestanden dragen ze
woordelijk, en een complexe som van twee gelijk gepoortte responsen heeft die poort. **De parser
blijft zoals hij is.** Hem proza laten lezen zou betekenen dat een willekeurige commentaarregel een
geldigheidsvloer kan zetten, en die vloer is A5b.1(i): hard, automatisch, bindend.

**EN DE KANTTEKENING IS EEN BLOKKADE GEWORDEN.** F3b's `suspectBands` drukte een waarschuwing af
BOVEN een verder compleet blok — anker, gap per weg, drie verzwakkingsbudgetten. Deze bundel bewijst
dat dat niet genoeg is: er stond een waarschuwing én er stond een anker, en dat anker was het
verkeerde. `anchoredGaps` weigert sinds UI-1 te rekenen zodra één niveau op een band rust zonder
afgeleide poortvloer, en `report.predesign.gapsBlocked` draagt de reden. **Op ÉLKE weg en niet
alleen op de weg die het anker zou worden**: het anker is per definitie de STILSTE weg, dus je weet
pas welke weg de rol draagt als je elk niveau gelooft, en een niet-anker met onbekende vloer
overdrijft zijn eigen gap en zijn eigen budget. De uitweg is een INVOER en geen schakelaar: de
header van het bestand, of de venstertijden in het A5a-formulier. Er is geen "reken toch"-knop.

De F3b-test is meeverhuisd en de inversie wordt er nog stééds gemeten — niet vervangen door "er
werd geweigerd", maar herberekend uit de eigen ongevloerde niveaus van het rapport, want anders is
de weigering een bewering die niemand kan narekenen.

---

**WAT ER VERDER GEREPAREERD IS, en het zijn allemaal varianten van één regel: een cijfer zonder
onderwerp is geen oordeel (F0).**

- **`not judged` is een eigen poortstatus.** Een poort met gestelde grens en een waarde van `null`
  is `active: true, pass: true` — met opzet, want "we konden niet kijken" mag niet als "hij faalde"
  gerapporteerd worden (`gates.ts`). De statuscel las die `pass` en drukte **`inside`** af: de
  sterkst mogelijke lezing van het zwakst mogelijke bewijs. De data was al eerlijk (`value: null`,
  `reason` begint met "not evaluated"); alleen de cel klapte drie toestanden tot twee. Live
  nagemeten: M-B/EPDR met grens 2,00 Ω en geen netwerk leest nu `not judged`.
- **Het v2-paneel zegt WAAR het over oordeelt.** Zonder netwerk stond er een volledige pagina
  tabellen die als een verdict over een ontwerp leest en dat over niets was. Het rapport draagt
  daarvoor sinds UI-1 `subject.network` — de naam van de netlist waarop het gebouwd is, of `null`.
  Een paneel dat leegte uit een patroon van afwezige rijen moet afleiden, is de app die haar eigen
  invoer zit te reconstrueren.
- **De voettekst noemde vier A5e-besluiten "parked" en drie ervan zijn genomen** — aggregatie bij
  F3, de doelcurve bij F3 en gesloten bij V45, determinisme bij F2. Er staat nu alleen nog wat
  werkelijk open is: het catalogusschema (A5e.3).
- **De v1-tabel blijft staan en is gedegradeerd.** Op de v2-route onder de kop *"v1 reading — not
  the route that made this run"*, zonder 🏆 en zonder ✗. Die ✗ kwam van de v1-bronweerstandsregel
  die de v2-route bij V34 heeft ingetrokken, en zij markeerde als mislukking precies de ontwerpen
  die de shortlist erboven goedkeurde. De REDEN blijft leesbaar in de tooltip, als
  *"v1 note (not applied on this route)"* — het oordeel is ingetrokken, de waarneming niet.
- **De Pareto-plot en een kostenkolom lezen de shortlist.** "Cost vs quality — the knee is yours to
  pick" is een plaatje van een KEUZE, en op de v2-route is de keuze de shortlist; hij tekende het
  hele v1-veld, dus de goedkoopste knik was geregeld een ontwerp dat de run al had weggegooid.
  Dezelfde rijenbouwer (`chain3ScanRow`), zodat een punt en een rij niet twee prijzen voor één
  ontwerp kunnen afdrukken. De shortlist kreeg bij dezelfde gelegenheid een BOM-kolom: de énige
  lijst waaruit een ontwerper kiest, was de énige lijst zonder prijs erin.
- **De verwerpingen staan voor het eerst op het scherm.** `shortlist.rejected` bestaat sinds V31 en
  niets renderde het ooit — wat de tweede reden is dat de lege Working-tab onverklaarbaar was: de
  kandidaat die de v1-tabel kroonde was er één van, en dit was de enige plek die dat wist.
  Zichtbaar met de weigerende regel, en met opzet niet klikbaar.
- **De lege toestand heeft een eigen zin gekregen.** `emptyNetworkLoaded` — actief ontwerp, nul
  onderdelen — staat naast `designShaped` in plaats van erin, omdat de twee lege toestanden andere
  zinnen zijn voor een lezer: "je hebt nog geen ontwerp gemaakt" en "er is een ontwerp geladen en er
  zit niets in". De eerste is waar iedereen begint; de tweede is een bug of een lege shortlist.

---

**A5e.2 HAD GEEN VELD. Sander zocht het en het was er niet.**

V45 gaf de engine `bass-plateau`, liet de doelcurve óók de zoektocht sturen en sloot A5e.2 erop. Wat
V45 niet deed was iemand een manier geven om er een te STELLEN: de app las `activeDesign.targetCurve`
op vier plaatsen en schreef hem nergens, het opslagtype in `project.ts` kende de vorm niet, en het
paneel drukte "Target curve: flat" af als een feit over elke run ooit gemaakt. Drie gaten, alle drie
stil.

Er staat nu een besturing onder de kop *"Engine v2 — voicing (A5e.2)"*, en de tweedeling van A5e.2
is in de UI terug te zien: **de DIEPTE wordt gesteld** (een besluit over waar deze luidspreker komt
te staan; geen meting levert hem) en **de OVERGANG wordt gemeten** — de baffle step van de kastbreedte,
afgeleid bij het LEZEN en nergens opgeslagen. Een opgeslagen overgang zou een meting in een ontwerp
bevriezen en verouderen zodra de breedte gecorrigeerd wordt, onzichtbaar. Live nagemeten op de
demokast: 260 mm → **442 Hz**, en met een gestelde 2,5 dB leest de regel
*"bass-plateau — 2.5 dB below the flat part under a transition centred on the measured baffle step
at 442 Hz"*. Zonder diepte leest zij dat er niets tegen beoordeeld wordt (P4).

Twee dingen die daarbij bovenkwamen en gerepareerd zijn. **`saveActiveDesign` nam de voicing niet
mee**, dus elke bewaarde kopie zou stil vlak zijn geweest — precies de vergelijking die A5e.2
gemakkelijk moest maken, stil onmogelijk. En **`shortlist.ts` droeg een tweede implementatie van
"is deze curve bruikbaar"** (`isImplementedCurve = c.type === 'flat'`), waar tot V45 niets mis mee
was en die sinds V45 een werkende plateau-curve als onbeoordeelbaar rapporteerde — op de lijst
waarvan venster en RMS er zojuist tegen geoordeeld wáren. Zij vraagt het nu aan de functie die de
woordenschat bezit.

De run-noten openen sinds UI-1 met de voicing (`describeTargetCurve`). Zij is de meest ingrijpende
instelling van een run die nergens een spoor in een getal achterlaat: twee runs die alleen daarin
verschillen zien er overal identiek uit behalve in het stempel.

---

**WAT ER NIET GEBOUWD IS.** Niets aan de zoektocht, de shortlist-selectie, de poorten of het corpus.
Geen nieuwe drempel: de lobing-kolom is rapportage, `protSqDb`-stijl. Geen regeneratie. Op de
v1-route verandert niets — `selectFromShortlist` wordt daar niet aangeroepen en de commit-tak is
letterlijk de oude; `toggleRegression.test.ts` blijft groen.

**ÉÉN WIJZIGING GELDT WÉL IN BEIDE MODI, en dat is een besluit en geen slordigheid.**
`emptyNetworkLoaded` — actief ontwerp, nul onderdelen — zet `designShaped` uit ongeacht de toggle,
dus een lege ontwerptab scoort ook op de v1-route niet meer. Op de v1-route is die toestand
nauwelijks bereikbaar (er is geen wholesale-weigering die een onderdelenlijst leegt), maar F0 geldt
daar even hard: een cijfer over een leeg netwerk is geen oordeel, of de vlag nu aan of uit staat.
De toggle-invariant raakt het niet — die gaat over de v1-RANGLIJST en de geleverde netlist, en die
zijn letterlijk ongewijzigd.

**WAT ER GEMETEN IS EN NIET AANGENOMEN.** De demobundel tegen de fixture (hash, header, kromme). De
ankerinversie in beide armen. `not judged` in de draaiende app. De baffle step in de draaiende app.
Dat geen enkele test de Working-tab dekte.

**OPENSTAAND.** De lobing-kolom bouwt één rapport per shortlist-rij op de hoofdthread — meetbaar,
niet gemeten, en pas de moeite waard als een shortlist ooit veel langer wordt dan tien. En `tilt` /
`hold-current` blijven ongebouwd (A5e.2); de besturing biedt ze niet aan, wat beter is dan ze
aanbieden en weigeren.

### V48 — het opslingeringsplafond volgt de tune (02-09-2026, **BREAKING, alleen v2-runs**)

**AANLEIDING.** De A5d.6-inversie `bump-series-l` keert het LF-budget om naar een plafond op de
seriespoel van de laagste weg **bij een gegeven padweerstand**. Dat plafond werd één keer opgelost,
bij het zaad, en stond daarna vast voor de hele tune — terwijl de tune diezelfde padweerstand
verplaatst. V45 schreef dat op als open punt en beredeneerde het als veilig: meer serieweerstand
dempt de resonante helft, dus een plafond opgelost bij een lágere padweerstand is hoogstens te
streng. **Die redenering klopt in één richting en laat de andere weg.** Een tune die de
padweerstand VERLAAGT loopt onder een plafond dat voor een beter gedempt netwerk is opgelost, en
dat plafond is toegeeflijk. Sanders browserrun van 01-09 is de meting: twee van negen kandidaten
leverden **2,29 en 1,61 dB** opslingering tegen een gesteld budget van 1,4, en de
geleverde-netwerk-toets van V45 ving ze allebei. Terecht — maar vangen is verliezen. Dat waren
legitieme kandidaten die met een plafond over hun eigen netwerk gestuurd hadden kunnen worden in
plaats van aan het eind weggegooid.

**DE INVENTARISATIE, want de vormkeuze hangt eraan.** Het plafond wordt opgelost in
`invertBudgets` (`bounds.ts`), met `pathROhm: seriesPathResistance(seedParts, model)` uit
`worker.ts` — het ZAAD. De actuele padweerstand is in de tuner al leesbaar en al in gebruik:
`seriesPathIds` + `dcSeriesR` sommeren R en spoel-DCR over een vooraf opgeloste id-verzameling voor
de bronweerstandsgrens, een opzoeking en een optelling per evaluatie. En `projectSums` — de
projectie die de somplafonds handhaaft — draait al BÍNNEN de doelfunctie, dus plafonds worden al
per evaluatie gelezen; alleen `maxSI` stond stil.

**DE KOSTENMETING, en zij beslist tussen de twee vormen. Eén inversie kost 13 ms**: zestig
bisectiestappen, elk een volle `lfBump` over de gemeten NF en sweep. Een casus-1-kandidaat doet in
de orde van 100 000 objectief-evaluaties, dus de inversie per evaluatie aanroepen is **1296 s
rekenwerk voor één grens** — eenentwintig minuten per kandidaat, voor een bound. Vorm B
(*plafond als functie*) is daarmee onbetaalbaar zoals zij daar staat, en Vorm A (*herbereken bij
acceptatie*) zou het plafond binnen een pas achter laten lopen.

**GEKOZEN: VORM B, GEMÉMOÏSEERD OP EEN NAAR BENEDEN AFGERONDE KORREL.** De padweerstand wordt
gekwantiseerd naar `BOUND_CEILING_PATH_R_GRAIN_OHM` (0,05 Ω) en elke cel wordt één keer opgelost; een
tune bezoekt enkele tientallen cellen in plaats van honderdduizend punten. Daarmee is het plafond
per constructie een functie van het netwerk dat geëvalueerd wordt, en niet van het netwerk waarmee
de zoektocht begon.

**NAAR BENEDEN AFRONDEN IS WAT DE BENADERING VEILIG MAAKT IN PLAATS VAN ALLEEN KLEIN.** Het plafond
STIJGT met de padweerstand, dus de onderrand van de cel geeft een plafond dat op of onder het exacte
plafond bij het geëvalueerde punt ligt. Het volgende plafond kan dus alleen te STRENG zijn, nooit
toegeeflijk — dezelfde richting die de geleverde-netwerk-toets één laag verderop garandeert. Die
monotonie is **gemeten en niet aangenomen**: `lfBumpBorder.test.ts` loopt het hele bereik dat het
casusboek noteert af op de korrel zelf, en toetst de tracker daarnaast op punten die met opzet
NIET op de korrel vallen (het derde en het zevende tiende van een cel) — daar mag hij nooit boven
het exacte plafond lezen, en de prijs van die veiligheid blijft onder een procent van het plafond.
Dat past bij hoe `maxSeriesInductanceFromBump` zelf al met monotonie omgaat: hij laat zijn bracket
GROEIEN in plaats van monotonie in L aan te nemen.

**WAT ER NIET VERANDERD IS.** De inversieformule niet, het gestelde budget niet (1,4 dB blijft), en
de geleverde-netwerk-toets van V45 niet. Die laatste is ongewijzigd en **van betekenis veranderd
zonder van code te veranderen**: zij was het vangnet onder een bekend gat, en zij is nu de bewaking
dat het gat dicht is. Vuurt zij nog op een run waarvan het plafond meeliep, dan is de reparatie
onvolledig en niet de kandidaat verkeerd — en de weigering zegt dat sinds V48 met zoveel woorden,
in plaats van de oude uitleg af te drukken die dan niet meer waar zou zijn.

**DE SLEUTEL, EN WAAROM HIJ EEN KEUZE IS.** `seriesInductanceCeilingSource` (`'seed'` | `'tuned'`)
bepaalt WELKE GROOTHEID de zoekdoos begrenst, en dat is de A3j-test voor een keuze. Afwezig is
`'seed'`, dus elke v1-run en elke aanroeper die niets stelt zoekt het veld dat hij altijd zocht;
`f4cRegression` en `workerRouteRegression` reproduceren hun byte-baselines onaangeroerd. Hij is de
TWEEDE sleutel na V47's `protectionRule` die zonder polish-tweelingzus komt, en om dezelfde vorm van
reden: de gemeten NF en sweep die de inversie herleest reizen al mee binnen `valueSumCeilings`, dat
sinds F2 polish is precies omdat het data is die de run al vasthoudt. Sleuteltelling 49 → 50,
verdeling 34/5/11.

**HOE HET DE GRENS OVERSTEEKT.** Als een CLOSURE binnen de somgroep — dezelfde vorm die
`gateViolation` sinds F2 draagt — en nooit binnen `InvertedBound`, want die reist in het antwoord
van de worker en een functie overleeft geen `postMessage`. `invertBudgets` levert de trackers
daarom NAAST de bounds af. `runV2Optimization` krijgt er geen: die route neemt reeds opgeloste
bounds aan en heeft de metingen niet, dus een kandidaat die daar `'tuned'` stelt krijgt het
zaadplafond en geen verzonnen vervanging (P4).

---

**DE VÓÓR/NÁ, IN TWEE ARMEN OP ÉÉN BUILD.** `measure-v48-ceiling-tracking.ts` draait het hele veld
van vijftien kandidaten twee keer, met `seriesInductanceCeilingSource` als enige verschil. Dertig
ketenruns. De vier rijen die iets leveren staan hieronder; de overige elf kandidaten worden in
BEIDE armen door dezelfde poort geweigerd (M-C, en op de lage kruisingen ook de versterkervloer) en
het plafond verandert daar niets aan — wat klopt, want zij falen geen budget.

| kandidaat | arm | zaad-R | zaadplafond | eind-R | geleverde spoel | plafond bij eind-R | opsling. |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 396,7 · 1981,2 | seed | 1,560 Ω | 2,822 mH | 4,270 Ω | **2,822 mH** | 4,091 mH | 0,738 dB |
| 396,7 · 1981,2 | tuned | 1,560 Ω | 2,822 mH | 4,270 Ω | 3,982 mH | 4,091 mH | 1,337 dB |
| 396,7 · 2283,5 | seed | 1,310 Ω | 2,695 mH | 3,240 Ω | **2,696 mH** | 3,613 mH | 0,833 dB |
| 396,7 · 2283,5 | tuned | 1,310 Ω | 2,695 mH | 4,270 Ω | 4,044 mH | 4,091 mH | 1,373 dB |
| 466,5 · 2283,5 | seed | 2,399 Ω | 3,236 mH | 3,294 Ω | **3,236 mH** | 3,637 mH | 1,140 dB |
| 466,5 · 2283,5 | tuned | 2,399 Ω | 3,236 mH | 3,650 Ω | 3,801 mH | 3,801 mH | 1,400 dB |
| 548,5 · 1981,2 | seed | 2,918 Ω | 3,467 mH | — | — | — | — (poort) |
| 548,5 · 1981,2 | tuned | 2,918 Ω | 3,467 mH | **2,560 Ω** | 2,811 mH | 3,307 mH | 1,043 dB |
| 548,5 · 2283,5 | seed | 3,148 Ω | 3,571 mH | 4,121 Ω | 2,282 mH | 4,021 mH | 0,523 dB |
| 548,5 · 2283,5 | tuned | 3,148 Ω | 3,571 mH | 4,019 Ω | 2,834 mH | 3,973 mH | 0,779 dB |

**HET ZAADPLAFOND WAS BINDEND, EN OP DRIE VAN DE VIJF WAS HET TE STRENG.** De vetgedrukte
seed-cellen zitten tot op de geschreven decimaal op hun eigen zaadplafond — 2,822 tegen 2,822;
2,696 tegen 2,695; 3,236 tegen 3,236 — terwijl de tune de padweerstand had opgevoerd van 1,3–2,4 Ω
naar 3,2–4,3 Ω, waar het werkelijke plafond 3,6–4,1 mH is. **De zoekdoos hield die ontwerpen dus
een derde tot de helft onder de spoel waar zij recht op hadden**, en met een plafond dat hun eigen
netwerk beschrijft blijven zij netjes binnen het budget (1,337 / 1,373 / 1,400 tegen 1,4).

**EN DE TOEGEEFLIJKE RICHTING STAAT ER ÉÉN RIJ ONDER.** Op `548,5 · 1981,2` gaat de padweerstand in
de `tuned`-arm juist OMLAAG (2,918 → 2,560 Ω). Daar staat het zaadplafond van 3,467 mH BOVEN het
werkelijke plafond van 3,307 mH bij het geleverde netwerk: de oude zoekdoos vergunde daar een spoel
die het budget verbiedt. Dat is precies het mechanisme van Sanders twee gevallen — en deze kandidaat
levert in de `tuned`-arm een netwerk (1,043 dB) waar de `seed`-arm hem in zijn geheel aan een poort
verloor.

**WAT DE TWEE ARMEN OPLEVERDEN: 4 van 15 geleverd tegen 5 van 15**, en nul budget-weigeringen aan
beide kanten. Die nul aan de `seed`-kant is een eerlijke uitkomst en geen bevestiging: op DIT veld
kostte de veroudering ontwerpruimte in de strenge richting, terwijl Sanders negen-kandidaatveld in
de app haar in de toegeeflijke richting trof. **De twee gevallen van 01-09 zijn dus niet
gereproduceerd** — dat veld komt uit de eigen pre-design van de app en is niet uit de repo te
herbouwen — en wat hier gemeten is, is het spiegelbeeld ervan plus één rij die het mechanisme zelf
laat zien. Beide staan hier als meting; geen van beide als afleiding.

**DE KOLOM `opsling` IS NIET DE TOETS, en dat verschil hoort erbij.** Zij is de opslingering van het
SERIE-R+L-MODEL waarop de inversie is opgelost — de grootheid waarop het plafond gedefinieerd is —
terwijl de geleverde-netwerk-toets het ECHTE netwerk oplost, shunts en vallen inbegrepen. De 1,400
op `466,5 · 2283,5` is daarom geen overschrijding maar het plafond dat tot op de laatste geschreven
decimaal bijt: de geleverde spoel is 3,8014 mH tegen een plafond van 3,80097, vier tienduizendsten
mH eroverheen, en dat is de afronding op vier significante cijfers waarmee de tuner elke waarde
wegschrijft. De eerste versie van dit script vlagde die rij als overschrijding; een bewaker die op
de laatste geschreven decimaal alarm slaat meldt afronding als bevinding, dus hij rekent nu met
diezelfde marge. **Gezag heeft de toets en niet deze kolom** — en die heeft in geen van beide armen
één kandidaat geweigerd.

---

**DE REGENERATIE, EN WAT ZIJ MET HET VELD DEED.** Het corpus gaat van **vier naar vijf** netlists.
Er is er geen uit de shortlist gevallen; de nieuwkomer is `548,5 · 1981,2` — precies de kandidaat
die in de `seed`-arm van de meting hierboven aan een poort verloren ging. Dat is de voorspelling
van de opdracht ("verwacht dat het veld iets groter wordt") en zij is uitgekomen om de
voorspelde reden.

**DE GEPAARDE DELTA'S, want een corpusgemiddelde is geen delta (V47-nazorg).** Vier kandidaten
staan in beide corpora; hun ná-gemiddelde is per constructie het corpusgemiddelde ná, want er is
niets vertrokken. De ingreep leest dus rechtstreeks:

| grootheid (4 paren) | V47 | V48 |
| --- | --- | --- |
| totale serie-L laagste weg | 2,76 mH | **3,66 mH** (+33 %) |
| opslingering (waar het budget op staat) | −1,10 dB | −0,91 dB |
| LF-bult totaal | 3,55 dB | 3,99 dB |
| resistieve lift | 4,65 dB | 4,90 dB |
| W-M fase (M-K) | 13,06° | **5,15°** |
| M-T fase (M-K) | 3,87° | 4,53° |
| dissipatie (M-A) | 62,23 % | **58,23 %** |
| M-C slechtst beschermde weg | −28,53 dB | −28,87 dB |

**Een derde meer seriespoel is precies wat de reparatie moest opleveren**, en het is de grootheid
waarop het plafond staat: de zoekdoos hield die spoel eerder tegen op grond van een netwerk dat de
tune verlaten had. Alles wat daarnaast beweegt, beweegt de goede kant op zonder dat er een eis is
opgerekt: **0 van 4 boven het budget vóór, 0 van 5 ná**, elke netlist haalt de versterkervloer, en
M-C blijft op elke weg ruim binnen de gestelde −25 dB. De correctiegroepen worden bovendien
eenvoudiger — gepaard verdwijnen zes gedempte vallen en drie shunt-pads, en er komt één
shunt-shelf bij — wat de dissipatiewinst verklaart: een correctiegroep is een shunt en kost
dissipatie.

**DE ENIGE KOLOM DIE DE ANDERE KANT OP WIJST is de M-T-fase (3,87° → 4,53°),** en zij staat hier
omdat zij bestaat en niet omdat zij iets aantoont: het is een halve graad op een handover die geen
eis draagt, terwijl de W-M-fase — waar het spoelplafond woont — meer dan halveert. Wie de
corpusregels leest in plaats van de gepaarde krijgt trouwens een ander verhaal (M-K W-M 13,1° →
7,1°, dissipatie 62,2 → 57,5 %), en dat is de V47-nazorg-leesregel in werking: het veld veranderde
van samenstelling én de ontwerpen bewogen, en alleen de gepaarde kolom scheidt die twee.


---

**EEN BEWAKER HEEFT GEWERKT, EN HET WAS DE V37-VAL VOOR DE VIERDE KEER — nu lag het aan de
ANKERING zelf.** De volle suite viel op één test: `frozenNetlistGates.test.ts`, het blok dat pint
dat de dissipatieterm op de PIEKHOOGTE de uitdagingsdrempel van 1 % nooit haalde en op R_e wel.

De val is bekend en staat in dat bestand uitgeschreven: de term wordt gedeeld door het OBJECTIEF
van de netlist, en dat objectief krimpt naarmate het veld vlakker wordt — dus de assert beweegt mee
met de kwaliteit van het veld en niet met de term. V41 was de eerste keer, V47 de derde. V47
repareerde hem door de strikte claim te ANKEREN op de netlists waarop V36 en V37 hem gedaan hadden
— maar ankerde met een COMPLEMENT: *"alles wat niet `KAND_V2_n` heet"*. **Dat is geen anker maar
een verzameling die met elk corpus meegroeit.** De netlist die hem bij V47 brak (`KAND_V2_1`, RMS
0,48, 1,053 %) is bij V48 bevroren als `V47_KAND_1`, en daarmee stapte precies het uitgesloten
geval weer naar binnen — met hetzelfde getal.

**Dat was geen ongeluk maar een zekerheid.** Elke sessie bevriest het levende corpus vóór zij
regenereert; een complementfilter op "levend" laat het uitgesloten geval er bij de eerstvolgende
regeneratie dus altijd weer in. Het anker noemt sindsdien zijn VERZAMELING: de tien families die
bestonden toen V36 en V37 gemeten werden, uitgeschreven, met een tegenproef ernaast dat die
verzameling aantoonbaar KLEINER is dan "alles wat niet levend is" — zodat het anker niet stil weer
een complement kan worden. De drempel is opnieuw niet opgerekt.

---

**WAT ER NIET GEBOUWD IS.** Geen wijziging aan de inversieformule, geen wijziging aan het gestelde
budget (1,4 dB), geen wijziging aan de geleverde-netwerk-toets behalve dat hij blijft — en geen
v2-standaard die een casus-1-getal is: `'tuned'` noemt geen weerstand, geen spoel en geen
frequentie. Het PER-ONDERDEEL-plafond dat naast het somplafond staat volgt de tune NIET: het is de
noodzakelijke voorwaarde ("geen enkele spoel meer dan de hele keten mag") en de projectie op de SOM
is wat werkelijk handhaaft, dus het meelaten lopen zou een tweede mechanisme zijn voor één regel.
`runV2Optimization` krijgt geen tracker (zie hierboven). En de korrel is niet gekalibreerd op wat
casus 1 toevallig nodig heeft — hij is een resolutie, met een gemeten bovengrens op wat hij kost.

**WAT ER GEMETEN IS EN NIET AANGENOMEN.** De prijs van één inversie (13 ms) en daarmee de
vormkeuze. De monotonie waarop de kwantisering rust, over het hele bereik dat het casusboek noteert.
Dat de tracker op punten tussen de korrels nooit boven het exacte plafond leest. Dat het geleverde
netwerk van de tweewegfixture op het plafond van zijn EIGEN padweerstand staat. De twee armen over
het hele veld. Dat de byte-baselines van `f4cRegression` en `workerRouteRegression` onaangeroerd
reproduceren met de sleutel afwezig.

**OPENSTAAND.** (1) De twee gevallen van Sanders browserrun zijn niet reproduceerbaar uit de repo,
omdat het veld van de app uit haar eigen pre-design komt; de toegeeflijke richting is hier op één
kandidaat aangetoond en niet op die twee. (2) De kolom `opsling` in het meetscript is het
serie-R+L-model en niet het geleverde netwerk — wie het echte getal per arm wil, moet de geleverde
onderdelenlijst in de shard bewaren, en dat kost een nieuwe run van dertig ketenruns. (3) Het
`gap-pad-r`-plafond en het `qes-series-r`-plafond hangen NIET van de padweerstand af en zijn dus
niet door dit gat geraakt — nagegaan, niet aangenomen; als er ooit een inversie bij komt die er wél
van afhangt, is dit de plek waar zij dezelfde behandeling hoort te krijgen.

### UI-2 — elke bewerking herrekent, of zegt waarom niet; de view is van de gebruiker (02-09-2026)

**AANLEIDING.** Sander, op de live site (`1576903`) met het shortlist-#1-ontwerp geladen: (a) de
serieweerstand vóór de woofer verwijderd → de simulatie herrekent, maar de SPL-as springt van
20 kHz terug naar 10 kHz; (b) daarna een draad getekend → geen herberekening, geen melding.

**HET WAS TWEE KEER HETZELFDE GEBREK, in twee lagen: de app volgde de DATA in plaats van de
gebruiker, en waar zij niets te melden had, meldde zij niets.**

---

**INVENTARISATIE — wat een editorbewerking deed vóór UI-2.** Alles in de editor loopt door
`onChange` → `commitSchematic` → `setDesigns`; undo en redo riepen `setDesigns` rechtstreeks;
een shortlist-rij komt via `applyScanCandidate` → `setWorkingDesign` → `setDesigns`. De
simulatie is een `useMemo` op `schematic`, en dat is een memo op `activeDesign.parts`. **Dus
élke mutatie triggerde de hersimulatie — er is nooit een bewerking geweest die dat niet deed.**
Wat er daarna gebeurde is de kolom die ertoe doet:

| bewerking | trigger | wat er dan gebeurde (vóór UI-2) |
| --- | --- | --- |
| draad tekenen, op de terminals | ja (`SchematicEditor.tsx` `onBackgroundDown` → `addWire`) | herrekend |
| draad tekenen, één rij ernaast | ja | netlist byte-identiek → curves identiek, **geen melding** |
| draad verwijderen | ja (`onKeyDown` Delete / knop → `deletePart`) | herrekend; de afgesneden tak stil, **geen melding** |
| component toevoegen | ja (`addPart`) | herrekend; het losse onderdeel doet niets, geen melding |
| component verwijderen | ja (`deletePart`, "its wires stay") | herrekend; wat erachter hing stil, **geen melding** |
| waarde wijzigen | ja (`ParamField` → `setPartParam`) | herrekend |
| waarde op 0 | ja | `1/0` in de stamp → NaN-oplossing, geen melding |
| roteren | ja (`rotatePart`, om de eerste terminal) | herrekend; de tweede terminal los, geen melding |
| generator plaatsen | ja (`addPart`) | herrekend; twee bronnen, alleen `validateNetlist`-waarschuwing |
| generator verwijderen | ja | solver gooit → `xoError` → **RAW drivers als som**, foutregel op de Setup-tab |
| ground plaatsen | ja | herrekend; een losse ground doet niets, geen melding |
| undo / redo | ja (`undoSchematic`/`redoSchematic` → `setDesigns`) | als de bewerking die zij terugdraaien |
| shortlist-rij laden (UI-1) | ja (`selectFromShortlist` → `applyScanCandidate`) | herrekend |

**Geval (b), nagemeten in Node op de casus-1-impedanties en daarna live in de draaiende app met
échte pointer-events.** R5 (4,019 Ω, tussen de bus en de wooferketen) verwijderd:

| toestand | woofer \|H\| (200 Hz / 1 k / 5 k) | Z min | `validateNetlist` |
| --- | --- | --- | --- |
| geladen ontwerp | −5,18 / −32,06 / −67,40 dB | 3,719 Ω | schoon |
| R5 weg | **−∞ / −∞ / −∞** | **0,179 Ω** | **schoon** |
| R5 weg + draad exact op (17,6)–(24,6) | −1,30 / −27,79 / −53,90 dB | 3,536 Ω | schoon |
| R5 weg + draad op (17,7)–(24,7) | −∞ / −∞ / −∞ | 0,179 Ω | schoon — **byte-identiek aan "R5 weg"** |

Drie dingen staan in die tabel. **(1) De woofer was al stil vóór de draad.** Verwijderen laat de
twee terminals los ("its wires stay"), en de wooferketen erachter hangt dan alleen nog aan
ground. De simulator lost dat correct op — de lekgeleiding houdt de matrix regulier en de
overdracht is exact nul — en de som herrekende zonder woofer: "Response 90", "Phase P95 16°",
geen Overlap-chip meer, en nergens één woord. **(2) `validateNetlist` zag er niets van.** Haar
bereikbaarheidsloop wandelt door node 0 zoals door elke andere knoop, en de wooferketen bereikt
ground via haar eigen shunt en haar eigen retour — dus "verbonden met de generator". Dat is de
regel die het had moeten zeggen, en zij is er blind voor. **(3) De draad ernaast is een no-op.**
Draden lossen op in de union-find vóórdat er een netlist bestaat; een draad die geen enkele
terminal raakt levert een netlist die byte-identiek is aan die ervoor, dus de simulatie
"reageerde niet" — terecht, en zonder dat iets dat kon zeggen. Live nagemeten: draad
(10,7)–(17,7) één rij onder het gat in de opgeruimde layout → alles identiek, `issues: null`.
De exacte draad (10,6)–(17,6) bracht de woofer wél terug: W-M 98 · 556 Hz.

**Geval (a), live nagemeten.** `Chart.tsx` had één effect: *"committed domains changed → drop
the zoom"*, op `[xDomain, yDomain]`. De SPL-y-as is auto uit de data (top = luidste kromme,
bodem = doorlaatband − 50 dB, op 5 dB afgerond), dus élke bewerking die de luidste kromme over
een 5 dB-stap heen duwde gooide óók de x-zoom weg. Gemeten met Rg 0,001 → 20 Ω: y-as
80–140 → 75–135, zoom 1,22k–9,68k → weg, x-as terug naar het volle bereik waarvan het laatste
label "10k" is — precies "van 20 kHz terug naar 10 kHz". De R-verwijdering op de site deed
hetzelfde via de bodem; in de demo trof de R5-verwijdering toevallig geen 5 dB-stap en overleefde
de zoom, wat laat zien hoe willekeurig de grens lag.

---

**WAT ER GEBOUWD IS.**

**Eén functie voor "kan dit gesimuleerd worden, en zo niet, waarom niet":** `lib/networkReadiness.ts`,
`assessNetwork(parts, models)`, in de V32-vorm met drie lezers — de sim-memo (oplossen of
weigeren), de Network-tab (de status onder de editor) en de badges (niets scoren op een netwerk
dat niet gesimuleerd is). Twee ernstgraden, en de grens is de natuurkunde:

- **GEWEIGERD** — geen simuleerbare betekenis: geen generator, generator kortgesloten of Rg ≤ 0,
  geen driver, driver zonder gemeten impedantie, waarde ≤ 0, onderdeel met één terminal. De sim
  draait niet; de grafieken houden de VORIGE gesimuleerde toestand, gedimd en met de tag
  *"previous state — network not simulated"*, de badges Response/Overlap/Phase verdwijnen en er
  staat één chip *"Not simulated · previous state shown"* voor in de plaats, de DRC-lijst
  draagt de reden, en boven de SPL een banner. Is er geen vorige toestand (andere drivers,
  andere tab), dan staan de kale drivers er met dezelfde tag. F0: geen oordeel is geen groen,
  en een bevroren grafiek zegt dat zij bevroren is.
- **GESIMULEERD MET GEBREKEN** — het netwerk lost op en de oplossing is precies wat de tekening
  zegt, maar de tekening zegt iets wat de ontwerper vermoedelijk niet bedoelde: een driver zonder
  pad naar de generator (stil), een onderdeel dat nergens aan hangt, een draad die geen terminal
  raakt, een losse ground, een onderdeel met beide terminals op één net, twee generatoren, niets
  aan ground. De sim DRAAIT — een losgekoppelde woofer is een echte fysische toestand en de
  eerlijke kromme is die zonder hem — en het gebrek staat ernaast, per onderdeel bij naam.

**"Pad naar de generator" wordt gelopen ZONDER door ground te gaan.** Dat is de ene regel
verschil met `validateNetlist`, en het is de hele bevinding. Sanders R-verwijdering landt in de
tweede categorie: de curves herrekenen én de status zegt *"D (woofer) has no path to the
generator — it is SILENT in this simulation"*. De draad ernaast: *"Wire 10,7 → 17,7 touches no
terminal of any part — it connects nothing, and the network is exactly what it was before it
was drawn."*

**Eén pad voor elke mutatie.** `replaceActiveParts(parts)` is sinds UI-2 de enige plek die de
onderdelenlijst van de actieve tab vervangt; `commitSchematic`, `undoSchematic` en
`redoSchematic` roepen hem aan en verschillen alleen in hun geschiedenisboekhouding. Een undo
kan de grafieken dus niet via een andere weg bereiken dan de bewerking die hij terugdraait.
In de sim-memo is de editor-tak omgebouwd: `readiness` beslist vóór de solve, een geweigerde
tekening levert géén netwerk en de memo zegt waarom; de vxp-variant-route (`xo`) is ongewijzigd
en meldt nog via `xoError`. De solver-`throw` die tot UI-2 de kale drivers als som doorliet, is
op de editor-route een weigering geworden — net als een `ambiguous` slot-mapping en een
niet-eindige oplossing.

**De grafiek-view volgt de gebruiker.** Het effect dat de zoom liet vallen is weg. De
zoomtoestand is een venster in DATA-eenheden en blijft staan tot de expliciete reset (knop,
dubbelklik) of tot de gebruiker terug uitzoomt tot de basis; wat met de basis meebeweegt is
alleen de PASSING — een venster dat niet meer in het nieuwe domein ligt schuift erin met behoud
van span (log-span op de log-as), een venster minstens zo breed als de basis valt samen met de
basis en de zoombalk verdwijnt, wat óók is hoe "use as view range" (basis := venster) de zoom
netjes beëindigt. Auto-scale alleen zolang de gebruiker niets koos. De regel is een pure
functie (`lib/chartView.ts`, `effectiveView`) en geldt voor élke `Chart` — SPL, impedantie,
fase, filteroverdracht, groepsvertraging, tijddomein — want zij zit in de component en niet in
één aanroeper. Live nagemeten: zoom 3,04k–5,97k, Rg 0,001 → 20 Ω, y-as 80–140 → 75–135,
**zoom staat**.

**Handmatige controle, in de draaiende app (dev-server op de commit-code), de twee handelingen
van de entry:** shortlist-#1 geladen (KAND-V2-1 via Import filter — hetzelfde bestand als de
rij), SPL gezoomd, R5 verwijderd → **de zoom blijft staan, de curves zijn herrekend (woofer
weg), status onder de editor: "Simulated as drawn: D silent — no path to the generator · 1 more
issue" met C10 en de woofer bij naam, en de ⚠-chip telt één issue**. Daarna een draad één rij
onder het gat → **status: "… · 1 wire connects nothing" met de draad bij zijn eindpunten**;
de exacte draad → woofer terug. Generator verwijderd → **chip "Not simulated · previous state
shown", banner boven de SPL, drie grafiekpanelen gedimd met de tag, de status onder de editor
"Not simulable: the network has no generator. Place one (+ Gen) and wire it to the filter
input." plus "Ground symbol at 3,13 touches no terminal".**

**De tabel ná UI-2.** Elke rij triggert nog steeds — dat was nooit het probleem — en de derde
kolom is nu wat `networkReadiness.test.ts` per rij assert (op het echte KAND-V2-1, met de
casus-1-impedanties):

| bewerking | uitkomst |
| --- | --- |
| draad op de terminals (na R5 weg) | simuleerbaar, schoon |
| draad over een aanwezig onderdeel | simuleerbaar, `shorted-part` (R5) |
| draad één rij ernaast | simuleerbaar, `dangling-wire` + woofer stil + C10 los |
| draad die één terminal haalt | simuleerbaar, woofer stil + C10 los |
| voeddraad van de midketen weg | simuleerbaar, acht onderdelen los + mid stil |
| component toevoegen | simuleerbaar, `undriven-part` |
| R5 verwijderen | simuleerbaar, woofer stil + C10 los |
| waarde wijzigen | simuleerbaar, schoon |
| waarde op 0 | **geweigerd**, `invalid-value` |
| R5 roteren | simuleerbaar, woofer stil + C10 los |
| driver inverteren | simuleerbaar, schoon |
| tweede generator plaatsen | simuleerbaar, `extra-generator` |
| generator verwijderen | **geweigerd**, `no-generator` (+ zijn ground los) |
| draad over de generator | **geweigerd**, `shorted-generator` |
| ground plaatsen | simuleerbaar, `dangling-ground` |
| woofer verwijderen | simuleerbaar (+ zijn ground los) |
| undo / redo | de toestand waar zij naartoe gaan |
| shortlist-rij laden (KAND-V2-2) | simuleerbaar, schoon |

---

**WAT ER NIET GEBOUWD IS.** Niets aan engine, shortlist, poorten of corpus; geen regeneratie.
De simulatie-uitkomst voor een gegeven simuleerbaar netwerk is ongewijzigd — `readiness.netlist`
is `crossoverToNetlist` op dezelfde onderdelen — en `toggleRegression` blijft groen. **De
Timing-chip blijft staan wanneer het netwerk niet gesimuleerd is, en dat is een besluit:** hij
beoordeelt de tijdbasis van de METINGEN (`timing` hangt aan `woofer`/`tweeter`, niet aan het
netwerk) en is dus geen score op het netwerk. `validateNetlist` is niet aangeraakt: hij heeft
sinds UI-2 geen lezer meer in de app en zijn eigen tests staan nog; de test in
`networkReadiness.test.ts` pint dat hij op de R5-loze netlist niets ziet, zodat wie hem ooit
repareert dáár de bevinding tegenkomt.

**OPENSTAAND.** Het "Draw wire"-gereedschap blijft na een draad actief ("click the start
point"), dus een verdwaalde klik begint een volgende draad; niet aangeraakt. En de
statuscel op de v2-pagina en de scan-tabel lezen `sim` — de vorige toestand — zonder eigen tag;
zij staan onder dezelfde banner, maar dragen hem niet zelf.

### V47b — de tweetereis wordt voorlopig −20 dB (02-09-2026, **BREAKING, alleen v2-runs**)

**AANLEIDING.** V47 stelde `tweeter_drive_op_fs_max_dB = −25,0` als de strengste waarde op één
decimaal die HUIDIG nog toelaat: HUIDIG meet −25,084 dB op zijn slechtste beschermde weg, dus de
marge was **0,084 dB**. Dat maakte het eigen referentiefilter van de ontwerper de maat — en het
maakte de eis breekbaar in de andere richting dan de V42-fout: een hermeting van HUIDIG na
inspelen die f_s of het doorlaatniveau een tiende dB verplaatst, veroordeelt het ontwerp waaruit
de eis is afgeleid. Bovendien weigerde zij kandidaten die de vuistregel waar de eis over gaat
ruim halen: vier van de elf V47-weigeringen maten op de tweeter **−21,8 / −22,6 / −23,4 /
−23,5 dB**.

**HET BESLUIT (Sander, 02-09-2026): −20,0 dB, VOORLOPIG.** De industrieregel is 18 dB onder het
doorlaatniveau op f_s. Zij is bedacht voor een tweede-orde filter op 2×f_s en werd toen al "te
conservatief" gevonden; met LR4-flanken, een waveguide en padwerk vóór de driver is zij hier
conservatiever dan in haar oorsprong. Daar komt 2 dB marge bij voor f_s-drift — een
tweeterresonantie verloopt met inspelen en temperatuur, en een grens die exact op de regel staat
veroordeelt bij de eerste hermeting. **Een gekozen dB-getal is geen generieke eis:** dit is een
vuistregel op één punt, en zij VERVALT zodra M-C excursie-gedragen is (V49: de aandrijving op f_s
omgerekend naar uitwijking tegen X_max, met gedocumenteerde meetspanning en Sd — dan is de grens
een eigenschap van de driver en niet een conventie). HUIDIG haalt de eis nu ruim (5,1 dB marge)
en is niet langer de maat; de haalbaarheid rust op de regel en niet op het referentiefilter. Het
casus-1-getal staat uitsluitend in `manifest_en_geometrie.gestelde_eisen`; de fixture leest het,
engine-code kent het niet (P6). De verwachting vooraf: het veld wordt groter, 1700–2000 Hz gaat
open, en wat onder ~1660 Hz kruist blijft terecht geweigerd — daar liggen te weinig octaven
tussen f_s en het kruispunt voor welke orde dan ook.

**WAT ER GEBOUWD IS, en het is bijna niets — met opzet.** Eén getal in het manifest, met een
herschreven motivering; niets aan de formule van M-C, niets aan de poort, niets aan de
`drive-series-c`-inversie, geen trap. Daaromheen drie stukken boekhouding. (1) Het V48-corpus is
bevroren als `V48_KAND_*` (`freeze-live-corpus.ts`, vijf netlists) vóór de regeneratie, met zijn
reden in `DATED_REASON` en zijn rij in `DATED_CORPORA`. (2) `frozenNetlistGates.test.ts` keerde
zijn HUIDIG-assert om: tot V47b eiste hij dat één tiende strenger HUIDIG zou veroordelen (de
"HUIDIG is de maat"-vorm); sinds V47b eist hij dat HUIDIG de eis met MEER dan een dB haalt, want
zit hij er ooit binnen een dB van, dan is het getal stilletjes weer HUIDIG's afronding geworden of
is HUIDIG op de regel gedreven — allebei bevindingen. De vlaggen op `V45_KAND_5/_6` (−14,38 /
−15,10) staan ongewijzigd, met de grens die vandáág geldt in de rij, want een uitzonderingslijst
die een vervallen grens noemt is boekhouding van niets. (3) `compare-corpora.ts` kreeg twee
kolommen: M-C PER WEG naast het maximum (op KAND_B raakt de eis de mid en niet de tweeter, en het
maximum zegt dat niet) en de VERTICALE LOBING-SYNTHESE (M-F-eind, diepste dip in het kruisgebied
over het ±15°-venster van `lobing_eind_dip_15gr`). Voor die laatste kreeg de meetbank in
`casus1Corpora.fixture.ts` een `verticalWindowDeg` — zonder venster staat de synthese UIT, en dat
was tot nu toe zo, onopgemerkt, omdat niemand de kolom vroeg. `corpusPairing.test.ts` bleef
groen op het onveranderde bankpad (fase en dissipatie lezen het venster niet).

**CORPUSPAIRING HOEFDE NIET HERANKERD, en dat is de voorspelde faalvorm die NIET optrad.** De
opdracht voorzag dat de V45→levend-helft bij deze regeneratie zou omvallen; V48 had haar al op
`v45 → v47` herankerd, dus beide vergelijkingen zijn volledig gedateerd en zeven van zeven claims
bleven groen zonder één getal te verplaatsen.

---

**DE REGENERATIE (`V2_JOBS=8`, 'safety'): 2688 s (45 min), en het veld gaat van VIJF naar ZEVEN.**
Drie kandidaten komen binnen en één vertrekt. Binnen: `396,7 · 1719` (onder −25 geweigerd op
−22,5 dB, nu geleverd op **−21,92**), `466,5 · 1981,2` (de eerlijke minpost van V47: onder −25
geweigerd op −22,6 en −24,6, nu geleverd op **−24,22**) en — niet voorspeld — `396,7 · 1491,4`,
dat onder −25 op −16,2 dB geweigerd werd en nu op **−29,86** landt. Dat laatste is de les van V47
nog een keer: een gewapende poort is geen passieve waarnemer, `gateViolation` weigert stappen en
verlegt de zoektocht, dus dezelfde kandidaat loopt onder een andere grens een ander pad, en dat
pad kan ver ónder de grens uitkomen die hem eerder weigerde. De verwachting "wat onder ~1660 Hz
kruist blijft terecht geweigerd" is daarmee op één van de drie 1491-kandidaten WEERLEGD; op de
andere twee (466,5 en 548,5) staat zij, en op alle drie de 1294-kandidaten ook.

**EN DEZELFDE LES DE ANDERE KANT OP, want die hoort erbij.** `548,5 · 1981,2` werd onder −25
GELEVERD (V48: mid −40,43 / tweeter −25,37) en wordt onder de RUIMERE −20 GEWEIGERD — op de
**MID**, met −7,3 dB. Met de tweetergrens slack liep de zoektocht een pad waarop de mid op zijn
eigen resonantie (88,8 Hz) achttien dB harder wordt aangedreven, en de poort ving dat aan het
eind. Een ruimere grens kan dus een ontwerp kosten dat de strengere leverde; het mechanisme is
identiek aan de V47-minpost, alleen het teken van de grenswijziging is omgekeerd.

**DE VÓÓR/NÁ (`compare-corpora.ts v48 live`).** Corpusgemiddelde én gepaarde delta (vier paren:
de vier kandidaten die beide corpora dragen), want een corpusgemiddelde is geen delta
(V47-nazorg). M-C is het maximum over de beschermde wegen; de kolom per weg staat in de tabel
eronder.

  | | V48 (5) | V47b (7) | gepaard vóór → ná (4) |
  | --- | --- | --- | --- |
  | kandidaten zonder netwerk | 10 van 15 | **8 van 15** | — |
  | M-C slechtste weg, gemiddeld | −28,2 dB | −27,3 dB | −28,87 → −28,74 |
  | boven de gestelde grens | 0 van 5 (bij −25) | **0 van 7 (bij −20)** | — |
  | protSq (controle) | 0,000 dB² | 0,000 dB² | 0,00 → 0,00 |
  | RMS, gemiddeld | 0,92 dB | 1,18 dB | 0,63 → 0,61 |
  | venster ±, gemiddeld | 1,79 dB | 2,27 dB | 1,24 → 1,25 |
  | W-M fase M-K, gemiddeld | 7,1° | 12,4° | 5,15 → 6,10 |
  | M-T fase M-K, gemiddeld | 6,0° | 8,0° | 4,53 → 3,75 |
  | min \|Z\|, gemiddeld | 3,10 Ω | 3,04 Ω | 3,22 → 3,37 |
  | dissipatie, gemiddeld | 57,5 % | 51,3 % | 58,23 → 57,80 |
  | Q_es×, gemiddeld | 2,24 | 1,91 | 2,34 → 2,21 |
  | opslingering (resonantDb), gemiddeld | −0,7 dB | −0,7 dB | −0,91 → −0,80 |
  | verticale lobing-synthese (M-F-eind, ±15°), gemiddeld | −2,7 dB | −2,8 dB | −2,71 → −2,76 |

  | kandidaat (W-M · M-T) | min \|Z\| vóór → ná | venster ± | W-M M-K | M-T M-K | RMS | diss. % | Q_es× | M-C per weg vóór → ná | M-F-eind |
  | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
  | 396,7 · 1491,4 | — → 2,59 | — → 2,68 | — → 15,9° | — → 8,3° | — → 1,56 | — → 49,8 | — → 1,34 | — → mid −60,53 / tweeter −29,86 | — → −3,17 |
  | 396,7 · 1719 | — → 2,58 | — → 5,23 | — → 23,1° | — → 22,5° | — → 2,51 | — → 32,6 | — → 1,36 | — → mid −40,57 / tweeter −21,92 | — → −2,64 |
  | 396,7 · 1981,2 | 2,92 → 2,98 | 1,16 → 1,38 | 6,4 → 6,8° | 5,5 → 4,2° | 0,65 → 0,67 | 58,5 → 54,1 | 2,40 → 2,40 | mid −49,21 / tw −28,67 → mid −58,59 / tw −27,97 | −2,71 → −2,48 |
  | 396,7 · 2283,5 | 2,65 → 2,70 | 1,68 → 1,56 | 4,9 → 8,5° | 4,1 → 3,3° | 0,77 → 0,72 | 57,4 → 53,2 | 2,40 → 2,39 | mid −49,03 / tw −28,87 → mid −30,71 / tw −29,91 | −2,53 → −3,00 |
  | 466,5 · 1981,2 | — → 2,66 | — → 2,98 | — → 23,1° | — → 10,5° | — → 1,73 | — → 45,2 | — → 1,86 | — → mid −35,76 / tweeter −24,22 | — → −2,66 |
  | 466,5 · 2283,5 | 3,59 → 3,63 | 1,11 → 1,09 | 3,9 → 4,2° | 3,7 → 3,7° | 0,56 → 0,55 | 57,1 → 57,0 | 2,20 → 2,21 | mid −52,61 / tw −29,28 → mid −51,82 / tw −29,30 | −2,92 → −2,90 |
  | 548,5 · 1981,2 | 2,60 → **verworpen** | 4,00 → | 15,1° → | 11,9° → | 2,08 → | 54,6 → | 1,86 → | mid −40,43 / tw −25,37 → **verworpen (mid −7,3)** | −2,84 → |
  | 548,5 · 2283,5 | 3,72 → 4,17 | 0,99 → 0,97 | 5,3 → 5,0° | 4,8 → 3,8° | 0,52 → 0,51 | 59,9 → 66,9 | 2,36 → 1,84 | mid −52,17 / tw −28,66 → mid −33,75 / tw −27,78 | −2,70 → −2,65 |

**WAT DE TABEL ZEGT, gepaard gelezen.** Op de vier overlevenden beweegt vrijwel niets: RMS 0,63 →
0,61, venster 1,24 → 1,25, opslingering −0,91 → −0,80, lobing −2,71 → −2,76. De poort was op
die vier al slack bij −25 en is het bij −20 nog steeds. **Elke corpusregel die wél beweegt is
compositie:** RMS 0,92 → 1,18 en W-M-fase 7,1° → 12,4° komen van de drie nieuwe netlists op de
lagere M-T-kruisingen (1,56 / 2,51 / 1,73 dB RMS, 15,9° / 23,1° / 23,1° W-M), en de
dissipatiewinst 57,5 → 51,3 % komt van diezelfde drie (49,8 / 32,6 / 45,2 %) — `396,7 · 1719`
verstookt met 32,6 % de helft van wat het corpus gewend is, en draagt tegelijk de slechtste
vlakheid van het veld. Q_es× daalt gepaard wel (2,34 → 2,21), en op `548,5 · 2283,5` van 2,36
naar 1,84 tegen een dissipatie die van 59,9 naar 66,9 % gaat: minder serieweerstand in het pad,
meer in de shunts. De verticale lobing-synthese, hier voor het eerst in de tabel, zegt dat de
lagere M-T-kruisingen in het ±15°-venster **niets extra kosten**: −3,17 / −2,64 / −2,66 dB tegen
−2,48 tot −3,00 op de 1981/2283-kruisingen. Een kolom en geen oordeel — maar wie verwachtte dat
1491 Hz verticaal gestraft zou worden, vindt het hier niet.

**DE M-C-KOLOM PER WEG IS DE REDEN DAT ZIJ ER STAAT.** Op het maximum bewegen de vier paren
nauwelijks (−28,87 → −28,74); per weg beweegt de MID op twee ervan tientallen dB — `396,7 ·
2283,5` van −49,03 naar −30,71, `548,5 · 2283,5` van −52,17 naar −33,75 — zonder dat de eis er
iets over zegt, want zij is op beide nog ruim gehaald. Dat is het tweede spoor van dezelfde
bevinding als de `548,5 · 1981,2`-weigering: met de tweetergrens slack is de mid-aandrijving op
88,8 Hz de grootheid die de zoektocht nu vrij laat lopen.

**WAT ER OP M-C STRANDT, en de trap-vraag geactualiseerd.** Acht kandidaten leveren niets; alle
acht door een poort, geen enkele door de keten zelf.

  | kandidaat | M-C tweeter | M-C mid | vloer |
  | --- | --- | --- | --- |
  | 396,7 · 1294 | −12,1 | — | — |
  | 466,5 · 1294 | −11,9 | — | 1,99 Ω |
  | 548,5 · 1294 | −13,2 | — | 0,02 Ω |
  | 466,5 · 1491,4 | −16,6 | — | 2,49 Ω |
  | 548,5 · 1491,4 | −17,5 | −11,1 | 1,11 Ω |
  | 466,5 · 1719 | −17,0 | **+5,6** | — |
  | 548,5 · 1719 | −17,3 | — | — |
  | 548,5 · 1981,2 | (haalt) | **−7,3** | — |

Drie dingen. (1) **De marginale band is LEEG.** Onder −25 stonden er vier weigeringen binnen
2,5 dB van de grens; onder −20 staat de dichtstbijzijnde tweeterweigering op −17,5 (2,5 dB
erover) en de rest 3 tot 8 dB. Een trap over de tweeter op f_s zou dus geen 1,5 dB moeten kopen
maar 2,5 tot 8, en op de 1294-kruisingen 7 tot 8 dB bóvenop een vloerweigering die hij niet
repareert. Dat is geen argument tegen een trap, maar het is een andere vraag dan de V47-vraag:
niet "haal de bijna-missers binnen" maar "koop 3–8 dB op de laagste kruisingen". (2) **De mid
staat in drie van de acht weigeringen, en op twee ervan als ENIGE of ERGSTE grond** (+5,6 en
−7,3 dB). Een tweetertrap doet daar niets; dat is de aandrijving van de mid op zijn eigen
resonantie bij de hogere W-M-kruisingen (466,5 en 548,5), waar de mid-hoogdoorlaat verder van
88,8 Hz af ligt en de zoektocht de serie-C van de mid kennelijk vrij laat groeien zodra de
tweeter niet meer bindt. Of dát een trap vraagt, een strengere mid-orde of een eigen grens is een
eigen vraag; zij is nu voor het eerst met getallen gesteld. (3) `548,5 · 1719` ging van −21,8
(V48, geweigerd op de mid) naar −17,3 op de tweeter en een schone mid: de zoektocht ruilde het
ene tekort voor het andere. Twee wegen met elk een eigen resonantie-eis en één zoektocht die
alleen kruispunt en serie-C als knop heeft, is precies de situatie waarin een trap de twee
ontkoppelt — als hij ergens gerechtvaardigd is, dan hier, en de meting die dat moet beslissen is
V49 (excursie) en niet nog een dB-getal.

**DE TWEE GEVLAGDE NETLISTS BLIJVEN BUITEN DE EIS.** `V45_KAND_5` (−14,38) en `V45_KAND_6`
(−15,10) overschrijden ook de −20 met vijf dB; het vlagpatroon in `v45_corpus` staat
ongewijzigd, met de grens die vandaag geldt in de rij. `frozenNetlistGates` legt beide naast een
verse meting en naast de gestelde eis; de "niet vacuüm"-claim rust nog steeds op de gedateerde
corpora (tot −9,78 dB op de mid van `V38FIX_KAND_5`).

**WAT ER NIET GEBOUWD IS.** Niets aan de formule van M-C, niets aan de poort, niets aan de
`drive-series-c`-inversie, geen trap, geen ander getal. De v1-route is onaangeraakt:
`toggleRegression` en de byte-baselines van `f4cRegression` en `workerRouteRegression` lezen geen
casus-1-grens. BREAKING alleen voor v2-runs: elke v2-run op casus 1 oordeelt sinds V47b op −20,0
en levert een ander veld; de vingerafdruk beweegt in `gates=` (bda73aab → c1a08532).

**EEN BEWAKER GING ROOD OP HET VERKEERDE, en dat is de vijfde keer dezelfde val.** De volle run
viel om op `networkReadiness.test.ts`: de UI-2-mutatietabel las het LEVENDE `KAND-V2-1` en pint
hoeveel onderdelen stroomloos raken als de mid-voeding wegvalt. De regeneratie gaf dat bestand
een mid-tak met één onderdeel meer, en de rij ging rood zonder één regel readiness-code te
raken — een claim die het levende corpus noemt wordt stil onwaar (V43 op `v42_bult_bevinding`,
V47 en V48 op de V37-drempel, V48 op `corpusPairing`). Herankerd op `V48-KAND-1`, dat
byte-identiek is aan het bestand dat UI-2 toetste; geen getal bewoog. De volle run is daarna
opnieuw gedraaid.

**OPENSTAAND.** (1) V49: M-C excursie-gedragen — dan vervalt dit getal. (2) De mid-weigeringen
hierboven: een eis die van een tweetermeting is afgeleid oordeelt nu op de mid drie van de acht
weigeringen, en het is niet gesteld of −20 dB op een 88,8 Hz-resonantie onder een LR4 op 466 Hz
dezelfde betekenis heeft als op een 924 Hz-resonantie onder een LR4 op 1500 Hz. (3) De
regeneratie kost 45 minuten op acht jobs (V48: 40), en de langste shard (`396,7 · 2283,5`,
1511 s) is een tune die de grens nergens raakt — de prijs zit in het iteratiebudget en niet in
de poort.

### V49 — M-C wordt excursie-gedragen (02-09-2026, alleen v2-runs; het corpus beweegt NIET)

**AANLEIDING.** V47 en V47b hadden gemeten wat één gesteld dB-getal op f_s waard is: op elk
ontwerp iets anders (orde, inbouw, padwerk, niveau) en voor twee drivers onder één eis niet
generiek. De mid van casus 1 (±3 mm, 69 cm², f_c 88,8 Hz in de pod) werd onder −20 de ergste
weigergrond (−7,3 dB) zonder dat iemand wist of −7,3 dB op DIE driver gevaarlijk is; de tweeter
verloor zijn deler op een hoge-Q-resonantiepiek, dus lage verzwakking op f_c is een delerkwestie
en geen ordekwestie. V47b noemde zijn −20 daarom VOORLOPIG, "tot M-C excursie-gedragen is". Dit
is die sessie: het antwoord hoort te zijn hoeveel uitslag, tegen welke X_max, bij welke spanning.

**DE AFLEIDING (registerrij A4 M-C v2.0, vóór de code geschreven).** Route 1, elektromechanisch
en ladingsonafhankelijk: op de resonantie is de spoelstroom V/Z_max — Z_max bevat de tegen-EMK,
en dát is precies waarom de gemeten piek in situ de juiste deler is —, de kracht Bl·I, en een
massa-veer-resonator zet kracht om in uitslag met winst Q_ms/(M_ms·ω₀²): `x/V = Bl·Q_ms /
(Z_max·N·M_ms·ω₀²)`, met N het aantal parallelle drivers achter de gemeten impedantie. Z_max, f₀
en Q_ms uit de GEMETEN sweep; Bl en M_ms van de driverkaart. Route 2, akoestisch (tegenproef):
`x/V = p·2π·r / (ρ₀·S_d·N·ω₀²·V_meet)` uit de gemeten SPL bij een gedocumenteerde meetspanning en
micafstand — veronderstelt vrije halfruimte-straling en OVERschat x onder elke belasting
(waveguide, hoorn, kastfront), dus altijd conservatief, en de verhouding route 2/route 1 is een
gemeten eigenschap van de inbouw. Van uitslag naar eis: `V_toegestaan = X_max·marge/(x/V)`,
`plafond = 20·log10(V_toegestaan/V_piek)` met `V_piek = √2·√(P_piek·R_nom)`; de afgeleide
M-C-grens per ontwerp is `plafond − V̄_passband` (de F1-conventie), en de poort leest de
**strengste** van die grens en het gestelde dB-getal, met vermelding welke. Monotoniciteit:
onder f₀ stijfheidsgestuurd, erboven 1/f², dus onder een monotone hoogdoorlaat is f₀ het maximum
en volstaat één punt (V47); `protSqDb` bewaakt de aanname. Wat de grens NIET dekt en het rapport
zegt: thermisch (de V36-wattkolom blijft de zichtbaarheid) en vervorming rond de resonantie (de
fabrikantsondergrens is context).

**WAT ER GEBOUWD IS.** `metrics/driveExcursion.ts` (M-C v2.0, versie `drive-excursion/2.0`):
de bouwstenen als handberekeningen, de samengestelde uitkomst per driver met beide routes en
hun uit-redenen, de zwakste-schakel-scan voor de weg zonder hoogdoorlaat. `z-resonance`
1.0 → 1.1: elke motionele piek draagt Small's Q_ms en Q_es (halfvermogen op √r0·R_e) — de vorm
groeide, geen getal bewoog, de cache vervalt. Registerrij `M-C-excursion` met eigen databehoefte
(kaart, versterkerpiek, marge; capability-matrix zegt per driver wat ontbreekt). De POORT: één
regel `effectiveDriveLimit` — gesteld, afgeleid, of de strengste — gelezen door `gateVerdicts`
én door de `drive-series-c`-voorbound, met `limit_source`, `stated_limit_dB`,
`derived_limit_dB` en `ceiling_re_peak_input_dB` op élk M-C-oordeel. De GRENS: het plafond
steekt als ACHTSTE feit over (`driveCeilingDbByModel`, in de vingerafdruk), de worker vouwt het
bij binnenkomst in zijn poortobject (`withDerivedDriveCeiling`) en zegt per weg of er een
plafond aankwam; de kandidaatverklaring leidt `protectionRule: 'stated'` óók af uit een afgeleid
plafond (`driveCeilingDerived`). De INVOER: driverkaart (Sd/Xmax van de Setup-tab, Bl/M_ms en de
meetspanning in het Engine v2-meetblok, parallelaantal uit het kastformulier),
A5a-velden `Amplifier peak power W`, `Nominal load Ω`, `X_max margin`; alles leeg = uit met het
veld genoemd, geen enkele default. Het paneel toont per driver plafond, x/V, beide routes, de
zwakste schakel en — bij gedocumenteerde meetspanning — de SPL bij P en bij de piek. De
recorder schrijft de klasse-A-waarden in `afgeleide_parameters.<driver>` (met
`_excursie_parameters` als V15-blok) en het klasse-B-blok `v49_excursie`;
`goldenClassification` kent het nieuwe blok, `frozenNetlistGates` en `goldenCasus1` herrekenen
beide.

---

**TABEL 1 — x/V op de resonantie en het plafond, per driver (klasse A). V_piek = √(2·160·8) =
50,6 V; marge 0,8.**

  | driver | f₀ Hz | Z_max Ω | Q_ms (bron) | Bl T·m | M_ms g | N | x/V mm/V | X_max·marge mm | V_toegestaan V | plafond dB re ingang |
  | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
  | tweeter | 924,3 | 16,63 | 1,37 (Q_mc sealed) | 2,6 | 0,15 | 1 | 0,0424 | 0,80 | 18,85 | **−8,58** |
  | mid | 88,8 | 44,22 | 7,34 (Q_mc sealed) | 4,9 | 7,2 | 1 | 0,3628 | 2,40 | 6,61 | **−17,67** |
  | woofer (paar) | 52,4 | 19,88 | 7,63 (bovenste reflexpiek, benadering) | 10,45 | 44,2 | 2 | 0,4192 | 6,84 | 16,32 | −9,83 (geen eis) |

**TABEL 2 — de AFGELEIDE grens per beschermde weg, naast −20 (gesteld), −25 (V47) en de
18-dB-regel.** Klasse B: `plafond − doorlaatbandgemiddelde |H|` van dít netwerk. Over de 13
gemeten netlists (drie referentiefilters, zeven levend, drie gedateerde bewijsstukken) ligt de
afgeleide grens op de **tweeter tussen −3,89 en −1,10 dB** en op de **mid tussen −14,45 en
−10,81 dB**; het levende corpus in volle breedte staat in `manifest_en_geometrie.v49_excursie`.

  | netlist | weg | V̄_passband dB | afgeleid dB | gesteld | poort las | M-C dB |
  | --- | --- | --- | --- | --- | --- | --- |
  | HUIDIG | mid | −5,75 | −11,93 | −20 | gesteld | −42,61 |
  | HUIDIG | tweeter | −6,89 | −1,69 | −20 | gesteld | −25,08 |
  | KAND_B | mid | −6,58 | −11,09 | −20 | gesteld | −34,17 |
  | KAND_V2_6 | mid | −3,29 | −14,38 | −20 | gesteld | −35,76 |
  | KAND_V2_7 | tweeter | −5,72 | −2,85 | −20 | gesteld | −21,92 |
  | V45_KAND_5 | tweeter | −5,22 | −3,35 | −20 | gesteld | −14,38 (eroverheen op −20, BINNEN de excursie) |
  | V38FIX_KAND_5 | mid | −3,22 | −14,45 | −20 | gesteld | −9,78 (eroverheen op ALLEBEI) |

**DE HOOFDBEVINDING: op ÉLKE weg van het levende corpus en van de drie referentiefilters is de
afgeleide grens RUIMER dan de gestelde −20, dus de gestelde waarde bijt daar overal en de
effectieve poort is niet bewogen.** 0 van 14 levende wegen waar de afgeleide grens strenger is.
**Over het HELE casusboek (256 wegen op 129 netlists) is dat NIET vacuüm, en de eerste versie van
deze zin was te breed — de guard ving het:** op zeven mids van het V28-corpus — het corpus van
vóór de vloer — is de afgeleide grens de strengste, met 0,05 tot 0,59 dB (`V28_KAND_4` −20,05 …
`V28_KAND_10` −20,59). Die zeven mids hebben een doorlaatbandgemiddelde BOVEN de ingang
(+2,4 tot +2,9 dB, een resonante lift die de zoektocht vóór de vloer kocht), en precies dat is de
vorm waarin een afgeleid plafond strenger wordt dan een conventie: "de mid mag op f_c hoogstens
−20 dB onder zijn doorlaatband" betekent bij een doorlaatband die 2,9 dB bóven de ingang ligt een
hogere absolute spanning dan de excursie toelaat. Het spiegelbeeld staat er ook: de mids van
`V28_KAND_1/2` liggen 23–25 dB ónder de ingang en lezen een afgeleide grens BOVEN nul (+5,1 /
+7,6 dB) — een mid die zó stil staat mag op f_c de volle piek hebben. De tweeter loopt casusboekwijd
van −5,23 tot +7,96 dB. `frozenNetlistGates` assert de levende helft als claim, de zeven V28-mids
als exact de verzameling die het `v49_excursie`-blok noemt, en de niet-vacuümheid ("bijt het
plafond nergens, dan is het niet te onderscheiden van een plafond dat nooit gelezen is").
**Daarom is er NIET geregenereerd en NIET bevroren:** de zoektocht ziet onder `min(−20,
afgeleid) = −20` dezelfde poortbeslissingen als onder V47b — de afgeleide grens kan op de mid pas
strenger worden dan −20 bij een doorlaatbandgemiddelde boven +2,3 dB en op de tweeter boven
+11,4 dB, en dat levert het V47b-veld nergens (de V28-mids bewijzen dat een zoektocht zónder vloer
het wél kan) — en de live byte-reproductie in `casus1V2Candidates` is wat dat bewijst in plaats van
beredeneert. Wat wél beweegt is de vingerafdruk (`facts=` met het achtste feit, `estimators=` met
z-resonance 1.1); `casus1_v2_herkomst.json` is niet herschreven en draagt dus nog de
V47b-vingerafdruk, met deze entry als de reden.

**EEN TWEEDE BEWAKER VING EEN R_e-AFHANKELIJKHEID.** Small's Q_ms leest het halfvermogensniveau op
√(Z_max·R_e), dus x/V van de woofer hangt aan WELKE R_e de pas oploste: op de ingevoerde
meterlezing van het paar (3,05 Ω) leest de zwakste schakel van HUIDIG 18,90 mm, op de motionele
fit (2,896 Ω) 0,2 mm anders. De recorder en `goldenCasus1` lezen de meterlezing (dezelfde als
`_M_E_parameters`, V16); `frozenNetlistGates` liet de fit staan en viel om. Vastgelegd als
`_excursie_parameters.R_e_lezing`, en de guard leest sindsdien dezelfde lezing als het blok. Mid
en tweeter bewegen niet (geen ingevoerde R_e).

**HET ANTWOORD OP V47b's MID-VRAAG: −7,3 dB op de mid was GEVAARLIJK, niet conservatief.** De
afgeleide mid-grens ligt op elke netlist van het levende corpus en de referentiefilters tussen
−14,5 en −10,8 dB; de kandidaat die V47b op de mid weigerde (`548,5 · 1981,2`, −7,3 dB) zat daar
4 tot 7 dB boven — bij de NAD-piek zou de MR13TX-4 op zijn eigen resonantie 0,8·X_max
overschrijden. `V38FIX_KAND_5` (mid −9,78) is het enige bevroren geval dat de afgeleide grens ook
zónder de −20 zou weigeren. De gestelde −20 is op de mid dus 6 tot 9 dB conservatiever dan de
excursie vraagt, maar hij wees de goede kant op. `frozenNetlistGates` pint dat de afgeleide
mid-grens op élke netlist van het beoordeelde veld ónder −7,3 ligt (de twee stille V28-mids
hierboven zijn de reden dat de claim over het beoordeelde veld gaat en niet over het hele boek).

**DE TWEETER IS HET SPIEGELBEELD, en dat is het scherpste stuk van deze meting.** Met X_max
1,0 mm, Bl 2,6 en M_ms 0,15 g laat de excursie op f_s 18,85 V toe — een plafond van −8,6 dB re
ingang en een afgeleide grens van −1,1 tot −3,9 dB re doorlaatband. De 18-dB-regel is op de
tweeter dus **geen excursiegrens**: wat een tweeter op f_s werkelijk begrenst is thermisch en
vervorming, precies de twee dingen waarvan de registerrij zegt dat M-C v2.0 ze niet dekt. Wie de
−20 op de tweeter zou vervangen door de afgeleide grens, laat de tweeter tot ~15 dB harder
aandrijven op 924 Hz zonder dat iets de thermische kant bewaakt.

**DE ROUTE-1/ROUTE-2-TEGENPROEF IS NIET GEMETEN, en dat staat als bevinding in het manifest.**
De verwachting vooraf was dat route 2 op de tweeter duidelijk hoger zou liggen — de waveguide,
gemeten. Zij kan op deze meetset niet gesteld worden: de ARTA-headers dragen geen meetspanning
(`Scale type = Pa`, `Scale = 0.0 dB`), de dBSPL-kolom leest 135–141 dB in de doorlaatband — geen
absolute SPL bij een bekende spanning — en nota A5d zegt letterlijk dat absolute
excursiegrenzen "gedocumenteerde meetspanning en -afstand plus Sd/Xmax" vereisen. De micafstand is
Sanders kastinvoer (1 m); de spanning ontbreekt. Route 2 staat daarom UIT met die reden op alle
drie de drivers, route 1 draagt het plafond, en de verhouding is `null` en geen getal. Er is
bewust geen 2,83 V aangenomen: een route op een aangenomen spanning publiceert een uitslag die
niemand gemeten heeft. De code voor route 2 is er en is op een bank getest (rondgang van een
kolvenformule); de tegenproef wacht op een hermeting met gedocumenteerde spanning.

**DE ZWAKSTE SCHAKEL: het wooferpaar, bij het NAD-piekvermogen.** Bij 50,6 V leest het
één-resonatormodel op de bovenste reflexpiek (52,4 Hz) **14 tot 21 mm** op de zeven levende
netlists en de drie referentiefilters (HUIDIG 18,9 mm) — 2,1 tot 3,1 keer de 6,84 mm van
X_max·marge — en onder de piek haalt het model de grens tot aan de onderkant van de sweep.
Twee kanttekeningen, allebei in het rapport: de bovenste piek van een reflexkast is een
gekoppelde tweegraads-resonantie die hier als één wordt gelezen (benadering, richting niet
vast te stellen), en onder f_b ontlast de poort de conus, waar het model ONDERschat. Geen eis
(P4: de woofer draagt geen hoogdoorlaat), wel de regel die de passief-of-hybride-beslissing
nodig heeft: **bij de piek van de M10 V2 is het de wooferexcursie die als eerste buiten het
lineaire gebied gaat, niet de tweeter.** Het argument voor een hybride (actieve LF) is dus
displacement-headroom in het laag, en het passieve veld mét alle gestelde eisen — vloer,
opslingering, Q_es, M-C — is het bewijsmateriaal dat de tweeter en de mid passief binnen hun
eisen blijven. De SPL-bij-P-regel (100 W continu en 160 W piek op 1 m) staat om dezelfde reden
als route 2 uit: zij vraagt de gemeten gevoeligheid in absolute zin.

**ADVIES: −20 BLIJFT STAAN, EN DE AFGELEIDE GRENS IS DE VLOER ERONDER.** Op de tweeter kan −20
niet vervallen op grond van excursie, want excursie is daar niet de grens; op de mid zou de
excursie −11 tot −14,5 toelaten, maar dezelfde thermische en vervormingskant is ook daar niet
gedekt. De juiste vorm is dus wat er nu draait: "de strengste geldt" — de conventie bewaakt wat
M-C v2.0 niet ziet, de afgeleide grens bewaakt wat de conventie niet wist (de mid), en het
oordeel zegt per weg welke van de twee las. −20 vervalt pas zodra een thermische of
vervormingsgrens gesteld is die de tweeterkant draagt.

**WAT ER NIET GEBOUWD IS.** Geen default voor X_max, marge, P of R_nom; geen drivernaam of
versterker in code (p6Lint groen, de nieuwe constanten zijn ρ₀ en 20 µPa, physical/norm); geen
thermische grens; geen trap; niets aan vloer, Q_es, opslingering of plateau. Het veld "Design
for … dB" (v1, default 96) is niet verwijderd — de v1-route is byte-identiek
(`toggleRegression`) — maar verliest zijn rol in M-C en is een P4-kandidaat: het is een
luisterniveau-gok waar V49 een gesteld piekvermogen voor in de plaats zet.

**TESTS.** `driveExcursion.test.ts` (15: handberekeningen op ω₀ = 1000 rad/s, uit-toestanden
met het veld bij naam, nieuwe meting op drie wetten, het één-resonatormodel op en onder f₀),
`driveCeiling.test.ts` (13: de strengste geldt in beide richtingen met `limit_source`, P2 zonder
plafond, de voorbound op dezelfde regel, vingerafdruk en achtste feit, de verklaring),
`determinism` (het achtste feit afgedwongen), `frozenNetlistGates` (zes V49-blokken),
`goldenCasus1` (klasse A per driver, Q_ms van de mid IS `sealed.qmc`), `goldenClassification`
(`_excursie_parameters`). Snelle laag: 142 + 1 bestanden, 1596 + 2 tests, groen. **Volle run
03-09-2026: 143 bestanden, 1598 tests, 1352 s, niets overgeslagen, groen** — inclusief de
byte-reproductie van `KAND-V2-1` door de échte route mét het achtste feit in de payload, wat de
"corpus beweegt niet"-claim tot een meting maakt. `tsc -b` groen; p6Lint, noWeights,
toggleRegression, choiceKeyGuard, corpusPairing, ciLayer, searchMeasure, barrierSource en
floorAsGoal ongewijzigd groen. In de draaiende app gecontroleerd: de drie A5a-velden en de
Bl/M_ms/meetspanning-velden renderen, het paneel toont per driver "M-C v2.0 is OFF … no complete
driver card" op de demobundel (Sd/Xmax aanwezig, Bl/M_ms en versterkerpiek niet), console schoon.

**OPENSTAAND.** (1) De meetspanning van de FF-metingen documenteren bij de eerstvolgende
hermeting — dan meet route 2 en wordt de waveguide-verhouding een getal. (2) Een thermische of
vervormingsgrens voor de tweeter, zodat −20 een afleiding kan worden in plaats van een
conventie. (3) De woofer-zwakste-schakel op een tweegraads-reflexmodel, met de gemeten f_b.
(4) "Design for … dB" als P4-kandidaat. (5) `casus1_v2_herkomst.json` draagt de V47b-
vingerafdruk; bij de eerstvolgende regeneratie schrijft de generator het achtste feit mee.

### V50 — bouwbaarheid als gestelde eis, en de M-C-grens per weg (03-09-2026, **BREAKING, alleen v2-runs**)

**AANLEIDING.** Dissipatie was de laatste onbewaakte as: het levende corpus zat rond 60 % van het
versterkervermogen in weerstanden met tot 35 W in één onderdeel (de V36-kolommen zichtbaar, niets
weigerde), en elke grens die sinds V30 dichtging duwde kosten hierheen. Daarnaast liet V49 zien dat
de gestelde −20 dB een dome-conventie is (vervorming en thermiek rond f_s, wat M-C v2.0 niet
modelleert) die óók de mid trof, terwijl de excursie-afleiding voor de mid −14,5 tot −10,8 dB zegt:
drie van acht V47b-kandidaten met de mid rond −15 dB waren veilig en werden toch geweigerd.

**DEEL A — BESCHERMING PER WEG.** `maxDriveOnFsDbByDriver` naast het ene `maxDriveOnFsDb`, met
één regel voor de volgorde (`statedDriveLimitDb`: per weg eerst, dan het ene veld, dan niets) en
`effectiveDriveLimit` (V49) erbovenop: per weg de strengste van gesteld en afgeleid, en met een leeg
gesteld getal de afgeleide grens alleen — `limit_source` zegt "no stated dB figure". Casus 1 stelt
sinds V50 `drive_op_fs_max_dB_per_weg: { tweeter: −20, mid: null }` en GEEN ene veld meer; het
manifest draagt de motivering (de 18-dB-regel is een dome-regel; voor een conus met ±3 mm is
excursie het faalmechanisme en die is afgeleid). In de app: een veld "max drive on f_s" per tak in
het Engine v2-meetblok, dat het ene veld voor die tak overschrijft; de flank-orde-afleiding
(A5d.3(ii)) leest per paar het getal van de BOVENSTE weg in dezelfde volgorde. Op de
referentiefilters leest de mid nu −11,9 / −11,0 / −11,1 dB als effectieve grens (was −20) en de
tweeter blijft op −20 (afgeleid −1,7 / −1,1 / −1,1, dus de conventie bijt daar nog overal).

**DEEL B — BOUWBAARHEID.** Twee grootheden, allebei al in de oplossing, nu met een toegestane
waarde per element (`metrics/buildability.ts`, `buildability/1.0`; registerrijen M-A/part en M-L
in A4). (1) **Vermogen per weerstand:** M-A's eigen elementen (geen tweede integraal) bij het
CONTINUE versterkervermogen — een nieuw manifestveld `versterker_continu_vermogen_W` (100 W, NAD
M10 V2) naast P_piek van V49, want thermiek is een gemiddelde en geen piek; tot V50 stond dat getal
als literal 100 in elk testbestand en script en heeft het nu zijn ene huis (P6). Toegestaan: de
opgave van het GEKOZEN catalogusonderdeel (met de snap aan; `partRatings.ts` leest
`VxpPart.catalog`) en anders de gestelde klasse (`weerstandsklasse_W`, 10 W — MOX/Superes), maal de
gestelde marge (`weerstandsmarge`, 0,5 — een filterweerstand in een gesloten kast zonder koeling
loopt op de helft van zijn opgave al heet). Het oordeel leest het element met de MINSTE marge, niet
het heetste. (2) **Stroom per spoel:** `|I_L(f)|·V_piek/E_g` uit de elementstromen, ONGEWOGEN (een
kern verzadigt in een halve periode) op de frequentie van het maximum, tegen de verzadigingsopgave
van het gekozen onderdeel (`CatalogPart.maxCurrentA`, schema sinds V50; een stapel is zo sterk als
haar zwakste lid) of de gestelde spoelklasse. Luchtspoelen hebben geen verzadiging en worden nooit
geoordeeld. Beide zijn POORTEN (`M-A/part`, `M-L` in `GATE_IDS`, verwerping in de V31-vorm), alleen
gewapend als de velden gesteld zijn (P4), in de vingerafdruk — het continue vermogen en de
piekingang ALLEEN zolang de poort die ze leest gewapend is, zodat V36's "de wattkolom is geen
vingerafdruk-ingrediënt" blijft staan. Ze staan in het paneel (blok "Buildability", twee poortrijen)
en in de shortlist-kolom (`largestResistorAllowedW`, `worstCoil`). Wat de poort NIET doet: een
weerstand splitsen — het oordeel noemt de serie/parallel-bank als remedie en de generator bouwt
hem niet.

**DE CATALOGUS-INVENTARIS.** Het schema kent sinds V50 `maxCurrentA` (`maxCurrentA` /
`max_current_a` / `saturationA`). In de v8-catalogus dragen **108 van 108 weerstanden** een
vermogensopgave (10 W: Jantzen MOX 53, Superes 40, Duelund CAST 7; 20 W: Mundorf MResist Supreme
8) en **0 van 2116 spoelen** een stroomopgave (1482 Air Core, 611 P-Core, 9 Wax, 7 Aronit, 7
Zero-Ohm). De Jantzen C-Coil-documentatie — de kernspoelen die dit ontwerp gebruikt — is gelezen en
noemt géén verzadigingsstroom, alleen "getest met 1000 W, 700 W gedurende 48 uur continu": een
vermogensopgave zonder last, waaruit een stroom afleiden een aanname over de last zou zijn. Daarom
is `spoelklasse_A` van casus 1 LEEG met die bevinding, oordeelt M-L niets en rapporteert hij de
piekstroom per spoel (levend corpus: 13,5–33,2 A piek bij 50,6 V, de drukste in L1 of B·L2 tussen
274 en 508 Hz).

**HUIDIG ALS SANITY, GEMETEN VÓÓR DE REGENERATIE (`scripts/measure-v50-buildability.ts`).**

  | netlist | weerstanden (W bij 100 W continu) | heetste | W | toegestaan | oordeel |
  | --- | --- | --- | --- | --- | --- |
  | HUIDIG | R8 25,5 · B·R9 19,8 · C·R15 0,4 · B·R16 0,0 | R8 (3,3 Ω) | 25,5 | 5,0 | EROVERHEEN ×5,1 |
  | KAND_A | R8 30,9 · B·R9 20,0 · C·R15 1,5 | R8 (4,0 Ω) | 30,9 | 5,0 | EROVERHEEN ×6,2 |
  | KAND_B | B·R9 19,6 · R8 18,7 · C·R15 0,3 | B·R9 (6,5 Ω) | 19,6 | 5,0 | EROVERHEEN ×3,9 |
  | V49_KAND_1…7 (het V47b-veld) | — | R5 / R7 / B·R9 | 13,6–34,9 | 5,0 | 7 van 7 EROVERHEEN |

**Nog net toelaatbaar:** HUIDIG bij klasse ≥ 51 W (bij 100 W en marge 0,5), óf bij ≤ 19,6 W
continu (bij klasse 10 W). Achttien gedateerde netlists (V28–V38-fix) HALEN de eis wel, met
0,5–1,4 W in een tweeterpad (C·R6) en géén wooferpad — dat is de eis die haalbaar is zodra de
woofer niet resistief verzwakt wordt, en precies wat de anker-verzwakking van V45 (de woofer betaalt
4,6–8,5 dB tegen het anker) uitsluit. **Dat is de bevinding over HUIDIG én over deze casus, en geen
reden om de eis te versoepelen:** de eis is de fysica van een 10 W-weerstand bij 100 W continu.
`frozenNetlistGates` assert haar ("géén referentiefilter en géén levende netlist haalt M-A/part;
HUIDIG met een factor > 4; het casusboek draagt wél netlists die haar halen").

**DE BESLISSING DIE HIERUIT VOLGT IS SANDERS, EN ZIJ STAAT IN HET MANIFEST
(`gestelde_eisen.bouwbaarheid_op_de_zoektocht`, `gewapend: false`).** De weerstandseis is GESTELD
en het rapport oordeelt ermee op élke bevroren netlist; op de v2-ZOEKTOCHT van casus 1 is zij nog
niet gewapend, want een regeneratie met de eis gewapend levert — de sanity zegt het vooraf —
vijftien verwerpingen en een leeg corpus, wat de suite niet draagt (V42: geen uitzonderingslijst ter
grootte van het corpus) en niets meet dat de tabel hierboven niet al zegt. Vier uitwegen, geen
daarvan is de mijne: (a) de klasse, de marge of het continue vermogen anders stellen (20 W continu
is nog steeds ver boven gemiddeld luisterniveau; 51 W-weerstanden bestaan); (b) de serie/parallel-
bank als TOPOLOGIE-ELEMENT — de gemeten reden staat hier, de generator bouwt het niet (open entry);
(c) de anker-verzwakking niet in weerstand maar in een actieve LF-tak: de hybride route; (d) de eis
als rapporteis laten staan. `casus1BuildabilityOnSearch` leest het veld, `CASUS1_V2_GATES` volgt het,
en `casus1V2Candidates` assert dat de meetopstelling het besluit noemt.

**DE REGENERATIE (V2_JOBS=8, 2673 s = 44,5 min op 18 kernen; het V49-corpus vooraf bevroren als
`V49-KAND-*`, `v49_corpus`), en het veld BEWOOG NIET.** Dezelfde zeven kandidaten halen de
shortlist en alle zeven netlists zijn onderdeel-voor-onderdeel identiek aan het bevroren
V49-corpus (= het V47b-veld; V49 wekte niet opnieuw op). De vóór/ná-tabel
(`compare-corpora.ts v49 live`) is daarmee de identiteit: 7 paren, elke gepaarde delta exact nul,
dissipatie 51,26 %, grootste weerstand 26,47 W, spoelpiek 21,80 A, M-K 12,36° / 8,04°, min |Z|
3,04 Ω, opslingering −0,73 dB, lobing −2,79 dB. De vingerafdruk beweegt wél (`gates=` met de
per-weg-map en de piekingang, `facts=`/`estimators=` die V49 al had aangekondigd), dus
`casus1_v2_herkomst.json` is herschreven en de byte-reproductie in `casus1V2Candidates` bewijst
dat het dezelfde route is.

**WAAROM DE MID-WEIGERINGEN NIET TERUGKEERDEN — de verwachting vooraf was verkeerd, en de meting
zegt waarom.** V47b telde de mid in drie van de acht weigeringen; V50 verving de −20 op de mid door
de afgeleide excursiegrens (−11,2 tot −14,4 dB op dit veld). Dezelfde acht kandidaten leveren
niets, en de twee mid-weigeringen staan er nog: `466,5 · 1719` met de mid op **+5,6 dB** tegen
−13,6 afgeleid, `548,5 · 1981,2` met **−7,3 dB** tegen −11,2 afgeleid. Dat zijn geen
"−15 dB-mids die veilig zijn" — die bestonden in dit veld niet; wat de conventie op de mid
weigerde lag 4 tot 19 dB bóven wat de excursie toelaat, precies de V49-bevinding ("−7,3 op de mid
was gevaarlijk, niet conservatief"). De derde mid-vermelding van V47b (`548,5 · 1491,4`, mid
−11,1) valt onder V50 alleen nog op de vloer en de tweeter: de mid haalt daar de afgeleide grens.
Deel A heeft dus WEL het oordeel veranderd (de mid wordt op haar eigen faalmechanisme geoordeeld
en zegt het: `limit_source` "excursion-derived ceiling (no stated dB figure)") maar op dit veld
geen enkele beslissing — en dat is een meting, geen aanname: de byte-identieke netlists zijn het
bewijs dat de losser geworden serie-C-voorbound op de mid nergens bond.

  | kandidaat (W-M · M-T) | V47b weigergrond | V50 weigergrond |
  | --- | --- | --- |
  | 396,7 · 1294 | tweeter −12,1 | tweeter −12,1 (gesteld −20) |
  | 466,5 · 1294 | tweeter −11,9 · vloer 1,99 Ω | vloer 1,99 Ω · tweeter −11,9 |
  | 466,5 · 1491,4 | tweeter −16,6 · vloer 2,49 Ω | vloer 2,49 Ω · tweeter −16,6 |
  | 466,5 · 1719 | tweeter −17,0 · **mid +5,6** | **mid +5,6 tegen −13,6 (afgeleid)** · tweeter −17,0 |
  | 548,5 · 1294 | tweeter −13,2 · vloer 0,02 Ω | vloer 0,02 Ω · tweeter −13,2 |
  | 548,5 · 1491,4 | tweeter −17,5 · mid −11,1 · vloer 1,11 Ω | vloer 1,11 Ω · tweeter −17,5 (mid haalt de afgeleide grens) |
  | 548,5 · 1719 | tweeter −17,3 | tweeter −17,3 |
  | 548,5 · 1981,2 | **mid −7,3** | **mid −7,3 tegen −11,2 (afgeleid)** |

**DE BALANS, EN ZIJ IS EXPLICIET DE VRAAG WAAROP DE PASSIEF-OF-HYBRIDE-BESLISSING RUST.** Met
álle eisen gewapend — vloer 2,6 Ω, opslingering 1,4 dB, Q_es× 2,4, basplateau −2,5 dB, M-C per weg
(tweeter −20 conventie, mid afgeleid −11…−14), en nu ook vermogen per weerstand en stroom per
spoel — is dit het veld: zeven passieve ontwerpen die vloer, opslingering, Q_es, plateau en
bescherming halen, en die ALLE ZEVEN 13,6–34,9 W in één weerstand verstoken bij 100 W continu
tegen 5 W die een 10 W-klasse met 50 % marge toelaat. Het spoelvermogen is geen probleem
(13,5–33 A piek zonder verzadigingsopgave om ze aan te houden; de C-Coil-documentatie zwijgt).
Wat overblijft is één as: de anker-verzwakking van de woofer (4,6–8,5 dB, V45) is bij 100 W
continu 14 tot 35 W in het serie-pad, en dat is niet met een enkele 10 W-weerstand te bouwen.
**Het argument voor een hybride is daarmee tweeledig gemeten:** displacement-headroom in het laag
(V49: 14–21 mm tegen 6,84 mm bij de NAD-piek) én de resistieve niveauverzwakking van de woofer
die een passief netwerk in warmte moet omzetten. Passief blijft mogelijk op drie manieren die alle
drie Sanders keuze zijn — een 50 W-klasse, een bank van weerstanden (topologie-element), of een
lager gesteld continu vermogen (≤ 19,6 W voor HUIDIG) — en op geen daarvan hoeft de engine iets te
verzinnen: de getallen staan in `v50_bouwbaarheid` per netlist.

**WAT ER NIET GEBOUWD IS.** Geen default voor klasse, marge of continu vermogen; geen
fabrikantsnaam in engine-code (de catalogus is data; `partRatings.ts` leest wat `catalogParts()`
draagt); geen thermisch model van de driver; geen splitsing van weerstanden door de generator; niets
aan vloer, Q_es, opslingering, plateau of de excursie-afleiding. De vloer (V30) blijft een
zoekdoel; de weerstandseis is dat niet — zij is een poort, en of zij de zoektocht ook STUURT (een
term, een grens op de padweerstand) is een aparte vraag zodra zij gewapend is.

**TESTS.** `metrics/buildability.test.ts` (7: handberekening op een papieren netwerk — Rg 1 mΩ,
want de solver deelt de geleverde stroom door Rg en de eerste versie kreeg vier NaN's —,
uit-toestanden met het veld bij naam, opgave-boven-klasse met de SKU, nieuwe meting op twee
wetten, de minste-marge-keuze), `optimizer/buildabilityGate.test.ts` (12: absent is absent en
P2 op de tweewegfixture, klasse zonder marge, minste marge, drie null-toestanden, vingerafdruk
met het vermogen alleen bij toelating, de per-weg-resolutie waarin dezelfde −15 dB binnen is op
de mid en eroverheen op de tweeter, `partRatingsOf`), `frozenNetlistGates` (zes V50-blokken,
V47/V49 van vorm veranderd zonder van claim te veranderen, de gate-id-dekking laat M-A/part null
toe op de ene netlist zonder weerstand), `gates.test.ts` (het absent-geval stelt vermogen en
piek: geen grenzen, wel wat de twee poorten nodig hebben om te lezen), `gateReport` (idem),
`f4cRegression` (een tweede gedateerd oordelenblok `verdicts_sinds_V50` naast het V32-blok, dat
zijn vier id's blijft pinnen; `scripts/record-f4b2-v50-verdicts.ts`), `casus1V2Candidates` /
`casus1V2Refusal` (de meetopstelling noemt `maxDriveOnFsDbByDriver` en niet meer het ene veld, en
het bouwbaarheidsbesluit), `goldenClassification`, `corpusPairing` (volledig gedateerd, geen
herankering nodig), `p6Lint` (ving `1e3` voor mH; nu `H_PER_MH`). Snelle laag (03-09-2026, vóór de f4c-toevoeging, naast niets): 283 s, 143 + 1 overgeslagen bestand, 1619 + 2 overgeslagen tests, met twee rode f4c-claims die het V50-oordelenblok kregen. **Volle run 03-09-2026: 145 bestanden, 1625 tests, 1362 s (22 min 42), niets overgeslagen, groen** — de eerste volle run (1356 s) viel op de byte-inventaris van `ciLayer` om (zes namen, tien tests sinds V50) en is na die reparatie in zijn geheel herhaald, want een run met één rood bestand is geen acceptatie. De telling is +2 bestanden sinds V49 (de twee bouwbaarheidstests, 19 claims) en +27 tests (19 daar, 2 in `f4cRegression`, 6 in `frozenNetlistGates`); het corpus bewoog niet, dus de `it.each` over het levende veld telt nog zeven. `tsc -b` groen; p6Lint, noWeights, toggleRegression, choiceKeyGuard, goldenClassification, corpusPairing en ciLayer groen. In de draaiende
app gecontroleerd: de drie bouwbaarheidsvelden en het per-tak-veld "max drive on f_s" renderen
(drie taken), de twee poortrijen staan in het paneel ("not evaluated" zonder netwerk), console
schoon; productiebuild groen.

**OPENSTAAND.** (1) Sanders beslissing over de weerstandseis op de zoektocht (zie boven). (2) De
parallelle/serie-weerstand als topologie-element van de synthesestap, met de gemeten reden hier.
(3) Een verzadigingsstroom voor de C-Coil — van Jantzen, of gemeten — waarmee `spoelklasse_A` een
getal wordt en M-L oordeelt; de piekstromen staan al in het blok. (4) `qesMultiplierMax` per weg
(V45). (5) De weerstandseis in de zoektocht laten sturen zodra zij gewapend is (nu: alleen een
poort).

## Casus S1 — synthetische grondwaarheid voor de R_e-schatter (F3b, 26-08-2026)

*De eerste casus in dit boek die geen luidspreker is. A7 noemt synthetische grondwaarheid als
onderdeel van de teststrategie; tot F3b bestond dat onderdeel alleen op papier, en de oude
`estimateRe` droeg er letterlijk een TODO over: "replace with a motional-impedance fit once the
estimator is validated against a synthetic ground-truth case (A7)".*

**Waarom een verzonnen kromme naast elf gemeten bestanden.** Casus 1 kan één vraag over R_e niet
beantwoorden, en het is de enige die telt: wélk getal is goed. Het casusboek draagt twee lezingen
van dezelfde R_e (2,90 en 3,05 Ω, V16), en beide zijn aflezingen van een meter of van een sweep —
geen van beide is de waarheid, alleen een andere meting ervan. Twee schatters die het eens worden
is consensus, geen validatie: als ze dezelfde systematische fout maken, zwijgen ze samen. Een
kromme die zijn eigen R_e kent, kent hem exact.

**De kromme.** Z(ω) = R_e + jωL_e + één motionele tak, gesampled op 400 logaritmische punten:

| grootheid | waarde |
|---|---|
| R_e (bekend, per constructie) | **6,000 Ω** |
| L_e | 0,3 mH |
| motionele tak | R 30 Ω, f 40 Hz, Q 6 |
| sweepbereik | 25 Hz – 4 kHz |

De sweep begint op 25 Hz tegen een resonantie op 40 Hz — 0,68 octaaf eronder, iets krapper dan
casus 1's woofer (10,07 Hz tegen f_L = 16,5 Hz, 0,71 octaaf). Dat is opzet: dit is die woofer in
het klein, mét het antwoord erbij.

**Wat de drie schatters lezen:**

| schatter | waarde | fout |
|---|---|---|
| directe aflezing (mediaan Re(Z), laagste 2,5 %) | 7,114 Ω | **+18,6 %** |
| motionele fit, DC-term | **6,000 Ω** | < 0,05 Ω |
| gerapporteerde motionele rok op 25 Hz | 1,11 Ω | verklaart het verschil |

Directe aflezing − rok = 6,00 Ω. De schatter zegt dus niet alleen een ander getal, hij zegt
precies hoeveel van het oude getal motionele impedantie was, en dat sluit.

**Wat deze casus sluit.** V8d vroeg om "motionele fit of extrapolatie". Die is er nu, en de
acceptatie ervan rust op grondwaarheid in plaats van op overeenstemming tussen schatters — het
verschil tussen "de twee zijn het eens" en "de fit heeft gelijk". De oude adviserende
f²-extrapolatie is verdwenen; zij las op casus 1's woofer **−2,69 Ω** en was daarmee het soort
getal dat een schatter publiceert als niemand hem een geval geeft waarvan het antwoord bekend is.

**Wat deze casus verder bewijst (en dat kon casus 1 niet).** De kromme draagt een tweede,
instelbare kruin op 300 Hz. Op 4 Ω hoogte ligt hij precies tússen de twee detectiedrempels:
onzichtbaar voor de piekzoeker op de directe aflezing (1,6 × 7,114 = 11,38 Ω), zichtbaar voor de
piekzoeker op de gefitte R_e (1,6 × 6,004 = 9,61 Ω). Daarmee is de verschuivende piekset
maakbaar, en dus toetsbaar — op een gemeten set is het een toevalstreffer of hij zich voordoet.
De lus classificatie → fit → herclassificatie draait op **vaste diepte**: één herclassificatie,
vlag bij verschil, nooit een derde ronde (A5e.4 — een determinismebelofte kan niet rusten op een
iteratieteller die van de kromme afhangt). De assert die het werk doet is niet de passenteller
maar dat de fit ná de verschuiving nog stééds één tak draagt: was er een derde ronde geweest, dan
was hij opnieuw gezaaid met twee.

**Wat deze casus NIET bewijst, en dat hoort erbij.** De kromme is precies het model dat de fit
aanneemt, dus zij toetst de lus rond de fit en niet of het model een echte driver beschrijft. Die
vraag beantwoordt casus 1, op gemeten data: residu 0,013–0,030 en een woofer die op 0,004 Ω van de
meterlezing van het paar landt. De twee casussen toetsen verschillende dingen en vervangen elkaar
niet.

## A9. Startprompts
Vervangen door het separate document `OptimizerV2_startprompts.md` (25-08): Prompt A = sessie F0 (sanering), Prompt B = sessie F1 inclusief **engine-toggle** (standaard uit, byte-identieke regressie met toggle uit) en de rapporterende metriekbibliotheek. Fixtures: meetbestanden casus 1 + drie netlists + `golden_refs_casus1.json` (bevat nu ook manifest en geometrie).
