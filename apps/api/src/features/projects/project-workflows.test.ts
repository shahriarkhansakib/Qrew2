/**
 * project-workflows.test.ts
 *
 * Tests for the PATCH /projects/:id/advance-status endpoint.
 * This is the heart of the workflow engine: enforces the transition graph
 * and pre-transition required field validation.
 *
 * Scenarios tested:
 *   - Happy path: valid transition with all required fields present
 *   - Transition not allowed (not in graph)
 *   - Missing required pre-transition fields (Scenario A)
 *   - Archived files cannot change status
 *   - No-op transition (already in target status)
 *   - Target status in wrong org
 *   - Partial field submission with merge (existing + incoming)
 *   - Graceful degradation: orgs with no configured transitions allow free status changes
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectsController } from "./projects.controller";

// ─── DB Mock ──────────────────────────────────────────────────────────────
// vi.mock is hoisted to the top of the file; variables it references must also
// be hoisted using vi.hoisted() to avoid "Cannot access before initialization" errors.

const { mockDbQuery, mockDbSelect, mockDbUpdate, mockDbInsert } = vi.hoisted(() => {
  const mockDbQuery = {
    projects: { findFirst: vi.fn() },
    customFieldDefinitions: { findMany: vi.fn() },
  };
  const mockDbSelect = vi.fn((..._args: any[]) => ({}));
  const mockDbUpdate = vi.fn((..._args: any[]) => ({}));
  const mockDbInsert = vi.fn((..._args: any[]) => ({
    values: vi.fn().mockResolvedValue([{ id: "log-1" }]),
  }));
  return { mockDbQuery, mockDbSelect, mockDbUpdate, mockDbInsert };
});

vi.mock("@starter/db", () => ({
  db: {
    query: mockDbQuery,
    select: (...args: any[]) => (mockDbSelect as any)(...args),
    update: (...args: any[]) => (mockDbUpdate as any)(...args),
    insert: (...args: any[]) => (mockDbInsert as any)(...args),
  },
  projects: {
    id: "id",
    organizationId: "organization_id",
    status: "status",
    lifecycleState: "lifecycle_state",
    customFields: "custom_fields",
    version: "version",
    stageFieldHistory: "stage_field_history",
  },
  projectStatuses: {
    id: "id",
    organizationId: "organization_id",
    name: "name",
    color: "color",
    isTerminal: "is_terminal",
    gridColumn: "grid_column",
    gridRow: "grid_row",
  },
  projectStatusTransitions: {
    id: "id",
    organizationId: "organization_id",
    fromStatusId: "from_status_id",
    toStatusId: "to_status_id",
    allowedRoleIds: "allowed_role_ids",
  },
  projectStatusFields: {
    fieldId: "field_id",
    organizationId: "organization_id",
    statusId: "status_id",
    isRequiredToEnter: "is_required_to_enter",
  },
  projectStatusLogs: {
    id: "id",
    organizationId: "organization_id",
    projectId: "project_id",
    fromStatusId: "from_status_id",
    toStatusId: "to_status_id",
    changedById: "changed_by_id",
    changedAt: "changed_at",
    timeInPreviousStageSeconds: "time_in_previous_stage_seconds",
    stageSnapshot: "stage_snapshot",
  },
  customFieldDefinitions: { id: "id", fieldKey: "field_key", fieldName: "field_name" },
  users: { id: "id", name: "name", email: "email" },
  expenses: {},
  invoices: {},
}));

vi.mock("../../infra/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

vi.mock("../custom-fields/custom-fields.service", () => ({
  createDynamicZodSchema: vi.fn(() => ({ safeParse: (data: any) => ({ success: true, data }) })),
}));

vi.mock("../../infra/lib/data-scrubber", () => ({
  getScrubberConfig: vi.fn().mockResolvedValue({}),
  scrubEntityData: vi.fn((entity: any) => entity),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────

const ORG_ID = "org-test-001";
const PROJECT_ID = "proj-001";
const FROM_STATUS_ID = "status-draft";
const TO_STATUS_ID = "status-active";
const FIELD_KEY_A = "DISCHARGE_DATE";
const FIELD_KEY_B = "VESSEL_NAME";

function makeCtx(
  body: object,
  param: string = PROJECT_ID,
  options?: { isOwner?: boolean; memberRole?: string },
): any {
  return {
    get: (k: string) => {
      if (k === "organizationId") return ORG_ID;
      if (k === "isOwner") return options?.isOwner ?? false;
      if (k === "memberRole") return options?.memberRole ?? "org_role_staff";
      if (k === "user") return { id: "usr_test_1", name: "Test User" };
      return undefined;
    },
    req: {
      param: () => param,
      json: () => Promise.resolve(body),
    },
    json: (data: any, status?: number) => ({
      _data: data,
      _status: status ?? 200,
      status: status ?? 200,
      json: () => Promise.resolve(data),
    }),
  };
}

function selectChainable(rows: any[]) {
  const p: any = Promise.resolve(rows);
  p.from = () => p;
  p.where = () => p;
  p.innerJoin = () => p;
  p.leftJoin = () => p;
  p.limit = () => p;
  p.orderBy = () => p;
  p.groupBy = () => p;
  p[Symbol.iterator] = rows[Symbol.iterator].bind(rows);
  return p;
}

function updateChainable(result: any[]) {
  return {
    set: () => ({
      where: () => ({
        returning: () => Promise.resolve(result),
      }),
    }),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("advanceStatus — happy path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbQuery.customFieldDefinitions.findMany.mockResolvedValue([]);
  });

  it("transitions successfully when all required fields are present", async () => {
    const project = {
      id: PROJECT_ID,
      organizationId: ORG_ID,
      status: FROM_STATUS_ID,
      lifecycleState: "open",
      customFields: { [FIELD_KEY_A]: "2024-01-15" },
    };
    const targetStatus = { id: TO_STATUS_ID, name: "Active", organizationId: ORG_ID };
    const allowedTransition = [{ id: "transition-001" }];
    const anyTransitions = [{ id: "transition-001" }];
    const requiredFields = [
      {
        fieldKey: FIELD_KEY_A,
        fieldName: "Discharge Date",
        fieldId: "f1",
        isRequiredToEnter: true,
      },
    ];
    const updatedProject = { ...project, status: TO_STATUS_ID };

    mockDbQuery.projects.findFirst.mockResolvedValueOnce(project);
    mockDbSelect
      .mockReturnValueOnce(selectChainable([targetStatus])) // targetStatus
      .mockReturnValueOnce(selectChainable(allowedTransition)) // allowed transition
      .mockReturnValueOnce(selectChainable(anyTransitions)) // hasAnyTransitions
      .mockReturnValueOnce(selectChainable(requiredFields)); // requiredFields
    mockDbUpdate.mockReturnValueOnce(updateChainable([updatedProject]));

    const ctx = makeCtx({ toStatusId: TO_STATUS_ID, customFields: {} });
    const res = await ProjectsController.advanceStatus(ctx as any);
    expect(res._status).toBe(200);
    expect(res._data.status).toBe(TO_STATUS_ID);
  });

  it("merges incoming customFields with existing ones on transition", async () => {
    const project = {
      id: PROJECT_ID,
      organizationId: ORG_ID,
      status: FROM_STATUS_ID,
      lifecycleState: "open",
      customFields: { [FIELD_KEY_A]: "existing", [FIELD_KEY_B]: "MV Star" },
    };
    const targetStatus = { id: TO_STATUS_ID, name: "Active", organizationId: ORG_ID };
    const updatedProject = {
      ...project,
      status: TO_STATUS_ID,
      customFields: { [FIELD_KEY_A]: "overridden", [FIELD_KEY_B]: "MV Star" },
    };

    mockDbQuery.projects.findFirst.mockResolvedValueOnce(project);
    mockDbSelect
      .mockReturnValueOnce(selectChainable([targetStatus]))
      .mockReturnValueOnce(selectChainable([{ id: "t1" }]))
      .mockReturnValueOnce(selectChainable([{ id: "t1" }]))
      .mockReturnValueOnce(selectChainable([])); // no required fields
    mockDbUpdate.mockReturnValueOnce(updateChainable([updatedProject]));

    const ctx = makeCtx({
      toStatusId: TO_STATUS_ID,
      customFields: { [FIELD_KEY_A]: "overridden" },
    });
    const res = await ProjectsController.advanceStatus(ctx as any);
    expect(res._status).toBe(200);
  });

  it("allows free status change when no transitions are configured (graceful degradation)", async () => {
    const project = {
      id: PROJECT_ID,
      organizationId: ORG_ID,
      status: FROM_STATUS_ID,
      lifecycleState: "open",
      customFields: {},
    };
    const targetStatus = { id: TO_STATUS_ID, name: "Completed", organizationId: ORG_ID };
    const updatedProject = { ...project, status: TO_STATUS_ID };

    mockDbQuery.projects.findFirst.mockResolvedValueOnce(project);
    mockDbSelect
      .mockReturnValueOnce(selectChainable([targetStatus]))
      .mockReturnValueOnce(selectChainable([])) // no allowed transition
      .mockReturnValueOnce(selectChainable([])) // no transitions configured at all → graceful
      .mockReturnValueOnce(selectChainable([])); // no required fields
    mockDbUpdate.mockReturnValueOnce(updateChainable([updatedProject]));

    const ctx = makeCtx({ toStatusId: TO_STATUS_ID });
    const res = await ProjectsController.advanceStatus(ctx as any);
    expect(res._status).toBe(200);
  });
});

describe("advanceStatus — transition graph enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbQuery.customFieldDefinitions.findMany.mockResolvedValue([]);
  });

  it("returns 422 when the transition is not in the workflow graph", async () => {
    const project = {
      id: PROJECT_ID,
      organizationId: ORG_ID,
      status: FROM_STATUS_ID,
      lifecycleState: "open",
      customFields: {},
    };
    const targetStatus = { id: TO_STATUS_ID, name: "Active", organizationId: ORG_ID };

    mockDbQuery.projects.findFirst.mockResolvedValueOnce(project);
    mockDbSelect
      .mockReturnValueOnce(selectChainable([targetStatus]))
      .mockReturnValueOnce(selectChainable([])) // transition NOT in graph
      .mockReturnValueOnce(selectChainable([{ id: "some-transition" }])); // but there ARE transitions

    const ctx = makeCtx({ toStatusId: TO_STATUS_ID });
    const res = await ProjectsController.advanceStatus(ctx as any);
    expect(res._status).toBe(422);
    expect(res._data.error).toContain("Transition not allowed");
  });

  it("returns 400 when trying to advance an archived file", async () => {
    const project = {
      id: PROJECT_ID,
      organizationId: ORG_ID,
      status: FROM_STATUS_ID,
      lifecycleState: "archived",
      customFields: {},
    };
    mockDbQuery.projects.findFirst.mockResolvedValueOnce(project);

    const ctx = makeCtx({ toStatusId: TO_STATUS_ID });
    const res = await ProjectsController.advanceStatus(ctx as any);
    expect(res._status).toBe(400);
    expect(res._data.error).toContain("Archived");
  });

  it("returns 400 for no-op (already in target status)", async () => {
    const project = {
      id: PROJECT_ID,
      organizationId: ORG_ID,
      status: TO_STATUS_ID,
      lifecycleState: "open",
      customFields: {},
    };
    mockDbQuery.projects.findFirst.mockResolvedValueOnce(project);

    const ctx = makeCtx({ toStatusId: TO_STATUS_ID });
    const res = await ProjectsController.advanceStatus(ctx as any);
    expect(res._status).toBe(400);
    expect(res._data.error).toContain("already in the requested status");
  });

  it("returns 404 when target status is in a different org", async () => {
    const project = {
      id: PROJECT_ID,
      organizationId: ORG_ID,
      status: FROM_STATUS_ID,
      lifecycleState: "open",
      customFields: {},
    };
    mockDbQuery.projects.findFirst.mockResolvedValueOnce(project);
    mockDbSelect.mockReturnValueOnce(selectChainable([])); // target status not found

    const ctx = makeCtx({ toStatusId: "other-org-status" });
    const res = await ProjectsController.advanceStatus(ctx as any);
    expect(res._status).toBe(404);
  });

  it("returns 400 when toStatusId is missing from body", async () => {
    const ctx = makeCtx({});
    const res = await ProjectsController.advanceStatus(ctx as any);
    expect(res._status).toBe(400);
    expect(res._data.error).toContain("toStatusId is required");
  });

  it("returns 404 when project not found", async () => {
    mockDbQuery.projects.findFirst.mockResolvedValueOnce(undefined);
    const ctx = makeCtx({ toStatusId: TO_STATUS_ID }, "non-existent");
    const res = await ProjectsController.advanceStatus(ctx as any);
    expect(res._status).toBe(404);
  });
});

describe("advanceStatus — Scenario A: pre-transition required fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbQuery.customFieldDefinitions.findMany.mockResolvedValue([]);
  });

  it("returns 422 with missingFields list when required fields are not filled", async () => {
    const project = {
      id: PROJECT_ID,
      organizationId: ORG_ID,
      status: FROM_STATUS_ID,
      lifecycleState: "open",
      customFields: {}, // DISCHARGE_DATE missing
    };
    const targetStatus = { id: TO_STATUS_ID, name: "Completed", organizationId: ORG_ID };
    const allowedTransition = [{ id: "t1" }];
    const anyTransitions = [{ id: "t1" }];
    const requiredFields = [
      {
        fieldKey: FIELD_KEY_A,
        fieldName: "Discharge Date",
        fieldId: "f1",
        isRequiredToEnter: true,
      },
    ];

    mockDbQuery.projects.findFirst.mockResolvedValueOnce(project);
    mockDbSelect
      .mockReturnValueOnce(selectChainable([targetStatus]))
      .mockReturnValueOnce(selectChainable(allowedTransition))
      .mockReturnValueOnce(selectChainable(anyTransitions))
      .mockReturnValueOnce(selectChainable(requiredFields));

    const ctx = makeCtx({ toStatusId: TO_STATUS_ID });
    const res = await ProjectsController.advanceStatus(ctx as any);
    expect(res._status).toBe(422);
    expect(res._data.error).toContain("Required fields missing");
    expect(res._data.missingFields).toHaveLength(1);
    expect(res._data.missingFields[0].fieldKey).toBe(FIELD_KEY_A);
  });

  it("allows transition when required field is supplied in the incoming body", async () => {
    const project = {
      id: PROJECT_ID,
      organizationId: ORG_ID,
      status: FROM_STATUS_ID,
      lifecycleState: "open",
      customFields: {}, // DISCHARGE_DATE not in stored fields
    };
    const targetStatus = { id: TO_STATUS_ID, name: "Completed", organizationId: ORG_ID };
    const allowedTransition = [{ id: "t1" }];
    const anyTransitions = [{ id: "t1" }];
    const requiredFields = [
      {
        fieldKey: FIELD_KEY_A,
        fieldName: "Discharge Date",
        fieldId: "f1",
        isRequiredToEnter: true,
      },
    ];
    const updatedProject = { ...project, status: TO_STATUS_ID };

    mockDbQuery.projects.findFirst.mockResolvedValueOnce(project);
    mockDbSelect
      .mockReturnValueOnce(selectChainable([targetStatus]))
      .mockReturnValueOnce(selectChainable(allowedTransition))
      .mockReturnValueOnce(selectChainable(anyTransitions))
      .mockReturnValueOnce(selectChainable(requiredFields));
    mockDbUpdate.mockReturnValueOnce(updateChainable([updatedProject]));

    // User submits the missing field as part of the transition payload
    const ctx = makeCtx({
      toStatusId: TO_STATUS_ID,
      customFields: { [FIELD_KEY_A]: "2024-06-01" }, // provides the missing field
    });
    const res = await ProjectsController.advanceStatus(ctx as any);
    expect(res._status).toBe(200);
  });

  it("returns 422 if ONE of multiple required fields is missing", async () => {
    const project = {
      id: PROJECT_ID,
      organizationId: ORG_ID,
      status: FROM_STATUS_ID,
      lifecycleState: "open",
      customFields: { [FIELD_KEY_A]: "2024-01-01" }, // A present, B missing
    };
    const targetStatus = { id: TO_STATUS_ID, name: "Completed", organizationId: ORG_ID };
    const allowedTransition = [{ id: "t1" }];
    const requiredFields = [
      {
        fieldKey: FIELD_KEY_A,
        fieldName: "Discharge Date",
        fieldId: "f1",
        isRequiredToEnter: true,
      },
      { fieldKey: FIELD_KEY_B, fieldName: "Vessel Name", fieldId: "f2", isRequiredToEnter: true },
    ];

    mockDbQuery.projects.findFirst.mockResolvedValueOnce(project);
    mockDbSelect
      .mockReturnValueOnce(selectChainable([targetStatus]))
      .mockReturnValueOnce(selectChainable(allowedTransition))
      .mockReturnValueOnce(selectChainable([{ id: "t1" }]))
      .mockReturnValueOnce(selectChainable(requiredFields));

    const ctx = makeCtx({ toStatusId: TO_STATUS_ID, customFields: {} });
    const res = await ProjectsController.advanceStatus(ctx as any);
    expect(res._status).toBe(422);
    expect(res._data.missingFields).toHaveLength(1);
    expect(res._data.missingFields[0].fieldKey).toBe(FIELD_KEY_B);
    expect(res._data.missingFields[0].fieldId).toBe("f2");
    expect(res._data.missingFields[0].fieldName).toBe("Vessel Name");
  });

  it("returns 422 when custom fields fail dynamic schema validation", async () => {
    const project = {
      id: PROJECT_ID,
      organizationId: ORG_ID,
      status: FROM_STATUS_ID,
      lifecycleState: "open",
      customFields: {},
    };
    const targetStatus = { id: TO_STATUS_ID, name: "Completed", organizationId: ORG_ID };
    const allowedTransition = [{ id: "t1" }];

    mockDbQuery.projects.findFirst.mockResolvedValueOnce(project);
    mockDbSelect
      .mockReturnValueOnce(selectChainable([targetStatus]))
      .mockReturnValueOnce(selectChainable(allowedTransition))
      .mockReturnValueOnce(selectChainable([{ id: "t1" }]))
      .mockReturnValueOnce(selectChainable([])); // no required fields

    const { createDynamicZodSchema } = await import("../custom-fields/custom-fields.service");
    vi.mocked(createDynamicZodSchema).mockReturnValueOnce({
      safeParse: () => ({
        success: false,
        error: { format: () => ({ [FIELD_KEY_A]: { _errors: ["Invalid date"] } }) },
      }),
    } as any);

    const ctx = makeCtx({
      toStatusId: TO_STATUS_ID,
      customFields: { [FIELD_KEY_A]: "invalid-date" },
    });
    const res = await ProjectsController.advanceStatus(ctx as any);
    expect(res._status).toBe(422);
    expect(res._data.error).toContain("Custom Fields Validation Error");
    expect(res._data.details[FIELD_KEY_A]._errors).toContain("Invalid date");
  });

  it("returns 409 Conflict when a concurrent modification occurs (optimistic locking)", async () => {
    const project = {
      id: PROJECT_ID,
      organizationId: ORG_ID,
      status: FROM_STATUS_ID,
      lifecycleState: "open",
      customFields: {},
      version: 2,
    };
    const targetStatus = { id: TO_STATUS_ID, name: "Completed", organizationId: ORG_ID };
    const allowedTransition = [{ id: "t1" }];

    mockDbQuery.projects.findFirst.mockResolvedValueOnce(project);
    mockDbSelect
      .mockReturnValueOnce(selectChainable([targetStatus]))
      .mockReturnValueOnce(selectChainable(allowedTransition))
      .mockReturnValueOnce(selectChainable([{ id: "t1" }]))
      .mockReturnValueOnce(selectChainable([])); // no required fields

    // Concurrent request changed the row's version before our update resolved
    mockDbUpdate.mockReturnValueOnce(updateChainable([]));

    const ctx = makeCtx({ toStatusId: TO_STATUS_ID });
    const res = await ProjectsController.advanceStatus(ctx as any);
    expect(res._status).toBe(409);
    expect(res._data.error).toContain("Concurrent update conflict");
  });
});

describe("updateProject — status bypassing guard and concurrency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbQuery.customFieldDefinitions.findMany.mockResolvedValue([]);
  });

  it("rejects direct status modification with 400 when attempting to bypass workflow", async () => {
    const existingProject = {
      id: PROJECT_ID,
      organizationId: ORG_ID,
      name: "Existing Project",
      clientId: "client-001",
      status: FROM_STATUS_ID,
      customFields: {},
      version: 1,
    };
    mockDbQuery.projects.findFirst.mockResolvedValueOnce(existingProject);

    const ctx = makeCtx({
      name: "Renamed Project",
      clientId: "client-001",
      status: TO_STATUS_ID, // Attempting to change status directly!
      customFields: {},
    });

    const res = await ProjectsController.updateProject(ctx as any);
    expect(res._status).toBe(400);
    expect((res._data as any).error).toBe("Direct status updates forbidden");
  });

  it("allows general updates when status is omitted or matches existing status", async () => {
    const existingProject = {
      id: PROJECT_ID,
      organizationId: ORG_ID,
      name: "Existing Project",
      clientId: "client-001",
      status: FROM_STATUS_ID,
      customFields: {},
      version: 1,
    };
    const updatedProject = {
      ...existingProject,
      name: "Renamed Project",
      version: 2,
    };
    mockDbQuery.projects.findFirst.mockResolvedValueOnce(existingProject);
    mockDbUpdate.mockReturnValueOnce(updateChainable([updatedProject]));

    const ctx = makeCtx({
      name: "Renamed Project",
      clientId: "client-001",
      status: FROM_STATUS_ID, // same status
      customFields: {},
    });

    const res = await ProjectsController.updateProject(ctx as any);
    expect(res._status).toBe(200);
    expect((res._data as any).name).toBe("Renamed Project");
  });
});

describe("advanceStatus — role-gated transitions (Option 1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbQuery.customFieldDefinitions.findMany.mockResolvedValue([]);
  });

  it("rejects transition with 403 when user role is not in allowedRoleIds", async () => {
    const project = {
      id: PROJECT_ID,
      organizationId: ORG_ID,
      status: FROM_STATUS_ID,
      lifecycleState: "open",
      customFields: {},
      version: 1,
    };
    const targetStatus = { id: TO_STATUS_ID, name: "Manager Approval" };

    mockDbQuery.projects.findFirst.mockResolvedValueOnce(project);
    mockDbSelect
      .mockReturnValueOnce(selectChainable([targetStatus])) // targetStatus check
      .mockReturnValueOnce(
        selectChainable([
          {
            id: "trans-1",
            allowedRoleIds: ["org_role_manager"], // Only managers allowed!
          },
        ]),
      ) // allowedTransition check
      .mockReturnValueOnce(selectChainable([{ id: "trans-1" }])); // hasAnyTransitions check

    // Staff member attempts the transition
    const ctx = makeCtx({ toStatusId: TO_STATUS_ID }, PROJECT_ID, {
      isOwner: false,
      memberRole: "org_role_staff",
    });

    const res = await ProjectsController.advanceStatus(ctx as any);
    expect(res._status).toBe(403);
    expect((res._data as any).error).toBe("Forbidden");
    expect((res._data as any).message).toContain("does not have permission");
  });

  it("allows transition when user role matches one of allowedRoleIds", async () => {
    const project = {
      id: PROJECT_ID,
      organizationId: ORG_ID,
      status: FROM_STATUS_ID,
      lifecycleState: "open",
      customFields: {},
      version: 1,
    };
    const targetStatus = { id: TO_STATUS_ID, name: "Manager Approval" };
    const updatedProject = { ...project, status: TO_STATUS_ID, version: 2 };

    mockDbQuery.projects.findFirst.mockResolvedValueOnce(project);
    mockDbSelect
      .mockReturnValueOnce(selectChainable([targetStatus])) // targetStatus
      .mockReturnValueOnce(
        selectChainable([
          {
            id: "trans-1",
            allowedRoleIds: ["org_role_manager"],
          },
        ]),
      ) // allowedTransition
      .mockReturnValueOnce(selectChainable([{ id: "trans-1" }])) // hasAnyTransitions
      .mockReturnValueOnce(selectChainable([])) // requiredFields
      .mockReturnValueOnce(selectChainable([])); // lastLog for audit log

    mockDbUpdate.mockReturnValueOnce(updateChainable([updatedProject]));

    // Manager executes the transition
    const ctx = makeCtx({ toStatusId: TO_STATUS_ID }, PROJECT_ID, {
      isOwner: false,
      memberRole: "org_role_manager",
    });

    const res = await ProjectsController.advanceStatus(ctx as any);
    expect(res._status).toBe(200);
    expect((res._data as any).status).toBe(TO_STATUS_ID);
  });

  it("allows transition when user is workspace owner even if role is not in allowedRoleIds", async () => {
    const project = {
      id: PROJECT_ID,
      organizationId: ORG_ID,
      status: FROM_STATUS_ID,
      lifecycleState: "open",
      customFields: {},
      version: 1,
    };
    const targetStatus = { id: TO_STATUS_ID, name: "Manager Approval" };
    const updatedProject = { ...project, status: TO_STATUS_ID, version: 2 };

    mockDbQuery.projects.findFirst.mockResolvedValueOnce(project);
    mockDbSelect
      .mockReturnValueOnce(selectChainable([targetStatus]))
      .mockReturnValueOnce(
        selectChainable([
          {
            id: "trans-1",
            allowedRoleIds: ["org_role_manager"],
          },
        ]),
      )
      .mockReturnValueOnce(selectChainable([{ id: "trans-1" }]))
      .mockReturnValueOnce(selectChainable([]))
      .mockReturnValueOnce(selectChainable([])); // lastLog

    mockDbUpdate.mockReturnValueOnce(updateChainable([updatedProject]));

    // Workspace Owner executes transition
    const ctx = makeCtx({ toStatusId: TO_STATUS_ID }, PROJECT_ID, {
      isOwner: true,
      memberRole: "owner",
    });

    const res = await ProjectsController.advanceStatus(ctx as any);
    expect(res._status).toBe(200);
    expect((res._data as any).status).toBe(TO_STATUS_ID);
  });
});

describe("getStatusLogs & projectStatusLogs — audit ledger (Option 3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retrieves status logs for a project via getStatusLogs", async () => {
    const sampleLogs = [
      {
        id: "log-2",
        projectId: PROJECT_ID,
        fromStatusId: FROM_STATUS_ID,
        toStatusId: TO_STATUS_ID,
        changedById: "usr_1",
        changedAt: new Date(),
        timeInPreviousStageSeconds: 3600,
        stageSnapshot: { VESSEL_NAME: "Ever Given" },
      },
    ];

    mockDbSelect.mockReturnValueOnce(selectChainable(sampleLogs));

    const ctx = makeCtx({}, PROJECT_ID);
    const res = await ProjectsController.getStatusLogs(ctx as any);
    expect(res._status).toBe(200);
    expect((res._data as any).logs).toHaveLength(1);
    expect((res._data as any).logs[0].timeInPreviousStageSeconds).toBe(3600);
  });
});

describe("getWorkflowVelocityAnalytics — bottleneck & velocity metrics (Option 4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("computes stage distribution, velocity averages, and identifies bottleneck stage", async () => {
    const statuses = [
      {
        id: "status-created",
        name: "Created",
        color: "#3b82f6",
        isTerminal: false,
        gridColumn: 0,
        gridRow: 0,
      },
      {
        id: "status-progress",
        name: "In Progress",
        color: "#f59e0b",
        isTerminal: false,
        gridColumn: 1,
        gridRow: 0,
      },
      {
        id: "status-completed",
        name: "Completed",
        color: "#10b981",
        isTerminal: true,
        gridColumn: 2,
        gridRow: 0,
      },
    ];

    const projectCounts = [
      { status: "status-created", count: 5 },
      { status: "status-progress", count: 8 },
      { status: "status-completed", count: 12 },
    ];

    const logAggregates = [
      {
        fromStatusId: "status-created",
        transitionCount: 10,
        avgSeconds: 1800, // 30m
        maxSeconds: 3600,
        minSeconds: 300,
      },
      {
        fromStatusId: "status-progress",
        transitionCount: 7,
        avgSeconds: 7200, // 2h — bottleneck!
        maxSeconds: 14400,
        minSeconds: 1800,
      },
    ];

    mockDbSelect
      .mockReturnValueOnce(selectChainable(statuses))
      .mockReturnValueOnce(selectChainable(projectCounts))
      .mockReturnValueOnce(selectChainable(logAggregates));

    const ctx = makeCtx({});
    const res = await ProjectsController.getWorkflowVelocityAnalytics(ctx as any);
    expect(res._status).toBe(200);

    const data = res._data as any;
    expect(data.totalActiveFiles).toBe(25);
    expect(data.totalTransitions).toBe(17);
    expect(data.stageMetrics).toHaveLength(3);

    // Verify bottleneck identification
    const progressStage = data.stageMetrics.find((m: any) => m.statusId === "status-progress");
    expect(progressStage.isBottleneck).toBe(true);
    expect(progressStage.formattedAvgDuration).toBe("2.0h");
    expect(data.bottleneckStage.statusId).toBe("status-progress");
  });
});
