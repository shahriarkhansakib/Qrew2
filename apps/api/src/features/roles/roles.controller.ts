import {
  db,
  members,
  orgMemberRoles,
  orgRolePermissions,
  orgRoles,
  permissions,
} from "@starter/db";
import { and, count, eq, sql } from "drizzle-orm";
import { Context } from "hono";
import { v4 as uuidv4 } from "uuid";
import { auth } from "../../infra/lib/auth";
import { PermissionService } from "../permissions/permission.service";

export class RolesController {
  /**
   * GET - Fetches the global permission registry (read-only, no org context needed).
   */
  static async getPermissionRegistry(c: Context) {
    try {
      const allPermissions = await db
        .select({
          key: permissions.key,
          description: permissions.description,
          category: permissions.category,
        })
        .from(permissions);

      return c.json({ permissions: allPermissions }, 200);
    } catch (error) {
      console.error("[RolesController.getPermissionRegistry] Failed:", error);
      return c.json({ error: "Internal Server Error" }, 500);
    }
  }

  /**
   * GET - Lists all roles for the active organization, with permission and member counts.
   */
  static async listRoles(c: Context) {
    try {
      const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });
      if (!sessionData?.session) return c.json({ error: "Unauthorized" }, 401);

      const activeOrgId = sessionData.session.activeOrganizationId;
      if (!activeOrgId) return c.json({ error: "No active workspace selected" }, 400);

      const roles = await db
        .select({
          id: orgRoles.id,
          name: orgRoles.name,
          description: orgRoles.description,
          isSystem: orgRoles.isSystem,
          createdAt: orgRoles.createdAt,
          permissionCount: sql<number>`cast(count(distinct ${orgRolePermissions.permissionKey}) as int)`,
          memberCount: sql<number>`cast(count(distinct ${orgMemberRoles.id}) as int)`,
        })
        .from(orgRoles)
        .leftJoin(orgRolePermissions, eq(orgRoles.id, orgRolePermissions.roleId))
        .leftJoin(orgMemberRoles, eq(orgRoles.id, orgMemberRoles.roleId))
        .where(eq(orgRoles.organizationId, activeOrgId))
        .groupBy(orgRoles.id);

