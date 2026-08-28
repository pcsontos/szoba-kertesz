import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  registerSearchPlants,
  SEARCH_PLANTS_TOOL_NAME,
} from './tools/search-plants/search-plants-tool.js';
import {
  registerSearchKnowledge,
  SEARCH_KNOWLEDGE_TOOL_NAME,
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
export const SERVER_VERSION = '0.1.0';

export const TOOL_NAMES = [
  SEARCH_PLANTS_TOOL_NAME,
  SEARCH_KNOWLEDGE_TOOL_NAME,
  ASK_SZOBAKERTESZ_TOOL_NAME,
] as const;

export type BuildServerOptions = AskSzobaKerteszOptions;

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

  registerSearchPlants(server);
  registerSearchKnowledge(server);
  registerAskSzobakertesz(server, options);

  return server;
}
