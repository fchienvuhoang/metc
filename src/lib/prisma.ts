import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pool?: Pool;
};

const TRANSIENT_DATABASE_ERROR_PATTERNS = [
  "connection terminated",
  "connection timeout",
  "connection terminated unexpectedly",
  "connect etimedout",
  "connect econnreset",
  "connection closed",
  "server closed the connection unexpectedly",
  "the database system is starting up",
  "can't reach database server",
];

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not configured.");
    this.name = "DatabaseNotConfiguredError";
  }
}

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function getPrisma(): PrismaClient {
  if (!isDatabaseConfigured()) {
    throw new DatabaseNotConfiguredError();
  }

  if (globalForPrisma.prisma) return globalForPrisma.prisma;

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL!,
    max: positiveInteger(process.env.DATABASE_POOL_MAX, 3),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    allowExitOnIdle: true,
  });
  pool.on("error", (error) => {
    console.error("PostgreSQL pool error:", error.message);
  });
  if (process.env.VERCEL) attachDatabasePool(pool);

  const prisma = new PrismaClient({
    adapter: new PrismaPg(pool),
  });

  globalForPrisma.pool = pool;
  globalForPrisma.prisma = prisma;

  return prisma;
}

export function isTransientDatabaseError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return TRANSIENT_DATABASE_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

export async function retryTransientDatabaseRead<T>(operation: () => Promise<T>): Promise<T> {
  const delays = [250, 750];
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isTransientDatabaseError(error) || attempt >= delays.length) throw error;
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
