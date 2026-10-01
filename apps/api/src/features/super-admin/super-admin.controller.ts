import { auditLogs, db, members, organizations, permissions, sessions, users } from "@starter/db";
import { and, count, desc, eq, ilike, ne } from "drizzle-orm";
import { Context } from "hono";
import { z } from "zod";
import { logger } from "../../infra/lib/logger";

const superAdminControllerLog = logger.child({ module: "super-admin-controller" });

const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  action: z.string().optional(),
  adminId: z.string().optional(),
  targetUserId: z.string().optional(),
  search: z.string().optional(),
});

const elevateRoleSchema = z.object({
  targetUserId: z.string().min(1),
  newRole: z.enum(["admin", "super_admin"]),
  reason: z.string().min(10, "SOC2 Audit reason required"),
});

export class SuperAdminController {
  static async listAuditLogs(c: Context) {
    try {
      const queryParams = c.req.query();
      const parsed = paginationSchema.safeParse(queryParams);

      if (!parsed.success) {
        return c.json(
          { error: "Invalid pagination parameters", details: parsed.error.format() },
          400,
        );
      }

      const { page, limit, action, adminId, targetUserId } = parsed.data;
      const offset = (page - 1) * limit;

      const conditions = [];
      if (action) conditions.push(eq(auditLogs.action, action));
      if (adminId) conditions.push(eq(auditLogs.adminId, adminId));
      if (targetUserId) conditions.push(eq(auditLogs.targetUserId, targetUserId));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [dataResult, countResult] = await Promise.all([
        db
          .select({
            id: auditLogs.id,
            action: auditLogs.action,
            reason: auditLogs.reason,
            ipAddress: auditLogs.ipAddress,
            createdAt: auditLogs.createdAt,
            adminId: auditLogs.adminId,
            targetUserId: auditLogs.targetUserId,
            // We can't do direct nested relation queries in raw select easily without joins.
            // We'll use table joins to get names/emails.
          })
          .from(auditLogs)
          .where(whereClause)
          .orderBy(desc(auditLogs.createdAt))
          .limit(limit)
          .offset(offset),
        db.select({ total: count() }).from(auditLogs).where(whereClause),
      ]);

      // Enhance data with user info
      // Instead of complex joins, we can query users separately or use Drizzle relational API
      const enrichedData = await Promise.all(
        dataResult.map(async (log) => {
          const [admin, target] = await Promise.all([
            db.query.users.findFirst({
              where: eq(users.id, log.adminId),
              columns: { email: true, name: true },
            }),
            db.query.users.findFirst({
              where: eq(users.id, log.targetUserId),
              columns: { email: true, name: true },
            }),
          ]);
          return {
            ...log,
            adminEmail: admin?.email || "Unknown",
            targetEmail: target?.email || "Unknown",
          };
        }),
      );

      const totalRecords = countResult[0]?.total || 0;
      const totalPages = Math.ceil(totalRecords / limit);

      return c.json(
        {
          data: enrichedData,
          meta: {
            total: totalRecords,
            page,
            limit,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
          },
        },
        200,
      );
    } catch (error) {
      superAdminControllerLog.error({ err: error }, "Failed to list audit logs");
      return c.json({ error: "Internal Server Error" }, 500);
    }
  }

