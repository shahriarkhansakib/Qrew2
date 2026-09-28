/**
 * purchases.controller.ts
 * Manages purchase documents (stock-IN from suppliers).
 *
 * LEDGER RULES:
 * - Create / Update (DRAFT only): no ledger writes.
 * - confirmPurchase: writes +quantity rows to inventory_transactions.
 * - cancelPurchase (CONFIRMED only): writes reversing -quantity rows (append-only audit trail).
 */

import { db, inventoryTransactions, purchaseItems, purchases } from "@starter/db";
import { and, eq } from "drizzle-orm";
import { type Context } from "hono";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { generateDocumentNumber } from "../inventory/inventory.service";

// ─── Validation Schemas ───────────────────────────────────────────────────────

const purchaseItemSchema = z.object({
  productId: z.string().min(1),
  stockState: z.enum(["NORMAL", "FULL", "EMPTY"]),
  quantity: z.string().min(1), // string because decimal from frontend
  unitCost: z.string().min(1),
  discount: z.string().default("0"),
  tax: z.string().default("0"),
  total: z.string().min(1),
});

const createPurchaseSchema = z.object({
  supplierId: z.string().min(1, "Supplier is required"),
  warehouseId: z.string().optional().nullable(),
  purchaseDate: z.string().min(1, "Purchase date is required"),
  notes: z.string().optional().nullable(),
  subtotal: z.string().default("0"),
  discount: z.string().default("0"),
  tax: z.string().default("0"),
  totalAmount: z.string().default("0"),
  items: z.array(purchaseItemSchema).min(1, "At least one item is required"),
  // Allow manual number override while in DRAFT; leave blank to auto-generate.
  purchaseNumber: z.string().optional().nullable(),
});

// ─── Controller ───────────────────────────────────────────────────────────────

export class PurchasesController {
  // List purchases with optional ?status=DRAFT|CONFIRMED|CANCELLED filter.
  static async list(c: Context) {
    const orgId = c.get("organizationId");
    const status = c.req.query("status") as "DRAFT" | "CONFIRMED" | "CANCELLED" | undefined;

    const result = await db.query.purchases.findMany({
      where: (t, { eq, and }) => {
        const conds: any[] = [eq(t.organizationId, orgId)];
        if (status) conds.push(eq(t.status, status));
        return and(...conds);
      },
      with: {
        supplier: { columns: { id: true, name: true } },
        warehouse: { columns: { id: true, name: true } },
        createdByUser: { columns: { id: true, name: true } },
      },
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });

    return c.json(result);
  }

  // Get a single purchase with all line items.
  static async getById(c: Context) {
    const orgId = c.get("organizationId");
    const id = c.req.param("id") as string;

    const result = await db.query.purchases.findFirst({
      where: and(eq(purchases.id, id), eq(purchases.organizationId, orgId)),
      with: {
        items: { with: { product: { columns: { id: true, name: true, unit: true } } } },
        supplier: true,
        warehouse: true,
        createdByUser: { columns: { id: true, name: true } },
      },
    });

    if (!result) return c.json({ error: "Not Found" }, 404);
    return c.json(result);
  }

  // Create a new DRAFT purchase with line items.
  static async create(c: Context) {
    const orgId = c.get("organizationId");
    const user = c.get("user") as any;
    const body = await c.req.json();
    const parsed = createPurchaseSchema.safeParse(body);
    if (!parsed.success)
      return c.json({ error: "Validation Error", details: parsed.error.format() }, 400);

    let createdPurchase: any;

    await db.transaction(async (tx) => {
      // Auto-generate purchase number if not provided by user.
      const purchaseNumber = parsed.data.purchaseNumber?.trim()
        ? parsed.data.purchaseNumber.trim()
        : await generateDocumentNumber(tx, orgId, "PURCHASE");

      const purchaseId = uuidv4();

      [createdPurchase] = await tx
        .insert(purchases)
        .values({
          id: purchaseId,
          organizationId: orgId,
          supplierId: parsed.data.supplierId,
          warehouseId: parsed.data.warehouseId,
          purchaseNumber,
          purchaseDate: new Date(parsed.data.purchaseDate),
          status: "DRAFT",
          subtotal: parsed.data.subtotal,
          discount: parsed.data.discount,
          tax: parsed.data.tax,
          totalAmount: parsed.data.totalAmount,
          notes: parsed.data.notes,
          createdBy: user.id,
        })
        .returning();

      // Insert all line items.
      if (parsed.data.items.length > 0) {
        await tx.insert(purchaseItems).values(
          parsed.data.items.map((item) => ({
            id: uuidv4(),
            purchaseId,
            productId: item.productId,
            stockState: item.stockState,
            quantity: item.quantity,
            unitCost: item.unitCost,
            discount: item.discount,
            tax: item.tax,
            total: item.total,
          })),
        );
      }
    });

    return c.json(createdPurchase, 201);
  }

