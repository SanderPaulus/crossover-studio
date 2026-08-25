Referentie-implementatie uit de sessies van 22/25-08-2026. Python, paden deels
hardcoded — UITSLUITEND als specificatie gebruiken, niet porten.
- fastnet.py   : gevectoriseerde MNA-solver met element_current()
- metrics5.py  : de vijf oorspronkelijke metrieken (bult, Thevenin, dissipatie-IEC, lobing, EPDR)
- exact.py     : exacte DCR/ESR van samengestelde catalogusdelen
- cat_.py      : cataloguswaarden + combinatiegenerator
- compare.py   : golden-reference-vergelijking van de drie kandidaten
- ingest.py    : opnamepas v1 — LET OP: bevat de gedocumenteerde schattersfouten V8a-e
- bandfree.py  : bandloze Z-classificatie (fasenuldoorgang) — vervangt de banded aanpak
- xo_window.py : kruisvenster-synthese A5d.3 (ernst-weging ongekalibreerd, zie V9)
