import { db, members, orgMemberRoles } from "@starter/db";
import { and, eq } from "drizzle-orm";
import { Context } from "hono";
import { auth } from "../../infra/lib/auth";
import { PermissionService } from "./permission.service";

export class PermissionsController {
  static async getMyPermissions(c: Context) {
    try {
      const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });
      const activeOrgId = sessionData?.session?.activeOrganizationId;

      if (!sessionData || !activeOrgId) {
        return c.json({ permissions: [], role: null, roleIds: [], isOwner: false }, 200); // Fail gracefully for the UI
      }

      // Global Admins get a special wildcard or bypass flag on the frontend
      if (sessionData.user.role === "super_admin") {
        return c.json({ permissions: ["*"], role: "owner", roleIds: [], isOwner: true }, 200);
      }

      // NEW: Check if the user is the Tenant Owner
      const currentMember = await db.query.members.findFirst({
        where: and(
          eq(members.userId, sessionData.user.id),
          eq(members.organizationId, activeOrgId),
        ),
      });

      if (currentMember?.role === "owner") {
        return c.json({ permissions: ["*"], role: "owner", roleIds: [], isOwner: true }, 200); // Owners get the wildcard
      }

      const memberRoles = currentMember
        ? await db.query.orgMemberRoles.findMany({
            where: eq(orgMemberRoles.memberId, currentMember.id),
          })
        : [];
      const roleIds = memberRoles.map((mr) => mr.roleId);

      const permissionSet = await PermissionService.resolvePermissions(
        sessionData.user.id,
        activeOrgId,
      );

      // Convert Set to Array for JSON serialization
      return c.json(
        {
          permissions: Array.from(permissionSet),
          role: currentMember?.role ?? "member",
          roleIds,
          isOwner: false,
        },
        200,
      );
    } catch (error) {
      console.error("[PermissionsController.getMyPermissions] Failed:", error);
      return c.json({ permissions: [], role: null, roleIds: [], isOwner: false }, 500);
    }
  }
}
