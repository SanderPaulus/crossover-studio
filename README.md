# SD Acoustics - Crossover Studio

Ontwerptool voor passieve luidspreker-crossovers, gebouwd rond één kernidee:
ontwerpen op **gemeten fase** (inclusief het echte inter-driver-tijdverschil),
waar klassieke tools zoals VituixCAD minimum-fase reconstrueren.

**▶ De app draait hier: <https://sanderpaulus.github.io/crossover-studio/>**

## Voor testers

- Gebruik bij voorkeur **Chrome of Edge** — de map-export naar VituixCAD werkt
  alleen daar. Firefox/Safari werken verder ook.
- Nog geen eigen metingen bij de hand? Klik **"Load KOAN demo data"** op de
  Import-tab: een complete echte meetset (frequentie-, fase- en
  impedantiemetingen plus hoekmetingen) om alles mee uit te proberen.
- De **❓ Help**-knop in de app opent de volledige Nederlandstalige handleiding,
  inclusief een snelstart en uitleg per tabblad.
- Je werk wordt automatisch lokaal in je browser bewaard (er gaat niets naar een
  server). Wil je een ontwerp delen of feedback geven? Gebruik **Save project**
  op de Import-tab en stuur het bestand mee.

## Wat kan het?

- Import van FRD/ZMA-metingen en VituixCAD-projecten (.vxp), export terug naar
  VituixCAD inclusief de timing-brug.
- Volautomatische crossover-optimizer ("Optimize — design for me"): van meting
  tot gesynthetiseerd, getuned passief netwerk met echte catalogus-onderdelen
  (Jantzen/Mundorf) en stuklijst met prijzen.
- Grafische schema-editor met live simulatie, directivity/sonogram,
  impedantie-bewaking en tijddomein-analyse.

## Ontwikkelen

```bash
npm install
npm run dev        # dev-server op :5173
npx vitest run     # testsuite
npm run build      # productie-build in dist/
```

Elke push naar `main` draait automatisch de tests en publiceert de app naar
GitHub Pages (zie `.github/workflows/deploy.yml`).

## Status

Actief in ontwikkeling; dit is een testversie. Feedback is welkom via de
[issues](https://github.com/SanderPaulus/crossover-studio/issues).
