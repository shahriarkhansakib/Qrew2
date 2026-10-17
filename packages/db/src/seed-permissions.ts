import { permissions } from "./schema";

const INITIAL_PERMISSIONS = [
  // Clients
  { key: "client:view", category: "Clients", description: "View client list and basic profiles" },
  { key: "client:view_details", category: "Clients", description: "View detailed client fields" },
  {
    key: "client:view_sensitive",
    category: "Clients",
    description: "View sensitive client fields",
  },
  { key: "client:create", category: "Clients", description: "Add new clients" },
  { key: "client:edit", category: "Clients", description: "Update client details" },
  { key: "client:archive", category: "Clients", description: "Soft-delete clients" },
  { key: "client:restore", category: "Clients", description: "Restore archived clients" },
  { key: "client:delete", category: "Clients", description: "Permanently delete clients" },
  { key: "client:view_archived", category: "Clients", description: "View archived clients" },

  // Projects / Files
  { key: "file:view", category: "Files", description: "View operational files/projects list" },
  { key: "file:view_details", category: "Files", description: "View detailed project fields" },
  { key: "file:view_sensitive", category: "Files", description: "View sensitive project fields" },
  { key: "file:create", category: "Files", description: "Create new files" },
  { key: "file:edit", category: "Files", description: "Edit existing files" },
  { key: "file:archive", category: "Files", description: "Soft-delete operational files" },
  { key: "file:restore", category: "Files", description: "Restore archived files" },
  { key: "file:delete", category: "Files", description: "Permanently delete operational files" },
  { key: "file:view_archived", category: "Files", description: "View archived operational files" },
  {
    key: "file:advance_status",
    category: "Files",
    description: "Advance a file from one workflow status to another",
  },

  // Financials
  {
    key: "finance:view_expenses",
    category: "Financials",
    description: "View expense and requisition histories",
  },
  {
    key: "finance:request_funds",
    category: "Financials",
    description: "Submit requests for money (Maker)",
  },
  {
    key: "finance:approve_funds",
    category: "Financials",
    description: "Approve or deny money requests (Checker)",
  },
  {
    key: "finance:record_expense",
    category: "Financials",
    description: "Record finalized expenses against files",
  },
  {
    key: "finance:view_wallets",
    category: "Financials",
    description: "View organization wallets and basic balances",
  },
  {
    key: "finance:view_wallet_details",
    category: "Financials",
    description: "View granular wallet transaction history and details",
  },
  {
    key: "finance:manage_wallets",
    category: "Financials",
    description: "Manually adjust wallet balances",
  },
  {
    key: "finance:manage_categories",
    category: "Financials",
    description: "Manage expense categories",
  },

  // Invoicing (Granular PBAC Architecture)
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
    description: "Customize line item labels, descriptions, and notes on drafts",
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
  { key: "invoice:void", category: "Invoicing", description: "Void issued or paid invoices" },
  {
    key: "invoice:delete",
    category: "Invoicing",
    description: "Permanently delete draft invoices",
  },
  // Aliases for broad access roles
  {
    key: "finance:manage_invoices",
    category: "Invoicing",
    description: "Full administrative access to manage all invoices and drafts",
  },
  {
    key: "finance:view_invoices",
    category: "Invoicing",
    description: "View invoices and billing records",
  },

  // Invoice Templates
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
    description: "Update existing invoice templates",
  },
  {
    key: "template:delete",
    category: "Invoice Templates",
    description: "Remove invoice templates",
  },

  // Staff
  { key: "staff:view", category: "Staff", description: "View the staff directory" },
  { key: "staff:view_details", category: "Staff", description: "View detailed staff fields" },
  { key: "staff:view_sensitive", category: "Staff", description: "View sensitive staff fields" },
  { key: "staff:invite", category: "Staff", description: "Send an email invitation to new staff" },
  { key: "staff:create", category: "Staff", description: "Directly create new staff accounts" },
  { key: "staff:edit_role", category: "Staff", description: "Change another staff members role" },
  { key: "staff:revoke", category: "Staff", description: "Remove staff from the workspace" },

  // Roles
  { key: "role:view", category: "Roles", description: "View custom roles" },
  { key: "role:create", category: "Roles", description: "Create new custom roles" },
  { key: "role:edit", category: "Roles", description: "Modify role permissions and names" },
  { key: "role:delete", category: "Roles", description: "Delete custom roles" },

  // Workspace / Schema
  {
    key: "workspace:manage_fields",
    category: "Workspace",
    description: "Create and edit custom fields for clients, files, and staff",
  },
  {
    key: "workspace:manage_billing",
    category: "Workspace",
    description: "Manage subscription and billing",
  },
  {
    key: "workspace:manage_settings",
    category: "Workspace",
    description: "Manage organization settings and defaults",
  },

  // Workflows
  {
    key: "workflow:view",
    category: "Workflows",
    description: "View the workflow configuration, status graph, and stage field assignments",
  },
  {
    key: "workflow:manage",
    category: "Workflows",
    description:
      "Create/edit workflow status nodes, configure transitions, and assign fields per stage",
  },

  // Audit
  {
    key: "audit:view",
    category: "Audit",
    description: "View the activity logs / audit trails for accountability",
  },

  // Inventory — Products & Categories
  {
    key: "inventory:view_products",
    category: "Inventory",
    description: "View the product catalog",
  },
  { key: "inventory:create_product", category: "Inventory", description: "Add new products" },
  { key: "inventory:edit_product", category: "Inventory", description: "Edit product details" },
  { key: "inventory:delete_product", category: "Inventory", description: "Delete products" },
  {
    key: "inventory:manage_categories",
    category: "Inventory",
    description: "Create, edit, and delete product categories",
  },
  // NOTE FOR TEAMMATE & AGENT:
  // `inventory:manage_brands` is used in brands.route.ts and frontend Can gates (<Can I="inventory:manage_brands">),
  // but was missing from INITIAL_PERMISSIONS. Added here so that it is properly seeded into the DB permissions
  // table and assignable to organization roles.
  {
    key: "inventory:manage_brands",
    category: "Inventory",
    description: "Create, edit, and delete product brands",
  },

  // Inventory — Customers
  { key: "inventory:view_customers", category: "Inventory", description: "View the customer list" },
  { key: "inventory:create_customer", category: "Inventory", description: "Add new customers" },
  { key: "inventory:edit_customer", category: "Inventory", description: "Edit customer details" },
  { key: "inventory:delete_customer", category: "Inventory", description: "Delete customers" },

  // Inventory — Warehouses
  {
    key: "inventory:manage_warehouses",
    category: "Inventory",
    description: "Create, edit, and delete warehouses",
  },

  // Inventory — Purchases
  {
    key: "inventory:view_purchases",
    category: "Inventory",
    description: "View purchase documents",
  },
  {
    key: "inventory:create_purchase",
    category: "Inventory",
    description: "Create draft purchases",
  },
  { key: "inventory:edit_purchase", category: "Inventory", description: "Edit draft purchases" },
  {
    key: "inventory:confirm_purchase",
    category: "Inventory",
    description: "Confirm a draft purchase (writes to ledger)",
  },
  {
    key: "inventory:cancel_purchase",
    category: "Inventory",
    description: "Cancel a confirmed purchase (writes reversal rows)",
  },
  {
    key: "inventory:delete_purchase",
    category: "Inventory",
    description: "Delete draft purchases",
  },

  // Inventory — Sales
  { key: "inventory:view_sales", category: "Inventory", description: "View sale documents" },
  { key: "inventory:create_sale", category: "Inventory", description: "Create draft sales" },
  { key: "inventory:edit_sale", category: "Inventory", description: "Edit draft sales" },
  {
    key: "inventory:confirm_sale",
    category: "Inventory",
    description: "Confirm a draft sale (stock check + ledger write)",
  },
  {
    key: "inventory:cancel_sale",
    category: "Inventory",
    description: "Cancel a confirmed sale (writes reversal rows)",
  },
  { key: "inventory:delete_sale", category: "Inventory", description: "Delete draft sales" },

  // Inventory — Ledger & Stock
  { key: "inventory:view_stock", category: "Inventory", description: "View current stock levels" },
  {
    key: "inventory:view_transactions",
    category: "Inventory",
    description: "View inventory transaction history",
  },
];

export async function seedPermissionsDefaults(db: any) {
  console.log("1. Seeding PBAC Permissions...");
  for (const perm of INITIAL_PERMISSIONS) {
    await db
      .insert(permissions)
      .values(perm)
      .onConflictDoUpdate({
        target: permissions.key,
        set: {
          description: perm.description,
          category: perm.category,
        },
      });
  }
}
