import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  registerSearchPlants,
  SEARCH_PLANTS_TOOL_NAME,
  type SearchPlantsOptions,
} from './tools/search-plants/search-plants-tool.js';
import {
  registerSearchKnowledge,
  SEARCH_KNOWLEDGE_TOOL_NAME,
  type RegisterSearchKnowledgeOptions,
} from './tools/search-knowledge/search-knowledge-tool.js';
import {
  registerAskSzobakertesz,
  ASK_SZOBAKERTESZ_TOOL_NAME,
  type AskSzobaKerteszOptions,
} from './tools/ask-szobakertesz/ask-szobakertesz-tool.js';

// szoba-kertesz-server.ts — A SZERVER, TRANSPORT NÉLKÜL (3. döntés). A main.ts (6. Task) ezt
// köti a stdio-transporthoz; ez a fájl kulcs és DB nélkül tesztelhető, mert felépíthető és
// egy in-memory MCP-kliensen keresztül megszámolható, hogy pontosan három tool regisztrálódik.
//
// HÁROM TOOL, HÁROM STÍLUS (a kör tananyaga, lásd docs/mcp.md):
//   search_plants    → ADAT-tool: strukturált szűrő → paraméterezett SELECT → nyers sorok.
//   search_knowledge → ÁTKÖTÖTT core-tool: a meglévő RAG-tool új felületen.
//   ask_szobakertesz → AGENT-AS-TOOL: a mi query-agentünk teljes loopja.

export const SERVER_NAME = 'szoba-kertesz';

/**
 * A HOST ezt a verziót mutatja. SZÁNDÉKOSAN kézzel tartott konstans, és az `apps/mcp/package.json`
 * `version` mezőjével EGYEZNIE kell (a #11 review 10. tétele) — a kettőt együtt kell léptetni.
 *
 * Miért nem a package.json-ból olvassuk? Mert a `tsconfig.app.json` `rootDir`-je a `src`, tehát a
 * fölötte lévő `package.json` import-ja kilógna a fordítási gyökérből, és a buildet törné el egy
 * kozmetikai kedvéért. A drift ellen egy spec véd.
 */
export const SERVER_VERSION = '0.1.0';

export const TOOL_NAMES = [
  SEARCH_PLANTS_TOOL_NAME,
  SEARCH_KNOWLEDGE_TOOL_NAME,
  ASK_SZOBAKERTESZ_TOOL_NAME,
] as const;

/**
 * A három tool teszt-szeamje egy helyen. Mindhárom OPCIONÁLIS: éles futásnál egyik sincs
 * megadva, tehát a valódi `askAgent` / `retrieveKnowledge` / `queryReadonly` fut.
 */
export type BuildServerOptions = AskSzobaKerteszOptions &
  RegisterSearchKnowledgeOptions &
  SearchPlantsOptions;

const SERVER_INSTRUCTIONS = `
A szoba-kertész egy magyar szobanövény-webshop katalógusa (products) és gondozási
tudásbázisa. Nyers katalógus-adathoz a search_plants, gondozási kérdéshez a search_knowledge,
kész szakértői válaszhoz (a kettő együtt, magyarul megfogalmazva) az ask_szobakertesz toolt
hívd. A felület csak olvas: a katalógust ezen keresztül nem lehet módosítani.
`.trim();

export function buildSzobaKerteszServer(options: BuildServerOptions = {}): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: SERVER_INSTRUCTIONS },
  );

  registerSearchPlants(server, options);
  registerSearchKnowledge(server, options);
  registerAskSzobakertesz(server, options);

  return server;
}
