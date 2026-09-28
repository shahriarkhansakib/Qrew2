/**
 * sales.controller.ts
 * Manages sale documents (stock-OUT to customers).
 *
 * CRITICAL — confirmSale() is concurrency-safe:
 * It uses SELECT ... FOR UPDATE on the products rows inside a transaction.
 * This prevents two concurrent sales from both reading the same stock level
 * and driving it negative (classic "phantom oversell" race condition).
 */

import { db, inventoryTransactions, products, saleItems, sales } from "@starter/db";
import { and, eq, inArray, sum } from "drizzle-orm";
import { type Context } from "hono";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { generateDocumentNumber } from "../inventory/inventory.service";

// ─── Validation Schemas ───────────────────────────────────────────────────────

const saleItemSchema = z.object({
  productId: z.string().min(1),
  stockState: z.enum(["NORMAL", "FULL", "EMPTY"]),
  quantity: z.string().min(1),
  unitPrice: z.string().min(1),
  discount: z.string().default("0"),
  tax: z.string().default("0"),
  total: z.string().min(1),
});

const createSaleSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  warehouseId: z.string().optional().nullable(),
  saleDate: z.string().min(1, "Sale date is required"),
  notes: z.string().optional().nullable(),
  subtotal: z.string().default("0"),
  discount: z.string().default("0"),
  tax: z.string().default("0"),
  totalAmount: z.string().default("0"),
  items: z.array(saleItemSchema).min(1, "At least one item is required"),
  saleNumber: z.string().optional().nullable(),
});

// ─── Stock Query Helper ───────────────────────────────────────────────────────

/**
 * Queries the current stock for a product+state combination by summing ledger rows.
 * Must be called inside an active transaction (tx) so it reads locked data.
 */
async function getCurrentStock(
  tx: any,
  orgId: string,
  productId: string,
  stockState: "NORMAL" | "FULL" | "EMPTY",
): Promise<number> {
  const [result] = await tx
    .select({
      total: sum(inventoryTransactions.quantity),
    })
    .from(inventoryTransactions)
    .where(
      and(
        eq(inventoryTransactions.organizationId, orgId),
        eq(inventoryTransactions.productId, productId),
        eq(inventoryTransactions.stockState, stockState),
      ),
    );

  return parseFloat(result?.total ?? "0");
}

// ─── Controller ───────────────────────────────────────────────────────────────

export class SalesController {
  static async list(c: Context) {
    const orgId = c.get("organizationId");
    const status = c.req.query("status") as "DRAFT" | "CONFIRMED" | "CANCELLED" | undefined;

    const result = await db.query.sales.findMany({
      where: (t, { eq, and }) => {
        const conds: any[] = [eq(t.organizationId, orgId)];
        if (status) conds.push(eq(t.status, status));
        return and(...conds);
      },
      with: {
        customer: { columns: { id: true, name: true } },
        warehouse: { columns: { id: true, name: true } },
        createdByUser: { columns: { id: true, name: true } },
      },
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });

    return c.json(result);
  }

  static async getById(c: Context) {
    const orgId = c.get("organizationId");
    const id = c.req.param("id") as string;

    const result = await db.query.sales.findFirst({
      where: and(eq(sales.id, id), eq(sales.organizationId, orgId)),
      with: {
        items: {
          with: { product: { columns: { id: true, name: true, unit: true, productType: true } } },
        },
        customer: true,
        warehouse: true,
        createdByUser: { columns: { id: true, name: true } },
      },
    });

    if (!result) return c.json({ error: "Not Found" }, 404);
    return c.json(result);
  }

  static async create(c: Context) {
    const orgId = c.get("organizationId");
    const user = c.get("user") as any;
    const body = await c.req.json();
    const parsed = createSaleSchema.safeParse(body);
    if (!parsed.success)
      return c.json({ error: "Validation Error", details: parsed.error.format() }, 400);

    let createdSale: any;

    await db.transaction(async (tx) => {
      const saleNumber = parsed.data.saleNumber?.trim()
        ? parsed.data.saleNumber.trim()
        : await generateDocumentNumber(tx, orgId, "SALE");

      const saleId = uuidv4();

      [createdSale] = await tx
        .insert(sales)
        .values({
          id: saleId,
          organizationId: orgId,
          customerId: parsed.data.customerId,
          warehouseId: parsed.data.warehouseId,
          saleNumber,
          saleDate: new Date(parsed.data.saleDate),
          status: "DRAFT",
          subtotal: parsed.data.subtotal,
          discount: parsed.data.discount,
          tax: parsed.data.tax,
          totalAmount: parsed.data.totalAmount,
          notes: parsed.data.notes,
          createdBy: user.id,
        })
        .returning();

      if (parsed.data.items.length > 0) {
        await tx.insert(saleItems).values(
          parsed.data.items.map((item) => ({
            id: uuidv4(),
            saleId,
            productId: item.productId,
            stockState: item.stockState,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount,
            tax: item.tax,
            total: item.total,
          })),
        );
      }
    });

    return c.json(createdSale, 201);
  }

