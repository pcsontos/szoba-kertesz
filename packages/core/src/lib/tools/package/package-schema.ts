import { z } from 'zod';

// package-schema.ts — a csomag-építő toolok (validatePackage, savePackage) KÖZÖS bemeneti
// sémája. A product-schema.ts mintájára: a Zod-séma egy helyen, a toolok mellett. Nincs
// enum mező (a customerId/productId/quantity mind egyszerű szám), ezért nem kell külön,
// engedékenyebb SDK-elülső séma, mint az upsertProduct-nál — ez a séma egyszerre az AI-SDK
// felé eső inputSchema ÉS a belső re-validáció alapja.

export const PackageItemInputSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().positive(),
});

export type PackageItemInput = z.infer<typeof PackageItemInputSchema>;

export const PackageInputSchema = z
  .object({
    customerId: z.number().int().positive(),
    items: z.array(PackageItemInputSchema).min(1),
  })
  .strict();

export type PackageInput = z.infer<typeof PackageInputSchema>;
