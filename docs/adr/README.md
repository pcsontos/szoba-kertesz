# Döntési napló (ADR)

Architecture Decision Record: egy-egy fájl rögzít **egy döntést**, a kontextusával, a
**megfontolt alternatívákkal** és a következményekkel.

**A legfontosabb szabály:** az **elvetett** lehetőségeket is le kell írni, az elvetés indokával.
Az elfogadott döntés a kódból amúgy is kiderül; azt, hogy mit próbáltunk és **miért nem az lett**,
csak ez a napló őrzi meg.

Új ADR: másold a `_template.md`-t `NNNN-rovid-cim.md` néven (a legnagyobb szám + 1), és vegyél
fel egy sort az alábbi táblába. Az `/autotest` skill 5. lépése minden mérési kör után ír egyet.

| # | Cím | Státusz | Dátum |
|---|---|---|---|
| [0001](0001-adr-bevezetese.md) | Az ADR-napló bevezetése | elfogadva | 2026-08-26 |
| [0002](0002-hf4-terjedelem.md) | A HF4 fődokumentum terjedelmi korlátjának tudatos túllépése | elfogadva | 2026-08-31 |
