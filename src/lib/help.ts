/**
 * In-app manual: content + search. Pure data/logic so it stays unit-testable;
 * rendering lives in components/HelpPanel.tsx.
 *
 * Content is written in Dutch (the working language of this tool's two users)
 * but keeps UI labels in English, exactly as they appear in the app, so the
 * reader can find the buttons being described. Inline markup: **bold** and
 * `code` — nothing else, the renderer is deliberately tiny.
 */

export type HelpBlock =
  | { t: 'p'; text: string }
  | { t: 'h'; text: string }
  | { t: 'ul'; items: string[] }
  | { t: 'steps'; items: string[] };

export interface HelpSection {
  id: string;
  /** Short title, shown in the table of contents (may carry an emoji). */
  title: string;
  /** Extra search terms (Dutch + English synonyms not present in the text). */
  keywords: string[];
  blocks: HelpBlock[];
}

export const HELP_SECTIONS: HelpSection[] = [
  {
    id: 'start',
    title: '🚀 Snelstart',
    keywords: ['workflow', 'beginnen', 'quick start', 'stappenplan', 'demo'],
    blocks: [
      {
        t: 'p',
        text:
          'De kern van deze tool: ontwerpen op de **gemeten fase** — inclusief het echte ' +
          'tijdverschil tussen de drivers — waar andere tools (VituixCAD) de fase reconstrueren. ' +
          'De normale route van meting naar filter:',
      },
      {
        t: 'steps',
        items: [
          '**Import**: laad per driver de FRD-bestanden (0° + alle hoeken) en de .ZMA in één keer via multi-select.',
          'Controleer de **Timing**-chip in de topbar. `plausible` = de metingen delen een tijdreferentie en de gemeten fase is bruikbaar; de fase-conventie springt dan automatisch op Measured.',
          'Ga naar **Filters** en klik **🧙 Wizard** (begeleid) of direct **Optimize — design for me**. Met gemeten impedanties draait dat de hele keten: virtuele filters → passieve synthese → componenttuning, per crossover-kandidaat.',
          'Het winnende ontwerp landt in de **Working**-tab op het Network-paneel, compleet gebouwd en getuned. De scan-tabel eronder is een keuzelijst: klik een rij om een andere kandidaat te laden.',
          'Bewaar met **Save as new** (eigen tab-naam) en exporteer met **Export .vxp** — inclusief meetbestanden — om in VituixCAD te verifiëren.',
        ],
      },
      {
        t: 'p',
        text:
          'Geen eigen metingen bij de hand? **Load KOAN demo data** (Import-tab) laadt een complete echte meetset incl. hoeken.',
      },
    ],
  },
  {
    id: 'import',
    title: '📥 Import-tab',
    keywords: ['frd', 'zma', 'vxp', 'bestanden', 'metingen', 'laden', 'project', 'notities', 'inventaris'],
    blocks: [
      {
        t: 'ul',
        items: [
          '**FRD + ZMA per driver**: selecteer het 0°-bestand, alle horizontale hoek-bestanden én de .ZMA in één file-dialoog; hoeken worden herkend aan de bestandsnaam. De .ZMA mag dus gewoon mee in dezelfde selectie — een VituixCAD-project is nergens voor nodig.',
          '**VituixCAD-project (.vxp)** is volledig optioneel: gebruik het alleen om bestaande crossover-varianten (bv. van Stefan) te importeren. Elke variant wordt kiesbaar op de Setup-tab en kan als eigen ontwerp-tab geopend worden.',
          '**Imported files**: de inventaris toont per driver wat er geladen is; elk bestand kan een vrije notitie krijgen ("meting 50 cm, raam open"). Notities gaan mee in de autosave en het projectbestand.',
          '**Save/Load project** bewaart álles — ruwe meetbestanden, filters, netwerk-tabs, instellingen — in één JSON. Daarnaast draait er continu een autosave (localStorage) die nooit bestaande data overschrijft met een lege sessie.',
          '**Catalog import/export** staat hier ook: laad de componenten-catalogus (JSON met echte SKU’s en prijzen) vóór je de optimizer draait, dan rekent de BOM met echte prijzen.',
        ],
      },
    ],
  },
  {
    id: 'setup',
    title: '🎚 Setup-tab & timing',
    keywords: [
      'fase-conventie', 'measured', 'minimum phase', 'offset', 'view range', 'tijdreferentie',
      'timing sanity', 'verdict', 'tweeter adjustment', 'variant',
    ],
    blocks: [
      {
        t: 'ul',
        items: [
          '**View range** = de evaluatieband: de optimizer beoordeelt binnen dit bereik. Velden bevriezen de simulatie tijdens het typen en committen op Enter/blur. Een zoom in de SPL-chart kun je met **use as view range** tot bereik promoveren.',
          '**Phase convention — Measured is de default en de waarheid**, mits de timing-check groen is. De gemeten fase bevat het échte tijdverschil tussen de drivers; daarop ontwerpen is het bestaansrecht van deze tool.',
          '**Minimum** is er alleen voor VituixCAD-vergelijking en diagnose: de fase wordt dan per driver gereconstrueerd en het tijdverschil moet handmatig via de offset terug. Bij het wisselen wordt de offset automatisch ingevuld (measured → 0; minimum → de gemeten Δmm).',
          'In measured-modus met offset ≠ 0 verschijnt een waarschuwing: het tijdverschil zit dan **dubbel** in de som (één keer in de gemeten fase, één keer als offset).',
          '**Timing sanity** (het paneel onderaan) fit de bulk delay per driver uit de unwrapped fase en velt een verdict over de gedeelde tijdreferentie. Dit is de belangrijkste stille-fout-detector van de hele keten: een verkeerde timing-aanname zie je nergens anders.',
          '**Tweeter adjustment**: niveau en polariteit van de tweeter, plus de keuze van de actieve vxp-variant als er een project geladen is.',
        ],
      },
    ],
  },
  {
    id: 'filters',
    title: '🎛 Filters-tab & optimizer',
    keywords: [
      'virtuele filters', 'hp', 'lp', 'eq', 'optimize', 'design for me', 'staged', 'targets',
      'priority', 'crossover point', 'acoustic slopes', 'scan', 'build passive', 'bypass', 'cut-only',
    ],
    blocks: [
      {
        t: 'p',
        text:
          'Virtuele filters zijn het **doelontwerp**: HP/LP (Butterworth, Linkwitz-Riley, Bessel, orde 1–4) ' +
          'plus EQ-banden per driver. De passieve synthese bouwt daar vervolgens een echt netwerk van. ' +
          'Omdat passief niet kan versterken zijn EQ-banden **alleen cut** (≤ 0 dB): een piek wegdrukken kan, ' +
          'een dip opvullen niet — dat is fysica, geen beperking van de tool.',
      },
      { t: 'h', text: 'Optimize — design for me' },
      {
        t: 'ul',
        items: [
          'Met gemeten impedanties draait de knop een **full-chain scan**: per crossover-kandidaat de hele keten (virtuele rondes → synthese → componenttuning op het samengestelde netwerk) en de eindresultaten concurreren. De tussenstand-ranking zegt niets — alleen de eindmeting telt.',
          'De **scan-tabel** is een keuzelijst: 🏆 markeert de ranking-winnaar, klik op een rij laadt dát complete ontwerp in Working (undo-baar), kolomkoppen sorteren.',
          'Zonder crossover-pin draait eerst één vrije keten; alleen als die de targets mist volgen redding-kandidaten rond de gevonden kruising.',
          'Bij (bijna) gelijke kwaliteit wint de **goedkoopste BOM** — kosten sturen op beslispunten, nooit in de zoektocht zelf.',
          'De optimizer draait in een web worker: de UI blijft bedienbaar en **Cancel** breekt af zonder het ontwerp te raken.',
          'Hoe de optimizer intern beslist — zijn vuistregels en vangnetten — staat in de eigen sectie **🤖 Onder de motorkap**.',
        ],
      },
      { t: 'h', text: '⚙ Settings (ook via de wizard bereikbaar)' },
      {
        t: 'ul',
        items: [
          '**Priority** (flatness ↔ phase): de grote knop. Meer fase-prioriteit koopt vlakke fase met amplitude-rimpel en andersom; de uitersten zijn intern begrensd zodat 100% fase de respons niet sloopt.',
          '**Staged + targets** (rimpel in dB, fase in °): de trapmethode — eerst structuur, dan pas EQ-banden, en er wordt gestopt zodra de doelen gehaald zijn. Strakkere doelen = zwaardere netwerken; "toereikend" bepaal je zelf.',
          '**Crossover point** = frequentie ± marge: pint het **akoestische** kruispunt (waar de gefilterde drivers elkaar echt kruisen — niet de elektrische knieën). Marge 0 = precies daar. Het aantal scan-stappen (3/5/7/9) verdeelt de range in aansluitende slices.',
          '**Acoustic slope mid/tweeter**: doel-helling van de gemeten akoestische flank naast de kruising (dB/oct) — dé "akoestisch 4e orde bij de tweeter"-knop. Controleer het resultaat in de 🎯 Targets-popup.',
          '**HP floor**: automatische ondergrens voor de tweeter-HP-knie op 2× de Fs uit de gemeten impedantie.',
          '**Breakup-guard**: stopband-lekkage naast de kruising moet ≥ 20 dB onder de som — resonantie-fase is niet te filteren, alleen in niveau irrelevant te maken.',
          '**Catalog snap**: de fit eindigt op echte catalogus-onderdelen (incl. hun DCR/ESR) in plaats van vrije waardes.',
        ],
      },
      { t: 'h', text: 'Handmatig bouwen' },
      {
        t: 'ul',
        items: [
          '**Build passive filter** synthetiseert het huidige virtuele ontwerp naar een netwerk in een nieuwe "Passive build N"-tab; alleen de Optimize-flow overschrijft Working.',
          'De synthese-modus-dropdown kiest het fit-doel: **acoustic** (gemeten respons × filter tegen de ideale akoestische som — meestal wat je wilt) of **filter curve** (alleen de elektrische overdracht).',
          '**Bypass** haalt de virtuele filters uit de simulatie zonder ze te wissen — gaat automatisch aan na een handmatige build (anders filter je dubbel) en uit na een optimizer-run (het resultaat moet zichtbaar zijn).',
        ],
      },
    ],
  },
  {
    id: 'optimizer',
    title: '🤖 Onder de motorkap: de optimizer',
    keywords: [
      'hoe werkt', 'vuistregels', 'vangnetten', 'safety', 'zobel', 'fs-trap', 'textbook',
      'deterministisch', 'seed', 'desnoeien', 'prune', 'escalatie', 'krimpladder', 'drift',
      'fundamentals', 'guard', 'kosten', 'ladder', 'trap', 'synthese', 'tuner',
      'impedantie', 'versterker', 'vloer', 'ohm',
    ],
    blocks: [
      {
        t: 'p',
        text:
          'De optimizer is **autonoom**: hij heeft de volledige gereedschapskist en jouw instellingen zijn ' +
          'startpunten en doelen, geen handboeien. Wat hij oplevert is altijd controleerbaar (🎯 Targets, ' +
          'scan-tabel, notes) en **deterministisch**: dezelfde metingen en instellingen geven exact hetzelfde ' +
          'ontwerp, elke keer.',
      },
      { t: 'h', text: 'De keten in vogelvlucht' },
      {
        t: 'steps',
        items: [
          '**Structuur**: enumeratie van klassieke alignments (LR2/LR4/BW3/Bessel × polariteit) als fundament. Een HP/LP-voorkeur uit ⚙ Settings is bindend — de ontwerper kiest het fundament, de optimizer tuned knieën, niveau en polariteit.',
          '**EQ-banden**: greedy, één band per keer, en elke band moet zich bewijzen (≥ 1% verbetering). Alleen cuts — passief kan niet boosten.',
          '**Passieve synthese per tak**: textbook-ladder als startpunt, dan een vorm-fit tegen de ideale akoestische som. Correcties (Zobel, Fs-trap, top-octave hold) komen er alleen in als de méting erom vraagt — niet standaard.',
          '**Componenttuner op het geheel**: takken worden los gesynthetiseerd, maar alleen de tuner op het samengestelde netwerk ziet hoe ze samenspelen. Dit is waar de grote winst valt.',
          '**Catalogus-snap als slotstuk**: vrije waardes worden echte SKU’s, doorgerekend met hun echte DCR/ESR.',
        ],
      },
      {
        t: 'p',
        text:
          'Met **Staged** aan werkt dit als trapmethode: escaleren stopt zodra de targets gehaald zijn ' +
          '(structuur alleen als dat kan, pas dan EQ-banden en extra componenten), en een desnoei-pass haalt ' +
          'daarna componenten weg die (bijna) gratis weg kunnen. Het trederapport onder de samenvatting toont ' +
          'per trede ripple en fase.',
      },
      { t: 'h', text: 'Vuistregels (altijd aan, geen smaakknoppen)' },
      {
        t: 'ul',
        items: [
          '**Rol-anker**: laddercomponenten blijven binnen ~×3 van hun textbook-waarde. Een "2e-orde" met een serie-cap van 100 µF is geen filter meer maar een draadje met extra stappen — de pool zit dan ergens anders.',
          '**Tweeter-bescherming**: ruim onder de kruising (≤ kruising/3) moet de aandrijving ≥ 15 dB gedempt zijn. De vorm-fit ziet dat gebied nauwelijks (weging ~0), dus zonder harde vloer blijft een resonantie-aandrijving onzichtbaar.',
          '**Serie-pad-plafond**: serie-caps ≤ 33 µF, serie-spoelen ≤ 8 mH. Grote elco’s zijn legitiem — maar alleen in shunts en traps, niet in het signaalpad.',
          '**Zobel en Fs-trap zijn gated op de meting**: een Zobel alleen bij echte impedantie-stijging door de LP-band (> ~1,3×), een Fs-trap alleen als de Z-piek dicht onder de HP-knie ligt. Klassieke vuistregels als kruisvalidatie, geen automatismen.',
          '**Knieën blijven vrij; het akoestische kruispunt wordt gepind.** Elektrische knieën kooien werkt niet: met een 5–10 dB hetere tweeter ligt de echte akoestische kruising ver onder de elektrische knie. De crossover-pin stuurt daarom op waar de gefilterde drivers elkaar écht kruisen.',
          '**Cap-krimpladder**: na de tune probeert elke vrije cap stap voor stap (E12) een maat kleiner, zolang de kwaliteit de lat blijft halen — "caps zo klein mogelijk" zonder er kwaliteit voor te betalen. Een cap die niet wil krimpen is dus écht nodig op die waarde.',
          '**Kosten sturen alleen op beslispunten**: bij (bijna) gelijke kwaliteit wint de goedkoopste realisatie — in de scan-ranking, de snap en bij gelijkspel tussen bekkens. Prijs zit nooit in de zoektocht zelf: dat verstoort het zoekpad en maakt het resultaat slechter (hard geleerd).',
        ],
      },
      { t: 'h', text: 'Vangnetten' },
      {
        t: 'ul',
        items: [
          '**Nooit slechter dan de start**: elk resultaat wordt tegen zijn startpunt gemeten; verliest het, dan blijft het startpunt staan.',
          '**Full-grid audit**: banden en beslissingen die alleen op het interne (gedecimeerde) rekengrid winnen moeten zich op het volle meetgrid bewijzen — anders gaan ze eruit. Dit is de overfitting-rem.',
          '**Dode-tak-detectie**: geen akoestische kruising, of een vallei óp de kruising, kost altijd zwaar. Nodig omdat drie andere beschermers (breakup-guard, tweeter-vloer, crossover-pin) allemaal kruising-gebaseerd zijn: zonder kruising zouden ze precies in de gedegenereerde stand alle drie uitvallen.',
          '**Full-band safety-gate**: de fundamentals worden bij acceptatie op het vólle meetgrid gecheckt, ook als de view range smal staat — een netwerk kan buiten beeld ontsporen (kruising weggedreven, tweeter open richting Fs). Gedegenereerd resultaat → startwaardes terug + de melding "widen the view range".',
          '**Doel-barrière + desnoei-rem** (Staged): een retune mag niet van een gehaald doel wegglijden (rimpel voorbij target inruilen voor fase waar niemand om vroeg), en desnoeien mag alleen (bijna) gratis — zonder die rem wandelt de kwaliteit af naar de doelgrens omdat alles "binnen doel" blijft.',
          '**Drift-catch**: de waarde-tune wordt ge-challenged vanaf een textbook-geseede variant, ook ná het tunen — de respons-objective is onderbepaald (meerdere waardesets geven dezelfde som) en zonder challenge drijven shunt-caps stilletjes het grote-cap-bekken in. Beste bekken wint; bij gelijkspel de goedkoopste.',
          '**Versterker-vloer (systeem-Z ≥ 2,5 Ω)**: de simulatie stuurt spanning, dus een impedantie-dip is onzichtbaar in elke responsmetriek — alleen de versterker voelt hem. Duikt het getunede resultaat onder de vloer, dan volgt een lokale reparatie-retune (alleen geaccepteerd als de respons in klasse blijft); lukt dat niet, dan meldt de note het en toont het Impedance-paneel de dip. De vloer ligt op 2,5 Ω (de klassieke 4Ω-versterker-tolerantie), niet op 3: een correct 2e-orde filter op een 4Ω-klasse driver dipt bij de knie van nature naar ~2,7 Ω. Bewust géén term in de zoek-objective: zelfs een minuscule bijdrage verlegt het deterministische zoekpad (gemeten: 6 dB slechter bekken).',
          '**Cancel is veilig**: de worker wordt hard afgebroken en het ontwerp blijft onaangeroerd.',
        ],
      },
      { t: 'h', text: 'Controleren wat hij deed' },
      {
        t: 'ul',
        items: [
          '**🎯 Targets** (Network-toolbar): het virtuele doelontwerp van de laatste build + de gemeten akoestische hellingen naast de kruising.',
          '**Scan-tabel**: alle crossover-kandidaten met ripple/fase/BOM — de eindmeting, niet de tussenstand. Klik een rij om dat ontwerp te laden.',
          '**Trederapport** (Staged): per trede het resultaat, zodat zichtbaar is wat elke escalatie opleverde.',
          '**Notes** onder het resultaat: snap-keuzes (incl. stapels en wat singles-only zou kosten), safety-afwijzingen en overgeslagen kandidaten.',
        ],
      },
    ],
  },
  {
    id: 'network',
    title: '🔧 Network-tab & editor',
    keywords: [
      'schematic', 'schema', 'editor', 'tabs', 'tidy', 'notch', 'lock', 'optimize components',
      'bom', 'save', 'templates', 'adsfilter', 'undo', 'redo', 'inspector',
    ],
    blocks: [
      {
        t: 'p',
        text:
          'Het schema **ís** het netwerk: verbindingen ontstaan door punt-op-punt-coïncidentie en elke wijziging ' +
          'wordt direct doorgerekend tegen de gemeten data. Slepen kan een circuit nooit breken — een versleept ' +
          'component laat automatisch draadjes achter naar zijn oude aansluitpunten.',
      },
      {
        t: 'ul',
        items: [
          '**Ontwerp-tabs**: elk netwerk leeft in een eigen tab. Dubbelklik = hernoemen, en andere tabs verschijnen als gestippelde ghost-curves in de SPL- en fase-chart, elk met een eigen tint.',
          '**Save / Save as new**: "Save as new" bewaart het actieve ontwerp als nieuwe tab en maakt die actief; **💾 Save** overschrijft de laatst-opgeslagen tab. De Working-tab is de kladblok van de Optimize-flow en wordt per run overschreven.',
          '**Inspector** (klik een component): waarde, DCR/ESR, polariteit, 🔒 lock (vergrendeld = de tuner blijft eraf) en catalogus-suggesties per merk/serie.',
          '**Tidy layout** hertekent het schema vanuit de netlijst: zelfde netwerk, nette kolommen, ketens gesorteerd op resonantiefrequentie. Exotische topologieën die niet betrouwbaar herlegd kunnen worden blijven onaangeroerd — mooi-maar-fout hertekenen is liegen.',
          '**➕ Add notch** plaatst een LCR-trap vóór de gekozen driver en ruimt daarna automatisch op met Tidy; één undo-stap voor beide samen.',
          '**⚙ Optimize components** her-fit alle niet-vergrendelde waardes tegen de gemeten som. Vangnet: nooit slechter eindigen dan de start. Draait na Optimize→Build ook automatisch — takken worden per stuk gesynthetiseerd, alleen de tuner ziet het samenspel.',
          '**🎯 Targets** toont het doelontwerp van de laatste build plus de gemeten akoestische hellingen naast de kruising (dB/oct ≈ akoestische orde) — elektrische componentvolgorde ≠ akoestische orde.',
          '**BOM** onder de editor: per component de catalogus-match met prijs, inclusief 2-delige stapels (10,37 µF = 4,7 + 5,6). "No exact catalog value" betekent meestal: catalogus (met prijzen) nog niet geïmporteerd.',
          '**New from template**: kaal startpunt om te knutselen — alleen drivers, of een generieke 1e–4e-orde-ladder (8 Ω / 2,5 kHz-referentie; de topologie is het punt, de waardes tune je zelf).',
          '**Export/Import filter (.adsfilter)** wisselt één ontwerp-tab uit als los bestand; **Undo/redo**: Cmd/Ctrl+Z en Cmd/Ctrl+Shift+Z (of Ctrl+Y).',
        ],
      },
    ],
  },
  {
    id: 'wizard',
    title: '🧙 Wizard, catalogus & componenten',
    keywords: [
      'wizard', 'catalog', 'catalogus', 'tier', 'premium', 'budget', 'positie', 'stapelen', 'stacks',
      'jantzen', 'mundorf', 'prijzen', 'snap', 'serie', 'merk', 'manage', 'beheer', 'sku',
    ],
    blocks: [
      {
        t: 'p',
        text:
          'De **🧙 Wizard** is de begeleide route: Goals (doelen + prioriteit) → Crossover (punt, hellingen, ' +
          'Fs-vloer) → Components (catalogus, kwaliteit, merken) → Summary + 🚀 Optimize. Het is dezelfde state ' +
          'als ⚙ Settings — geen aparte werelden.',
      },
      {
        t: 'ul',
        items: [
          '**Kwaliteitsprofiel**: Budget / Balanced / Premium, of **Positie** — de doctrine "serie-pad premium, shunt budget": componenten in het signaalpad (serie-C tweeter, serie-L woofer) verdienen kwaliteit, shunt- en notch-onderdelen mogen goedkoop.',
          '**Merk/serie per soort** (L/C/R) is bindend voor de snap, maar begrenst geen waardes: dekt de voorkeursserie een waarde niet, dan zakt de keuze door naar de volgende serie in plaats van een verkeerde waarde te forceren.',
          '**Stapelen**: een gevraagde waarde die niet als één onderdeel bestaat mag als 2-delige stapel (spoelen in serie, caps parallel) — maar alleen als het beste enkele onderdeel echt tekortschiet, en de note meldt wat singles-only zou kosten aan fit en euro’s.',
          '**Eigen catalogus**: exporteer de template (JSON), vul eigen merken/series/SKU’s met prijzen, en importeer terug. Een import met een bestaand serie-id overschrijft de ingebouwde versie — zo landen prijs-updates.',
          '**🗂 Manage… (catalogusbeheer)**: SKU’s toevoegen, bewerken en verwijderen zonder de app te verlaten — waardes (mH/µF/Ω), DCR/ESR, draaddikte, prijs en tier, met dezelfde validatie als de import. Wijzigingen blijven in het paneel tot je op **Save** drukt; daarna gebruiken snap, BOM en inspector ze meteen. Let op: de éérste exacte SKU van een merk+serie verbergt het gegenereerde waarderooster van die serie — voer dan de hele reeks in.',
          'De snap schrijft zijn keuze op het component, dus de BOM toont exact het gekozen SKU — ook bij vijfvoudig ambigue waardes als 10 µF.',
        ],
      },
    ],
  },
  {
    id: 'charts',
    title: '📈 Grafieken & interactie',
    keywords: [
      'zoom', 'pan', 'crosshair', 'handles', 'slepen', 'wheel', 'sonogram', 'directivity',
      'panelen', 'chips', 'sticky', 'legend', 'ghost', 'impedantie', 'impedance', 'belasting',
      'versterker', 'ohm',
    ],
    blocks: [
      {
        t: 'ul',
        items: [
          '**Zoomen/pannen**: scrollwiel = X-zoom om de cursor (Shift = Y-zoom), slepen = pan, dubbelklik of de reset-knop = terug. Zoomen is puur weergave; **use as view range** maakt er pas echt de evaluatieband van.',
          'De **crosshair** loopt synchroon over alle frequentie-charts — één frequentie aanwijzen, overal aflezen.',
          '**Filter-handles in de SPL-chart**: holle dot = HP/LP-knie (horizontaal slepen), volle dot = EQ-band (slepen = frequentie + gain, scrollwiel erop = Q). Alleen zichtbaar als de virtuele filters in de simulatie zitten (niet bij bypass).',
          '**Panel-chips** boven het analysepaneel schakelen Directivity, Sonogram, Filter transfer, Impedance, Phase en Time domain los aan/uit — uit is ook écht niet berekend, dat scheelt rekentijd. SPL en de integratiescore staan altijd aan.',
          '**System impedance** — de belasting die de versterker van het actieve passieve netwerk ziet (|Z| aan de ingang, zoals VituixCADs Impedance-chart). Alleen het **minimum** kan kwaad (stroom/warmte): de `Z min`-chip kleurt op de IEC-vuistregel ≥ 0,8× nominaal (groen ≥ 6,4 Ω, oranje ≥ 3,2 Ω). Een hóge impedantie — bv. boven de kruising, waar de serie-spoelen de ene tak blokkeren en de pad de andere optilt — is onschadelijk; alleen een versterker met hoge uitgangsimpedantie (buizen) hoort die curve terug in de frequentierespons.',
          '**📌** pint de SPL-chart vast (sticky) zodat hij meescrollt.',
          '**Legend-chips** togglen curves; ghost-curves van andere ontwerp-tabs zijn gestippeld en gedempt gekleurd per tab.',
          '**Sonogram**: discrete 3 dB-banden met −6 dB-beamwidth-contour; schaal genormaliseerd of absoluut.',
          'In de fase-chart staan naast de driver-fases ook de filter-fase per tak en de ruwe driver-Δφ (gestippeld); verticale markers tonen de integratie-bandbreedte en het overlap-centrum.',
        ],
      },
    ],
  },
  {
    id: 'scores',
    title: '🚦 Scores & status-chips',
    keywords: ['integration', 'score', 'fase p95', 'overlap', 'timing', 'flatness', 'kleuren', 'chips', 'verdict'],
    blocks: [
      {
        t: 'ul',
        items: [
          '**Timing** — het verdict van de gedeelde-tijdreferentie-check: `plausible` = de gemeten fase is bruikbaar als waarheid. Niet groen? Eerst uitzoeken waarom, vóór er ook maar iets ontworpen wordt.',
          '**Integration** (0–100) — optel-gezondheid, overlap-gewogen. Groen (≥ 90) is de nórmale toestand; hij zakt pas als de drivers elkaar actief tegenwerken. De klassegrenzen liggen op fysische ankers: 45° (vrijwel volledig optellen), 90° (nog ≥ 3 dB winst), 120° (drivers helpen elkaar niet meer).',
          '**Overlap** — de frequentie waar de driverniveaus elkaar kruisen: het échte akoestische overnamepunt van de huidige som.',
          '**Fase P95** — 95e-percentiel fasefout in het overlapgebied; ≤ 45° groen, ≤ 90° oranje. De fase-flatness-strip onder de charts toont daarnaast score/gemiddelde/P95 over het overlapgebied.',
          'De kleurladder in de fase-chart (15/45/90/120°) is strenger dan de score-ankers: groen betekent daar ≤ 15° — puur visueel, de score verandert er niet door.',
        ],
      },
    ],
  },
  {
    id: 'concepts',
    title: '🧠 Fase-concepten (measured, minimum, excess)',
    keywords: [
      'gemeten fase', 'minimum fase', 'excess delay', 'bulk delay', 'akoestisch centrum',
      'tijdverschil', 'looptijd', 'boost', 'passief', 'dcr',
    ],
    blocks: [
      {
        t: 'ul',
        items: [
          '**Gemeten fase** bevat de echte looptijd van elke driver naar de mic. Meet je beide drivers met dezelfde tijdreferentie, dan zit het onderlinge tijdverschil — hét ingrediënt voor een echt kloppende som — gratis in de data.',
          '**Minimum phase** is een reconstructie uit alleen de magnitude: alle timing is weg en moet er handmatig als offset weer in. VituixCAD werkt zo; deze tool alleen in de Minimum-vergelijkmodus.',
          '**Excess delay** = gemeten fase minus de minimum-fase-reconstructie, gefit als pure delay: de echte akoestische looptijd. Let op: de rauwe bulk-delay-fit is **niet** hetzelfde — die absorbeert de minimum-fase-helling van de driver zelf en kan zelfs het verkeerde teken geven (op de KOAN-set zegt de rauwe fit "tweeter 47 µs later", de excess-fit "tweeter ~50 µs eerder" — en dat laatste klopt met de fysieke diepte). Voor de VituixCAD-brug wordt daarom altijd de excess-Δ gebruikt.',
          '**Passief kan niet boosten**: een passief netwerk kan alleen verzwakken. Alle EQ is dus cut, en "de rest omhoog" bestaat niet — wel kan het totale niveau zakken (verzwakking van de luidste tak is gratis voor de vlakheid).',
          '**Spoel-DCR is echt**: een serie-spoel in het wooferpad kost niveau en demping. De catalogus rekent met echte draaddiktes; dunner draad = goedkoper maar meer weerstand.',
        ],
      },
    ],
  },
  {
    id: 'vituixcad',
    title: '🔁 VituixCAD-uitwisseling',
    keywords: [
      'vxp', 'export', 'import', 'variant', 'delay', 'brug', 'bridge', 'minimum phase',
      'amount of sources must be one', 'map', 'meetbestanden',
    ],
    blocks: [
      {
        t: 'ul',
        items: [
          '**Import**: een .vxp laadt alle crossover-varianten (kiesbaar op de Setup-tab) inclusief de getekende topologie. De tekening van een geïmporteerde variant wordt bewust niet herlegd.',
          '**Export .vxp** (Network-tab) schrijft alle ontwerp-tabs als varianten; de actieve tab wordt het startschema. In Chromium schrijft de knop een complete map: het .vxp-bestand mét alle response- en impedantiebestanden ernaast, zodat VituixCAD zonder "files not found" opent. Firefox/Safari krijgen alleen de .vxp-download plus een lijstje welke bestanden er handmatig naast moeten.',
          '**Timing-brug**: VituixCAD reconstrueert de fase zelf (minimum phase), dus de export geeft elke driver zijn excess-delay als ResponseDelay mee. Zo reproduceert VituixCAD onze gemeten som. Zet dat delay er **niet** ook nog handmatig in — dan telt het dubbel. Hetzelfde advies staat onder het timing-paneel voor wie de brug met de hand invult.',
          'Tabs zonder precies één bron (bv. een geïmporteerd kaal filter) worden bij export overgeslagen met een melding — VituixCAD weigert zulke varianten.',
          '**"Amount of sources must be one"** in VituixCAD betekent: een variant zonder werkende generator. De export vangt alle bekende oorzaken zelf af; zie je deze melding toch, dan is het bestand vrijwel zeker oud of naderhand bewerkt — exporteer opnieuw uit de huidige versie.',
        ],
      },
    ],
  },
  {
    id: 'shortcuts',
    title: '⌨️ Sneltoetsen & muis',
    keywords: ['toetsen', 'keyboard', 'muis', 'undo', 'redo', 'escape', 'wheel', 'shortcuts'],
    blocks: [
      {
        t: 'ul',
        items: [
          '**Cmd/Ctrl+Z** — undo in de netwerk-editor; **Cmd/Ctrl+Shift+Z** of **Ctrl+Y** — redo.',
          '**Esc** — sluit popups (deze handleiding, wizard); annuleert het hernoemen van een tab.',
          '**Scrollwiel** op een chart — X-zoom om de cursor; **Shift+wiel** — Y-zoom; **slepen** — pan; **dubbelklik** — reset.',
          '**Scrollwiel op een EQ-handle** — Q aanpassen; **slepen** — frequentie + gain.',
          '**Dubbelklik op een tab-naam** — hernoemen (Enter = bevestigen, Esc = annuleren).',
        ],
      },
    ],
  },
  {
    id: 'troubleshoot',
    title: '🩺 Problemen oplossen',
    keywords: [
      'fout', 'probleem', 'widen the view range', 'geen prijzen', 'autosave', 'cancel',
      'reset', 'kwijt', 'langzaam', 'safety',
    ],
    blocks: [
      {
        t: 'ul',
        items: [
          '**"widen the view range"** bij de componenttuner: de evaluatieband is zo smal dat het netwerk buiten beeld kon ontsporen; de veiligheidspoort heeft het resultaat afgewezen en de startwaardes teruggezet. Verbreed de view range en draai opnieuw.',
          '**BOM zonder prijzen / "no exact catalog value"**: importeer eerst de catalogus met echte SKU’s en prijzen (Import-tab) en draai daarna de snap of optimizer opnieuw.',
          '**Optimizer lijkt te hangen**: hij draait in een web worker, dus de UI blijft reageren en de voortgangsteller hoort te tikken. **Cancel** breekt hard af; het ontwerp blijft onaangeroerd.',
          '**Filter kwijt na een build?** Niets is weg: elke build en import opent een eigen tab, en de Filter bands-sectie klapt bij bypass alleen in (de samenvatting blijft in de kop staan). **Reset filters** naast Optimize wist wél echt — die vraagt erom.',
          '**Autosave**: de sessie wordt continu bewaard en een lege sessie overschrijft nooit een bestaande autosave. Voor echte zekerheid: **Save project** naar een bestand.',
          '**Timing-verdict niet groen**: controleer of beide drivers in dezelfde meetsessie met dezelfde tijdreferentie (loopback/acoustic reference) gemeten zijn. Zonder gedeelde referentie is de gemeten fase-som niet betrouwbaar — de Minimum-modus plus handmatige offset is dan het eerlijke alternatief.',
          '**VituixCAD-fouten bij openen van een export**: zie de sectie VituixCAD-uitwisseling.',
        ],
      },
    ],
  },
];

/** Flatten a section to plain lowercase text for searching (markup stripped). */
export function sectionText(s: HelpSection): string {
  const parts: string[] = [s.title, ...s.keywords];
  for (const b of s.blocks) {
    if (b.t === 'ul' || b.t === 'steps') parts.push(...b.items);
    else parts.push(b.text);
  }
  return parts.join(' ').replace(/\*\*|`/g, '').toLowerCase();
}

/**
 * Filter sections on a free-text query: every whitespace-separated word must
 * occur somewhere in the section (title, keywords or body). Empty query =
 * everything.
 */
export function searchHelp(query: string, sections: HelpSection[] = HELP_SECTIONS): HelpSection[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return sections;
  return sections.filter((s) => {
    const text = sectionText(s);
    return words.every((w) => text.includes(w));
  });
}

/** Which manual section belongs to a design-pane tab (contextual ❓ open). */
export function helpSectionForTab(tab: 'import' | 'data' | 'filters' | 'network'): string {
  switch (tab) {
    case 'import':
      return 'import';
    case 'data':
      return 'setup';
    case 'filters':
      return 'filters';
    case 'network':
      return 'network';
  }
}
