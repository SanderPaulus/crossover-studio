# Startprompts OptimizerV2 — Crossover Studio

*Twee losse Claude Code-sessies, in deze volgorde. Prompt B pas starten als Prompt A is afgerond en gemerged. Bijlagen die in de repo aanwezig moeten zijn vóór Prompt B: `CrossoverStudio_OptimizerV2_strategie_v2.md` (docs/), `golden_refs_casus1.json` (test-fixtures/), `optimizer_v2_prototype.zip` uitgepakt (docs/prototype/, alleen referentie), en de tien meetbestanden van casus 1 plus de drie netlists — huidig ontwerp, KAND-A (`KAND-A-2eorde-continu.adsfilter.json`, continue waarden zonder cataloguslabels) en KAND-B — (test-fixtures/casus1/).*

---

## PROMPT A — Sessie F0: Z_FLOOR_OHM-sanering

> Werk op een schone boom; dit is een ononderbroken saneringssessie, geen feature-werk.
>
> **Doel.** Verwijder elke resterende verwijzing naar de constante `Z_FLOOR_OHM` uit de codebase. Bekende locaties: zes plekken in de netOptimizer (beide chains), `minimize.ts`, en ~10 plekken in `App.tsx`. Het optionele, door de gebruiker in te vullen impedantie-ondergrens-veld (zonder default) blijft volledig functioneel — alleen de app-constante en zijn doorwerking verdwijnen.
>
> **Werkwijze.** Eerst een volledige inventarisatie (grep + typecheck) en die als lijst rapporteren vóór je iets wijzigt. Daarna locatie voor locatie saneren, met na elke wijziging een typecheck. Geen gedragswijzigingen buiten de sanering; geen refactors "omdat je er toch bent".
>
> **Acceptatie.** (1) `grep -ri z_floor` levert nul treffers in src. (2) Bestaande testsuite groen. (3) Een optimalisatierun met het gebruikersveld ingevuld en één met het veld leeg gedragen zich als voorheen (leg beide vast als regressietest als die nog niet bestaat). (4) Rapporteer afsluitend de volledige lijst gewijzigde bestanden.

---

## PROMPT B — Sessie F1: Engine v2-fundament + toggle + rapporterende metriekbibliotheek

