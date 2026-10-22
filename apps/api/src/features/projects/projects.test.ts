/**
 * projects.test.ts
 *
 * Comprehensive tests for ProjectsController CRUD and lifecycle:
 *   - listProjects: active/archived filters, client filtering, expense/invoice rollup, PBAC scrubbing
 *   - createProject: default status assignment, sequence number computation, dynamic schema validation
 *   - archiveProject / unarchiveProject: lifecycle transitions, conflict/state guards
 *   - deleteProject: removal and 404 guards
 *   - attachments: presigned upload URL, save attachment, list attachments
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectsController } from "./projects.controller";

// ─── Hoisted Mocks ────────────────────────────────────────────────────────

const { mockDbQuery, mockDbSelect, mockDbInsert, mockDbUpdate, mockDbDelete, mockUploadsService } =
  vi.hoisted(() => {
    const mockDbQuery = {
      projects: { findMany: vi.fn(), findFirst: vi.fn() },
      projectStatuses: { findFirst: vi.fn() },
      customFieldDefinitions: { findMany: vi.fn() },
      projectAttachments: { findMany: vi.fn() },
    };
    const mockDbSelect = vi.fn();
    const mockDbInsert = vi.fn();
    const mockDbUpdate = vi.fn();
    const mockDbDelete = vi.fn();
    const mockUploadsService = {
      generateProjectAttachmentPresignedPut: vi.fn(),
    };

    return {
      mockDbQuery,
      mockDbSelect,
      mockDbInsert,
      mockDbUpdate,
      mockDbDelete,
      mockUploadsService,
    };
  });

vi.mock("@starter/db", () => ({
  db: {
    query: mockDbQuery,
    select: (...args: any[]) => mockDbSelect(...args),
    insert: (...args: any[]) => mockDbInsert(...args),
    update: (...args: any[]) => mockDbUpdate(...args),
    delete: (...args: any[]) => mockDbDelete(...args),
  },
  projects: {
    id: "id",
    organizationId: "organization_id",
    clientId: "client_id",
    name: "name",
    status: "status",
    lifecycleState: "lifecycle_state",
    customFields: "custom_fields",
    fileSequenceNumber: "file_sequence_number",
    createdAt: "created_at",
    updatedAt: "updated_at",
    version: "version",
    stageFieldHistory: "stage_field_history",
  },
  projectStatuses: {
    id: "id",
    organizationId: "organization_id",
    isDefault: "is_default",
  },
  projectStatusTransitions: {},
  projectStatusFields: {},
  customFieldDefinitions: {},
  expenses: { projectId: "project_id", organizationId: "organization_id", amount: "amount" },
  invoices: { projectId: "project_id", organizationId: "organization_id", id: "id" },
  projectAttachments: {
    id: "id",
    organizationId: "organization_id",
    projectId: "project_id",
  },
}));

vi.mock("../../infra/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

vi.mock("../uploads/uploads.service", () => ({
  UploadsService: mockUploadsService,
}));

vi.mock("../custom-fields/custom-fields.service", () => ({
  createDynamicZodSchema: vi.fn(() => ({ safeParse: (data: any) => ({ success: true, data }) })),
}));

vi.mock("../../infra/lib/data-scrubber", () => ({
  getScrubberConfig: vi.fn().mockResolvedValue({}),
  scrubEntityData: vi.fn((entity: any) => entity),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────

const ORG_ID = "org-test-projects";
const PROJECT_ID = "proj-123";

function makeCtx({
  body = {},
  params = {},
  query = {},
}: {
  body?: any;
  params?: Record<string, string>;
  query?: Record<string, string>;
} = {}): any {
  return {
    get: (k: string) =>
      k === "organizationId" ? ORG_ID : k === "user" ? { id: "user-1" } : undefined,
    req: {
      param: (k?: string) => (k ? params[k] : params),
      query: (k?: string) => (k ? query[k] : query),
      json: () => Promise.resolve(body),
    },
    json: (data: any, status = 200) => ({
      _data: data,
      _status: status,
      status,
      data,
    }),
  };
}

describe("ProjectsController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listProjects", () => {
    it("returns active projects by default with aggregated totals and counts", async () => {
      const mockProjects = [
        { id: "p1", name: "Project Alpha", clientId: "c1", status: "s1" },
        { id: "p2", name: "Project Beta", clientId: "c2", status: "s1" },
      ];
      mockDbQuery.projects.findMany.mockResolvedValueOnce(mockProjects);

      // totals mock (expenses)
      mockDbSelect
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              groupBy: () => Promise.resolve([{ projectId: "p1", total: "1500" }]),
            }),
          }),
        })
        // counts mock (invoices)
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              groupBy: () => Promise.resolve([{ projectId: "p1", count: 2 }]),
            }),
          }),
        });

      const ctx = makeCtx();
      const res = await ProjectsController.listProjects(ctx);
      expect(res._status).toBe(200);
      expect(res._data).toHaveLength(2);
      expect(res._data[0].totalExpenses).toBe("1500");
      expect(res._data[0].invoiceCount).toBe(2);
      expect(res._data[1].totalExpenses).toBe("0");
      expect(res._data[1].invoiceCount).toBe(0);
    });

    it("filters by archived status when status=archived", async () => {
      mockDbQuery.projects.findMany.mockResolvedValueOnce([]);

      const ctx = makeCtx({ query: { status: "archived" } });
      const res = await ProjectsController.listProjects(ctx);
      expect(res._status).toBe(200);
      expect(mockDbQuery.projects.findMany).toHaveBeenCalled();
    });
  });

  describe("createProject", () => {
    it("creates project with default status and computed fileSequenceNumber", async () => {
      mockDbQuery.projectStatuses.findFirst.mockResolvedValueOnce({
        id: "status-default",
        name: "Created",
      });
      mockDbQuery.customFieldDefinitions.findMany.mockResolvedValueOnce([]);

      // select maxSeq
      mockDbSelect.mockReturnValueOnce({
        from: () => ({
          where: () => Promise.resolve([{ max: 5 }]),
        }),
      });

      const createdProject = {
        id: "new-proj-id",
        name: "New File",
        clientId: "client-001",
        status: "status-default",
        fileSequenceNumber: 6,
      };

      mockDbInsert.mockReturnValueOnce({
        values: () => ({
          returning: () => Promise.resolve([createdProject]),
        }),
      });

      const ctx = makeCtx({
        body: {
          name: "New File",
          clientId: "client-001",
          customFields: {},
        },
      });

      const res = await ProjectsController.createProject(ctx);
      expect(res._status).toBe(201);
      expect(res._data.fileSequenceNumber).toBe(6);
      expect(res._data.status).toBe("status-default");
    });

    it("returns 400 when name is missing", async () => {
      const ctx = makeCtx({ body: { clientId: "c1" } });
      const res = await ProjectsController.createProject(ctx);
      expect(res._status).toBe(400);
      expect(res._data.error).toBe("Validation Error");
    });

    it("returns 500 when organization has no default status configured", async () => {
      mockDbQuery.projectStatuses.findFirst.mockResolvedValueOnce(null);

      const ctx = makeCtx({ body: { name: "Test", clientId: "c1" } });
      const res = await ProjectsController.createProject(ctx);
      expect(res._status).toBe(500);
      expect(res._data.error).toContain("No default status found");
    });
  });

  describe("archiveProject & unarchiveProject", () => {
    it("archives an open project", async () => {
      mockDbQuery.projects.findFirst.mockResolvedValueOnce({
        id: PROJECT_ID,
        lifecycleState: "open",
      });

      const archivedProject = {
        id: PROJECT_ID,
        lifecycleState: "archived",
        archivedAt: new Date(),
      };
      mockDbUpdate.mockReturnValueOnce({
        set: () => ({
          where: () => ({
            returning: () => Promise.resolve([archivedProject]),
          }),
        }),
      });

      const ctx = makeCtx({ params: { id: PROJECT_ID } });
      const res = await ProjectsController.archiveProject(ctx);
      expect(res._status).toBe(200);
      expect(res._data.lifecycleState).toBe("archived");
    });

    it("returns 400 when attempting to archive an already archived project", async () => {
      mockDbQuery.projects.findFirst.mockResolvedValueOnce({
        id: PROJECT_ID,
        lifecycleState: "archived",
      });

      const ctx = makeCtx({ params: { id: PROJECT_ID } });
      const res = await ProjectsController.archiveProject(ctx);
      expect(res._status).toBe(400);
      expect(res._data.error).toBe("Already archived");
    });

    it("unarchives an archived project", async () => {
      mockDbQuery.projects.findFirst.mockResolvedValueOnce({
        id: PROJECT_ID,
        lifecycleState: "archived",
      });

      const unarchivedProject = {
        id: PROJECT_ID,
        lifecycleState: "open",
        archivedAt: null,
      };
      mockDbUpdate.mockReturnValueOnce({
        set: () => ({
          where: () => ({
            returning: () => Promise.resolve([unarchivedProject]),
          }),
        }),
      });

      const ctx = makeCtx({ params: { id: PROJECT_ID } });
      const res = await ProjectsController.unarchiveProject(ctx);
      expect(res._status).toBe(200);
      expect(res._data.lifecycleState).toBe("open");
    });

    it("returns 400 when attempting to unarchive a project that is not archived", async () => {
      mockDbQuery.projects.findFirst.mockResolvedValueOnce({
        id: PROJECT_ID,
        lifecycleState: "open",
      });

      const ctx = makeCtx({ params: { id: PROJECT_ID } });
      const res = await ProjectsController.unarchiveProject(ctx);
      expect(res._status).toBe(400);
      expect(res._data.error).toBe("Not archived");
    });
  });

  describe("deleteProject", () => {
    it("rejects deletion if project is not archived first", async () => {
      mockDbQuery.projects.findFirst.mockResolvedValueOnce({
        id: PROJECT_ID,
        lifecycleState: "open",
      });

      const ctx = makeCtx({ params: { id: PROJECT_ID } });
      const res = await ProjectsController.deleteProject(ctx);
      expect(res._status).toBe(400);
      expect(res._data.error).toBe("Must archive file before deleting");
    });

    it("deletes an archived project cleanly", async () => {
      mockDbQuery.projects.findFirst.mockResolvedValueOnce({
        id: PROJECT_ID,
        lifecycleState: "archived",
      });
      mockDbSelect.mockReturnValueOnce({
        from: () => ({
          where: () => Promise.resolve([]), // no attachments
        }),
      });
      mockDbDelete.mockReturnValue({
        where: () => Promise.resolve(),
      });

      const ctx = makeCtx({ params: { id: PROJECT_ID } });
      const res = await ProjectsController.deleteProject(ctx);
      expect(res._status).toBe(200);
      expect(res._data.success).toBe(true);
    });

    it("returns 404 when project to delete is not found", async () => {
      mockDbQuery.projects.findFirst.mockResolvedValueOnce(null);

      const ctx = makeCtx({ params: { id: "non-existent" } });
      const res = await ProjectsController.deleteProject(ctx);
      expect(res._status).toBe(404);
    });
  });

  describe("attachments", () => {
    it("generates presigned PUT url for attachment upload", async () => {
      mockUploadsService.generateProjectAttachmentPresignedPut.mockResolvedValueOnce({
        uploadUrl: "https://s3.example.com/upload",
        fileUrl: "https://s3.example.com/files/1.pdf",
      });

      const ctx = makeCtx({
        params: { id: PROJECT_ID },
        body: { contentType: "application/pdf", fileName: "bill.pdf" },
      });

      const res = await ProjectsController.getAttachmentUploadUrl(ctx);
      expect(res._status).toBe(200);
      expect(res._data.uploadUrl).toBe("https://s3.example.com/upload");
      expect(res._data.fileId).toBeDefined();
    });

    it("saves attachment metadata to database", async () => {
      const mockAttachment = {
        id: "att-001",
        fileName: "bill.pdf",
        fileSize: 1024,
      };
      mockDbInsert.mockReturnValueOnce({
        values: () => ({
          returning: () => Promise.resolve([mockAttachment]),
        }),
      });

      const ctx = makeCtx({
        params: { id: PROJECT_ID },
        body: {
          fileId: "att-001",
          fileName: "bill.pdf",
          fileSize: 1024,
          fileType: "application/pdf",
          fileUrl: "https://example.com/att-001",
        },
      });

      const res = await ProjectsController.saveAttachment(ctx);
      expect(res._status).toBe(201);
      expect(res._data.id).toBe("att-001");
    });

    it("lists attachments for project", async () => {
      const attachmentsList = [{ id: "att-1", fileName: "doc.pdf" }];
      mockDbQuery.projectAttachments.findMany.mockResolvedValueOnce(attachmentsList);

      const ctx = makeCtx({ params: { id: PROJECT_ID } });
      const res = await ProjectsController.listAttachments(ctx);
      expect(res._status).toBe(200);
      expect(res._data).toEqual(attachmentsList);
    });
  });
});
