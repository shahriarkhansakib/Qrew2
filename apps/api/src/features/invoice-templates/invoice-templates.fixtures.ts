/**
 * invoice-templates.fixtures.ts
 *
 * Single source of truth for fixture data used across all invoice-template
 * feature test files. Import from here instead of defining local factories.
 *
 * Convention:
 *  - ID constants: UPPER_CASE exports
 *  - Factory functions: make<EntityName>(overrides?)
 *  - Chain builder: makeSelectChain(result?) — returns a thenable promise-like
 *    with all Drizzle select-chain methods mocked
 *  - Context builder: makeCtx(opts) — returns a minimal Hono Context mock
 *
 * All IDs use "-001" suffix so they are visually distinct from UUIDs in logs.
 */

import { vi } from "vitest";

// ─── ID constants ─────────────────────────────────────────────────────────────

export const ORG_ID = "org-001";
export const TEMPLATE_ID = "tpl-001";
export const SECTION_ID = "sec-001";
export const ROW_ID = "row-001";
export const CHARGE_ID = "chg-001";
export const CONSTANT_ID = "const-001";
export const HEADER_FIELD_ID = "hf-001";
export const SECTION_TOKEN = "SECTION_A";

// ─── Chain builder ────────────────────────────────────────────────────────────

/**
 * Returns a thenable that also carries all Drizzle select-chain methods as
 * vi.fn() stubs. Each stub returns `this` so chains can be composed freely.
 *
 * Usage:
 *   (db.select as any).mockReturnValueOnce(makeSelectChain([{ id: "x" }]));
 */
export function makeSelectChain(result: any[] = []) {
  const p = Promise.resolve(result) as any;
  p.from = vi.fn().mockReturnValue(p);
  p.innerJoin = vi.fn().mockReturnValue(p);
  p.leftJoin = vi.fn().mockReturnValue(p);
  p.where = vi.fn().mockReturnValue(p);
  p.limit = vi.fn().mockReturnValue(p);
  p.orderBy = vi.fn().mockReturnValue(p);
  p.with = vi.fn().mockReturnValue(p);
  return p;
}

// ─── Context factory ──────────────────────────────────────────────────────────

/**
 * Creates a minimal Hono Context mock for invoking controller methods directly.
 *
 * @param opts.orgId  - organizationId injected by auth middleware (null → 401)
 * @param opts.params - URL route params
 * @param opts.body   - JSON request body
 */
export function makeCtx(opts: {
  orgId?: string | null;
  params?: Record<string, string>;
  body?: any;
}) {
  const { orgId = ORG_ID, params = {}, body = {} } = opts;
  return {
    get: vi.fn((key: string) => {
      if (key === "organizationId") return orgId;
      if (key === "user") return { id: "user-001" };
      if (key === "userId") return "user-001";
      return undefined;
    }),
    req: {
      param: vi.fn((key: string) => params[key]),
      json: vi.fn().mockResolvedValue(body),
    },
    json: vi.fn((data: any, status?: number) => ({ data, status: status ?? 200 })),
  } as any;
}

// ─── Entity factories ─────────────────────────────────────────────────────────

export function makeTemplate(overrides: Record<string, any> = {}) {
  return {
    id: TEMPLATE_ID,
    organizationId: ORG_ID,
    name: "Standard Port Invoice",
    description: null,
    documentPrefix: "INV",
    numberingFormat: "{PREFIX}-{YYYY}-{SEQ:4}",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

export function makeSection(overrides: Record<string, any> = {}) {
  return {
    id: SECTION_ID,
    templateId: TEMPLATE_ID,
    label: "Port Costs",
    description: null,
    sectionToken: SECTION_TOKEN,
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
    description: null,
    valueType: "normal",
    formula: null,
    initialValue: null,
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

export function makeSectionCharge(overrides: Record<string, any> = {}) {
  return {
    id: CHARGE_ID,
    sectionId: SECTION_ID,
    templateId: TEMPLATE_ID,
    label: "Port Levy",
    subDescription: null,
    qualifier: null,
    tags: [],
    chargeToken: `SEC_${SECTION_TOKEN}_PORT_LEVY`,
    formula: `SEC_${SECTION_TOKEN} * 0.10`,
    sortOrder: 0,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

export function makeConstant(overrides: Record<string, any> = {}) {
  return {
    id: CONSTANT_ID,
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
    id: HEADER_FIELD_ID,
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

export function makeToken(overrides: Record<string, any> = {}) {
  return {
    id: ROW_ID,
    tokenKey: "PORT_DUES",
    label: "Port Dues",
    description: null,
    domain: "row" as const,
    organizationId: ORG_ID,
    templateId: TEMPLATE_ID,
    sortOrder: 0,
    valueType: "number" as const,
    isInjectable: true,
    isSystem: false,
    isVisible: true,
    deprecatedAt: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

export function makeSectionToken(overrides: Record<string, any> = {}) {
  return {
    id: SECTION_ID,
    tokenKey: SECTION_TOKEN,
    label: "Port Costs",
    description: null,
    domain: "section" as const,
    organizationId: ORG_ID,
    templateId: TEMPLATE_ID,
    sortOrder: 0,
    valueType: "number" as const,
    isInjectable: true,
    isSystem: false,
    isVisible: true,
    deprecatedAt: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

export function makeChargeToken(overrides: Record<string, any> = {}) {
  return {
    id: CHARGE_ID,
    tokenKey: `SEC_${SECTION_TOKEN}_PORT_LEVY`,
    label: "Port Levy",
    description: null,
    domain: "section_charge" as const,
    organizationId: ORG_ID,
    templateId: TEMPLATE_ID,
    sortOrder: 0,
    valueType: "number" as const,
    isInjectable: true,
    isSystem: false,
    isVisible: true,
    deprecatedAt: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}
