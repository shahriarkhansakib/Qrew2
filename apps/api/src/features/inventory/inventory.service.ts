/**
 * inventory.service.ts
 * Shared service utilities for the inventory module.
 * Imported by purchases, sales, and any future inventory feature controllers.
 */

import { orgDocumentCounters } from "@starter/db";
import { and, eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

/**
 * Generates the next sequential document number for a given org and type.
 * Format: "PUR-001", "SAL-001" (zero-padded to 3 digits minimum).
 *
 * MUST be called inside an existing DB transaction (tx) to be concurrency-safe.
 * The SELECT FOR UPDATE on org_document_counters prevents two concurrent requests
 * from reading the same lastNumber and producing duplicate document numbers.
 *
 * @param tx      - The active Drizzle transaction (not db directly).
 * @param orgId   - The organization ID to scope the counter.
 * @param type    - 'PURCHASE' | 'SALE'
 * @returns       - e.g. "PUR-001", "SAL-042"
 */
export async function generateDocumentNumber(
  tx: any,
  orgId: string,
  type: "PURCHASE" | "SALE" | "SALE_RETURN" | "PURCHASE_RETURN",
): Promise<string> {
  const prefixMap: Record<string, string> = {
    PURCHASE: "PUR",
    SALE: "SAL",
    SALE_RETURN: "SR",
    PURCHASE_RETURN: "PR",
  };
  const prefix = prefixMap[type] || "DOC";

  // Lock the counter row for this org+type to prevent race conditions.
  // If no row exists yet, create one with lastNumber = 0 first.
  const existing = await tx
    .select()
    .from(orgDocumentCounters)
    .where(
      and(
        eq(orgDocumentCounters.organizationId, orgId),
        eq(orgDocumentCounters.documentType, type as any),
      ),
    )
    .for("update") // SELECT FOR UPDATE — row-level lock
    .limit(1);

  if (existing.length === 0) {
    // First document of this type for this org — create the counter row.
    await tx.insert(orgDocumentCounters).values({
      id: uuidv4(),
      organizationId: orgId,
      documentType: type as any,
      lastNumber: 1,
    });
    return `${prefix}-001`;
  }

  // Increment and update the counter.
  const nextNumber = existing[0].lastNumber + 1;
  await tx
    .update(orgDocumentCounters)
    .set({ lastNumber: nextNumber })
    .where(eq(orgDocumentCounters.id, existing[0].id));

  // Zero-pad to at least 3 digits (001, 042, 1000, etc.).
  const padded = String(nextNumber).padStart(3, "0");
  return `${prefix}-${padded}`;
}
