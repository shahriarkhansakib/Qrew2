import { relations } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { documentTypeEnum } from "./invoice-enums";
import { invoiceTemplates } from "./invoice-templates";
import { invoices } from "./invoices";
import { projects } from "./projects";

export const invoiceDrafts = pgTable(
  "invoice_drafts",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceTemplateId: text("source_template_id").references(() => invoiceTemplates.id, {
      onDelete: "set null",
    }),
    sourceTemplateVersion: integer("source_template_version"),
    name: text("name").default("Draft").notNull(),
    description: text("description"),
    draftHeaderFields: jsonb("draft_header_fields").$type<any>().default([]).notNull(),
    draftHeaderValues: jsonb("draft_header_values").$type<any>().default({}).notNull(),
    draftConstants: jsonb("draft_constants").$type<any>().default({}).notNull(),
    draftSections: jsonb("draft_sections").$type<any>().default([]).notNull(),
    lastAutoSavedAt: timestamp("last_auto_saved_at", { mode: "date" }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [unique("invoice_drafts_project_user_unique").on(table.projectId, table.userId)],
);

export const invoiceReservedNumbers = pgTable(
  "invoice_reserved_numbers",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    documentType: documentTypeEnum("document_type").notNull(),
    documentNumber: text("document_number").notNull(),
    isUsed: boolean("is_used").default(false).notNull(),
    usedByInvoiceId: text("used_by_invoice_id").references(() => invoices.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    unique("invoice_reserved_numbers_project_doctype_unique").on(
      table.projectId,
      table.documentType,
    ),
  ],
);

export const invoiceDraftsRelations = relations(invoiceDrafts, ({ one }) => ({
  organization: one(organizations, {
    fields: [invoiceDrafts.organizationId],
    references: [organizations.id],
  }),
  project: one(projects, {
    fields: [invoiceDrafts.projectId],
    references: [projects.id],
  }),
  user: one(users, {
    fields: [invoiceDrafts.userId],
    references: [users.id],
  }),
  sourceTemplate: one(invoiceTemplates, {
    fields: [invoiceDrafts.sourceTemplateId],
    references: [invoiceTemplates.id],
  }),
}));

export const invoiceReservedNumbersRelations = relations(invoiceReservedNumbers, ({ one }) => ({
  organization: one(organizations, {
    fields: [invoiceReservedNumbers.organizationId],
    references: [organizations.id],
  }),
  project: one(projects, {
    fields: [invoiceReservedNumbers.projectId],
    references: [projects.id],
  }),
  invoice: one(invoices, {
    fields: [invoiceReservedNumbers.usedByInvoiceId],
    references: [invoices.id],
  }),
}));

export type InvoiceDraft = typeof invoiceDrafts.$inferSelect;
export type NewInvoiceDraft = typeof invoiceDrafts.$inferInsert;

export type InvoiceReservedNumber = typeof invoiceReservedNumbers.$inferSelect;
export type NewInvoiceReservedNumber = typeof invoiceReservedNumbers.$inferInsert;
