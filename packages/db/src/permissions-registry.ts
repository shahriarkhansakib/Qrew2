/**
 * permissions-registry.ts
 *
 * CANONICAL SINGLE SOURCE OF TRUTH for all PBAC (Permission-Based Access Control)
 * permissions across the entire platform.
 *
 * Rules:
 * 1. Every permission in the database must be defined here in `PERMISSIONS_CATALOG`.
 * 2. All permissions follow the canonical `<domain>:<action>` naming convention.
 * 3. Never use raw magic strings in API routes or frontend `<Can>` gates.
 *    Always use the strongly-typed `AppPermission` type.
 * 4. Role mappings belong in `org-initializer.ts`, NOT in this definitions catalog.
 */

export const PERMISSIONS_CATALOG = [
  // =========================================================================
  // 1. Clients
  // =========================================================================
  {
    key: "client:view",
    category: "Clients",
    description: "View client list and basic profiles",
  },
  {
    key: "client:view_details",
    category: "Clients",
    description: "View detailed non-sensitive client fields",
  },
  {
    key: "client:view_sensitive",
    category: "Clients",
    description: "View sensitive client fields",
  },
  {
    key: "client:create",
    category: "Clients",
    description: "Add new clients",
  },
  {
    key: "client:edit",
    category: "Clients",
    description: "Update client details",
  },
  {
    key: "client:archive",
    category: "Clients",
    description: "Soft-delete / archive clients",
  },
  {
    key: "client:restore",
    category: "Clients",
    description: "Restore archived clients",
  },
  {
    key: "client:delete",
    category: "Clients",
    description: "Permanently delete clients",
  },
  {
    key: "client:view_archived",
    category: "Clients",
    description: "View archived clients list",
  },

  // =========================================================================
  // 2. Operational Files / Projects
  // =========================================================================
  {
    key: "file:view",
    category: "Files",
    description: "View operational files and projects list",
  },
  {
    key: "file:view_details",
    category: "Files",
    description: "View detailed non-sensitive file fields",
  },
  {
    key: "file:view_sensitive",
    category: "Files",
    description: "View sensitive file fields",
  },
  {
    key: "file:create",
    category: "Files",
    description: "Create new operational files / projects",
  },
  {
    key: "file:edit",
    category: "Files",
    description: "Edit existing files / projects",
  },
  {
    key: "file:archive",
    category: "Files",
    description: "Soft-delete / archive operational files",
  },
  {
    key: "file:restore",
    category: "Files",
    description: "Restore archived operational files",
  },
  {
    key: "file:delete",
    category: "Files",
    description: "Permanently delete operational files",
  },
  {
    key: "file:view_archived",
    category: "Files",
    description: "View archived operational files",
  },
  {
    key: "file:advance_status",
    category: "Files",
    description: "Advance a file from one workflow status to another",
  },

  // =========================================================================
  // 3. Financials
  // =========================================================================
  {
    key: "finance:view_expenses",
    category: "Financials",
    description: "View expense and requisition histories",
  },
  {
    key: "finance:record_expense",
    category: "Financials",
    description: "Record or edit finalized expenses against files",
  },
  {
    key: "finance:request_funds",
    category: "Financials",
    description: "Submit requests for money (Maker)",
  },
  {
    key: "finance:approve_funds",
    category: "Financials",
    description: "Approve or deny money requests / requisitions (Checker)",
  },
  {
    key: "finance:view_wallets",
    category: "Financials",
    description: "View organization staff wallets and basic balances",
  },
  {
    key: "finance:view_wallet_details",
    category: "Financials",
    description: "View granular wallet transaction history and details",
  },
  {
    key: "finance:manage_wallets",
    category: "Financials",
    description: "Manually adjust wallet balances and disburse funds",
  },
  {
    key: "finance:manage_categories",
    category: "Financials",
    description: "Create, edit, and delete expense categories",
  },
  {
    key: "finance:view_invoices",
    category: "Financials",
    description: "View invoices and billing records",
  },
  {
    key: "finance:manage_invoices",
    category: "Financials",
    description: "Full administrative access to manage all invoices and drafts",
  },

  // =========================================================================
  // 4. Invoicing (Granular Atomic PBAC Architecture)
  // =========================================================================
  {
    key: "invoice:view",
    category: "Invoicing",
    description: "View generated invoices, drafts, and previews",
  },
  {
    key: "invoice:create_draft",
    category: "Invoicing",
    description: "Create new invoice drafts from templates",
  },
  {
    key: "invoice:fill_values",
    category: "Invoicing",
    description: "Enter manual numbers, rates, and values on drafts",
  },
  {
    key: "invoice:edit_line_labels",
    category: "Invoicing",
    description: "Customize line item display labels, descriptions, and notes on drafts",
  },
  {
    key: "invoice:manage_optional_rows",
    category: "Invoicing",
    description: "Add or remove prebuilt optional service line items on drafts",
  },
  {
    key: "invoice:author_formulas",
    category: "Invoicing",
    description: "Use draft builder mode to write custom formulas, ad-hoc rows, and edit constants",
  },
  {
    key: "invoice:finalize",
    category: "Invoicing",
    description: "Finalize and freeze invoice drafts into issued invoices (Ready to Bill)",
  },
  {
    key: "invoice:revert",
    category: "Invoicing",
    description: "Revert frozen or issued invoices back to draft for correction",
  },
  {
    key: "invoice:void",
    category: "Invoicing",
    description: "Void issued or paid invoices",
  },
  {
    key: "invoice:delete",
    category: "Invoicing",
    description: "Permanently delete draft invoices",
  },

  // =========================================================================
  // 5. Invoice Templates
  // =========================================================================
  {
    key: "template:view",
    category: "Invoice Templates",
    description: "View available invoice templates",
  },
  {
    key: "template:create",
    category: "Invoice Templates",
    description: "Create new invoice templates",
  },
  {
    key: "template:edit",
    category: "Invoice Templates",
    description: "Update existing invoice templates and catalog",
  },
  {
    key: "template:delete",
    category: "Invoice Templates",
    description: "Remove invoice templates",
  },

  // =========================================================================
  // 6. Staff Management
  // =========================================================================
  {
    key: "staff:view",
    category: "Staff",
    description: "View staff directory and member profiles",
  },
  {
    key: "staff:view_details",
    category: "Staff",
    description: "View detailed staff profile fields",
  },
  {
    key: "staff:view_sensitive",
    category: "Staff",
    description: "View sensitive staff profile fields",
  },
  {
    key: "staff:invite",
    category: "Staff",
    description: "Send email invitations and manage pending invites",
  },
  {
    key: "staff:create",
    category: "Staff",
    description: "Directly provision and create staff accounts",
  },
  {
    key: "staff:edit_role",
    category: "Staff",
    description: "Change another staff member's role",
  },
  {
    key: "staff:revoke",
    category: "Staff",
    description: "Revoke access and remove staff from workspace",
  },

  // =========================================================================
  // 7. Roles & Permissions
  // =========================================================================
  {
    key: "role:view",
    category: "Roles",
    description: "View custom roles and assigned permissions",
  },
  {
    key: "role:create",
    category: "Roles",
    description: "Create new custom roles",
  },
  {
    key: "role:edit",
    category: "Roles",
    description: "Modify role permissions, descriptions, and names",
  },
  {
    key: "role:delete",
    category: "Roles",
    description: "Delete custom roles",
  },
  {
    key: "role:manage",
    category: "Roles",
    description: "Full management of organization custom roles",
  },

  // =========================================================================
  // 8. Workspace & Organization Settings
  // =========================================================================
  {
    key: "workspace:view",
    category: "Workspace",
    description: "View workspace overview and configuration",
  },
  {
    key: "workspace:manage_settings",
    category: "Workspace",
    description: "Manage organization settings, defaults, and policies",
  },
  {
    key: "workspace:manage_fields",
    category: "Workspace",
    description: "Create and edit custom fields for clients, files, and staff",
  },
  {
    key: "workspace:manage_billing",
    category: "Workspace",
    description: "Manage subscription plans and billing settings",
  },

  // =========================================================================
  // 9. Workflows & Statuses
  // =========================================================================
  {
    key: "workflow:view",
    category: "Workflows",
    description: "View workflow status graphs and stage field assignments",
  },
  {
    key: "workflow:manage",
    category: "Workflows",
    description: "Create/edit status nodes, transitions, and stage fields",
  },

  // =========================================================================
  // 10. Audit & Activity Trails
  // =========================================================================
  {
    key: "audit:view",
    category: "Audit",
    description: "View activity logs and audit trails for accountability",
  },

  // =========================================================================
  // 11. Inventory — Products & Catalog
  // =========================================================================
  {
    key: "inventory:view_products",
    category: "Inventory",
    description: "View product catalog and pricing",
  },
  {
    key: "inventory:view_cost_price",
    category: "Inventory",
    description: "View product cost / purchase prices (sensitive financial data)",
  },
  {
    key: "inventory:create_product",
    category: "Inventory",
    description: "Add new products to the catalog",
  },
  {
    key: "inventory:edit_product",
    category: "Inventory",
    description: "Edit product details and specifications",
  },
  {
    key: "inventory:delete_product",
    category: "Inventory",
    description: "Delete products from catalog",
  },
  {
    key: "inventory:manage_categories",
    category: "Inventory",
    description: "Create, edit, and delete product categories",
  },
  {
    key: "inventory:manage_brands",
    category: "Inventory",
    description: "Create, edit, and delete product brands",
  },

  // =========================================================================
  // 12. Inventory — Customers
  // =========================================================================
  {
    key: "inventory:view_customers",
    category: "Inventory",
    description: "View inventory customer directory",
  },
  {
    key: "inventory:create_customer",
    category: "Inventory",
    description: "Add new inventory customers",
  },
  {
    key: "inventory:edit_customer",
    category: "Inventory",
    description: "Edit inventory customer details",
  },
  {
    key: "inventory:delete_customer",
    category: "Inventory",
    description: "Delete inventory customers",
  },

  // =========================================================================
  // 13. Inventory — Warehouses
  // =========================================================================
  {
    key: "inventory:view_warehouses",
    category: "Inventory",
    description: "View warehouse locations and storage facilities",
  },
  {
    key: "inventory:manage_warehouses",
    category: "Inventory",
    description: "Create, edit, and delete warehouses",
  },

  // =========================================================================
  // 14. Inventory — Purchases
  // =========================================================================
  {
    key: "inventory:view_purchases",
    category: "Inventory",
    description: "View purchase orders and receipts",
  },
  {
    key: "inventory:create_purchase",
    category: "Inventory",
    description: "Create draft purchase orders",
  },
  {
    key: "inventory:edit_purchase",
    category: "Inventory",
    description: "Edit draft purchase orders",
  },
  {
    key: "inventory:confirm_purchase",
    category: "Inventory",
    description: "Confirm purchase orders and post to stock ledger",
  },
  {
    key: "inventory:cancel_purchase",
    category: "Inventory",
    description: "Cancel confirmed purchases and reverse stock ledger entries",
  },
  {
    key: "inventory:delete_purchase",
    category: "Inventory",
    description: "Delete draft purchase orders",
  },

  // =========================================================================
  // 15. Inventory — Sales
  // =========================================================================
  {
    key: "inventory:view_sales",
    category: "Inventory",
    description: "View sales orders and customer invoices",
  },
  {
    key: "inventory:create_sale",
    category: "Inventory",
    description: "Create draft sales orders",
  },
  {
    key: "inventory:edit_sale",
    category: "Inventory",
    description: "Edit draft sales orders",
  },
  {
    key: "inventory:confirm_sale",
    category: "Inventory",
    description: "Confirm sales orders and deduct from stock ledger",
  },
  {
    key: "inventory:cancel_sale",
    category: "Inventory",
    description: "Cancel confirmed sales and restore stock ledger entries",
  },
  {
    key: "inventory:delete_sale",
    category: "Inventory",
    description: "Delete draft sales orders",
  },

  // =========================================================================
  // 16. Inventory — Stock & Ledger
  // =========================================================================
  {
    key: "inventory:view_stock",
    category: "Inventory",
    description: "View live inventory balances and stock levels",
  },
  {
    key: "inventory:view_transactions",
    category: "Inventory",
    description: "View inventory transaction ledger history",
  },
] as const;

/**
 * Union type representing every valid PBAC permission key in the platform.
 */
export type AppPermission = (typeof PERMISSIONS_CATALOG)[number]["key"];

/**
 * Lookup set for O(1) runtime validation.
 */
export const APP_PERMISSIONS_SET = new Set<string>(
  PERMISSIONS_CATALOG.map((p) => p.key),
);

/**
 * Type-guard to verify whether an arbitrary string is a valid AppPermission.
 */
export function isValidPermission(key: string): key is AppPermission {
  return APP_PERMISSIONS_SET.has(key);
}
