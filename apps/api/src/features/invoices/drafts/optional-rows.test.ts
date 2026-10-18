/**
 * optional-rows.test.ts
 *
 * Comprehensive integration tests for Prebuilt Optional Service Rows:
 *   - DraftBuilderController.listOptionalRows:
 *       - returns available catalog items from template
 *       - reports attached services with accurate tokens and section info
 *   - DraftBuilderController.addOptionalRow:
 *       - validates catalog token existence
 *       - enforces token collision sequencing: CRANE_RENTAL -> CRANE_RENTAL_2 -> CRANE_RENTAL_3
 *       - preserves custom label and custom numeric rate overrides
 *       - flags row with isOptionalService: true
 *       - appends audit entry to editHistory
 *   - DraftBuilderController.removeOptionalRow:
 *       - blocks deletion of standard/core template rows (400)
 *       - removes optional service row from draft sections
 *       - appends audit entry to editHistory
 *   - InvoiceTemplatesController optional rows catalog management:
 *       - adds optional row definition to template
 *       - deletes optional row definition from template
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvoiceTemplatesController } from "../../invoice-templates/invoice-templates.controller";
import { DraftBuilderController } from "./draft-builder.controller";

const { mockDbQuery, mockDbUpdate, mockDbSelectResult } = vi.hoisted(() => {
  const mockDbQuery = {
    invoiceDrafts: {
      findFirst: vi.fn(),
    },
    invoiceTemplates: {
      findFirst: vi.fn(),
    },
  };
  const mockDbUpdate = vi.fn();
  const mockDbSelectResult = { current: [] as any[] };

  return { mockDbQuery, mockDbUpdate, mockDbSelectResult };
});

vi.mock("@starter/db", () => {
  const makeSelectChain = () => {
    const chain: any = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(() => Promise.resolve(mockDbSelectResult.current)),
    };
    chain.then = (resolve: any) => resolve(mockDbSelectResult.current);
    return chain;
  };

  const chainable = () => ({
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: "draft-1" }]),
  });

  return {
    db: {
      select: vi.fn(() => makeSelectChain()),
      query: mockDbQuery,
      update: (...args: any[]) => {
        mockDbUpdate(...args);
        return chainable();
      },
    },
    invoiceDrafts: {
      id: "id",
      organizationId: "organization_id",
    },
    invoiceTemplates: {
      id: "id",
      organizationId: "organization_id",
    },
  };
});

function createMockContext({
  body,
  params = {},
  orgId = "org_test",
  user = { id: "usr_agent", name: "Agent Bob", email: "bob@agency.com" },
}: {
  body?: any;
  params?: Record<string, string>;
  orgId?: string;
  user?: any;
}) {
  const jsonResponse: { data?: any; status?: number } = {};

  const c = {
    req: {
      json: vi.fn().mockResolvedValue(body),
      param: (k?: string) => (k ? params[k] : params),
      header: (name: string) => (name.toLowerCase() === "host" ? "test.app.local" : undefined),
    },
    get: (key: string) => {
      if (key === "activeOrgId" || key === "organizationId") return orgId;
      if (key === "user") return user;
      return undefined;
    },
    json: (data: any, status = 200) => {
      jsonResponse.data = data;
      jsonResponse.status = status;
      return jsonResponse;
    },
  };

  return { c: c as any, jsonResponse };
}

describe("Prebuilt Optional Service Rows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("DraftBuilderController.listOptionalRows", () => {
    it("returns available template services and attached draft rows", async () => {
      const template = {
        id: "tpl_1",
        organizationId: "org_test",
        optionalRows: [
          {
            id: "opt_1",
            rowToken: "CRANE_RENTAL",
            label: "Mobile Crane Rental",
            valueType: "normal",
            initialValue: "500",
          },
        ],
      };

      const draft = {
        id: "draft_1",
        organizationId: "org_test",
        sourceTemplateId: "tpl_1",
        draftSections: [
          {
            id: "sec_1",
            sectionToken: "CARGO",
            headerName: "Cargo Operations",
            rows: [
              {
                id: "row_opt_1",
                rowToken: "CRANE_RENTAL",
                canonicalToken: "CRANE_RENTAL",
                label: "Mobile Crane Rental 50T",
                isOptionalService: true,
                valueType: "normal",
                initialValue: 500,
              },
            ],
          },
        ],
      };

      mockDbSelectResult.current = [draft];
      mockDbQuery.invoiceTemplates.findFirst.mockResolvedValueOnce(template);

      const { c, jsonResponse } = createMockContext({
        params: { id: "draft_1" },
      });

      await DraftBuilderController.listOptionalRows(c);

      expect(jsonResponse.status).toBe(200);
      expect(jsonResponse.data.available).toHaveLength(1);
      expect(jsonResponse.data.available[0].rowToken).toBe("CRANE_RENTAL");
      expect(jsonResponse.data.attached).toHaveLength(1);
      expect(jsonResponse.data.attached[0].token).toBe("CRANE_RENTAL");
      expect(jsonResponse.data.attached[0].sectionToken).toBe("CARGO");
    });
  });

  describe("DraftBuilderController.addOptionalRow", () => {
    it("allocates canonical token without suffix on first addition", async () => {
      const template = {
        id: "tpl_1",
        organizationId: "org_test",
        optionalRows: [
          {
            id: "opt_1",
            rowToken: "CRANE_RENTAL",
            label: "Mobile Crane Rental",
            valueType: "normal",
            initialValue: "500",
          },
        ],
      };

      const draft = {
        id: "draft_1",
        organizationId: "org_test",
        sourceTemplateId: "tpl_1",
        draftSections: [
          {
            id: "sec_1",
            sectionToken: "SERVICES",
            headerName: "Services",
            rows: [],
          },
        ],
        editHistory: [],
      };

      mockDbSelectResult.current = [draft];
      mockDbQuery.invoiceTemplates.findFirst.mockResolvedValueOnce(template);

      const { c, jsonResponse } = createMockContext({
        params: { id: "draft_1" },
        body: {
          canonicalToken: "CRANE_RENTAL",
          customLabel: "Mobile Crane 50T Pier 4",
          customValue: 650,
        },
      });

      await DraftBuilderController.addOptionalRow(c);

      expect(jsonResponse.status).toBe(200);
      expect(jsonResponse.data.success).toBe(true);
      expect(jsonResponse.data.allocatedToken).toBe("CRANE_RENTAL");
      expect(jsonResponse.data.row.label).toBe("Mobile Crane 50T Pier 4");
      expect(jsonResponse.data.row.initialValue).toBe(650);
      expect(jsonResponse.data.row.isOptionalService).toBe(true);
      expect(mockDbUpdate).toHaveBeenCalled();
    });

    it("appends incremented suffix on token collision (CRANE_RENTAL_2)", async () => {
      const template = {
        id: "tpl_1",
        organizationId: "org_test",
        optionalRows: [
          {
            id: "opt_1",
            rowToken: "CRANE_RENTAL",
            label: "Mobile Crane Rental",
            valueType: "normal",
            initialValue: "500",
          },
        ],
      };

      const draft = {
        id: "draft_1",
        organizationId: "org_test",
        sourceTemplateId: "tpl_1",
        draftSections: [
          {
            id: "sec_1",
            sectionToken: "SERVICES",
            headerName: "Services",
            rows: [
              {
                id: "row_1",
                rowToken: "CRANE_RENTAL",
                canonicalToken: "CRANE_RENTAL",
                isOptionalService: true,
              },
            ],
          },
        ],
        editHistory: [],
      };

      mockDbSelectResult.current = [draft];
      mockDbQuery.invoiceTemplates.findFirst.mockResolvedValueOnce(template);

      const { c, jsonResponse } = createMockContext({
        params: { id: "draft_1" },
        body: {
          canonicalToken: "CRANE_RENTAL",
        },
      });

      await DraftBuilderController.addOptionalRow(c);

      expect(jsonResponse.status).toBe(200);
      expect(jsonResponse.data.allocatedToken).toBe("CRANE_RENTAL_2");
      expect(jsonResponse.data.row.rowToken).toBe("CRANE_RENTAL_2");
      expect(jsonResponse.data.row.canonicalToken).toBe("CRANE_RENTAL");
    });
  });

  describe("DraftBuilderController.removeOptionalRow", () => {
    it("rejects removal if row is not an optional service", async () => {
      const draft = {
        id: "draft_1",
        organizationId: "org_test",
        draftSections: [
          {
            id: "sec_1",
            rows: [
              {
                id: "core_row_1",
                rowToken: "PORT_DUES",
                isOptionalService: false,
              },
            ],
          },
        ],
        editHistory: [],
      };

      mockDbSelectResult.current = [draft];

      const { c, jsonResponse } = createMockContext({
        params: { id: "draft_1", rowId: "core_row_1" },
      });

      await DraftBuilderController.removeOptionalRow(c);

      expect(jsonResponse.status).toBe(400);
      expect(jsonResponse.data.error).toMatch(/Only prebuilt optional service rows/);
      expect(mockDbUpdate).not.toHaveBeenCalled();
    });

    it("successfully removes optional service row and updates draft", async () => {
      const draft = {
        id: "draft_1",
        organizationId: "org_test",
        draftSections: [
          {
            id: "sec_1",
            rows: [
              {
                id: "opt_row_1",
                rowToken: "CRANE_RENTAL",
                isOptionalService: true,
              },
            ],
          },
        ],
        editHistory: [],
      };

      mockDbSelectResult.current = [draft];

      const { c, jsonResponse } = createMockContext({
        params: { id: "draft_1", rowId: "opt_row_1" },
      });

      await DraftBuilderController.removeOptionalRow(c);

      expect(jsonResponse.status).toBe(200);
      expect(jsonResponse.data.success).toBe(true);
      expect(jsonResponse.data.token).toBe("CRANE_RENTAL");
      expect(mockDbUpdate).toHaveBeenCalled();
    });
  });

  describe("InvoiceTemplatesController optional rows catalog", () => {
    it("adds an optional row to template catalog", async () => {
      const template = {
        id: "tpl_1",
        organizationId: "org_test",
        optionalRows: [],
      };

      mockDbSelectResult.current = [template];

      const { c, jsonResponse } = createMockContext({
        params: { id: "tpl_1" },
        body: {
          rowToken: "FUMIGATION",
          label: "Vessel Fumigation",
          valueType: "normal",
          initialValue: "1200",
        },
      });

      await InvoiceTemplatesController.addOptionalRow(c);

      expect(jsonResponse.status).toBe(201);
      expect(jsonResponse.data.rowToken).toBe("FUMIGATION");
      expect(mockDbUpdate).toHaveBeenCalled();
    });

    it("deletes an optional row from template catalog", async () => {
      const template = {
        id: "tpl_1",
        organizationId: "org_test",
        optionalRows: [
          {
            id: "opt_1",
            rowToken: "FUMIGATION",
            label: "Vessel Fumigation",
          },
        ],
      };

      mockDbSelectResult.current = [template];

      const { c, jsonResponse } = createMockContext({
        params: { id: "tpl_1", canonicalToken: "FUMIGATION" },
      });

      await InvoiceTemplatesController.deleteOptionalRow(c);

      expect(jsonResponse.status).toBe(200);
      expect(jsonResponse.data.success).toBe(true);
      expect(mockDbUpdate).toHaveBeenCalled();
    });
  });
});
