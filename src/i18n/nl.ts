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
  'Choose files…': 'Kies bestanden…',
  'Choose file…': 'Kies bestand…',

  // ── Kaststap (Je kast) ───────────────────────────────────────────────
  'No measurements yet — load them in the Import tab first.':
    'Nog geen metingen — laad ze eerst op de Import-stap.',
  'View range': 'Weergavebereik',
  '— simulation paused while editing': '— simulatie gepauzeerd tijdens het bewerken',
  "Lower edge of the simulation grid AND the optimizer/metrics evaluation band. The sim pauses while you type; commits on Enter/blur. Zooming a chart and clicking 'use as view range' writes back here.":
    "Onderrand van het simulatiegrid ÉN de evaluatieband van optimizer/scores. De sim pauzeert terwijl je typt; commit op Enter/blur. Zoomen in een grafiek en 'use as view range' klikken schrijft hierheen terug.",
  'Upper edge of the simulation grid AND the optimizer/metrics evaluation band. The sim pauses while you type; commits on Enter/blur.':
    'Bovenrand van het simulatiegrid ÉN de evaluatieband van optimizer/scores. De sim pauzeert terwijl je typt; commit op Enter/blur.',
  'Y-axis floor of the SPL charts — empty = automatic':
    'Ondergrens van de y-as van de SPL-grafieken — leeg = automatisch',
  'Y-axis ceiling of the SPL charts — empty = automatic':
    'Bovengrens van de y-as van de SPL-grafieken — leeg = automatisch',
  'Cabinet & measurement': 'Kast & meting',
  '— the box and how you measured it (the drivers themselves are the next step)':
    '— de kast en hoe je gemeten hebt (de drivers zelf zijn de volgende stap)',
  'Everything below is measured from the': 'Alles hieronder wordt gemeten vanaf het',
  'reference point': 'referentiepunt',
  ': the spot the microphone was aimed at during the sweeps, and — on a turntable — the axis the cabinet turned around. Most people aim at the tweeter, so the tweeter sits at':
    ': de plek waar de microfoon tijdens de sweeps op gericht stond, en — op een draaitafel — de as waar de kast om draaide. De meeste mensen richten op de tweeter, dus die staat op',
  'and anything lower gets a': 'en alles daaronder krijgt een',
  'negative y': 'negatieve y',
  '. Nothing here changes your measurements; it lets the app work out what those measurements actually captured.':
    '. Niets hier verandert je metingen; het laat de app uitrekenen wat die metingen werkelijk hebben vastgelegd.',
  'How far below the top of the front panel the reference point sits. Correcting this moves the REFERENCE MARKER only — drivers keep the below-top positions you typed.':
    'Hoe ver onder de bovenkant van het front het referentiepunt zit. Een correctie verplaatst alleen het MERKTEKEN — drivers houden de onder-de-top-posities die je intypte.',
  'use {hz} Hz as f min': 'gebruik {hz} Hz als f min',
  'honest down to ≈ {hz} Hz': 'eerlijk tot ≈ {hz} Hz',
  'enter the mic distance to find out how low this measurement carries':
    'vul de mic-afstand in om te zien hoe laag deze meting draagt',
  'baffle step ≈ {hz} Hz': 'baffle step ≈ {hz} Hz',
  'you sit {deg}° {dir} the reference axis': 'je zit {deg}° {dir} de referentie-as',
  below: 'onder',
  above: 'boven',
  'change the numbers': 'pas de getallen aan',
  'How far the mic stood': 'Hoe ver de mic stond',
  '— your view range starts lower than that.': '— je weergavebereik begint lager dan dat.',
  Distance: 'Afstand',
  Elevation: 'Elevatie',
  'Gate used': 'Gebruikte gate',
  predict: 'voorspel',
  'The box': 'De kast',
  'A {mm} mm wide baffle puts its step around': 'Een {mm} mm breed front legt zijn step rond',
  '— that broad tilt in your measurement is the cabinet, not the driver.':
    '— die brede helling in je meting is de kast, niet de driver.',
  'Add the baffle size and the app can tell the cabinet apart from the driver — and draw your front panel on the next step.':
    'Vul de frontmaat in en de app kan de kast van de driver onderscheiden — en je front op de volgende stap tekenen.',
  'Mic aimed at': 'Mic gericht op',
  'another spot on the baffle': 'een andere plek op het front',
  'that driver becomes 0,0 — you never type its own offset':
    'die driver wordt 0,0 — zijn eigen offset typ je nooit',
  'Front panel': 'Frontpaneel',
  width: 'breedte',
  height: 'hoogte',
  'Reference point': 'Referentiepunt',
  'mm below the top': 'mm onder de bovenkant',
  'mm above the floor': 'mm boven de vloer',
  '{mm} mm below the top': '{mm} mm onder de bovenkant',
  '{mm} mm above the floor': '{mm} mm boven de vloer',
  'the reference point cannot sit {ref} mm below the top of a {h} mm front panel — one of the two is the other field':
    'het referentiepunt kan niet {ref} mm onder de bovenkant van een front van {h} mm zitten — één van de twee is het andere veld',
  'Where you listen': 'Waar je luistert',
  'Add your seat and ear height, and a driver-spacing rule becomes a statement about YOUR room.':
    'Vul je luisterplek en oorhoogte in, en een driverafstand-regel wordt een uitspraak over JOUW kamer.',
  'Ear height': 'Oorhoogte',

  // ── Drivers-stap (Je drivers) ────────────────────────────────────────
  'Load a driver in step 1 first — then this is where you tell the app what you know about it.':
    'Laad eerst een driver in stap 1 — daarna vertel je hier wat je over hem weet.',
  'What you know about them': 'Wat je over ze weet',
  '— from the datasheet and a ruler': '— uit het datasheet en met een liniaal',
  'single-driver mode': 'één-driver-modus',
  '3-way mode': '3-weg-modus',
  "How many IDENTICAL drivers make up this branch. Dual woofers displace twice the air, so the excursion floor drops by √2 — but each cone still beams as itself, so Sd below stays the SINGLE driver's datasheet number. With more than one, their centre-to-centre spacing sets where the array's own vertical lobing starts, which is usually a lower ceiling than cone beaming.":
    'Hoeveel IDENTIEKE drivers deze tak vormen. Dubbele woofers verplaatsen twee keer zoveel lucht, dus de excursievloer zakt met √2 — maar elke conus bundelt nog als zichzelf, dus Sd hieronder blijft het datasheet-getal van ÉÉN driver. Bij meer dan één bepaalt hun hart-op-hart-afstand waar de eigen verticale lobing van de array begint, meestal een lager plafond dan conusbundeling.',
  'drivers, spaced': 'drivers, afstand',
  driver: 'driver',
  'mm apart': 'mm uit elkaar',
  Position: 'Positie',
  '0, 0 — the mic was aimed here, so this driver defines the origin':
    '0, 0 — de mic was hierop gericht, dus deze driver definieert de oorsprong',
  "Where this driver's centre sits on the front panel, measured the way a ruler measures it: across from the centre line, and DOWN from the top. The app converts to its internal origin (the measurement reference point) using the reference height you gave on the cabinet step, so you never type the same fact twice — and centre-to-centre spacing per pair, with it the vertical-lobing ceiling, is derived from these.":
    'Waar het centrum van deze driver op het front zit, gemeten zoals een liniaal meet: opzij vanaf de middenlijn, en OMLAAG vanaf de bovenkant. De app rekent om naar zijn interne oorsprong (het meetreferentiepunt) met de referentiehoogte van de kaststap, dus je typt hetzelfde feit nooit twee keer — en hart-op-hart per paar, en daarmee het verticale-lobing-plafond, wordt hieruit afgeleid.',
  'mm from the centre line': 'mm vanaf de middenlijn',
  'as a ruler measures it — across from the centre line, down from the top of the front panel':
    'zoals een liniaal meet — opzij vanaf de middenlijn, omlaag vanaf de bovenkant van het front',
  'from the reference point · y up — add the reference height on the cabinet step to measure from the top instead':
    'vanaf het referentiepunt · y omhoog — vul de referentiehoogte op de kaststap in om vanaf de bovenkant te meten',
  'your sweep really covers': 'je sweep dekt in werkelijkheid',
  '— two figures because the pair fires both ways; a sweep measures their sum':
    '— twee getallen omdat het paar beide kanten op vuurt; een sweep meet hun som',
  'nearest baffle edge {mm} mm': 'dichtstbijzijnde frontrand {mm} mm',
  'excursion floor drops ×{f}': 'excursievloer zakt ×{f}',
  'array lobing from {hz} Hz': 'array-lobing vanaf {hz} Hz',
  '— ACROSS the seats: this baffle is wider than tall':
    '— DWARS over de zitplaatsen: dit front is breder dan hoog',
  '— vertically, and you sit on that axis': '— verticaal, en jij zit op die as',
  'enter the spacing for the array lobing ceiling':
    'vul de afstand in voor het array-lobing-plafond',
  Mounting: 'Montage',
  "Which panel this driver radiates from, and how far its acoustic centre sits behind the baffle plane. Side-firing woofers are an ordinary design, and without this the app judges the driver against a front baffle it is not on: it would read ~0° off-axis when it is really 90°, take the baffle step from the wrong panel width, and charge half a cabinet of mounting depth (hundreds of µs) to the driver's acoustic centre — which is what makes a perfectly normal speaker trip the timing check.":
    'Uit welk paneel deze driver straalt, en hoe ver zijn akoestisch centrum achter het baffle-vlak zit. Zij-woofers zijn een gewoon ontwerp, en zonder dit beoordeelt de app de driver tegen een front waar hij niet op zit: hij zou ~0° off-axis lezen waar het echt 90° is, de baffle step van de verkeerde paneelbreedte nemen, en een halve kastdiepte aan montagediepte (honderden µs) op het akoestisch centrum boeken — precies wat een volstrekt normale luidspreker de timing-controle laat struikelen.',
  'fires forward': 'vuurt naar voren',
  'fires backward': 'vuurt naar achteren',
  'fires left': 'vuurt naar links',
  'fires right': 'vuurt naar rechts',
  'fires up': 'vuurt omhoog',
  'fires down': 'vuurt omlaag',
  depth: 'diepte',
  tilt: 'kanteling',
  'These drivers sit on BOTH opposing panels, firing away from each other — the force-cancelling arrangement side-mounted woofers are normally built in. They then have two different true angles, and a sweep measures their sum.':
    'Deze drivers zitten op BEIDE tegenover elkaar liggende panelen en vuren van elkaar af — de krachtcompenserende opstelling waarin zij-woofers normaal gebouwd worden. Ze hebben dan twee verschillende ware hoeken, en een sweep meet hun som.',
  'opposed pair': 'tegenover elkaar',
  'acoustic centre behind the baffle — a flush-mounted cone still sits its cone depth back · tilt + = aimed up':
    'akoestisch centrum achter het front — een verzonken conus zit alsnog zijn conusdiepte naar achteren · kanteling + = omhoog gericht',
  'acoustic centre from the front, along the cabinet · tilt + = aimed up':
    'akoestisch centrum vanaf het front, langs de kast · kanteling + = omhoog gericht',
  'the tweeter': 'de tweeter',
  'the midrange': 'de midrange',
  'the woofer': 'de woofer',
  'the woofer/mid': 'de woofer/mid',
  'measured: this is the shallowest driver': 'gemeten: dit is de ondiepste driver',
  ', so it is the 0 the others are counted from':
    ', dus dit is de 0 waar de anderen vanaf geteld worden',
  '— they sit up to {mm} mm behind it.': '— zij zitten tot {mm} mm erachter.',
  'measured depth {mm} mm': 'gemeten diepte {mm} mm',
  'behind {anchor}, from the delay with the rig removed.':
    'achter {anchor}, uit de delay met de opstelling eruit gerekend.',
  'Your {mm} mm agrees.': 'Jouw {mm} mm komt overeen.',
  'You typed {mm} mm — one of the two is wrong.':
    'Jij typte {mm} mm — één van de twee is fout.',
  'Write the measured depth into the field above. It fixes the geometry (true off-axis angle, centre-to-centre spacing), but note that the timing split then explains itself by construction and stops being an independent check.':
    'Schrijf de gemeten diepte in het veld hierboven. Het maakt de geometrie scherper (ware hoek, hart-op-hart), maar let op: de timing-splitsing verklaart zichzelf dan per constructie en is geen onafhankelijke controle meer.',
  'use it': 'gebruik dit',
  "{facing}: a front turntable sweep cannot measure this driver's own directivity — the numbers above are the SYSTEM turning, not the cone. Near-field is the honest route for its response, and its baffle is the {panel} panel":
    '{facing}: een front-draaitafelsweep kan de eigen directiviteit van deze driver niet meten — de getallen hierboven zijn het SYSTEEM dat draait, niet de conus. Nabij-veld is de eerlijke route voor zijn respons, en zijn front is het {panel}paneel',
  side: 'zij',
  'top/bottom': 'boven-/onder',
  'step around {hz} Hz': 'step rond {hz} Hz',
  Chamber: 'Kamer',
  'a dome is its own sealed rear chamber — nothing to choose':
    'een dome is zijn eigen gesloten achterkamer — niets te kiezen',
  'resonance ≈ {hz} Hz from your impedance (the 2×Fs crossover floor reads this)':
    'resonantie ≈ {hz} Hz uit je impedantie (de 2×Fs-crossovervloer leest dit)',
  'The volume behind THIS driver — per driver on purpose: a 3-way routinely runs a sealed mid chamber inside a ported cabinet, so one answer for the whole box would be wrong. A sealed chamber is already a 2nd-order acoustic high-pass at its corner, so a 2nd-order electrical filter yields a 4th-order acoustic slope — on a low crossover that is the difference between one ~30 µF capacitor and a pair adding to ~90 µF. A port also means the box can radiate its own midrange through a pipe resonance.':
    'Het volume achter DEZE driver — bewust per driver: een 3-weg draait geregeld een gesloten mid-kamer in een gepoorte kast, dus één antwoord voor de hele kast zou fout zijn. Een gesloten kamer is bij zijn knik al een 2e-orde akoestische hoogdoorlaat, dus een 2e-orde elektrisch filter geeft een 4e-orde akoestische flank — op een lage overname is dat het verschil tussen één ~30 µF-cap en een paar dat optelt tot ~90 µF. Een poort betekent bovendien dat de kast zijn eigen midden kan uitstralen via een pijpresonantie.',
  sealed: 'gesloten',
  ported: 'gepoort',
  'open / dipole': 'open / dipool',
  'the volume behind THIS driver — one cabinet can hold different chambers':
    'het volume achter DEZE driver — één kast kan verschillende kamers bevatten',
  'your impedance measurement suggests {kind} ≈ {hz} Hz (valid if the ZMA was taken in this box).':
    'je impedantiemeting suggereert {kind} ≈ {hz} Hz (geldig als de ZMA in deze kast gemeten is).',
  'Your {hz} Hz agrees.': 'Jouw {hz} Hz komt overeen.',
  'You typed {hz} Hz — one of the two is wrong.':
    'Jij typte {hz} Hz — één van de twee is fout.',
  'ported: excursion runs away below Fb': 'gepoort: excursie loopt weg onder Fb',
  '— worth a steeper electrical high-pass than a sealed box would need':
    '— een steilere elektrische hoogdoorlaat waard dan een gesloten kast nodig had',
  Datasheet: 'Datasheet',
  'Cone area and linear excursion from the datasheet, for ONE driver. Sd gives the effective piston diameter (the honest one for every beaming rule — nominal size includes a surround that does not radiate); Sd and Xmax together give the level-aware excursion floor.':
    'Conusoppervlak en lineaire slag uit het datasheet, voor ÉÉN driver. Sd geeft de effectieve zuigerdiameter (de eerlijke voor elke bundelregel — de nominale maat telt een rand mee die niet straalt); Sd en Xmax samen geven de niveaubewuste excursievloer.',
  'effective Ø {mm} mm': 'effectieve Ø {mm} mm',
  'leaving these blank is fine — it switches off:':
    'leeg laten is prima — het schakelt uit:',
  'excursion floor': 'excursievloer',
  'cone size for the beaming rules': 'conusmaat voor de bundelregels',
  'driver spacing, lobing and edge distance': 'driverafstand, lobing en randafstand',
  'what the box itself already filters': 'wat de kast zelf al filtert',
  'at {x}, {y} mm': 'op {x}, {y} mm',
  'no position': 'geen positie',
  pair: 'paar',
  'tilt {deg}°': 'kanteling {deg}°',
  'no datasheet numbers': 'geen datasheet-getallen',
  'front-firing': 'naar voren vurend',
  'rear-firing': 'naar achteren vurend',
  'left-firing': 'naar links vurend',
  'right-firing': 'naar rechts vurend',
  'up-firing': 'omhoog vurend',
  'down-firing': 'omlaag vurend',

  // ── Tekening-bijschrift ──────────────────────────────────────────────
  '{n} Sd yet — those cones are dashed placeholders':
    '{n} Sd nog — die conussen zijn gestreepte plaatshouders',
  no: 'geen',
  'the other driver has no offset yet, so it sits on the reference point':
    'de andere driver heeft nog geen offset, dus hij ligt op het referentiepunt',
  'those offsets are still 0, so they sit on the reference point':
    'die offsets staan nog op 0, dus ze liggen op het referentiepunt',
  '{n} without a position': '{n} zonder positie',
  'drawn to scale from the numbers on the left':
    'op schaal getekend uit de getallen links',
  'to scale —': 'op schaal —',

  // ── Ontwerp-het-stap (guided intro + Design-groep) ───────────────────
  'Design the filter': 'Ontwerp het filter',
  'Virtual filters (target design)': 'Virtuele filters (doelontwerp)',
  'One button. The app works out where the drivers should hand over to each other, what shape each filter needs and which real parts to buy — using your measurements, not rules of thumb. It builds and measures':
    'Eén knop. De app rekent uit waar de drivers aan elkaar moeten overdragen, welke vorm elk filter nodig heeft en welke echte onderdelen je koopt — op basis van jouw metingen, niet van vuistregels. Hij bouwt en meet',
  'nine complete designs': 'negen complete ontwerpen',
  'across the crossover range your drivers allow and keeps the best — the widest search it offers, because here you are not going to hand-tune one. Expect several minutes; you can watch each candidate come in, and cancel at any time.':
    'over het crossoverbereik dat je drivers toelaten en houdt de beste — de breedste zoektocht die hij biedt, want hier ga je er niet zelf één handtunen. Reken op enkele minuten; je kunt elke kandidaat zien binnenkomen, en op elk moment annuleren.',
  'Not at the standard settings:': 'Niet op de standaardinstellingen:',
  'use the standard settings': 'gebruik de standaardinstellingen',
  Design: 'Ontwerp',
  '3-way: staged 2D scan — LR4 targets + measured level trims per (low, high) handover candidate, per-branch synthesis, assembled two-pair tune; the amp-load verdict gates the ranking. Winner lands in the Working tab.':
    '3-weg: getrapte 2D-scan — LR4-doelen + gemeten niveautrims per (laag, hoog)-overnamekandidaat, synthese per tak, geassembleerde twee-paar-tune; het versterkerlast-oordeel poort de ranking. De winnaar landt in de Working-tab.',
  'Single-driver mode: flatten this driver — cut-only EQ/shelf design, built as series traps / shelf groups (+ gated Zobel) and component-tuned against the measurement (lands in the Working tab)':
    'Eén-driver-modus: maak deze driver vlak — alleen-verzwakkend EQ/shelf-ontwerp, gebouwd als serie-traps / shelf-groepen (+ gepoorte Zobel) en component-getuned tegen de meting (landt in de Working-tab)',
  'Design the crossover, build it as a passive network and simulate it — all in one go (lands in the Working tab)':
    'Ontwerp de crossover, bouw hem als passief netwerk en simuleer hem — alles in één keer (landt in de Working-tab)',
  'Optimizing + building…': 'Optimaliseren + bouwen…',
  'Design wizard: load measurements, then goals, priority, crossover point, acoustic slopes and component choices in one guided flow — ends with Optimize':
    'Ontwerpwizard: laad metingen, dan doelen, prioriteit, overnamepunt, akoestische flanken en componentkeuzes in één begeleide flow — eindigt met Optimize',
  'Walk me through it': 'Neem me mee',
  Wizard: 'Wizard',

  // ── Score-strips & grafiekpanelen ────────────────────────────────────
  'Response flatness': 'Responsvlakheid',
  'Whole-range flatness of the combined SPL over the currently VISIBLE range (zoom the SPL chart and this follows): 0–100 from the AVERAGE |deviation| vs the median level. Judges the entire range — one narrow dip barely moves it; the peak ±dB next to it still exposes that dip.':
    'Vlakheid van de gezamenlijke SPL over het nu ZICHTBARE bereik (zoom de SPL-grafiek en dit volgt): 0–100 uit de GEMIDDELDE |afwijking| t.o.v. het mediaanniveau. Beoordeelt het hele bereik — één smalle dip beweegt hem nauwelijks; de piek ±dB ernaast laat die dip nog steeds zien.',
  'Deviation from the median level over the visible range: average (the whole-range number), 95th percentile, and the classic single-spot peak ±dB — a big gap between avg and peak means the trouble is local, not everywhere.':
    'Afwijking van het mediaanniveau over het zichtbare bereik: gemiddelde (het hele-bereik-getal), 95e percentiel, en de klassieke piek ±dB op één plek — een groot gat tussen gemiddelde en piek betekent dat het probleem lokaal is, niet overal.',
  'Share of the visible range within ±0.5 / ±1 / ±2 dB of the median level: {a}% · {b}% · {c}%.':
    'Aandeel van het zichtbare bereik binnen ±0,5 / ±1 / ±2 dB van het mediaanniveau: {a}% · {b}% · {c}%.',
  'designed from {hz} Hz': 'ontworpen vanaf {hz} Hz',
  "The optimizer designs from {hz} Hz up; the score above judges everything you SEE. Below that floor the woofer runs into its own rolloff, and a cut-only passive network cannot lift it — it could only match it by throwing away sensitivity everywhere else (baffle-step territory, a deliberate designer's choice). Zoom the SPL chart to the design band to read the score the optimizer actually worked on.":
    'De optimizer ontwerpt vanaf {hz} Hz; de score hierboven beoordeelt alles wat je ZIET. Onder die vloer loopt de woofer in zijn eigen afval, en een alleen-verzwakkend passief netwerk kan die niet optillen — hij zou hem alleen kunnen evenaren door overal elders gevoeligheid weg te gooien (baffle-step-terrein, een bewuste ontwerperskeuze). Zoom de SPL-grafiek naar de ontwerpband om de score te lezen waar de optimizer echt aan werkte.',
  'How far the combined response can drift when every physical R/L/C lands ±{pct}% off its value. Worst = all errors aligned against you (the guarantee before soldering); RSS = statistically realistic with independent part errors. Most sensitive parts: {parts} — tight-tolerance (or measured) parts pay off there first.':
    'Hoe ver de gezamenlijke respons kan verschuiven als élke fysieke R/L/C ±{pct}% naast zijn waarde landt. Worst = alle fouten tegen je in (de garantie vóór het solderen); RSS = statistisch realistisch bij onafhankelijke fouten. Gevoeligste onderdelen: {parts} — strakke-tolerantie- (of gemeten) onderdelen lonen daar het eerst.',
  'build ±{pct}%: worst ±{w} · RSS ±{r} dB · sensitive {parts}':
    'bouw ±{pct}%: worst ±{w} · RSS ±{r} dB · gevoelig {parts}',
  'Model vs measurement over {lo}–{hi} Hz. The measurement was level-aligned by {off} dB (median — absolute calibration differs by nature). Worst deviation {d} dB at {f} Hz':
    'Model vs meting over {lo}–{hi} Hz. De meting is {off} dB niveau-uitgelijnd (mediaan — absolute kalibratie verschilt van nature). Grootste afwijking {d} dB op {f} Hz',
  '. Phase: fitted mic delay {us} µs removed, residual avg {a}° / P95 {p}°':
    '. Fase: gefitte mic-delay {us} µs verwijderd, residu gem. {a}° / P95 {p}°',
  ' — offset near 180°: the build is likely wired INVERTED vs the sim':
    ' — offset rond 180°: de bouw is waarschijnlijk OMGEKEERD aangesloten t.o.v. de sim',
  'Summing sanity 0–100: overlap-weighted cos(ε/2) — how well the drivers add up as ONE source. High is NORMAL (45° error still scores 92); it only drops when the drivers actively fight: wrong polarity, a timing fault, or a crossover in a phase null. Deliberately in the background — steer the design on Response flatness and Phase flatness.':
    'Optel-gezondheid 0–100: overlap-gewogen cos(ε/2) — hoe goed de drivers als ÉÉN bron optellen. Hoog is NORMAAL (45° fout scoort nog 92); hij zakt pas als de drivers elkaar echt tegenwerken: verkeerde polariteit, een timingfout, of een crossover in een fasenul. Bewust op de achtergrond — stuur het ontwerp op responsvlakheid en fasevlakheid.',
  integration: 'integratie',
  'Overlap centre — the frequency where the driver levels meet (≈ the acoustic crossover point).':
    'Overlapcentrum — de frequentie waar de driverniveaus elkaar kruisen (≈ het akoestische overnamepunt).',
  overlap: 'overname',
  'Integration bandwidth — contiguous band around the overlap centre where the phase error stays ≤90°. Also drawn as the shaded zone in the phase chart.':
    'Integratiebandbreedte — aaneengesloten band rond het overlapcentrum waar de fasefout ≤90° blijft. Ook getekend als de gearceerde zone in de fasegrafiek.',
  'bandwidth {lo}–{hi} Hz · {oct} oct': 'bandbreedte {lo}–{hi} Hz · {oct} oct',
  'bandwidth none (>90° at the overlap centre)': 'bandbreedte geen (>90° op het overlapcentrum)',
  'no overlap within 20 dB — the drivers never meet, nothing to integrate':
    'geen overlap binnen 20 dB — de drivers ontmoeten elkaar nooit, niets te integreren',
  'Adjacent pair {pair}: summing score (overlap-weighted cos(ε/2)) and where the levels meet':
    'Aangrenzend paar {pair}: optelscore (overlap-gewogen cos(ε/2)) en waar de niveaus elkaar kruisen',
  'woofer-mid': 'woofer-mid',
  'mid-tweeter': 'mid-tweeter',
  'no overlap': 'geen overlap',
  'Combined-curve color = phase alignment:': 'Kleur van de som-curve = fase-uitlijning:',
  '≤15° — tight': '≤15° — strak',
  '≤45° — full summing': '≤45° — telt volledig op',
  '≤90° — ≥3 dB gain': '≤90° — ≥3 dB winst',
  '≤120° — no gain': '≤120° — geen winst',
  '>120° — cancelling': '>120° — dooft uit',
  'Same filter at every measured angle ({angles}° hor, one side).':
    'Hetzelfde filter op elke gemeten hoek ({angles}° hor, één kant).',
  'Horizontal only — but this baffle is wider than tall, so that IS the plane its drivers lobe in: this data captures it.':
    'Alleen horizontaal — maar dit front is breder dan hoog, dus dat ÍS het vlak waarin zijn drivers loberen: deze data legt het vast.',
  'Horizontal only — vertical lobing is not in this data.':
    'Alleen horizontaal — verticale lobing zit niet in deze data.',
  Scale: 'Schaal',
  'Normalized (0° = 0 dB per frequency)': 'Genormaliseerd (0° = 0 dB per frequentie)',
  'Absolute (rel. loudest point)': 'Absoluut (t.o.v. het luidste punt)',
  'Negative angles mirror the measured side (symmetry assumed). Dashed contour = −6 dB beamwidth; gaps mean wider than the measured {deg}°.':
    'Negatieve hoeken spiegelen de gemeten kant (symmetrie aangenomen). Gestreepte contour = −6 dB-bundelbreedte; gaten betekenen breder dan de gemeten {deg}°.',
  "Lowest system impedance the amplifier sees — the only side that can hurt it (current/heat). IEC 60268-5: minimum ≥ 0.8× the rated impedance. Green ≥ 6.4 Ω (safe as an '8 Ω' speaker), orange ≥ 3.2 Ω ('4 Ω' territory — fine for most solid-state amps), red below that.":
    "Laagste systeemimpedantie die de versterker ziet — de enige kant die hem pijn kan doen (stroom/warmte). IEC 60268-5: minimum ≥ 0,8× de nominale impedantie. Groen ≥ 6,4 Ω (veilig als '8 Ω'-luidspreker), oranje ≥ 3,2 Ω ('4 Ω'-terrein — prima voor de meeste transistorversterkers), rood daaronder.",
  'Load character AT the impedance minimum: arg(Z), negative = capacitive, positive = inductive. Low |Z| alone costs current/heat; low AND strongly capacitive (≲ −45°) is the combination marginal amplifiers (tube, some class-D) dislike most.':
    'Lastkarakter OP het impedantieminimum: arg(Z), negatief = capacitief, positief = inductief. Laag |Z| alleen kost stroom/warmte; laag ÉN sterk capacitief (≲ −45°) is de combinatie waar krappe versterkers (buizen, sommige klasse-D) het meest van balen.',
  '(resistive)': '(resistief)',
  '(capacitive)': '(capacitief)',
  '(inductive)': '(inductief)',
  'Highest system impedance. High is HARMLESS — the amp simply delivers less current there. It only becomes audible with a high-output-impedance amplifier (tube amps): the response then follows this curve.':
    'Hoogste systeemimpedantie. Hoog is ONSCHADELIJK — de versterker levert daar simpelweg minder stroom. Het wordt pas hoorbaar met een versterker met hoge uitgangsimpedantie (buizen): de respons volgt dan deze curve.',
  '{drv} phase (total)': '{drv}-fase (totaal)',
  'Woofer/mid': 'Woofer/mid',
  'Relative phase per driver pair': 'Relatieve fase per driverpaar',
  'Tweeter phase relative to woofer': 'Tweeterfase t.o.v. de woofer',
  'Phase flatness': 'Fasevlakheid',
  'Flatness score 0–100 over the driver overlap (overlap-weighted) — how flat the relative phase stays where both drivers play.':
    'Vlakheidsscore 0–100 over het driveroverlap (overlap-gewogen) — hoe vlak de relatieve fase blijft waar beide drivers spelen.',
  'Average |relative phase| in the overlap region.':
    'Gemiddelde |relatieve fase| in het overlapgebied.',
  '95th-percentile phase error — the worst 5% excluded.':
    '95e-percentiel fasefout — de slechtste 5% uitgesloten.',
  'Standard deviation of the phase error — the wobble.':
    'Standaarddeviatie van de fasefout — de wiebel.',
  'Share of the overlap region with the phase error within ±5 / ±10 / ±15°.':
    'Aandeel van het overlapgebied met de fasefout binnen ±5 / ±10 / ±15°.',
  'Relative-phase flatness over the {pair} overlap window: score 0–100, average and P95 |phase error|.':
    'Relatieve-fase-vlakheid over het {pair}-overlapvenster: score 0–100, gemiddelde en P95 |fasefout|.',
  'Excess group delay (combined)': 'Excess group delay (som)',
  'Step response & ETC (IFFT of combined response)': 'Staprespons & ETC (IFFT van de som)',
  'Sanity check, not a measurement — band edges are tapered. t = 0 at the impulse peak (arrival {ms} ms).':
    'Plausibiliteitscheck, geen meting — de bandranden zijn afgevlakt. t = 0 op de impulspiek (aankomst {ms} ms).',
  'Zones & line color = distance from 0°:': 'Zones & lijnkleur = afstand tot 0°:',

  // ── Serie-labels (chart-legenda's; memos dragen een uiLang-dep) ──────
  'Woofer target': 'Woofer-doel',
  'Midrange target': 'Midrange-doel',
  'Tweeter target': 'Tweeter-doel',
  'Held reference': 'Vastgezette referentie',
  '±{pct}% build tolerance ↑': '±{pct}% bouwtolerantie ↑',
  '±{pct}% build tolerance ↓': '±{pct}% bouwtolerantie ↓',
  'Measured — {name} ({db} dB)': 'Gemeten — {name} ({db} dB)',
  'Combined — {name}': 'Som — {name}',
  Combined: 'Som',
  'Combined, tweeter inverted (null check M-T)': 'Som, tweeter omgekeerd (nulcheck M-T)',
  'Combined, tweeter inverted (null check)': 'Som, tweeter omgekeerd (nulcheck)',
  'Combined, woofer inverted (null check W-M)': 'Som, woofer omgekeerd (nulcheck W-M)',
  '{name} high-pass · {hz} Hz — drag to move the knee':
    '{name} hoogdoorlaat · {hz} Hz — sleep om de knie te verplaatsen',
  '{name} low-pass · {hz} Hz — drag to move the knee':
    '{name} laagdoorlaat · {hz} Hz — sleep om de knie te verplaatsen',
  '{name} EQ {type} · {hz} Hz · {db} dB · Q {q} — drag = freq/gain, scroll = Q':
    '{name} EQ {type} · {hz} Hz · {db} dB · Q {q} — slepen = freq/gain, scrollen = Q',
  'Woofer filter phase': 'Woofer-filterfase',
  'Mid filter phase': 'Mid-filterfase',
  'Tweeter filter phase': 'Tweeter-filterfase',
  'Relative phase — raw drivers': 'Relatieve fase — rauwe drivers',
  'Woofer phase (total)': 'Wooferfase (totaal)',
  'Mid phase (total)': 'Midfase (totaal)',
  'Tweeter phase (total)': 'Tweeterfase (totaal)',
  'Relative phase — active pair': 'Relatieve fase — actief paar',
  'Mid phase relative to woofer': 'Midfase t.o.v. de woofer',
  'Tweeter phase relative to mid': 'Tweeterfase t.o.v. de mid',
  'VituixCAD (timing removed)': 'VituixCAD (timing verwijderd)',
  'Measured phase residual (vs model)': 'Gemeten fase-residu (vs model)',
  'Energy average (hor)': 'Energiegemiddelde (hor)',
  'Directivity index (on-axis − energy average)':
    'Directiviteitsindex (on-axis − energiegemiddelde)',
  'Mid filter': 'Mid-filter',
  'Tweeter filter': 'Tweeter-filter',
  'System |Z|': 'Systeem-|Z|',
  'Z phase (− = capacitive, + = inductive)': 'Z-fase (− = capacitief, + = inductief)',
  'integration bandwidth {oct} oct': 'integratiebandbreedte {oct} oct',
  'W-M bandwidth {oct} oct': 'W-M-bandbreedte {oct} oct',
  'M-T bandwidth {oct} oct': 'M-T-bandbreedte {oct} oct',
  'overlap {hz} Hz': 'overname {hz} Hz',
  'Excess group delay (bulk {ms} ms removed)': 'Excess group delay (bulk {ms} ms verwijderd)',
  'Step response (normalized)': 'Staprespons (genormaliseerd)',
  'Impulse (normalized)': 'Impuls (genormaliseerd)',
  'ETC — energy-time curve': 'ETC — energie-tijdcurve',

  // ── Expert-Setup: ledger + fase/adjustment-fieldsets ─────────────────
  'How you measured': 'Hoe je gemeten hebt',
  'Mic distance': 'Mic-afstand',
  '{ratio}× the source — {verdict}': '{ratio}× de bron — {verdict}',
  'far field': 'verre veld',
  close: 'dichtbij',
  'Mic elevation': 'Mic-elevatie',
  'The cabinet': 'De kast',
  'Mic was aimed at': 'Mic gericht op',
  'that driver is 0,0 — you do not type its offset':
    'die driver is 0,0 — zijn offset typ je niet',
  'Front panel width': 'Frontbreedte',
  'Front panel height': 'Fronthoogte',
  'Cabinet depth': 'Kastdiepte',
  'the panel a side-firing driver radiates from':
    'het paneel waar een zij-stralende driver uit straalt',
  'only needed for side-firing drivers': 'alleen nodig voor zij-stralende drivers',
  'Reference point, below top': 'Referentiepunt, onder de bovenkant',
  'deeper than the baffle is tall': 'dieper dan het front hoog is',
  'Reference point, above floor': 'Referentiepunt, boven de vloer',
  'Driver phase': 'Driverfase',
  'Measured = the real measured phase incl. the true inter-driver time offset — the whole point of this tool. Minimum phase = reconstructed from magnitude (offsets discarded), only for apples-to-apples VituixCAD comparison.':
    'Measured = de echte gemeten fase incl. het ware inter-driver-tijdverschil — hét bestaansrecht van deze tool. Minimum phase = gereconstrueerd uit de magnitude (offsets weggegooid), alleen voor een eerlijke VituixCAD-vergelijking.',
  Convention: 'Conventie',
  'Measured (real timing)': 'Gemeten (echte timing)',
  'Minimum phase (VituixCAD-style)': 'Minimum-fase (VituixCAD-stijl)',
  'measured inter-driver timing discarded — comparison mode':
    'gemeten inter-driver-timing weggegooid — vergelijkmodus',
  'auto: shared time reference plausible — real timing in use':
    'auto: gedeelde tijdreferentie plausibel — echte timing in gebruik',
  'Tweeter adjustment': 'Tweeter-correctie',
  'Simulate moving the tweeter physically (mm depth, + = recessed = extra delay). With measured phase and a shared time reference the real timing is already in the data — leave 0.':
    'Simuleer het fysiek verplaatsen van de tweeter (mm diepte, + = verzonken = extra vertraging). Met gemeten fase en een gedeelde tijdreferentie zit de echte timing al in de data — laat op 0.',
  'Offset (mm, + = recessed)': 'Offset (mm, + = verzonken)',
  'Level adjustment on the tweeter branch, dB': 'Niveaucorrectie op de tweetertak, dB',
  'Level trim (dB)': 'Niveautrim (dB)',
  'Flip the tweeter 180° (swap + and −) — the classic move around an LR2 crossover':
    'Keer de tweeter 180° om (wissel + en −) — de klassieke zet rond een LR2-crossover',
  'Invert polarity': 'Keer polariteit om',
  'The mm offset expressed as time delay': 'De mm-offset uitgedrukt als tijdvertraging',
  'measured phase already carries the real timing — leave 0 unless you are simulating a physical move':
    'de gemeten fase draagt de echte timing al — laat op 0 tenzij je een fysieke verplaatsing simuleert',
  'Midrange adjustment': 'Midrange-correctie',
  'Simulate moving the midrange physically (mm depth, + = recessed = extra delay). With measured phase and a shared time reference the real timing is already in the data — leave 0.':
    'Simuleer het fysiek verplaatsen van de midrange (mm diepte, + = verzonken = extra vertraging). Met gemeten fase en een gedeelde tijdreferentie zit de echte timing al in de data — laat op 0.',
  'Level adjustment on the midrange branch, dB': 'Niveaucorrectie op de midrangetak, dB',
  'Flip the midrange 180° (swap + and −)': 'Keer de midrange 180° om (wissel + en −)',

  // ── Netwerk-tab: editor + toolbars ───────────────────────────────────
  Configure: 'Instellen',
  State: 'Status',
  'Network editor (passive)': 'Netwerk-editor (passief)',
  'Drag parts, draw wires, edit values — the schematic IS the network: parts connect where their points touch, and every change re-solves live on the measured impedances. Inductors carry DCR, capacitors ESR.':
    'Sleep onderdelen, teken draden, bewerk waarden — het schema ÍS het netwerk: onderdelen verbinden waar hun punten elkaar raken, en elke wijziging lost live op tegen de gemeten impedanties. Spoelen dragen DCR, condensatoren ESR.',
  Start: 'Start',
  'Open the selected crossover variant in a new tab':
    'Open de geselecteerde crossover-variant in een nieuwe tab',
  'Load a vxp project first': 'Laad eerst een vxp-project',
  'Import variant': 'Importeer variant',
  'Open an exported .adsfilter.json in a new tab':
    'Open een geëxporteerde .adsfilter.json in een nieuwe tab',
  'Import filter': 'Importeer filter',
  'Start a fresh network in a new tab from a generic template — plausible starting values you tune from, the counterpart to Import and the optimizer':
    'Begin een vers netwerk in een nieuwe tab vanuit een generiek sjabloon — plausibele startwaarden om vanaf te tunen, de tegenhanger van Importeren en de optimizer',
  '3-way mode: the template follows the loaded branch set (a 2-way template would silently skip the mid)':
    '3-weg-modus: het sjabloon volgt de geladen takken (een 2-weg-sjabloon zou de mid stil overslaan)',
  'Number of ways — 3-way templates need all three branches loaded':
    'Aantal wegen — 3-weg-sjablonen hebben alle drie de takken nodig',
  '3-way (load three drivers)': '3-weg (laad drie drivers)',
  'Single-driver mode — only the blank scaffold applies (LP/HP templates need two branches)':
    'Eén-driver-modus — alleen het lege raamwerk is van toepassing (LP/HP-sjablonen hebben twee takken nodig)',
  'Filter order / slope per branch (mid = bandpass, twice the parts) — generic Butterworth-style seed values at 600 / 3000 Hz':
    'Filterorde / flank per tak (mid = banddoorlaat, dubbel zoveel onderdelen) — generieke Butterworth-achtige startwaarden op 600 / 3000 Hz',
  'Filter order / slope for both branches — generic Butterworth-style seed values':
    'Filterorde / flank voor beide takken — generieke Butterworth-achtige startwaarden',
  'New from template': 'Nieuw uit sjabloon',
  'Blank (drivers only)': 'Leeg (alleen drivers)',
  '1st order · 6 dB/oct': '1e orde · 6 dB/oct',
  '2nd order · 12 dB/oct': '2e orde · 12 dB/oct',
  '3rd order · 18 dB/oct': '3e orde · 18 dB/oct',
  '4th order · 24 dB/oct': '4e orde · 24 dB/oct',
  Export: 'Exporteren',
  'Download the active tab as a standalone .adsfilter.json — share it or bring it into another project':
    'Download de actieve tab als losstaande .adsfilter.json — deel hem of neem hem mee naar een ander project',
  'Export filter': 'Exporteer filter',
  'Export .vxp': 'Exporteer .vxp',
  'Export this design as a printable HTML report (A4): summary, the charts you have open, the schematic and the BOM with prices. The file is ALSO a filter file — Import filter reads it back, so a report can be mailed, printed and compared.':
    'Exporteer dit ontwerp als printbaar HTML-rapport (A4): samenvatting, de grafieken die je open hebt, het schema en de stuklijst met prijzen. Het bestand is ÓÓK een filterbestand — Importeer filter leest het terug, dus een rapport kan gemaild, geprint en vergeleken worden.',
  'Export report': 'Exporteer rapport',
  Catalog: 'Catalogus',
  'Download the component catalog as an editable JSON template — add your own brands/series and import it back':
    'Download de componentcatalogus als bewerkbaar JSON-sjabloon — voeg je eigen merken/series toe en importeer hem terug',
  'Import a component-catalog JSON: your series appear in the inspector next to the built-in ones (persisted across sessions)':
    'Importeer een componentcatalogus-JSON: jouw series verschijnen in de inspector naast de ingebouwde (blijft bewaard over sessies)',
  'Add, edit or remove exact SKUs (values, DCR/ESR, prices, tiers) without leaving the app':
    "Voeg exacte SKU's toe, bewerk of verwijder ze (waarden, DCR/ESR, prijzen, tiers) zonder de app te verlaten",
  Tools: 'Gereedschap',
  '3-way: re-fit the UNLOCKED component values against the measured three-branch sum — both adjacent crossings are guarded (valley, protection, dead-branch), phase is judged per pair':
    '3-weg: her-fit de ONVERGRENDELDE componentwaarden tegen de gemeten drie-takken-som — beide aangrenzende overnames worden bewaakt (vallei, bescherming, dode tak), fase wordt per paar beoordeeld',
  'Single-driver mode: re-fit the UNLOCKED component values against the measured driver — objective is branch flatness (+ amp-load floor); crossover terms do not apply':
    'Eén-driver-modus: her-fit de ONVERGRENDELDE componentwaarden tegen de gemeten driver — doel is takvlakheid (+ versterkerlast-vloer); crossover-termen zijn niet van toepassing',
  'Re-fit the UNLOCKED component values of the active tab against the measured response — 🔒 parts keep their value':
    'Her-fit de ONVERGRENDELDE componentwaarden van de actieve tab tegen de gemeten respons — 🔒-onderdelen houden hun waarde',
  'Tuning…': 'Tunen…',
  'Optimize components': 'Optimaliseer componenten',
  'Add an LCR notch (series trap across a driver) to tame a peak — enter frequency, depth and Q; values follow from the measured impedance and the result shows live':
    'Voeg een LCR-notch toe (serie-trap over een driver) om een piek te temmen — vul frequentie, diepte en Q in; de waarden volgen uit de gemeten impedantie en het resultaat toont live',
  'Add notch': 'Notch toevoegen',
  'Redraw this schematic from its netlist: series path as a bus, chains hanging down, branches stacked with air — electrically identical, undo-able. Fixes cramped layouts from older exports.':
    'Herteken dit schema vanuit zijn netlijst: serie-pad als bus, ketens hangend, takken gestapeld met lucht — elektrisch identiek, ongedaan te maken. Repareert krappe layouts uit oudere exports.',
  'Tidy layout': 'Layout opruimen',
  'What was this network built FOR? The virtual target design (HP/LP kind, order, knees, EQ bands) plus the MEASURED acoustic slopes beside the crossing — electrical component count never equals acoustic order.':
    'Waar is dit netwerk VOOR gebouwd? Het virtuele doelontwerp (HP/LP-soort, orde, knieën, EQ-banden) plus de GEMETEN akoestische flanken naast de overname — elektrisch aantal onderdelen is nooit gelijk aan akoestische orde.',
  Targets: 'Doelen',
  Simulation: 'Simulatie',
  "Feed the active tab's network into the simulation instead of the selected vxp variant — every edit re-solves live":
    'Voer het netwerk van de actieve tab aan de simulatie in plaats van de gekozen vxp-variant — elke bewerking lost live opnieuw op',
  'Use in simulation': 'Gebruik in simulatie',
  "Show the other tabs' summed responses as dashed ghost curves in the SPL chart":
    'Toon de sommen van de andere tabs als gestreepte ghost-curves in de SPL-grafiek',
  'Compare tabs': 'Vergelijk tabs',
  'Worst-case envelope around the combined curve when every physical R/L/C lands within its tolerance — what building with real parts can do to this design. Numbers in the SPL strip; the tooltip there ranks the most sensitive parts.':
    'Worst-case-envelop om de som-curve als élke fysieke R/L/C binnen zijn tolerantie landt — wat bouwen met echte onderdelen met dit ontwerp kan doen. Cijfers in de SPL-strip; de tooltip daar rangschikt de gevoeligste onderdelen.',
  'Tolerance band': 'Tolerantieband',
  'Component tolerance class: 2% (measured/selected parts), 5% (good film caps & air coils), 10% (electrolytics, budget parts)':
    'Tolerantieklasse: 2% (gemeten/geselecteerde onderdelen), 5% (goede filmcaps & luchtspoelen), 10% (elco’s, budget-onderdelen)',
  '{n} value changes — old → new': '{n} waardewijzigingen — oud → nieuw',
  part: 'onderdeel',
  old: 'oud',
  new: 'nieuw',

  // ── Chart.tsx ────────────────────────────────────────────────────────
  'Show series': 'Toon curve',
  'Hide series': 'Verberg curve',
  'Fold the supporting curves back up': 'Vouw de ondersteunende curves weer op',
  'Show ghosts, tolerance band and target shapes in the legend (they are drawn either way)':
    'Toon ghosts, tolerantieband en doelvormen in de legenda (getekend worden ze sowieso)',
  '− fewer': '− minder',
  '+{n} more': '+{n} meer',
  'Make this the committed view range (evaluation band)':
    'Maak dit het vaste weergavebereik (evaluatieband)',
  'use as view range': 'gebruik als weergavebereik',
  'Reset zoom (or double-click the chart)': 'Zet de zoom terug (of dubbelklik de grafiek)',
  'scroll = zoom · Shift+scroll = vertical · drag = pan · double-click = reset · click a legend chip to show/hide its curve':
    'scroll = zoomen · Shift+scroll = verticaal · slepen = verschuiven · dubbelklik = terugzetten · klik een legenda-chip om zijn curve te tonen/verbergen',
  'Dismiss chart gesture hint': 'Verberg de grafiek-hint',
  'No filter in the simulation — you are looking at the RAW drivers.':
    'Geen filter in de simulatie — je kijkt naar de RAUWE drivers.',
  'Design one in the Filters tab (Optimize — design for me), activate a network in the Network tab':
    'Ontwerp er een op de Filters-tab (Optimize — design for me), activeer een netwerk op de Netwerk-tab',
  ', or pick a vxp variant in the Setup tab': ', of kies een vxp-variant op de Setup-tab',

  // ── Filters-tab: Design/Configure/State ──────────────────────────────
  'What the passive build optimises for: the acoustic result on the measured driver, or an exact reproduction of the filter curve':
    'Waar de passieve bouw voor optimaliseert: het akoestische resultaat op de gemeten driver, of een exacte reproductie van de filtercurve',
  'Acoustic result (flatten measured driver)': 'Akoestisch resultaat (gemeten driver vlak)',
  'Filter curve (reproduce target exactly)': 'Filtercurve (doel exact reproduceren)',
  'Optimizer settings: priority, amplitude target, in-room weight, EQ bands':
    'Optimizer-instellingen: prioriteit, amplitudedoel, in-kamer-gewicht, EQ-banden',
  Settings: 'Instellingen',
  'Filters back to the clean starting point — measurements and crossover selection stay':
    'Filters terug naar het schone startpunt — metingen en crossover-keuze blijven',
  'Reset filters': 'Reset filters',
  'Take the virtual filters out of the simulation, keeping their settings — auto-on when a built passive network replaces them':
    'Haal de virtuele filters uit de simulatie, met behoud van hun instellingen — gaat automatisch aan als een gebouwd passief netwerk ze vervangt',
  Bypass: 'Bypass',
  'scan {a}/{b}': 'scan {a}/{b}',
  'round {n}': 'ronde {n}',
  'network sims': 'netwerk-sims',
  'virtual filters muted — passive network / raw drivers only':
    'virtuele filters gedempt — alleen passief netwerk / rauwe drivers',

  // ── ⚙ Optimizer-instellingen ────────────────────────────────────────
  'Optimizer settings': 'Optimizer-instellingen',
  "Single-driver mode — crossover settings (priority, phase, slopes, crossover point, HP/LP) don't apply and are disabled; the solo engine designs cut-only EQ/shelves within the EQ-band budget and the targets' ripple.":
    'Eén-driver-modus — crossover-instellingen (prioriteit, fase, flanken, crossover-punt, HP/LP) zijn niet van toepassing en staan uit; de solo-engine ontwerpt cut-only EQ/shelves binnen het EQ-bandbudget en de doel-rimpel.',
  "How much LEVEL the correction may give up. Passive filters can only cut, so flatness is paid for in efficiency — this is the budget for that payment. 6 dB ≈ a baffle-step's worth, right for a driver that will still get a crossover. A fullranger carrying the whole range is usually worth 10–20 dB: the further it may drop, the further up the band it can pull things flat.":
    'Hoeveel NIVEAU de correctie mag opgeven. Passieve filters kunnen alleen verzwakken, dus vlakheid wordt betaald in rendement — dit is het budget voor die betaling. 6 dB ≈ een baffle-step, goed voor een driver die nog een crossover krijgt. Een breedbander die het hele bereik draagt is meestal 10–20 dB waard: hoe verder hij mag zakken, hoe hoger in de band hij vlak kan trekken.',
  'May drop by': 'Mag zakken met',
  "What that budget means in absolute terms: the driver's own median level over the evaluation band, and the level the correction may sink to.":
    'Wat dat budget absoluut betekent: het eigen mediaanniveau van de driver over de evaluatieband, en het niveau waarnaar de correctie mag zakken.',
  '→ down to {a} dB (driver sits at {b})': '→ tot {a} dB (driver zit op {b})',
  "Instead of 'may drop by N dB', name the level itself: the engine flattens everything down TO that level. Better-posed (a fixed target cannot be met by moving the average) and it tells you directly how far up the band the correction can reach.":
    "In plaats van 'mag N dB zakken' noem je het niveau zelf: de engine vlakt alles af TOT dat niveau. Beter gesteld (een vast doel is niet te halen door het gemiddelde te verplaatsen) en het vertelt direct hoe hoog in de band de correctie kan reiken.",
  'or flatten to a fixed level': 'of vlak af op een vast niveau',
  "Flatten down TO this level (dB, in your own measurement's scale — check the SPL chart). A lower target reaches further up the band but costs efficiency. Anything already below this level cannot be lifted and stays out of scope.":
    'Vlak af TOT dit niveau (dB, in de schaal van je eigen meting — check de SPL-grafiek). Een lager doel reikt hoger in de band maar kost rendement. Alles wat al onder dit niveau zit is niet op te tillen en valt buiten bereik.',
  'Flat at': 'Vlak op',
  "The driver's own median level over the evaluation band, and how far a cut-only correction can reach at the target level you entered.":
    'Het eigen mediaanniveau van de driver over de evaluatieband, en hoe ver een cut-only correctie kan reiken op het doelniveau dat je invulde.',
  'driver sits at {a} dB · reaches {b}–{c}': 'driver zit op {a} dB · reikt {b}–{c}',
  'Goals & weighting': 'Doelen & weging',
  'Single-driver mode: relative phase does not exist — the solo objective is response flatness only':
    'Eén-driver-modus: relatieve fase bestaat niet — het solo-doel is alleen responsvlakheid',
  'The big trade-off: budget split between a flat response and flat phase. More phase = flatter phase but more amplitude ripple. Both ends are anchored (100% phase = 90/10 internally): with the response weight at true zero the optimizer would trade a wrecked response for a phase metric it can then game.':
    'Dé grote afweging: budgetverdeling tussen een vlakke respons en vlakke fase. Meer fase = vlakkere fase maar meer amplitude-rimpel. Beide uiteinden zijn verankerd (100% fase = intern 90/10): met het responsgewicht op echt nul zou de optimizer een gesloopte respons inruilen voor een fasemetriek die hij dan kan bespelen.',
  'Priority: response {a}% · phase {b}%': 'Prioriteit: respons {a}% · fase {b}%',
  'Phase metric': 'Fasemetriek',
  "How phase error is judged. Integration band = the panel's average + excursions over the WHOLE overlap window (flat across the handover, matches the numbers you read). Classic = overlap-weighted mean, centre-heavy (the old behaviour, kept as fallback).":
    'Hoe fasefout beoordeeld wordt. Integratieband = het paneelgemiddelde + uitschieters over het HELE overlapvenster (vlak over de overname, komt overeen met de cijfers die je leest). Klassiek = overlap-gewogen gemiddelde, centrum-zwaar (het oude gedrag, als terugval).',
  'Integration band (avg + P95)': 'Integratieband (gem + P95)',
  'Classic (overlap-weighted)': 'Klassiek (overlap-gewogen)',
  'Single-driver mode: directivity terms pair both drivers — on-axis only for now':
    'Eén-driver-modus: directiviteitstermen koppelen beide drivers — voorlopig alleen on-axis',
  'Load angle measurements to enable': 'Laad hoekmetingen om dit aan te zetten',
  'Single-driver mode: directivity terms pair both drivers — disabled for now':
    'Eén-driver-modus: directiviteitstermen koppelen beide drivers — voorlopig uit',
  'Weight for in-room sound: {n}% (energy average)':
    'Gewicht voor in-kamer-klank: {n}% (energiegemiddelde)',
  'Filter shape': 'Filtervorm',
  'Hard cap on EQ bands per driver the optimizer may spend — more bands = finer correction but a bigger search (and more passive components later)':
    'Harde limiet op EQ-banden per driver die de optimizer mag uitgeven — meer banden = fijnere correctie maar een grotere zoektocht (en later meer passieve onderdelen)',
  'Correction bands per driver (max)': 'Correctiebanden per driver (max)',
  'Preferred alignment for the LOW (woofer-mid) handover — binding: the designer picks the foundation, the optimizer keeps knees, level and polarity free. Auto = free choice from the library.':
    'Voorkeurs-alignment voor de LAGE (woofer-mid) overname — bindend: de ontwerper kiest het fundament, de optimizer houdt knieën, niveau en polariteit vrij. Auto = vrije keuze uit de bibliotheek.',
  'HP/LP preference (low xo)': 'HP/LP-voorkeur (lage xo)',
  'Preferred HP/LP alignment — binding: the designer picks the foundation, the optimizer designs the best crossover on it (knees, level, polarity and EQ stay free). Auto = free choice from the library.':
    'HP/LP-voorkeurs-alignment — bindend: de ontwerper kiest het fundament, de optimizer ontwerpt daarop de beste crossover (knieën, niveau, polariteit en EQ blijven vrij). Auto = vrije keuze uit de bibliotheek.',
  'HP/LP preference (high xo)': 'HP/LP-voorkeur (hoge xo)',
  'HP/LP preference': 'HP/LP-voorkeur',
  'Target ACOUSTIC slope of the mid above the crossing — the measured rolloff (driver + filter), not the electrical order. Falling short costs more than being steeper. Auto = free.':
    'Doel voor de AKOESTISCHE flank van de mid boven de overname — de gemeten afval (driver + filter), niet de elektrische orde. Tekortschieten kost meer dan steiler zijn. Auto = vrij.',
  'Acoustic slope mid LP (high xo)': 'Akoestische flank mid LP (hoge xo)',
  'Acoustic slope mid': 'Akoestische flank mid',
  "Target ACOUSTIC slope of the tweeter below the crossing — the classic 'acoustic 4th order at the tweeter' rule is 24 dB/oct. Check the result in 🎯 Targets. Auto = free.":
    "Doel voor de AKOESTISCHE flank van de tweeter onder de overname — de klassieke regel 'akoestisch 4e orde bij de tweeter' is 24 dB/oct. Controleer het resultaat in 🎯 Doelen. Auto = vrij.",
  'Acoustic slope tweeter': 'Akoestische flank tweeter',
  '3-way: target ACOUSTIC slope of the WOOFER above the low crossing (its LP flank). Auto = free.':
    '3-weg: doel voor de AKOESTISCHE flank van de WOOFER boven de lage overname (zijn LP-flank). Auto = vrij.',
  'Acoustic slope woofer (low xo)': 'Akoestische flank woofer (lage xo)',
  "3-way: target ACOUSTIC slope of the MID below the low crossing (its HP flank) — the mid's second flank.":
    '3-weg: doel voor de AKOESTISCHE flank van de MID onder de lage overname (zijn HP-flank) — de tweede flank van de mid.',
  'Acoustic slope mid HP (low xo)': 'Akoestische flank mid HP (lage xo)',
  'Staged design (step method): HP/LP structure first; EQ bands, Zobel/LCR networks and bypass caps are only added while the targets below are unmet — the fewest components that reach the goal, with a per-stage report.':
    'Getrapt ontwerpen (trapmethode): eerst de HP/LP-structuur; EQ-banden, Zobel/LCR-netwerken en bypass-caps komen er alleen bij zolang de doelen hieronder niet gehaald zijn — de minste onderdelen die het doel halen, met een rapport per trede.',
  'Use as few components as possible': 'Gebruik zo min mogelijk onderdelen',
  "'Good enough' targets: stop escalating once ripple (peak ±dB, the same number the SPL strip shows) AND average phase error (°) are both met — variable per project, this is the designer's call":
    "'Goed genoeg'-doelen: stop met escaleren zodra rimpel (piek ±dB, hetzelfde getal als in de SPL-strip) ÉN gemiddelde fasefout (°) beide gehaald zijn — variabel per project, dit is de keuze van de ontwerper",
  'a stopping point, not a limit — tighter means more parts and more money (it keeps escalating while unmet, and only prunes once met); looser stops sooner and builds simpler, but may leave performance on the table':
    'een stoppunt, geen plafond — strakker betekent meer onderdelen en meer geld (hij blijft escaleren zolang het doel niet gehaald is, en snoeit pas als het wél gehaald is); ruimer stopt eerder en bouwt eenvoudiger, maar kan prestatie laten liggen',
  'Safety nets': 'Vangnetten',
  'Stopband leakage beside the crossover must stay ≥20 dB below the combined — cone-breakup phase cannot be filtered away, it can only be made irrelevant in level':
    'Stopband-lekkage naast de crossover moet ≥20 dB onder de som blijven — conus-breakup-fase is niet weg te filteren, alleen in niveau irrelevant te maken',
  'Keep cone breakup ≥20 dB down': 'Houd conus-breakup ≥20 dB onderdrukt',
  'Snap the passive build to purchasable catalog values, simulated with their real DCR/ESR — the fit error against real parts becomes visible instead of assumed away':
    'Snap de passieve bouw op koopbare cataloguswaarden, gesimuleerd met hun echte DCR/ESR — de fit-fout tegen echte onderdelen wordt zichtbaar in plaats van weggenomen aangenomen',
  'Use real catalog parts': 'Gebruik echte catalogus-onderdelen',
  '(needs import)': '(vereist import)',
  'Pin the ACOUSTIC crossover: the frequency where the filtered drivers actually cross must land within frequency ± margin — in the design optimizer AND the component tuner. Margin 0 = exactly there (±2% search room remains).':
    'Pin de AKOESTISCHE crossover: de frequentie waar de gefilterde drivers elkaar écht kruisen moet binnen frequentie ± marge landen — in de ontwerp-optimizer ÉN de componenttuner. Marge 0 = precies daar (±2% zoekruimte blijft).',
  'Crossover points (low + high)': 'Crossover-punten (laag + hoog)',
  'Crossover point': 'Crossover-punt',
  "Hard floor for the tweeter's electrical HP knee: the classic ≥2×Fs rule, read from the measured impedance peak. Knee-domain — coexists with the crossover point.":
    'Harde vloer voor de elektrische HP-knie van de tweeter: de klassieke ≥2×Fs-regel, afgelezen uit de gemeten impedantiepiek. Knie-domein — bestaat naast het crossover-punt.',
  'tweeter kept above {n} Hz (2× its measured resonance)':
    'tweeter blijft boven {n} Hz (2× zijn gemeten resonantie)',
  'How many handover candidates the 3-way scan simulates PER crossing. Each candidate runs the full design chain inside its own slice of the search range, so the count is squared: 2 steps = 4 chains. Works pinned or unpinned — without a pin the range is the neighbourhood of the raw crossings.':
    'Hoeveel overname-kandidaten de 3-weg-scan PER overgang simuleert. Elke kandidaat draait de volledige ontwerpketen binnen zijn eigen deel van het zoekbereik, dus het aantal kwadrateert: 2 stappen = 4 ketens. Werkt gepind én vrij — zonder pin is het bereik de omgeving van de rauwe kruisingen.',
  'Handover candidates to try': 'Overname-kandidaten om te proberen',
  "The free scan derives both handover windows from the measurements themselves: floor = 2×Fs (measured impedance) and where the upper driver reaches its own level; ceiling = the lower driver's MEASURED beaming onset from the angle files (size-formula fallback without them). A pin is the designer's explicit override of its axis — the scan then searches the pin, not this window, and warns loudly when the physics cannot deliver it.":
    'De vrije scan leidt beide overname-vensters af uit de metingen zelf: vloer = 2×Fs (gemeten impedantie) en waar de bovenste driver zijn eigen niveau bereikt; plafond = het GEMETEN bundelpunt van de onderste driver uit de hoekbestanden (maat-formule als terugval). Een pin is de expliciete override van die as door de ontwerper — de scan doorzoekt dan de pin, niet dit venster, en waarschuwt luid als de fysica hem niet kan leveren.',
  'pinned — your pin overrides the derived window':
    'gepind — jouw pin overschrijft het afgeleide venster',
  'no room — these two cannot meet': 'geen ruimte — deze twee kunnen elkaar niet ontmoeten',
  '3-way: the LOW handover (woofer→mid) — the acoustic crossing must land within frequency ± margin, in the design chain AND the component tuner.':
    '3-weg: de LAGE overname (woofer→mid) — de akoestische kruising moet binnen frequentie ± marge landen, in de ontwerpketen ÉN de componenttuner.',
  low: 'laag',
  'The ACOUSTIC handover — where the filtered drivers actually cross — must land within frequency ± margin. The electrical knees stay free (with a hot tweeter they sit far above the acoustic crossing).':
    'De AKOESTISCHE overname — waar de gefilterde drivers elkaar écht kruisen — moet binnen frequentie ± marge landen. De elektrische knieën blijven vrij (met een hete tweeter liggen die ver boven de akoestische kruising).',
  high: 'hoog',
  'How many crossover candidates the scan simulates across the pinned range (evenly spaced, your pin always included). Every candidate runs the FULL design chain, so compute grows about linearly — the worker pool runs several at once, but 9 steps still takes a multiple of 3. More steps = a finer sweep of the handover region.':
    'Hoeveel crossover-kandidaten de scan over het gepinde bereik simuleert (gelijkmatig verdeeld, jouw pin doet altijd mee). Elke kandidaat draait de VOLLEDIGE ontwerpketen, dus rekentijd groeit ongeveer lineair — de worker-pool draait er meerdere tegelijk, maar 9 stappen kost nog steeds een veelvoud van 3. Meer stappen = een fijnere doorloop van het overnamegebied.',
  '{n} steps': '{n} stappen',
  runtime: 'runtime',
  'Driver limits': 'Drivergrenzen',
  "Woofer nominal size — sets the W-M handover's beaming CEILING (a cone is practically usable to ~3× its beaming onset), the mirror of the mid-size rule for the high crossing. With the 2×Fs floor from the measured mid impedance this gives the free scan a physics window instead of a guess.":
    'Nominale woofermaat — zet het bundel-PLAFOND van de W-M-overname (een conus is praktisch bruikbaar tot ~3× zijn bundelpunt), het spiegelbeeld van de mid-maat-regel voor de hoge overgang. Met de 2×Fs-vloer uit de gemeten mid-impedantie krijgt de vrije scan zo een fysica-venster in plaats van een gok.',
  'Woofer size (W-M ceiling)': 'Woofermaat (W-M-plafond)',
  'When a cone counts as beaming': 'Wanneer een conus als bundelend telt',
  "How many wavelengths of DRIVER SPACING the design tolerates. The spacing itself is derived from the driver positions you enter under Setup → Cabinet & drivers; two drivers half a wavelength apart already put a null in the vertical response. The sources genuinely disagree here and they optimise different things, so this is the designer's call.":
    'Hoeveel golflengten DRIVER-AFSTAND het ontwerp tolereert. De afstand zelf volgt uit de driverposities die je invult onder Setup → Kast & drivers; twee drivers een halve golflengte uiteen zetten al een nul in de verticale respons. De bronnen zijn het hier echt oneens en optimaliseren verschillende dingen, dus dit is de keuze van de ontwerper.',
  'Lobing: how strict': 'Lobing: hoe streng',
  'auto — from driver geometry': 'auto — uit de drivergeometrie',
  '0.25 — point source': '0,25 — puntbron',
  '0.5 — no forward null': '0,5 — geen voorwaartse nul',
  '1.2 — Saunisto (power response)': '1,2 — Saunisto (power response)',
  "Resolved per pair from the positions you entered: horizontally separated drivers lobe ACROSS the seats (strict, k 0.5 — no forward null); vertically separated ones lobe toward floor and ceiling, where Dickason's k 1.0 is the published anchor. Mixed axes interpolate. The explicit values remain as overrides.":
    'Per paar bepaald uit de posities die je invulde: horizontaal gescheiden drivers loberen ÓVER de zitplaatsen (streng, k 0,5 — geen voorwaartse nul); verticaal gescheiden drivers loberen naar vloer en plafond, waar Dickasons k 1,0 het gepubliceerde anker is. Gemengde assen interpoleren. De expliciete waarden blijven als overrides.',
  vertical: 'verticaal',
  horizontal: 'horizontaal',
  'enter driver positions to resolve': 'vul driverposities in om dit te bepalen',
  'enter driver positions to apply': 'vul driverposities in om dit toe te passen',
  'Cone breakup as an upper limit. A resonance at f_b is excited as the THIRD harmonic of a fundamental at f_b/3 (Purifi measured exactly this: breakups at 5 and 10 kHz produce HD3 peaks at 1.6 and 3.3 kHz), so the distortion penalty lands more than an octave BELOW the peak. A notch does not repair it — it attenuates the fundamental at the breakup, not the harmonics arriving there from lower fundamentals. NOTE: no published algorithm exists for finding breakup in an SPL curve; this is our own criterion, which is why it is switchable and the detected frequency is shown.':
    'Conus-breakup als bovengrens. Een resonantie op f_b wordt aangeslagen als DERDE harmonische van een grondtoon op f_b/3 (Purifi mat precies dit: breakups op 5 en 10 kHz geven HD3-pieken op 1,6 en 3,3 kHz), dus de vervormingsprijs landt ruim een octaaf ONDER de piek. Een notch repareert het niet — die dempt de grondtoon op de breakup, niet de harmonischen die er vanaf lagere grondtonen landen. NB: er bestaat geen gepubliceerd algoritme om breakup in een SPL-curve te vinden; dit is ons eigen criterium, en daarom is het uitschakelbaar en wordt de gevonden frequentie getoond.',
  'Stay this far below cone breakup': 'Blijf zo ver onder conus-breakup',
  off: 'uit',
  'f_b / 5 (HD5, hard cones)': 'f_b / 5 (HD5, harde conussen)',
  "The LEVEL this design must reach — the level-aware version of 'cross a tweeter at 2-3x Fs'. SPL = 108.4 + 20log(f²·Sd·Xmax) in half space, so a driver runs out of linear travel below f = sqrt(10^((L-108.4)/20)/(Sd·Xmax)) and the crossover floor moves up with the level you ask for. Sd and Xmax themselves are DRIVER FACTS and live on the Setup tab; this is the only part of the criterion that is a design decision.":
    "Het NIVEAU dat dit ontwerp moet halen — de niveau-bewuste versie van 'kruis een tweeter op 2-3× Fs'. SPL = 108,4 + 20log(f²·Sd·Xmax) in halve ruimte, dus een driver raakt door zijn lineaire slag heen onder f = √(10^((L−108,4)/20)/(Sd·Xmax)) en de crossover-vloer schuift omhoog met het niveau dat je vraagt. Sd en Xmax zelf zijn DRIVER-FEITEN en leven op de Setup-tab; dit is het enige deel van het criterium dat een ontwerpkeuze is.",
  'Design for': 'Ontwerp voor',
  'excursion floor: mid': 'excursievloer: mid',
  'Hz — from the Sd/Xmax on the Setup tab': 'Hz — uit de Sd/Xmax op de Setup-tab',
  'enter Sd and Xmax per driver on the Setup tab to use this criterion':
    'vul Sd en Xmax per driver in op de Setup-tab om dit criterium te gebruiken',
  '{a} bands = {b} search dimensions — slower, may need a second run':
    '{a} banden = {b} zoekdimensies — trager, heeft mogelijk een tweede run nodig',

  // ── Optimizer-samenvatting + Filter bands ────────────────────────────
  'Optimizer chose:': 'Optimizer koos:',
  polarity: 'polariteit',
  inverted: 'omgekeerd',
  normal: 'normaal',
  'EQ used:': 'EQ gebruikt:',
  ripple: 'rimpel',
  'phase error': 'fasefout',
  score: 'score',
  'power ripple': 'power-rimpel',
  rounds: 'rondes',
  sims: 'sims',
  'What each escalation stage of the staged design bought (ripple / phase after that stage)':
    'Wat elke escalatietrede van het getrapte ontwerp opleverde (rimpel / fase na die trede)',
  'Stages:': 'Treden:',
  'Show the per-driver filter bands (HP/LP/EQ)': 'Toon de filterbanden per driver (HP/LP/EQ)',
  'Hide the per-driver filter bands': 'Verberg de filterbanden per driver',
  'Filter bands': 'Filterbanden',
  muted: 'gedempt',
  Mid: 'Mid',
  flat: 'vlak',
  "Build mode is “Acoustic result”: EQ values here are seeds — a passive build re-tunes each enabled band's freq/gain/Q to flatten the measured driver. Switch to “Filter curve” to build exactly what you draw.":
    'Bouwmodus is "Akoestisch resultaat": EQ-waarden hier zijn startpunten — een passieve bouw hertuned freq/gain/Q van elke ingeschakelde band om de gemeten driver vlak te maken. Wissel naar "Filtercurve" om exact te bouwen wat je tekent.',

  // ── Passive synthesis ────────────────────────────────────────────────
  'Passive synthesis': 'Passieve synthese',
  'Builds YOUR drawn curve: the HP/LP knees and EQ bands above are the target, reproduced with real components on the measured impedances.':
    'Bouwt JOUW getekende curve: de HP/LP-knieën en EQ-banden hierboven zijn het doel, gereproduceerd met echte componenten op de gemeten impedanties.',
  'Re-designs while building: real components are fitted so the MEASURED driver comes out flat against the ideal HP/LP shape. Enabled EQ bands only grant correction slots (their freq/gain/Q are re-tuned) — the result deliberately differs from the virtual sim above.':
    'Herontwerpt tijdens het bouwen: echte componenten worden gefit zodat de GEMETEN driver vlak uitkomt tegen de ideale HP/LP-vorm. Ingeschakelde EQ-banden geven alleen correctiesloten (hun freq/gain/Q worden hertuned) — het resultaat wijkt bewust af van de virtuele sim hierboven.',
  'What this build optimises for — same setting as the dropdown next to Optimize':
    'Waar deze bouw voor optimaliseert — dezelfde instelling als de dropdown naast Optimize',
  "3-way: fits three branches on the measured impedances — woofer LP, mid BANDPASS (hp+lp), tweeter HP — and lands them as one network in a new 'Passive build' tab. Per-branch fits only: the assembled component tune (pairs) is a later step.":
    "3-weg: fit drie takken op de gemeten impedanties — woofer LP, mid BANDDOORLAAT (hp+lp), tweeter HP — en zet ze als één netwerk in een nieuwe 'Passive build'-tab. Alleen per-tak-fits: de componenttune op het geheel (paren) is een latere stap.",
  "Single-driver mode: build the solo topology from the enabled cut bands (series traps / shelf groups + gated Zobel) with textbook seed values — lands in a new 'Solo build' tab; ⚙ Optimize components fits the values":
    "Eén-driver-modus: bouw de solo-topologie uit de ingeschakelde cut-banden (serie-traps / shelf-groepen + gated Zobel) met textbook-startwaarden — landt in een nieuwe 'Solo build'-tab; ⚙ Optimaliseer componenten fit de waarden",
  "Fit real components and simulate the result — lands in a new 'Passive build' tab on the Network page. Follow up with ⚙ Optimize components there to tune the assembled sum (phase!).":
    "Fit echte componenten en simuleer het resultaat — landt in een nieuwe 'Passive build'-tab op de Netwerk-pagina. Ga daar verder met ⚙ Optimaliseer componenten om de opgebouwde som te tunen (fase!).",
  'Build passive filter': 'Bouw passief filter',
  'uses the priority setting from ⚙ Settings': 'gebruikt de prioriteit uit ⚙ Instellingen',
  'Midrange (bandpass)': 'Midrange (banddoorlaat)',
  branch: 'tak',
  'fit:': 'fit:',
  '(not converged — treat as rough)': '(niet geconvergeerd — beschouw als ruw)',
  'No network to edit yet — load measurements in the Import tab first.':
    'Nog geen netwerk om te bewerken — laad eerst metingen op de Import-tab.',
  'Hold the combined curve as a reference': 'Houd de som-curve vast als referentie',

  // ── FilterControls.tsx ───────────────────────────────────────────────
  'High-pass': 'Hoogdoorlaat',
  'Low-pass': 'Laagdoorlaat',
  'passes everything above': 'laat alles boven',
  'passes everything below': 'laat alles onder',
  'Enable the {filter} — {what} the corner frequency':
    'Schakel de {filter} in — {what} de kniefrequentie door',
  'Alignment: Linkwitz-Riley (−6 dB at the knee, sums flat with its mirror), Butterworth (−3 dB at the knee) or Bessel (−3 dB, maximally flat group delay — the gentle-phase choice)':
    'Alignment: Linkwitz-Riley (−6 dB op de knie, somt vlak met zijn spiegelbeeld), Butterworth (−3 dB op de knie) of Bessel (−3 dB, maximaal vlakke groepsvertraging — de zachte-fase-keuze)',
  'Steepness of the slope beyond the knee (order × 6 dB per octave)':
    'Steilheid van de flank voorbij de knie (orde × 6 dB per octaaf)',
  'Corner (knee) frequency — also draggable as the hollow dot on the SPL chart':
    'Kniefrequentie — ook te slepen als de holle stip in de SPL-grafiek',
  'Enable this EQ band — cut only (≤ 0 dB): a passive network cannot boost':
    'Schakel deze EQ-band in — alleen verzwakken (≤ 0 dB): een passief netwerk kan niet versterken',
  Peak: 'Piek',
  'Low shelf': 'Low shelf',
  'High shelf': 'High shelf',
  "Peak cuts around the frequency; shelves apply the cut below (low) or above (high) it — lowering everything except a band is how passive 'lifts' it":
    "Piek verzwakt rond de frequentie; shelves verzwakken eronder (low) of erboven (high) — alles verlagen behalve een band is hoe passief hem 'optilt'",
  'Centre frequency of this band — also draggable as the solid dot on the SPL chart':
    'Centrumfrequentie van deze band — ook te slepen als de volle stip in de SPL-grafiek',
  'Gain (cut only): a passive network cannot boost, so EQ bands may only attenuate (≤ 0 dB). Lower the level of the rest to lift a band.':
    'Gain (alleen verzwakken): een passief netwerk kan niet versterken, dus EQ-banden mogen alleen dempen (≤ 0 dB). Verlaag het niveau van de rest om een band op te tillen.',
  'Q = width: higher is narrower (1 ≈ 1.4 octave, 5 ≈ 0.3 octave) — scroll on the chart dot also adjusts this':
    'Q = breedte: hoger is smaller (1 ≈ 1,4 octaaf, 5 ≈ 0,3 octaaf) — scrollen op de grafiekstip past dit ook aan',
  'Remove this EQ band': 'Verwijder deze EQ-band',
  'Remove EQ band {n}': 'Verwijder EQ-band {n}',
  'Add another parametric EQ band for this driver':
    'Voeg nog een parametrische EQ-band toe voor deze driver',
  'Add EQ band': 'EQ-band toevoegen',
  'Overall level of this driver branch (attenuation only, ≤ 0 dB — passive networks cannot amplify): pad the louder driver down to balance':
    'Totaalniveau van deze drivertak (alleen verzwakking, ≤ 0 dB — passieve netwerken kunnen niet versterken): pad de luidste driver omlaag om te balanceren',
  Gain: 'Gain',

  // ── Timing-paneel, scan-tabel, modals, Compare-wizard, transient notes ──
  "Added LCR trap @ {hz} Hz on {model}: {l} mH · {c} µF · {r} Ω.": "LCR-trap toegevoegd @ {hz} Hz op {model}: {l} mH · {c} µF · {r} Ω.",
  "Layout tidied — notches sorted by frequency. Fine-tune with ⚙ Optimize components.": "Layout opgeruimd — notches gesorteerd op frequentie. Fijnslijpen met ⚙ Optimaliseer componenten.",
  "Fine-tune with ⚙ Optimize components; layout kept as-is (topology too exotic for the auto-placer).": "Fijnslijpen met ⚙ Optimaliseer componenten; layout ongewijzigd gelaten (topologie te exotisch voor de auto-placer).",
  "\"{name}\" carries no Crossover Studio format marker — not a saved project, catalog or filter file.": "\"{name}\" draagt geen Crossover Studio-formaatmarkering — geen opgeslagen project-, catalogus- of filterbestand.",
  "Mixed drop — drop measurement files (FRD/ZMA/LIM), or a .vxp set, or ONE project/catalog/filter file at a time.": "Gemengde drop — sleep meetbestanden (FRD/ZMA/LIM), of een .vxp-set, of ÉÉN project-/catalogus-/filterbestand tegelijk.",
  "Demo catalog loaded — {n} priced SKUs (snap, BOM and inspector use them)": "Democatalogus geladen — {n} geprijsde SKU's (snap, stuklijst en inspector gebruiken ze)",
  "File dialog returned no files. If you did select files, copy them to a local folder (e.g. Downloads) and try again.": "De bestandsdialoog gaf geen bestanden terug. Heb je wél bestanden gekozen, kopieer ze dan naar een lokale map (bv. Downloads) en probeer opnieuw.",
  "Reading {n} file(s): {names}…": "{n} bestand(en) lezen: {names}…",
  "{n} crossover variant(s)": "{n} crossover-variant(en)",
  "\"{name}\" was loaded as the verification measurement, but its levels look like an impedance file (median ≈ {z} Ω) — the comparison below will be meaningless.": "\"{name}\" is geladen als verificatiemeting, maar de niveaus lijken op een impedantiebestand (mediaan ≈ {z} Ω) — de vergelijking hieronder wordt betekenisloos.",
  "\"{name}\" carries no phase. A near-field splice without phase would plant an unknown delay step at the crossover — measure it with a timing reference.": "\"{name}\" draagt geen fase. Een nabij-veld-splice zonder fase zou een onbekende delay-stap precies op de crossover planten — meet hem met een tijdreferentie.",
  "\"{name}\" looks like an impedance file (median ≈ {z} Ω), not a response.": "\"{name}\" lijkt op een impedantiebestand (mediaan ≈ {z} Ω), geen responsie.",
  "Loaded {name}": "{name} geladen",
  "Restored from autosave": "Hersteld uit autosave",
  "Autosave could not be restored — kept aside as backup": "Autosave kon niet hersteld worden — apart gezet als back-up",
  "Catalog updated — {n} exact SKUs active": "Catalogus bijgewerkt — {n} exacte SKU's actief",
  "{n} series switched off": "{n} series uitgezet",
  "(snap, BOM and inspector use them)": "(snap, stuklijst en inspector gebruiken ze)",
  "Imported catalog {name} — series available in the editor inspector": "Catalogus {name} geïmporteerd — series beschikbaar in de editor-inspector",
  "Report exported — printable (A4), and it is also a filter file: Import filter accepts it back.": "Rapport geëxporteerd — printbaar (A4), en het is óók een filterbestand: Importeer filter leest het terug.",
  "Nothing to export: a VituixCAD variant needs exactly one generator (source), and no tab qualifies{skipped}. Add a generator to the network first.": "Niets te exporteren: een VituixCAD-variant heeft precies één generator (bron) nodig en geen enkele tab voldoet{skipped}. Voeg eerst een generator aan het netwerk toe.",
  "Exported folder “{base}/” — {vxp} + {n} measurement file(s) ({variants}). {bridge}. Open {vxp} in VituixCAD.": "Map “{base}/” geëxporteerd — {vxp} + {n} meetbestand(en) ({variants}). {bridge}. Open {vxp} in VituixCAD.",
  "Note: no {list} on record.": "NB: geen {list} bekend.",
  "Exported {vxp} ({variants}).": "{vxp} geëxporteerd ({variants}).",
  "This browser can’t write folders — place the measurement files next to it manually: {list}. (Chrome/Edge export the whole folder in one go.)": "Deze browser kan geen mappen schrijven — plaats de meetbestanden er handmatig naast: {list}. (Chrome/Edge exporteren de hele map in één keer.)",
  "Imported filter {name}": "Filter {name} geïmporteerd",
  "(layout tidied)": "(layout opgeruimd)",
  "Stop the run — nothing is committed, your design stays as it was": "Stop de run — er wordt niets vastgelegd, je ontwerp blijft zoals het was",
  "Measurement": "Meting",
  "Verdict": "Oordeel",
  "Compare wizard — model vs measurement": "Vergelijk-wizard — model vs meting",
  "Compare — model vs measurement": "Vergelijk — model vs meting",
  "Step {a} of {b}": "Stap {a} van {b}",
  "— the comparison judges the simulated Combined of the ACTIVE network tab, so that tab must be the design you actually built.": "— de vergelijking beoordeelt de gesimuleerde som van de ACTIEVE netwerk-tab, dus die tab moet het ontwerp zijn dat je echt gebouwd hebt.",
  "A network design exists": "Er bestaat een netwerkontwerp",
  "active:": "actief:",
  "Import one (Network → Import filter / Import variant) or rebuild the physical build with New from template + the editor.": "Importeer er een (Netwerk → Importeer filter / Importeer variant) of bouw de fysieke build na met Nieuw uit sjabloon + de editor.",
  "\"Use in simulation\" is on — otherwise the sim shows the virtual filters, not your network.": "\"Gebruik in simulatie\" staat aan — anders toont de sim de virtuele filters, niet jouw netwerk.",
  "Rebuilding what is physically on the bench? Enter the MEASURED component values in the inspector — that difference (design vs solder) is often the first thing this comparison exposes.": "Bouw je na wat er fysiek op de werkbank ligt? Vul de GEMETEN componentwaarden in de inspector in — dat verschil (ontwerp vs soldeer) is vaak het eerste dat deze vergelijking blootlegt.",
  "— the simulation is measured drivers × your network, so the driver files must be the same measurements the design was made with.": "— de simulatie is gemeten drivers × jouw netwerk, dus de driverbestanden moeten dezelfde metingen zijn waarmee het ontwerp gemaakt is.",
  "response (FRD)": "responsie (FRD)",
  "impedance (ZMA/LIMP)": "impedantie (ZMA/LIMP)",
  "Single-driver validation (one driver through its network) is fine: load just that driver and the app runs in solo mode.": "Eén-driver-validatie (één driver door zijn netwerk) kan prima: laad alleen die driver en de app draait in solo-modus.",
  "— measure the BUILT system with the same rig as the driver measurements (same gate, same mic position discipline), export as FRD with phase, and load it here.": "— meet het GEBOUWDE systeem met dezelfde opstelling als de drivermetingen (zelfde gate, zelfde mic-positie-discipline), exporteer als FRD met fase, en laad hem hier.",
  "Replace measurement…": "Vervang meting…",
  "Load measurement (FRD)…": "Laad meting (FRD)…",
  "Remove": "Verwijderen",
  "Level and mic distance do NOT need to match the sim — the comparison aligns level (median) and fits the mic delay out of the phase, and shows both numbers instead of hiding them.": "Niveau en mic-afstand hoeven NIET met de sim overeen te komen — de vergelijking lijnt het niveau uit (mediaan) en fit de mic-delay uit de fase weg, en toont beide getallen in plaats van ze te verbergen.",
  "— judged over the visible SPL range (zoom the chart to change the band being graded).": "— beoordeeld over het zichtbare SPL-bereik (zoom de grafiek om de beoordeelde band te wijzigen).",
  "No comparison yet —": "Nog geen vergelijking —",
  "the simulation has no result (check steps 1–2).": "de simulatie heeft geen resultaat (controleer stap 1–2).",
  "load a verification measurement in step 3.": "laad een verificatiemeting in stap 3.",
  "Magnitude": "Magnitude",
  "avg": "gem",
  "worst": "slechtste",
  "at": "op",
  "band": "band",
  "level-aligned": "niveau-uitgelijnd",
  "residual avg": "residu gem",
  "fitted mic delay": "gefitte mic-delay",
  "offset ≈ 180° — the build is likely wired INVERTED vs the sim": "offset ≈ 180° — de build is waarschijnlijk OMGEKEERD aangesloten t.o.v. de sim",
  "Measurement carries no phase column — magnitude verdict only.": "De meting draagt geen fasekolom — alleen een magnitude-oordeel.",
  "Done — show the charts": "Klaar — toon de grafieken",
  "Add LCR notch (trap)": "LCR-notch toevoegen (trap)",
  "A series L–C–R across the driver — a low-impedance path at the centre frequency that sucks out a peak.": "Een serie-L–C–R over de driver — een laag-impedant pad op de centrumfrequentie dat een piek wegzuigt.",
  "Depth": "Diepte",
  "sets R,": "bepaalt R,",
  "sets the L/C ratio; the values follow from the measured impedance. It goes in live — fine-tune afterwards with ⚙ Optimize components.": "bepaalt de L/C-verhouding; de waarden volgen uit de gemeten impedantie. Hij gaat er live in — fijnslijpen daarna met ⚙ Optimaliseer componenten.",
  "Centre": "Centrum",
  "Enter a centre frequency and a": "Vul een centrumfrequentie in en een",
  "negative": "negatieve",
  "depth (a cut) — passive can only notch a peak, not boost.": "diepte (een cut) — passief kan alleen een piek wegnotchen, niet versterken.",
  "Add trap": "Trap toevoegen",
  "Design targets — virtual to acoustic": "Ontwerpdoelen — virtueel naar akoestisch",
  "Design targets — virtual → acoustic": "Ontwerpdoelen — virtueel → akoestisch",
  "The virtual target design the last passive build was fitted to (acoustic mode fits measured driver × filter against these ideal shapes).": "Het virtuele doelontwerp waar de laatste passieve build tegen gefit is (acoustic-modus fit gemeten driver × filter tegen deze ideale vormen).",
  "Woofer / mid target:": "Woofer/mid-doel:",
  "no LP": "geen LP",
  "gain": "gain",
  "Tweeter target:": "Tweeter-doel:",
  "no HP": "geen HP",
  "polarity inverted": "polariteit omgekeerd",
  "Measured on the current sim:": "Gemeten op de huidige sim:",
  "acoustic crossover": "akoestische kruising",
  "mid falls ≈ {n} dB/oct above it (≈ {ord}-order acoustic)": "mid valt ≈ {n} dB/oct erboven af (≈ {ord}-orde akoestisch)",
  "tweeter falls ≈ {n} dB/oct below it (≈ {ord}-order acoustic)": "tweeter valt ≈ {n} dB/oct eronder af (≈ {ord}-orde akoestisch)",
  "Close": "Sluiten",
  "Combined SPL & relative phase — woofer normalised to 0°, tweeter shown against it.": "Gesommeerde SPL & relatieve fase — woofer genormaliseerd op 0°, tweeter daartegen getoond.",
  "Where the driver levels meet, per adjacent pair: woofer-mid / mid-tweeter": "Waar de driverniveaus elkaar ontmoeten, per aangrenzend paar: woofer-mid / mid-tweeter",
  "Mode": "Modus",
  "Layout": "Layout",
  "Language": "Taal",
  "Theme": "Thema",
  "Design steps": "Ontwerpstappen",
  "Design panels": "Ontwerp-panelen",
  "Remove the {title} cone near-field measurement": "Verwijder de {title}-conus-nabij-veldmeting",
  "Remove the {title} port near-field measurement": "Verwijder de {title}-poort-nabij-veldmeting",
  "Free note for this file — autosaved and included in the project file": "Vrije notitie bij dit bestand — autosaved en opgenomen in het projectbestand",
  "autosaves locally on every change": "autosavet lokaal bij elke wijziging",
  "Crossover (VituixCAD project)": "Crossover (VituixCAD-project)",
  "Variant": "Variant",
  "None (raw drivers)": "Geen (rauwe drivers)",
  "Crossover error:": "Crossover-fout:",
  "Simulate one of the crossover variants from the imported VituixCAD project (solved on the measured impedances). 'None' shows the raw drivers.": "Simuleer een van de crossover-varianten uit het geïmporteerde VituixCAD-project (opgelost op de gemeten impedanties). 'Geen' toont de rauwe drivers.",
  "Timing sanity check": "Timing-sanity-check",
  "Woofer delay": "Woofer-delay",
  "Tweeter delay": "Tweeter-delay",
  "Apparent mic distance": "Schijnbare mic-afstand",
  "woofer / tweeter — incl. common latency": "woofer / tweeter — incl. gedeelde latency",
  "Acoustic-centre Δ": "Akoestisch-centrum-Δ",
  "tweeter later = positive": "tweeter later = positief",
  "further from": "verder van",
  "closer to": "dichter bij",
  "Split of that Δ:": "Splitsing van die Δ:",
  "{us} µs is the measuring RIG — at {dist} mm the upper driver sits {mm} mm {dir} the microphone than the lower one, purely because they are at different heights.": "{us} µs is de MEETOPSTELLING — op {dist} mm zit de bovenste driver {mm} mm {dir} de microfoon dan de onderste, puur doordat ze op verschillende hoogtes zitten.",
  "Another": "Nog eens",
  "is MOUNTING DEPTH: the cabinet puts one cone further back": "is MONTAGEDIEPTE: de kast zet één conus verder naar achteren",
  "({drivers} does not radiate from the front baffle)": "({drivers} straalt niet vanaf het front)",
  ", which the drawing already explains and the drivers should not be blamed for.": ", wat de tekening al verklaart en de drivers niet aangerekend mag worden.",
  "The remaining": "De resterende",
  "is the acoustic centres, and only that part is a property of the drivers.": "is de akoestische centra, en alleen dát deel is een eigenschap van de drivers.",
  "(Taken from the excess-phase Δ, the honest one for depth.)": "(Genomen uit de excess-fase-Δ, de eerlijke maat voor diepte.)",
  "The rig share shrinks with distance — which is why a sum aligned at the microphone is not aligned at the seat.": "Het opstellingsaandeel krimpt met afstand — en daarom is een som die bij de microfoon is uitgelijnd dat bij de stoel niet.",
  "Woofer→mid rig share:": "Woofer→mid opstellingsaandeel:",
  "mounting": "montage",
  "Position and measurement disagree.": "Positie en meting spreken elkaar tegen.",
  "For {drivers}, the oblique path from a mic at {dist} mm to a driver at that height already accounts for MORE delay than the measurement found — no mounting depth can explain the rest, because that would put the cone in front of the baffle. Check the height you typed, or the time reference of the sweeps.": "Voor {drivers} verklaart de schuine weg van een mic op {dist} mm naar een driver op die hoogte al MEER vertraging dan de meting vond — geen enkele montagediepte kan de rest verklaren, want dan zou de conus vóór het front staan. Controleer de ingetypte hoogte, of de tijdreferentie van de sweeps.",
  "and": "en",
  "Measured mounting depth:": "Gemeten montagediepte:",
  "midrange": "midrange",
  "woofer": "woofer",
  "behind the shallowest. Derived from the excess-phase delay with the rig's own geometry removed, so it is what the drivers actually do rather than what the drawing says.": "achter de ondiepste. Afgeleid uit de excess-fase-delay met de eigen geometrie van de opstelling eruit, dus het is wat de drivers écht doen in plaats van wat de tekening zegt.",
  "Write these into the Mounting depth fields. Note what it costs: the timing split then explains itself by construction, so the residual stops being an independent check on your measurement. It still sharpens the geometry — true off-axis angle, centre-to-centre spacing — which does not depend on the delay at all.": "Schrijf deze in de montagediepte-velden. Weet wat het kost: de timing-splitsing verklaart zichzelf dan per constructie, dus het residu is geen onafhankelijke controle op je meting meer. De geometrie (ware hoek, hart-op-hart) wordt er wél scherper van — en die hangt niet van de delay af.",
  "use as mounting depth": "gebruik als montagediepte",
  "With a depth already entered this is a CROSS-CHECK: if the two disagree, either the drawing or the measurement is wrong.": "Met een al ingevulde diepte is dit een KRUISCONTROLE: wijken de twee af, dan klopt de tekening of de meting niet.",
  "The residual the seat correction would remove, expressed in degrees at the highest handover — a time shift is only as harmful as the frequency it lands on. Same 1/R geometry as the far-field rule, so measuring far enough away fixes both at once.": "Het residu dat de stoel-correctie zou weghalen, uitgedrukt in graden op de hoogste overname — een tijdverschuiving is maar zo schadelijk als de frequentie waarop hij landt. Zelfde 1/R-meetkunde als de ver-veld-regel, dus ver genoeg weg meten lost beide tegelijk op.",
  "✓ Measuring distance is far enough": "✓ De meetafstand is ver genoeg",
  "△ Measuring distance is borderline": "△ De meetafstand is een grensgeval",
  "⚠ Measuring distance is shaping the design": "⚠ De meetafstand vormt je ontwerp",
  "— moving from the microphone to the listening seat would shift the branches by": "— van de microfoon naar de luisterplek verhuizen zou de takken verschuiven met",
  "which is": "en dat is",
  "at the": "op de",
  "handover": "overname",
  "Nothing to correct — leave the re-timing off.": "Niets te corrigeren — laat de re-timing uit.",
  "Measuring further away fixes this at the source (it is the same geometry the far-field rule describes); the re-timing below is the fallback when the room or a tall cabinet will not allow it.": "Verder weg meten lost dit bij de bron op (het is dezelfde meetkunde als de ver-veld-regel); de re-timing hieronder is de terugval als de kamer of een hoge kast dat niet toelaat.",
  "Seat re-timing ACTIVE: branches shifted by": "Stoel-re-timing ACTIEF: takken verschoven met",
  "— the sum now shows the listening position, not the microphone.": "— de som toont nu de luisterplek, niet de microfoon.",
  "Re-time each branch from the MEASURING distance to the LISTENING distance. The oblique path from a mic at close range to a driver at a different height is longer than it will be at the seat, so a sum aligned at the microphone drifts. Needs driver positions, mic distance and listening distance; measured phase only (minimum phase has already discarded the arrival times).": "Her-time elke tak van de MEET-afstand naar de LUISTER-afstand. De schuine weg van een mic dichtbij naar een driver op een andere hoogte is langer dan hij bij de stoel zal zijn, dus een som die bij de microfoon is uitgelijnd drijft weg. Vereist driverposities, mic-afstand en luisterafstand; alleen gemeten fase (minimum-fase heeft de aankomsttijden al weggegooid).",
  "Re-time to the listening distance": "Her-time naar de luisterafstand",
  "(measured phase only)": "(alleen gemeten fase)",
  "— needs driver positions, mic distance and listening distance (Cabinet)": "— vereist driverposities, mic-afstand en luisterafstand (Kast)",
  "VituixCAD equivalent (Minimum phase ON): give the": "VituixCAD-equivalent (Minimum phase AAN): geef de",
  "a Delay of": "een Delay van",
  ", the other driver 0 — this is the EXCESS-phase Δ (measured − minimum phase), the value a minimum-phase reconstruction needs. NB: it can differ from the raw Δ above in size AND sign (the raw fit absorbs each driver’s minimum-phase slope). The .vxp export fills this in automatically.": ", de andere driver 0 — dit is de EXCESS-fase-Δ (gemeten − minimum-fase), de waarde die een minimum-fase-reconstructie nodig heeft. NB: hij kan van de rauwe Δ hierboven verschillen in grootte ÉN teken (de rauwe fit absorbeert de minimum-fase-helling van elke driver). De .vxp-export vult dit automatisch in.",
  "VituixCAD equivalent: use the .vxp export — it derives the bridge delays.": "VituixCAD-equivalent: gebruik de .vxp-export — die leidt de brug-delays af.",
  "Only the DIFFERENCE matters — never enter the shared ~{us} µs bulk delay.": "Alleen het VERSCHIL telt — vul nooit de gedeelde ~{us} µs bulk-delay in.",
  "Nothing to design yet — load measurements in the Import tab first.": "Nog niets te ontwerpen — laad eerst metingen op de Import-tab.",
  "✓ Shared time reference plausible": "✓ Gedeelde tijdreferentie plausibel",
  "✗ Time bases disagree": "✗ Tijdbases spreken elkaar tegen",
  "⚠ Cannot judge (fit not delay-like)": "⚠ Niet te beoordelen (fit niet delay-achtig)",
  "Pick VituixCAD's FILTERED woofer AND tweeter response (2 files) to compare phase.": "Kies VituixCADs GEFILTERDE woofer- ÉN tweeterresponsie (2 bestanden) om fase te vergelijken.",
  "The overlay lives in the SPL chart, the phase residual in the Phase chart — flat at 0° means the model's phase is right where it matters.": "De overlay staat in de SPL-grafiek, het faseresidu in de fase-grafiek — vlak op 0° betekent dat de fase van het model klopt waar het telt.",
  "Electrical component count ≠ acoustic order: the driver's own rolloff and impedance stack on top of the network, and acoustic-mode synthesis exploits that. The measured slopes above are the real (acoustic) orders.": "Elektrisch aantal onderdelen ≠ akoestische orde: de eigen afval en impedantie van de driver stapelen bovenop het netwerk, en de acoustic-modus-synthese buit dat uit. De gemeten flanken hierboven zijn de echte (akoestische) ordes.",
  "Export ALL network tabs as a VituixCAD project folder — the .vxp (each tab a crossover variant CROSSOVER, CROSSOVER1, …) PLUS every measurement/impedance file, written together so VituixCAD opens it without hunting. Pick a folder when asked (Chrome/Edge). VituixCAD reconstructs the phase itself (MinimumPhase=True) and every driver carries its measured excess-phase delay (earliest driver 0), so its simulation matches ours — two-way and three-way alike.": "Exporteer ALLE netwerk-tabs als VituixCAD-projectmap — de .vxp (elke tab een crossover-variant CROSSOVER, CROSSOVER1, …) PLUS elk meet-/impedantiebestand, samen weggeschreven zodat VituixCAD hem opent zonder zoeken. Kies een map wanneer erom gevraagd wordt (Chrome/Edge). VituixCAD reconstrueert de fase zelf (MinimumPhase=True) en elke driver draagt zijn gemeten excess-fase-delay (vroegste driver 0), dus zijn simulatie komt met de onze overeen — twee- én driewegs.",
  "Directivity philosophy for the MEASURED beaming ceiling — the on-axis minus 30° difference at which a driver counts as beaming. Default is the empirical 4 dB, NOT the theoretically stricter ka = 2, and that is deliberate: the ka figures come from an ideal piston in an infinite baffle, while a real measured 0−30° difference at low frequency is mostly baffle diffraction. Measured on a real 3-way set, ka = 2 puts the woofer's ceiling at 304 Hz — below the mid's own 2×Fs floor — declaring an ordinary design impossible; 4 dB gives 628 Hz. The strict tiers stay available for a conservative philosophy or clean anechoic data. (For reference: '−6 dB at 30°' is ka = 4.43, past every published limit — that defines BEAMWIDTH, not a crossover ceiling.)": "Directiviteitsfilosofie voor het GEMETEN bundelplafond — het 0°-minus-30°-verschil waarbij een driver als bundelend telt. Standaard is de empirische 4 dB, NIET de theoretisch strengere ka = 2, en dat is bewust: de ka-getallen komen van een ideale zuiger in een oneindig scherm, terwijl een echt gemeten 0−30°-verschil bij lage frequenties vooral baffle-diffractie is. Gemeten op een echte 3-weg-set legt ka = 2 het wooferplafond op 304 Hz — onder de eigen 2×Fs-vloer van de mid — en verklaart zo een doodgewoon ontwerp onmogelijk; 4 dB geeft 628 Hz. De strenge niveaus blijven kiesbaar voor een conservatieve filosofie of schone anechoïsche data. (Ter referentie: '−6 dB op 30°' is ka = 4,43, voorbij élke gepubliceerde grens — dat definieert BEAMWIDTH, geen kruisplafond.)",
  "crossover": "crossover",
  "peak": "piek",
  "phase": "fase",
  "Sort by this column — ascending, descending, then back to the ranking order (🏆 first)": "Sorteer op deze kolom — oplopend, aflopend, en dan terug naar de ranking-volgorde (🏆 eerst)",
  "This candidate is loaded in Working": "Deze kandidaat is geladen in Working",
  "Load the {label} design into Working (undo-able)": "Laad het {label}-ontwerp in Working (ongedaan te maken)",
  "Peak ±dB — the worst single spot (what the staged targets gate on)": "Piek ±dB — de slechtste plek (waar de staged-doelen op poorten)",
  "Whole-range average |deviation| — the number the ranking judges on: one narrow dip doesn't decide the winner": "Hele-bereik-gemiddelde |afwijking| — het getal waar de ranking op oordeelt: één smalle dip beslist de winnaar niet",
  "Delivered overlap width per pair (2-way rows do not carry it)": "Geleverde overlapbreedte per paar (2-weg-rijen dragen hem niet)",
  "A delivered crossing sits OUTSIDE its physics window (pin or measured beaming/lobing bound) — off-axis this is a different loudspeaker, so it ranks below every candidate inside the window": "Een geleverde kruising ligt BUITEN zijn fysica-venster (pin of gemeten bundel-/lobing-grens) — off-axis is dit een andere luidspreker, dus hij rankt onder élke kandidaat binnen het venster",
  "Delivered overlap width per pair, octaves (W-M / M-T) — how long both cones carry a region together; the phase-coherent integration bandwidth": "Geleverde overlapbreedte per paar, octaven (W-M / M-T) — hoe lang beide conussen een gebied samen dragen; de fase-coherente integratie-bandbreedte",
  "Minimum system impedance was not measured for this candidate": "Minimale systeemimpedantie is voor deze kandidaat niet gemeten",
  "The amplifier sees {z} Ω at its worst — below the {floor} Ω floor, so this candidate ranks below every one with a sane load, however flat it is": "De versterker ziet op zijn slechtst {z} Ω — onder de {floor} Ω-vloer, dus deze kandidaat rankt onder élke kandidaat met een gezonde last, hoe vlak hij ook is",
  "Minimum system impedance the amplifier sees (floor {floor} Ω)": "Minimale systeemimpedantie die de versterker ziet (vloer {floor} Ω)",
  "Compare {n} designs — score · phase · Z · parts · BOM": "Vergelijk {n} ontwerpen — score · fase · Z · onderdelen · stuklijst",
  "Every saved design measured through the same pipeline as the live simulation. The ghost curves show shape; this shows the numbers. Click a row to switch to that design.": "Elk opgeslagen ontwerp gemeten door dezelfde pijplijn als de live simulatie. De ghost-curves tonen vorm; dit toont de cijfers. Klik een rij om naar dat ontwerp te wisselen.",
  "design": "ontwerp",
  "response": "respons",
  "avg / peak": "gem / piek",
  "parts": "onderdelen",
  "This design is open": "Dit ontwerp staat open",
  "Switch to {name}": "Wissel naar {name}",
  "Worst of the two handovers": "Slechtste van de twee overnames",
  "Minimum system impedance (amplifier floor {floor} Ω)": "Minimale systeemimpedantie (versterkervloer {floor} Ω)",
  "Overwrite \"{name}\" with the active design and switch to it (⌘S)": "Overschrijf \"{name}\" met het actieve ontwerp en spring ernaartoe (⌘S)",
  "This IS the saved filter — edits are live, nothing to save": "Dit ÍS het opgeslagen filter — bewerkingen zijn live, niets op te slaan",
  "No saved filter yet — use Save as new first": "Nog geen opgeslagen filter — gebruik eerst Opslaan als nieuw",
  "Save": "Opslaan",
  "Save the active design under a NEW name and switch to that saved tab — the tab you came from stays as a ghost to compare against": "Sla het actieve ontwerp op onder een NIEUWE naam en spring naar die tab — de tab waar je vandaan kwam blijft als ghost om tegen te vergelijken",
  "Save as new": "Opslaan als nieuw",
  "Filter name": "Filternaam",
  "Save (Enter)": "Opslaan (Enter)",
  "Cancel (Esc)": "Annuleren (Esc)",
  "{n} components": "{n} componenten",
  "priced": "geprijsd",
  "no prices in catalog yet": "nog geen prijzen in de catalogus",
  "{n} without exact catalog match": "{n} zonder exacte catalogus-match",
  "no exact catalog value": "geen exacte cataloguswaarde",
  "Resize the design and chart panes — arrow keys adjust, Home resets": "Verander de breedte van de panelen — pijltjestoetsen passen aan, Home herstelt",
  "Drag to resize the panes — double-click to reset to automatic width": "Sleep om de panelen te verbreden — dubbelklik voor automatische breedte",
  "Pin the SPL chart to the top": "Zet de SPL-grafiek bovenaan vast",
  "Normalized: each frequency relative to its own 0° level (pure beamwidth). Absolute: relative to the loudest point (level and directivity together).": "Genormaliseerd: elke frequentie t.o.v. zijn eigen 0°-niveau (pure bundelbreedte). Absoluut: t.o.v. het luidste punt (niveau en directiviteit samen).",
  "Click to activate, double-click to rename": "Klik om te activeren, dubbelklik om te hernoemen",
  "Delete tab \"{name}\"?": "Tab \"{name}\" verwijderen?",
  "Delete \"{name}\"": "Verwijder \"{name}\"",
  "Delete tab \"{name}\"": "Verwijder tab \"{name}\"",
  "Full-chain crossover scan — click a row to load that candidate's complete design (filters + tuned network) into Working; click a header to sort": "Volledige-keten-crossoverscan — klik een rij om het complete ontwerp van die kandidaat (filters + getuned netwerk) in Working te laden; klik een kolomkop om te sorteren",

  // ── Schema-editor, Catalogusbeheer, Meetgids, Handleiding-chrome ──
  "Select / drag": "Selecteren / slepen",
  "Click to select, drag to move (wires follow)": "Klik om te selecteren, sleep om te verplaatsen (draden volgen)",
  "Draw wire": "Draad tekenen",
  "Click two points; wires connect at their points": "Klik twee punten; draden verbinden op hun punten",
  "Place an inductor (with DCR)": "Plaats een spoel (met DCR)",
  "Place a capacitor (with ESR)": "Plaats een condensator (met ESR)",
  "Place a resistor": "Plaats een weerstand",
  "Place a driver (measured Z)": "Plaats een driver (gemeten Z)",
  "Place a generator": "Plaats een generator",
  "Place a ground symbol": "Plaats een aardsymbool",
  "Lock every component — the component optimizer may change none of them": "Vergrendel elk component — de componentoptimizer mag er geen enkele wijzigen",
  "all": "alles",
  "Unlock every component — the component optimizer may change all of them": "Ontgrendel elk component — de componentoptimizer mag ze allemaal wijzigen",
  "Undo the last edit (Cmd/Ctrl+Z)": "Maak de laatste bewerking ongedaan (Cmd/Ctrl+Z)",
  "Undo": "Ongedaan",
  "Redo the undone edit (Cmd/Ctrl+Shift+Z)": "Herhaal de ongedaan gemaakte bewerking (Cmd/Ctrl+Shift+Z)",
  "Redo": "Opnieuw",
  "click the end point": "klik het eindpunt",
  "click the start point": "klik het startpunt",
  "click to place": "klik om te plaatsen",
  "Esc = cancel · Del = remove · R = rotate": "Esc = annuleren · Del = verwijderen · R = roteren",
  "Schematic editor": "Schema-editor",
  "Estimate DCR for a 1.4 mm air-core coil of this value": "Schat de DCR van een 1,4 mm-luchtspoel van deze waarde",
  "auto DCR": "auto-DCR",
  "model": "model",
  "invert": "omkeren",
  "Product series (brand choice) — suggestions come from this series": "Productserie (merkkeuze) — suggesties komen uit deze serie",
  "All series": "Alle series",
  "Every nearby catalog part in this scope — all values, gauge variants and prices; picking one applies it": "Elk nabijgelegen catalogusonderdeel binnen deze scope — alle waarden, diktevarianten en prijzen; kiezen past hem toe",
  "all {n} parts…": "alle {n} onderdelen…",
  "apply value +": "pas waarde toe +",
  "Locked: the component optimizer keeps this value (e.g. a part you already own)": "Vergrendeld: de componentoptimizer houdt deze waarde (bv. een onderdeel dat je al hebt)",
  "lock": "vergrendel",
  "Rotate 90° (shortcut: R) — terminals get stub wires, connections never break": "Roteer 90° (sneltoets: R) — aansluitingen krijgen stompdraadjes, verbindingen breken nooit",
  "Rotate": "Roteren",
  "Remove this part (shortcut: Del) — its wires stay": "Verwijder dit onderdeel (sneltoets: Del) — zijn draden blijven",
  "Delete": "Verwijderen",
  "↑/↓ steps through E12 values (1.0, 1.2, 1.5, 1.8, 2.2 …)": "↑/↓ stapt door E12-waarden (1,0 · 1,2 · 1,5 · 1,8 · 2,2 …)",
  "Discard unsaved catalog changes?": "Niet-opgeslagen cataloguswijzigingen weggooien?",
  "Catalog manager": "Catalogusbeheer",
  "Exact purchasable parts (values, DCR/ESR, prices)": "Exacte koopbare onderdelen (waarden, DCR/ESR, prijzen)",
  "Product-series definitions: value range, E-grid, gauges, price model — the generated grids": "Productserie-definities: waardebereik, E-rooster, draaddiktes, prijsmodel — de gegenereerde roosters",
  "Series": "Series",
  "Search SKU / brand / series…": "Zoek SKU / merk / serie…",
  "Search series / brand…": "Zoek serie / merk…",
  "Filter by component kind": "Filter op componentsoort",
  "All kinds": "Alle soorten",
  "L — coils": "L — spoelen",
  "C — caps": "C — condensatoren",
  "R — resistors": "R — weerstanden",
  "Close (Esc)": "Sluiten (Esc)",
  "Close the catalog manager": "Sluit het catalogusbeheer",
  "{n} exact SKUs · {p} priced — edits stay in this panel until you save.": "{n} exacte SKU's · {p} geprijsd — bewerkingen blijven in dit paneel tot je opslaat.",
  "No imported catalog yet: add SKUs here or import a catalog file first.": "Nog geen geïmporteerde catalogus: voeg hier SKU's toe of importeer eerst een catalogusbestand.",
  "{n} series shown · {o} custom/override — a series is a value GRID (range × E-steps); editing a built-in saves an override with the same id, removing the override brings the built-in back.": "{n} series getoond · {o} eigen/override — een serie is een waardeROOSTER (bereik × E-stappen); een ingebouwde bewerken bewaart een override met hetzelfde id, de override verwijderen brengt de ingebouwde terug.",
  "Brand": "Merk",
  "Value": "Waarde",
  "Coil DCR / cap ESR (Ω)": "Spoel-DCR / cap-ESR (Ω)",
  "Coil wire gauge (mm)": "Draaddikte spoel (mm)",
  "Edit this SKU (or double-click the row)": "Bewerk deze SKU (of dubbelklik de rij)",
  "Remove this SKU": "Verwijder deze SKU",
  "No SKUs yet.": "Nog geen SKU's.",
  "Nothing matches the filter.": "Niets past bij het filter.",
  "Value range of the generated grid": "Waardebereik van het gegenereerde rooster",
  "Range": "Bereik",
  "Value grid steps": "Waarderooster-stappen",
  "Coil gauges (mm) / cap ESR (Ω) / resistor power (W)": "Spoeldiktes (mm) / cap-ESR (Ω) / weerstandsvermogen (W)",
  "Phys": "Fysiek",
  "Price model: € = base + factor × value (SI)": "Prijsmodel: € = basis + factor × waarde (SI)",
  "€ model": "€-model",
  "built-in = as shipped · override = your edit of a built-in · custom = your own series": "ingebouwd = zoals geleverd · override = jouw bewerking van een ingebouwde · eigen = jouw eigen serie",
  "Source": "Bron",
  "Stock you are willing to buy. Switching a series off keeps the optimizer, the suggestions and the BOM away from it entirely.": "Voorraad die je wilt kopen. Een serie uitzetten houdt de optimizer, de suggesties en de stuklijst er volledig bij weg.",
  "Use": "Gebruik",
  "No series record — this exists through its exact SKUs. Edit it via the SKUs tab; here you can switch it on or off.": "Geen serierecord — deze bestaat via zijn exacte SKU's. Bewerken kan via de SKU's-tab; hier zet je hem aan of uit.",
  "from SKUs": "uit SKU's",
  "{n} exact SKUs cover this series — they shadow the grid, so grid edits only matter once those SKUs are gone": "{n} exacte SKU's dekken deze serie — ze schaduwen het rooster, dus roosterbewerkingen tellen pas als die SKU's weg zijn",
  "Switched off — the optimizer, the suggestions and the BOM all ignore this series": "Uitgezet — de optimizer, de suggesties en de stuklijst negeren deze serie allemaal",
  "In use. Switch off to keep the optimizer away from this series entirely": "In gebruik. Zet uit om de optimizer volledig bij deze serie weg te houden",
  "use": "aan",
  "Edit — saves as an override of the built-in": "Bewerken — wordt opgeslagen als override van de ingebouwde",
  "Edit this series": "Bewerk deze serie",
  "Revert to the built-in definition": "Zet terug naar de ingebouwde definitie",
  "Remove this series": "Verwijder deze serie",
  "SKU id": "SKU-id",
  "Kind": "Soort",
  "L — coil": "L — spoel",
  "C — cap": "C — condensator",
  "R — resistor": "R — weerstand",
  "R note (Ω, 0)": "R-notitie (Ω, 0)",
  "estimated if blank": "geschat indien leeg",
  "Wire ⌀ (mm)": "Draad-⌀ (mm)",
  "Power (W)": "Vermogen (W)",
  "Price (€)": "Prijs (€)",
  "blank = no price": "leeg = geen prijs",
  "Apply changes": "Wijzigingen toepassen",
  "Add SKU": "SKU toevoegen",
  "Close form": "Formulier sluiten",
  "Series id": "Serie-id",
  "Series name": "Serienaam",
  "Range min": "Bereik min",
  "Range max": "Bereik max",
  "E-grid": "E-rooster",
  "Value steps the series is stocked in — default E12 for coils, E24 for caps/resistors": "Waardestappen waarin de serie geleverd wordt — standaard E12 voor spoelen, E24 voor caps/weerstanden",
  "default": "standaard",
  "Gauges (mm, comma)": "Diktes (mm, komma)",
  "DCR factor": "DCR-factor",
  "1 = air core, ~0.35 iron": "1 = luchtspoel, ~0,35 kern",
  "Base price (€)": "Basisprijs (€)",
  "blank = no prices": "leeg = geen prijzen",
  "Cost factor (€/SI)": "Kostenfactor (€/SI)",
  "Price = base + factor × value in SI units (H / F / Ω)": "Prijs = basis + factor × waarde in SI-eenheden (H / F / Ω)",
  "Add series": "Serie toevoegen",
  "Persist the edited catalog — it becomes the active one (snap, BOM, inspector) and survives restarts": "Bewaar de bewerkte catalogus — hij wordt de actieve (snap, stuklijst, inspector) en overleeft herstarts",
  "Save to catalog": "Opslaan in catalogus",
  "unsaved changes": "niet-opgeslagen wijzigingen",
  "mic": "mic",
  "Top view: the turntable rotates the cabinet, the microphone stays put": "Bovenaanzicht: de draaitafel draait de kast, de microfoon blijft staan",
  "(the cabinet)": "(de kast)",
  "How to measure": "Zo meet je",
  "Close the measuring guide": "Sluit de meetgids",
  "Choose a reference point, and aim at it": "Kies een referentiepunt, en richt erop",
  "Pick one spot on the baffle — the tweeter is the usual choice — and treat it as the origin of everything: the mic points at it, the turntable turns around it, and every driver position you enter is measured from it. Write it down; a measurement whose reference you cannot name is a measurement you cannot interpret later.": "Kies één plek op het front — de tweeter is de gebruikelijke keuze — en behandel die als de oorsprong van alles: de mic wijst ernaar, de draaitafel draait eromheen, en elke driverpositie die je invult wordt ervandaan gemeten. Schrijf hem op; een meting waarvan je de referentie niet kunt noemen is een meting die je later niet kunt interpreteren.",
  "Stand far enough back": "Sta ver genoeg naar achteren",
  "You sweep": "Je sweept",
  "horizontally": "horizontaal",
  " — but there is a second angle you never chose. A driver sitting below the reference point has the microphone somewhere above it, so the line from that driver to the mic already runs at an angle": " — maar er is een tweede hoek die je nooit gekozen hebt. Een driver onder het referentiepunt heeft de microfoon ergens boven zich, dus de lijn van die driver naar de mic loopt al onder een hoek",
  "before the turntable moves at all": "nog vóór de draaitafel ook maar beweegt",
  ". It is there at every horizontal step, it is set purely by how far back you stand, and it is invisible in the files.": ". Hij is er bij elke horizontale stap, wordt puur bepaald door hoe ver je naar achteren staat, en is onzichtbaar in de bestanden.",
  "The side view below shows only that unavoidable part. Drag the microphone and watch it shrink:": "Het zij-aanzicht hieronder toont alleen dat onvermijdelijke deel. Sleep de microfoon en zie hem krimpen:",
  "Side view — the angle you did not choose.": "Zij-aanzicht — de hoek die je niet gekozen hebt.",
  "The crosshair is the reference point and the dashed line is where the mic is aimed; every driver below it looks up at the microphone. This is not a measurement you take — it is where the driver sits. Drawn to scale, so the cabinet genuinely shrinks as you back away, and with it this angle.": "Het kruisje is het referentiepunt en de stippellijn is waar de mic op gericht staat; elke driver eronder kijkt omhoog naar de microfoon. Dit is geen meting die je doet — het is waar de driver zit. Op schaal getekend, dus de kast krimpt echt als je achteruit loopt, en deze hoek mee.",
  "Put the two together — your horizontal sweep on top of the vertical offset above — and this is the angle each driver was": "Leg de twee op elkaar — je horizontale sweep bovenop de verticale offset hierboven — en dit is de hoek waarop elke driver",
  "actually": "werkelijk",
  "measured at:": "gemeten is:",
  "you turned to 0°, it saw": "jij draaide naar 0°, hij zag",
  "you turned to 30°, it saw": "jij draaide naar 30°, hij zag",
  "At {d} mm the mic is {r}× the source size — far field, the curves mean what they say.": "Op {d} mm staat de mic op {r}× de bronmaat — ver veld, de curves betekenen wat ze zeggen.",
  "At {d} mm the mic is only {r}× the source size (a 300 mm baffle). Directivity read from this is indicative at best.": "Op {d} mm staat de mic op maar {r}× de bronmaat (een 300 mm-front). Directiviteit hieruit aflezen is hooguit indicatief.",
  "For a full-size three-way,": "Voor een volwaardige drieweg:",
  "measure at 1.5–2 m": "meet op 1,5–2 m",
  ", and never below 1 m. The \"three times the baffle\" figure is a rule of thumb its own sources label as one; the argument that actually settles it is": ", en nooit onder de 1 m. Het \"drie keer het front\"-getal is een vuistregel die zijn eigen bronnen ook zo noemen; het argument dat het echt beslecht is",
  "relative timing": "relatieve timing",
  ". Design at one distance and listen at another, and every driver's path length changes by a different amount — which lands directly in the crossover phase:": ". Ontwerp op de ene afstand en luister op de andere, en de padlengte van elke driver verandert met een ander bedrag — en dat landt rechtstreeks in de crossover-fase:",
  "designed at": "ontworpen op",
  "woofer–mid error @300 Hz": "woofer–mid-fout @300 Hz",
  "mid–tweeter error @2.5 kHz": "mid–tweeter-fout @2,5 kHz",
  "(Relative to a 3 m listening position, for a tower with the mid 180 mm and the woofer 450 mm below the tweeter.) Sixty-eight degrees at the mid–tweeter is the difference between a flat sum and a visible suck-out — in a tool that otherwise lands within a few degrees. Backing away does cost gate length, so measure": "(T.o.v. een luisterplek op 3 m, voor een toren met de mid 180 mm en de woofer 450 mm onder de tweeter.) Achtenzestig graden op de mid–tweeter is het verschil tussen een vlakke som en een zichtbare suck-out — in een tool die verder op een paar graden nauwkeurig landt. Achteruit lopen kost wél gate-lengte, dus meet",
  " — around half your room height — and put something soft on the floor and ceiling along the reflection path.": " — rond de halve kamerhoogte — en leg iets zachts op vloer en plafond langs het reflectiepad.",
  "The floor decides how low your measurement is worth anything": "De vloer bepaalt tot hoe laag je meting iets waard is",
  "Indoors you are not measuring a response, you are measuring the first few milliseconds of one. The gate has to close before the floor bounce arrives, and whatever window you get, the measurement is only trustworthy above roughly": "Binnenshuis meet je geen responsie, je meet de eerste paar milliseconden ervan. De gate moet dicht vóór de vloerreflectie aankomt, en welk venster je ook krijgt, de meting is alleen betrouwbaar boven ruwweg",
  "1 / gate": "1 / gate",
  ": a 5 ms window means 200 Hz, and it is already a couple of dB out by the time it gets there.": ": een venster van 5 ms betekent 200 Hz, en daar zit hij al een paar dB naast.",
  "Here is the trap, and it is the reason step 2 is not free. Backing away lengthens the direct path more than it lengthens the bounce, so the window": "Hier zit de val, en het is de reden dat stap 2 niet gratis is. Achteruit lopen verlengt het directe pad meer dan de reflectie, dus het venster",
  "shrinks": "krimpt",
  "exactly as you fix the far-field problem. Height is what buys it back — these are your slider's distance against three stand heights, computed by the same function the app uses:": "precies terwijl je het ver-veld-probleem oplost. Hoogte koopt het terug — dit is de afstand van jouw slider tegen drie statiefhoogtes, berekend door dezelfde functie die de app gebruikt:",
  "speaker + mic at": "speaker + mic op",
  "gate": "gate",
  "valid above": "geldig boven",
  "So:": "Dus:",
  "get everything up in the air": "zet alles de lucht in",
  " — a metre and a half beats a metre by more than backing away costs you — and put the stand out in the room rather than against a wall. Below the gate limit there are two honest ways out, and guessing is not one of them: splice in a": " — anderhalve meter verslaat een meter met meer dan achteruit lopen je kost — en zet het statief de kamer in in plaats van tegen een muur. Onder de gate-grens zijn er twee eerlijke uitwegen, en gokken hoort daar niet bij: splice een",
  "near-field": "nabij-veld",
  " measurement (Import → near-field slot; the app matches level and delay and crossfades in the complex domain), or measure the low end": "-meting in (Import → nabij-veld-slot; de app matcht niveau en delay en crossfadet in het complexe domein), of meet het laag",
  "ground plane": "ground plane",
  " — speaker and microphone both on the floor, so the reflection merges with the direct sound and there is no bounce left to gate. Ground plane costs you a known +6 dB and needs the cabinet laid over, but it hands back the 100–500 Hz region that a stand measurement cannot reach.": " — speaker en microfoon allebei op de vloer, zodat de reflectie samenvalt met het directe geluid en er geen bounce meer over is om te gaten. Ground plane kost een bekende +6 dB en de kast moet plat, maar het geeft de 100–500 Hz-regio terug die een statiefmeting niet kan halen.",
  "One clock for every sweep": "Eén klok voor elke sweep",
  "This is the step the whole tool stands on. Designing on measured phase only works if all your driver files share": "Dit is de stap waar de hele tool op staat. Ontwerpen op gemeten fase werkt alleen als al je driverbestanden",
  "one": "één",
  "time origin — then the difference between their arrival times is real, and it is the 40–50 µs that decides whether your crossover sums or cancels. Break it and nothing downstream can tell.": "tijdsoorsprong delen — dan is het verschil tussen hun aankomsttijden echt, en dát is de 40–50 µs die beslist of je crossover optelt of uitdooft. Breek het en niets stroomafwaarts kan het merken.",
  "Do not move the microphone": "Verplaats de microfoon niet",
  "between driver sweeps, and do not move the speaker either. One position, every driver.": "tussen driver-sweeps, en verplaats de speaker ook niet. Eén positie, elke driver.",
  "Never re-zero the time axis": "Zet de tijdas nooit opnieuw op nul",
  "per file — no \"set t=0 at the peak\", no per-file offset removal on export. That throws away exactly the number you came for.": "per bestand — geen \"t=0 op de piek\", geen per-bestand-offsetverwijdering bij export. Dat gooit precies het getal weg waar je voor kwam.",
  "Give the rig a shared reference.": "Geef de opstelling een gedeelde referentie.",
  "With an audio interface, a": "Met een audio-interface is een",
  "-channel is the strongest form. With a USB microphone there is no loopback, so use your software's": "-kanaal de sterkste vorm. Met een USB-microfoon is er geen loopback; gebruik dan de",
  "acoustic timing reference": "acoustic timing reference",
  ": a second speaker that plays on every sweep and stays put relative to the mic (it has to reach 5 kHz — a sub cannot do this job).": " van je software: een tweede speaker die bij élke sweep meespeelt en vast staat t.o.v. de mic (hij moet 5 kHz halen — een sub kan deze klus niet).",
  "The app checks your work: load the drivers and the topbar reports a": "De app controleert je werk: laad de drivers en de topbar meldt een",
  "timing verdict": "timing-oordeel",
  ". \"Plausible\" means the arrival-time difference is within what driver geometry can explain; anything else means the clock moved, and the honest response is to re-measure rather than to design on it.": ". \"Plausibel\" betekent dat het aankomsttijdverschil binnen wat drivergeometrie kan verklaren valt; al het andere betekent dat de klok bewogen heeft, en het eerlijke antwoord is opnieuw meten in plaats van erop ontwerpen.",
  "Keep the radius constant, centred on the reference point": "Houd de straal constant, gecentreerd op het referentiepunt",
  "The angle in a file name belongs to the": "De hoek in een bestandsnaam hoort bij de",
  "box": "kast",
  ". What matters is that every angle is taken at the": ". Wat telt is dat elke hoek genomen is op",
  "same distance": "dezelfde afstand",
  "from the same reference point — swing the microphone on an arc around it, or turn the speaker beneath it; for a vertically stacked cabinet the two are geometrically identical, and the distance to every driver stays exactly constant either way.": "van hetzelfde referentiepunt — zwaai de microfoon op een boog eromheen, of draai de speaker eronder; voor een verticaal gestapelde kast zijn die twee meetkundig identiek, en de afstand tot elke driver blijft in beide gevallen exact constant.",
  "Turning the": "De",
  "speaker": "speaker",
  "is still the safer habit, for a reason that has nothing to do with angles: the microphone then stays in one spot in the room, so every curve carries the same reflections. A microphone that travels meets a different floor, wall and ceiling path at each step, and whatever your gate does not remove ends up looking like directivity. The one case where the geometry itself bites is a driver mounted": "draaien blijft de veiligere gewoonte, om een reden die niets met hoeken te maken heeft: de microfoon blijft dan op één plek in de kamer, dus elke curve draagt dezelfde reflecties. Een reizende microfoon ontmoet per stap een ander vloer-, wand- en plafondpad, en wat je gate niet weghaalt gaat eruitzien als directiviteit. Het ene geval waar de geometrie zelf bijt is een driver die",
  "off-centre horizontally": "horizontaal uit het midden",
  " — 90 mm to one side already shifts its level by half a decibel across a 30° sweep.": " gemonteerd is — 90 mm opzij verschuift zijn niveau al een halve decibel over een 30°-sweep.",
  "Top view — the angle you do choose.": "Bovenaanzicht — de hoek die je wél kiest.",
  "The microphone never moves; the cabinet turns about the reference point. This is the number in your file names, and it belongs to the box: every driver turns through it together, on top of whatever vertical offset it already had.": "De microfoon beweegt nooit; de kast draait om het referentiepunt. Dit is het getal in je bestandsnamen, en het hoort bij de kast: elke driver draait er samen doorheen, bovenop de verticale offset die hij al had.",
  "Sweep angle": "Sweephoek",
  "pause": "pauze",
  "play": "afspelen",
  "Measure the impedance separately": "Meet de impedantie apart",
  "Impedance is electrical: distance, angle and room do not enter into it. Measure each driver": "Impedantie is elektrisch: afstand, hoek en kamer spelen er niet in mee. Meet elke driver wel",
  "in its finished cabinet": "in zijn afgebouwde kast",
  "though — the box is what puts the resonance where it is, and this tool reads the driver's Fs straight off that peak to set a crossover floor. ARTA/LIMP": "— de kast is wat de resonantie legt waar hij ligt, en deze tool leest de Fs van de driver rechtstreeks van die piek af om een crossover-vloer te zetten. ARTA/LIMP-",
  "-files import directly.": "-bestanden importeren direct.",
  "Note these down while you are still at the speaker": "Noteer dit terwijl je nog bij de speaker staat",
  "— which driver or spot, and how far below the top of the baffle it sits.": "— welke driver of plek, en hoe ver onder de bovenkant van het front hij zit.",
  "in mm.": "in mm.",
  "Each driver's centre": "Het centrum van elke driver",
  "relative to the reference point: x to the right, y up (so a driver below it is negative).": "t.o.v. het referentiepunt: x naar rechts, y omhoog (een driver eronder is dus negatief).",
  "Baffle width and height": "Frontbreedte en -hoogte",
  ", and the enclosure behind each driver — sealed, ported (with its tuning), or open.": ", en de kast achter elke driver — gesloten, gepoort (met zijn afstemming), of open.",
  "from the datasheets, once per driver.": "van de datasheets, één keer per driver.",
  "All of it goes into": "Alles gaat in",
  "Cabinet & drivers": "Kast & drivers",
  ". Nothing there changes your measurements — it lets the app work out what those measurements captured, and say so instead of guessing.": ". Niets daar verandert je metingen — het laat de app uitrekenen wat die metingen vastlegden, en dat hardop zeggen in plaats van gokken.",
  "Side view: microphone distance versus each driver's true angle": "Zij-aanzicht: microfoonafstand tegenover de ware hoek van elke driver",
  "Every window and warning this tool derives rests on one thing: what your angle measurements actually captured. That is decided before you touch the software — by where you aimed the microphone and how far away it stood. The illustrations below run on the app's own geometry, so what you see here is exactly what the optimizer will use.": "Elk venster en elke waarschuwing die deze tool afleidt rust op één ding: wat je hoekmetingen werkelijk vastlegden. Dat wordt beslist vóór je de software aanraakt — door waar je de microfoon op richtte en hoe ver hij weg stond. De illustraties hieronder draaien op de eigen geometrie van de app, dus wat je hier ziet is precies wat de optimizer gaat gebruiken.",
  "Manual": "Handleiding",
  "Search… (e.g. phase, export, notch)": "Zoeken… (bv. fase, export, notch)",
  "Close the manual": "Sluit de handleiding",
  "Table of contents": "Inhoudsopgave",
  "Nothing found for “{q}” — try another word.": "Niets gevonden voor “{q}” — probeer een ander woord.",
  "Rel. on-axis": "T.o.v. on-axis",
  "Rel. max": "T.o.v. max",
  "−6 dB beamwidth": "−6 dB-bundelbreedte",
  "Scale drawing of a {w} by {h} mm baffle with {n} driver(s) and the measurement reference point": "Schaaltekening van een front van {w} bij {h} mm met {n} driver(s) en het meetreferentiepunt",
  "Layout not tidied: topology too exotic for the auto-placer (bridge, shared series section, or open/shorted parts).": "Layout niet opgeruimd: topologie te exotisch voor de auto-placer (brug, gedeelde serie-sectie, of open/kortgesloten onderdelen).",
  "Layout tidied — same netlist, fresh placement (Undo to revert).": "Layout opgeruimd — zelfde netlijst, verse plaatsing (Ongedaan maken draait terug).",

  // ── Compare-modus ──
  "Model versus measurement: open the project you designed with, load the response of the BUILT speaker, and see where the two differ — level and mic distance are aligned for you, the shape is what you judge.": "Model versus meting: open het project waarmee je ontwierp, laad de responsie van de GEBOUWDE speaker en zie waar de twee verschillen — niveau en mic-afstand worden voor je uitgelijnd, de vorm is wat jij beoordeelt.",
  "Compare": "Vergelijk",
  "Open the project you designed with, load the measured response of the BUILT speaker, and read where the two differ. Level and mic distance are aligned for you and shown as numbers — the shape is what you judge.": "Open het project waarmee je ontwierp, laad de gemeten responsie van de GEBOUWDE speaker en lees af waar de twee verschillen. Niveau en mic-afstand worden voor je uitgelijnd en als getal getoond — de vorm is wat jij beoordeelt.",
  "No project open yet.": "Nog geen project open.",
  "{n} parts": "{n} onderdelen",
  "The network is not in the simulation — switch it on, or the charts compare against the virtual filters.": "Het netwerk zit niet in de simulatie — zet het aan, anders vergelijken de grafieken tegen de virtuele filters.",
  "Which saved design the charts simulate": "Welk opgeslagen ontwerp de grafieken simuleren",
  "Measurements of the built speaker": "Metingen van de gebouwde speaker",
  "Drop FRD files here": "Sleep FRD-bestanden hierheen",
  "the measured response of the BUILT speaker, with phase, same rig as the driver files — or click to browse; several at once is fine": "de gemeten responsie van de GEBOUWDE speaker, mét fase, zelfde opstelling als de driverbestanden — of klik om te bladeren; meerdere tegelijk mag",
  "Show this measurement in the charts": "Toon deze meting in de grafieken",
  "Remove this measurement": "Verwijder deze meting",
  "Remove {name}": "Verwijder {name}",
  "the simulation has no result (open a project first).": "de simulatie heeft geen resultaat (open eerst een project).",
  "load a measurement above.": "laad hierboven een meting.",
  "Level offset": "Niveau-offset",
  "added to the measurement — absolute calibration differs, the shape does not": "opgeteld bij de meting — absolute kalibratie verschilt, de vorm niet",
  "Phase residual": "Faseresidu",
  "measurement carries no phase column": "meting draagt geen fasekolom",
  "Band": "Band",
  "the visible SPL range — zoom the chart to change it": "het zichtbare SPL-bereik — zoom de grafiek om het te wijzigen",
  "Every measurement against the same simulation and band; click a row to show it": "Elke meting tegen dezelfde simulatie en band; klik een rij om hem te tonen",
  "measurement": "meting",
  "level": "niveau",
  "No network yet — \"Build passive filter\" drops the synthesised design here as a tab, or import the selected variant / start from a template (generator + drivers, unfiltered).": "Nog geen netwerk — \"Bouw passief filter\" zet het gesynthetiseerde ontwerp hier als tab neer, of importeer de gekozen variant / begin vanuit een sjabloon (generator + drivers, ongefilterd).",
  "Compare mode: model vs measurement": "Vergelijk-modus: model vs meting",
  "load the built speaker’s response": "laad de responsie van de gebouwde speaker",
  "Manual: searchable explanation of every tab, the optimizer, the scores and the VituixCAD exchange": "Handleiding: doorzoekbare uitleg van elke tab, de optimizer, de scores en de VituixCAD-uitwisseling",
  "Preferences: layout, language, theme": "Voorkeuren: layout, taal, thema",
  "Preferences": "Voorkeuren",
  "Drop FRD + ZMA files here — or click to browse": "Sleep FRD + ZMA-bestanden hierheen — of klik om te bladeren",
  "3-way only": "alleen 3-weg",
  "Not needed for a 2-way — drop a midrange here and it becomes a 3-way": "Niet nodig voor een 2-weg — sleep hier een midrange en het wordt een 3-weg",
  "— what you already know about the speaker. None of this touches the measurements: it feeds the windows the optimizer searches in (beaming, lobing, excursion), the true angle each driver was measured at, and the split of the timing between rig and driver. Without it the app falls back to size formulas and a guessed 500 mm — it still designs, it just knows less.": "— wat je al weet van de speaker. Niets hiervan raakt de metingen: het voedt de vensters waarin de optimizer zoekt (bundeling, lobing, excursie), de ware hoek waarop elke driver gemeten is, en de splitsing van de timing tussen opstelling en driver. Zonder valt de app terug op maat-formules en een gegokte 500 mm — hij ontwerpt nog steeds, hij weet alleen minder.",
  "The cabinet and how you measured": "De kast en hoe je gemeten hebt",
  "honest low limit, far-field verdict, rig share of the timing": "eerlijke ondergrens, ver-veld-oordeel, opstellingsaandeel van de timing",
  "Front panel width and height": "Frontbreedte en -hoogte",
  "baffle step, edge distances, the drawing": "baffle-step, randafstanden, de tekening",
  "Reference point above the floor": "Referentiepunt boven de vloer",
  "floor bounce: how low the measurement is worth anything": "vloerreflectie: tot hoe laag de meting iets waard is",
  "Reference point below the top": "Referentiepunt onder de bovenkant",
  "so driver positions can be entered as measured from the top": "zodat driverposities vanaf de bovenkant ingevuld kunnen worden",
  "Open Your cabinet →": "Open Je kast →",
  "Per driver": "Per driver",
  "position": "positie",
  "optional; unlocks the level-aware excursion floor": "optioneel; ontgrendelt de niveau-bewuste excursievloer",
  "chamber": "kamer",
  "sealed/ported: the box order the filter can lean on": "gesloten/gepoort: de kastorde waar het filter op mag leunen",
  "Open Your drivers →": "Open Je drivers →",
  "Filling these in closes the wizard; come back with \"Walk me through it\" on the Design step — it reopens here until the list is green, then at Goals.": "Invullen sluit de wizard; kom terug via \"Neem me mee\" op de Ontwerp-stap — hij opent hier weer tot de lijst groen is, daarna bij Doelen.",
  "LIMP .lim — impedance (stored as {name})": "LIMP .lim — impedantie (opgeslagen als {name})",
  "Backup restored — it is your live session again and autosaves from here.": "Back-up hersteld — dit is weer je live sessie en hij autosavet vanaf hier.",
  "The backup still cannot be loaded ({reason}). Download it and send it along — the file itself is a normal project file.": "De back-up kan nog steeds niet geladen worden ({reason}). Download hem en stuur hem mee — het bestand zelf is een gewoon projectbestand.",
  "There is a saved backup of an earlier session that could not be loaded automatically": "Er staat een back-up van een eerdere sessie die niet automatisch geladen kon worden",
  "It holds everything that was in the app at the time — measurements, filters, networks. Try loading it again (a temporary glitch during a code update is the usual cause), or download it as a project file.": "Hij bevat alles wat toen in de app stond — metingen, filters, netwerken. Probeer hem opnieuw te laden (een tijdelijke hapering tijdens een code-update is de gebruikelijke oorzaak), of download hem als projectbestand.",
  "Load the backup": "Laad de back-up",
  "Download backup (.json)": "Download back-up (.json)",
  "Discard the backup? This cannot be undone.": "Back-up weggooien? Dit kan niet ongedaan gemaakt worden.",
  "Discard": "Weggooien",
  "Remove this file from the project (drop the right one on the driver card to replace it)": "Verwijder dit bestand uit het project (sleep het juiste op de driverkaart om te vervangen)",
  "Physically unusual: the woofer reads as the shallowest driver, {mm} mm in front of the tweeter — a dome is normally the shallowest, a cone’s acoustic centre sits at the voice coil. This is a rig reading far more often than a fact: check the woofer’s position and the mic distance, and that the mic stayed put and aimed at the same point for the woofer sweep. Until then, do not use these depths.": "Fysiek ongewoon: de woofer leest als ondiepste driver, {mm} mm vóór de tweeter — een dome is normaal de ondiepste, het akoestisch centrum van een conus zit bij de spreekspoel. Dit is veel vaker een opstellings-aflezing dan een feit: controleer de positie van de woofer en de mic-afstand, en of de mic bij de woofer-sweep op dezelfde plek stond en op hetzelfde punt gericht was. Gebruik deze dieptes tot die tijd niet.",
  "(The delay fit of the {drv} is also not cleanly delay-like.)": "(De delay-fit van de {drv} is bovendien niet zuiver delay-achtig.)",
};
