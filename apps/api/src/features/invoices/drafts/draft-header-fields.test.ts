import { describe, expect, it, vi } from "vitest";
import { DraftBuilderController } from "./draft-builder.controller";

const mockDraft = {
  id: "draft-123",
  organizationId: "org-123",
  sourceTemplateId: "tpl-123",
  draftHeaderFields: [
    {
      id: "f-1",
      label: "GRT",
      fieldType: "file_field",
      fileFieldKey: "GRT",
      sortOrder: 0,
      columnPosition: "left",
    },
    {
      id: "f-2",
      label: "Port Call",
      fieldType: "file_field",
      fileFieldKey: "PORT_CALL",
      sortOrder: 1,
      columnPosition: "right",
    },
  ],
};

vi.mock("@starter/db", () => {
  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([mockDraft]),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([]),
          })),
        })),
      })),
    },
    invoiceDrafts: { id: "id", organizationId: "organizationId" },
    templateHeaderFields: {},
    tokens: {},
    customFieldDefinitions: {},
    decodeFormula: (f: any) => f,
    encodeFormula: (f: any) => f,
  };
});

vi.mock("./draft-audit", () => ({
  appendAuditEntry: vi.fn().mockReturnValue([]),
}));

describe("DraftBuilderController Header Fields", () => {
  it("listHeaderFields returns draft header fields", async () => {
    const ctx = {
      req: { param: (key: string) => (key === "id" ? "draft-123" : "") },
      get: (key: string) => (key === "organizationId" ? "org-123" : null),
      json: (data: any, status?: number) => ({ data, status }),
    } as any;

    const res: any = await DraftBuilderController.listHeaderFields(ctx);
    expect(res.data).toHaveLength(2);
    expect(res.data[0].label).toBe("GRT");
  });

  it("createHeaderField appends a new header field to draft", async () => {
    const ctx = {
      req: {
        param: (key: string) => (key === "id" ? "draft-123" : ""),
        json: async () => ({
          label: "Vessel Type",
          fileFieldKey: "VESSEL_TYPE",
          columnPosition: "left",
          isFormulaInjectable: false,
        }),
      },
      get: (key: string) => (key === "organizationId" ? "org-123" : null),
      json: (data: any, status?: number) => ({ data, status }),
    } as any;

    const res: any = await DraftBuilderController.createHeaderField(ctx);
    expect(res.status).toBe(201);
    expect(res.data.label).toBe("Vessel Type");
    expect(res.data.fileFieldKey).toBe("VESSEL_TYPE");
  });

  it("updateHeaderField updates an existing header field in draft", async () => {
    const ctx = {
      req: {
        param: (key: string) => (key === "id" ? "draft-123" : key === "fieldId" ? "f-1" : ""),
        json: async () => ({ label: "Gross Registered Tonnage" }),
      },
      get: (key: string) => (key === "organizationId" ? "org-123" : null),
      json: (data: any, status?: number) => ({ data, status }),
    } as any;

    const res: any = await DraftBuilderController.updateHeaderField(ctx);
    expect(res.data.label).toBe("Gross Registered Tonnage");
  });

  it("deleteHeaderField removes field from draft", async () => {
    const ctx = {
      req: {
        param: (key: string) => (key === "id" ? "draft-123" : key === "fieldId" ? "f-2" : ""),
      },
      get: (key: string) => (key === "organizationId" ? "org-123" : null),
      json: (data: any, status?: number) => ({ data, status }),
    } as any;

    const res: any = await DraftBuilderController.deleteHeaderField(ctx);
    expect(res.data.success).toBe(true);
    expect(res.data.deletedId).toBe("f-2");
  });

  it("reorderHeaderFields reorders fields according to updates", async () => {
    const ctx = {
      req: {
        param: (key: string) => (key === "id" ? "draft-123" : ""),
        json: async () => ({
          updates: [
            { fieldId: "f-1", sortOrder: 1, columnPosition: "right" },
            { fieldId: "f-2", sortOrder: 0, columnPosition: "left" },
          ],
        }),
      },
      get: (key: string) => (key === "organizationId" ? "org-123" : null),
      json: (data: any, status?: number) => ({ data, status }),
    } as any;

    const res: any = await DraftBuilderController.reorderHeaderFields(ctx);
    expect(res.data.success).toBe(true);
  });

  it("updateHeaderValues updates draft header values with dictionary or key/value payload", async () => {
    const ctx = {
      req: {
        param: (key: string) => (key === "id" ? "draft-123" : ""),
        json: async () => ({
          values: {
            "f-1": "95000",
            "f-custom": "Special Cargo Note\nBerth 4",
          },
        }),
      },
      get: (key: string) => (key === "organizationId" ? "org-123" : null),
      json: (data: any, status?: number) => ({ data, status }),
    } as any;

    const res: any = await DraftBuilderController.updateHeaderValues(ctx);
    expect(res.data.success).toBe(true);
    expect(res.data.draftHeaderValues["f-1"]).toBe("95000");
    expect(res.data.draftHeaderValues["f-custom"]).toBe("Special Cargo Note\nBerth 4");
  });
});
