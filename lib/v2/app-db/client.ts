import "server-only";
import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { queryWisePrisma?: PrismaClient };

function createAppDb(): PrismaClient {
  if (!process.env.QUERYWISE_APP_DATABASE_URL) throw new Error("QUERYWISE_APP_DATABASE_URL is not configured.");
  return new PrismaClient();
}

export function getAppDb(): PrismaClient {
  globalForPrisma.queryWisePrisma ??= createAppDb();
  return globalForPrisma.queryWisePrisma;
}

export type AppDb = PrismaClient;
export type AppDbTransaction = Prisma.TransactionClient;

export async function withAppDbTransaction<T>(operation: (tx: AppDbTransaction) => Promise<T>): Promise<T> {
  return getAppDb().$transaction(operation, {
    maxWait: 10_000,
    timeout: 20_000,
  });
}
