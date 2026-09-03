import { tool, type Tool } from 'ai';
import type { ToolOutcome, ToolReporter } from '../tool-outcome.js';
import { PackageInputSchema } from './package-schema.js';
import { checkPackage, type PackageCheckResult } from './package-validation.js';
import type { DbPackageDeps } from './db-package.js';

// validate-package-tool.ts — az AI-SDK felé eső vékony réteg a checkPackage fölött. NEM ír
// adatbázisba. A savePackage ugyanezt a checkPackage-et hívja újra mentés előtt.

export const VALIDATE_PACKAGE_TOOL_NAME = 'validatePackage';

function formatCheckResult(result: PackageCheckResult): string {
  if (result.ok) {
    const lines = result.items
      .map((item) => `${item.name} × ${item.quantity} = ${item.lineTotal} Ft`)
      .join('; ');
    return JSON.stringify({
      ok: true,
      items: result.items,
      totalPrice: result.totalPrice,
      customerBudget: result.customerBudget,
      message: `Rendben: ${lines}. Összesen ${result.totalPrice} Ft a ${result.customerBudget} Ft-os keretből.`,
    });
  }
  return JSON.stringify({
    ok: false,
    violations: result.violations,
    totalPrice: result.totalPrice,
    customerBudget: result.customerBudget,
    message: `Nem felel meg: ${result.violations.map((v) => v.message).join(' ')}`,
  });
}

export async function executeValidatePackage(
  rawInput: unknown,
  deps: DbPackageDeps = {},
): Promise<ToolOutcome> {
  const parsed = PackageInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
      .join('; ');
    return {
      content: `Érvénytelen csomag: ${issues}`,
      isError: true,
      summary: null,
      sql: null,
      rowCount: null,
    };
  }

  try {
    const result = await checkPackage(parsed.data, deps);
    return {
      content: formatCheckResult(result),
      isError: false,
      summary: result.ok
        ? `csomag OK · ${result.items.length} tétel · ${result.totalPrice} Ft`
        : `csomag ELUTASÍTVA · ${result.violations.length} probléma`,
      sql: null,
      rowCount: result.items.length,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: `A csomag ellenőrzése nem sikerült: ${message}`,
      isError: true,
      summary: null,
      sql: null,
      rowCount: null,
    };
  }
}

export const validatePackageTool = (
  report?: ToolReporter,
): Tool<{ customerId: number; items: { productId: number; quantity: number }[] }, string> =>
  tool({
    description:
      'Ellenőrzi egy növénycsomag-javaslatot: készlet, büdzsé, pet/kid-safe igény, ' +
      'nehézségi szint. NEM ír adatbázisba — mentés előtt MINDIG ezt hívd.',
    inputSchema: PackageInputSchema,
    execute: async (input, { toolCallId }) => {
      const outcome = await executeValidatePackage(input);
      report?.(toolCallId, VALIDATE_PACKAGE_TOOL_NAME, input, outcome);
      return outcome.content;
    },
  });