      return c.json({ roles }, 200);
    } catch (error) {
      console.error("[RolesController.listRoles] Failed:", error);
      return c.json({ error: "Internal Server Error" }, 500);
    }
  }

  /**
   * POST - Creates a new custom role with associated permissions.
   */
  static async createRole(c: Context) {
    try {
      const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });
      if (!sessionData?.session) return c.json({ error: "Unauthorized" }, 401);

      const activeOrgId = sessionData.session.activeOrganizationId;
      if (!activeOrgId) return c.json({ error: "No active workspace selected" }, 400);

      const body = await c.req.json();
      const { name, description, permissionKeys } = body;

      if (
        !name ||
        !permissionKeys ||
        !Array.isArray(permissionKeys) ||
        permissionKeys.length === 0
      ) {
        return c.json({ error: "Missing required fields (name, permissionKeys)" }, 400);
      }

      const roleId = uuidv4();

      const createdRole = await db.transaction(async (tx) => {
        const [role] = await tx
          .insert(orgRoles)
          .values({
            id: roleId,
            organizationId: activeOrgId,
            name,
            description: description || null,
            isSystem: false,
            createdBy: sessionData.user.id,
          })
          .returning();

        if (permissionKeys.length > 0) {
          await tx.insert(orgRolePermissions).values(
            permissionKeys.map((key: string) => ({
              roleId,
              permissionKey: key,
            })),
          );
        }

        return { ...role, permissionKeys };
      });

      return c.json({ role: createdRole }, 201);
    } catch (error) {
      console.error("[RolesController.createRole] Failed:", error);
      return c.json({ error: "Internal Server Error" }, 500);
    }
  }

  /**
   * GET - Fetches a single role by ID with its associated permission keys.
   */
  static async getRole(c: Context) {
    try {
      const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });
      if (!sessionData?.session) return c.json({ error: "Unauthorized" }, 401);

      const activeOrgId = sessionData.session.activeOrganizationId;
      if (!activeOrgId) return c.json({ error: "No active workspace selected" }, 400);

      const roleId = c.req.param("roleId");
      if (!roleId) return c.json({ error: "Role ID required" }, 400);

      const role = await db.query.orgRoles.findFirst({
        where: and(eq(orgRoles.id, roleId), eq(orgRoles.organizationId, activeOrgId)),
      });

      if (!role) {
        return c.json({ error: "Role not found" }, 404);
      }

      const rolePermissions = await db
        .select({ permissionKey: orgRolePermissions.permissionKey })
        .from(orgRolePermissions)
        .where(eq(orgRolePermissions.roleId, roleId));

      const permissionKeys = rolePermissions.map((rp) => rp.permissionKey);

      return c.json(
        {
          role: {
            id: role.id,
            name: role.name,
            description: role.description,
            isSystem: role.isSystem,
            permissionKeys,
            createdAt: role.createdAt,
          },
        },
        200,
      );
    } catch (error) {
      console.error("[RolesController.getRole] Failed:", error);
      return c.json({ error: "Internal Server Error" }, 500);
    }
  }

  /**
   * PUT - Updates a custom role's name, description, and permissions.
   * System roles cannot be updated.
   */
  static async updateRole(c: Context) {
    try {
      const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });
      if (!sessionData?.session) return c.json({ error: "Unauthorized" }, 401);

      const activeOrgId = sessionData.session.activeOrganizationId;
      if (!activeOrgId) return c.json({ error: "No active workspace selected" }, 400);

      const roleId = c.req.param("roleId");
      if (!roleId) return c.json({ error: "Role ID required" }, 400);

      const existingRole = await db.query.orgRoles.findFirst({
        where: and(eq(orgRoles.id, roleId), eq(orgRoles.organizationId, activeOrgId)),
      });

      if (!existingRole) {
        return c.json({ error: "Role not found" }, 404);
      }

      if (existingRole.isSystem) {
        return c.json({ error: "System roles cannot be modified" }, 403);
      }

      const body = await c.req.json();
      const { name, description, permissionKeys } = body;

      const updatedRole = await db.transaction(async (tx) => {
        const [role] = await tx
          .update(orgRoles)
          .set({
            name: name ?? existingRole.name,
            description: description !== undefined ? description : existingRole.description,
          })
          .where(and(eq(orgRoles.id, roleId), eq(orgRoles.organizationId, activeOrgId)))
          .returning();

        if (permissionKeys && Array.isArray(permissionKeys)) {
          // Remove all existing permission bindings
          await tx.delete(orgRolePermissions).where(eq(orgRolePermissions.roleId, roleId));

          // Insert new permission bindings
          if (permissionKeys.length > 0) {
            await tx.insert(orgRolePermissions).values(
              permissionKeys.map((key: string) => ({
                roleId,
                permissionKey: key,
              })),
            );
          }
        }

        return { ...role, permissionKeys: permissionKeys ?? [] };
      });

      // Invalidate Redis permissions cache for all members assigned to this role
      try {
        const assignedMembers = await db
          .select({ userId: members.userId })
          .from(orgMemberRoles)
          .innerJoin(members, eq(orgMemberRoles.memberId, members.id))
          .where(eq(orgMemberRoles.roleId, roleId));

        for (const m of assignedMembers) {
          if (m.userId) {
            await PermissionService.invalidateCache(m.userId, activeOrgId);
          }
        }
      } catch (cacheErr) {
        console.warn("[RolesController.updateRole] Failed to invalidate cache:", cacheErr);
      }

      return c.json({ role: updatedRole }, 200);
    } catch (error) {
      console.error("[RolesController.updateRole] Failed:", error);
      return c.json({ error: "Internal Server Error" }, 500);
    }
  }

  /**
   * DELETE - Deletes a custom role. System roles and roles with assigned members cannot be deleted.
   */
  static async deleteRole(c: Context) {
    try {
      const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });
      if (!sessionData?.session) return c.json({ error: "Unauthorized" }, 401);

      const activeOrgId = sessionData.session.activeOrganizationId;
      if (!activeOrgId) return c.json({ error: "No active workspace selected" }, 400);

      const roleId = c.req.param("roleId");
      if (!roleId) return c.json({ error: "Role ID required" }, 400);

      const existingRole = await db.query.orgRoles.findFirst({
        where: and(eq(orgRoles.id, roleId), eq(orgRoles.organizationId, activeOrgId)),
      });

      if (!existingRole) {
        return c.json({ error: "Role not found" }, 404);
      }

      if (existingRole.isSystem) {
        return c.json({ error: "System roles cannot be deleted" }, 403);
      }

      // Check if any members are currently assigned to this role
      const [memberCount] = await db
        .select({ count: count() })
        .from(orgMemberRoles)
        .where(eq(orgMemberRoles.roleId, roleId));

      if (memberCount.count > 0) {
        return c.json(
          {
            error: "Cannot delete a role that has members assigned to it. Reassign members first.",
          },
          409,
        );
      }

      await db
        .delete(orgRoles)
        .where(and(eq(orgRoles.id, roleId), eq(orgRoles.organizationId, activeOrgId)));

      return c.json({ success: true, message: "Role deleted successfully" }, 200);
    } catch (error) {
      console.error("[RolesController.deleteRole] Failed:", error);
      return c.json({ error: "Internal Server Error" }, 500);
    }
  }
}
