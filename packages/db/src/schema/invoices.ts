import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { clients } from "./clients";
import { invoiceStatusEnum } from "./invoice-enums";
import { invoiceTemplates } from "./invoice-templates";
import { projects } from "./projects";

export const invoices = pgTable(
  "invoices",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    documentNumber: text("document_number").notNull(),
    status: invoiceStatusEnum("status").default("draft").notNull(),
    sourceTemplateId: text("source_template_id").references(() => invoiceTemplates.id, {
      onDelete: "set null",
    }),
    sourceTemplateVersion: integer("source_template_version"),
    generatedByUserId: text("generated_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    issuedToClientName: text("issued_to_client_name").notNull(),
    currency: text("currency").default("USD").notNull(),
    totalBaseAmount: numeric("total_base_amount", { precision: 20, scale: 6 }).notNull(),
    totalChargesAmount: numeric("total_charges_amount", { precision: 20, scale: 6 }).notNull(),
    grandTotalAmount: numeric("grand_total_amount", { precision: 20, scale: 6 }).notNull(),
    notes: text("notes"),
    historicalFormat: jsonb("historical_format").$type<any>(),
    resolvedScope: jsonb("resolved_scope").$type<any>(),
    resolvedHeaderValues: jsonb("resolved_header_values").$type<any>(),
    schemaVersion: text("schema_version").default("1.0").notNull(),
    frozenAt: timestamp("frozen_at", { mode: "date" }),
    issuedAt: timestamp("issued_at", { mode: "date" }),
    dueAt: timestamp("due_at", { mode: "date" }),
    paidAt: timestamp("paid_at", { mode: "date" }),
    voidedAt: timestamp("voided_at", { mode: "date" }),
    voidReason: text("void_reason"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("invoices_org_docnum_unique").on(table.organizationId, table.documentNumber),
    index("invoices_org_status_idx").on(table.organizationId, table.status),
    index("invoices_org_project_idx").on(table.organizationId, table.projectId),
    index("invoices_org_created_idx").on(table.organizationId, table.createdAt),
  ],
);

export const invoiceLineItems = pgTable(
  "invoice_line_items",
  {
    id: text("id").primaryKey(),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    sectionToken: text("section_token"),
    sectionLabel: text("section_label"),
    /**
     * For normal/multi-value rows: the parent rowToken.
     * For row charges: the chargeToken.
     * For section charges: the chargeToken.
     */
    rowToken: text("row_token").notNull(),
    /**
     * Discriminates the line type for rendering.
     * 'row'             = parent row (summary line)
     * 'row_component'   = sub-value within a multi-value parent
     * 'row_charge'      = charge line bound to a row
     * 'section_charge'  = charge line bound to a section
     * 'grand_total'     = auto-generated grand total line
     */
    lineType: text("line_type").notNull().default("row"),
    label: text("label").notNull(),
    subDescription: text("sub_description"),
    qualifier: text("qualifier"),
    tags: text("tags").array(),
    /** JSON snapshot of formula expression at time of freeze (if formula-driven). */
    formulaSnapshot: text("formula_snapshot"),
    /** Frozen sub-component values for multi-value rows. */
    componentsSnapshot: jsonb("components_snapshot").$type<any>(),
    /** Frozen row charge values for rows that have charges. */
    chargesSnapshot: jsonb("charges_snapshot").$type<any>(),
    /** Sum of sub-component values (or the single value for normal rows). */
    baseValue: numeric("base_value", { precision: 20, scale: 6 }).notNull(),
    /** Sum of row charges bound to this row (0 if no charges). */
    chargesValue: numeric("charges_value", { precision: 20, scale: 6 }).default("0").notNull(),
    /** baseValue + chargesValue */
    totalValue: numeric("total_value", { precision: 20, scale: 6 }).notNull(),
    computationCurrency: text("computation_currency").default("USD").notNull(),
    isVisible: boolean("is_visible").default(true).notNull(),
    displayOrder: integer("display_order").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("invoice_line_items_invoice_order_idx").on(table.invoiceId, table.displayOrder),
  ],
);

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [invoices.organizationId],
    references: [organizations.id],
  }),
  project: one(projects, {
    fields: [invoices.projectId],
    references: [projects.id],
  }),
  client: one(clients, {
    fields: [invoices.clientId],
    references: [clients.id],
  }),
  generatedByUser: one(users, {
    fields: [invoices.generatedByUserId],
    references: [users.id],
  }),
  sourceTemplate: one(invoiceTemplates, {
    fields: [invoices.sourceTemplateId],
    references: [invoiceTemplates.id],
  }),
  lineItems: many(invoiceLineItems),
}));

export const invoiceLineItemsRelations = relations(invoiceLineItems, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceLineItems.invoiceId],
    references: [invoices.id],
  }),
}));

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;

export type InvoiceLineItem = typeof invoiceLineItems.$inferSelect;
export type NewInvoiceLineItem = typeof invoiceLineItems.$inferInsert;

// LineType is exported from invoice-types.ts — do not re-declare here
