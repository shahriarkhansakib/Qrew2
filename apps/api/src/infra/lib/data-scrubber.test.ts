import { describe, expect, it, vi } from "vitest";

// Mock @starter/db before any imports that transitively load it.
// data-scrubber.ts imports { db } from "@starter/db" at the top level.
// Without this mock, the db package's env guard throws "DATABASE_URL is not set"
// in a clean CI environment, crashing the entire test file.
vi.mock("@starter/db", () => ({
  db: {},
  organizations: {},
  customFieldDefinitions: {},
  eq: vi.fn(),
  and: vi.fn(),
}));

import { ScrubberContext, scrubEntityData } from "./data-scrubber";

describe("Data Scrubber", () => {
  const dummyProject = {
    id: "proj_123",
    name: "Secret Project",
    clientId: "client_1",
    status: "active",
    customFields: {
      budget: 100000,
      launchDate: "2025-01-01",
      secretNotes: "Don't tell anyone",
    },
  };

  const customFieldDefinitions = [
    {
      id: "f1",
      entityType: "project",
      fieldKey: "budget",
      fieldName: "Budget",
      fieldType: "number",
      isRequired: false,
      isDetailed: true,
      isSensitive: false,
      isPrivate: false,
      isSeeded: false,
      options: null,
    },
    {
      id: "f2",
      entityType: "project",
      fieldKey: "launchDate",
      fieldName: "Launch Date",
      fieldType: "date",
      isRequired: false,
      isDetailed: false,
      isSensitive: true,
      isPrivate: false,
      isSeeded: false,
      options: null,
    },
    {
      id: "f3",
      entityType: "project",
      fieldKey: "secretNotes",
      fieldName: "Notes",
      fieldType: "text",
      isRequired: false,
      isDetailed: false,
      isSensitive: false,
      isPrivate: true,
      isSeeded: false,
      options: null,
    },
  ];

  it("should return exactly the same object if user is owner", () => {
    const config: ScrubberContext = {
      isOwner: true,
      userPermissions: new Set([]),
      orgSettings: {
        sysPrivateFields: ["sys-project-name"],
        sysSensitiveFields: ["sys-project-status"],
      },
      customFieldDefinitions: customFieldDefinitions as any,
    };

    const result = scrubEntityData(dummyProject, config, "project");
    expect(result.name).toBe("Secret Project");
    expect(result.status).toBe("active");
    expect(result.customFields.budget).toBe(100000);
    expect(result.customFields.launchDate).toBe("2025-01-01");
    expect(result.customFields.secretNotes).toBe("Don't tell anyone");
  });

  it("should scrub private Category 1 system fields if not owner", () => {
    const config: ScrubberContext = {
      isOwner: false,
      userPermissions: new Set(["file:view_sensitive", "file:view_details"]),
      orgSettings: {
        sysPrivateFields: ["sys-project-name"], // Project name is private
      },
      customFieldDefinitions: customFieldDefinitions as any,
    };

    const result = scrubEntityData(dummyProject, config, "project");
    expect(result.name).toBeUndefined();
    expect(result.status).toBe("active");
  });

  it("should scrub sensitive and detailed Category 1 system fields if lacking permission", () => {
    const config: ScrubberContext = {
      isOwner: false,
      userPermissions: new Set([]), // Lacks sensitive and detailed
      orgSettings: {
        sysSensitiveFields: ["sys-project-status"],
        sysDetailedFields: ["sys-project-client"],
      },
      customFieldDefinitions: customFieldDefinitions as any,
    };

    const result = scrubEntityData(dummyProject, config, "project");
    expect(result.status).toBeUndefined();
    expect(result.clientId).toBeUndefined();
    expect(result.name).toBe("Secret Project"); // Unaffected
  });

  it("should retain sensitive and detailed Category 1 fields if user has permission", () => {
    const config: ScrubberContext = {
      isOwner: false,
      userPermissions: new Set(["file:view_sensitive", "file:view_details"]),
      orgSettings: {
        sysSensitiveFields: ["sys-project-status"],
        sysDetailedFields: ["sys-project-client"],
      },
      customFieldDefinitions: customFieldDefinitions as any,
    };

    const result = scrubEntityData(dummyProject, config, "project");
    expect(result.status).toBe("active");
    expect(result.clientId).toBe("client_1");
  });

  it("should scrub private/sensitive/detailed Category 2 custom fields based on permissions", () => {
    const config: ScrubberContext = {
      isOwner: false,
      userPermissions: new Set(["file:view_details"]), // Has detailed, lacks sensitive
      orgSettings: {},
      customFieldDefinitions: customFieldDefinitions as any,
    };

    const result = scrubEntityData(dummyProject, config, "project");

    // Detailed field (budget) should be present because user has file:view_detailed
    expect(result.customFields.budget).toBe(100000);

    // Sensitive field (launchDate) should be missing
    expect(result.customFields.launchDate).toBeUndefined();

    // Private field (secretNotes) should be missing
    expect(result.customFields.secretNotes).toBeUndefined();
  });
});
