import type { ToolSet } from 'ai';
import { buildQueryPrompt } from './query-prompt.js';
import { runAgentLoop, type AskOptions, type AskResult } from '../agent-loop.js';
import { runSqlTool } from '../../tools/run-sql/run-sql-tool.js';
import { listCategoriesTool } from '../../tools/list-categories/list-categories-tool.js';
import { queryCustomersTool } from '../../tools/query-customers/query-customers-tool.js';
import { searchKnowledgeTool } from '../../tools/search-knowledge/search-knowledge-tool.js';
import { delegateToIngestTool } from '../../tools/delegate-to-ingest/delegate-to-ingest-tool.js';
import {
  CURRENT_ROLE,
  isAdmin,
  type UserRole,
} from '../../user-role/user-role.js';

// query-agent.ts — a KÉRDÉS-VÁLASZ agent (a termék "ask" oldala). READ-ONLY: természetes
// nyelvű kérdésből SQL-t ír, lefuttatja, magyarul válaszol. Egy agent = prompt + toolok + loop:
//   prompt:  query-prompt.ts (szerep, séma, SQL-szabályok)
//   toolok:  runSql (read-only SELECT) + listCategories + queryCustomers +
//            searchKnowledge (tudásbázis), adminként PLUSZ delegateToIngest
//   loop:    a közös agent-loop (../agent-loop.ts)
//
// Ez a minta ismétlődik minden további agentnél: a fájl NEM tartalmaz loop-logikát,
// csak megmondja, KI ez az agent és MIRE képes.

/**
 * A kör-limit. Régen a kézi for-ciklus felső határa; most az agent
 * `maxSteps`-e, amit a loop `stopWhen: isStepCount(...)`-ra fordít.
 */
export const MAX_TOOL_ITERATIONS = 6;

/** Adminnak több kör kell: a delegálás + a végső összegzés plusz körökbe kerül. */
export const MAX_ADMIN_TOOL_ITERATIONS = 8;

/** A modell válaszának token-kerete egy körben. */
const MAX_TOKENS = 1024;

/**
 * A query-agent opciói. A `role` SZÁNDÉKOSAN itt él, nem az `AskOptions`-ön:
 * a közös loop nem tudja, melyik agentet futtatja, tehát szerepekről sem
 * tudhat. A loop csak a KÉSZ toolkészletet látja.
 */
export interface AskAgentOptions extends AskOptions {
  readonly role?: UserRole;
}

/**
 * Egy katalógus-kérdés → magyar válasz.
 *
 * Az `askAgent` név és a visszatérési alak SZÁNDÉKOSAN változatlan a 03.
 * alkalomhoz képest (`systemPrompt` a `--show-prompt`-nak, `toolSteps` a
 * JSONL-naplónak) — a framework-migráció a CLI felől nem látszik.
 */
export async function askAgent(
  question: string,
  options: AskAgentOptions = {},
): Promise<AskResult> {
  const role = options.role ?? CURRENT_ROLE;
  const admin = isAdmin(role);
  const maxSteps = admin ? MAX_ADMIN_TOOL_ITERATIONS : MAX_TOOL_ITERATIONS;

  return runAgentLoop(
    question,
    {
      systemPrompt: buildQueryPrompt(role),
      // A listCategories CSAK itt szerepel: az író agent toolkészletébe
      // nem kerül be (saját kiegészítés #1 — a kurzusnál nincs ilyen tool).
      buildTools: (report): ToolSet => ({
        runSql: runSqlTool(report),
        listCategories: listCategoriesTool(report),
        queryCustomers: queryCustomersTool(report),
        // A MÁSIK tudásforrás: a katalógus TÉNYEI mellé a cikkek TUDÁSA. Hogy melyiket
        // hívja, azt nem mi döntjük el — a modell dönt, a tool leírása alapján.
        searchKnowledge: searchKnowledgeTool(report),
        // A KÉPESSÉG-KAPCSOLÁS: adminnál a kulcs bekerül az objektumba,
        // vásárlónál a spread üresen terül szét — a modell nem is tudja,
        // hogy létezik ez a tool. Ez erősebb, mint egy prompt-tiltás.
        ...(admin
          ? {
              delegateToIngest: delegateToIngestTool(report, {
                print: options.print,
                persistTrace: options.persistTrace,
              }),
            }
          : {}),
      }),
      maxSteps,
      maxOutputTokens: MAX_TOKENS,
      emptyAnswer: `Nem sikerült végső választ adni a megengedett lépésszámon belül (${maxSteps} kör). Pontosítsd a kérdést.`,
    },
    options,
  );
}
