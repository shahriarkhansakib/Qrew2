import { relations } from "drizzle-orm";
import {
  AnyPgColumn,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { organizations } from "./auth";
import { configValueTypeEnum, tokenDomainEnum } from "./invoice-enums";
import { invoiceTemplates } from "./invoice-templates";

export const tokens = pgTable(
  "tokens",
  {
    id: text("id").primaryKey(),
    tokenKey: text("token_key").notNull(),
    label: text("label").notNull(),
    description: text("description"),
    domain: tokenDomainEnum("domain").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    templateId: text("template_id").references((): AnyPgColumn => invoiceTemplates.id, {
      onDelete: "cascade",
    }),
    sortOrder: integer("sort_order").default(0).notNull(),
    valueType: configValueTypeEnum("value_type").default("number"),
    isInjectable: boolean("is_injectable").default(true).notNull(),
    isSystem: boolean("is_system").default(false).notNull(),
    isVisible: boolean("is_visible").default(true).notNull(),
    deprecatedAt: timestamp("deprecated_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("tokens_template_key_unique").on(t.templateId, t.tokenKey),
    unique("tokens_org_key_unique").on(t.organizationId, t.tokenKey, t.domain),
    index("tokens_template_domain_idx").on(t.templateId, t.domain),
    index("tokens_org_domain_idx").on(t.organizationId, t.domain),
  ],
);

export const tokensRelations = relations(tokens, ({ one }) => ({
  organization: one(organizations, {
    fields: [tokens.organizationId],
    references: [organizations.id],
  }),
  template: one(invoiceTemplates, {
    fields: [tokens.templateId],
    references: [invoiceTemplates.id],
  }),
}));

export type Token = typeof tokens.$inferSelect;
export type NewToken = typeof tokens.$inferInsert;
export type TokenDomain = (typeof tokenDomainEnum.enumValues)[number];
