/**
 * sales.ts
 * Sale document (header + line items) — stock-OUT records to customers.
 *
 * IMPORTANT — Confirm is concurrency-safe:
 * confirmSale() uses SELECT FOR UPDATE on the products rows inside a transaction
 * before computing and deducting stock. This prevents two concurrent sales from
 * both reading the same stock level and driving it negative.
 */

import { relations } from "drizzle-orm";
import { decimal, index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { customers } from "./customers";
import { documentStatusEnum, stockStateEnum } from "./inventory-enums";
import { inventoryTransactions } from "./inventory-transactions";
import { products } from "./products";
import { warehouses } from "./warehouses";

// ─── Sale Header ──────────────────────────────────────────────────────────────

export const sales = pgTable(
  "sales",
  {
    id: text("id").primaryKey(),

    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),

    // Nullable — single-branch orgs can skip warehouse selection.
    warehouseId: text("warehouse_id").references(() => warehouses.id, { onDelete: "restrict" }),

    // Auto-generated as "SAL-001" format. Editable while in DRAFT status.
    saleNumber: text("sale_number").notNull(),

    saleDate: timestamp("sale_date", { mode: "date" }).notNull(),

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
    unique("sales_org_num_unique").on(table.organizationId, table.saleNumber),
    index("sales_org_status_idx").on(table.organizationId, table.status),
    index("sales_org_date_idx").on(table.organizationId, table.saleDate),
  ],
);

// ─── Sale Line Items ──────────────────────────────────────────────────────────

export const saleItems = pgTable(
  "sale_items",
  {
    id: text("id").primaryKey(),

    saleId: text("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "cascade" }),

    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),

    stockState: stockStateEnum("stock_state").notNull(),

    quantity: decimal("quantity", { precision: 10, scale: 3 }).notNull(),
    unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
    discount: decimal("discount", { precision: 10, scale: 2 }).default("0").notNull(),
    tax: decimal("tax", { precision: 10, scale: 2 }).default("0").notNull(),

    // total = (quantity * unitPrice) - discount + tax
    total: decimal("total", { precision: 10, scale: 2 }).notNull(),

    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [index("sale_items_sale_idx").on(table.saleId)],
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const salesRelations = relations(sales, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [sales.organizationId],
    references: [organizations.id],
  }),
  customer: one(customers, {
    fields: [sales.customerId],
    references: [customers.id],
  }),
  warehouse: one(warehouses, {
    fields: [sales.warehouseId],
    references: [warehouses.id],
  }),
  createdByUser: one(users, {
    fields: [sales.createdBy],
    references: [users.id],
  }),
  items: many(saleItems),
  transactions: many(inventoryTransactions),
}));

export const saleItemsRelations = relations(saleItems, ({ one }) => ({
  sale: one(sales, {
    fields: [saleItems.saleId],
    references: [sales.id],
  }),
  product: one(products, {
    fields: [saleItems.productId],
    references: [products.id],
  }),
}));

// ─── Types ────────────────────────────────────────────────────────────────────

export type Sale = typeof sales.$inferSelect;
export type NewSale = typeof sales.$inferInsert;

export type SaleItem = typeof saleItems.$inferSelect;
export type NewSaleItem = typeof saleItems.$inferInsert;
