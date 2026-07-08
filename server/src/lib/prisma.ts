// Must run before constructing PrismaClient: standalone worker entrypoints
// (server/src/workers/*.ts) import this module before anything else imports
// '../config', so without this, dotenv hasn't populated process.env yet and
// DATABASE_URL is undefined when PrismaClient is built.
import '../config';
import { PrismaClient } from '@prisma/client';

// Single shared PrismaClient instance — multiple instances exhaust the connection pool
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
