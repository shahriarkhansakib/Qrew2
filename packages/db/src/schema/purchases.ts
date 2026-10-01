/**
 * purchases.ts
 * Purchase document (header + line items) — stock-IN records from suppliers.
 *
 * IMPORTANT — Status gating:
 * Ledger rows in inventory_transactions are written ONLY when status moves
 * DRAFT → CONFIRMED. Editing or deleting a DRAFT never touches the ledger.
 * Cancelling a CONFIRMED purchase writes reversing rows (not deletes).
 *
 * Supplier = existing `clients` table (intentional reuse — clients already
 * represents external parties that money flows to/from).
 */

import { relations } from "drizzle-orm";
import { decimal, index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { clients } from "./clients";
import { documentStatusEnum, stockStateEnum } from "./inventory-enums";
import { inventoryTransactions } from "./inventory-transactions";
import { products } from "./products";
import { warehouses } from "./warehouses";

// ─── Purchase Header ──────────────────────────────────────────────────────────

export const purchases = pgTable(
  "purchases",
  {
    id: text("id").primaryKey(),

    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    // Supplier — reuses the existing clients table (intentional design decision).
    supplierId: text("supplier_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),

    // Nullable — single-branch orgs don't need to pick a warehouse every time.
    warehouseId: text("warehouse_id").references(() => warehouses.id, { onDelete: "restrict" }),

    // Auto-generated as "PUR-001" format. Editable while in DRAFT status.
    purchaseNumber: text("purchase_number").notNull(),

    purchaseDate: timestamp("purchase_date", { mode: "date" }).notNull(),

    // DRAFT on creation; CONFIRMED writes ledger; CANCELLED writes reversals.
    status: documentStatusEnum("status").default("DRAFT").notNull(),

    // Financial totals (in org's base currency).
    subtotal: decimal("subtotal", { precision: 10, scale: 2 }).default("0").notNull(),
    discount: decimal("discount", { precision: 10, scale: 2 }).default("0").notNull(),
    tax: decimal("tax", { precision: 10, scale: 2 }).default("0").notNull(),
    totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).default("0").notNull(),

    notes: text("notes"),

    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Purchase numbers must be unique per org.
    unique("purchases_org_num_unique").on(table.organizationId, table.purchaseNumber),
    index("purchases_org_status_idx").on(table.organizationId, table.status),
    index("purchases_org_date_idx").on(table.organizationId, table.purchaseDate),
  ],
);

// ─── Purchase Line Items ──────────────────────────────────────────────────────

export const purchaseItems = pgTable(
  "purchase_items",
  {
    id: text("id").primaryKey(),

    purchaseId: text("purchase_id")
      .notNull()
      .references(() => purchases.id, { onDelete: "cascade" }),

    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),

    /**
     * Which stock state this line is for.
     * NORMAL products always use 'NORMAL'.
     * REFILLABLE products use 'FULL' (buying full cylinders) or 'EMPTY' (buying empty for refill).
     */
    stockState: stockStateEnum("stock_state").notNull(),

    // decimal(10,3) supports fractional units like 12.500 kg or 5.250 liters.
    quantity: decimal("quantity", { precision: 10, scale: 3 }).notNull(),
    unitCost: decimal("unit_cost", { precision: 10, scale: 2 }).notNull(),
    discount: decimal("discount", { precision: 10, scale: 2 }).default("0").notNull(),
    tax: decimal("tax", { precision: 10, scale: 2 }).default("0").notNull(),

    // total = (quantity * unitCost) - discount + tax
    total: decimal("total", { precision: 10, scale: 2 }).notNull(),

    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [index("purchase_items_purchase_idx").on(table.purchaseId)],
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const purchasesRelations = relations(purchases, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [purchases.organizationId],
    references: [organizations.id],
  }),
  supplier: one(clients, {
    fields: [purchases.supplierId],
    references: [clients.id],
  }),
  warehouse: one(warehouses, {
    fields: [purchases.warehouseId],
    references: [warehouses.id],
  }),
  createdByUser: one(users, {
    fields: [purchases.createdBy],
    references: [users.id],
  }),
  items: many(purchaseItems),
  // Ledger rows generated when this purchase is confirmed (or reversed on cancel).
  transactions: many(inventoryTransactions),
}));

export const purchaseItemsRelations = relations(purchaseItems, ({ one }) => ({
  purchase: one(purchases, {
    fields: [purchaseItems.purchaseId],
    references: [purchases.id],
  }),
  product: one(products, {
    fields: [purchaseItems.productId],
    references: [products.id],
  }),
}));

// ─── Types ────────────────────────────────────────────────────────────────────

export type Purchase = typeof purchases.$inferSelect;
export type NewPurchase = typeof purchases.$inferInsert;

export type PurchaseItem = typeof purchaseItems.$inferSelect;
export type NewPurchaseItem = typeof purchaseItems.$inferInsert;
