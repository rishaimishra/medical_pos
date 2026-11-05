import { prisma } from "@/lib/prisma";
export { prisma };
import { PrismaClient, Prisma } from "@prisma/client";

/**
 * Type representing the Prisma transactional client.
 */
export type TransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export interface TransactionOptions {
  maxWait?: number; // Maximum time Prisma Client will wait to acquire a transaction from the database
  timeout?: number; // Maximum time the transaction can run before being canceled and rolled back
  isolationLevel?: Prisma.TransactionIsolationLevel;
}

/**
 * Executes a callback inside an atomic ACID database transaction.
 * If any step inside the callback fails, all changes are automatically rolled back.
 */
export async function runInTransaction<T>(
  callback: (tx: TransactionClient) => Promise<T>,
  options: TransactionOptions = {
    maxWait: 10000,
    timeout: 30000,
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  }
): Promise<T> {
  const startTime = Date.now();
  try {
    const result = await prisma.$transaction(
      async (tx) => {
        return await callback(tx as unknown as TransactionClient);
      },
      {
        maxWait: options.maxWait ?? 10000,
        timeout: options.timeout ?? 30000,
        isolationLevel: options.isolationLevel,
      }
    );

    const duration = Date.now() - startTime;
    if (process.env.NODE_ENV === "development") {
      console.log(`[ACID Transaction] Committed successfully in ${duration}ms`);
    }

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[ACID Transaction Rollback] Failed after ${duration}ms:`, error);
    throw error;
  }
}

export interface DatabaseHealthResult {
  status: "healthy" | "unhealthy";
  engine: string;
  latencyMs: number;
  tables?: {
    settings: number;
    users: number;
    medicines: number;
    batches: number;
    sales: number;
  };
  error?: string;
  recoveryHint?: string;
  timestamp: string;
}

/**
 * Database health check and diagnostic tool.
 * Verifies live connection, calculates ping latency, and checks table states.
 * Translates raw database exceptions into friendly actionable recovery hints (Module 1.2.3).
 */
export async function getDatabaseHealth(): Promise<DatabaseHealthResult> {
  const start = Date.now();
  try {
    // 1. Ping the database using a raw query
    await prisma.$queryRaw`SELECT 1 as ping`;
    const latencyMs = Date.now() - start;

    // 2. Query basic system table metrics
    const [settingsCount, usersCount, medicinesCount, batchesCount, salesCount] =
      await Promise.all([
        prisma.settings.count(),
        prisma.user.count(),
        prisma.medicine.count(),
        prisma.batch.count(),
        prisma.sale.count(),
      ]);

    return {
      status: "healthy",
      engine: "PostgreSQL (Neon Serverless)",
      latencyMs,
      tables: {
        settings: settingsCount,
        users: usersCount,
        medicines: medicinesCount,
        batches: batchesCount,
        sales: salesCount,
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    const latencyMs = Date.now() - start;
    const rawError = error?.message || String(error);

    let recoveryHint = "Check if your database server is running and accessible.";

    if (rawError.includes("password authentication failed") || rawError.includes("P1000")) {
      recoveryHint = "Authentication failed. Please verify your database username and password in .env (DATABASE_URL).";
    } else if (rawError.includes("database") && rawError.includes("does not exist") || rawError.includes("P1003")) {
      recoveryHint = "Database not found. Please create the database in your PostgreSQL instance or check the database name in DATABASE_URL.";
    } else if (rawError.includes("ECONNREFUSED") || rawError.includes("ENOTFOUND") || rawError.includes("P1001")) {
      recoveryHint = "Cannot reach database host. If using Neon, check if your project is active or suspended due to inactivity.";
    } else if (rawError.includes("SSL") || rawError.includes("sslmode")) {
      recoveryHint = "SSL connection failed. Ensure '?sslmode=require' is appended to your connection string in .env.";
    } else if (rawError.includes("timeout") || rawError.includes("P1008")) {
      recoveryHint = "Connection timed out. Check your local internet connectivity or firewall rules.";
    }

    return {
      status: "unhealthy",
      engine: "PostgreSQL (Neon Serverless)",
      latencyMs,
      error: rawError,
      recoveryHint,
      timestamp: new Date().toISOString(),
    };
  }
}

