import { relations, sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { invoiceTemplates, TemplateColumnDefinition } from "./invoice-templates";

export interface ExpenseSheetEditAuditEntry {
  userId: string;
  userName: string;
  userEmail?: string;
  editedAt: string;
  action?: string;
}

export const expenseSheets = pgTable(
  "expense_sheets",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    templateId: text("template_id").references(() => invoiceTemplates.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    description: text("description"),
    documentNumber: text("document_number"),
    periodStart: timestamp("period_start", { mode: "date" }),
    periodEnd: timestamp("period_end", { mode: "date" }),
    status: text("status").default("draft").notNull(), // "draft" | "submitted" | "approved" | "archived"
    columnDefinitions: jsonb("column_definitions")
      .$type<TemplateColumnDefinition[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    sections: jsonb("sections").$type<any[]>().default(sql`'[]'::jsonb`).notNull(),
    editHistory: jsonb("edit_history")
      .$type<ExpenseSheetEditAuditEntry[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("expense_sheets_org_idx").on(t.organizationId),
    index("expense_sheets_status_idx").on(t.organizationId, t.status),
    index("expense_sheets_template_idx").on(t.templateId),
  ],
);

export const expenseSheetsRelations = relations(expenseSheets, ({ one }) => ({
  organization: one(organizations, {
    fields: [expenseSheets.organizationId],
    references: [organizations.id],
  }),
  template: one(invoiceTemplates, {
    fields: [expenseSheets.templateId],
    references: [invoiceTemplates.id],
  }),
  createdByUser: one(users, {
    fields: [expenseSheets.createdByUserId],
    references: [users.id],
  }),
}));
