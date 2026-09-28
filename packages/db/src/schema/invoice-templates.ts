import { relations } from "drizzle-orm";
import {
  AnyPgColumn,
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { customFieldDefinitions } from "./custom_fields";
import { componentValueTypeEnum, headerFieldTypeEnum, templateScopeEnum } from "./invoice-enums";
import { tokens } from "./tokens";

// ─────────────────────────────────────────────────────────────────────────────
// INVOICE TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────
export const invoiceTemplates = pgTable(
  "invoice_templates",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    documentPrefix: text("document_prefix").default("INV").notNull(),
    numberingFormat: text("numbering_format").default("{PREFIX}-{YYYY}-{SEQ:4}").notNull(),
    scope: templateScopeEnum("scope").default("organization").notNull(),
    currency: text("currency").default("USD").notNull(),
    version: integer("version").default(1).notNull(),
    isArchived: boolean("is_archived").default(false).notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    sourceTemplateId: text("source_template_id").references(
      (): AnyPgColumn => invoiceTemplates.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("invoice_templates_org_scope_archived_idx").on(t.organizationId, t.scope, t.isArchived),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE SECTIONS
// Each template has ordered sections (A, B, C… or custom named).
// sectionToken is frozen after creation and used in SEC_X_BASE/TOTAL/CHARGES tokens.
// ─────────────────────────────────────────────────────────────────────────────
export const templateSections = pgTable(
  "template_sections",
  {
    id: text("id")
      .primaryKey()
      .references((): AnyPgColumn => tokens.id, { onDelete: "cascade" }),
    templateId: text("template_id")
      .notNull()
      .references(() => invoiceTemplates.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("template_sections_template_idx").on(t.templateId)],
);

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE ROWS
// ─────────────────────────────────────────────────────────────────────────────
export const templateRows = pgTable(
  "template_rows",
  {
    id: text("id")
      .primaryKey()
      .references((): AnyPgColumn => tokens.id, { onDelete: "cascade" }),
    templateId: text("template_id")
      .notNull()
      .references(() => invoiceTemplates.id, { onDelete: "cascade" }),
    sectionId: text("section_id")
      .notNull()
      .references(() => templateSections.id, { onDelete: "cascade" }),
    /** normal = manual entry / formula = engine-computed */
    valueType: componentValueTypeEnum("value_type").notNull().default("normal"),
    /**
     * Bare expression using {{$tok:UUID}} references.
     * Decoded to token names before engine evaluation.
     * Only present when valueType = 'formula'.
     */
    formula: text("formula"),
    /** Pre-fill value for manual entry rows. Stored as numeric string. */
    initialValue: numeric("initial_value", { precision: 20, scale: 6 }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("template_rows_template_section_idx").on(t.templateId, t.sectionId)],
);

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE ROW CHARGES
// ─────────────────────────────────────────────────────────────────────────────
export const templateRowCharges = pgTable(
  "template_row_charges",
  {
    id: text("id")
      .primaryKey()
      .references((): AnyPgColumn => tokens.id, { onDelete: "cascade" }),
    rowId: text("row_id")
      .notNull()
      .references(() => templateRows.id, { onDelete: "cascade" }),
    qualifier: text("qualifier"),
    tags: text("tags").array(),
    /**
     * Bare token expression using {{$tok:UUID}}.
     */
    formula: text("formula").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("template_row_charges_row_idx").on(t.rowId)],
);

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE SECTION CHARGES
// ─────────────────────────────────────────────────────────────────────────────
export const templateSectionCharges = pgTable(
  "template_section_charges",
  {
    id: text("id")
      .primaryKey()
      .references((): AnyPgColumn => tokens.id, { onDelete: "cascade" }),
    sectionId: text("section_id")
      .notNull()
      .references(() => templateSections.id, { onDelete: "cascade" }),
    templateId: text("template_id")
      .notNull()
      .references(() => invoiceTemplates.id, { onDelete: "cascade" }),
    qualifier: text("qualifier"),
    tags: text("tags").array(),
    /** The mathematical formula expression for this charge. */
    formula: text("formula").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("template_section_charges_section_idx").on(t.sectionId)],
);

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE HEADER FIELDS
// ─────────────────────────────────────────────────────────────────────────────
export const templateHeaderFields = pgTable(
  "template_header_fields",
  {
    id: text("id")
      .primaryKey()
      .references((): AnyPgColumn => tokens.id, { onDelete: "cascade" }),
    templateId: text("template_id")
      .notNull()
      .references(() => invoiceTemplates.id, { onDelete: "cascade" }),
    fieldType: headerFieldTypeEnum("field_type").notNull(),
    columnPosition: text("column_position").default("left").notNull(),
    customFieldDefinitionId: text("custom_field_definition_id").references(
      (): AnyPgColumn => customFieldDefinitions.id,
      { onDelete: "set null" },
    ),
    systemFieldKey: text("system_field_key"),
    orgConfigKey: text("org_config_key"),
    defaultManualValue: text("default_manual_value"),
    placeholder: text("placeholder"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("template_header_fields_template_idx").on(t.templateId)],
);

// ─────────────────────────────────────────────────────────────────────────────
// INVOICE TAG OPTIONS
// Organization-level tag vocabulary for row/charge label qualifiers.
// e.g. "AS PER PORT TARIFF", "AS PER AGREEMENT"
// ─────────────────────────────────────────────────────────────────────────────
export const invoiceTagOptions = pgTable(
  "invoice_tag_options",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    value: text("value").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    unique("invoice_tag_options_org_value_unique").on(t.organizationId, t.value),
    index("invoice_tag_options_org_idx").on(t.organizationId),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// RELATIONS
// ─────────────────────────────────────────────────────────────────────────────
export const invoiceTemplatesRelations = relations(invoiceTemplates, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [invoiceTemplates.organizationId],
    references: [organizations.id],
  }),
  createdByUser: one(users, {
    fields: [invoiceTemplates.createdByUserId],
    references: [users.id],
  }),
  sourceTemplate: one(invoiceTemplates, {
    fields: [invoiceTemplates.sourceTemplateId],
    references: [invoiceTemplates.id],
    relationName: "source_template",
  }),
  derivedTemplates: many(invoiceTemplates, {
    relationName: "source_template",
  }),
  sections: many(templateSections),
  rows: many(templateRows),
  sectionCharges: many(templateSectionCharges),
  headerFields: many(templateHeaderFields),
}));

export const templateRowsRelations = relations(templateRows, ({ one, many }) => ({
  token: one(tokens, {
    fields: [templateRows.id],
    references: [tokens.id],
  }),
  template: one(invoiceTemplates, {
    fields: [templateRows.templateId],
    references: [invoiceTemplates.id],
  }),
  section: one(templateSections, {
    fields: [templateRows.sectionId],
    references: [templateSections.id],
  }),
  charges: many(templateRowCharges),
}));

export const templateRowChargesRelations = relations(templateRowCharges, ({ one }) => ({
  token: one(tokens, {
    fields: [templateRowCharges.id],
    references: [tokens.id],
  }),
  row: one(templateRows, {
    fields: [templateRowCharges.rowId],
    references: [templateRows.id],
  }),
}));

export const templateSectionsRelations = relations(templateSections, ({ one, many }) => ({
  token: one(tokens, {
    fields: [templateSections.id],
    references: [tokens.id],
  }),
  template: one(invoiceTemplates, {
    fields: [templateSections.templateId],
    references: [invoiceTemplates.id],
  }),
  rows: many(templateRows),
  sectionCharges: many(templateSectionCharges),
}));

export const templateSectionChargesRelations = relations(templateSectionCharges, ({ one }) => ({
  token: one(tokens, {
    fields: [templateSectionCharges.id],
    references: [tokens.id],
  }),
  section: one(templateSections, {
    fields: [templateSectionCharges.sectionId],
    references: [templateSections.id],
  }),
  template: one(invoiceTemplates, {
    fields: [templateSectionCharges.templateId],
    references: [invoiceTemplates.id],
  }),
}));

export const templateHeaderFieldsRelations = relations(templateHeaderFields, ({ one }) => ({
  token: one(tokens, {
    fields: [templateHeaderFields.id],
    references: [tokens.id],
  }),
  template: one(invoiceTemplates, {
    fields: [templateHeaderFields.templateId],
    references: [invoiceTemplates.id],
  }),
  customFieldDefinition: one(customFieldDefinitions, {
    fields: [templateHeaderFields.customFieldDefinitionId],
    references: [customFieldDefinitions.id],
  }),
}));
export type InvoiceTemplate = typeof invoiceTemplates.$inferSelect;
export type NewInvoiceTemplate = typeof invoiceTemplates.$inferInsert;

export type TemplateSection = typeof templateSections.$inferSelect;
export type NewTemplateSection = typeof templateSections.$inferInsert;

export type TemplateRow = typeof templateRows.$inferSelect;
export type NewTemplateRow = typeof templateRows.$inferInsert;

export type TemplateRowCharge = typeof templateRowCharges.$inferSelect;
export type NewTemplateRowCharge = typeof templateRowCharges.$inferInsert;

export type TemplateSectionCharge = typeof templateSectionCharges.$inferSelect;
export type NewTemplateSectionCharge = typeof templateSectionCharges.$inferInsert;

export type TemplateHeaderField = typeof templateHeaderFields.$inferSelect;
export type NewTemplateHeaderField = typeof templateHeaderFields.$inferInsert;

export type InvoiceTagOption = typeof invoiceTagOptions.$inferSelect;
export type NewInvoiceTagOption = typeof invoiceTagOptions.$inferInsert;
