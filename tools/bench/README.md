# Meetharnassen

Losse scripts die de engine op ECHTE projectdata draaien, buiten de testsuite
om. Ze staan hier omdat ze eerder in een sessie-scratchpad leefden en daarmee
bij elke herstart weg waren — een meting die je niet kunt herhalen is geen
meting.

Niet in `src`, dus ze vallen buiten `tsc -b` en buiten vitest. Ze zijn geen
tests: ze meten en printen, ze oordelen niet.

## Draaien

```bash
ROOT="$PWD" PROJ=/pad/naar/project.json npx tsx tools/bench/epdr.mts
```

`ROOT` wijst naar de repo-root (de scripts importeren `src/lib/*` via een
pad, zodat ze onafhankelijk van de buildconfiguratie draaien). Bestanden met
top-level `await` moeten `.mts` heten — `npx tsx` gebruikt anders cjs-output
en weigert.

## De data

`PROJ` is een gewoon projectbestand: **"Save project" in de app** schrijft
exact de vorm die de scripts lezen (`woofer/mid/tweeter.raw`, `zByRole.*.raw`,
`design.networkDesigns`). De catalogus komt uit **"Export catalog"**.

Bewust NIET in git: die bestanden zijn 8 MB aan metingen en met één klik
opnieuw te maken. Wel opschrijven welke set je gemeten hebt — de getallen in
`OVERDRACHT-2026-08.md` horen bij Sanders 3-weg-set van 16 aug 2026.

## Wat er ligt

| script | vraag die het beantwoordt |
|---|---|
| `epdr.mts` | \|Z\|min tegen EPDR per opgeslagen ontwerp — leidt EPDR zelf af en toetst tegen het gepubliceerde 4 Ω/60°-ankerpunt |
| `dip.ts` | waar zakt de som in, en welke tak + fasehoek veroorzaakt het |
| `seedz.ts` | de ingangsimpedantie van de SEED, vóór de waarde-tune |
| `ceil.ts` | wat het serie-pad-plafond werkelijk aan de kostfunctie bijdraagt |
| `audit.ts` | part-audit-verdicten op een bestaand ontwerp |
| `refrun.ts` | drie vaste kandidaten door de hele keten, voor A/B tussen commits |
| `bomrun.ts` / `pprun2.ts` | BOM en prijs per kandidaat |
| `shortcheck.ts` | bijna-kortsluitingen in de takken |
| `eqchain.ts` | de keten per EQ-budget |

`refrun.ts` is het vertrekpunt voor **stap 0** van het plan in de overdracht:
een vaste meetlat (zijn project + zijn catalogus + drie vaste kandidaten)
waartegen elke latere stap vóór en ná gemeten wordt.
