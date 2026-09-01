# 0003 — Az AI Act 50. cikk (2) gépi jelölésének elhalasztása

- **Státusz:** elfogadva
- **Dátum:** 2026-09-01

## Kontextus

Az **50. cikk (1)** és **(5)** ebben a körben teljesült: a webes fejlécben (`App.tsx`,
`role="note"`) és a CLI mindkét belépési pontján (`interactive.ts` bannere, `main.ts` `--help`
leírása) ott áll a tájékoztatás, hogy a válaszokat nyelvi modell generálja. Mérve: az `apps/web`
37, az `apps/cli` 57 tesztje zöld, és a specek azt állítják, amit a felhasználó **lát**, nem
azt, hogy a forrásban benne van-e a mondat.

Az **50. cikk (2)** ettől külön kötelezettség: a szolgáltatónak a szintetikus tartalmat **gépi
olvashatóságú** formában is meg kell jelölnie. A rendszer szöveget generál, tehát a hatálya alá
esik.

A `docs/hf4-ai-act.md` 2.3 pontja ezt **nyitott tételként** vitte tovább, kimondott indoklással:
*„hivatkozással nem tudom megválaszolni, ezért nyitott tételként viszem tovább, nem döntöm el
magamtól."* Az a dokumentum le van adva (`hf4-ai-act` tag, PR #12, `8db30ba`).

Most viszont **hozzányúltunk ehhez a felülethez** — a 2.3 pontban megnevezett hiányosság
egyik felét éppen megszüntettük. Ezért a másik feléről dönteni kell, akár úgy is, hogy nem
csinálunk semmit. Ennek az ADR-nek a létjogosultsága pontosan ez: a `docs/adr/README.md` szerint
*„az elfogadott döntés a kódból amúgy is kiderül; azt, hogy mit próbáltunk és miért nem az lett,
csak ez a napló őrzi meg."*

## Döntés

**Ebben a körben nem vezetünk be gépi jelölést a generált szövegre.** Az 50. cikk (2) nyitott
tétel marad, és a `README.md` korlát-szakaszában néven nevezve is marad, erre az ADR-re
hivatkozva. Megfelelési állítást a (2) bekezdésre **nem** teszünk — sem a kódban, sem a
dokumentációban.

## Megfontolt alternatívák

| Alternatíva | Miért nem ezt választottuk |
|---|---|
| **Jelölő HTTP-fejléc a `/api/chat` válaszán** (pl. `X-AI-Generated: true`) | A stream fogyasztója a böngésző `useChat`-je. A fejléc **sem a tárolt üzenetben, sem a megosztott `?thread=` visszatöltésben nem marad meg** — a jelölés elválna attól a tartalomtól, amit jelölni hivatott. Ez a provenance fogalmának pont az ellentéte. |
| **Metaadat a tárolt asszisztens-üzeneteken** (`messages.parts`) | A `szoba-kertesz_chat` szerep **append-only** (`20260823080000_messages_append_only` migráció; a `threads/db-chat.spec.ts` két esete méri: törölni sem, átírni sem tud), tehát a már tárolt beszélgetéseket visszamenőleg nem jelölhetnénk. Ennél súlyosabb: a jelölés a mi adatbázisunkat elhagyva azonnal elvész — egy kimásolt vagy képernyőképen továbbadott válaszon semmi nem látszik. |
| **Provenance / C2PA-szerű aláírt jelölés** | **Ez érné el, amit a rendelkezés valóban kér.** De a szöveges kimenetre vonatkozó technikai szabvány ma nem kiforrott (a képre/videóra kidolgozott megoldások nem vihetők át egy chat-válaszra), és a bevezetése önálló fejlesztési kör — kulcskezeléssel, formátum-döntéssel, a felület átalakításával. Nem fér ebbe a körbe, és rosszul megválasztott formátummal többet ártana, mint használna. |
| **„Jelöljünk valamivel, jobb a semminél"** | Megfelelési állítást **nem lehetne rá alapozni**, viszont a kódban és a doksiban úgy nézne ki, mintha a tétel le volna zárva. Egy álmegoldás így **rosszabb a bevallott hiánynál**: elveszi a további munka sürgősségét, miközben a kötelezettséget nem teljesíti. Ugyanaz a logika, amiért az 50. cikk (1) „nyilvánvaló" kivételére sem hivatkoztunk. |
| **Az egészet elhallgatni** (se ADR, se README-említés) | A HF4 dokumentum már néven nevezte, tehát nem tűnne el — de egy későbbi olvasó nem tudná megkülönböztetni a **tudatos döntést** a feledékenységtől. A projekt épp azért erős a HF4-ben, mert kimondja a saját gyengeségeit. |

## Következmények

**Amit nyerünk:** a döntés naplózott. Aki fél év múlva az 50. cikk (2)-re kérdez, itt megtalálja,
hogy megfontoltuk, mit vetettünk el és miért — és hogy melyik alternatíva (a provenance-alapú)
az, amelyik valóban célravezető lenne. Egy elvetett út indoklása itt többet ér az elfogadottnál:
azt mondja meg, mit **ne** próbáljunk újra.

**Az ára:** a rendszer továbbra sem teljesíti maradéktalanul az 50. cikket. A (2) bekezdés
**lejárt** kötelezettség, ugyanúgy, mint az (1) volt e kör előtt — a 113. cikk szerinti általános
alkalmazás 2026. augusztus 2-án megkezdődött, és a Digital Omnibus ezt kifejezetten **nem** tolta
ki. Ezt a kockázatot vállaljuk és kiírjuk, nem szépítjük.

**Amit emiatt máshol át kell gondolni:** ha egyszer a provenance-jelölés bekerül, az a
**beszélgetés-tárat** is érinti (`threads`/`messages`), és ott az append-only garancia miatt
csak **előre** hat — a meglévő sorok jelöletlenek maradnak. Egy jövőbeli megvalósításnak ezzel
kell kezdenie, nem a felülettel.

**Ez az ADR akkor váltandó fel**, ha (a) megjelenik szövegre alkalmazható, hivatkozható jelölési
szabvány vagy a Bizottság gyakorlati útmutatója, vagy (b) a rendszer élesbe kerül valódi
felhasználókkal — mert akkor a kockázat már nem elméleti.
