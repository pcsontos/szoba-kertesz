// Szobakertesz — Prisma seed script (előre kész, nem kell élőben generálni).
// Futtatás: `pnpm prisma db seed`  (vagy közvetlenül: `pnpm tsx seed.ts`)
//
// A `plants.ts` mezőnevei camelCase-ben, pontosan a `schema.prisma` `Product`
// modelljéhez igazítva (lásd `plants.ts` fejléce) — nincs szükség mapping/transform
// lépésre a `createMany` hívás előtt.

import { PrismaClient } from '../generated/client'
import { plants } from './plants'
import { customers } from './customers'

const prisma = new PrismaClient()

async function main() {
  await prisma.product.deleteMany() // idempotens újraseedeléshez
  const products = await prisma.product.createMany({ data: plants })

  // A customers a products UTÁN áll, de EGYMÁSTÓL függetlenek: a threads tábla
  // customer_id-ja `onDelete: SetNull`, tehát egy ügyfél törlése nem visz magával
  // beszélgetést, és nem is akad el FK-hibán.
  await prisma.customer.deleteMany()
  const clients = await prisma.customer.createMany({ data: customers })

  console.log(
    `Seed kész: ${products.count} növény és ${clients.count} ügyfél betöltve.`
  )
}

main()
  .catch((e) => {
    console.error('Seed hiba:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
