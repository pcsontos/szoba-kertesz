import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { guardSql, queryReadonly } from '@szoba-kertesz/core';
import {
  buildPlantSearchSql,
  PlantSearchSchema,
  validatePlantSearch,
} from './plant-search-sql.js';
import { errorMessage } from '../../lib/error-message.js';

// search_plants — az ADAT-tool (a három MCP-stílus egyike, lásd docs/mcp.md). Nincs benne
// modell: strukturált szűrőkből SQL lesz, a sorokat visszaadjuk — a GONDOLKODÁS a hívó
// oldalán (a host modelljében) történik.
//
// Védelmi rétegek egymáson (6. döntés, „öv és nadrágtartó"): paraméterezett SQL + a core
// guardSql-je + a read-only DB-szerep. A guardSql-en a SAJÁT generált SQL-ünk is átmegy — ezt
// a plant-search-sql.spec.ts pinneli minden szűrő-kombinációra, mert a guard tiltólistás,
// tehát elvben fals pozitívot adhatna.
//
// A RENDEZÉSRŐL: az `ORDER BY` a guard BELSŐ alkérdésébe kerül (`SELECT * FROM (… ORDER BY …)
// AS _q LIMIT 50`), a külső SELECT-nek nincs saját ORDER BY-a. A Postgres a gyakorlatban
// megőrzi a belső sorrendet, de az SQL-szabvány ezt nem garantálja — a `rendezes` paraméter
// viszont ígéri. Ha ez valaha számítana, a külső LIMIT-et is rendezni kellene (a #11 review
// 5. tételének rokon megjegyzése).

export const SEARCH_PLANTS_TOOL_NAME = 'search_plants';

const inputShape = PlantSearchSchema.shape;

export interface SearchPlantsOptions {
  /**
   * Teszt-szeam: a lekérdezés-futtató. Alapból a VALÓDI `queryReadonly` — a produkciós út be van
   * kötve, a spec viszont DB nélkül futtatja a guard- és hibaágakat (ugyanaz a minta, mint az
   * `ask_szobakertesz` `ask`-opciója). A #11 review 7. tétele kérte.
   */
  readonly query?: (
    sql: string,
    params: unknown[],
  ) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
}

export function registerSearchPlants(
  server: McpServer,
  options: SearchPlantsOptions = {},
): void {
  const query = options.query ?? ((sql, params) => queryReadonly(sql, params));

  server.registerTool(
    SEARCH_PLANTS_TOOL_NAME,
    {
      title: 'Növénykeresés a katalógusban',
      description:
        'Strukturált keresés a szoba-kertész növény-katalógusban: kategória, hely, fény, ' +
        'öntözés, nehézség, ár, pet-safe, kid-safe, légtisztító, készlet, méret. Read-only. ' +
        'Nyers sorokat ad vissza JSON-ban — akkor használd, ha magad akarod értelmezni az ' +
        'adatot. Ha kész, magyar nyelvű tanácsot kérnél, az ask_szobakertesz toolt hívd. ' +
        'A séma ZÁRT: csak az itt felsorolt szűrők léteznek — ismeretlen mezőnév nem szűr, ' +
        'ezért ne találj ki újat (pl. minMagassagCm nincs).',
      inputSchema: inputShape,
      // A hívó hostnak szóló jelzés: ez a tool nem módosít semmit, biztonságos hívni.
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (filters) => {
      // Mezők KÖZÖTTI szabály (pl. minAr > maxAr): a Zod-séma mezőnként validál, ezt külön
      // kell megmondani — különben a hívó üres listát kapna, magyarázat nélkül.
      const invalid = validatePlantSearch(filters);
      if (invalid !== null) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: invalid }],
        };
      }

      const { sql, params } = buildPlantSearchSql(filters);
      const guard = guardSql(sql);

      // Elvben lehetetlen (mi írjuk az SQL-t), de a Hibakezelés szakasz szerint nem néma
      // üres eredményként megy vissza, hanem a guard indoklásával, isError-ként.
      if (!guard.allowed) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Belső guard-hiba: ${guard.reason}` }],
        };
      }

      try {
        const result = await query(guard.sql, params);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                { rowCount: result.rowCount ?? result.rows.length, rows: result.rows },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error: unknown) {
        // A tool NEM dob: hibát is eredményként adunk vissza (isError), hogy a hívó modell
        // tudjon vele mit kezdeni. Az `errorMessage` az AggregateError-t is kicsomagolja —
        // enélkül teljes DB-leállásnál ÜRES szöveg ment volna vissza (#11 review 4. tétele).
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Adatbázis-hiba: ${errorMessage(error)}` }],
        };
      }
    },
  );
}
