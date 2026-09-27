import { relations } from "drizzle-orm";
import { AnyPgColumn, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organizations } from "./auth";
import { tokens } from "./tokens";

export const expenseCategories = pgTable("expense_categories", {
  id: text("id")
    .primaryKey()
    .references((): AnyPgColumn => tokens.id, { onDelete: "cascade" }),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const expenseCategoriesRelations = relations(expenseCategories, ({ one }) => ({
  token: one(tokens, {
    fields: [expenseCategories.id],
    references: [tokens.id],
  }),
  organization: one(organizations, {
    fields: [expenseCategories.organizationId],
    references: [organizations.id],
  }),
}));

export type ExpenseCategory = typeof expenseCategories.$inferSelect;
export type NewExpenseCategory = typeof expenseCategories.$inferInsert;
