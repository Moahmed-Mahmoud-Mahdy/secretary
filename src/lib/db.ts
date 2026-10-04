import { PrismaClient } from '@prisma/client'

// NOTE: after `prisma db push` the dev server may keep the old client in
// memory — bump the global key below (or edit this file) to force a fresh
// PrismaClient with the new schema.
const globalForPrisma = globalThis as unknown as {
  __sekretirPrismaV2: PrismaClient | undefined
}

export const db =
  globalForPrisma.__sekretirPrismaV2 ??
  new PrismaClient({
    log: ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.__sekretirPrismaV2 = db