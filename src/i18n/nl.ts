/**
 * Nederlands woordenboek — Engels-als-sleutel (zie lib/i18n.ts).
 *
 * Dit bestand is het SJABLOON voor elke volgende taal: kopieer het, vertaal de
 * waarden, registreer het in main.tsx en voeg de taal toe aan LANGS. Een
 * ontbrekende sleutel valt automatisch terug op de Engelse tekst, dus een
 * onvolledig woordenboek breekt nooit iets.
 *
 * Stijl: informeel-technisch ("je"), dezelfde toon als de handleiding.
 * `{placeholders}` letterlijk laten staan — substitutie gebeurt ná vertaling,
 * dus de woordvolgorde is per taal vrij.
 */
export const nl: Record<string, string> = {
  // ── Topbar: chips ────────────────────────────────────────────────────
  Timing: 'Timing',
  Response: 'Response',
  Overlap: 'Overname',
  'Phase P95': 'Fase P95',
  'RAW DRIVERS — no crossover is shaping the sum yet, so this is just where you start from, not a problem. It colours once a design exists.':
    'RAUWE DRIVERS — er vormt nog geen crossover de som, dus dit is je startpunt, geen probleem. De chip kleurt zodra er een ontwerp is.',
  'RAW DRIVERS — no crossover yet, so this is the starting point, not a fault. It colours once a design exists.':
    'RAUWE DRIVERS — nog geen crossover, dus dit is het startpunt, geen fout. De chip kleurt zodra er een ontwerp is.',
  "Whole-range flatness of the combined response, 0–100 — from the AVERAGE deviation over the visible range, so one narrow dip can't dominate the verdict (the peak ±dB in the SPL strip still shows it)":
    'Vlakheid van de gezamenlijke respons over het hele zichtbare bereik, 0–100 — uit de GEMIDDELDE afwijking, zodat één smalle dip het oordeel niet kan domineren (de piek ±dB in de SPL-strip toont die dip nog steeds)',
  "Where the two drivers' levels meet in the current sim — the acoustic crossover point. Neutral by design: a location, not a verdict.":
    'Waar de niveaus van de twee drivers elkaar kruisen in de huidige sim — het akoestische overnamepunt. Bewust neutraal: een plek, geen oordeel.',
  '95th-percentile phase error in the driver overlap — ≤45° sums fully, ≤90° still gains ≥3 dB, beyond that the drivers stop helping each other':
    '95e-percentiel fasefout in het overlapgebied — ≤45° telt volledig op, ≤90° wint nog ≥3 dB, daarboven helpen de drivers elkaar niet meer',
  'Everything the app is currently warning about, in one list — click':
    'Alles waar de app nu voor waarschuwt, in één lijst — klik',
  '1 issue': '1 melding',
  '{n} issues': '{n} meldingen',

  // ── Topbar: mode / layout / theme / language / buttons ───────────────
  Guided: 'Begeleid',
  Expert: 'Expert',
  'A numbered route from measurements to a shopping list. The app decides the crossover, the filter shapes and the parts; you supply the facts about your speaker. Every check and warning stays visible.':
    'Een genummerde route van metingen naar een boodschappenlijst. De app kiest de crossover, de filtervormen en de onderdelen; jij levert de feiten over je luidspreker. Elke controle en waarschuwing blijft zichtbaar.',
  'Everything: alignment preference, acoustic slopes, phase metric, crossover pins, component tiers, the network editor. Overrides on top of the same engine.':
    'Alles: alignment-voorkeur, akoestische flanken, fase-metriek, crossover-pins, component-tiers, de netwerk-editor. Zelfde engine, alle knoppen.',
  'Follow window width: split when it fits, stacked when narrow':
    'Volgt de vensterbreedte: gesplitst als het past, gestapeld als het smal is',
  'Always two panes: design left, charts right':
    'Altijd twee panelen: ontwerp links, grafieken rechts',
  'Always the classic single-column stack': 'Altijd de klassieke enkele kolom',
  Auto: 'Auto',
  Split: 'Gesplitst',
  Stacked: 'Gestapeld',
  Light: 'Licht',
  Dark: 'Donker',
  'Theme: follow the OS': 'Thema: volg het besturingssysteem',
  'Theme: light': 'Thema: licht',
  'Theme: dark': 'Thema: donker',
  'Interface language — anything not translated yet falls back to English':
    'Taal van de interface — wat nog niet vertaald is valt terug op Engels',
  'Command palette — every action, searchable (⌘K / Ctrl+K); press ? for all shortcuts':
    'Commandopalet — elke actie, doorzoekbaar (⌘K / Ctrl+K); druk ? voor alle sneltoetsen',
  Measure: 'Meten',
  'Measuring guide: where to aim the mic, how far back to stand, and what a turntable sweep really captures. The illustrations run on the same geometry the optimizer uses.':
    'Meetgids: waar je de mic op richt, hoe ver je erbij vandaan staat, en wat een draaitafel-sweep werkelijk vastlegt. De illustraties draaien op dezelfde geometrie als de optimizer.',
  Help: 'Help',
  'Manual: searchable explanation of every tab, the optimizer, the scores and the VituixCAD exchange (currently written in Dutch — translation is on the list)':
    'Handleiding: doorzoekbare uitleg van elke stap, de optimizer, de scores en de VituixCAD-uitwisseling',

  // ── Stappenbalk (guided) ─────────────────────────────────────────────
  'Your project': 'Je project',
  'Your cabinet': 'Je kast',
  'Your drivers': 'Je drivers',
  'Design it': 'Ontwerp het',
  'Your build': 'Je bouw',
  'Load your measurement files, and save or reopen a project.':
    'Laad je meetbestanden, en bewaar of heropen een project.',
  'The box and how you measured it. Do this before the drivers: it fixes the reference point everything else is measured from.':
    'De kast en hoe je gemeten hebt. Doe dit vóór de drivers: het legt het referentiepunt vast waar al het andere vanaf gemeten is.',
  'Where each driver sits in that box, what is behind it, and its cone area and travel from the datasheet.':
    'Waar elke driver in die kast zit, wat erachter zit, en zijn conusoppervlak en slag uit het datasheet.',
  'One button. The app picks the crossover points, the filter shapes and the parts, and shows what it chose.':
    'Eén knop. De app kiest de overnamepunten, de filtervormen en de onderdelen, en laat zien wat hij koos.',
  'The schematic and the shopping list.': 'Het schema en de boodschappenlijst.',

  // ── Expert-tabs ──────────────────────────────────────────────────────
  Import: 'Import',
  Setup: 'Setup',
  'Setup (drivers)': 'Setup (drivers)',
  Filters: 'Filters',
  Network: 'Netwerk',
  Project: 'Project',
  Drivers: 'Drivers',
  'Load measurements, catalogs and projects; save your work':
    'Laad metingen, catalogi en projecten; bewaar je werk',
  'View range, cabinet and mic geometry, phase convention, tweeter adjustment, vxp variant and the timing sanity check':
    'Weergavebereik, kast- en mic-geometrie, faseconventie, tweeter-correctie, vxp-variant en de timing-controle',
  'Per-driver facts: position in the cabinet, enclosure, Sd/Xmax and how many':
    'Feiten per driver: positie in de kast, behuizing, Sd/Xmax en het aantal',
  'Virtual target filters (HP/LP/EQ per driver), the Optimize button and passive synthesis':
    'Virtuele doelfilters (HP/LP/EQ per driver), de Optimize-knop en passieve synthese',
  'The passive network editor: schematic, component tuning, catalog and BOM':
    'De passieve netwerk-editor: schema, componenttuning, catalogus en stuklijst',

  // ── Welkomstkaart ────────────────────────────────────────────────────
  'Design a crossover from measurements': 'Ontwerp een crossover uit metingen',
  'Load a frequency response and impedance per driver, and the app works out the crossover: filter shapes, component values, and a parts list you can order. No filter knowledge needed to start.':
    'Laad per driver een frequentierespons en impedantie, en de app werkt de crossover uit: filtervormen, componentwaarden, en een bestelbare onderdelenlijst. Je hoeft niets van filters te weten om te beginnen.',
  'Explore with the demo speaker': 'Verken met de demo-luidspreker',
  'A complete real measurement set (responses, impedances, angles, cabinet) — see the whole flow work before you own a microphone.':
    'Een complete echte meetset (responsies, impedanties, hoeken, kast) — zie de hele flow werken vóór je een microfoon bezit.',
  'I have measurements': 'Ik heb metingen',
  'The wizard walks you through loading them and checks nothing is missing.':
    'De wizard loodst je door het laden en controleert of er niets ontbreekt.',
  'Just let me look around': 'Laat me gewoon rondkijken',

  // ── Commandopalet ────────────────────────────────────────────────────
  'Type a command… (navigate, optimize, toggle charts, theme)':
    'Typ een commando… (navigeren, optimaliseren, grafieken aan/uit, thema)',
  'No matching command': 'Geen passend commando',
  'Go to: {step}': 'Ga naar: {step}',
  'Optimize — design for me': 'Optimize — ontwerp voor mij',
  'Optimize — flatten driver': 'Optimize — maak de driver vlak',
  'the one-button designer': 'de één-knops-ontwerper',
  'Open the design wizard': 'Open de ontwerpwizard',
  'Open the measuring guide': 'Open de meetgids',
  'rig, distances, angles': 'opstelling, afstanden, hoeken',
  'Open the manual': 'Open de handleiding',
  'Show design targets': 'Toon de ontwerpdoelen',
  'what the last build was fitted against': 'waar de laatste build tegen gefit is',
  'Open the catalog manager': 'Open het catalogusbeheer',
  'SKUs, prices, series': "SKU's, prijzen, series",
  'Load the KOAN demo measurements': 'Laad de KOAN-demometingen',
  'Hold the combined curve as reference': 'Zet de gezamenlijke curve vast als referentie',
  'Clear the held reference curve': 'Wis de vastgezette referentiecurve',
  'freeze a copy in the SPL chart to compare against (REW: hold trace)':
    'bevries een kopie in de SPL-grafiek om tegen te vergelijken (REW: hold trace)',
  'Hide chart: {name}': 'Verberg grafiek: {name}',
  'Show chart: {name}': 'Toon grafiek: {name}',
  'Theme: switch to light': 'Thema: schakel naar licht',
  'Theme: switch to dark': 'Thema: schakel naar donker',
  '💾 Save (overwrite last saved filter)': '💾 Opslaan (overschrijft het laatst bewaarde filter)',
  'Keyboard shortcuts': 'Sneltoetsen',
  'Show current issues ({n})': 'Toon huidige meldingen ({n})',

  // ── Sneltoetsen-overzicht ────────────────────────────────────────────
  Everywhere: 'Overal',
  'command palette — every action, searchable': 'commandopalet — elke actie, doorzoekbaar',
  'this overview': 'dit overzicht',
  'jump between the steps / tabs': 'spring tussen de stappen / tabs',
  'save (overwrite the last-saved filter)': 'opslaan (overschrijft het laatst bewaarde filter)',
  'close any popup': 'sluit elke popup',
  Charts: 'Grafieken',
  zoom: 'zoomen',
  'vertical zoom': 'verticaal zoomen',
  pan: 'verschuiven',
  reset: 'terugzetten',
  'click legend chip': 'klik legenda-chip',
  'show / hide that curve': 'toon / verberg die curve',
  'drag dot': 'sleep stip',
  'move a filter knee or EQ band': 'verplaats een filterknie of EQ-band',
  'scroll on dot': 'scroll op stip',
  'its Q': 'zijn Q',
  'Network editor': 'Netwerk-editor',
  'cancel tool': 'annuleer gereedschap',
  'remove part': 'verwijder onderdeel',
  rotate: 'roteer',
  undo: 'ongedaan maken',
  redo: 'opnieuw',
  'in a value field: step through E12 values': 'in een waardeveld: stap door E12-waarden',

  // ── Meldingenlijst ───────────────────────────────────────────────────
  'Current issues': 'Huidige meldingen',
  'Nothing wrong right now.': 'Op dit moment is er niets mis.',
  'Import tab — the banner above the file slots': 'Import-stap — de banner boven de bestandsslots',
  'Midrange files are loaded but the set is not a full 3-way — the mid is NOT in the summed response.':
    'Er zijn midrange-bestanden geladen maar de set is geen volledige 3-weg — de mid zit NIET in de opgetelde respons.',
  'Import tab — load a woofer AND a tweeter as well, or clear the mid slot':
    'Import-stap — laad óók een woofer EN een tweeter, of maak het mid-slot leeg',
  'Timing {verdict}: the two sweeps may not share a time reference, which silently ruins every phase number.':
    'Timing {verdict}: de twee sweeps delen mogelijk geen tijdreferentie, en dat verpest stilletjes elk fasegetal.',
  'Topbar Timing chip — hover it for the full verdict; 📐 Measure explains the shared-clock rig':
    'Timing-chip in de topbar — hover voor het volledige oordeel; 📐 Meten legt de gedeelde-klok-opstelling uit',
  'Pair time-base {verdict}:': 'Tijdbasis per paar {verdict}:',
  'Topbar Timing chip — hover for both pairs': 'Timing-chip in de topbar — hover voor beide paren',
  'System impedance dips to {z} Ω — below the {floor} Ω amplifier floor.':
    'De systeemimpedantie zakt naar {z} Ω — onder de versterkervloer van {floor} Ω.',
  'System impedance panel — the Z min marker shows where; the optimizer repairs this when it can':
    'Paneel systeemimpedantie — de Z-min-markering toont waar; de optimizer repareert dit waar hij kan',

  // ── Import-stap ──────────────────────────────────────────────────────
  Tweeter: 'Tweeter',
  'Midrange (3-way)': 'Midrange (3-weg)',
  Woofer: 'Woofer',
  'Woofer / mid': 'Woofer / mid',
  '✓ response': '✓ respons',
  '{n} angles': '{n} hoeken',
  'no impedance yet': 'nog geen impedantie',
  'no files yet — or drop them here': 'nog geen bestanden — of sleep ze hierheen',
  '⬇ drop to load': '⬇ laat los om te laden',
  'Drop FRD + ZMA files here': 'Sleep FRD + ZMA-bestanden hierheen',
  'response + all horizontal angles + impedance in one go — or click to browse':
    'responsie + alle horizontale hoeken + impedantie in één keer — of klik om te bladeren',
  '⬇ Dropping works on this whole step — a .vxp set, saved project, catalog or filter file lands in the right place by itself; measurements ask which driver they belong to.':
    '⬇ Slepen werkt op deze hele stap — een .vxp-set, opgeslagen project, catalogus of filterbestand landt vanzelf op de juiste plek; metingen vragen bij welke driver ze horen.',
  '⬇ Drop files — measurements go to a driver of your choice; a .vxp set, saved project, catalog or filter file loads straight away':
    '⬇ Sleep bestanden hierheen — metingen gaan naar een driver naar keuze; een .vxp-set, opgeslagen project, catalogus of filterbestand laadt direct',
  'Which driver are these for?': 'Voor welke driver zijn deze?',
  '1 file': '1 bestand',
  '{n} files': '{n} bestanden',
  '(Tip: drop directly on a driver card to skip this question.)':
    '(Tip: sleep rechtstreeks op een driverkaart en je slaat deze vraag over.)',
  'Verification measurement': 'Verificatiemeting',
  'the measured response of the BUILT system, for the model-vs-measurement overlay':
    'de gemeten respons van het GEBOUWDE systeem, voor de model-vs-meting-overlay',

  // ── "Charts show" + succesregels ─────────────────────────────────────
  'Charts show:': 'Grafieken tonen:',
  'passive network “{name}”': 'passief netwerk “{name}”',
  'VituixCAD variant “{name}”': 'VituixCAD-variant “{name}”',
  'the virtual filter design (Filters tab)': 'het virtuele filterontwerp (Filters-tab)',
  'raw drivers — no crossover yet': 'rauwe drivers — nog geen crossover',
  "The sim's precedence: an active editor network wins over a vxp variant, which wins over the virtual filters, which win over raw drivers. Every chart on the right shows THIS.":
    'De voorrang in de sim: een actief editor-netwerk wint van een vxp-variant, die wint van de virtuele filters, die winnen van rauwe drivers. Elke grafiek rechts toont DIT.',
  'Design ready — the charts on the right show it now.':
    'Ontwerp klaar — de grafieken rechts tonen het nu.',
  'Next: Your build': 'Volgende: Je bouw',
  'has the schematic and the parts list.': 'heeft het schema en de onderdelenlijst.',
  'Design ready — the winner is loaded in the': 'Ontwerp klaar — de winnaar staat in de',
  'tab and every chart shows it. The rows below are the full candidates: click one to try it, 💾 Save keeps the one you trust.':
    'tab en elke grafiek toont hem. De rijen hieronder zijn de volledige kandidaten: klik er één om hem te proberen, 💾 Opslaan bewaart die je vertrouwt.',

  // ── Grafiekpanelen: chips, titels, empty states ──────────────────────
  Directivity: 'Directiviteit',
  Sonogram: 'Sonogram',
  'Filter transfer': 'Filteroverdracht',
  Impedance: 'Impedantie',
  Phase: 'Fase',
  'Time domain': 'Tijddomein',
  'Hide this panel (skips its computation too)':
    'Verberg dit paneel (slaat ook de berekening over)',
  'Show this panel': 'Toon dit paneel',
  'The charts appear here': 'Hier verschijnen de grafieken',
  'Load a frequency response per driver and this pane fills with the summed SPL, the phase alignment between the drivers, and everything else the design needs.':
    'Laad per driver een frequentierespons en dit paneel vult zich met de opgetelde SPL, de fase-uitlijning tussen de drivers, en al het andere dat het ontwerp nodig heeft.',
  'Load the demo measurements': 'Laad de demometingen',
  'Load your own (wizard) →': 'Laad je eigen metingen (wizard) →',
  'Directivity (horizontal)': 'Directiviteit (horizontaal)',
  'Directivity & sonogram (horizontal)': 'Directiviteit & sonogram (horizontaal)',
  "Appears once angle measurements are loaded — select the 15/30/45°… sweeps together with each driver's 0° file on the Import tab":
    'Verschijnt zodra hoekmetingen geladen zijn — selecteer de 15/30/45°…-sweeps samen met het 0°-bestand van elke driver op de Import-stap',
  ' (all three drivers need a set)': ' (alle drie de drivers hebben een set nodig)',
  '. It shows how the design behaves off-axis: the sound that reaches you via the walls. The demo set includes a full set of angles.':
    '. Het toont hoe het ontwerp zich off-axis gedraagt: het geluid dat je via de wanden bereikt. De demoset bevat een volledige hoekenset.',
  'Open {place} →': 'Open {place} →',
  'the Import tab': 'de Import-tab',
  'the Filters tab': 'de Filters-tab',
  'Filter transfer (driver voltage vs source)': 'Filteroverdracht (driverspanning vs bron)',
  'Appears once a crossover network runs in the sim — build one (Optimize, or Build passive filter on the Filters tab), draw one on the Network tab, or pick a VituixCAD variant. It shows the electrical filter each driver actually receives.':
    'Verschijnt zodra er een crossover-netwerk in de sim draait — bouw er één (Optimize, of Build passive filter op de Filters-tab), teken er één op de Netwerk-tab, of kies een VituixCAD-variant. Het toont het elektrische filter dat elke driver werkelijk krijgt.',
  'System impedance (amplifier load)': 'Systeemimpedantie (versterkerbelasting)',
  'Appears once a passive network with measured impedances runs in the sim. It shows the load your amplifier sees — the side of a design a response chart cannot show, and the reason a "flat" crossover can still be a bad one.':
    'Verschijnt zodra een passief netwerk met gemeten impedanties in de sim draait. Het toont de belasting die je versterker ziet — de kant van een ontwerp die een responsgrafiek niet kan tonen, en de reden dat een "vlakke" crossover alsnog een slechte kan zijn.',

  // ── Ontwerpwizard ────────────────────────────────────────────────────
  'Design wizard': 'Ontwerpwizard',
  'First — load your measurements': 'Eerst — laad je metingen',
  'Step {x} of {y}': 'Stap {x} van {y}',
  'System type': 'Systeemtype',
  '— what are we designing? The wizard then shows only the measurement slots that apply, and Next unlocks once the set is complete.':
    '— wat gaan we ontwerpen? De wizard toont dan alleen de meetslots die van toepassing zijn, en Volgende ontgrendelt zodra de set compleet is.',
  '1-way (single driver)': '1-weg (één driver)',
  '2-way': '2-weg',
  '3-way': '3-weg',
  'Flatten one driver (series traps, shelf groups, Zobel) — the validation flow':
    'Maak één driver vlak (serie-traps, shelf-groepen, Zobel) — de validatieflow',
  'Classic two-driver crossover design — the full optimizer chain':
    'Klassiek twee-driver-crossoverontwerp — de volledige optimizer-keten',
  'Three branches: sim, filters and network editor work; the 3-way optimizer is a later step':
    'Drie takken: sim, filters en netwerk-editor werken; de 3-weg-optimizer is een latere stap',
  Measurements: 'Metingen',
  '— load a 0° FRD per driver; include the .ZMA impedance and any angle files in the SAME pick to unlock more (recognised by extension and filename).':
    '— laad per driver een 0°-FRD; neem de .ZMA-impedantie en eventuele hoekbestanden in DEZELFDE selectie mee om meer te ontgrendelen (herkend aan extensie en bestandsnaam).',
  'Load the bundled KOAN measurements (all angles + impedances + vxp variants) — instant playground':
    'Laad de meegeleverde KOAN-metingen (alle hoeken + impedanties + vxp-varianten) — meteen een speeltuin',
  'Load KOAN demo data': 'Laad KOAN-demodata',
  '…or load your own:': '…of laad je eigen metingen:',
  'Load your measurements:': 'Laad je metingen:',
  Driver: 'Driver',
  'Driver — FRD (+ ZMA/LIMP, + angle files)': 'Driver — FRD (+ ZMA/LIMP, + hoekbestanden)',
  'FRD (+ ZMA/LIMP, + angle files)': 'FRD (+ ZMA/LIMP, + hoekbestanden)',
  Midrange: 'Midrange',
  'Still needed for a {n}-way:': 'Nog nodig voor een {n}-weg:',
  'driver response (FRD)': 'driver-respons (FRD)',
  'woofer response': 'woofer-respons',
  'midrange response': 'midrange-respons',
  'tweeter response': 'tweeter-respons',
  '⚠ More is loaded than a {n}-way — the app follows what is actually loaded, never the declared choice. Switch the system type above, or remove the extra driver in the Import tab (✕).':
    '⚠ Er is méér geladen dan een {n}-weg — de app volgt wat er werkelijk geladen is, nooit de gekozen declaratie. Wissel hierboven van systeemtype, of verwijder de extra driver op de Import-stap (✕).',
  '✓ 3-way set complete — continue to Goals. Optimize runs the staged 2D scan: LR4 targets + measured level trims per handover candidate, per-branch synthesis, assembled two-pair tune (amp-load verdict gates the ranking).':
    '✓ 3-weg-set compleet — ga door naar Doelen. Optimize draait de getrapte 2D-scan: LR4-doelen + gemeten niveautrims per overname-kandidaat, synthese per tak, geassembleerde twee-paar-tune (het versterkerlast-oordeel poort de ranking).',
  'Impedances (.ZMA)': 'Impedanties (.ZMA)',
  'unlock the passive build & component tune;': 'ontgrendelen de passieve bouw & componenttuning;',
  'angle files': 'hoekbestanden',
  'unlock the amplitude target & in-room weight in the Goals step. The full importer (VituixCAD projects, save/load) lives in the Import tab.':
    'ontgrendelen het amplitudedoel & in-kamer-gewicht op de Doelen-stap. De volledige importeur (VituixCAD-projecten, opslaan/laden) leeft op de Import-stap.',
  'Timing check': 'Timing-controle',
  "— do the two phase measurements share a time reference? (Wrong timing silently ruins the phase sum — it's the whole reason this tool exists.)":
    '— delen de twee fasemetingen een tijdreferentie? (Foute timing verpest stilletjes de fase-som — dé bestaansreden van deze tool.)',
  Plausible: 'Plausibel',
  '— the measured phase carries the real inter-driver delay (Δ {us} µs ≈ {mm} mm). Offset stays 0; nothing to enter.':
    '— de gemeten fase draagt het echte inter-driver-tijdverschil (Δ {us} µs ≈ {mm} mm). Offset blijft 0; niets in te vullen.',
  "Physical offset between the drivers' acoustic centres (tweeter deeper = positive)":
    'Fysieke offset tussen de akoestische centra van de drivers (tweeter dieper = positief)',
  '= {us} µs delay': '= {us} µs vertraging',
  "Enter it from the physical driver spacing (the measured Δ ≈ {mm} mm looks off, so don't trust it blindly). The full timing sanity check + the measured/minimum phase toggle live in the Setup tab.":
    'Vul hem in vanuit de fysieke driverafstand (de gemeten Δ ≈ {mm} mm oogt verdacht, dus vertrouw die niet blind). De volledige timing-controle + de measured/minimum-fase-schakelaar staan op de Setup-tab.',
  'Component catalog': 'Componentcatalogus',
  "— powers catalog snapping & the BOM. It lives OUTSIDE the project, so it persists across a Reset (that's why the optimizer can still use one).":
    '— voedt de catalogus-snap & de stuklijst. Hij leeft BUITEN het project en overleeft dus een Reset (daarom kan de optimizer er nog steeds één gebruiken).',
  '✓ An imported catalog is still loaded — {n} series':
    '✓ Er is nog een geïmporteerde catalogus geladen — {n} series',
  '{n} exact parts': '{n} exacte onderdelen',
  prices: 'prijzen',
  '. Snap-to-catalog is available.': '. Snap-naar-catalogus is beschikbaar.',
  'No imported catalog — only the built-in library ({n} series) for BOM matching & inspector suggestions. Import one to unlock catalog snapping + real prices.':
    'Geen geïmporteerde catalogus — alleen de ingebouwde bibliotheek ({n} series) voor stuklijst-matching & inspector-suggesties. Importeer er één voor catalogus-snapping + echte prijzen.',
  'Replace catalog': 'Vervang catalogus',
  'Import catalog (optional)': 'Importeer catalogus (optioneel)',
  Goals: 'Doelen',
  '— start with what "done" means. How simple should the filter be, and how do you weigh a flat response against tight phase? (Shared with ⚙ Settings — this is just the guided path.)':
    '— begin met wat "klaar" betekent. Hoe eenvoudig moet het filter zijn, en hoe weeg je een vlakke respons tegen strakke fase? (Gedeeld met ⚙ Settings — dit is alleen het begeleide pad.)',
  'Staged design — stop escalating once the targets are met (fewest components)':
    'Getrapt ontwerp — stop met escaleren zodra de doelen gehaald zijn (minste onderdelen)',
  'Targets: ripple ≤': 'Doelen: rimpel ≤',
  '±dB peak (as in the SPL strip)': '±dB piek (zoals in de SPL-strip)',
  'phase ≤': 'fase ≤',
  'These are a': 'Dit is een',
  'stopping point': 'stoppunt',
  ', not a limit. Tighter numbers make a': ', geen limiet. Strakkere getallen maken een',
  'more complex and more expensive': 'complexer en duurder',
  'filter — the app keeps adding EQ bands and parts while the target is unmet, and it only strips the parts it does not need once the target IS met. Looser numbers stop sooner and build simpler, but may leave performance on the table that a band or two would have been free to take. For reference, on top-tier drivers this engine delivers about 0.9 dB / 4°; on ordinary drivers or a rough cabinet, 2–3 dB is a realistic place to stop.':
    'filter — de app blijft EQ-banden en onderdelen toevoegen zolang het doel niet gehaald is, en snoeit pas overbodige onderdelen wég zodra het doel WÉL gehaald is. Ruimere getallen stoppen eerder en bouwen eenvoudiger, maar kunnen prestaties laten liggen die een band of twee gratis had opgehaald. Ter referentie: op topdrivers levert deze engine ongeveer 0,9 dB / 4°; op gewone drivers of een ruwe kast is 2–3 dB een realistisch stoppunt.',
  'Single-driver mode: relative phase does not exist, so the priority trade-off doesn’t apply — the solo engine optimises response flatness with cut-only EQ/shelves.':
    'Eén-driver-modus: relatieve fase bestaat niet, dus de prioriteitsafweging is niet van toepassing — de solo-engine optimaliseert responsvlakheid met alleen-verzwakkende EQ/shelves.',
  "Single-driver mode: relative phase does not exist, so the priority trade-off doesn't apply — the solo engine optimises response flatness with cut-only EQ/shelves.":
    'Eén-driver-modus: relatieve fase bestaat niet, dus de prioriteitsafweging is niet van toepassing — de solo-engine optimaliseert responsvlakheid met alleen-verzwakkende EQ/shelves.',
  'What should the optimizer favour?': 'Wat moet de optimizer bevoordelen?',
  'Flattest on-axis response': 'Vlakste on-axis-respons',
  'the tightest ±dB straight ahead': 'de strakste ±dB recht vooruit',
  Balanced: 'Gebalanceerd',
  'equal weight — a good default': 'gelijk gewicht — een goede standaard',
  'Tightest phase & off-axis': 'Strakste fase & off-axis',
  'best driver phase-tracking / vertical spread (often near-free)':
    'beste fase-tracking / verticale spreiding (vaak bijna gratis)',
  Currently: 'Op dit moment',
  'response {r}% · phase {p}%': 'respons {r}% · fase {p}%',
  '— set on the slider in ⚙ Settings, so none of the three above is selected. Pick one to replace it.':
    '— ingesteld met de schuif in ⚙ Settings, dus geen van de drie hierboven is geselecteerd. Kies er één om hem te vervangen.',
  "On real measurements a smooth response already buys most of the phase, so these differ less than you'd expect — fine control (any %) lives in ⚙ Settings.":
    'Op echte metingen koopt een gladde respons al het meeste van de fase, dus deze verschillen minder dan je zou verwachten — fijnregeling (elk %) staat in ⚙ Settings.',
  'Amplitude target': 'Amplitudedoel',
  '— which curve the optimizer flattens': '— welke curve de optimizer vlak maakt',
  'flattening the 0–30° average': 'maakt het 0–30°-gemiddelde vlak',
  'flattening the 0° axis': 'maakt de 0°-as vlak',
  'On-axis (0°)': 'On-axis (0°)',
  '— flattest response dead ahead; off-axis falls where it falls. Best for near-field or a fixed seat.':
    '— vlakste respons recht vooruit; off-axis valt waar het valt. Best voor nabij-veld of een vaste luisterplek.',
  'Listening window (0–30°)': 'Luistervenster (0–30°)',
  '— averages the front arc, so a hair of on-axis flatness buys a smoother tone across a normal seating spread.':
    '— middelt de voorste boog, dus een fractie on-axis-vlakheid koopt een gladdere toon over een normale zitspreiding.',
  'Weight for in-room sound: {pct}%': 'Gewicht voor in-kamer-klank: {pct}%',
  '(energy average)': '(energiegemiddelde)',
  "How much it ALSO smooths the energy average (the power response: every angle summed ≈ the room's tonal balance). Higher = more even directivity / smoother in-room sound, trading a little on-axis flatness. 0% = on-axis only.":
    'Hoeveel hij óók het energiegemiddelde gladstrijkt (de power response: alle hoeken opgeteld ≈ de toonbalans van de kamer). Hoger = gelijkmatiger directiviteit / gladdere kamerkank, in ruil voor een beetje on-axis-vlakheid. 0% = alleen on-axis.',
  'Amplitude target & in-room weight': 'Amplitudedoel & in-kamer-gewicht',
  'unlock once you load angle measurements (Import → per-driver angle FRDs). With only a 0° measurement there is nothing off-axis to optimise, so these stay inert.':
    "ontgrendelen zodra je hoekmetingen laadt (Import → hoek-FRD's per driver). Met alleen een 0°-meting is er off-axis niets te optimaliseren, dus deze blijven inactief.",
  Crossover: 'Crossover',
  '— where the drivers hand over, and how steep the ACOUSTIC slopes are. On real measurements Auto usually wins; force a slope only when you have a reason — a placeholder driver, or a house alignment.':
    '— waar de drivers overdragen, en hoe steil de AKOESTISCHE flanken zijn. Op echte metingen wint Auto meestal; forceer alleen een flank als je een reden hebt — een placeholder-driver, of een huis-alignment.',
  'Tuning range': 'Tuningbereik',
  '— the band the optimizer flattens & scores over (the design scope)':
    '— de band waarover de optimizer vlak maakt & scoort (de ontwerp-scope)',
  suggested: 'voorgesteld',
  'Use suggested': 'Gebruik voorstel',
  '✓ = your usable measured range': '✓ = je bruikbare gemeten bereik',
  'Wider = the whole speaker is judged; narrower = focus the tuning on the crossover (a full-band safety check still guards the rest).':
    'Breder = de hele luidspreker wordt beoordeeld; smaller = focus de tuning op de crossover (een breedband-veiligheidscontrole bewaakt de rest).',
  'Target level ≈ {db} dB': 'Doelniveau ≈ {db} dB',
  "— the passive system level, set by the {limiter} (the louder driver is padded down to match; passive can't boost above this).":
    '— het passieve systeemniveau, bepaald door de {limiter} (de luidere driver wordt omlaag gepad; passief kan hier niet bovenuit).',
  'Pin the acoustic crossover point': 'Pin het akoestische overnamepunt',
  'Pinned: the optimizer aims for this acoustic crossover (± margin) and picks the best design there.':
    'Gepind: de optimizer mikt op deze akoestische overname (± marge) en kiest daar het beste ontwerp.',
  'Free: the optimizer aims for the CENTRE of your driver window — ≈{mid} Hz, the geometric mean of the 2×Fs tweeter floor ({floor} Hz) and the {ceil} Hz mid beaming ceiling. Pin only to override.':
    'Vrij: de optimizer mikt op het MIDDEN van je drivervenster — ≈{mid} Hz, het meetkundig gemiddelde van de 2×Fs-tweetervloer ({floor} Hz) en het {ceil} Hz-bundelplafond van de mid. Pin alleen om te overrulen.',
  'Free: the optimizer stays within a sensible band (≈2×Fs up to the mid beaming limit) and picks the best crossover there. Set the mid size below for a physically-exact window; pin only for a specific point.':
    'Vrij: de optimizer blijft binnen een verstandige band (≈2×Fs tot het bundelplafond van de mid) en kiest daar de beste overname. Zet hieronder de mid-maat voor een fysisch exact venster; pin alleen voor een specifiek punt.',
  'The tweeter is kept above {floor} Hz automatically — twice its own resonance, read from your impedance measurement.':
    'De tweeter wordt automatisch boven {floor} Hz gehouden — tweemaal zijn eigen resonantie, afgelezen uit je impedantiemeting.',
  'Beaming ceiling ≈ {hz} Hz': 'Bundelplafond ≈ {hz} Hz',
  '— from the Sd you entered (effective piston Ø {mm} mm); no need to pick a nominal size':
    '— uit de Sd die je invulde (effectieve zuiger Ø {mm} mm); geen nominale maat nodig',
  'Mid size (sets the beaming ceiling)': 'Mid-maat (bepaalt het bundelplafond)',
  unknown: 'onbekend',
  'beaming ceiling ≈ {hz} Hz': 'bundelplafond ≈ {hz} Hz',
  'The next two look alike but are NOT the same thing — one is how you build it, the other is what comes out:':
    'De volgende twee lijken op elkaar maar zijn NIET hetzelfde — het één is hoe je bouwt, het ander is wat eruit komt:',
  'HP/LP alignment': 'HP/LP-alignment',
  '— the ELECTRICAL filter you build (topology & part count; binding)':
    '— het ELEKTRISCHE filter dat je bouwt (topologie & aantal onderdelen; bindend)',
  'Auto (library)': 'Auto (bibliotheek)',
  'Acoustic slopes': 'Akoestische flanken',
  '— the MEASURED roll-off of driver + filter together (the result)':
    '— de GEMETEN afval van driver + filter samen (het resultaat)',
  mid: 'mid',
  tweeter: 'tweeter',
  'Electrical order ≠ acoustic order: the driver already rolls off, so an electrical LR2 can MEASURE as an acoustic 4th order. Set the alignment when you care about the build (part count / a house alignment); set the acoustic slopes when you care about the summation result; leave either on Auto to let the measurement decide (often a touch better). Pinning both can over-constrain.':
    'Elektrische orde ≠ akoestische orde: de driver valt zelf al af, dus een elektrische LR2 kan METEN als een akoestische 4e orde. Zet het alignment als de bouw je interesseert (aantal onderdelen / huis-alignment); zet de akoestische flanken als het som-resultaat je interesseert; laat één van beide op Auto om de meting te laten beslissen (vaak nét beter). Beide pinnen kan over-beperken.',
  Components: 'Componenten',
  '— now turn the ideal design into parts you can buy: snap to your catalog, then choose quality tiers and brands.':
    '— maak van het ideale ontwerp nu koopbare onderdelen: snap naar je catalogus, en kies dan kwaliteitsniveaus en merken.',
  'Snap the build + tuner to purchasable catalog values':
    'Snap de bouw + tuner naar koopbare cataloguswaarden',
  'Import a catalog first — without one there are no real parts to snap to, so the design keeps theoretically ideal (continuous) values':
    'Importeer eerst een catalogus — zonder zijn er geen echte onderdelen om naar te snappen en houdt het ontwerp theoretisch ideale (continue) waarden',
  'Use real catalog parts (build + tuner end on purchasable values)':
    'Gebruik echte catalogusonderdelen (bouw + tuner eindigen op koopbare waarden)',
  ' — import a catalog first': ' — importeer eerst een catalogus',
  'Catalog: {n} series': 'Catalogus: {n} series',
  'prices loaded': 'prijzen geladen',
  'no prices yet': 'nog geen prijzen',
  'Auto — no tier preference': 'Auto — geen tier-voorkeur',
  'Position (doctrine): series-path premium · shunt/notch budget':
    'Positie (doctrine): serie-pad premium · shunt/notch budget',
  'Budget — cheapest tiers everywhere': 'Budget — overal de goedkoopste tiers',
  'Balanced — standard tier everywhere': 'Gebalanceerd — overal de standaard-tier',
  'Premium — best tiers everywhere': 'Premium — overal de beste tiers',
  Coils: 'Spoelen',
  Capacitors: 'Condensatoren',
  Resistors: 'Weerstanden',
  'Auto (all series)': 'Auto (alle series)',
  'Bound series also HARD-limit the fit to their value range (series-path slots only), so the optimizer works within e.g. Alumen 1–10 µF and the rest of the network adapts. The result reports what the constraint cost vs an unconstrained fit.':
    'Gebonden series begrenzen de fit ook HARD tot hun waardebereik (alleen serie-pad-slots), dus de optimizer werkt binnen bv. Alumen 1–10 µF en de rest van het netwerk past zich aan. Het resultaat meldt wat de beperking kostte t.o.v. een vrije fit.',
  'Pick a specific series above first — this constrains the fit to that series’ values.':
    'Kies hierboven eerst een specifieke serie — dit beperkt de fit tot de waarden van die serie.',
  'Constrain the fit to the chosen series’ values (series-path only) — e.g. dead-set on Alumen ⇒ the tweeter cap stays 1–10 µF and the network adapts':
    'Beperk de fit tot de waarden van de gekozen serie (alleen serie-pad) — bv. per se Alumen ⇒ de tweeter-cap blijft 1–10 µF en het netwerk past zich aan',
  'Allow 2-part stacks — a preferred tier/series stacks WITHIN itself before falling back; the result reports what stacking bought (fit % / €)':
    'Sta 2-delige stapels toe — een voorkeurs-tier/serie stapelt BINNEN zichzelf vóór hij terugvalt; het resultaat meldt wat stapelen opleverde (fit % / €)',
  'Series choices are binding per type; a series that cannot cover a value falls back rather than breaking the fit.':
    'Seriekeuzes zijn bindend per soort; een serie die een waarde niet kan dekken valt terug in plaats van de fit te breken.',
  'Review & run': 'Controleren & starten',
  "— here's the plan. Optimize designs, builds and tunes the whole chain in one go.":
    '— dit is het plan. Optimize ontwerpt, bouwt en tuned de hele keten in één keer.',
  'Single-driver mode': 'Eén-driver-modus',
  '— flatten the {drv} with cut-only EQ/shelves (≤ {n} bands), built as series traps / shelf groups (+ Zobel when the impedance rises) and component-tuned against the measurement.':
    '— maak de {drv} vlak met alleen-verzwakkende EQ/shelves (≤ {n} banden), gebouwd als serie-traps / shelf-groepen (+ Zobel als de impedantie stijgt) en component-getuned tegen de meting.',
  'woofer/mid': 'woofer/mid',
  'Staged: target ≤ {r} dB peak ripple': 'Getrapt: doel ≤ {r} dB piekrimpel',
  'Classic full-budget run': 'Klassieke run met vol budget',
  'flat at {db} dB (reaches {lo}–{hi})': 'vlak op {db} dB (reikt {lo}–{hi})',
  'sensitivity budget {db} dB': 'gevoeligheidsbudget {db} dB',
  'catalog parts · profile {p}': 'catalogusonderdelen · profiel {p}',
  'Theoretically ideal (continuous) component values — no snap':
    'Theoretisch ideale (continue) componentwaarden — geen snap',
  'Staged: targets ≤ {r} dB / {p}°': 'Getrapt: doelen ≤ {r} dB / {p}°',
  'priority {r}/{p}': 'prioriteit {r}/{p}',
  'Crossover pinned at {f} ± {m} Hz': 'Crossover gepind op {f} ± {m} Hz',
  'Crossover free': 'Crossover vrij',
  'HP floor {f} Hz': 'HP-vloer {f} Hz',
  'Alignment {a} · slopes mid {m} / tweeter {tw}':
    'Alignment {a} · flanken mid {m} / tweeter {tw}',
  'Optimize runs the full chain: design →': 'Optimize draait de hele keten: ontwerp →',
  'solo topology build': 'solo-topologiebouw',
  'passive build': 'passieve bouw',
  'component tune': 'componenttuning',
  'catalog snap': 'catalogus-snap',
  Back: 'Terug',
  Cancel: 'Annuleren',
  Next: 'Volgende',

  // ── Import-stap: kaarten, near-field, slots, project & catalogus ─────
  '3-way: the MIDDLE branch. FRD = frequency response (SPL + phase), ZMA = measured impedance — select the 0° file plus angle files and the .ZMA in one go. Needs a woofer AND a tweeter loaded to join the sum.':
    '3-weg: de MIDDELSTE tak. FRD = frequentierespons (SPL + fase), ZMA = gemeten impedantie — selecteer het 0°-bestand plus hoekbestanden en de .ZMA in één keer. Heeft een geladen woofer ÉN tweeter nodig om in de som mee te doen.',
  'FRD = frequency response (SPL + phase), ZMA = measured impedance. Select the 0° file plus all horizontal angle files and the .ZMA in one go — angles are recognised by filename.':
    'FRD = frequentierespons (SPL + fase), ZMA = gemeten impedantie. Selecteer het 0°-bestand plus alle horizontale hoekbestanden en de .ZMA in één keer — hoeken worden herkend aan de bestandsnaam.',
  'Remove the midrange branch (back to 2-way)': 'Verwijder de midrange-tak (terug naar 2-weg)',
  'Near field — the low end the gate cannot reach':
    'Nabij-veld — het laag dat de gate niet haalt',
  'Near-field measurement of the CONE: microphone 5 mm from the centre of the dust cap. This is what gives the branch a low end the gate cannot reach. Export with phase.':
    'Nabij-veldmeting van de CONUS: microfoon 5 mm van het midden van de stofkap. Dit geeft de tak een laag dat de gate niet kan halen. Exporteer mét fase.',
  'Cone:': 'Conus:',
  'Load cone near field…': 'Laad conus-nabij-veld…',
  'Optional: near-field measurement at the PORT mouth (or passive radiator). It is summed with the cone COMPLEX and weighted by its diameter — below the box tuning the two largely cancel, which a magnitude-only sum cannot represent.':
    'Optioneel: nabij-veldmeting bij de POORT-monding (of passieve radiator). Hij wordt COMPLEX bij de conus opgeteld en gewogen op zijn diameter — onder de kastafstemming heffen de twee elkaar grotendeels op, wat een magnitude-som niet kan weergeven.',
  'Port:': 'Poort:',
  'Load port near field…': 'Laad poort-nabij-veld…',
  'Effective diameter of the port mouth, mm. A rectangular vent: the diameter of a circle with the same area. This is its weight in the sum.':
    'Effectieve diameter van de poortmonding, mm. Bij een rechthoekige poort: de diameter van een cirkel met hetzelfde oppervlak. Dit is zijn gewicht in de som.',
  'port Ø': 'poort Ø',
  'Splice centre and how wide the crossfade is. Leave the frequency empty and the app proposes one that sits inside both validity limits: above what the gate supports, below where the cone stops being a simple source (ka = 1).':
    'Splice-centrum en hoe breed de overvloei is. Laat de frequentie leeg en de app stelt er één voor die binnen beide geldigheidsgrenzen ligt: boven wat de gate aankan, onder waar de conus ophoudt een eenvoudige bron te zijn (ka = 1).',
  'splice at': 'splice op',
  'Hz, blend': 'Hz, overvloei',
  'A near-field measurement is a half-space result throughout, but a real cabinet loses up to 6 dB at low frequency as it radiates into full space. Without this the spliced low end reads too high. Deliberately an adjustable shelf rather than a diffraction model: the published formulas disagree by about 3x and measurement disagrees with all of them.':
    'Een nabij-veldmeting is overal een halve-ruimte-resultaat, maar een echte kast verliest laag tot 6 dB doordat hij de volle ruimte in straalt. Zonder dit leest het gesplicete laag te hoog. Bewust een instelbare shelf en geen diffractiemodel: de gepubliceerde formules verschillen onderling ~3× en de meting is het met geen van alle eens.',
  'baffle step back in': 'baffle step terug erin',
  'near field valid below ≈ {hz} Hz (ka = 1)': 'nabij-veld geldig onder ≈ {hz} Hz (ka = 1)',
  'far field above ≈ {hz} Hz': 'verre veld boven ≈ {hz} Hz',
  'enter the mic distance and reference height for the far-field limit':
    'vul de mic-afstand en referentiehoogte in voor de verre-veld-grens',
  'Optional: import a VituixCAD project to simulate crossover variants. Select the .vxp together with its .ZMA and response .txt files.':
    'Optioneel: importeer een VituixCAD-project om crossover-varianten te simuleren. Selecteer de .vxp samen met zijn .ZMA- en respons-.txt-bestanden.',
  'VituixCAD project (.vxp + .ZMA + response .txt — select together)':
    'VituixCAD-project (.vxp + .ZMA + respons-.txt — samen selecteren)',
  "Phase peer-comparison: in VituixCAD export the FILTERED woofer and tweeter responses (crossover applied), select BOTH here. The Phase chart then draws VituixCAD's relative phase (tweeter − woofer) in our convention as a dashed reference.":
    'Fase-vergelijking: exporteer in VituixCAD de GEFILTERDE woofer- en tweeterresponsies (crossover toegepast) en selecteer ze hier ALLEBEI. De fasegrafiek tekent dan VituixCADs relatieve fase (tweeter − woofer) in onze conventie als gestreepte referentie.',
  'VituixCAD phase reference (filtered woofer + tweeter — select both)':
    'VituixCAD-fasereferentie (gefilterde woofer + tweeter — selecteer beide)',
  'Model vs measurement (the validation loop): measure the BUILT system, load that FRD here, and the SPL chart overlays it against the simulated combined — level-aligned, with the deviation numbers in the SPL strip. Load again to replace.':
    'Model vs meting (de validatielus): meet het GEBOUWDE systeem, laad die FRD hier, en de SPL-grafiek legt hem over de gesimuleerde som — niveau-uitgelijnd, met de afwijkingscijfers in de SPL-strip. Opnieuw laden vervangt.',
  'Verification measurement (built system, FRD)': 'Verificatiemeting (gebouwd systeem, FRD)',
  'Remove the verification measurement': 'Verwijder de verificatiemeting',
  'Guided model-vs-measurement check: design, drivers, measurement, verdict — step by step':
    'Begeleide model-vs-meting-controle: ontwerp, drivers, meting, oordeel — stap voor stap',
  'Compare wizard': 'Vergelijkwizard',
  'Download everything (raw measurement files + design state) as one project file':
    'Download alles (ruwe meetbestanden + ontwerpstatus) als één projectbestand',
  'Save project': 'Project opslaan',
  'Restore a previously saved project file': 'Herstel een eerder opgeslagen projectbestand',
  'Load project': 'Project laden',
  'Clear autosave and start fresh': 'Wis de autosave en begin opnieuw',
  Reset: 'Reset',
  "Import a component catalog (brands, series, E-grids, tiers, prices) — the optimizer's catalog snapping and the BOM use it. A series with a built-in id overrides the built-in.":
    'Importeer een componentcatalogus (merken, series, E-roosters, tiers, prijzen) — de catalogus-snap van de optimizer en de stuklijst gebruiken hem. Een serie met een ingebouwd id overschrijft de ingebouwde.',
  'Import catalog': 'Catalogus importeren',
  'Download the current catalog as an editable JSON template':
    'Download de huidige catalogus als bewerkbaar JSON-sjabloon',
  'Export catalog': 'Catalogus exporteren',
  'Add, edit or remove exact SKUs (values, DCR/ESR, prices, tiers) without leaving the app — saved to the same catalog the optimizer and BOM use':
    "Voeg exacte SKU's toe, bewerk of verwijder ze (waarden, DCR/ESR, prijzen, tiers) zonder de app te verlaten — opgeslagen in dezelfde catalogus die de optimizer en de stuklijst gebruiken",
  'Manage…': 'Beheer…',
  'Load the priced Jantzen/Mundorf demo catalog on its own — without the KOAN measurements. Snapping and the BOM need a priced catalog to mean anything, and this is the quickest way back to one.':
    'Laad de geprijsde Jantzen/Mundorf-democatalogus los — zonder de KOAN-metingen. Snappen en de stuklijst hebben een geprijsde catalogus nodig om iets te betekenen, en dit is de snelste weg terug naar één.',
  'Demo catalog': 'Democatalogus',
  'A catalog is loaded — it lives outside the project, so Reset keeps it.':
    'Er is een catalogus geladen — hij leeft buiten het project, dus Reset behoudt hem.',
  'Built-in library only — import one, or take the demo catalog, to unlock snapping and real prices.':
    'Alleen de ingebouwde bibliotheek — importeer er één, of neem de democatalogus, voor snapping en echte prijzen.',
  '{n} series': '{n} series',
  '{n} switched off': '{n} uitgeschakeld',
  'Imported files': 'Geïmporteerde bestanden',
  'FRD — SPL response (0°)': 'FRD — SPL-respons (0°)',
  'ZMA — impedance': 'ZMA — impedantie',
  '.vxp — {n} crossover variants': '.vxp — {n} crossover-varianten',
  'ZMA — impedance ({model})': 'ZMA — impedantie ({model})',
  'VituixCAD project': 'VituixCAD-project',
  'Nothing imported yet — load driver files above, or hit "Load KOAN demo data".':
    'Nog niets geïmporteerd — laad hierboven driverbestanden, of klik "Laad KOAN-demodata".',
  'Add a note… (mic distance, smoothing, gate, which prototype)':
    'Voeg een notitie toe… (mic-afstand, smoothing, gate, welk prototype)',
  'Next: {step} →': 'Volgende: {step} →',
};
