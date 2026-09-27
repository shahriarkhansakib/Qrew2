/**
 * Shared test helpers for invoice-template API unit tests.
 *
 * Strategy: We test each controller method directly by constructing a
 * minimal Hono Context mock. This avoids spinning up an HTTP server while
 * still exercising all controller logic (auth, Zod validation, DB calls).
 *
 * DB calls are mocked via vi.mock("@starter/db") so no real DB connection
 * is needed. Each test can configure db mock return values per scenario.
 */

import { vi } from "vitest";

// ─── Fixture constants ────────────────────────────────────────────────────────

export const ORG_ID = "org-test-001";
export const TEMPLATE_ID = "tpl-test-001";
export const SECTION_ID = "sec-test-001";
export const ROW_ID = "row-test-001";
export const CHARGE_ID = "chg-test-001";

// ─── Fixture factories ────────────────────────────────────────────────────────

export function makeSection(overrides: Record<string, any> = {}) {
  return {
    id: SECTION_ID,
    templateId: TEMPLATE_ID,
    label: "Port Costs",
    description: null,
    sectionToken: "SECTION_PORT_COSTS",
    sortOrder: 0,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    rows: [],
    sectionCharges: [],
    ...overrides,
  };
}

export function makeRow(overrides: Record<string, any> = {}) {
  return {
    id: ROW_ID,
    templateId: TEMPLATE_ID,
    sectionId: SECTION_ID,
    label: "Port Dues",
    rowToken: "PORT_DUES",
    sortOrder: 0,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    charges: [],
    ...overrides,
  };
}

export function makeRowCharge(overrides: Record<string, any> = {}) {
  return {
    id: CHARGE_ID,
    rowId: ROW_ID,
    label: "VAT",
    subDescription: null,
    qualifier: null,
    tags: [],
    chargeToken: "PORT_DUES_VAT",
    formula: "PORT_DUES * 0.15",
    sortOrder: 0,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

/** @deprecated Use makeRow() — makeComponent was for the old pre-F6 components architecture */
export function makeComponent(overrides: Record<string, any> = {}) {
  return {
    id: "comp-001",
    rowId: ROW_ID,
    label: "Base Rate",
    subDescription: null,
    qualifier: null,
    tags: [],
    componentToken: "PORT_DUES_BASE_RATE",
    valueType: "normal",
    formula: null,
    initialValue: null,
    sortOrder: 0,
    ...overrides,
  };
}

export function makeSectionCharge(overrides: Record<string, any> = {}) {
  return {
    id: CHARGE_ID,
    sectionId: SECTION_ID,
    templateId: TEMPLATE_ID,
    label: "Port Levy",
    subDescription: null,
    qualifier: null,
    tags: [],
    chargeToken: "SEC_SECTION_PORT_COSTS_PORT_LEVY",
    formula: "SEC_SECTION_PORT_COSTS * 0.10",
    sortOrder: 0,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

export function makeConstant(overrides: Record<string, any> = {}) {
  return {
    id: "const-test-001",
    templateId: TEMPLATE_ID,
    token: "FUEL_RATE",
    name: "Fuel Rate",
    valueType: "number" as const,
    defaultValue: "3.5",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

export function makeHeaderField(overrides: Record<string, any> = {}) {
  return {
    id: "hf-test-001",
    templateId: TEMPLATE_ID,
    label: "Client",
    fieldType: "file_field" as const,
    fileFieldKey: "clientId",
    orgConfigKey: null,
    defaultManualValue: null,
    placeholder: null,
    isFormulaInjectable: false,
    columnPosition: "left" as const,
    sortOrder: 0,
    ...overrides,
  };
}

// ─── Hono Context mock builder ────────────────────────────────────────────────

/**
 * Creates a mock Hono Context object that the controller methods expect.
 *
 * @param opts.orgId - organizationId from auth middleware
 * @param opts.params - route params (templateId, sectionId, etc.)
 * @param opts.body - JSON body (for POST/PATCH)
 */
export function makeContext(opts: {
  orgId?: string | null;
  params?: Record<string, string>;
  body?: Record<string, any>;
}) {
  const { orgId = ORG_ID, params = {}, body = {} } = opts;

  const jsonResponses: any[] = [];
  const ctx = {
    get: vi.fn((key: string) => {
      if (key === "organizationId") return orgId;
      if (key === "userId") return "user-001";
      if (key === "user") return { id: "user-001" };
      return undefined;
    }),
    req: {
      param: vi.fn((key: string) => params[key]),
      json: vi.fn().mockResolvedValue(body),
    },
    json: vi.fn((data: any, status?: number) => {
      jsonResponses.push({ data, status: status ?? 200 });
      return { data, status: status ?? 200 };
    }),
  } as any;

  return { ctx, jsonResponses };
}

/**
 * Alias for makeContext() matching the inline `makeCtx()` pattern used in feature test files.
 * Prefer this in new tests for consistency with the existing test style.
 */
export function makeCtx(opts: {
  orgId?: string | null;
  params?: Record<string, string>;
  body?: Record<string, any>;
}) {
  const { ctx } = makeContext(opts);
  return ctx;
}

// ─── DB mock configurator ─────────────────────────────────────────────────────

/** Access the mocked @starter/db module. Call this AFTER vi.mock("@starter/db"). */
export function getDbMock() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("@starter/db") as ReturnType<typeof buildDbMock>;
}

export function buildDbMock(): any {
  return {
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      transaction: vi.fn(),
      query: {
        invoiceTemplates: { findFirst: vi.fn() },
        templateSections: { findFirst: vi.fn(), findMany: vi.fn() },
        templateRows: { findFirst: vi.fn(), findMany: vi.fn() },
        templateRowCharges: { findFirst: vi.fn(), findMany: vi.fn() },
        templateSectionCharges: { findFirst: vi.fn() },
        templateConstants: { findFirst: vi.fn(), findMany: vi.fn() },
        templateHeaderFields: { findFirst: vi.fn(), findMany: vi.fn() },
      },
    },
    templateSections: {
      id: "id",
      templateId: "templateId",
      sectionToken: "sectionToken",
      sortOrder: "sortOrder",
    },
    templateRows: {
      id: "id",
      sectionId: "sectionId",
      templateId: "templateId",
      rowToken: "rowToken",
      sortOrder: "sortOrder",
    },
    templateRowCharges: {
      id: "id",
      rowId: "rowId",
      sortOrder: "sortOrder",
      chargeToken: "chargeToken",
    },
    templateSectionCharges: {
      id: "id",
      sectionId: "sectionId",
      chargeToken: "chargeToken",
      sortOrder: "sortOrder",
    },
    tokens: {
      id: "id",
      tokenKey: "tokenKey",
      label: "label",
      description: "description",
      sortOrder: "sortOrder",
      valueType: "valueType",
      domain: "domain",
      entityType: "entityType",
      isSystem: "isSystem",
      isInjectable: "isInjectable",
      isVisible: "isVisible",
      organizationId: "organizationId",
    },
    templateConstants: { id: "id", templateId: "templateId", token: "token" },
    templateHeaderFields: {
      id: "id",
      templateId: "templateId",
      sortOrder: "sortOrder",
      columnPosition: "columnPosition",
    },
    invoiceTemplates: { id: "id", organizationId: "organizationId" },
    eq: vi.fn((_a: any, _b: any) => "eq-condition"),
    and: vi.fn((...args: any[]) => "and-condition"),
    asc: vi.fn((col: any) => "asc-" + col),
  };
}
