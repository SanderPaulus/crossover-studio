# Roadmap — SD Acoustics Crossover Studio

Voertaal: Nederlands (zoals alle projectdocumentatie voor Sander & Stefan).
Volgorde binnen een blok = aanbevolen prioriteit. Inschattingen zijn grof:
**S** = uurtje(s), **M** = dagdeel–dag, **L** = meerdere dagen/gefaseerd.

## Onlangs afgerond (jul 2026, ter referentie)

- **Single-driver mode**: één FRD+ZMA volstaat — sim draait op de solo-tak,
  twee-driver-UI verbergt/blokkeert zichzelf. Voor de FRS8-validatiemeting
  (VALIDATIE.md) én de eerste trede richting fase 4 (N-weg)
- **Solo-optimizers** (soloOptimizer.ts + netOptimizer `solo`): "Optimize —
  flatten driver" ontwerpt cut-only EQ/shelves en bouwt de échte
  breedbander-topologie (serie-LCR-traps, shelf-groepen, gated Zobel);
  ⚙ Optimize components tuned solo op pure vlakheid. Architectuur:
  gedeelde kern + eigen structuur-zoeker per topologie — de mal voor 3-weg
- Versleepbare paneelscheiding (grafieken ↔ invoer, dubbelklik = auto)
- **Response flatness**-score (hele-bereik, mediaan-referentie, geijkt op
  ontwerpersoordeel) + integration naar de achtergrond
- Crossover-scan-ranking oordeelt op hele-bereik-avg (piek = targets-garantie);
  avg-kolom in de scan-tabel
- Stappenkaart-overlay voor ⚙ Optimize components (à la de scan)
- Per-driver-totaalfases in de fase-chart (Stefans samenvallen-bij-0°-check),
  legend-defaults: totals aan, filterfases uit
- Impedantie-**fase**-chart + belastingskarakter op Z-min (capacitief/inductief)
- Voor/na-tabel ("N value changes") na elke tune-run
- **Bouwtolerantie-band** ±2/5/10% met worst-case/RSS en gevoeligheidsranking
- Setup-tab: vxp-variantsectie verborgen zonder varianten
- **LIMP .lim-import** (aug 2026): ARTA's binaire impedantieformaat direct
  inladen — formaat reverse-engineered en gevalideerd met fysica (woofer ∥
  tweeter parallel-meting klopt op ~0,1 Ω met de berekende combinatie).
  Conversie naar ZMA-tekst op de importgrens, dus persistentie en
  VituixCAD-export werken ongewijzigd; de omweg via VituixCAD is weg
- **Import-sanity op inhoud** (aug 2026): niveauprofiel-check bij het laden —
  een impedantiebestand dat als responsie binnenkomt (of andersom) krijgt een
  luide waarschuwing i.p.v. stil ohms-in-de-dB-kolom. Signaleren, niet
  omschakelen; getest op de KOAN-fixtures beide kanten op
- **Model-vs-meting-overlay** (aug 2026, `verification.ts`): de VALIDATIE.md-lus
  als feature — gemeten FRD van de gebouwde build over de gesimuleerde Combined,
  niveau-uitgelijnd (offset zichtbaar), Δ-cijfers (avg/P95/worst @ f) in de
  SPL-strip; fase: mic-delay weggefit, residu-curve in de fase-chart,
  polariteit-flag bij offset ~180°. Alles op het ZICHTBARE bereik, dus overlay
  en strip oordelen over dezelfde band. Persistent in project + autosave.
  Plus **🔬 Compare wizard** (Import-tab): dezelfde lus als begeleide
  checklist — vier stappen die live app-state lezen, meting laden kan ín de
  wizard, verdict met de cijfers als slotstap

## Kort — kleine, afgebakende verbeteringen

1. **Vergelijkingstabel ontwerp-tabs** (S/M) — één tabel over alle opgeslagen
   tabs: Response-score, fase-avg/P95, Z-min, componenten-aantal, BOM-totaal.
   De ghost-curves tonen vorm; kiezen doe je op cijfers. Zelfde patroon als de
   scan-tabel.