  static async elevateRole(c: Context) {
    try {
      const body = await c.req.json();
      const parsed = elevateRoleSchema.safeParse(body);

      if (!parsed.success) {
        return c.json({ error: "Bad Request", issues: parsed.error.format() }, 400);
      }

      const { targetUserId, newRole, reason } = parsed.data;
      const adminUser = c.get("user") as any;

      if (!adminUser) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const targetUser = await db.query.users.findFirst({
        where: eq(users.id, targetUserId),
        columns: { role: true },
      });

      if (!targetUser) {
        return c.json({ error: "Not Found", message: "Target user does not exist." }, 404);
      }

      if (targetUser.role === newRole) {
        return c.json({ error: "Conflict", message: `User is already ${newRole}.` }, 409);
      }

      await db.update(users).set({ role: newRole }).where(eq(users.id, targetUserId));

      const auditPromise = db
        .insert(auditLogs)
        .values({
          adminId: adminUser.id,
          targetUserId: targetUserId,
          action: `ELEVATE_ROLE_${newRole.toUpperCase()}`,
          reason: reason,
          ipAddress: c.req.header("x-forwarded-for") || "unknown",
        })
        .catch((err) => c.get("logger").error({ err }, "Failed to write elevation audit log"));

      try {
        c.executionCtx.waitUntil(auditPromise);
      } catch (_e) {
        Promise.resolve(auditPromise);
      }

      return c.json({ success: true, message: `User ${targetUserId} elevated to ${newRole}` }, 200);
    } catch (error) {
      superAdminControllerLog.error({ err: error }, "Role elevation failed");
      return c.json({ error: "Internal Server Error" }, 500);
    }
  }

  static async nukeSessions(c: Context) {
    try {
      const adminUser = c.get("user") as any;

      if (!adminUser) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      // Delete all sessions EXCEPT the one belonging to the current super admin
      // Using 'ne' (not equal)
      await db.delete(sessions).where(ne(sessions.userId, adminUser.id));

      const auditPromise = db
        .insert(auditLogs)
        .values({
          adminId: adminUser.id,
          targetUserId: adminUser.id, // Using self as target for a global action
          action: "GLOBAL_SESSION_NUKE",
          reason: "Emergency session invalidation triggered by super admin",
          ipAddress: c.req.header("x-forwarded-for") || "unknown",
        })
        .catch((err) => c.get("logger").error({ err }, "Failed to write nuke audit log"));

      try {
        c.executionCtx.waitUntil(auditPromise);
      } catch (_e) {
        Promise.resolve(auditPromise);
      }

      return c.json({ success: true, message: "All active sessions globally nuked." }, 200);
    } catch (error) {
      superAdminControllerLog.error({ err: error }, "Session nuke failed");
      return c.json({ error: "Internal Server Error" }, 500);
    }
  }

  static async listPermissions(c: Context) {
    try {
      const allPermissions = await db.select().from(permissions);
      return c.json(allPermissions, 200);
    } catch (error) {
      superAdminControllerLog.error({ err: error }, "Failed to list permissions");
      return c.json({ error: "Internal Server Error" }, 500);
    }
  }

  // Priority 3: Cross-Tenant Organization Management
  static async listWorkspaces(c: Context) {
    try {
      const queryParams = c.req.query();
      const parsed = paginationSchema.safeParse(queryParams);
      if (!parsed.success) return c.json({ error: "Invalid parameters" }, 400);

      const { page, limit, search } = parsed.data;
      const offset = (page - 1) * limit;

      const whereClause = search ? ilike(organizations.name, `%${search}%`) : undefined;

      const [dataResult, countResult] = await Promise.all([
        db
          .select()
          .from(organizations)
          .where(whereClause)
          .orderBy(desc(organizations.createdAt))
          .limit(limit)
          .offset(offset),
        db.select({ total: count() }).from(organizations).where(whereClause),
      ]);

      return c.json(
        {
          data: dataResult,
          meta: {
            total: countResult[0]?.total || 0,
            page,
            limit,
            totalPages: Math.ceil((countResult[0]?.total || 0) / limit),
          },
        },
        200,
      );
    } catch (error) {
      superAdminControllerLog.error({ err: error }, "Failed to list workspaces");
      return c.json({ error: "Internal Server Error" }, 500);
    }
  }

  static async listWorkspaceMembers(c: Context) {
    try {
      const workspaceId = c.req.param("workspaceId");
      if (!workspaceId) return c.json({ error: "Workspace ID required" }, 400);

      const orgMembers = await db.query.members.findMany({
        where: eq(members.organizationId, workspaceId),
        with: {
          user: {
            columns: { id: true, name: true, email: true },
          },
        },
        orderBy: [desc(members.createdAt)],
      });

      return c.json({ data: orgMembers }, 200);
    } catch (error) {
      superAdminControllerLog.error({ err: error }, "Failed to list workspace members");
      return c.json({ error: "Internal Server Error" }, 500);
    }
  }

