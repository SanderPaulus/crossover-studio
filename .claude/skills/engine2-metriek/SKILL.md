---
name: engine2-metriek
description: Procedure voor het toevoegen of wijzigen van een metriek of extractor in engine2 van Crossover Studio. Gebruik bij elke taak die een nieuwe metriek, extractor, afgeleide parameter of vuistregel aan de v2-engine toevoegt, of een bestaande schatter wijzigt.
---

# Metriek of extractor toevoegen aan engine2

## Voorwaarde
Een metriek bestaat pas als zijn registerrij compleet is (nota §A4): bron → grootheid → formule → afgeleide parameters → databehoefte → rol (poort/zacht/rapportage) → validatiecasus. Geen complete rij = niet bouwen; eerst de rij aanvullen in de nota.

## Stappen
1. **Afleiding vóór implementatie.** Bepaal hoe elke band/referentie uit projectdata volgt (P6). Een vaste frequentie in de code is een specificatiefout — herleid hem of maak er een expliciete projectinstelling van.
2. **Pure functie** in `engine2/metrics/` of `engine2/ingest/`: gedeclareerde databehoefte, geldigheidsinterval-propagatie (clip op meetgrenzen, rapporteer dekking), actief/uit-status met reden voor de capability-matrix.
3. **Versiestring** toekennen; bij wijziging van een bestaande schatter: versiebump + controleer of een V8-valkuil van toepassing is (a: Re nabij f_L; b: Le-flank als piek; c: band niet geclipt; d: motionele fit; e: fitband-geldigheid; f: SNR-wacht; g: fysisch model verplicht; h: minimumfase eerst).
4. **Tests, alle vier:** eenheidstest tegen handberekening; golden-reference-waarde toevoegen aan `golden_refs_casus1.json` mét tolerantie; nieuwe-meting-test (synthetische verschuiving → afgeleide beweegt mee); P6-lint blijft schoon.
5. **UI:** waarde met dekkingspercentage in het rapportpaneel, "uit — invoer ontbreekt" bij ontbrekende data, Engine v2-kenmerk zichtbaar.
6. **Nooit:** koppeling aan de optimizer vanuit deze procedure (dat is F2+ en een apart besluit), drempels op zachte doelen (P3), app-defaults (P4).