> **Context.** Lees eerst `docs/CrossoverStudio_OptimizerV2_strategie_v2.md`, met nadruk op P1–P6, A3, A4, A5 (opnamepas, geldigheidspropagatie, capability-matrix), A5b/c/d en de teststrategie A7. De Python-bestanden onder `docs/prototype/` zijn uitsluitend specificatie-referentie (paden hardcoded, schatters met bekende fouten V8a–h) — niet porten, wel raadplegen. Voer géén van de openstaande A5e-besluiten eigenmachtig uit; wat A5e raakt wordt geparkeerd met een TODO-verwijzing.
>
> **Deliverable 1 — Engine-toggle.** Een instelling "Engine v2 (experimenteel)", standaard **uit** (P4). Architectuur: één centrale vlag (bijv. `engineV2Enabled` in de bestaande settings-store) en een dunne engine-façade zodat de latere optimizer-omschakeling (F2+) op dezelfde vlag kan aanhaken zonder verbouwing. Bij F1 schakelt de toggle uitsluitend de nieuwe rapportagelaag in. Harde eis: **met de toggle uit is het gedrag van de app aantoonbaar ongewijzigd** — leg dat vast met een regressietest die een referentie-optimalisatierun byte-vergelijkt met en zonder de v2-module geladen. Alles wat de v2-laag toont draagt een zichtbaar "Engine v2"-kenmerk plus module-versie.
>
> **Deliverable 2 — Opnamepas (module `engine2/ingest`).** Conform A5:
> 1. Manifest-model: per meetbestand tags (driver, type Z/NF/FF, hoek) — auto-detectie uit ARTA-headers waar mogelijk (venstertijden, referentietijd, samplerate), rest via een eenvoudig tag-formulier.
> 2. Afgeleide parameters per driver, **bandloos** (geen enkel letterlijk frequentiegetal in de code — P6): Re via Re(Z) met motionele-nabijheidswaarschuwing (V8d), resonanties met Q via fasenuldoorgang-classificatie (reflex/gesloten-detectie zoals in het prototype `ingest.py`-vervolg), breakup-scan geclipt op geldigheidsgrenzen (V8c), geldigheidsgrenzen per meting: header-vloer 1/T en 2/T als primaire, hard bindende detector (A5b.1).
> 3. Capability-matrix: per metriek × driver actief/uit mét reden, als datastructuur én zichtbaar in de UI.
> 4. Geldigheidspropagatie: elk afgeleid resultaat draagt zijn interval; elke metriek rapporteert dekking.
> 5. **Schatter-versionering vanaf dag één**: elke extractor exporteert een versiestring; afgeleide-parameter-cache invalideert op versiebump (A5e.5 is hiermee deels genomen; de rest van A5e blijft geparkeerd).
>
> **Deliverable 3 — Metriekbibliotheek (module `engine2/metrics`), alleen rapporterend.** Pure functies met gedeclareerde databehoefte, volgens A4: M-A dissipatie (IEC-weging, % van versterkervermogen; normeer op E_g² — V1-valkuil), M-B EPDR, M-C spanning-op-f_s (doorlaatband afgeleid uit gevonden kruispunten), M-D LF-bult (band afgeleid uit de bovenste Z-piek), M-E Thévenin/Q-vermenigvuldiging (twee-belastingenmethode), M-F-interim (niet-monotone λ-score) en M-F-eind (verticale synthese, puntbron + symmetrievlag), M-G directiviteit (−3/−6 dB@θ), M-H breakup-afstand (ernst-weging als expliciet gemarkeerde, ongekalibreerde functie), M-J groepvertraging vs. drempelcurve. Vereiste solver-uitbreiding: knoopspanningen en elementstromen beschikbaar maken vanuit de bestaande MNA-oplossing.
>
> **Deliverable 4 — Rapportpaneel.** Zichtbaar wanneer de toggle aan staat, per geladen filter + meetset: afgeleide parameters per driver, capability-matrix, alle actieve metriekwaarden met dekking, en de pre-design-blokken die zonder A5e-besluiten kunnen: verankerde gevoeligheids-gaps (A5d.4) en haalbare kruisvensters met bindende-grens-vermelding (A5d.3, zonder optimizer-koppeling).
>
> **Tests (A7).**
> - Golden references: laad `test-fixtures/casus1/` en assert alle waarden uit `golden_refs_casus1.json` binnen de daarin opgegeven toleranties.
> - Eenheidstests tegen handberekeningen: deler-dissipatie, EPDR bij bekende fasehoek, Thévenin van een bekende deler, header-vloer uit een synthetische header.
> - Nieuwe-meting-test: synthetisch verschoven f_s en toegevoegde breakup-piek → afgeleide parameters en banden bewegen mee.
> - Dekkingstest: zelfde meting met kortere synthetische venstertijd → geldigheidsintervallen en dekkingsrapportage bewegen mee.
> - P6-lint: een test die `engine2/`-metriekcode scant op numerieke frequentie-literals buiten een expliciete whitelist (eenheidsconversies, fysische constanten zoals c=343).
> - Toggle-regressie zoals onder Deliverable 1.
>
> **Buiten scope — niet aanraken:** elke koppeling met de optimizer, gewichten/aggregatie, doelcurve-object, catalogus-schema, topologievoorstellen, wijzigingen aan de bestaande engine. N-weg-agnostisch bouwen: nergens een aanname van drie wegen.
>
> **Werkafspraken.** Volledige gevalideerde bestanden, geen losse blokken; benoemde constanten bovenaan met commentaar; typecheck vóór elke oplevering; rapporteer per deliverable kort resultaat + testuitslag voordat je doorgaat naar de volgende.
