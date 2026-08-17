import type { ToolSet } from 'ai';
import { buildQueryPrompt } from './query-prompt.js';
import { runAgentLoop, type AskOptions, type AskResult } from '../agent-loop.js';
import { runSqlTool } from '../../tools/run-sql/run-sql-tool.js';
import { listCategoriesTool } from '../../tools/list-categories/list-categories-tool.js';
import { getClientPreferencesTool } from '../../tools/get-client-preferences/get-client-preferences-tool.js';

// query-agent.ts — a KÉRDÉS-VÁLASZ agent (a termék "ask" oldala). READ-ONLY: természetes
// nyelvű kérdésből SQL-t ír, lefuttatja, magyarul válaszol. Egy agent = prompt + toolok + loop:
//   prompt:  query-prompt.ts (szerep, séma, SQL-szabályok)
//   toolok:  runSql (read-only SELECT) + listCategories + getClientPreferences
//   loop:    a közös agent-loop (../agent-loop.ts)
//
// Ez a minta ismétlődik minden további agentnél: a fájl NEM tartalmaz loop-logikát,
// csak megmondja, KI ez az agent és MIRE képes.

/**
 * A kör-limit. Régen a kézi for-ciklus felső határa; most az agent
 * `maxSteps`-e, amit a loop `stopWhen: isStepCount(...)`-ra fordít.
 */
export const MAX_TOOL_ITERATIONS = 6;

/** A modell válaszának token-kerete egy körben. */
const MAX_TOKENS = 1024;

/**
 * Egy katalógus-kérdés → magyar válasz.
 *
 * Az `askAgent` név és a visszatérési alak SZÁNDÉKOSAN változatlan a 03.
 * alkalomhoz képest (`systemPrompt` a `--show-prompt`-nak, `toolSteps` a
 * JSONL-naplónak) — a framework-migráció a CLI felől nem látszik.
 */
export async function askAgent(
  question: string,
  options: AskOptions = {},
): Promise<AskResult> {
  return runAgentLoop(
    question,
    {
      systemPrompt: buildQueryPrompt(),
      // A listCategories CSAK itt szerepel: az író agent toolkészletébe
      // nem kerül be (saját kiegészítés #1 — a kurzusnál nincs ilyen tool).
      buildTools: (report): ToolSet => ({
        runSql: runSqlTool(report),
        listCategories: listCategoriesTool(report),
        getClientPreferences: getClientPreferencesTool(report),
      }),
      maxSteps: MAX_TOOL_ITERATIONS,
      maxOutputTokens: MAX_TOKENS,
      emptyAnswer: `Nem sikerült végső választ adni a megengedett lépésszámon belül (${MAX_TOOL_ITERATIONS} kör). Pontosítsd a kérdést.`,
    },
    options,
  );
}
