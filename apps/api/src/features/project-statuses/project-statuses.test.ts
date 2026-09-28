/**
 * project-statuses.test.ts
 *
 * Tests for the project statuses workflow engine endpoints:
 *   GET    /statuses
 *   POST   /statuses
 *   PATCH  /statuses/:id
 *   DELETE /statuses/:id
 *   PUT    /statuses/:id/transitions
 *   PUT    /statuses/:id/fields
 *
 * Uses vi.mock to avoid a live DB connection.
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mock @starter/db before importing route ──────────────────────────────
const { mockSelect, mockInsert, mockUpdate, mockDelete, mockQuery } = vi.hoisted(() => {
  return {
    mockSelect: vi.fn(),
    mockInsert: vi.fn(),
    mockUpdate: vi.fn(),
    mockDelete: vi.fn(),
    mockQuery: {
      projectStatuses: { findFirst: vi.fn(), findMany: vi.fn() },
    },
  };
});

vi.mock("@starter/db", () => ({
  db: {
    select: (...args: any[]) => mockSelect(...args),
    insert: (...args: any[]) => mockInsert(...args),
    update: (...args: any[]) => mockUpdate(...args),
    delete: (...args: any[]) => mockDelete(...args),
    query: mockQuery,
  },
  projectStatuses: { id: "id", organizationId: "organization_id", name: "name" },
  projectStatusTransitions: {
    id: "id",
    organizationId: "organization_id",
    fromStatusId: "from_status_id",
    toStatusId: "to_status_id",
  },
  projectStatusFields: {
    id: "id",
    organizationId: "organization_id",
    statusId: "status_id",
    fieldId: "field_id",
    isVisibleInStage: "is_visible_in_stage",
    isRequiredToEnter: "is_required_to_enter",
  },
  customFieldDefinitions: {
    id: "id",
    organizationId: "organization_id",
    entityType: "entity_type",
    fieldName: "field_name",
    fieldKey: "field_key",
    fieldType: "field_type",
    isRequired: "is_required",
    options: "options",
  },
}));

vi.mock("../../infra/middleware/require-permission", () => ({
  requireOrgPermission: () => async (c: any, next: any) => {
    c.set("organizationId", ORG_ID);
    await next();
  },
}));

vi.mock("../../infra/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

import { projectStatusesRoute } from "./project-statuses.route";

// ─── Fixtures ─────────────────────────────────────────────────────────────

const ORG_ID = "org-test-001";
const STATUS_ID = "status-draft-001";
const STATUS_ID_2 = "status-active-001";
const FIELD_ID = "field-001";

const makeStatus = (overrides = {}) => ({
  id: STATUS_ID,
  organizationId: ORG_ID,
  name: "Draft",
  color: "#6b7280",
  order: 0,
  isDefault: false,
  isSystem: false,
  isInitial: true,
  isTerminal: false,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  ...overrides,
});

const makeRequest = (method: string, path: string, body?: object, _orgId = ORG_ID) => {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "content-type": "application/json" };
  }
  return new Request(`http://localhost${path}`, init);
};

// Helper to build a chainable Drizzle mock
function chainable(result: any) {
  const chain: any = {
    from: () => chain,
    where: () => chain,
    innerJoin: () => chain,
    limit: () => chain,
    orderBy: () => chain,
    returning: () => Promise.resolve(result),
    then: (resolve: any) => Promise.resolve(result).then(resolve),
  };
  // Make it awaitable (select returns array)
  return Object.assign(chain, { [Symbol.iterator]: [][Symbol.iterator] });
}

// ─── Test Suite ───────────────────────────────────────────────────────────

describe("GET /statuses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue(chainable([]));
  });

  it("returns enriched list with transitions and statusFields", async () => {
    const statuses = [makeStatus()];
    // First select = statuses, second = transitions, third = fields
    mockSelect
      .mockReturnValueOnce(chainable(statuses))
      .mockReturnValueOnce(chainable([])) // transitions
      .mockReturnValueOnce(chainable([])); // fields

    const app = new Hono();
    app.route("/", projectStatusesRoute);
    const res = await app.fetch(makeRequest("GET", "/"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(Array.isArray(body)).toBe(true);
  });
});

describe("POST /statuses", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a new status with default color", async () => {
    const newStatus = makeStatus({ id: "new-id", name: "Active" });
    mockInsert.mockReturnValue({
      values: () => ({ returning: () => Promise.resolve([newStatus]) }),
    });

    const app = new Hono();
    app.route("/", projectStatusesRoute);
    const res = await app.fetch(makeRequest("POST", "/", { name: "Active" }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.name).toBe("Active");
  });

  it("creates a status with custom color and isTerminal flag", async () => {
    const newStatus = makeStatus({ name: "Completed", color: "#22c55e", isTerminal: true });
    mockInsert.mockReturnValue({
      values: () => ({ returning: () => Promise.resolve([newStatus]) }),
    });

    const app = new Hono();
    app.route("/", projectStatusesRoute);
    const res = await app.fetch(
      makeRequest("POST", "/", { name: "Completed", color: "#22c55e", isTerminal: true }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.isTerminal).toBe(true);
  });

  it("rejects invalid hex color", async () => {
    const app = new Hono();
    app.route("/", projectStatusesRoute);
    const res = await app.fetch(makeRequest("POST", "/", { name: "Bad", color: "notacolor" }));
    expect(res.status).toBe(400);
  });

  it("rejects empty name", async () => {
    const app = new Hono();
    app.route("/", projectStatusesRoute);
    const res = await app.fetch(makeRequest("POST", "/", { name: "" }));
    expect(res.status).toBe(400);
  });
});

describe("PATCH /statuses/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates name and color of a non-system status", async () => {
    const existing = makeStatus();
    const updated = makeStatus({ name: "In Review", color: "#f59e0b" });
    // First select: fetch the existing status by ID ✓
    // Second select: unique-name check — must return [] so it doesn't think name is taken
    mockSelect
      .mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([existing]) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([]) }) }); // name not taken
    mockUpdate.mockReturnValue({
      set: () => ({ where: () => ({ returning: () => Promise.resolve([updated]) }) }),
    });

    const app = new Hono();
    app.route("/", projectStatusesRoute);
    const res = await app.fetch(
      makeRequest("PATCH", `/${STATUS_ID}`, { name: "In Review", color: "#f59e0b" }),
    );
    expect(res.status).toBe(200);
  });

  it("returns 404 for non-existent status", async () => {
    mockSelect.mockReturnValue({ from: () => ({ where: () => Promise.resolve([]) }) });
    const app = new Hono();
    app.route("/", projectStatusesRoute);
    const res = await app.fetch(makeRequest("PATCH", `/bad-id`, { name: "X" }));
    expect(res.status).toBe(404);
  });

  it("blocks renaming a system status", async () => {
    const systemStatus = makeStatus({ isSystem: true, name: "Created" });
    mockSelect.mockReturnValue({ from: () => ({ where: () => Promise.resolve([systemStatus]) }) });
    const app = new Hono();
    app.route("/", projectStatusesRoute);
    const res = await app.fetch(makeRequest("PATCH", `/${STATUS_ID}`, { name: "DifferentName" }));
    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.error).toContain("cannot be renamed");
  });

  it("allows color/order update on system status", async () => {
    const systemStatus = makeStatus({ isSystem: true, name: "Created" });
    const updated = { ...systemStatus, color: "#3b82f6" };
    mockSelect.mockReturnValue({ from: () => ({ where: () => Promise.resolve([systemStatus]) }) });
    mockUpdate.mockReturnValue({
      set: () => ({ where: () => ({ returning: () => Promise.resolve([updated]) }) }),
    });
    const app = new Hono();
    app.route("/", projectStatusesRoute);
    const res = await app.fetch(
      makeRequest("PATCH", `/${STATUS_ID}`, { name: "Created", color: "#3b82f6" }),
    );
    expect(res.status).toBe(200);
  });
});

describe("DELETE /statuses/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes a normal status successfully", async () => {
    const status = makeStatus({ isSystem: false, isDefault: false });
    mockSelect.mockReturnValue({ from: () => ({ where: () => Promise.resolve([status]) }) });
    mockDelete.mockReturnValue({ where: () => Promise.resolve() });

    const app = new Hono();
    app.route("/", projectStatusesRoute);
    const res = await app.fetch(makeRequest("DELETE", `/${STATUS_ID}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
  });

  it("blocks deleting a system status", async () => {
    const status = makeStatus({ isSystem: true });
    mockSelect.mockReturnValue({ from: () => ({ where: () => Promise.resolve([status]) }) });
    const app = new Hono();
    app.route("/", projectStatusesRoute);
    const res = await app.fetch(makeRequest("DELETE", `/${STATUS_ID}`));
    expect(res.status).toBe(403);
  });

  it("blocks deleting the default status", async () => {
    const status = makeStatus({ isSystem: false, isDefault: true });
    mockSelect.mockReturnValue({ from: () => ({ where: () => Promise.resolve([status]) }) });
    const app = new Hono();
    app.route("/", projectStatusesRoute);
    const res = await app.fetch(makeRequest("DELETE", `/${STATUS_ID}`));
    expect(res.status).toBe(403);
  });

  it("returns 404 for unknown status", async () => {
    mockSelect.mockReturnValue({ from: () => ({ where: () => Promise.resolve([]) }) });
    const app = new Hono();
    app.route("/", projectStatusesRoute);
    const res = await app.fetch(makeRequest("DELETE", `/non-existent`));
    expect(res.status).toBe(404);
  });
});

describe("PUT /statuses/:id/transitions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sets outgoing transitions for a status", async () => {
    const source = makeStatus({ isTerminal: false });
    const targets = [{ id: STATUS_ID_2 }];
    mockSelect
      .mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([source]) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve(targets) }) })
      .mockReturnValue({ from: () => ({ where: () => Promise.resolve([]) }) });
    mockDelete.mockReturnValue({ where: () => Promise.resolve() });
    mockInsert.mockReturnValue({ values: () => Promise.resolve() });

    const app = new Hono();
    app.route("/", projectStatusesRoute);
    const res = await app.fetch(
      makeRequest("PUT", `/${STATUS_ID}/transitions`, { toStatusIds: [STATUS_ID_2] }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.toStatusIds).toContain(STATUS_ID_2);
  });

  it("clears all transitions when toStatusIds is empty", async () => {
    const source = makeStatus({ isTerminal: false });
    mockSelect.mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([source]) }) });
    mockDelete.mockReturnValue({ where: () => Promise.resolve() });

    const app = new Hono();
    app.route("/", projectStatusesRoute);
    const res = await app.fetch(
      makeRequest("PUT", `/${STATUS_ID}/transitions`, { toStatusIds: [] }),
    );
    expect(res.status).toBe(200);
  });

  it("rejects transitions on a terminal status", async () => {
    const terminal = makeStatus({ isTerminal: true });
    mockSelect.mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([terminal]) }) });

    const app = new Hono();
    app.route("/", projectStatusesRoute);
    const res = await app.fetch(
      makeRequest("PUT", `/${STATUS_ID}/transitions`, { toStatusIds: [STATUS_ID_2] }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error).toContain("Terminal");
  });

  it("rejects self-loop transitions (A → A)", async () => {
    const source = makeStatus({ isTerminal: false });
    const targets = [{ id: STATUS_ID }];
    mockSelect
      .mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([source]) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve(targets) }) });

    const app = new Hono();
    app.route("/", projectStatusesRoute);
    const res = await app.fetch(
      makeRequest("PUT", `/${STATUS_ID}/transitions`, { toStatusIds: [STATUS_ID] }),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error).toContain("itself");
  });

  it("rejects if a target status does not exist in the org", async () => {
    const source = makeStatus({ isTerminal: false });
    mockSelect
      .mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([source]) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([]) }) }); // empty = not found

    const app = new Hono();
    app.route("/", projectStatusesRoute);
    const res = await app.fetch(
      makeRequest("PUT", `/${STATUS_ID}/transitions`, { toStatusIds: ["non-existent"] }),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error).toContain("not found");
  });
});

describe("PUT /statuses/:id/fields", () => {
  beforeEach(() => vi.clearAllMocks());

  it("assigns fields to a stage", async () => {
    const status = makeStatus();
    const validFields = [{ id: FIELD_ID }];
    mockSelect
      .mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([status]) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve(validFields) }) });
    mockDelete.mockReturnValue({ where: () => Promise.resolve() });
    mockInsert.mockReturnValue({ values: () => Promise.resolve() });

    const app = new Hono();
    app.route("/", projectStatusesRoute);
    const res = await app.fetch(
      makeRequest("PUT", `/${STATUS_ID}/fields`, {
        fields: [{ fieldId: FIELD_ID, isVisibleInStage: true, isRequiredToEnter: false }],
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.fieldCount).toBe(1);
  });

  it("can mark a field as required to enter", async () => {
    const status = makeStatus();
    const validFields = [{ id: FIELD_ID }];
    mockSelect
      .mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([status]) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve(validFields) }) });
    mockDelete.mockReturnValue({ where: () => Promise.resolve() });
    mockInsert.mockReturnValue({ values: () => Promise.resolve() });

    const app = new Hono();
    app.route("/", projectStatusesRoute);
    const res = await app.fetch(
      makeRequest("PUT", `/${STATUS_ID}/fields`, {
        fields: [{ fieldId: FIELD_ID, isVisibleInStage: true, isRequiredToEnter: true }],
      }),
    );
    expect(res.status).toBe(200);
  });

  it("clears all field mappings when fields is empty", async () => {
    const status = makeStatus();
    mockSelect.mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([status]) }) });
    mockDelete.mockReturnValue({ where: () => Promise.resolve() });

    const app = new Hono();
    app.route("/", projectStatusesRoute);
    const res = await app.fetch(makeRequest("PUT", `/${STATUS_ID}/fields`, { fields: [] }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.fieldCount).toBe(0);
  });

  it("returns 400 when a fieldId does not belong to this org", async () => {
    const status = makeStatus();
    mockSelect
      .mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([status]) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([]) }) }); // no valid fields found

    const app = new Hono();
    app.route("/", projectStatusesRoute);
    const res = await app.fetch(
      makeRequest("PUT", `/${STATUS_ID}/fields`, {
        fields: [
          { fieldId: "non-existent-field", isVisibleInStage: true, isRequiredToEnter: false },
        ],
      }),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error).toContain("invalid");
  });

  it("returns 404 when status not found", async () => {
    mockSelect.mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([]) }) });

    const app = new Hono();
    app.route("/", projectStatusesRoute);
    const res = await app.fetch(makeRequest("PUT", `/non-existent/fields`, { fields: [] }));
    expect(res.status).toBe(404);
  });
});
