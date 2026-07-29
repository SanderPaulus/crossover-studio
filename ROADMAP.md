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
   template-kiezer heeft de (disabled) 3-weg-optie al. Nodig: N-weg-som in de
   sim, bandpass-tak in synthese/templates, optimizer/integration/directivity
   naar N drivers, UI voor drie takken.
10. **Driverbibliotheek** (L) — meetbundels (FRD + hoeken + ZMA) per driver,
    herbruikbaar over projecten; het einde van losse-bestanden-slepen.
11. **Serie-crossover-topologie** (L) — eigen build-pad + vergelijkingsharnas
    naast de parallelle synthese (bewust uitgesteld tot dat harnas er is).
12. **Genormaliseerde hoekcurves & verticale metingen** (M, wacht op data) —
    zodra Sander verticaal meet: lobing-analyse naast de horizontale
    directivity.

## Bewust niet

- Onboarding-tour / grote restyling — de app is voor twee ontwerpers, de
  dichtheid is een feature, ❓ Help dekt de uitleg.
- GPU-versnelling van de optimizers — gemeten: workers waren de winst,
  WebGPU past slecht bij sequentiële simplex-stappen (zie CLAUDE.md).
- Kosten of "realisme" als extra term in zoek-objectives — de anker-les:
  alleen op schone beslispunten (ranking, snap), nooit in de zoektocht.
