import { type AppPermission, db, members } from "@starter/db";
import { and, eq } from "drizzle-orm";
import { Context, Next } from "hono";
import { PermissionService } from "../../features/permissions/permission.service";
import { auth } from "../lib/auth";

export const requireOrgPermission = (requiredPermission: AppPermission | AppPermission[]) => {
  return async (c: Context, next: Next) => {
    // 1. Validate Session
    const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!sessionData?.session || !sessionData?.user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    c.set("user", sessionData.user);

    // Guard against banned or suspended accounts
    const user = sessionData.user as any;
    if (user?.status === "banned") {
      return c.json(
        {
          error: "Forbidden",
          code: "ACCOUNT_BANNED",
          message: "This account has been permanently banned.",
        },
        403,
      );
    }
    if (user?.status === "suspended") {
      return c.json(
        {
          error: "Forbidden",
          code: "ACCOUNT_SUSPENDED",
          message: "This account is temporarily suspended. Please contact support.",
        },
        403,
      );
    }

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

    // Validate active workspace enrollment
    const currentMember = await db.query.members.findFirst({
      where: and(eq(members.userId, sessionData.user.id), eq(members.organizationId, orgId)),
    });

    if (!currentMember) {
      // Invalidate any stale Redis permission cache that might linger
      await PermissionService.invalidateCache(sessionData.user.id, orgId);
      return c.json(
        { error: "Forbidden", message: "You are not an active member of this workspace." },
        403,
      );
    }

    if (currentMember.role === "owner") {
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
