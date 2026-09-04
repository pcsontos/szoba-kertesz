import { queryPackage, type DbPackageDeps } from './db-package.js';
import { DIFFICULTY } from '../upsert-product/product-schema.js';
import type { PackageInput } from './package-schema.js';

// package-validation.ts — a csomag DETERMINISZTIKUS ellenőrzése: készlet, büdzsé, pet/kid-safe
// igény, nehézségi szint. NEM LLM-döntés — a validatePackage ÉS a savePackage EGYARÁNT ezt
// hívja (a savePackage mentés előtt ÚJRA, defense in depth), hogy a szabály a kódban éljen,
// ne csak a promptban.

export interface PackageViolation {
  readonly code:
    | 'unknown_customer'
    | 'unknown_product'
    | 'out_of_stock'
    | 'not_pet_safe'
    | 'not_kid_safe'
    | 'too_difficult'
    | 'over_budget';
  readonly message: string;
}

export interface PackageLineItem {
  readonly productId: number;
  readonly name: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly lineTotal: number;
}

export interface PackageCheckResult {
  readonly ok: boolean;
  readonly violations: readonly PackageViolation[];
  readonly items: readonly PackageLineItem[];
  readonly totalPrice: number;
  readonly customerBudget: number | null;
}

interface CustomerRow {
  readonly budget: number;
  readonly pet_safe_required: boolean;
  readonly kid_safe_required: boolean;
  readonly expertise_level: string;
}

interface ProductRow {
  readonly id: number;
  readonly name: string;
  readonly stock: number;
  readonly pet_safe: boolean;
  readonly kid_safe: boolean;
  readonly difficulty: string;
  readonly unit_price: number;
}

export async function checkPackage(
  input: PackageInput,
  deps: DbPackageDeps = {},
): Promise<PackageCheckResult> {
  const violations: PackageViolation[] = [];

  const customerResult = await queryPackage<CustomerRow>(
    'SELECT budget::float8 AS budget, pet_safe_required, kid_safe_required, expertise_level ' +
      'FROM customers WHERE id = $1',
    [input.customerId],
    deps,
  );
  const customer = customerResult.rows[0];
  if (!customer) {
    return {
      ok: false,
      violations: [
        {
          code: 'unknown_customer',
          message: `Nincs ${input.customerId} azonosítójú ügyfél.`,
        },
      ],
      items: [],
      totalPrice: 0,
      customerBudget: null,
    };
  }

  const productIds = input.items.map((item) => item.productId);
  const productResult = await queryPackage<ProductRow>(
    'SELECT id, name, stock, pet_safe, kid_safe, difficulty, ' +
      'COALESCE(sale_price, price)::float8 AS unit_price ' +
      'FROM products WHERE id = ANY($1::int[])',
    [productIds],
    deps,
  );
  const productsById = new Map(productResult.rows.map((row) => [row.id, row]));

  const items: PackageLineItem[] = [];
  let totalPrice = 0;
  const customerDifficultyRank = DIFFICULTY.indexOf(
    customer.expertise_level as (typeof DIFFICULTY)[number],
  );

  for (const requested of input.items) {
    const product = productsById.get(requested.productId);
    if (!product) {
      violations.push({
        code: 'unknown_product',
        message: `Nincs ${requested.productId} azonosítójú termék.`,
      });
      continue;
    }
    if (product.stock < requested.quantity) {
      violations.push({
        code: 'out_of_stock',
        message: `"${product.name}": csak ${product.stock} db van raktáron, ${requested.quantity} db kellene.`,
      });
    }
    if (customer.pet_safe_required && !product.pet_safe) {
      violations.push({
        code: 'not_pet_safe',
        message: `"${product.name}" nem háziállat-barát, pedig az ügyfélnek fontos.`,
      });
    }
    if (customer.kid_safe_required && !product.kid_safe) {
      violations.push({
        code: 'not_kid_safe',
        message: `"${product.name}" nem gyerekbiztos, pedig az ügyfélnek fontos.`,
      });
    }
    const productDifficultyRank = DIFFICULTY.indexOf(
      product.difficulty as (typeof DIFFICULTY)[number],
    );
    if (productDifficultyRank > customerDifficultyRank) {
      violations.push({
        code: 'too_difficult',
        message: `"${product.name}" gondozási szintje (${product.difficulty}) meghaladja az ügyfél hozzáértését (${customer.expertise_level}).`,
      });
    }

    const lineTotal = product.unit_price * requested.quantity;
    totalPrice += lineTotal;
    items.push({
      productId: product.id,
      name: product.name,
      quantity: requested.quantity,
      unitPrice: product.unit_price,
      lineTotal,
    });
  }

  if (totalPrice > customer.budget) {
    violations.push({
      code: 'over_budget',
      message: `A csomag összára (${totalPrice} Ft) meghaladja az ügyfél keretét (${customer.budget} Ft).`,
    });
  }

  return {
    ok: violations.length === 0,
    violations,
    items,
    totalPrice,
    customerBudget: customer.budget,
  };
}
