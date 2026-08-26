# 0001 — Az ADR-napló bevezetése

- **Státusz:** elfogadva
- **Dátum:** 2026-08-26

## Kontextus

A projekt nyolc alkalom alatt sok döntést hozott, és ezek indoklása három helyen szóródott szét:
a `CLAUDE.md`-ben, a `docs/superpowers/specs/` alatti design-doksikban, és a commit-üzenetekben.
A specek „Döntések" táblázatai jól működnek — a 08. alkalom specje például 13 döntést rögzít az
elvetett alternatívákkal —, de **egy specen belül** maradnak: egy spec egy fejlesztési körhöz
tartozik.

A 08. alkalom `autotest` hurka viszont **ismétlődően** termel döntéseket. Minden mérés után
javaslatok születnek, és a felhasználó eldönti, melyiket ültetjük át. Ezeknek nincs specjük, és
nem is lenne értelme mindegyikhez egyet írni.

Ezen felül a mérés utáni döntések nagy része **elvetés**: „ezt a javaslatot nem ültetjük át,
mert…". Ez az információ eddig sehol nem íródott le, pedig ez a drágább fele: az elfogadott
javaslat eredménye a kódból kiderül, az elvetetté sehonnan.

## Döntés

Bevezetjük a `docs/adr/` naplót. **Egy ADR = egy döntési alkalom** (nem egy javaslat). Minden
ADR felsorolja a **megfontolt alternatívákat**, köztük az elvetetteket, indoklással. Az
`autotest` skill 5. lépése kötelezően ír egyet minden mérési kör után, és bővíti a
`README.md` index-tábláját.

## Megfontolt alternatívák

| Alternatíva | Miért nem ezt választottuk |
|---|---|
| Minden döntés a `CLAUDE.md`-be | Az a fájl a **jelen állapot** leírása, nem napló. Az elvetett alternatívák ott zajt csinálnának, és a fájl minden session kontextus-ablakának része — a mérete közvetlen költség. |
| Csak a `docs/superpowers/specs/` „Döntések" táblázatai | Egy spec egy fejlesztési körhöz tartozik. Az ismétlődő mérési körök döntéseinek nincs specjük — nem lenne hova írni őket. |
| GitHub issue-k / PR-leírások | Nem utaznak a klónnal, és offline nem olvashatók. A repóban élő doksi a projekt szokása (`docs/` a mérvadó spec). |
| Javaslatonként egy ADR | Egy mérési kör 5-10 javaslatot ad; ennyi fájl elnyomná a naplót. A **kör mint döntési alkalom** a helyes granularitás. |

## Következmények

- Minden `/autotest` futás után keletkezik egy számozott ADR és egy sor a `README.md` indexben.
- A `CLAUDE.md` kap egy rövid szabály-szakaszt, ami az ADR-t a döntési folyamat részévé teszi.
- **Ár:** egy plusz fájl karbantartása mérési körönként. Cserébe fél év múlva megválaszolható,
  hogy egy javaslatot **miért nem** ültettünk át — ma ez a kérdés megválaszolhatatlan.
- A napló **nem** helyettesíti a specek „Döntések" táblázatát: a nagy, fejlesztési kör szintű
  döntések maradnak ott. Az ADR a körökön ÁTÍVELŐ, ismétlődő döntéseké.