  // Update a DRAFT purchase (header + items). Blocked if already CONFIRMED or CANCELLED.
  static async update(c: Context) {
    const orgId = c.get("organizationId");
    const id = c.req.param("id") as string;
    const body = await c.req.json();
    const parsed = createPurchaseSchema.safeParse(body);
    if (!parsed.success)
      return c.json({ error: "Validation Error", details: parsed.error.format() }, 400);

    const existing = await db.query.purchases.findFirst({
      where: and(eq(purchases.id, id), eq(purchases.organizationId, orgId)),
    });
    if (!existing) return c.json({ error: "Not Found" }, 404);
    if (existing.status !== "DRAFT") {
      return c.json({ error: "Only DRAFT purchases can be edited." }, 409);
    }

    await db.transaction(async (tx) => {
      const purchaseNumber = parsed.data.purchaseNumber?.trim()
        ? parsed.data.purchaseNumber.trim()
        : existing.purchaseNumber; // Keep the existing number if not provided.

      await tx
        .update(purchases)
        .set({
          supplierId: parsed.data.supplierId,
          warehouseId: parsed.data.warehouseId,
          purchaseNumber,
          purchaseDate: new Date(parsed.data.purchaseDate),
          subtotal: parsed.data.subtotal,
          discount: parsed.data.discount,
          tax: parsed.data.tax,
          totalAmount: parsed.data.totalAmount,
          notes: parsed.data.notes,
        })
        // NOTE FOR TEAMMATE & AGENT:
        // Scoped update query with `and(eq(purchases.id, id), eq(purchases.organizationId, orgId))`
        // for defense-in-depth tenant boundary isolation.
        .where(and(eq(purchases.id, id), eq(purchases.organizationId, orgId)));

      // Replace all items: delete old ones and re-insert.
      await tx.delete(purchaseItems).where(eq(purchaseItems.purchaseId, id));
      if (parsed.data.items.length > 0) {
        await tx.insert(purchaseItems).values(
          parsed.data.items.map((item) => ({
            id: uuidv4(),
            purchaseId: id,
            productId: item.productId,
            stockState: item.stockState,
            quantity: item.quantity,
            unitCost: item.unitCost,
            discount: item.discount,
            tax: item.tax,
            total: item.total,
          })),
        );
      }
    });

    return c.json({ success: true });
  }

  // Delete a DRAFT purchase. CONFIRMED purchases cannot be deleted — only cancelled.
  static async remove(c: Context) {
    const orgId = c.get("organizationId");
    const id = c.req.param("id") as string;

    const existing = await db.query.purchases.findFirst({
      where: and(eq(purchases.id, id), eq(purchases.organizationId, orgId)),
    });
    if (!existing) return c.json({ error: "Not Found" }, 404);
    if (existing.status !== "DRAFT") {
      return c.json({ error: "Only DRAFT purchases can be deleted." }, 409);
    }

    // NOTE FOR TEAMMATE & AGENT:
    // Scoped delete query with `and(eq(purchases.id, id), eq(purchases.organizationId, orgId))`
    // to strictly preserve organization boundaries.
    await db
      .delete(purchases)
      .where(and(eq(purchases.id, id), eq(purchases.organizationId, orgId)));
    return c.json({ success: true });
  }

