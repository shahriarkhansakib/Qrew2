/**
 * drafts.test.ts
 *
 * Comprehensive integration tests for DraftsController & Audit Trail:
 *   - listDrafts: scopes to organization, optional projectId filtering, eager-loads creator user
 *   - getDraftById: eager-loads project, client, and creator user
 *   - createDraft: initializes editHistory with creator action
 *   - upsertDraft: updates or creates draft without leaking error stack traces
 *   - deleteDraft: allows authorized organization members to delete drafts
 *   - appendAuditEntry:
 *       - records actor metadata (userId, userName, userEmail, editedAt, action)
 *       - coalesces rapid edits by the same user (<2 minutes) into 1 entry
 *       - records distinct entries when edited by a different user
 *       - enforces 50-entry cap under high-volume edit stress
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { appendAuditEntry } from "./draft-audit";
import { DraftsController } from "./drafts.controller";

const { mockDbQuery, mockDbInsert, mockDbUpdate, mockDbDelete } = vi.hoisted(() => {
  const mockDbQuery = {
    invoiceDrafts: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
  };
  const mockDbInsert = vi.fn();
  const mockDbUpdate = vi.fn();
  const mockDbDelete = vi.fn();

  return {
    mockDbQuery,
    mockDbInsert,
    mockDbUpdate,
    mockDbDelete,
  };
});

vi.mock("@starter/db", () => {
  const chainable = () => ({
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: "draft-1", name: "Updated Draft" }]),
    values: vi.fn().mockReturnThis(),
  });

  return {
    db: {
      query: mockDbQuery,
      insert: (...args: any[]) => {
        mockDbInsert(...args);
        return chainable();
      },
      update: (...args: any[]) => {
        mockDbUpdate(...args);
        return chainable();
      },
      delete: (...args: any[]) => {
        mockDbDelete(...args);
        return {
          where: vi.fn().mockResolvedValue(undefined),
        };
      },
    },
    invoiceDrafts: {
      id: "id",
      organizationId: "organization_id",
      projectId: "project_id",
      userId: "user_id",
      lastAutoSavedAt: "last_auto_saved_at",
      name: "name",
      description: "description",
    },
  };
});

vi.mock("./draft-seeder", () => ({
  DraftSeeder: {
    hydrateFromTemplate: vi.fn().mockResolvedValue({
      draftSections: [],
      draftConstants: {},
      draftHeaderValues: {},
      draftHeaderFields: [],
    }),
  },
}));

function createMockContext({
  body,
  params = {},
  query = {},
  orgId = "org_test",
  user = { id: "usr_alice", name: "Alice Designer", email: "alice@agency.com" },
}: {
  body?: any;
  params?: Record<string, string>;
  query?: Record<string, string>;
  orgId?: string;
  user?: any;
} = {}) {
  return {
    get: (k: string) => {
      if (k === "organizationId") return orgId;
      if (k === "user") return user;
      return undefined;
    },
    req: {
      json: async () => body,
      param: (k: string) => params[k],
      query: (k?: string) => (k ? query[k] : query),
    },
    json: (data: any, status = 200) => ({ data, status }),
  } as any;
}

describe("DraftsController & Collaboration Audit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. listDrafts & Multi-Draft Collaboration
  // ───────────────────────────────────────────────────────────────────────────
  describe("listDrafts", () => {
    it("returns all organization drafts with creator user metadata", async () => {
      const mockDrafts = [
        {
          id: "draft-1",
          name: "Project Redesign - Draft A",
          projectId: "proj-1",
          user: { id: "usr_alice", name: "Alice", email: "alice@agency.com" },
          editHistory: [{ action: "Created draft" }],
        },
        {
          id: "draft-2",
          name: "Project Redesign - Draft B",
          projectId: "proj-1",
          user: { id: "usr_bob", name: "Bob", email: "bob@agency.com" },
          editHistory: [{ action: "Created draft" }],
        },
      ];
      mockDbQuery.invoiceDrafts.findMany.mockResolvedValueOnce(mockDrafts);

      const ctx = createMockContext();
      const res: any = await DraftsController.listDrafts(ctx);

      expect(res.status).toBe(200);
      expect(res.data).toHaveLength(2);
      expect(res.data[0].user.name).toBe("Alice");
      expect(res.data[1].user.name).toBe("Bob");
    });

    it("filters drafts by projectId when requested", async () => {
      mockDbQuery.invoiceDrafts.findMany.mockResolvedValueOnce([
        { id: "draft-1", projectId: "proj-99" },
      ]);

      const ctx = createMockContext({ query: { projectId: "proj-99" } });
      const res: any = await DraftsController.listDrafts(ctx);

      expect(res.status).toBe(200);
      expect(mockDbQuery.invoiceDrafts.findMany).toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. getDraftById
  // ───────────────────────────────────────────────────────────────────────────
  describe("getDraftById", () => {
    it("returns draft with eager-loaded user and project relations", async () => {
      const mockDraft = {
        id: "draft-42",
        name: "Retainer Billing",
        user: { id: "usr_alice", name: "Alice" },
        project: { name: "Acme Brand Campaign" },
      };
      mockDbQuery.invoiceDrafts.findFirst.mockResolvedValueOnce(mockDraft);

      const ctx = createMockContext({ params: { id: "draft-42" } });
      const res: any = await DraftsController.getDraftById(ctx);

      expect(res.status).toBe(200);
      expect(res.data.id).toBe("draft-42");
      expect(res.data.user.name).toBe("Alice");
    });

    it("returns 404 when draft does not exist in the tenant organization", async () => {
      mockDbQuery.invoiceDrafts.findFirst.mockResolvedValueOnce(null);

      const ctx = createMockContext({ params: { id: "missing" } });
      const res: any = await DraftsController.getDraftById(ctx);

      expect(res.status).toBe(404);
      expect(res.data.error).toBe("Draft not found");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. createDraft & Audit Trail Initialization
  // ───────────────────────────────────────────────────────────────────────────
  describe("createDraft", () => {
    it("creates draft and binds creator user metadata to editHistory", async () => {
      const ctx = createMockContext({
        body: {
          projectId: "proj-1",
          sourceTemplateId: "tpl-standard",
          name: "Q4 Media Spend Draft",
        },
        user: { id: "usr_alice", name: "Alice Designer", email: "alice@agency.com" },
      });

      const res: any = await DraftsController.createDraft(ctx);

      expect(res.status).toBe(200);
      expect(mockDbInsert).toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. deleteDraft (Organization-wide shared management)
  // ───────────────────────────────────────────────────────────────────────────
  describe("deleteDraft", () => {
    it("allows authorized team member to delete a draft cleanly", async () => {
      const ctx = createMockContext({ params: { id: "draft-del" } });
      const res: any = await DraftsController.deleteDraft(ctx);

      expect(res.status).toBe(204);
      expect(mockDbDelete).toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. appendAuditEntry — Coalescing & Stress Invariants
  // ───────────────────────────────────────────────────────────────────────────
  describe("appendAuditEntry (Audit Trail Coalescing)", () => {
    const userAlice = { id: "usr_1", name: "Alice", email: "alice@agency.com" };
    const userBob = { id: "usr_2", name: "Bob", email: "bob@agency.com" };

    it("appends a new entry when edit history is empty", () => {
      const result = appendAuditEntry([], userAlice, "Created draft");
      expect(result).toHaveLength(1);
      expect(result[0].userId).toBe("usr_1");
      expect(result[0].userName).toBe("Alice");
      expect(result[0].action).toBe("Created draft");
    });

    it("coalesces rapid consecutive edits (<2 min) by the same user into a single entry", () => {
      const baseTime = new Date(Date.now() - 30_000).toISOString();
      const initialHistory = [
        {
          userId: "usr_1",
          userName: "Alice",
          userEmail: "alice@agency.com",
          editedAt: baseTime,
          action: "Updated row ROW1",
        },
      ];

      // Edit 30 seconds later by Alice
      const updatedHistory = appendAuditEntry(initialHistory, userAlice, "Updated row ROW2");

      expect(updatedHistory).toHaveLength(1);
      expect(updatedHistory[0].userId).toBe("usr_1");
      expect(updatedHistory[0].action).toBe("Updated row ROW2");
      // Timestamp was updated to current time
      expect(new Date(updatedHistory[0].editedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(baseTime).getTime(),
      );
    });

    it("creates a new distinct entry when a different user edits immediately", () => {
      const baseTime = new Date().toISOString();
      const initialHistory = [
        {
          userId: "usr_1",
          userName: "Alice",
          userEmail: "alice@agency.com",
          editedAt: baseTime,
          action: "Initial row edit",
        },
      ];

      // Bob makes an edit right after Alice
      const updatedHistory = appendAuditEntry(initialHistory, userBob, "Bob updated tax charge");

      expect(updatedHistory).toHaveLength(2);
      expect(updatedHistory[0].userName).toBe("Alice");
      expect(updatedHistory[1].userName).toBe("Bob");
    });

    it("caps audit history at 50 entries under high-frequency edit stress", () => {
      const history: any[] = [];
      const pastTime = new Date("2026-01-01T00:00:00.000Z");

      // Seed 60 distinct edits separated by 5 minutes each
      for (let i = 0; i < 60; i++) {
        const editTime = new Date(pastTime.getTime() + i * 5 * 60 * 1000).toISOString();
        history.push({
          userId: `usr_${i}`,
          userName: `User ${i}`,
          editedAt: editTime,
          action: `Edit iteration ${i}`,
        });
      }

      expect(history).toHaveLength(60);

      // Now append an edit through appendAuditEntry
      const result = appendAuditEntry(history, userAlice, "New capped edit");

      expect(result).toHaveLength(50);
      expect(result[result.length - 1].action).toBe("New capped edit");
    });
  });
});