2. **Legend-opruiming** (S) — de tab-ghosts per chart onder één "Other
   tabs"-groepstoggle in plaats van losse chips per tab; de fase-legend heeft
   er nu negen.
3. **Legend-keuzes onthouden** (S) — aan/uit-klikken op curves overleeft nu
   geen reload (alleen de defaults). Past bij de alles-persistent-doctrine.
4. **Undo voor de Filters-tab** (M) — de schematic-editor heeft undo/redo, de
   virtuele filters niet; een misklik op een chart-handle is onherstelbaar.
5. **EPDR-curve** in het Impedance-paneel (S/M) — |Z| en fase gecombineerd tot
   "equivalent peak dissipation resistance": zo zwaar voelt de belasting écht.
   Verfijning van de nieuwe fase-chart.

## Middel — meer werk, duidelijke winst

6. **Ontwerp-rapport exporteren** (M) — zelfstandige HTML met schema, BOM
   (met prijzen), SPL/fase/impedantie-curves en de scores. Deelbaar met
   Stefan, bouwdocumentatie bij de speaker.
7. **Fs-vloer in de vfOptimizer-bounds** (S/M) — de automatische ≥2×Fs-vloer
   geldt nu voor de HP-knie in de keten; ook als bound in de vrije
   vf-verkenning meenemen (xoRange dekt het handmatig al af).
8. **Catalogus-onderhoud** (doorlopend) — nieuwe Gemini/SKU-updates blijven
   importeerbaar; prijzen periodiek herijken op echte NL/EU-ankers (zie de
   prijsverificatie-ronde in CLAUDE.md).

## Groot — de fases

