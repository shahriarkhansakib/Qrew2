import { and, eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import {
  expenseCategories,
  orgRolePermissions,
  orgRoles,
  projectStatuses,
  projectStatusTransitions,
  tokens,
} from "./schema";

export async function seedOrganizationDefaults(db: any, orgId: string, userId: string) {
  // 1. Seed Expense Categories
  const existingCategories = await db
    .select()
    .from(expenseCategories)
    .where(eq(expenseCategories.organizationId, orgId));

  if (existingCategories.length === 0) {
    const totalId = uuidv4();
    const transId = uuidv4();
    const officeId = uuidv4();
    const othersId = uuidv4();

    await db.insert(tokens).values([
      {
        id: totalId,
        tokenKey: "EXP_TOTAL",
        label: "Total Expenses",
        description:
          "Sum of all expense categories recorded across all categories for this project",
        domain: "expense_category",
        organizationId: orgId,
        isSystem: true,
        isInjectable: true,
        isVisible: true,
        sortOrder: 0,
      },
      {
        id: transId,
        tokenKey: "TRANSPORTATION",
        label: "Transportation",
        domain: "expense_category",
        organizationId: orgId,
        isSystem: false,
        isInjectable: true,
        isVisible: true,
        sortOrder: 1,
      },
      {
        id: officeId,
        tokenKey: "OFFICE",
        label: "Office",
        domain: "expense_category",
        organizationId: orgId,
        isSystem: false,
        isInjectable: true,
        isVisible: true,
        sortOrder: 2,
      },
      {
        id: othersId,
        tokenKey: "OTHERS",
        label: "Others",
        domain: "expense_category",
        organizationId: orgId,
        isSystem: false,
        isInjectable: true,
        isVisible: true,
        sortOrder: 3,
      },
    ]);

    await db.insert(expenseCategories).values([
      { id: totalId, organizationId: orgId },
      { id: transId, organizationId: orgId },
      { id: officeId, organizationId: orgId },
      { id: othersId, organizationId: orgId },
    ]);
  }

  // 2. Seed Project Statuses
  const existingStatuses = await db
    .select()
    .from(projectStatuses)
    .where(eq(projectStatuses.organizationId, orgId));

  let _createdStatusId: string | null = null;
  let _completedStatusId: string | null = null;

  if (existingStatuses.length === 0) {
    const createdId = uuidv4();
    const completedId = uuidv4();
    _createdStatusId = createdId;
    _completedStatusId = completedId;

    await db.insert(projectStatuses).values([
      {
        id: createdId,
        organizationId: orgId,
        name: "Created",
        color: "#6366f1",
        order: 1,
        isDefault: true,
        isSystem: true,
        isInitial: true,
        isTerminal: false,
      },
      {
        id: completedId,
        organizationId: orgId,
        name: "Completed",
        color: "#10b981",
        order: 99,
        isDefault: false,
        isSystem: true,
        isInitial: false,
        isTerminal: true,
      },
    ]);

    // Seed the default transition: Created → Completed
    await db.insert(projectStatusTransitions).values({
      id: uuidv4(),
      organizationId: orgId,
      fromStatusId: createdId,
      toStatusId: completedId,
    });
  } else {
    // Fix existing orgs: ensure Completed is isSystem=true
    const completedStatus = existingStatuses.find((s: any) => s.name === "Completed");
    const createdStatus = existingStatuses.find((s: any) => s.isInitial);
    if (completedStatus && !completedStatus.isSystem) {
      await db
        .update(projectStatuses)
        .set({ isSystem: true, color: "#10b981" })
        .where(eq(projectStatuses.id, completedStatus.id));
    }
    if (createdStatus && completedStatus) {
      // Fix color of Created status too
      if (createdStatus.color !== "#6366f1") {
        await db
          .update(projectStatuses)
          .set({ color: "#6366f1" })
          .where(eq(projectStatuses.id, createdStatus.id));
      }
      // Ensure transition exists
      const existing = await db.query.projectStatusTransitions.findFirst({
        where: and(
          eq(projectStatusTransitions.organizationId, orgId),
          eq(projectStatusTransitions.fromStatusId, createdStatus.id),
          eq(projectStatusTransitions.toStatusId, completedStatus.id),
        ),
      });
      if (!existing) {
        await db.insert(projectStatusTransitions).values({
          id: uuidv4(),
          organizationId: orgId,
          fromStatusId: createdStatus.id,
          toStatusId: completedStatus.id,
        });
      }
    }
  }

  // 3. Seed Roles
  const existingRoles = await db.select().from(orgRoles).where(eq(orgRoles.organizationId, orgId));

  if (existingRoles.length === 0) {
    const ownerRoleId = uuidv4();
    const managerRoleId = uuidv4();
    const staffRoleId = uuidv4();

    await db.insert(orgRoles).values([
      {
        id: ownerRoleId,
        organizationId: orgId,
        name: "Owner",
        description: "Full administrative access",
        isSystem: true,
        createdBy: userId,
      },
      {
        id: managerRoleId,
        organizationId: orgId,
        name: "Manager",
        description: "Can manage files, clients, and financials",
        isSystem: false,
        createdBy: userId,
      },
      {
        id: staffRoleId,
        organizationId: orgId,
        name: "Staff",
        description: "Standard access for operational staff",
        isSystem: false,
        createdBy: userId,
      },
    ]);
  }

  // Fetch roles again to get their IDs (in case they already existed)
  const roles = await db.select().from(orgRoles).where(eq(orgRoles.organizationId, orgId));

  const ownerRole = roles.find((r: any) => r.name === "Owner");
  const managerRole = roles.find((r: any) => r.name === "Manager");
  const staffRole = roles.find((r: any) => r.name === "Staff");

  if (ownerRole || managerRole || staffRole) {
    // Role Permissions Mapping
    const permissionsToInsert: { roleId: string; permissionKey: string }[] = [];

    const ownerPerms = [
      "staff:view",
      "staff:view_details",
      "staff:view_sensitive",
      "staff:invite",
      "staff:create",
      "staff:edit_role",
      "staff:revoke",
      "role:view",
      "role:create",
      "role:edit",
      "role:delete",
      "client:view",
      "client:view_details",
      "client:view_sensitive",
      "client:create",
      "client:edit",
      "client:archive",
      "client:restore",
      "client:delete",
      "client:view_archived",
      "file:view",
      "file:view_details",
      "file:view_sensitive",
      "file:create",
      "file:edit",
      "file:archive",
      "file:restore",
      "file:delete",
      "file:view_archived",
      "finance:view_expenses",
      "finance:request_funds",
      "finance:approve_funds",
      "finance:record_expense",
      "finance:view_wallets",
      "finance:view_wallet_details",
      "finance:manage_wallets",
      "finance:manage_categories",
      "invoice:view",
      "invoice:create",
      "invoice:edit",
      "invoice:delete",
      "template:view",
      "template:create",
      "template:edit",
      "template:delete",
      "workspace:manage_fields",
      "workspace:manage_billing",
      "workspace:manage_settings",
      "workflow:view",
      "workflow:manage",
      "file:advance_status",
      "audit:view",
    ];

    const managerPerms = [
      "staff:view",
      "staff:view_details",
      "staff:invite",
      "client:view",
      "client:view_details",
      "client:create",
      "client:edit",
      "client:archive",
      "file:view",
      "file:view_details",
      "file:create",
      "file:edit",
      "file:archive",
      "finance:view_expenses",
      "finance:request_funds",
      "finance:approve_funds",
      "finance:record_expense",
      "finance:view_wallets",
      "invoice:view",
      "invoice:create",
      "invoice:edit",
      "template:view",
      "workflow:view",
      "file:advance_status",
    ];

    const staffPerms = [
      "staff:view",
      "client:view",
      "client:create",
      "client:edit",
      "file:view",
      "file:view_details",
      "file:create",
      "file:edit",
      "file:advance_status",
      "finance:view_expenses",
      "finance:request_funds",
    ];

    // Clear existing permissions for these roles so we can safely re-insert
    const roleIdsToClear = [ownerRole?.id, managerRole?.id, staffRole?.id].filter(
      Boolean,
    ) as string[];

    // We can't delete with an array in a simple way without 'inArray', so we loop (safe for 3 items)
    for (const roleId of roleIdsToClear) {
      await db.delete(orgRolePermissions).where(eq(orgRolePermissions.roleId, roleId));
    }

    if (ownerRole)
      ownerPerms.forEach((key) =>
        permissionsToInsert.push({ roleId: ownerRole.id, permissionKey: key }),
      );
    if (managerRole)
      managerPerms.forEach((key) =>
        permissionsToInsert.push({ roleId: managerRole.id, permissionKey: key }),
      );
    if (staffRole)
      staffPerms.forEach((key) =>
        permissionsToInsert.push({ roleId: staffRole.id, permissionKey: key }),
      );

    if (permissionsToInsert.length > 0) {
      await db.insert(orgRolePermissions).values(permissionsToInsert);
    }

    // Update Manager and Staff to be isSystem: false if they were previously created as true
    for (const role of [managerRole, staffRole].filter(Boolean)) {
      if (role?.isSystem) {
        await db.update(orgRoles).set({ isSystem: false }).where(eq(orgRoles.id, role.id));
      }
    }
  }
}
