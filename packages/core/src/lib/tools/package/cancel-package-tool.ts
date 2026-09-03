import { tool } from 'ai';
import { z } from 'zod';
import type { ToolOutcome, ToolReporter } from '../tool-outcome.js';

// cancel-package-tool.ts — JELZŐ-tool: nem ír adatbázisba. Kizárólag azért létezik, hogy a
// history-ban hagyjon egy felismerhető jelet — ez zárja a flow-lockot (lásd
// orchestrator-agent/flow-lock.ts), ha a felhasználó meggondolja magát csomag-építés közben.

export const CANCEL_PACKAGE_TOOL_NAME = 'cancelPackage';

export const cancelPackageTool = (report?: ToolReporter) =>
  tool({
    description:
      'Jelzi, hogy a csomag-építés megszakadt mentés nélkül — akkor hívd, ha a felhasználó ' +
      'lemond a csomagról.',
    inputSchema: z.object({}),
    execute: async (_input, { toolCallId }) => {
      const outcome: ToolOutcome = {
        content: 'A csomag-építés megszakítva, semmi nem lett elmentve.',
        isError: false,
        summary: 'csomag-építés megszakítva',
        sql: null,
        rowCount: null,
      };
      report?.(toolCallId, CANCEL_PACKAGE_TOOL_NAME, {}, outcome);
      return outcome.content;
    },
  });
