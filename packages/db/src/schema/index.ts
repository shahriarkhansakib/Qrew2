/**
 * Central schema export.
 *
 * Every schema file in this folder is re-exported from here.
 * - drizzle-kit reads this to discover all tables for migrations
 * - Application code imports tables and types from '@starter/db'
 *   which resolves through src/index.ts → src/schema/index.ts
 *
 * When adding a new schema file (e.g. org.ts in Phase 2),
 * add a single line here: export * from './org'
 */
export * from "./auth";
export * from "./brands";
export * from "./clients";
export * from "./custom_fields";
export * from "./customers";
export * from "./expense_categories";
export * from "./expenses";
// ─── Inventory Module ─────────────────────────────────────────────────────────
export * from "./inventory-enums";
export * from "./inventory-transactions";
export * from "./invoice-configs";
export * from "./invoice-enums";
export * from "./invoice-instances";
export * from "./invoice-templates";
export * from "./invoice-types";
export * from "./invoices";
export * from "./org-document-counters";
export * from "./pbac";
export * from "./product-categories";
export * from "./products";
export * from "./project_attachments";
export * from "./project-status-fields";
export * from "./project-status-transitions";
export * from "./project-statuses";
export * from "./projects";
export * from "./purchase-returns";
export * from "./purchases";
export * from "./requisitions";
export * from "./sale-returns";
export * from "./sales";
export * from "./template-constants";
export * from "./tokens";
export * from "./wallet_transactions";
export * from "./warehouses";
