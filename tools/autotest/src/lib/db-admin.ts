// db-admin.ts — az EGYETLEN admin adatbázis-kapcsolat a mérőeszközben.
//
// MIÉRT KELL ADMIN? A `szoba-kertesz_chat` szerepnek NINCS DELETE joga a threads/messages
// táblán (<ts>_chat_role migráció), tehát a battery nem tudná eltakarítani a saját szemetét.
// Ugyanez a helyzet, mint az upsert-product-db.spec.ts-nél, ami szintén adminon takarít.
//
// MIÉRT SAJÁT ENV-SÉMA? A `loadConfig()` szándékosan NEM ismeri a DATABASE_URL-t (csak a
// _READONLY / _READWRITE / _CHAT változatokat). Ugyanezt teszi a core rag/knowledge-store.ts:
// az admin URL-t saját sémával olvassa. Ezt a mintát követjük.
//
// A `deps.query` a TESZT-SZEAM: enélkül ennek a modulnak DB-s specje lenne, ami elbuktatná a
// CI-t (a runneren nincs Postgres), és megsértené a spec 2. sikerkritériumát.
import { Pool } from 'pg';
import { z } from 'zod';

export type AdminQuery = (
  sql: string,
  params?: readonly unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>;

export interface AdminDeps {
  readonly query?: AdminQuery;
}

const EnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(
      1,
      'A DATABASE_URL (admin kapcsolat) hiányzik — enélkül a battery nem tud takarítani a threadek után.',
    ),
  DATABASE_URL_READONLY: z
    .string()
    .min(1, 'A DATABASE_URL_READONLY hiányzik — a referencia-SQL ezen a szerepen fut.'),
});

let adminPoolRef: Pool | null = null;
let readonlyPoolRef: Pool | null = null;

function adminPool(): Pool {
  if (adminPoolRef === null) {
    adminPoolRef = new Pool({
      connectionString: EnvSchema.parse(process.env).DATABASE_URL,
      max: 2,
    });
  }
  return adminPoolRef;
}

/**
 * A referencia-SQL SZEREPE. A #10 PR-review 4. tétele: a `queryNames` csak SELECT-et hajt
 * végre, mégis adminon futott — egy bemásolt `DELETE`/`TRUNCATE` a `battery-cases.json`-ban
 * adminként lefutott volna, és a riportban „nem elérhető konténer"-ként jelent volna meg.
 *
 * A repó saját mintája ez (`rag/knowledge-store.ts`): keresés `_ro`-n, írás adminon. Az admin
 * pool mostantól KIZÁRÓLAG a thread-takarításé.
 */
function readonlyPool(): Pool {
  if (readonlyPoolRef === null) {
    readonlyPoolRef = new Pool({
      connectionString: EnvSchema.parse(process.env).DATABASE_URL_READONLY,
      max: 2,
    });
  }
  return readonlyPoolRef;
}

function queryOn(pick: () => Pool, deps: AdminDeps): AdminQuery {
  return (
    deps.query ??
    (async (sql, params) => {
      const result = await pick().query(sql, params as unknown[]);
      return { rows: result.rows as Record<string, unknown>[] };
    })
  );
}

const resolveQuery = (deps: AdminDeps): AdminQuery => queryOn(adminPool, deps);

/**
 * Egy referencia-SQL név-halmaza. DB-hiba esetén NULL — NEM üres tömb: a `[]` azt hazudná,
 * hogy a referencia-halmaz üres, és a battery 0 F1-et számolna AGENT-hibaként, holott
 * infra-hiba (nem fut a konténer). A kettőt meg kell tudni különböztetni.
 */
export async function queryNames(
  sql: string,
  deps: AdminDeps = {},
): Promise<string[] | null> {
  try {
    // READONLY szerep — lásd a `readonlyPool` kommentjét.
    const { rows } = await queryOn(readonlyPool, deps)(sql);
    return rows
      .map((row) => row['name'])
      .filter((name): name is string => typeof name === 'string');
  } catch {
    return null;
  }
}

export async function listThreadIds(deps: AdminDeps = {}): Promise<string[]> {
  const { rows } = await resolveQuery(deps)('SELECT id FROM threads');
  return rows.map((row) => String(row['id']));
}

/**
 * A megadott threadek törlése. A `messages` MEGY ELŐSZÖR (külső kulcs), és az azonosítók
 * PARAMÉTERKÉNT mennek — beszúrva SQL-injection lenne, még egy teszt-eszközben is.
 */
export async function deleteThreads(
  threadIds: readonly string[],
  deps: AdminDeps = {},
): Promise<number> {
  if (threadIds.length === 0) {
    return 0;
  }
  const query = resolveQuery(deps);
  const ids = [...threadIds];
  await query('DELETE FROM messages WHERE thread_id = ANY($1::uuid[])', [ids]);
  await query('DELETE FROM threads WHERE id = ANY($1::uuid[])', [ids]);
  return ids.length;
}

/** Hány üzenet van a threadben — a perzisztencia-igazoláshoz (Task 12). */
export async function countMessages(
  threadId: string,
  deps: AdminDeps = {},
): Promise<number> {
  const { rows } = await resolveQuery(deps)(
    'SELECT count(*) AS count FROM messages WHERE thread_id = $1::uuid',
    [threadId],
  );
  return Number(rows[0]?.['count'] ?? 0);
}

export async function closeAdminPool(): Promise<void> {
  if (adminPoolRef !== null) {
    await adminPoolRef.end();
    adminPoolRef = null;
  }
  if (readonlyPoolRef !== null) {
    await readonlyPoolRef.end();
    readonlyPoolRef = null;
  }
}
