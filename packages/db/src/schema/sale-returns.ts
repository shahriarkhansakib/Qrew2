/**
 * sale-returns.ts
 * Sale Return documents (header + line items) — stock-IN return records from customers.
 */

import { relations } from "drizzle-orm";
import { decimal, index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { customers } from "./customers";
import { documentStatusEnum, stockStateEnum } from "./inventory-enums";
import { products } from "./products";
import { saleItems } from "./sales";
import { warehouses } from "./warehouses";

// ─── Sale Return Header ────────────────────────────────────────────────────────

export const saleReturns = pgTable(
  "sale_returns",
  {
    id: text("id").primaryKey(),

    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),

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
    unique("sale_returns_org_num_unique").on(table.organizationId, table.returnNumber),
    index("sale_returns_org_status_idx").on(table.organizationId, table.status),
    index("sale_returns_org_date_idx").on(table.organizationId, table.returnDate),
  ],
);

// ─── Sale Return Line Items ───────────────────────────────────────────────────

export const saleReturnItems = pgTable(
  "sale_return_items",
  {
    id: text("id").primaryKey(),

    saleReturnId: text("sale_return_id")
      .notNull()
      .references(() => saleReturns.id, { onDelete: "cascade" }),

    originalSaleItemId: text("original_sale_item_id")
      .notNull()
      .references(() => saleItems.id, { onDelete: "restrict" }),

    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),

    stockState: stockStateEnum("stock_state").default("NORMAL").notNull(),

    quantity: decimal("quantity", { precision: 10, scale: 3 }).notNull(),
    unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
    discount: decimal("discount", { precision: 10, scale: 2 }).default("0").notNull(),
    tax: decimal("tax", { precision: 10, scale: 2 }).default("0").notNull(),
    total: decimal("total", { precision: 10, scale: 2 }).notNull(),

    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("sale_return_items_return_idx").on(table.saleReturnId),
    index("sale_return_items_orig_item_idx").on(table.originalSaleItemId),
  ],
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const saleReturnsRelations = relations(saleReturns, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [saleReturns.organizationId],
    references: [organizations.id],
  }),
  customer: one(customers, {
    fields: [saleReturns.customerId],
    references: [customers.id],
  }),
  warehouse: one(warehouses, {
    fields: [saleReturns.warehouseId],
    references: [warehouses.id],
  }),
  createdByUser: one(users, {
    fields: [saleReturns.createdBy],
    references: [users.id],
  }),
  items: many(saleReturnItems),
}));

export const saleReturnItemsRelations = relations(saleReturnItems, ({ one }) => ({
  saleReturn: one(saleReturns, {
    fields: [saleReturnItems.saleReturnId],
    references: [saleReturns.id],
  }),
  originalSaleItem: one(saleItems, {
    fields: [saleReturnItems.originalSaleItemId],
    references: [saleItems.id],
  }),
  product: one(products, {
    fields: [saleReturnItems.productId],
    references: [products.id],
  }),
}));

// ─── Types ────────────────────────────────────────────────────────────────────

export type SaleReturn = typeof saleReturns.$inferSelect;
export type NewSaleReturn = typeof saleReturns.$inferInsert;

export type SaleReturnItem = typeof saleReturnItems.$inferSelect;
export type NewSaleReturnItem = typeof saleReturnItems.$inferInsert;
