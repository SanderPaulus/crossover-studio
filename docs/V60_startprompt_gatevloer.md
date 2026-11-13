# Startprompt V60: ARTA's venster als lengte, de gate-vloer van 397 naar 199 Hz

*Eigen Claude Code-sessie, met stoppunten voor Sander. Herkomst: I-4 fase 2 (13-11-2026), branch
`i4-nf-merge-v2`, nota V60. Deze sessie raakt engine2-ingest, golden refs en bruggen. I-4 raakt die niet.*

---

> **Rol.** Je repareert één leesfout in engine2 en draagt de gevolgen door tot in de referenties. Je herdefinieert
> niets. Elke referentie die beweegt, krijgt een brug in de V15-vorm: wat er stond, wat er staat en waarom.
>
> **Eerst lezen.**
> - `CLAUDE.md`: P6, schatter-versionering, golden refs, het tweelagenbeleid, en de entries M-1, P-1, UI-1 en I-2.
> - Nota: V60 (en V55, V56), vóór "Casus S1".
> - `src/lib/nfMergeV2.ts`: `gateFromArtaHeader` en de vensterstaart-check (`GATE_TAIL_FLAG_DB`). Dit is de eerste
>   lezer die de kop goed leest.
> - `src/lib/nfMergeV2.test.ts`: de describes V60 (a), (b) en (c).
>
> **Werkafspraken (ongewijzigd).** Nederlands. Inventaris vóór wijziging. Golden refs zijn de autoriteit.
> `npx tsc -b` vóór elke oplevering; `npm run test:fast` tijdens het werk; de volle run vóór de commit die
> referenties verplaatst. Geen meetbestand overschrijven.
>
> ---
>
> ### Wat er gemeten is (I-4, 13-11-2026)
>
> ARTA schrijft `Left window = 0 ms`, `Reference time = 2,5 ms` en `Right window = 5,021 ms, Tukey 0.25`. Left en
> Right zijn **lengtes vanaf de referentietijd**, geen posities op het record. Twee onafhankelijke metingen op casus 1
> (augustus):
>
> 1. FRD ÷ FFT(venster × ruwe PIR) is alleen vlak en per driver gelijk met de rechterrand op ref + 5,021 ms
>    (0,0019 dB / 0,000° tussen buren). Met ref + 2,521 ms is het quotiënt ruw (0,022 dB / 0,21°).
> 2. Het fasenulpunt van de nabijveld-FRD's ligt precies op hun eigen `Reference time`.
>
> Daaruit volgt T = 5,021 ms en 1/T = **199,2 Hz**. engine2 rekent T = `Right window − Reference time` = 2,521 ms en
> 1/T = **396,7 Hz** (`src/lib/engine2/ingest/manifest.ts`, r. 301, 347 en 395). De v1-lezer (`xoWindow.ts`) las 5,021
> als gate-lengte en had gelijk: 199 Hz, 2/T getaperd 455 Hz. Dat engine2 te streng was, ligt aan de veilige kant,
> maar het getal is fout.
>
> ---
>
> ### Fase 0: inventaris (geen wijziging)
>
> 1. **Lezers.** Iedereen die `rightWindowMs` en `referenceTimeMs` verrekent: `manifest.ts`, `validity.ts`
>    (`validity-header`), `appAdapter.ts`, `v2Measurement.ts`, `demoBundle.ts`, `App.tsx`, `project.ts`. Noteer per
>    lezer of hij een lengte of een verschil neemt.
> 2. **Schrijvers.**
>    - `nfMerge.ts` (`Merge FF window = reference …, right …` in het merge-blok).
>    - `scripts/annotate-casus1-merge.ts`, `merge-casus1-mid*.ts`, `record-casus1-*-set.ts` (manifestblokken).
>    - **Casus 2**: `scripts/casus2-model.ts` schrijft `Reference time = 3,0 ms` en `Right window = 7,0 ms` met de
>      bedoeling T = 4,0 ms. Schrijver en lezer volgen dus allebei de verkeerde conventie, en de grondwaarheid
>      "1/T = 250 Hz" hangt daaraan. Beslis met Sander: de koppen opnieuw genereren (`Right window = 4,0 ms`, de
>      fixturebytes bewegen) of de grondwaarheid herleiden (1/T = 143 Hz).
> 3. **Referenties die op 396,7 Hz rusten.**
>    - `FF_vloer_header` per driver in `golden_refs_casus1.json` en `golden_refs_casus1b.json`.
>    - De bruggen `_gepoort_tot_M1` en de set `'gated'`.
>    - Het W-M-venster van vóór M-1 (397–549 Hz).
>    - De gezamenlijke rapportband (de tweeter is in de huidige set nog gegate: 396,7 wordt 199,2).
>    - Fasetoelating grond (a) (`v44_fasematen`: punten "onder de meetgeldigheidsvloer").
>    - De verankerde gaps (wegbanden).
>    - De demobundels (de drieweg draagt de gegate tweeter).
>    - De gedateerde tabellen in `test-fixtures/` die 396,7 noemen (records, niet herleiden).
> 4. **Tests** die 396,7, 2,521 of `rightWindowMs − referenceTimeMs` pinnen: `goldenCasus1`, `goldenCasus2`,
>    `goldenClassification`, `mergeBlock`, `xoWindow`, `casus1Field`, `floorComparison`, `xoRangeAdvice`,
>    `borderFacts`, `judgedBand`, `windowGhost`, `nfMerge`. Bepaal per test of hij een meting of een gedateerd
>    record pint.
> 5. **Zoektocht.** Bepaal of de vloer op de huidige meetset (`'m3'`) een zoekinvoer bereikt: de oordeelband van
>    de v2-route begint op f_p van de laagste weg. Meet dit; neem het niet aan. Bepaal ook of een regeneratie nodig
>    is, of alleen herleiding van rapportreferenties.
>
> **Stop (B-1).** De inventaris, wat beweegt en wat niet, en het voorstel voor casus 2.
>
> ### Fase 1: de lezer
>
> - `manifest.ts`: T = `Right window` (lengte vanaf de referentie). De referentietijd blijft gelezen, voor de fase en
>   de uitlijning, maar wordt niet meer afgetrokken.
> - Versiebump van `validity-header` (A5e.5: de cache vervalt). Draag de nieuwe versie door in
>   `ESTIMATOR_VERSIONS` als die hem noemt.
> - Eén test met de casus-1-kop: 199,2 Hz, de oude lezing als brug ernaast. Als tegenproef het quotiënt uit de
>   I-4-meting, of `nfMergeV2`'s (a)-claim.
>
> ### Fase 2: referenties en bruggen
>
> - Herleid elke referentie uit de inventaris met `_waarden_V60` (wat er stond, met de oude lezing reproduceerbaar).
> - Volg de recorder-volgorde (C-2-regel). Bruggen worden doorgedragen (`carryDatedKeys`, M-4); niets wordt stil
>   overschreven.
> - Casus 2 volgens het besluit van B-1.
>
> **Stop (B-2).** Oud tegen nieuw per referentie, en of er een regeneratie nodig is.
>
> ### Fase 3: acceptatie
>
> - `npx tsc -b`, `npm run test:fast`, de volle run. De vier live ketenruns moeten byte-identiek blijven, tenzij B-2
>   een regeneratie besloot.
> - CLAUDE.md: een entry met de getallen, en de UI-1-zin "T = rechter venster − referentietijd" rechtgezet.
>
> **Buiten scope.** I-4 (de merge zelf), meetbestanden wijzigen, de gate van de meting verlengen, en een regeneratie
> zonder besluit van Sander.