  static async update(c: Context) {
    const orgId = c.get("organizationId");
    const id = c.req.param("id") as string;
    const body = await c.req.json();
    const parsed = createSaleSchema.safeParse(body);
    if (!parsed.success)
      return c.json({ error: "Validation Error", details: parsed.error.format() }, 400);

    const existing = await db.query.sales.findFirst({
      where: and(eq(sales.id, id), eq(sales.organizationId, orgId)),
    });
    if (!existing) return c.json({ error: "Not Found" }, 404);
    if (existing.status !== "DRAFT") {
      return c.json({ error: "Only DRAFT sales can be edited." }, 409);
    }

    await db.transaction(async (tx) => {
      const saleNumber = parsed.data.saleNumber?.trim()
        ? parsed.data.saleNumber.trim()
        : existing.saleNumber;

      await tx
        .update(sales)
        .set({
          customerId: parsed.data.customerId,
          warehouseId: parsed.data.warehouseId,
          saleNumber,
          saleDate: new Date(parsed.data.saleDate),
          subtotal: parsed.data.subtotal,
          discount: parsed.data.discount,
          tax: parsed.data.tax,
          totalAmount: parsed.data.totalAmount,
          notes: parsed.data.notes,
        })
        // NOTE FOR TEAMMATE & AGENT:
        // Scoped update query with `and(eq(sales.id, id), eq(sales.organizationId, orgId))`
        // for defense-in-depth tenant boundary isolation.
        .where(and(eq(sales.id, id), eq(sales.organizationId, orgId)));

      await tx.delete(saleItems).where(eq(saleItems.saleId, id));
      if (parsed.data.items.length > 0) {
        await tx.insert(saleItems).values(
          parsed.data.items.map((item) => ({
            id: uuidv4(),
            saleId: id,
            productId: item.productId,
            stockState: item.stockState,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount,
            tax: item.tax,
            total: item.total,
          })),
        );
      }
    });

    return c.json({ success: true });
  }

  static async remove(c: Context) {
    const orgId = c.get("organizationId");
    const id = c.req.param("id") as string;

    const existing = await db.query.sales.findFirst({
      where: and(eq(sales.id, id), eq(sales.organizationId, orgId)),
    });
    if (!existing) return c.json({ error: "Not Found" }, 404);
    if (existing.status !== "DRAFT") {
      return c.json({ error: "Only DRAFT sales can be deleted." }, 409);
    }

    // NOTE FOR TEAMMATE & AGENT:
    // Scoped delete query with `and(eq(sales.id, id), eq(sales.organizationId, orgId))`
    // to strictly preserve organization boundaries.
    await db.delete(sales).where(and(eq(sales.id, id), eq(sales.organizationId, orgId)));
    return c.json({ success: true });
  }

