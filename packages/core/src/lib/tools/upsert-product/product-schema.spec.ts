import { describe, expect, it } from 'vitest';
import { PRODUCT_COLUMNS, ProductInputSchema } from './product-schema.js';

const valid = {
  name: 'Szobafenyő',
  latinName: 'Araucaria heterophylla',
  category: 'szobanövény',
  location: 'beltéri',
  price: 12900,
  salePrice: null,
  stock: 5,
  light: 'közepes',
  watering: 'közepes',
  difficulty: 'kezdő',
  currentHeightCm: 60,
  maxHeightCm: 200,
  currentPotCm: 17,
  petSafe: true,
  kidSafe: true,
  airPurifying: true,
  rating: 0,
  reviewsCount: 0,
  description: 'Örökzöld szobanövény, párás levegőt kedvel.',
};

describe('ProductInputSchema', () => {
  it('elfogad egy teljes, érvényes terméket', () => {
    expect(ProductInputSchema.safeParse(valid).success).toBe(true);
  });

  it('elutasítja az árnál nem kisebb akciós árat', () => {
    const result = ProductInputSchema.safeParse({ ...valid, salePrice: 12900 });
    expect(result.success).toBe(false);
  });

  it('elutasítja az érvénytelen kategóriát', () => {
    const result = ProductInputSchema.safeParse({
      ...valid,
      category: 'növény',
    });
    expect(result.success).toBe(false);
  });

  it('elutasítja az ismeretlen mezőt (strict)', () => {
    const result = ProductInputSchema.safeParse({ ...valid, hacked: true });
    expect(result.success).toBe(false);
  });

  it('az oszlop-térkép minden sémamezőt lefed', () => {
    const schemaKeys = Object.keys(valid).sort();
    const mapped = PRODUCT_COLUMNS.map(([field]) => field).sort();
    expect(mapped).toEqual(schemaKeys);
  });
});
