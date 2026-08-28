import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { guardSql, queryReadonly } from '@szoba-kertesz/core';
import { buildPlantSearchSql, PlantSearchSchema } from './plant-search-sql.js';

// search_plants — az ADAT-tool (a három MCP-stílus egyike, lásd docs/mcp.md). Nincs benne
// modell: strukturált szűrőkből SQL lesz, a sorokat visszaadjuk — a GONDOLKODÁS a hívó
// oldalán (a host modelljében) történik.
//
// Védelmi rétegek egymáson (6. döntés, „öv és nadrágtartó"): paraméterezett SQL + a core
// guardSql-je + a read-only DB-szerep. A guardSql-en a SAJÁT generált SQL-ünk is átmegy — ezt
// a plant-search-sql.spec.ts pinneli minden szűrő-kombinációra, mert a guard tiltólistás,
// tehát elvben fals pozitívot adhatna.

export const SEARCH_PLANTS_TOOL_NAME = 'search_plants';

const inputShape = PlantSearchSchema.shape;

export function registerSearchPlants(server: McpServer): void {
  server.registerTool(
    SEARCH_PLANTS_TOOL_NAME,
    {
      title: 'Növénykeresés a katalógusban',
      description:
        'Strukturált keresés a szoba-kertész növény-katalógusban: kategória, hely, fény, ' +
        'öntözés, nehézség, ár, pet-safe, kid-safe, légtisztító, készlet, méret. Read-only. ' +
        'Nyers sorokat ad vissza JSON-ban — akkor használd, ha magad akarod értelmezni az ' +
        'adatot. Ha kész, magyar nyelvű tanácsot kérnél, az ask_szobakertesz toolt hívd.',
      inputSchema: inputShape,
      // A hívó hostnak szóló jelzés: ez a tool nem módosít semmit, biztonságos hívni.
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (filters) => {
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
        const result = await queryReadonly(guard.sql, params);

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
        const message = error instanceof Error ? error.message : String(error);
        // A tool NEM dob: hibát is eredményként adunk vissza (isError), hogy a hívó modell
        // tudjon vele mit kezdeni.
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Adatbázis-hiba: ${message}` }],
        };
      }
    },
  );
}
