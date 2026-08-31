# 0002 — A HF4 fődokumentum terjedelmi korlátjának tudatos túllépése

- **Státusz:** elfogadva
- **Dátum:** 2026-08-31

## Kontextus

A HF4-kiírás a leadásra **„kb. 4-7 oldal"** terjedelmet ad
(`docs/superpowers/specs/2026-08-29-hf4-ai-act-design.md`). Az implementációs terv ezt
fájlonkénti szó-korláttá váltotta át, 500 szó/oldal alapon: a fődokumentumra **1200-2000 szó**,
a levélre max 500, a válaszlevélre 500-1000.

A Task 2-6 végrehajtása során a fődokumentum minden körben túlfutott a becslésen. Mért állapot a
Task 7 dedupja **előtt**:

| Szakasz | szó |
|---|---|
| bevezető + 1. use case | 148 |
| 2. besorolás | 1074 |
| 3. átfedő szabályozások | 444 |
| 4. + 6. (levél-hivatkozások) | 252 |
| 5. QueueGenius + LLM-teszt | 680 |
| **összesen** | **2664** |

A dedup után **2478 szó**. A teljes leadandó hármas: 2478 + 396 + 759 = **3633 szó**.

**A szó-alapú becslés alábecsült — mérni kellett.** Az 500 szó/oldal átváltás 7,3 oldalt jósolt;
a ténylegesen legenerált PDF (pandoc + xelatex, 10pt, 2,2 cm margó, `docs/hf4/build-pdf.sh`)
a leadandó hármasra **8 oldal**. A különbséget a táblázatok függőleges helyigénye és a levelek
előtti oldaltörések adják. A továbbiakban a **mért** 8 oldal a hivatkozási alap, nem a becsült 7,3.

A feszültség forrása mérhető: a kiírás **tartalmi** követelményei (mind a nyolc Annex III-területre
indoklás · négy határeset · mindkét szint melletti érvelés a QueueGeniusnál · négy hibás
hivatkozás tételes összevetése · minden átfedő szabályozás a saját rendszerelemünkhöz kötve) több
helyet kérnek, mint amennyit a 2000 szavas átváltás ad.

## Döntés

**Elfogadjuk a fődokumentum 2478 szavas terjedelmét**, és a Task 7 záró ellenőrzése ezt nem
hibaként, hanem tudatos döntésként rögzíti. A **két levél explicit korlátját szigorúan tartjuk**
(396 ≤ 500, illetve 759 az 500-1000 sávban) — azok a kiírásban konkrét oldalszámmal szerepelnek,
míg a 4-7 oldal „kb."-val jelzett irányszám, és a 2000-es szó-korlát nem a kiírásból, hanem a terv
saját átváltásából származik.

A terjedelmet két eszközzel csökkentettük, ebben a sorrendben: **mellékletbe emelés** (az Annex III
nyolc területe, a DORA/MDR/NIS2 kizárása, az LLM-hibák tételes táblázata a `hivatkozasok.md`
A/B/C mellékletébe) és **dedup** (a 4. és 6. szakasz a leveleket összegezte, amik külön fájlban
amúgy is ott vannak). Prózatömörítéshez és a levezetés rövidítéséhez nem nyúltunk.

## Megfontolt alternatívák

| Alternatíva | Miért nem ezt választottuk |
|---|---|
| **Vágás a szigorú 2000-ig** (további ~480 szó) | Ez már a **pontozott tartalomból** vett volna el: a 2.5 határeset-elemzése vagy a 3. pont GDPR-részlete rövidült volna. A kiírás kifejezetten azt értékeli, hogy „a besorolás indokolt, nem csak kimondott" — a levezetés a termék, nem a töltelék |
| **Prózatömörítés ~2280-ig** (a sávon belülre) | Reális és kivitelezhető volt, de a megtakarítás 0,4 oldal, az ára a szöveg szárazabbá tétele. A retorikai élt (pl. „a támadó nem SQL-en jön be, hanem a bejáraton") a megfelelési érvelés hordozójának tekintjük, nem díszítésnek |
| **A levelek rövidítése** | **Elvetve elvi okból:** azok korlátja a kiírásban explicit, nem irányszám. Ha valamit tartani kell, az ez |
| **Több tartalom mellékletbe** (pl. a 2.5 határesetek, az 5.1 szerep-elemzése) | Egy ponton túl a mellékletbe tolás **kijátszásnak** látszik: a fődokumentumból hiányozna a pontozott érvelés, és az értékelőnek kellene összevadásznia. A három meglévő melléklet (A/B/C) még kiegészítés, a negyedik már kiürítés lenne |
| **A terv 2000-es számának utólagos átírása** | Nem javítjuk el a nyomot. A terv akkor jó dokumentum, ha látszik rajta, hol tért el tőle a végrehajtás és miért — ez az ADR pont ezt őrzi meg |

## Következmények

- **Nyerünk:** a besorolás mind a nyolc Annex III-területre levezetve marad, a négy határeset és a
  négy LLM-hiba tételesen benne van, és a saját mért hiányosságaink (50. cikkes tájékoztatás,
  nyitott `/api/threads`, hiányzó megőrzési idő) nincsenek helyszűke miatt kigyomlálva.
- **Az ára:** a leadás **mérve 8 oldal**, a „kb. 4-7" sáv felső széle fölött egy oldallal. Ha az
  értékelő szigorúan méri az oldalszámot, ez levonást hozhat. A döntést a becsült 7,3 oldal
  ismeretében hoztuk; a mérés utólag 8-at adott, és a döntést ettől sem írtuk felül — de a
  különbséget itt kimondjuk, nem simítjuk el.
- **Amit máshol át kell gondolni:** a **500 szó/oldal átváltás ~10%-kal alábecsül** táblázatos,
  oldaltöréses anyagnál. A következő prózafeladatnál nem becsülni kell, hanem **korán legenerálni
  a PDF-et és megnézni az oldalszámot** — a `docs/hf4/build-pdf.sh` ehhez már megvan. A
  mellékletszerkezetet is **előre** kell eldönteni, nem a negyedik Task közben, ahogy most történt.
- A `hivatkozasok.md` és a `llm-teszt-atirat.md` **melléklet**, nem számít bele a 4-7 oldalba; ezt
  a leadáskor érdemes kimondani, hogy ne tűnjön a terjedelem még nagyobbnak.
