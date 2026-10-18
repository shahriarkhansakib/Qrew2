/**
 * navigation.ts
 * Central navigation configuration for all app sections.
 *
 * NavGroup entries (with `children`) render as collapsible sidebar groups.
 * NavItem entries (with `href`) render as flat sidebar links.
 * The distinction is made at render time in app-shell.tsx.
 */

import {
  ArrowLeft,
  BarChart3,
  Building2,
  Contact,
  FileText,
  Home,
  LayoutDashboard,
  List,
  Package,
  Receipt,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Tags,
  Users,
  Wallet,
  Warehouse,
} from "lucide-react";
import type { AppPermission } from "@starter/db/permissions-registry";
import type { NavChild } from "@/components/layout/sidebar-nav-group";

// ─── Shared type definitions ──────────────────────────────────────────────────

export interface NavItem {
  type?: "item";
  name: string;
  href: string;
  icon: any;
  permission?: AppPermission; // Strongly-typed PBAC permission key; if set, hide when not granted
}

export interface NavGroup {
  type: "group";
  name: string;
  icon: any;
  baseHref: string; // Used to detect active group
  permission?: AppPermission; // Strongly-typed PBAC gate on the entire group
  children: (NavChild & { permission?: AppPermission })[];
}


export type AnyNavItem = NavItem | NavGroup;

// ─── User Dashboard Navigation ────────────────────────────────────────────────

export const NAV_CONFIG = {
  user: [
    { name: "Dashboard", href: "/dashboard", icon: Home },
    { name: "Clients", href: "/dashboard/clients", icon: Contact },
    { name: "Files", href: "/dashboard/projects", icon: FileText },
    {
      name: "Invoices",
      href: "/dashboard/invoices",
      icon: Receipt,
      permission: "finance:view_invoices",
    },
    // Inventory is now a collapsible group — children appear as sidebar sub-links.
    {
      type: "group",
      name: "Inventory",
      icon: Package,
      baseHref: "/dashboard/inventory",
      permission: "inventory:view_products",
      children: [
        {
          name: "Products",
          href: "/dashboard/inventory/products",
          icon: Package,
          permission: "inventory:view_products",
        },
        {
          name: "Ledger",
          href: "/dashboard/inventory/transactions",
          icon: BarChart3,
          permission: "inventory:view_transactions",
        },
        {
          name: "Customers",
          href: "/dashboard/inventory/customers",
          icon: Users,
          permission: "inventory:view_customers",
        },
        {
          name: "Warehouses",
          href: "/dashboard/inventory/warehouses",
          icon: Warehouse,
          permission: "inventory:view_products",
        },
        {
          name: "Brands",
          href: "/dashboard/inventory/brands",
          icon: Tags,
          permission: "inventory:manage_brands",
        },
      ],
    } as NavGroup,
    { name: "Financials", href: "/dashboard/financials", icon: Wallet },
    { name: "Staffs", href: "/dashboard/staffs", icon: Users },
  ] as AnyNavItem[],

  admin: [
    { name: "Admin Home", href: "/admin", icon: Shield },
    { name: "Manage Users", href: "/admin/users", icon: Users },
  ],
  superAdmin: [
    { name: "System Core", href: "/super-admin", icon: ShieldAlert },
    { name: "Manage Admins", href: "/super-admin/admins", icon: ShieldCheck },
    { name: "Permissions", href: "/super-admin/permissions", icon: Shield },
    { name: "Workspaces", href: "/super-admin/workspaces", icon: Building2 },
    { name: "Audit Logs", href: "/super-admin/audit-logs", icon: List },
  ],
  userSettings: { name: "Settings", href: "/dashboard/settings/profile", icon: Settings },
  adminSettings: { name: "Settings", href: "/admin/settings/profile", icon: Settings },
  superAdminSettings: {
    name: "System Settings",
    href: "/super-admin/settings/profile",
    icon: Settings,
  },

  tenantAdmin: [
    { name: "Overview", href: "/org-admin", icon: LayoutDashboard },
    { name: "Staff Management", href: "/org-admin/staff", icon: Users },
    { name: "Roles & Permissions", href: "/org-admin/roles", icon: Shield },
    { name: "Customize Fields", href: "/org-admin/customize-fields", icon: Settings },
    { name: "Invoice Templates", href: "/org-admin/invoice-templates", icon: FileText },
  ],
  tenantAdminExit: {
    name: "Back to Dashboard",
    href: "/dashboard",
    icon: ArrowLeft,
  },
};
