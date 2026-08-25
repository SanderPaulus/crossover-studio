# OptimizerV2 — repo-drop (25-08-2026)

Uitpakken in de root van de Crossover Studio-repo. Inhoud:

- `CLAUDE.md` — projectregels, elke Claude Code-sessie geladen. Vul na F0/F1 de commando-sectie in.
- `.claude/skills/` — twee projectskills: `engine2-metriek` (metriek toevoegen, F2+) en `casus-toevoegen` (casusboek uitbreiden, echt of synthetisch).
- `docs/CrossoverStudio_OptimizerV2_strategie_v2.md` — de specificatie (Deel A) + casusboek (Deel B). Enige autoriteit.
- `docs/OptimizerV2_startprompts.md` — Prompt A (sessie F0, sanering) en Prompt B (sessie F1, engine-toggle + rapporterende metriekbibliotheek). In deze volgorde, elk in een eigen sessie (aanbevolen: Opus 5, /effort xhigh).
- `docs/prototype/` — Python-referentie, geen voorbeeldcode (zie LEESMIJ aldaar).
- `test-fixtures/golden_refs_casus1.json` — machine-leesbare acceptatiewaarden incl. manifest en geometrie.
- `test-fixtures/casus1/` — elf meetbestanden (meetsessie 22-08-2026) + drie netlists (HUIDIG, KAND-A, KAND-B).

Volgorde: (1) deze drop committen, (2) Prompt A draaien en mergen, (3) Prompt B draaien. Acceptatie ligt bij de golden-reference-suite, niet bij plausibiliteit.
