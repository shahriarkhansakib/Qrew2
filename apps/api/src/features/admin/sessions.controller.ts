import { auditLogs, db, sessions } from "@starter/db";
import { desc, eq } from "drizzle-orm";
import { Context } from "hono";
import { z } from "zod";
import { logger } from "../../infra/lib/logger";

const sessionsControllerLog = logger.child({ module: "sessions-controller" });

const RevokeSessionSchema = z.object({
  sessionId: z.string().min(1),
  targetUserId: z.string().min(1),
  reason: z.string().min(10),
});

export class SessionsController {
  static async listUserSessions(c: Context) {
    try {
      const targetUserId = c.req.param("userId");
      if (!targetUserId) return c.json({ error: "User ID is required" }, 400);

      const userSessions = await db.query.sessions.findMany({
        where: eq(sessions.userId, targetUserId),
        orderBy: [desc(sessions.createdAt)],
      });

      return c.json({ data: userSessions }, 200);
    } catch (error) {
      sessionsControllerLog.error({ err: error }, "Failed to list user sessions");
      return c.json({ error: "Internal Server Error" }, 500);
    }
  }

  static async revokeSession(c: Context) {
    try {
      const body = await c.req.json();
      const parsed = RevokeSessionSchema.safeParse(body);

      if (!parsed.success) {
        return c.json({ error: "Bad Request", issues: parsed.error.format() }, 400);
      }

      const { sessionId, targetUserId, reason } = parsed.data;
      const adminUser = c.get("user") as any;

      if (!adminUser) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      // Verify the session belongs to the target user
      const session = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId),
      });

      if (!session || session.userId !== targetUserId) {
        return c.json({ error: "Session not found or belongs to another user" }, 404);
      }

      // Delete the session
      await db.delete(sessions).where(eq(sessions.id, sessionId));

      // Audit Log
      const auditPromise = db
        .insert(auditLogs)
        .values({
          adminId: adminUser.id,
          targetUserId: targetUserId,
          action: "SESSION_REVOKED",
          reason: reason,
          ipAddress: c.req.header("x-forwarded-for") || "unknown",
        })
        .catch((err) => c.get("logger").error({ err }, "Failed to write session revoke audit log"));

      try {
        c.executionCtx.waitUntil(auditPromise);
      } catch (_e) {
        Promise.resolve(auditPromise);
      }

      return c.json({ success: true, message: "Session revoked successfully" }, 200);
    } catch (error) {
      sessionsControllerLog.error({ err: error }, "Failed to revoke session");
      return c.json({ error: "Internal Server Error" }, 500);
    }
  }
}
