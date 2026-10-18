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

const { mockDbQuery, mockDbSelect, mockDbUpdate } = vi.hoisted(() => {
  const mockDbQuery = {
    projects: { findFirst: vi.fn() },
    customFieldDefinitions: { findMany: vi.fn() },
  };
  const mockDbSelect = vi.fn();
  const mockDbUpdate = vi.fn();
  return { mockDbQuery, mockDbSelect, mockDbUpdate };
});

vi.mock("@starter/db", () => ({
  db: {
    query: mockDbQuery,
    select: (...args: any[]) => mockDbSelect(...args),
    update: (...args: any[]) => mockDbUpdate(...args),
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
  projectStatuses: { id: "id", organizationId: "organization_id" },
  projectStatusTransitions: {
    id: "id",
    organizationId: "organization_id",
    fromStatusId: "from_status_id",
    toStatusId: "to_status_id",
  },
  projectStatusFields: {
    fieldId: "field_id",
    organizationId: "organization_id",
    statusId: "status_id",
    isRequiredToEnter: "is_required_to_enter",
  },
  customFieldDefinitions: { id: "id", fieldKey: "field_key", fieldName: "field_name" },
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

function makeCtx(body: object, param: string = PROJECT_ID): any {
  return {
    get: (k: string) => (k === "organizationId" ? ORG_ID : undefined),
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
  const c: any = {
    from: () => c,
    where: () => c,
    innerJoin: () => c,
    limit: () => c,
    then: (resolve: any) => Promise.resolve(rows).then(resolve),
    [Symbol.iterator]: rows[Symbol.iterator].bind(rows),
  };
  return c;
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
