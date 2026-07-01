// Szobakertesz — Prisma seed script (előre kész, nem kell élőben generálni).
// Futtatás: `pnpm prisma db seed`  (vagy közvetlenül: `pnpm tsx seed.ts`)
//
// A `plants.ts` mezőnevei camelCase-ben, pontosan a `schema.prisma` `Product`
// modelljéhez igazítva (lásd `plants.ts` fejléce) — nincs szükség mapping/transform
// lépésre a `createMany` hívás előtt.

import { PrismaClient } from '../generated/client'
import { plants } from './plants'

const prisma = new PrismaClient()

async function main() {
  await prisma.product.deleteMany() // idempotens újraseedeléshez
  const result = await prisma.product.createMany({ data: plants })
  console.log(`Seed kész: ${result.count} növény betöltve.`)
}

main()
  .catch((e) => {
    console.error('Seed hiba:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
