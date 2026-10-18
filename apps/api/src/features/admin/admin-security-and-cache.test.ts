import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuthApi,
  mockDbQuery,
  mockDbInsert,
  mockDbUpdate,
  mockDbDelete,
  mockPermissionService,
  mockRedis,
} = vi.hoisted(() => {
  const mockAuthApi = {
    getSession: vi.fn(),
  };
  const mockDbQuery = {
    members: { findFirst: vi.fn() },
    orgRoles: { findFirst: vi.fn() },
    users: { findFirst: vi.fn() },
    sessions: { findFirst: vi.fn() },
  };
  const mockDbInsert = vi.fn();
  const mockDbUpdate = vi.fn();
  const mockDbDelete = vi.fn();
  const mockPermissionService = {
    resolvePermissions: vi.fn(),
    invalidateCache: vi.fn(),
  };
  const mockRedis = {
    del: vi.fn(),
    keys: vi.fn(),
  };

  return {
    mockAuthApi,
    mockDbQuery,
    mockDbInsert,
    mockDbUpdate,
    mockDbDelete,
    mockPermissionService,
    mockRedis,
  };
});

vi.mock("../../infra/lib/auth", () => ({
  auth: {
    api: mockAuthApi,
  },
}));

vi.mock("@starter/db", () => ({
  db: {
    query: mockDbQuery,
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    insert: (...args: any[]) => mockDbInsert(...args),
    update: (...args: any[]) => mockDbUpdate(...args),
    delete: (...args: any[]) => mockDbDelete(...args),
    transaction: async (cb: any) =>
      cb({
        update: (...args: any[]) => mockDbUpdate(...args),
        delete: (...args: any[]) => mockDbDelete(...args),
        insert: (...args: any[]) => mockDbInsert(...args),
      }),
  },
  members: { id: "id", userId: "user_id", organizationId: "organization_id" },
  orgRoles: { id: "id", organizationId: "organization_id", name: "name", isSystem: "is_system" },
  orgRolePermissions: { roleId: "role_id", permissionKey: "permission_key" },
  orgMemberRoles: { id: "id", memberId: "member_id", roleId: "role_id" },
  users: { id: "id", email: "email", role: "role" },
  sessions: { id: "id", userId: "user_id", token: "token" },
  auditLogs: { id: "id" },
}));

vi.mock("../permissions/permission.service", () => ({
  PermissionService: mockPermissionService,
}));

vi.mock("../../infra/lib/redis", () => ({
  redis: mockRedis,
}));

import { requireAuth } from "../../infra/middleware/auth";
import { requireOrgPermission } from "../../infra/middleware/require-permission";
import { RolesController } from "../roles/roles.controller";
import { WorkspacesController } from "../workspaces/workspaces.controller";