9. **Fase 4: 3-weg / N-weg** (L) — het netlist-fundament is N-weg-klaar en de
   template-kiezer heeft de (disabled) 3-weg-optie al.
   **Trede 1 KLAAR (aug 2026): de som-kern is N-weg** — `combineN` in dsp.ts,
   per-tak adjust, `combine` als dunne wrapper erover; K=2 bit-identiek
   bewezen tegen een bevroren kopie van het oude algoritme én via de volle
   suite (381 tests) door de nieuwe kern, looptijd ongewijzigd.
   **Trede 2a KLAAR: slot-laag N-weg** — `pickSlotsN`/`isMidModel` in
   driverSlots.ts: 2 drivers = exact het oude gedrag (KOANs lage driver héét
   "mid" en blijft de LAGE tak — gepind in een test), 3 drivers = tweeter en
   mid op naam, en bij niet te scheiden namen WEIGERT de mapping met een
   melding i.p.v. te raden (een mid die als woofer meetelt is precies de
   stille fout waar deze codebase tegen bestaat).
   **Trede 2b KLAAR (aug 2026): de sleutel-knoop opgelost + mid-slot door de
   App.** De knoop was namespace-vervuiling: 'mid' was tegelijk MODEL-naam
   (van de gebruiker/het bestand — KOANs lage driver héét mid) en
   OPSLAG-sleutel (van ons, 2-weg-historie). Oplossing: **opslag spreekt
   ROLLEN** (`BranchRole` low/mid/high; zStandalone + projectformaat v2
   `zByRole`), **netlijsten houden vrije model-namen**, en de brug is
   `pickSlotsN` (`canonicalModelForRole` = dé ene plek waar "de lage tak
   heet historisch 'mid'" leeft; `withSlotAliasesN` = de alias-laag, 2-weg
   test-gepind identiek). v1-bestanden migreren bij LEZEN ('mid'→low,
   'tweeter'→high — nooit een vxp's model-namen-record); niets wordt ooit
   herschreven. App: derde import-slot (Midrange), sim via combineN zodra
   álle drie responsies geladen zijn (anders luide banner + mid buiten de
   sleutelruimte — géén stille verschuiving onder een lopend 2-weg-ontwerp),
   mid-filterkaart (hp+lp = bandpass), mid-adjust, amber `--viz-mid`-curves,
   fase-chart met de twee AANGRENZENDE paren, SPL-handles op de mid.
   Optimizers/synthese/vxp-export/integratie-score zijn in 3-weg GEGATE met
   uitleg (paar-eigenschappen — trede 4); 2-weg/solo-paden bit-onaangeroerd
   (volle suite + browser-check op Sanders v1-autosave).
   **Trede 4a KLAAR (aug 2026): de componenttuner is twee-paar.** `netOptimizer`
   kreeg `opts.midBranch`: tak-transfers via pickSlotsN, som via combineN,
   paar-lijst [(low,mid),(mid,high)], fase per paar gemiddeld, álle beslispunten
   paar-bewust (xo-penalty per paar, safety-gate op beide kruisingen, textbook-
   anker = meetkundig gemiddelde). 2-weg byte-onaangeroerd (midBranch undefined;
   volle suite 402 = bewijs). ⚙ Optimize components werkt dus in 3-weg.
   GEMETEN op Robberts set: de amp-vloer-gate vuurt eerlijk (generieke seeds
   dippen daar zelf al ~2 Ω — drie parallelle takken rond de lage overname) en
   de 640 Hz-gridvloer knelt. Volgende stappen trede 4: per-tak-banden (tak
   buiten eigen meetbereik = stil), pairwise timing-check, en de twee-paar-
   designChain + 2D-crossover-scan.
   **Trede 3 KLAAR (aug 2026): de bandpass-tak.** De synthese kón het al —
   `deriveTopology` cascadeert de HP-ladder in de LP-ladder zodra beide knieën
   enabled zijn; nu bewezen op de gemeten KOAN-mid (regressietest; ~2 dB rms
   is daar eerlijk: de Z-piek op 388 Hz ligt ín de 600 Hz-overgang, de Fs-trap
   is tuner-werk). 3-weg-TEMPLATES staan aan (1e–4e orde, LP / bandpass / HP
   op neutrale 600/3000 Hz-referenties, mid = 2×orde onderdelen; modellen via
   pickSlotsN geresolved — zModels-laadvolgorde is niet te vertrouwen) en
   **"Build passive filter" werkt in 3-weg**: drie tak-fits landen als één
   netwerk in een Passive build-tab, met een eerlijke note dat de assembled
   tune (paar-oordeel) nog volgt. Wizard/help-teksten mee.
   Daarna: (4) optimizers met twee paren + 2D-crossover-scan — dé grote
   trede: pairMetrics-lus in netOptimizer, twee-paar-designChain, solo/duo
   regressie bit-identiek; (5) vxp-brug/help; directivity/tolerantie/
   tab-ghosts in 3-weg liften mee op trede 4.
10. **Driverbibliotheek** (L) — meetbundels (FRD + hoeken + ZMA) per driver,
    herbruikbaar over projecten; het einde van losse-bestanden-slepen.
    Uitbreiding daarbovenop: **ontwerpgeheugen als seed-bibliotheek** —
    afgeronde ontwerpen bewaren mét driver-kenmerken (Fs, Z-profiel,
    kruisingsgebied) en bij een nieuw ontwerp het meest gelijkende als éxtra
    startpunt meegeven naast de textbook-seed. Retrieval, geen training:
    deterministisch en uitlegbaar — zelfde patroon als de multi-start-tuner
    (seeding verkent bekkens zonder het zoekpad te verstoren, de anker-les).
11. **Serie-crossover-topologie** (L) — eigen build-pad + vergelijkingsharnas
    naast de parallelle synthese (bewust uitgesteld tot dat harnas er is).
12. **Genormaliseerde hoekcurves & verticale metingen** (M, wacht op data) —
    zodra Sander verticaal meet: lobing-analyse naast de horizontale
    directivity.
13. **Meetmodule in de app** (L) — sweep + deconvolutie kan met Web Audio, en
    fft.ts/timeDomain.ts doen de wiskunde al. Twee harde voorwaarden vóórdat
    dit iets waard is:
    (a) **Gekalibreerde meetmicrofoon mét cal-bestand.** Geverifieerd op de
    MM-1-bestanden (JustOct `.mic`): `parseFrd` leest ze ongewijzigd — 134
    punten, 10 Hz–21 kHz, 0 dB op 1 kHz, header netjes bij de comments. Maar:
    de **fasekolom is leeg** (mic-fase blijft dus een minimum-fase-aanname),
    het bestand is **Latin-1** en niet UTF-8, en 0° vs 90° scheelt tot **6 dB
    in de topoctaaf** — de app moet vragen onder welke hoek is gemeten, niet
    zelf kiezen. Zelfde stille-fout-familie als de import-sanity-check.
    (b) **Eén klokdomein met loopback-kanaal.** Browserlatency is niet
    deterministisch; zonder gedeeld tijdnul is het inter-driver-tijdverschil —
    het kernidee van deze tool, 47 µs ≈ 16 mm — verzonnen. Een USB-meetmic is
    daarmee de verkeerde route (eigen klok, geen elektrische loopback); XLR in
    een 2-in/2-uit-interface wel.
    Realistische eerste stap is niet REW namaken maar de VALIDATIE.md-lus
    sluiten: een verificatie-sweep die de meting als extra curve over de
    simulatie van de actieve tab legt. Relatieve respons volstaat daarvoor —
    absolute dB heb je niet nodig om te zien of het model klopt. Impedantie
    meten vraagt een sense-resistor-jig: hardware, geen software.
14. **ARTA .pir-import met gating-UI** (M/L, future — wacht op voorbeeldpaar)
    — de ruwe impulsrespons vóór ARTA's gate/FFT-stap; feitelijk de
    ANALYSE-helft van de meetmodule (punt 13), los te bouwen. Geen tweede
    .lim: een .pir → FRD vraagt een GATE-keuze (venster vóór de eerste
    reflectie) die Robbert nu bewust in ARTA maakt — automatisch gaten met
    een vaste waarde bakt stil een meetkeuze in (zelfde stille-fout-familie
    als de import-sanity-check). Dus: parser (S) + gate+FFT→FRD op fft.ts (M) + gating-UI met
    sleepbaar venster en zichtbare reflecties (M, het meeste werk). Harde
    invariant: de gate mag de TIJDAS NIET HERNULLEN — per bestand een eigen
    t=0 gooit het inter-driver-tijdverschil weg (Robberts set: Δ105 µs ≈
    36 mm, gemeten, verdict plausible) en dat is het fundament van de tool;
    regressietest verplicht. Winst = export-klikken besparen (2 drivers ×
    8 hoeken), geen blokkade: de FRD-route draagt fase én timing al. Bouwen
    zodra er een validatiepaar ligt (één .pir + de FRD die ARTA daaruit
    exporteerde — zelfde bewijs-aanpak als de .lim-import) of zodra de
    meetmodule (punt 13) actueel wordt.

## Bewust niet

- Onboarding-tour / grote restyling — de app is voor twee ontwerpers, de
  dichtheid is een feature, ❓ Help dekt de uitleg.
- GPU-versnelling van de optimizers — gemeten: workers waren de winst,
  WebGPU past slecht bij sequentiële simplex-stappen (zie CLAUDE.md).
- Kosten of "realisme" als extra term in zoek-objectives — de anker-les:
  alleen op schone beslispunten (ranking, snap), nooit in de zoektocht.
- Lerende/AI-gestuurde optimizer ("steeds gerichter zoeken") — drie gemeten
  argumenten (aug 2026): (1) de dataset is twee ontwerpers en een handvol
  driver-sets groot, daar generaliseert niets van; (2) een geleerd model is
  een PROXY voor de eindmeting, en zelfs de fysisch onderbouwde vf-proxy
  voorspelde de eindranking niet (xo 1900 vf-slechtst → assembled-best; de
  remedie was scannen op de eindmeting, ~3× winst) — een zwakkere proxy
  terugbrengen is die les terugdraaien; (3) er valt niets te besparen:
  ~380k sims in <4 min met volledige dekking van de zoekruimte. Wat WEL mag
  leren: de seeds (ontwerpgeheugen, zie punt 10) en het model (kalibratie
  uit de meet-lus) — retrieval en calibratie, deterministisch, geen training.