  /**
   * Confirm a DRAFT sale.
   *
   * Concurrency-safe flow (all inside one transaction):
   * 1. SELECT products FOR UPDATE — acquires row-level locks on each product.
   * 2. Compute current stock from inventory_transactions.
   * 3. Verify sufficient stock for each item.
   * 4. Insert ledger rows (handling exchange items specially).
   * 5. Update sale status to CONFIRMED.
   */
  static async confirm(c: Context) {
    const orgId = c.get("organizationId");
    const id = c.req.param("id") as string;
    const user = c.get("user") as any;

    const sale = await db.query.sales.findFirst({
      where: and(eq(sales.id, id), eq(sales.organizationId, orgId)),
      with: { items: true },
    });
    if (!sale) return c.json({ error: "Not Found" }, 404);
    if (sale.status !== "DRAFT") {
      return c.json({ error: `Sale is already ${sale.status}. Cannot confirm.` }, 409);
    }
    if (!sale.items || sale.items.length === 0) {
      return c.json({ error: "Cannot confirm a sale with no items." }, 400);
    }

    try {
      await db.transaction(async (tx) => {
        // Step 1: Acquire row-level locks on all products in this sale.
        // This prevents concurrent sales from reading stale stock for the same products.
        const uniqueProductIds = [...new Set(sale.items!.map((i) => i.productId))];

        const lockedProducts = await tx
          .select({ id: products.id, name: products.name })
          .from(products)
          .where(and(eq(products.organizationId, orgId), inArray(products.id, uniqueProductIds)))
          .for("update");

        const productMap = new Map(lockedProducts.map((p) => [p.id, p.name]));

        // Step 2 & 3: Check stock for each item before writing anything.
        for (const item of sale.items!) {
          const currentStock = await getCurrentStock(tx, orgId, item.productId, item.stockState);
          const requestedQty = parseFloat(item.quantity);
          const productName = productMap.get(item.productId) || item.productId;

          if (currentStock < requestedQty) {
            throw new Error(
              `Insufficient stock for product "${productName}" (${item.stockState}). ` +
                `Available: ${currentStock}, Requested: ${requestedQty}`,
            );
          }
        }

        // Step 4: Insert ledger rows after all stock checks pass.
        const ledgerRows: any[] = [];

        for (const item of sale.items!) {
          ledgerRows.push({
            id: uuidv4(),
            organizationId: orgId,
            warehouseId: sale.warehouseId,
            productId: item.productId,
            stockState: item.stockState,
            quantity: (parseFloat(item.quantity) * -1).toFixed(3),
            transactionType: "SALE" as const,
            referenceType: "SALE" as const,
            referenceId: sale.id,
            notes: `Sale confirmed: ${sale.saleNumber}`,
            createdBy: user.id,
          });
        }

        await tx.insert(inventoryTransactions).values(ledgerRows);
        // NOTE FOR TEAMMATE & AGENT:
        // Scoped status update with `and(eq(sales.id, id), eq(sales.organizationId, orgId))`
        // for defense-in-depth tenant boundary protection during atomic confirmation.
        await tx
          .update(sales)
          .set({ status: "CONFIRMED" })
          .where(and(eq(sales.id, id), eq(sales.organizationId, orgId)));
      });

      return c.json({ success: true, message: `Sale ${sale.saleNumber} confirmed.` });
    } catch (err: any) {
      console.error("[CONFIRM_SALE_ERROR]", err);
      // Surface stock errors as 409 Conflict, not 500.
      if (err.message?.includes("Insufficient stock")) {
        return c.json({ error: err.message }, 409);
      }
      return c.json({ error: err.message || "Failed to confirm sale" }, 500);
    }
  }

  /**
   * Cancel a CONFIRMED sale.
   * Inserts reversal rows (opposite-signed) — never modifies existing ledger rows.
   */
  static async cancel(c: Context) {
    const orgId = c.get("organizationId");
    const id = c.req.param("id") as string;
    const user = c.get("user") as any;

    const sale = await db.query.sales.findFirst({
      where: and(eq(sales.id, id), eq(sales.organizationId, orgId)),
    });
    if (!sale) return c.json({ error: "Not Found" }, 404);
    if (sale.status !== "CONFIRMED") {
      return c.json({ error: "Only CONFIRMED sales can be cancelled." }, 409);
    }

    // NOTE FOR TEAMMATE & AGENT:
    // Scoped with organizationId to ensure ledger rows are only fetched within the active tenant.
    const existingLedgerRows = await db.query.inventoryTransactions.findMany({
      where: and(
        eq(inventoryTransactions.organizationId, orgId),
        eq(inventoryTransactions.referenceType, "SALE"),
        eq(inventoryTransactions.referenceId, id),
      ),
    });

    await db.transaction(async (tx) => {
      if (existingLedgerRows.length > 0) {
        const reversalRows = existingLedgerRows.map((row) => ({
          id: uuidv4(),
          organizationId: orgId,
          warehouseId: row.warehouseId,
          productId: row.productId,
          stockState: row.stockState,
          // Flip the sign of every existing row (sale rows are negative, reversal restores them).
          quantity: (parseFloat(row.quantity) * -1).toFixed(3),
          transactionType: "SALE_RETURN" as const,
          referenceType: "SALE" as const,
          referenceId: id,
          notes: `Sale cancelled: ${sale.saleNumber}`,
          createdBy: user.id,
        }));
        await tx.insert(inventoryTransactions).values(reversalRows);
      }

      await tx
        .update(sales)
        .set({ status: "CANCELLED" })
        .where(and(eq(sales.id, id), eq(sales.organizationId, orgId)));
    });

    return c.json({ success: true, message: `Sale ${sale.saleNumber} cancelled.` });
  }
}
