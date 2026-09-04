import { tool, type Tool } from 'ai';
import type { ToolOutcome, ToolReporter } from '../tool-outcome.js';
import { PackageInputSchema, type PackageInput } from './package-schema.js';
import { checkPackage, type PackageCheckResult } from './package-validation.js';
import { withPackageTransaction, type DbPackageDeps } from './db-package.js';

// save-package-tool.ts — az EGYETLEN írási út a packages/package_items táblákba. Mentés
// előtt ÚJRA validál (checkPackage) — defense in depth, az upsertProduct mintájára — és a
// beszúrás EGY tranzakcióban fut: ha az item-ek elhasalnának, a package-sor sem marad árva.

export const SAVE_PACKAGE_TOOL_NAME = 'savePackage';

export interface SavedPackage {
  readonly packageId: string;
  readonly totalPrice: number;
  readonly itemCount: number;
}

async function insertPackage(
  input: PackageInput,
  checked: PackageCheckResult,
  deps: DbPackageDeps,
): Promise<SavedPackage> {
  return withPackageTransaction(async (client) => {
    const packageResult = await client.query<{ id: string }>(
      'INSERT INTO packages (customer_id, total_price) VALUES ($1, $2) RETURNING id',
      [input.customerId, checked.totalPrice],
    );
    const packageId = packageResult.rows[0].id;

    for (const item of checked.items) {
      await client.query(
        'INSERT INTO package_items (package_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)',
        [packageId, item.productId, item.quantity, item.unitPrice],
      );
    }

    return {
      packageId,
      totalPrice: checked.totalPrice,
      itemCount: checked.items.length,
    };
  }, deps);
}

export async function executeSavePackage(
  rawInput: unknown,
  deps: DbPackageDeps = {},
): Promise<ToolOutcome> {
  const parsed = PackageInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
      .join('; ');
    return {
      content: `Érvénytelen csomag — nem mentettem: ${issues}`,
      isError: true,
      summary: null,
      sql: null,
      rowCount: null,
    };
  }

  try {
    const checked = await checkPackage(parsed.data, deps);
    if (!checked.ok) {
      return {
        content: JSON.stringify({
          ok: false,
          violations: checked.violations,
          message: `Nem mentettem: ${checked.violations.map((v) => v.message).join(' ')}`,
        }),
        isError: false,
        summary: `csomag ELUTASÍTVA mentéskor · ${checked.violations.length} probléma`,
        sql: null,
        rowCount: null,
      };
    }

    const saved = await insertPackage(parsed.data, checked, deps);
    return {
      content: JSON.stringify({
        ok: true,
        packageId: saved.packageId,
        totalPrice: saved.totalPrice,
        itemCount: saved.itemCount,
        message: `Csomag elmentve (${saved.packageId}), ${saved.itemCount} tétel, ${saved.totalPrice} Ft.`,
      }),
      isError: false,
      summary: `CSOMAG mentve · ${saved.itemCount} tétel · ${saved.totalPrice} Ft`,
      sql: null,
      rowCount: saved.itemCount,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: `A csomag mentése nem sikerült: ${message}`,
      isError: true,
      summary: null,
      sql: null,
      rowCount: null,
    };
  }
}

export const savePackageTool = (
  report?: ToolReporter,
): Tool<{ customerId: number; items: { productId: number; quantity: number }[] }, string> =>
  tool({
    description:
      'Elmenti a növénycsomagot (packages + package_items). Csak EXPLICIT felhasználói ' +
      'megerősítés UTÁN hívd, miután a validatePackage rendben talált mindent.',
    inputSchema: PackageInputSchema,
    execute: async (input, { toolCallId }) => {
      const outcome = await executeSavePackage(input);
      report?.(toolCallId, SAVE_PACKAGE_TOOL_NAME, input, outcome);
      return outcome.content;
    },
  });
