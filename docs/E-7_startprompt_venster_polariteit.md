# Startprompt E-7 — Het ±venster van 70 dB (bijvangst van E-6)

*Eén korte Claude Code-sessie met één stoppunt voor Sander. Een afleidingsfout opsporen en, als hij is wat het lijkt, repareren. Geen poort, geen budget, geen venster, geen corpus.*

---

> **Rol.** Je spoort één getal op dat niet kan kloppen. Meten, niet toeschrijven: elke stap in de uitleg komt uit een run of een oplossing die je kunt herhalen.
>
> **Eerst lezen.** `CLAUDE.md` (de E-6-entry en V52, de E-3-entry over `foldDriverPolarity`, U-3d, U-7 en H-5), `docs/E-6_meting.md`, en in `docs/CrossoverStudio_OptimizerV2_strategie_v2.md` de E-3-passage rond "±70,5 dB / RMS 3,70".
>
> **Werkafspraken (ongewijzigd).** Nederlands. Inventaris vóór wijziging. Golden refs zijn de autoriteit. V-nummers voor afleidingsfouten. Geen bewerkingen tijdens een lopende verificatie. Geen suite naast een browserrun.
>
> **Wat er gemeten is.** In de E-6-meting leest de ±venster-kolom op casus 1b (kandidaat 1947,9 Hz) **70,5–70,7 dB in elke geleverde arm**, terwijl rms (0,56–0,70 dB) en M-K (2,5–3,8°) op dezelfde netwerken gewoon goed zijn. Dat is niet de schuif: de arm die niets aan de schuif verandert leest het ook.
>
> **Het spoor.** E-3 mat precies hetzelfde getal: de shortlist las DEZELFDE onderdelen *zonder* de omgekeerde tweeter op **±70,5 dB / RMS 3,70**. Na `foldDriverPolarity` (het `Driver`-onderdeel draagt `inverted: true`) werd dat ±1,20 / RMS 0,60. Hier is RMS goed en het venster niet. **Hypothese:** de lezer van het ±venster ziet de polariteit in het driveronderdeel niet, of leest een andere som (zonder de vouw, of met `adjust` dubbel toegepast, de U-3d-vorm), terwijl de rms-lezer de juiste som leest. De casus-1b-fixtures zijn bij H-5 gepind op de enumererende ontwerpstap, en die kiest daar de omgekeerde tweeter. Daarom vuurt het hier wel en in de app (H-5 textbook, LR4, niets omgekeerd) bijna nooit.
>
> ---
>
> ### Fase 0 — Opsporen (geen wijziging)
>
> 1. **Waar komt de kolom vandaan?** Volg de ±venster-kolom van de shortlist terug tot de functie die hem berekent (`requirements/response.ts` of wat het werkelijk is), en die tot de som die hij leest. Doe hetzelfde voor rms. Lever de twee paden naast elkaar: welke som, welk raster, welke band, welke gladding, en of de polariteit van het driveronderdeel en `adjust` meetellen.
> 2. **Reproduceer met één factor.** Neem het geleverde netwerk van de E-6-arm "alle op 0,5" (`test-fixtures/e6_phase_priority.json`). Lees het venster (a) zoals de shortlist het leest, (b) met de tweeter-polariteit omgedraaid, en (c) via `buildReport` op hetzelfde netwerk. Klapt (b) het getal naar ±1–2 dB, dan is de hypothese bevestigd.
> 3. **Hoe ver reikt het?** Leg dezelfde lezing over het bevroren casusboek (élke netlist met een omgekeerde driver), over de shortlist van de app (tweeweg- en driewegdemo, met `polarityArms: 'both'` zodat er spiegelarmen zijn) en over een handmatig omgedraaide weg via de U-7-knop. Welke oppervlakken tonen het verkeerde getal, en sinds welke sessie? Gebruik `git bisect` alleen als de code-archeologie het niet beantwoordt.
> 4. **Boek het als V-nummer** (het volgende vrije nummer na V52) in de nota, waar de V-reeks staat, met een verwijzing vanuit `CLAUDE.md`. Dat is boekhouding en geen reparatie.
>
> **Stop en leg Sander voor (B-6)**, met de cijfers in je bericht:
> - wat de oorzaak is, met het bewijs uit stap 2;
> - welke oppervlakken het raakt en hoe vaak (stap 3);
> - je voorstel voor de reparatie, en of die een **poortoordeel** of een **shortlistrij** kan verplaatsen. Het ±venster is een A5e.1-eis (`splWindowPlusMinusDb`), dus een verkeerde lezing kan kandidaten verkeerd laten slagen of falen. Zeg of een gestelde eis op een bestaand corpus daardoor anders zou uitvallen.
> - Blijkt de hypothese fout, zeg dat dan net zo duidelijk, en wat het wél is.
>
> ---
>
> ### Fase 1 — Repareren (na akkoord)
>
> - **Eén som, twee lezers.** Het ±venster en rms lezen dezelfde som op dezelfde manier als het rapport. Maak geen tweede implementatie; laat de afwijkende lezer de bestaande functie aanroepen (A3g).
> - **Een test met de omgekeerde driver**: een netwerk dat zijn polariteit in het `Driver`-onderdeel draagt, gelezen door de shortlist én door het rapport, met hetzelfde venster op beide, plus de tegenproef zonder omkering. Doe dat met de opzettelijke breuk erbij.
> - **Versiebump** als de schatter van het venster van gedrag verandert (de schatter-versioneringsregel), met de cache-invalidatie die daarbij hoort.
> - **P2:** op elke netlist zonder omgekeerde driver is elk getal byte-identiek. `f4cRegression`, `workerRouteRegression` en `toggleRegression` (de motorgrens) reproduceren.
> - **Klasse-B-referenties die het venster dragen** worden herleid met een brug in de V15-vorm (`_waarden_<oud>_tot_E7`), niet stil herschreven. De recorder gooit als een andere kolom beweegt.
> - **Volle run verplicht** als de reparatie de zoektocht of een shortlistoordeel raakt (alleen gedraaid, op de boom die gecommit wordt), met alle vier de live ketenruns byte-identiek. Raakt zij alleen een rapportkolom, zeg dat dan en laat de snelle laag volstaan.
>
> ---
>
> **Buiten scope.** Poorten, budgetten, vensters en corpus. Geen regeneratie. De polariteitsregels van H-5 en U-7 zelf. De andere open punten (v2 voor de tweeweg zonder impedanties, `physWin3` en de drempels, de voicing in Guided).
>
> **Acceptatie.**
> 1. De oorzaak met bewijs (stap 2), de reikwijdte (stap 3), het V-nummer in de nota, en Sanders akkoord vóór fase 1.
> 2. Shortlist en rapport lezen op een netwerk met een omgekeerde driver hetzelfde ±venster, gepind door een test met de opzettelijke breuk.
> 3. Op casus 1b leest de E-6-kandidaat een venster in de orde van zijn rms, en niet meer 70 dB. Draai `scripts/measure-e6-phase-priority.ts` opnieuw en toon het.
> 4. P2 gemeten, de byte-baselines groen, en klasse-B-bruggen in de V15-vorm.
> 5. Browsercontrole: een tweewegrun met `polarityArms: 'both'`; de spiegelarmen lezen een plausibel venster. De console blijft leeg.
> 6. Afsluitend: de gewijzigde bestanden, of de CI-tagtelling (19) beweegt, en wat er níet gedaan is.
