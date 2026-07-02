/**
 * SELECT-only guard a `runSql` tool számára (B3.2).
 *
 * Ez az alkalmazás-szintű védelmi réteg — a system prompt (`system-prompt.ts`)
 * már instruálja a modellt, hogy csak SELECT-et írjon és mindig tegyen LIMIT-et,
 * de ez a modul regex/parszolás alapon *ténylegesen* kikényszeríti ezt, mielőtt
 * bármi eljutna a valódi adatbázis-kapcsolathoz (`db-readonly.ts`).
 *
 * Ez NEM az egyetlen védelmi vonal: a `DATABASE_URL_READONLY` mögötti Postgres
 * szerepkör (`szoba-kertesz_ro`) csak SELECT-jogosultsággal rendelkezik, tehát
 * még egy — itt esetleg átcsúszó — módosító utasítást is elutasítana maga az
 * adatbázis (lásd `db-readonly.spec.ts` "double protection" tesztjét). A két
 * réteg egymástól függetlenül is önmagában megállja a helyét (NFR1).
 *
 * Szándékosan nem egy teljes SQL-parser: egyetlen statementre és egy
 * tiltólistás kulcsszó-keresésre épül. Ismert korlát: egy string literálban
 * szereplő tiltott szó (pl. `... WHERE description ILIKE '%delete%'`) hamis
 * pozitívot ad — ez a katalógus (növénynevek, magyar szövegek) tartalma
 * mellett elhanyagolható kockázat, és a védelem konzervatív irányban téved
 * (inkább elutasít egy ártalmatlan lekérdezést, mint hogy átengedjen egy
 * módosítót).
 *
 * A LIMIT-kikényszerítés SZÁNDÉKOSAN nem szöveges hozzáfűzéssel történik
 * (pl. `` `${statement} LIMIT 50` ``) — az sérülékeny egy záró sorvégi
 * (`--`) kommentre: a hozzáfűzött `LIMIT 50` a kommentbe csúszna és sosem
 * futna le ténylegesen (élőben igazolt eset: `SELECT g FROM
 * generate_series(1,200) g --x LIMIT 50` 200 sort adott vissza). Egy
 * rokon hiba: egy string literálban szereplő "limit" szó (pl. `ILIKE
 * '%limit%'`) hamisan azt jelezhetné egy szöveges detekciónak, hogy már
 * van LIMIT, és kihagyná a hozzáfűzést.
 *
 * Ehelyett a guard MINDIG egy külső `SELECT * FROM (...) AS _q LIMIT
 * <DEFAULT_LIMIT>`-be csomagolja a belső statementet, a záró zárójelet és a
 * külső LIMIT-et pedig SZÁNDÉKOSAN külön sorba teszi — így egy a belső
 * statement végén álló sorvégi komment csak a saját sorát nyeli el, a
 * csomagolást nem tudja megkerülni. Ez egyszerre old meg mindkét fenti
 * hibaosztályt, mert a belső statementen belüli LIMIT (meglévő vagy
 * kikommentezett) irreleváns: a ténylegesen visszaadott sorok száma
 * garantáltan legfeljebb `DEFAULT_LIMIT` (vagy kevesebb, ha a belső
 * statement saját, annál szigorúbb LIMIT-je ezt tovább szűkíti).
 */

const DEFAULT_LIMIT = 50;

const FORBIDDEN_KEYWORDS = [
  'insert',
  'into',
  'update',
  'delete',
  'drop',
  'alter',
  'truncate',
  'create',
  'grant',
  'revoke',
  'copy',
  'call',
  'merge',
  'replace',
  'exec',
  'execute',
  'vacuum',
  'reindex',
  'lock',
  'do',
  'comment',
] as const;

const FORBIDDEN_KEYWORD_PATTERN = new RegExp(
  `\\b(${FORBIDDEN_KEYWORDS.join('|')})\\b`,
  'i',
);

const SELECT_PREFIX_PATTERN = /^select\b/i;

export type SqlGuardResult =
  | { readonly allowed: true; readonly sql: string }
  | { readonly allowed: false; readonly reason: string };

function reject(reason: string): SqlGuardResult {
  return { allowed: false, reason };
}

/**
 * Ellenőriz egy nyers SQL-stringet, és vagy elutasítja (indoklással), vagy
 * visszaadja a ténylegesen futtatandó, garantáltan sor-korlátozott
 * SELECT-et.
 *
 * - Csak egyetlen statement engedélyezett (pontosvesszővel elválasztott
 *   több utasítás — pl. `SELECT 1; DROP TABLE products;` — tilos).
 * - A statementnek `SELECT`-tel kell kezdődnie.
 * - Tiltott (író/DDL) kulcsszót tartalmazó statement elutasítva.
 * - A statementet mindig egy `SELECT * FROM (...) AS _q LIMIT
 *   <DEFAULT_LIMIT>` külső korlátba csomagolja (lásd a fenti fájl-szintű
 *   doc-commentet) — nem próbálja szövegesen eldönteni, van-e már belső
 *   LIMIT, mert ez a próbálkozás pont az, amit a záró kommentes és
 *   string-literálos trükkök megkerülnek.
 */
export function guardSql(rawSql: string): SqlGuardResult {
  const trimmed = rawSql.trim();

  if (trimmed.length === 0) {
    return reject('Az SQL lekérdezés nem lehet üres.');
  }

  const statements = trimmed
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (statements.length === 0) {
    return reject('Az SQL lekérdezés nem lehet üres.');
  }

  if (statements.length > 1) {
    return reject(
      'Csak egyetlen SQL utasítás engedélyezett — több pontosvesszővel elválasztott utasítás tilos.',
    );
  }

  const [statement] = statements;

  if (!SELECT_PREFIX_PATTERN.test(statement)) {
    return reject('Csak SELECT lekérdezés engedélyezett.');
  }

  const forbiddenMatch = statement.match(FORBIDDEN_KEYWORD_PATTERN);
  if (forbiddenMatch) {
    return reject(`Tiltott SQL kulcsszó: ${forbiddenMatch[0].toUpperCase()}.`);
  }

  // A zárójel-lezárás és a külső LIMIT szándékosan külön soron van — ha a
  // belső `statement` egy `--` sorvégi kommenttel végződik, az csak a saját
  // sorát nyeli el, a következő soron lévő `) AS _q LIMIT ...`-ot nem.
  const sql = `SELECT * FROM (\n${statement}\n) AS _q LIMIT ${DEFAULT_LIMIT}`;

  return { allowed: true, sql };
}
