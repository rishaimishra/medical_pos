import { NextResponse } from "next/server";
import { prisma } from "./prisma";

/**
 * Parses an optional positive integer ID from JSON body or FormData values.
 */
export function parseOptionalPositiveInt(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const parsed = parseInt(String(val), 10);
  return !isNaN(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Verifies an optional customer-selected branchId belongs to `storeId` and is active.
 */
export async function resolveVerifiedStoreBranch(
  storeId: number | null | undefined,
  requestedBranchId: number | null
): Promise<{ ok: true; branchId: number | null } | { ok: false; response: NextResponse }> {
  if (!requestedBranchId) return { ok: true, branchId: null };
  if (!storeId) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: "Target store could not be resolved for branch routing." },
        { status: 400 }
      ),
    };
  }

  const branch = await prisma.branch.findFirst({
    where: { id: requestedBranchId, storeId, active: true },
    select: { id: true },
  });
  if (!branch) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: "Selected branch does not belong to the target pharmacy store." },
        { status: 400 }
      ),
    };
  }
  return { ok: true, branchId: branch.id };
}

/**
 * Builds tenant + branch isolation filter for PatientMessage rows.
 * Branch-assigned staff only see messages routed to their branch OR store-wide messages (branchId=null).
 */
export function buildPatientMessageScope(
  storeId: number | null | undefined,
  branchId: number | null | undefined
): Record<string, any> {
  const clauses: any[] = [];
  if (storeId) {
    clauses.push({
      OR: [
        { storeId },
        { storeId: null, customer: { storeId } },
      ],
    });
  }
  if (branchId) {
    clauses.push({
      OR: [{ branchId }, { branchId: null }],
    });
  }
  if (clauses.length === 0) return {};
  return clauses.length === 1 ? clauses[0] : { AND: clauses };
}

/**
 * Checks whether an authenticated staff member may access a specific PatientMessage record
 * under strict multi-store AND multi-branch isolation.
 */
export function canStaffAccessPatientMessage(
  session: { storeId?: number | null; branchId?: number | null },
  msg: { storeId?: number | null; branchId?: number | null; customer?: { storeId?: number | null } | null } | null
): boolean {
  if (!msg) return false;
  const msgStoreId = msg.storeId ?? msg.customer?.storeId ?? null;
  if (session.storeId && msgStoreId !== session.storeId) return false;
  if (session.branchId && msg.branchId && msg.branchId !== session.branchId) return false;
  return true;
}
