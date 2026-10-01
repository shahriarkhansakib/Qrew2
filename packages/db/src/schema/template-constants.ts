import { relations } from "drizzle-orm";
import { AnyPgColumn, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { invoiceTemplates } from "./invoice-templates";
import { tokens } from "./tokens";

export const templateConstants = pgTable("template_constants", {
  id: text("id")
    .primaryKey()
    .references((): AnyPgColumn => tokens.id, { onDelete: "cascade" }),
  templateId: text("template_id")
    .notNull()
    .references(() => invoiceTemplates.id, { onDelete: "cascade" }),
  defaultValue: text("default_value"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const templateConstantsRelations = relations(templateConstants, ({ one }) => ({
  token: one(tokens, {
    fields: [templateConstants.id],
    references: [tokens.id],
  }),
  template: one(invoiceTemplates, {
    fields: [templateConstants.templateId],
    references: [invoiceTemplates.id],
  }),
}));

export type TemplateConstant = typeof templateConstants.$inferSelect;
export type NewTemplateConstant = typeof templateConstants.$inferInsert;
