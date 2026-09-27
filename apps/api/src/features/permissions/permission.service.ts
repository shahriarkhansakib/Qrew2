import { db, members, orgMemberPermissions, orgMemberRoles, orgRolePermissions } from "@starter/db";
import { and, eq, inArray } from "drizzle-orm";
import { redis } from "../../infra/lib/redis";

export class PermissionService {
  /**
   * Resolves a user's permissions for a specific organization.
   * Returns a Set of permission strings (e.g., Set {'staff:view', 'finance:request_funds'})
   */
  static async resolvePermissions(userId: string, orgId: string): Promise<Set<string>> {
    const cacheKey = `perm:${userId}:${orgId}`;

    // 1. Check Redis Cache First (O(1) lookup)
    const cachedPerms = await redis.smembers(cacheKey);
    if (cachedPerms && cachedPerms.length > 0) {
      return new Set(cachedPerms);
    }

    // 2. Cache Miss: Compute from PostgreSQL
    // Get the Better Auth Member ID for this User + Org combo
    const member = await db.query.members.findFirst({
      where: and(eq(members.userId, userId), eq(members.organizationId, orgId)),
    });

    if (!member) return new Set();

    // 3. Fetch Base Roles & Permissions
    const memberRoles = await db.query.orgMemberRoles.findMany({
      where: eq(orgMemberRoles.memberId, member.id),
    });

    const roleIds = memberRoles.map((mr) => mr.roleId);
    let basePermissions: string[] = [];

    if (roleIds.length > 0) {
      const rolePerms = await db.query.orgRolePermissions.findMany({
        where: inArray(orgRolePermissions.roleId, roleIds),
      });
      basePermissions = rolePerms.map((rp) => rp.permissionKey);
    }

    // 4. Fetch Individual Overrides
    const overrides = await db.query.orgMemberPermissions.findMany({
      where: eq(orgMemberPermissions.memberId, member.id),
    });

    const allowOverrides = overrides.filter((o) => o.granted).map((o) => o.permissionKey);
    const denyOverrides = overrides.filter((o) => !o.granted).map((o) => o.permissionKey);

    // 5. The Resolution Algorithm: (Base Roles ∪ Allow Overrides) - Deny Overrides
    const finalPermissionSet = new Set([...basePermissions, ...allowOverrides]);
    denyOverrides.forEach((denyKey) => finalPermissionSet.delete(denyKey));

    // 6. Save to Redis (TTL: 900 seconds / 15 minutes)
    if (finalPermissionSet.size > 0) {
      const pipeline = redis.pipeline();
      const items = Array.from(finalPermissionSet) as [string, ...string[]];
      pipeline.sadd(cacheKey, ...items);
      pipeline.expire(cacheKey, 900);
      await pipeline.exec();
    }

    return finalPermissionSet;
  }

  /**
   * Clears the cache. Call this whenever a role or override is modified.
   */
  static async invalidateCache(userId: string, orgId: string): Promise<void> {
    await redis.del(`perm:${userId}:${orgId}`);
  }
}
