import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export type DbClient = PrismaClient;
/** Interactive-transaction client type (what `prisma.$transaction(async (tx) => …)` gives you). */
export type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;
/** Anything that can run queries: the root client or a transaction. */
export type Db = PrismaClient | Tx;

export function createPrismaClient(connectionString = process.env.DATABASE_URL): PrismaClient {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env at the repo root.");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log: process.env.PRISMA_LOG_QUERIES === "1" ? ["query", "warn", "error"] : ["warn", "error"],
  });
}

// One client per process, created lazily on first use (so importing this module never
// requires DATABASE_URL — e.g. during `next build`) and reused across hot reloads.
const globalForPrisma = globalThis as unknown as { __agripayPrisma?: PrismaClient };

function getPrisma(): PrismaClient {
  if (!globalForPrisma.__agripayPrisma) {
    globalForPrisma.__agripayPrisma = createPrismaClient();
  }
  return globalForPrisma.__agripayPrisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrisma();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