  static async addWorkspaceMember(c: Context) {
    try {
      const workspaceId = c.req.param("workspaceId");
      const body = await c.req.json();
      const adminUser = c.get("user") as any;

      if (!workspaceId) return c.json({ error: "Workspace ID required" }, 400);

      const { userId, role, reason } = body;
      if (!userId || !role || !reason || reason.length < 10) {
        return c.json(
          { error: "Valid userId, role, and audit reason (min 10 chars) are required" },
          400,
        );
      }

      // Check if user exists
      const targetUser = await db.query.users.findFirst({ where: eq(users.id, userId) });
      if (!targetUser) return c.json({ error: "User not found" }, 404);

      // Check if already a member
      const existing = await db.query.members.findFirst({
        where: and(eq(members.organizationId, workspaceId), eq(members.userId, userId)),
      });

      if (existing) {
        // Update role
        await db.update(members).set({ role }).where(eq(members.id, existing.id));
      } else {
        // Create new member
        const { randomUUID } = require("node:crypto");
        await db.insert(members).values({
          id: randomUUID(),
          organizationId: workspaceId,
          userId: userId,
          role: role,
        });
      }

      // Audit Log
      const auditPromise = db
        .insert(auditLogs)
        .values({
          adminId: adminUser.id,
          targetUserId: userId,
          action: existing ? "TENANT_MEMBER_UPDATED" : "TENANT_MEMBER_ADDED",
          reason: `Workspace: ${workspaceId}. Reason: ${reason}`,
          ipAddress: c.req.header("x-forwarded-for") || "unknown",
        })
        .catch((err) => c.get("logger").error({ err }, "Failed to write audit log"));

      try {
        c.executionCtx.waitUntil(auditPromise);
      } catch (_e) {
        Promise.resolve(auditPromise);
      }

      return c.json({ success: true, message: "Member successfully configured in workspace" }, 200);
    } catch (error) {
      superAdminControllerLog.error({ err: error }, "Failed to add/update workspace member");
      return c.json({ error: "Internal Server Error" }, 500);
    }
  }

  static async removeWorkspaceMember(c: Context) {
    try {
      const workspaceId = c.req.param("workspaceId");
      const memberId = c.req.param("memberId");
      const body = await c.req.json();
      const adminUser = c.get("user") as any;

      if (!workspaceId || !memberId)
        return c.json({ error: "Workspace ID and Member ID required" }, 400);

      const { reason } = body;
      if (!reason || reason.length < 10) {
        return c.json({ error: "Audit reason (min 10 chars) is required" }, 400);
      }

      const existing = await db.query.members.findFirst({
        where: and(eq(members.id, memberId), eq(members.organizationId, workspaceId)),
      });

      if (!existing) return c.json({ error: "Member not found in workspace" }, 404);

      await db.delete(members).where(eq(members.id, memberId));

      // Audit Log
      const auditPromise = db
        .insert(auditLogs)
        .values({
          adminId: adminUser.id,
          targetUserId: existing.userId,
          action: "TENANT_MEMBER_REMOVED",
          reason: `Workspace: ${workspaceId}. Reason: ${reason}`,
          ipAddress: c.req.header("x-forwarded-for") || "unknown",
        })
        .catch((err) => c.get("logger").error({ err }, "Failed to write audit log"));

      try {
        c.executionCtx.waitUntil(auditPromise);
      } catch (_e) {
        Promise.resolve(auditPromise);
      }

      return c.json({ success: true, message: "Member removed from workspace" }, 200);
    } catch (error) {
      superAdminControllerLog.error({ err: error }, "Failed to remove workspace member");
      return c.json({ error: "Internal Server Error" }, 500);
    }
  }
}
