/**
 * inventory-transactions.ts
 * The append-only, immutable ledger — single source of truth for all stock movements.
 *
 * KEY RULES (enforced by application logic, not DB constraints):
 * 1. Rows are NEVER updated or deleted — the ledger is append-only for audit integrity.
 * 2. Positive quantity = stock IN (purchase, return, refill_in).
 * 3. Negative quantity = stock OUT (sale, damage, adjustment_out).
 * 4. Current stock for a product = SUM(quantity) WHERE product_id = ? AND stock_state = ?
 * 5. On cancellation: insert NEW rows with flipped signs — do NOT delete existing rows.
 *
 * No updated_at column because these rows must never be mutated after creation.
 */

import { relations } from "drizzle-orm";
import { decimal, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import {
  inventoryReferenceTypeEnum,
  inventoryTransactionTypeEnum,
  stockStateEnum,
} from "./inventory-enums";
import { products } from "./products";
import { warehouses } from "./warehouses";

export const inventoryTransactions = pgTable(
  "inventory_transactions",
  {
    id: text("id").primaryKey(),

    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    // Nullable — not all orgs use warehouses in v1.
    warehouseId: text("warehouse_id").references(() => warehouses.id, { onDelete: "restrict" }),

    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),

    // The stock "bucket" this movement belongs to. NEVER NULL.
    stockState: stockStateEnum("stock_state").notNull(),

    // Signed decimal — positive = in, negative = out. Supports fractional units.
    quantity: decimal("quantity", { precision: 10, scale: 3 }).notNull(),

    // What kind of movement this is (e.g., PURCHASE, SALE, REFILL_IN, PURCHASE_RETURN).
    transactionType: inventoryTransactionTypeEnum("transaction_type").notNull(),

    // Which document table the referenceId points to.
    referenceType: inventoryReferenceTypeEnum("reference_type").notNull(),

    // The ID of the purchase or sale that caused this movement.
    // Not a DB-level FK because it's polymorphic (points to different tables).
    referenceId: text("reference_id").notNull(),

    notes: text("notes"),

    // Who triggered this transaction (the user who confirmed the document).
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    // No updated_at — these rows are immutable by design.
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    // Primary query: compute current stock for a product across an org.
    index("inv_tx_org_product_idx").on(table.organizationId, table.productId),

    // Used when fetching all ledger rows for a document (e.g., to build reversal rows on cancel).
    index("inv_tx_ref_idx").on(table.referenceType, table.referenceId),

    // Used for warehouse-specific stock queries.
    index("inv_tx_org_warehouse_idx").on(table.organizationId, table.warehouseId),
  ],
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const inventoryTransactionsRelations = relations(inventoryTransactions, ({ one }) => ({
  organization: one(organizations, {
    fields: [inventoryTransactions.organizationId],
    references: [organizations.id],
  }),
  product: one(products, {
    fields: [inventoryTransactions.productId],
    references: [products.id],
  }),
  warehouse: one(warehouses, {
    fields: [inventoryTransactions.warehouseId],
    references: [warehouses.id],
  }),
  createdByUser: one(users, {
    fields: [inventoryTransactions.createdBy],
    references: [users.id],
  }),
}));

// ─── Types ────────────────────────────────────────────────────────────────────

export type InventoryTransaction = typeof inventoryTransactions.$inferSelect;
export type NewInventoryTransaction = typeof inventoryTransactions.$inferInsert;
