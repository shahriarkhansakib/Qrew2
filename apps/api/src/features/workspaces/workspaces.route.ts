import { Hono } from "hono";
import { requireOrgPermission } from "../../infra/middleware/require-permission";
import { PermissionsController } from "../permissions/permissions.controller";
import { RolesController } from "../roles/roles.controller";
import { WorkspacesController } from "./workspaces.controller";
export const workspacesRouter = new Hono();

import { clientsRouter } from "../clients/clients.route";
import { customFieldsRouter } from "../custom-fields/custom-fields.route";
import { projectsRouter } from "../projects/projects.route";

workspacesRouter.route("/custom-fields", customFieldsRouter);
workspacesRouter.route("/clients", clientsRouter);
workspacesRouter.route("/projects", projectsRouter);

// POST /api/workspaces/create
workspacesRouter.post("/create", WorkspacesController.createWorkspace);

// GET /api/workspaces/dashboard-stats
workspacesRouter.get("/dashboard-stats", WorkspacesController.getDashboardStats);

// GET /api/workspaces/permissions/me
workspacesRouter.get("/permissions/me", PermissionsController.getMyPermissions);

// GET/PATCH /api/workspaces/settings
workspacesRouter.get("/settings", WorkspacesController.getSettings);
workspacesRouter.patch(
  "/settings",
  requireOrgPermission("workspace:manage_settings"),
  WorkspacesController.updateSettings,
);

// GET/PATCH /api/workspaces/user-preferences
workspacesRouter.get("/user-preferences", WorkspacesController.getUserPreferences);
workspacesRouter.patch("/user-preferences", WorkspacesController.updateUserPreferences);

// POST /api/workspaces/staff/invite
workspacesRouter.post(
  "/staff/invite",
  requireOrgPermission("staff:invite"),
  WorkspacesController.inviteStaff,
);
workspacesRouter.get(
  "/staff/invites",
  requireOrgPermission("staff:invite"),
  WorkspacesController.listInvitations,
);
workspacesRouter.get("/staff/invites/:id", WorkspacesController.getInvitation);
workspacesRouter.delete(
  "/staff/invites/:id",
  requireOrgPermission("staff:invite"),
  WorkspacesController.cancelInvitation,
);
workspacesRouter.post("/staff/invites/accept", WorkspacesController.acceptInvitation);

workspacesRouter.get("/staff/list", WorkspacesController.listStaff);
workspacesRouter.put(
  "/staff/:memberId/role",
  requireOrgPermission(["staff:edit_role", "role:manage"]),
  WorkspacesController.updateStaffRole,
);
workspacesRouter.delete(
  "/staff/:memberId",
  requireOrgPermission("staff:revoke"),
  WorkspacesController.revokeStaff,
);

// --- Roles & Permissions ---

// Permission Registry (read-only, no special permission needed)
workspacesRouter.get("/roles/registry", RolesController.getPermissionRegistry);

// Role CRUD (list/get are open to authenticated users, mutations require role permissions)
workspacesRouter.get("/roles", RolesController.listRoles);
workspacesRouter.post(
  "/roles",
  requireOrgPermission(["role:create", "role:manage"]),
  RolesController.createRole,
);
workspacesRouter.get("/roles/:roleId", RolesController.getRole);
workspacesRouter.put(
  "/roles/:roleId",
  requireOrgPermission(["role:edit", "role:manage"]),
  RolesController.updateRole,
);
workspacesRouter.delete(
  "/roles/:roleId",
  requireOrgPermission(["role:delete", "role:manage"]),
  RolesController.deleteRole,
);

