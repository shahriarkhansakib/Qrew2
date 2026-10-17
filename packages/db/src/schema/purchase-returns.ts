/**
 * purchase-returns.ts
 * Purchase Return documents (header + line items) — stock-OUT return records to suppliers.
 */

import { relations } from "drizzle-orm";
import { decimal, index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { clients } from "./clients";
import { documentStatusEnum, stockStateEnum } from "./inventory-enums";
import { products } from "./products";
import { purchaseItems } from "./purchases";
import { warehouses } from "./warehouses";

// ─── Purchase Return Header ───────────────────────────────────────────────────

export const purchaseReturns = pgTable(
  "purchase_returns",
  {
    id: text("id").primaryKey(),

    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    supplierId: text("supplier_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),

    warehouseId: text("warehouse_id").references(() => warehouses.id, { onDelete: "restrict" }),

    returnNumber: text("return_number").notNull(),

    returnDate: timestamp("return_date", { mode: "date" }).notNull(),

    status: documentStatusEnum("status").default("DRAFT").notNull(),

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
    unique("purchase_returns_org_num_unique").on(table.organizationId, table.returnNumber),
    index("purchase_returns_org_status_idx").on(table.organizationId, table.status),
    index("purchase_returns_org_date_idx").on(table.organizationId, table.returnDate),
  ],
);

// ─── Purchase Return Line Items ───────────────────────────────────────────────

export const purchaseReturnItems = pgTable(
  "purchase_return_items",
  {
    id: text("id").primaryKey(),

    purchaseReturnId: text("purchase_return_id")
      .notNull()
      .references(() => purchaseReturns.id, { onDelete: "cascade" }),

    originalPurchaseItemId: text("original_purchase_item_id")
      .notNull()
      .references(() => purchaseItems.id, { onDelete: "restrict" }),

    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),

    stockState: stockStateEnum("stock_state").default("NORMAL").notNull(),

    quantity: decimal("quantity", { precision: 10, scale: 3 }).notNull(),
    unitCost: decimal("unit_cost", { precision: 10, scale: 2 }).notNull(),
    discount: decimal("discount", { precision: 10, scale: 2 }).default("0").notNull(),
    tax: decimal("tax", { precision: 10, scale: 2 }).default("0").notNull(),
    total: decimal("total", { precision: 10, scale: 2 }).notNull(),

    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("purchase_return_items_return_idx").on(table.purchaseReturnId),
    index("purchase_return_items_orig_item_idx").on(table.originalPurchaseItemId),
  ],
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const purchaseReturnsRelations = relations(purchaseReturns, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [purchaseReturns.organizationId],
    references: [organizations.id],
  }),
  supplier: one(clients, {
    fields: [purchaseReturns.supplierId],
    references: [clients.id],
  }),
  warehouse: one(warehouses, {
    fields: [purchaseReturns.warehouseId],
    references: [warehouses.id],
  }),
  createdByUser: one(users, {
    fields: [purchaseReturns.createdBy],
    references: [users.id],
  }),
  items: many(purchaseReturnItems),
}));

export const purchaseReturnItemsRelations = relations(purchaseReturnItems, ({ one }) => ({
  purchaseReturn: one(purchaseReturns, {
    fields: [purchaseReturnItems.purchaseReturnId],
    references: [purchaseReturns.id],
  }),
  originalPurchaseItem: one(purchaseItems, {
    fields: [purchaseReturnItems.originalPurchaseItemId],
    references: [purchaseItems.id],
  }),
  product: one(products, {
    fields: [purchaseReturnItems.productId],
    references: [products.id],
  }),
}));

// ─── Types ────────────────────────────────────────────────────────────────────

export type PurchaseReturn = typeof purchaseReturns.$inferSelect;
export type NewPurchaseReturn = typeof purchaseReturns.$inferInsert;

export type PurchaseReturnItem = typeof purchaseReturnItems.$inferSelect;
export type NewPurchaseReturnItem = typeof purchaseReturnItems.$inferInsert;
