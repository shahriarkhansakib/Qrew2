import { db, members } from "@starter/db";
import { and, eq } from "drizzle-orm";
import { Context, Next } from "hono";
import { PermissionService } from "../../features/permissions/permission.service";
import { auth } from "../lib/auth";

export const requireOrgPermission = (requiredPermission: string | string[]) => {
  return async (c: Context, next: Next) => {
    // 1. Validate Session
    const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!sessionData?.session || !sessionData?.user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    c.set("user", sessionData.user);

    // 2. Global Admin Bypass (Super Admins ignore tenant boundaries)
    if (sessionData.user.role === "super_admin") {
      c.set("isOwner", true);
      return await next();
    }

    // 3. Validate Tenant Context
    const orgId = sessionData.session.activeOrganizationId;
    if (!orgId) {
      return c.json({ error: "No active workspace context selected." }, 400);
    }

    // Set the organizationId in the context so downstream controllers can use it
    c.set("organizationId", orgId);

    // NEW: Tenant Owner Bypass
    const currentMember = await db.query.members.findFirst({
      where: and(eq(members.userId, sessionData.user.id), eq(members.organizationId, orgId)),
    });

    if (currentMember?.role === "owner") {
      c.set("isOwner", true);
      return await next(); // Owners bypass all PBAC checks
    }

    // 4. Resolve & Verify Permissions
    const userPermissions = await PermissionService.resolvePermissions(sessionData.user.id, orgId);

    // Inject for downstream scrubber logic
    c.set("isOwner", false);
    c.set("userPermissions", userPermissions);

    const hasPermission = Array.isArray(requiredPermission)
      ? requiredPermission.some((perm) => userPermissions.has(perm))
      : userPermissions.has(requiredPermission);

    if (!hasPermission) {
      const permDesc = Array.isArray(requiredPermission)
        ? requiredPermission.join(" or ")
        : requiredPermission;
      console.warn(`[PBAC] Blocked: User ${sessionData.user.id} attempted to access ${permDesc}`);
      return c.json(
        {
          error: "Forbidden",
          message: `You do not have the required permission: ${permDesc}`,
        },
        403,
      );
    }

    // Passed all checks
    await next();
  };
};
