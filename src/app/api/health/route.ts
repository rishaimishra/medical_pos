import { NextResponse } from "next/server";
import { getDatabaseHealth } from "@/lib/db-transaction";
import { isSetupCompleted } from "@/lib/config";

export async function GET() {
  try {
    const [dbHealth, setupDone] = await Promise.all([
      getDatabaseHealth(),
      isSetupCompleted(),
    ]);

    const isHealthy = dbHealth.status === "healthy";

    return NextResponse.json(
      {
        success: isHealthy,
        app: "Medical POS & Pharmacy Management System",
        version: "2.0.0",
        timestamp: new Date().toISOString(),
        setupCompleted: setupDone,
        database: {
          status: isHealthy ? "connected" : "disconnected",
          latencyMs: dbHealth.latencyMs,
        },
      },
      { status: isHealthy ? 200 : 503 }
    );
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Health check probe failed",
      },
      { status: 500 }
    );
  }
}

