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
});

let pool: Pool | null = null;

function adminPool(): Pool {
  if (pool === null) {
    const env = EnvSchema.parse(process.env);
    pool = new Pool({ connectionString: env.DATABASE_URL, max: 2 });
  }
  return pool;
}

function resolveQuery(deps: AdminDeps): AdminQuery {
  return (
    deps.query ??
    (async (sql, params) => {
      const result = await adminPool().query(sql, params as unknown[]);
      return { rows: result.rows as Record<string, unknown>[] };
    })
  );
}

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
    const { rows } = await resolveQuery(deps)(sql);
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
  if (pool !== null) {
    await pool.end();
    pool = null;
  }
}
