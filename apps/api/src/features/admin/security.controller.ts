import { auditLogs, db, twoFactor, users } from "@starter/db";
import { eq } from "drizzle-orm";
import { Context } from "hono";
import { z } from "zod";
import { auth } from "../../infra/lib/auth";
import { logger } from "../../infra/lib/logger";

const securityControllerLog = logger.child({ module: "security-controller" });

const ROLE_HIERARCHY: Record<string, number> = {
  user: 1,
  admin: 2,
  super_admin: 3,
};

const SecurityActionSchema = z.object({
  targetUserId: z.string().min(1),
  action: z.enum(["ban", "suspend", "require_reset", "reset_mfa"]),
  reason: z.string().min(10, "SOC2 Audit reason required"),
});

export class SecurityController {
  static async enforceSecurityAction(c: Context) {
    try {
      const body = await c.req.json();
      const parsed = SecurityActionSchema.safeParse(body);

      if (!parsed.success) {
        return c.json({ error: "Bad Request", issues: parsed.error.format() }, 400);
      }

      const { targetUserId, action, reason } = parsed.data;
      const adminUser = c.get("user") as any;

      if (!adminUser) {
        return c.json({ error: "Unauthorized", message: "Admin session required." }, 401);
      }

      if (adminUser.id === targetUserId) {
        return c.json(
          { error: "Conflict", message: "You cannot perform security actions on yourself." },
          409,
        );
      }

      // Query target user's role and validate hierarchy BEFORE executing action
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

      let updatePayload: Record<string, any> = {};
      if (action === "ban") updatePayload = { status: "banned" };
      if (action === "suspend") updatePayload = { status: "suspended" };
      if (action === "require_reset") updatePayload = { requiresPasswordReset: true };
      if (action === "reset_mfa")
        updatePayload = { requiresPasswordReset: true, twoFactorEnabled: false };

      // 1. Update Database Record
      if (Object.keys(updatePayload).length > 0) {
        await db.update(users).set(updatePayload).where(eq(users.id, targetUserId));
      }

      if (action === "reset_mfa") {
        await db.delete(twoFactor).where(eq(twoFactor.userId, targetUserId));
      }

      // The Session Guillotine
      const result = (await auth.api.revokeUserSessions({
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
          action: `SECURITY_ENFORCEMENT_${action.toUpperCase()}`,
          reason: reason,
          ipAddress: c.req.header("x-forwarded-for") || "unknown",
        })
        .catch((err) => c.get("logger").error({ err }, "Failed to write security audit log"));

      // THE FIX: Safely attempt Serverless execution, catch the getter throw for Node.js fallback
      try {
        c.executionCtx.waitUntil(auditPromise);
      } catch (_e) {
        // c.executionCtx getter throws in Node.js local dev. Fallback to standard Promise.
        Promise.resolve(auditPromise);
      }

      // Safely forward headers
      if (result?.headers) {
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
      }

      return c.json(
        { success: true, message: `Security action ${action} applied to user ${targetUserId}` },
        200,
      );
    } catch (error) {
      securityControllerLog.error(
        { err: error, targetUserId: c.req.param("targetUserId") },
        "Security action failed",
      );
      return c.json(
        { error: "Internal Server Error", message: "Failed to enforce security protocol." },
        500,
      );
    }
  }
}
