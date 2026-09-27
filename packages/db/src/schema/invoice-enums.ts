import { pgEnum } from "drizzle-orm/pg-core";

// ── Template scope ────────────────────────────────────────────────────────────
export const templateScopeEnum = pgEnum("template_scope_enum", ["organization", "preset"]);

// ── Component value type (replaces old rowTypeEnum for computation purpose) ──
// 'normal'  = manual entry, optional initialValue pre-fill
// 'formula' = computed by engine from a bare-token expression
export const componentValueTypeEnum = pgEnum("component_value_type_enum", ["normal", "formula"]);

// ── Section charge formula base ───────────────────────────────────────────────
// Controls which section aggregate is used as the base in a section charge formula.
// System prepends SEC_<TOKEN>_ automatically.
// 'BASE'    = sum of all parent row base values (no charges)
// 'TOTAL'   = sum of all parent row totals (base + row charges)
// 'CHARGES' = sum of only the row charges in the section
export const sectionChargeBaseEnum = pgEnum("section_charge_base_enum", [
  "BASE",
  "TOTAL",
  "CHARGES",
]);

// ── Header field type ─────────────────────────────────────────────────────────
export const headerFieldTypeEnum = pgEnum("header_field_type_enum", [
  "file_field",
  "org_constant",
  "manual",
]);

// ── Invoice lifecycle status ──────────────────────────────────────────────────
export const invoiceStatusEnum = pgEnum("invoice_status_enum", [
  "draft",
  "frozen",
  "issued",
  "paid",
  "void",
  "disputed",
]);

// ── Invoice document type ─────────────────────────────────────────────────────
export const documentTypeEnum = pgEnum("document_type_enum", ["pda", "fda", "proforma", "general"]);

// ── Org config value type ─────────────────────────────────────────────────────
export const configValueTypeEnum = pgEnum("config_value_type_enum", [
  "number",
  "percentage",
  "currency_rate",
  "text",
]);

// ── Token Domain ──────────────────────────────────────────────────────────────
export const tokenDomainEnum = pgEnum("token_domain", [
  "row",
  "row_charge",
  "section",
  "section_charge",
  "template_constant",
  "file_field",
  "global_constant",
  "expense_category",
]);
