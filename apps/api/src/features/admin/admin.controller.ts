import { accounts, auditLogs, db, members, organizations, users } from "@starter/db";
import { and, count, desc, eq, exists, ilike, or } from "drizzle-orm";
import { Context } from "hono";
import { z } from "zod";
import { auth } from "../../infra/lib/auth";
import { logger } from "../../infra/lib/logger";

const adminControllerLog = logger.child({ module: "admin-controller" });

const ROLE_HIERARCHY: Record<string, number> = {
  user: 1,
  admin: 2,
  super_admin: 3,
};

// Strict validation for query parameters
const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  workspaceId: z.string().optional(), // NEW: Strict ID filtering
});

export class AdminController {
  static async listUsers(c: Context) {
    try {
      // 1. Validate Query Parameters
      const queryParams = c.req.query();
      const parsed = paginationSchema.safeParse(queryParams);

      if (!parsed.success) {
        return c.json(
          { error: "Invalid pagination parameters", details: parsed.error.format() },
          400,
        );
      }

      const { page, limit, search, workspaceId } = parsed.data;
      const offset = (page - 1) * limit;

      // 2. Construct Conditions
      const searchCondition = search
        ? or(ilike(users.email, `%${search}%`), ilike(users.name, `%${search}%`))
        : undefined;

      // The Indexed Workspace Filter (O(log N) safe)
      const workspaceCondition = workspaceId
        ? exists(
            db
              .select()
              .from(members)
              .where(and(eq(members.userId, users.id), eq(members.organizationId, workspaceId))),
          )
        : undefined;

      const finalCondition = and(searchCondition, workspaceCondition);

      // 3. Execute Parallel Queries (Data & Total Count)
      const [dataResult, countResult] = await Promise.all([
        db.query.users.findMany({
          where: finalCondition,
          limit: limit,
          offset: offset,
          orderBy: [desc(users.createdAt)],
          columns: {
            id: true,
            name: true,
            email: true,
            role: true,
            emailVerified: true,
            createdAt: true,
            status: true,
            requiresPasswordReset: true,
          },
          with: {
            members: {
              with: {
                workspace: {
                  columns: { id: true, name: true },
                },
              },
            },
          },
        }),
        db.select({ total: count() }).from(users).where(finalCondition),
      ]);

      const totalRecords = countResult[0]?.total || 0;
      const totalPages = Math.ceil(totalRecords / limit);

      // 4. Map for the Truncated Badge UI
      const flattenedData = dataResult.map((user) => {
        const userWorkspaces = user.members?.map((m) => m.workspace) || [];
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          emailVerified: user.emailVerified,
          createdAt: user.createdAt,
          status: user.status,
          requiresPasswordReset: user.requiresPasswordReset,
          primaryWorkspace: userWorkspaces[0]?.name || "No Workspace",
          additionalWorkspacesCount: Math.max(0, userWorkspaces.length - 1),
          allWorkspaces: userWorkspaces,
        };
      });

      // 5. Return Standardized Pagination Payload
      return c.json(
        {
          data: flattenedData,
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
      adminControllerLog.error({ err: error }, "Failed to list users");
      return c.json({ error: "Internal Server Error" }, 500);
    }
  }

  static async impersonateUser(c: Context) {
    try {
      const body = await c.req.json();
      const parsed = ImpersonateSchema.safeParse(body);

      if (!parsed.success) {
        return c.json({ error: "Bad Request", issues: parsed.error.format() }, 400);
      }

      const { targetUserId, reason } = parsed.data;
      const adminUser = c.get("user") as any;

      if (!adminUser) {
        return c.json({ error: "Unauthorized", message: "Admin user session not found." }, 401);
      }

      if (adminUser.id === targetUserId) {
        return c.json({ error: "Conflict", message: "You cannot impersonate yourself." }, 409);
      }

      // Query target user's role and validate hierarchy BEFORE executing impersonation
      const targetUser = await db.query.users.findFirst({
        where: eq(users.id, targetUserId),
        columns: { role: true },
      });

      if (!targetUser) {
        return c.json({ error: "Not Found", message: "Target user does not exist." }, 404);
      }

      const actorLevel = ROLE_HIERARCHY[adminUser.role] ?? 1;
      const targetLevel = ROLE_HIERARCHY[targetUser.role] ?? 1;

      // Block: actor must strictly outrank the target.
      // Exception: super_admin (level 3) may act on another super_admin.
      if (targetLevel >= actorLevel && actorLevel < 3) {
        return c.json(
          {
            error: "Forbidden",
            message:
              "Privilege escalation denied. You cannot act on a user with an equal or higher role.",
          },
          403,
        );
      }

      // Execute Better Auth impersonation
      const result = (await auth.api.impersonateUser({
        headers: c.req.raw.headers,
        body: { userId: targetUserId },
        asResponse: true,
      })) as Response;

      // The Promise we want to run in the background
      const auditPromise = db
        .insert(auditLogs)
        .values({
          adminId: adminUser.id,
          targetUserId: targetUserId,
          action: "IMPERSONATE_START",
          reason: reason,
          ipAddress: c.req.header("x-forwarded-for") || "unknown",
        })
        .catch((err) => c.get("logger").error({ err }, "Failed to write audit log"));

      // THE FIX: Safely attempt Serverless execution, catch the getter throw for Node.js fallback
      try {
        c.executionCtx.waitUntil(auditPromise);
      } catch (_e) {
        // c.executionCtx getter throws in Node.js local dev. Fallback to standard Promise.
        Promise.resolve(auditPromise);
      }

      // 1. Forward all non-cookie headers safely
      result.headers.forEach((value, key) => {
        if (key.toLowerCase() !== "set-cookie") {
          c.header(key, value);
        }
      });

      // 2. Safely extract and append multiple Set-Cookie headers
      if (result.headers.has("set-cookie")) {
        const cookies = result.headers.getSetCookie ? result.headers.getSetCookie() : [];
        cookies.forEach((cookie) => {
          c.header("set-cookie", cookie, { append: true });
        });
      }

      return c.json({ success: true, message: `Impersonating user ${targetUserId}` }, 200);
    } catch (error) {
      adminControllerLog.error({ err: error }, "Impersonation failed");
      return c.json(
        { error: "Internal Server Error", message: "Impersonation engine failed." },
        500,
      );
    }
  }

  static async stopImpersonation(c: Context) {
    const session = c.get("session");
    const tenantUser = c.get("user"); // When impersonating, the 'user' is the tenant

    // Guard Clause: Ensure they are actually impersonating someone
    if (!session?.impersonatedBy) {
      return c.json(
        { error: "Bad Request", message: "Not currently impersonating any user." },
        400,
      );
    }

    const originalAdminId = session.impersonatedBy;

    try {
      // Execute Better Auth's native stop method
      const result = (await auth.api.stopImpersonating({
        headers: c.req.raw.headers,
        asResponse: true,
      })) as Response;

      // The Promise we want to run in the background
      const auditPromise = db
        .insert(auditLogs)
        .values({
          adminId: originalAdminId,
          targetUserId: tenantUser.id,
          action: "IMPERSONATE_STOP",
          reason: "Admin exited impersonation mode",
          ipAddress: c.req.header("x-forwarded-for") || "unknown",
        })
        .catch((err) => c.get("logger").error({ err }, "Failed to write exit audit log"));

      // Safely attempt Serverless execution, catch the getter throw for Node.js fallback
      try {
        c.executionCtx.waitUntil(auditPromise);
      } catch (_e) {
        Promise.resolve(auditPromise);
      }

      result.headers.forEach((value, key) => {
        if (key.toLowerCase() !== "set-cookie") {
          c.header(key, value);
        }
      });

      if (result.headers.has("set-cookie")) {
        const cookies = result.headers.getSetCookie ? result.headers.getSetCookie() : [];
        cookies.forEach((cookie) => {
          c.header("set-cookie", cookie, { append: true });
        });
      }

      return c.json({ success: true, message: "Impersonation stopped successfully" }, 200);
    } catch (error) {
      c.get("logger").error(
        { err: error, adminId: originalAdminId },
        "Failed to stop impersonation",
      );
      return c.json({ error: "Internal Server Error", message: "Could not revert session." }, 500);
    }
  }

  static async listWorkspaces(c: Context) {
    try {
      const allWorkspaces = await db.query.organizations.findMany({
        columns: {
          id: true,
          name: true,
        },
        orderBy: [desc(organizations.createdAt)],
      });
      return c.json({ data: allWorkspaces }, 200);
    } catch (error) {
      c.get("logger").error({ err: error }, "Failed to list workspaces");
      return c.json({ error: "Internal Server Error" }, 500);
    }
  }

  static async getUserIdentity(c: Context) {
    try {
      const userId = c.req.param("userId");
      if (!userId) return c.json({ error: "User ID is required" }, 400);

      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: {
          id: true,
          name: true,
          email: true,
          lastLoginAt: true,
        },
      });

      if (!user) return c.json({ error: "User not found" }, 404);

      const userAccounts = await db.select().from(accounts).where(eq(accounts.userId, userId));

      return c.json({ data: { ...user, accounts: userAccounts } }, 200);
    } catch (error) {
      adminControllerLog.error({ err: error }, "Failed to fetch user identity");
      return c.json({ error: "Internal Server Error" }, 500);
    }
  }
}

const ImpersonateSchema = z.object({
  targetUserId: z.string().min(1, "Target User ID is required"),
  reason: z.string().min(10, "A valid audit reason must be provided (min 10 chars)"),
});