  /**
   * Confirm a DRAFT purchase → writes inventory_transactions (stock-IN).
   * Runs entirely in a single transaction for atomicity.
   */
  static async confirm(c: Context) {
    const orgId = c.get("organizationId");
    const id = c.req.param("id") as string;
    const user = c.get("user") as any;

    const purchase = await db.query.purchases.findFirst({
      where: and(eq(purchases.id, id), eq(purchases.organizationId, orgId)),
      with: { items: true },
    });
    if (!purchase) return c.json({ error: "Not Found" }, 404);
    if (purchase.status !== "DRAFT") {
      return c.json({ error: `Purchase is already ${purchase.status}. Cannot confirm.` }, 409);
    }
    if (!purchase.items || purchase.items.length === 0) {
      return c.json({ error: "Cannot confirm a purchase with no items." }, 400);
    }

    await db.transaction(async (tx) => {
      // Write one ledger row per purchase item (positive quantity = stock IN).
      const ledgerRows = purchase.items!.map((item) => ({
        id: uuidv4(),
        organizationId: orgId,
        warehouseId: purchase.warehouseId,
        productId: item.productId,
        stockState: item.stockState,
        quantity: item.quantity, // positive = stock coming in
        transactionType: "PURCHASE" as const,
        referenceType: "PURCHASE" as const,
        referenceId: purchase.id,
        notes: `Purchase confirmed: ${purchase.purchaseNumber}`,
        createdBy: user.id,
      }));

      await tx.insert(inventoryTransactions).values(ledgerRows);
      // NOTE FOR TEAMMATE & AGENT:
      // Scoped status update with `and(eq(purchases.id, id), eq(purchases.organizationId, orgId))`
      // to ensure tenant safety during atomic transaction commit.
      await tx
        .update(purchases)
        .set({ status: "CONFIRMED" })
        .where(and(eq(purchases.id, id), eq(purchases.organizationId, orgId)));
    });

    return c.json({ success: true, message: `Purchase ${purchase.purchaseNumber} confirmed.` });
  }

  /**
   * Cancel a CONFIRMED purchase → inserts reversal rows in inventory_transactions.
   * The original rows are NEVER modified (append-only ledger for audit trail).
   */
  static async cancel(c: Context) {
    const orgId = c.get("organizationId");
    const id = c.req.param("id") as string;
    const user = c.get("user") as any;

    const purchase = await db.query.purchases.findFirst({
      where: and(eq(purchases.id, id), eq(purchases.organizationId, orgId)),
    });
    if (!purchase) return c.json({ error: "Not Found" }, 404);
    if (purchase.status !== "CONFIRMED") {
      return c.json({ error: "Only CONFIRMED purchases can be cancelled." }, 409);
    }

    // Fetch all ledger rows that belong to this purchase.
    // NOTE FOR TEAMMATE & AGENT:
    // Scoped with organizationId to ensure ledger rows are only fetched within the active tenant.
    const existingLedgerRows = await db.query.inventoryTransactions.findMany({
      where: and(
        eq(inventoryTransactions.organizationId, orgId),
        eq(inventoryTransactions.referenceType, "PURCHASE"),
        eq(inventoryTransactions.referenceId, id),
      ),
    });

    await db.transaction(async (tx) => {
      // For each original ledger row, insert a reversal row with the sign flipped.
      if (existingLedgerRows.length > 0) {
        const reversalRows = existingLedgerRows.map((row) => ({
          id: uuidv4(),
          organizationId: orgId,
          warehouseId: row.warehouseId,
          productId: row.productId,
          stockState: row.stockState,
          // Flip the sign: original was +5, reversal is -5.
          quantity: (parseFloat(row.quantity) * -1).toFixed(3),
          transactionType: "PURCHASE_RETURN" as const,
          referenceType: "PURCHASE" as const,
          referenceId: id,
          notes: `Purchase cancelled: ${purchase.purchaseNumber}`,
          createdBy: user.id,
        }));
        await tx.insert(inventoryTransactions).values(reversalRows);
      }

      await tx
        .update(purchases)
        .set({ status: "CANCELLED" })
        .where(and(eq(purchases.id, id), eq(purchases.organizationId, orgId)));
    });

    return c.json({ success: true, message: `Purchase ${purchase.purchaseNumber} cancelled.` });
  }
}