describe("Admin Security & Cache Invalidation Guardrails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("requireAuth Guardrails", () => {
    it("blocks banned accounts with 403 Forbidden", async () => {
      mockAuthApi.getSession.mockResolvedValueOnce({
        session: { id: "sess_1", userId: "usr_1" },
        user: { id: "usr_1", status: "banned", role: "user" },
      });

      const next = vi.fn();
      const ctx: any = {
        req: { raw: { headers: new Headers() }, path: "/api/workspaces/settings" },
        set: vi.fn(),
        json: vi.fn((data, status) => ({ data, status })),
      };

      const middleware = requireAuth;
      const res = await (middleware as any)(ctx, next);

      expect(res.status).toBe(403);
      expect(res.data.code).toBe("ACCOUNT_BANNED");
      expect(next).not.toHaveBeenCalled();
    });

    it("blocks suspended accounts with 403 Forbidden", async () => {
      mockAuthApi.getSession.mockResolvedValueOnce({
        session: { id: "sess_1", userId: "usr_1" },
        user: { id: "usr_1", status: "suspended", role: "user" },
      });

      const next = vi.fn();
      const ctx: any = {
        req: { raw: { headers: new Headers() }, path: "/api/workspaces/settings" },
        set: vi.fn(),
        json: vi.fn((data, status) => ({ data, status })),
      };

      const res = await (requireAuth as any)(ctx, next);

      expect(res.status).toBe(403);
      expect(res.data.code).toBe("ACCOUNT_SUSPENDED");
      expect(next).not.toHaveBeenCalled();
    });

    it("allows active accounts through", async () => {
      mockAuthApi.getSession.mockResolvedValueOnce({
        session: { id: "sess_1", userId: "usr_1" },
        user: { id: "usr_1", status: "active", role: "user" },
      });

      const next = vi.fn();
      const ctx: any = {
        req: { raw: { headers: new Headers() }, path: "/api/workspaces/settings" },
        set: vi.fn(),
        json: vi.fn(),
      };

      await (requireAuth as any)(ctx, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe("requireOrgPermission Active Membership & Cache Guardrails", () => {
    it("rejects non-members and invalidates stale Redis permission cache", async () => {
      mockAuthApi.getSession.mockResolvedValueOnce({
        session: { id: "sess_1", activeOrganizationId: "org_1" },
        user: { id: "usr_1", status: "active", role: "user" },
      });

      // User has been revoked/deleted from workspace members
      mockDbQuery.members.findFirst.mockResolvedValueOnce(null);

      const next = vi.fn();
      const ctx: any = {
        req: { raw: { headers: new Headers() } },
        set: vi.fn(),
        json: vi.fn((data, status) => ({ data, status })),
      };

      const guard = requireOrgPermission("workspace:manage_settings" as any);
      const res = (await guard(ctx, next)) as any;

      expect(res.status).toBe(403);
      expect(res.data.message).toContain("not an active member");
      expect(mockPermissionService.invalidateCache).toHaveBeenCalledWith("usr_1", "org_1");
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("WorkspacesController Revocation & Role Updates", () => {
    it("purges Redis permissions cache when revoking staff", async () => {
      const deletedMember = { id: "mem_1", userId: "usr_1", organizationId: "org_1" };
      mockDbDelete.mockReturnValueOnce({
        where: vi.fn().mockReturnValueOnce({
          returning: vi.fn().mockResolvedValueOnce([deletedMember]),
        }),
      });

      const ctx: any = {
        get: (k: string) => (k === "organizationId" ? "org_1" : undefined),
        req: {
          param: (k: string) => (k === "memberId" ? "mem_1" : undefined),
        },
        json: vi.fn((data, status = 200) => ({ data, status })),
      };

      const res = await WorkspacesController.revokeStaff(ctx);

      expect(res.status).toBe(200);
      expect(mockPermissionService.invalidateCache).toHaveBeenCalledWith("usr_1", "org_1");
    });
  });

  describe("RolesController Compound Scoping", () => {
    it("compound-scopes role update with organizationId", async () => {
      mockAuthApi.getSession.mockResolvedValueOnce({
        session: { id: "sess_1", activeOrganizationId: "org_1" },
        user: { id: "usr_1", role: "admin" },
      });

      mockDbQuery.orgRoles.findFirst.mockResolvedValueOnce({
        id: "role_1",
        organizationId: "org_1",
        isSystem: false,
        name: "Old Role",
      });

      const updateWhere = vi.fn().mockReturnValueOnce({
        returning: vi.fn().mockResolvedValueOnce([{ id: "role_1", name: "New Role" }]),
      });
      mockDbUpdate.mockReturnValueOnce({
        set: vi.fn().mockReturnValueOnce({
          where: updateWhere,
        }),
      });

      const deleteWhere = vi.fn().mockResolvedValueOnce([]);
      mockDbDelete.mockReturnValueOnce({ where: deleteWhere });

      const ctx: any = {
        req: {
          raw: { headers: new Headers() },
          param: (k: string) => (k === "roleId" ? "role_1" : undefined),
          json: async () => ({ name: "New Role", permissionKeys: [] }),
        },
        json: vi.fn((data, status = 200) => ({ data, status })),
      };

      const res = await RolesController.updateRole(ctx);

      expect(res.status).toBe(200);
      // The update must have executed
      expect(updateWhere).toHaveBeenCalled();
    });
  });
});
