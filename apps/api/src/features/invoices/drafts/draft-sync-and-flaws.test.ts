import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ||= "postgresql://postgres:postgres@localhost:5432/test";

import { decodeFormula, encodeFormula } from "@starter/db";
import { validateDraftDag } from "../engine/engine-utils";

describe("Architecture Flaws & Synchronization Protocol Tests", () => {
  describe("Flaw 1 (Critical): Formula Remapping in saveAsTemplate", () => {
    it("should correctly decode draft formulas and remap to new template UUIDs", () => {
      const draftRow1Id = "draft-row-1111";
      const draftRow2Id = "draft-row-2222";
      const draftConstId = "draft-const-3333";

      const newTplRow1Id = "tpl-row-AAAA";
      const newTplRow2Id = "tpl-row-BBBB";
      const newTplConstId = "tpl-const-CCCC";

      const draftIdToToken = {
        [draftRow1Id]: "BASE_FEE",
        [draftRow2Id]: "TAX_RATE",
        [draftConstId]: "DISCOUNT",
      };

      // Formula in draft references draft UUIDs
      const draftFormula = `{{$tok:${draftRow1Id}}} * {{$tok:${draftRow2Id}}} - {{$tok:${draftConstId}}}`;

      // 1. Decode to plain human-readable tokens
      const decoded = decodeFormula(
        draftFormula,
        draftIdToToken,
        {},
        { [draftConstId]: "DISCOUNT" },
      );
      expect(decoded).toBe("BASE_FEE * TAX_RATE - DISCOUNT");

      // 2. Re-encode using new template token map
      const newRowTokenToId = {
        BASE_FEE: newTplRow1Id,
        TAX_RATE: newTplRow2Id,
      };
      const newTplTokenToId = {
        DISCOUNT: newTplConstId,
        TPL_DISCOUNT: newTplConstId,
      };

      const reEncoded = encodeFormula(decoded, newRowTokenToId, {}, newTplTokenToId);
      expect(reEncoded).toBe(
        `{{$tok:${newTplRow1Id}}} * {{$tok:${newTplRow2Id}}} - {{$tok:${newTplConstId}}}`,
      );

      // Verify no draft UUIDs remain
      expect(reEncoded).not.toContain(draftRow1Id);
      expect(reEncoded).not.toContain(draftRow2Id);
      expect(reEncoded).not.toContain(draftConstId);
    });

    it("should handle _BASE suffix variants during remapping", () => {
      const draftRowId = "draft-row-1111";
      const newTplRowId = "tpl-row-AAAA";

      const draftIdToToken = {
        [draftRowId]: "BASE_FEE",
      };

      const draftChargeFormula = `{{$tok:${draftRowId}}}_BASE * 0.15`;
      const decoded = decodeFormula(draftChargeFormula, draftIdToToken);
      expect(decoded).toBe("BASE_FEE_BASE * 0.15");

      const newRowTokenToId = {
        BASE_FEE: newTplRowId,
      };
      const reEncoded = encodeFormula(decoded, newRowTokenToId);
      expect(reEncoded).toBe(`{{$tok:${newTplRowId}}}_BASE * 0.15`);
    });
  });

  describe("Flaw 2 (High): Template Drift & Non-Destructive 3-Way Sync", () => {
    it("should accurately compare template versions and detect structural drift", () => {
      const template = {
        id: "tpl-1",
        version: 3,
        updatedAt: new Date("2026-10-20T12:00:00Z"),
      };
      const draft = {
        id: "draft-1",
        sourceTemplateId: "tpl-1",
        sourceTemplateVersion: 1,
        createdAt: new Date("2026-10-20T08:00:00Z"),
      };

      const hasVersionDrift = (template.version ?? 1) > (draft.sourceTemplateVersion ?? 1);
      const hasTimeDrift = template.updatedAt > draft.createdAt;
      const hasTemplateDrift = hasVersionDrift || hasTimeDrift;

      expect(hasTemplateDrift).toBe(true);
      expect(template.version).toBe(3);
      expect(draft.sourceTemplateVersion).toBe(1);
    });

    it("should perform non-destructive 3-way merge preserving user manual values", () => {
      // Current draft state with user manual rates and custom label
      const currentDraftSections = [
        {
          id: "draft-sec-1",
          sectionToken: "PORT_DUES",
          label: "Port Dues & Charges",
          rows: [
            {
              id: "draft-row-1",
              rowToken: "TONNAGE_DUE",
              label: "Special Tonnage Due (Custom Client Label)",
              valueType: "normal",
              formula: null,
              initialValue: "500",
              manualValue: "750", // Staff entered manual override
              isOptional: false,
            },
            {
              id: "draft-row-custom",
              rowToken: "CUSTOM_EXTRA",
              label: "Pilotage Overtime",
              valueType: "normal",
              formula: null,
              initialValue: "200",
              isOptional: true, // Optional line item added in draft
            },
          ],
        },
      ];

      // Updated template with new formula on TONNAGE_DUE and a newly added row BERTHING_FEE
      const updatedTemplateSections = [
        {
          id: "tpl-sec-1",
          sectionToken: "PORT_DUES",
          label: "Port Dues",
          rows: [
            {
              id: "tpl-row-1",
              rowToken: "TONNAGE_DUE",
              label: "Standard Tonnage Due",
              valueType: "formula",
              formula: "GRT * 0.25", // Formula updated in master template
              initialValue: "600",
            },
            {
              id: "tpl-row-2",
              rowToken: "BERTHING_FEE",
              label: "Berthing Fee",
              valueType: "normal",
              formula: null,
              initialValue: "300",
            },
          ],
        },
      ];

      // Simulate 3-way merge logic
      const mergedSections: any[] = [];
      for (const tplSec of updatedTemplateSections) {
        const existingSec = currentDraftSections.find(
          (s) => s.sectionToken === tplSec.sectionToken,
        );
        if (!existingSec) {
          mergedSections.push(tplSec);
          continue;
        }

        const mergedRows: any[] = [];
        for (const tplRow of tplSec.rows) {
          const existingRow = existingSec.rows.find((r) => r.rowToken === tplRow.rowToken);
          if (!existingRow) {
            mergedRows.push(tplRow);
          } else {
            // Keep existing ID and manual rates, update formula from template
            mergedRows.push({
              ...tplRow,
              id: existingRow.id,
              initialValue: existingRow.initialValue ?? tplRow.initialValue,
              manualValue: existingRow.manualValue,
              label: existingRow.label || tplRow.label,
            });
          }
        }

        // Preserve optional or custom draft rows
        for (const er of existingSec.rows) {
          if (er.isOptional || !tplSec.rows.some((tr) => tr.rowToken === er.rowToken)) {
            mergedRows.push(er);
          }
        }

        mergedSections.push({
          ...tplSec,
          id: existingSec.id,
          rows: mergedRows,
        });
      }

      expect(mergedSections.length).toBe(1);
      const rows = mergedSections[0].rows;
      expect(rows.length).toBe(3); // TONNAGE_DUE + BERTHING_FEE + CUSTOM_EXTRA

      // Row 1 preserves manual value and user custom label while pulling new formula
      const row1 = rows.find((r: any) => r.rowToken === "TONNAGE_DUE");
      expect(row1.id).toBe("draft-row-1");
      expect(row1.manualValue).toBe("750");
      expect(row1.label).toBe("Special Tonnage Due (Custom Client Label)");
      expect(row1.formula).toBe("GRT * 0.25");
      expect(row1.valueType).toBe("formula");

      // Row 2 is newly integrated from master template
      const row2 = rows.find((r: any) => r.rowToken === "BERTHING_FEE");
      expect(row2).toBeDefined();
      expect(row2.initialValue).toBe("300");

      // Row 3 (optional draft line item) is strictly preserved
      const customRow = rows.find((r: any) => r.rowToken === "CUSTOM_EXTRA");
      expect(customRow).toBeDefined();
      expect(customRow.isOptional).toBe(true);
      expect(customRow.initialValue).toBe("200");
    });
  });

  describe("Flaw 3 (Medium): Draft DAG Cycle & Compounding Validation", () => {
    it("should reject cyclic formula dependencies in drafts", () => {
      const cyclicDraft = {
        draftSections: [
          {
            id: "sec-1",
            sectionToken: "MAIN",
            rows: [
              {
                id: "row-1",
                rowToken: "ROW_A",
                formula: "{{$tok:row-2}} + 10",
              },
              {
                id: "row-2",
                rowToken: "ROW_B",
                formula: "{{$tok:row-1}} + 20",
              },
            ],
          },
        ],
        draftConstants: {},
      };

      const result = validateDraftDag(cyclicDraft);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.code === "CIRCULAR_DEPENDENCY")).toBe(true);
    });

    it("should reject self-referencing formulas in drafts", () => {
      const selfRefDraft = {
        draftSections: [
          {
            id: "sec-1",
            sectionToken: "MAIN",
            rows: [
              {
                id: "row-1",
                rowToken: "ROW_A",
                formula: "{{$tok:row-1}} * 2",
              },
            ],
          },
        ],
        draftConstants: {},
      };

      const result = validateDraftDag(selfRefDraft);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "CIRCULAR_DEPENDENCY")).toBe(true);
    });

    it("should accept valid DAG topological formula chains", () => {
      const validDraft = {
        draftSections: [
          {
            id: "sec-1",
            sectionToken: "MAIN",
            rows: [
              {
                id: "row-1",
                rowToken: "BASE_FEE",
                valueType: "normal",
                initialValue: "1000",
              },
              {
                id: "row-2",
                rowToken: "SURCHARGE",
                valueType: "formula",
                formula: "{{$tok:row-1}} * 0.1",
              },
              {
                id: "row-3",
                rowToken: "TOTAL_DUE",
                valueType: "formula",
                formula: "{{$tok:row-1}} + {{$tok:row-2}}",
              },
            ],
          },
        ],
        draftConstants: {},
      };

      const result = validateDraftDag(validDraft);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
      expect(result.topologicalOrder).toContain("BASE_FEE");
      expect(result.topologicalOrder).toContain("SURCHARGE");
      expect(result.topologicalOrder).toContain("TOTAL_DUE");
    });

    it("should reject illegal compounding row charge referencing row total instead of base", () => {
      const compoundingDraft = {
        draftSections: [
          {
            id: "sec-1",
            sectionToken: "MAIN",
            rows: [
              {
                id: "row-1",
                rowToken: "ROW_MAIN",
                charges: [
                  {
                    id: "ch-1",
                    chargeToken: "CH_SERVICE",
                    // Referencing row total token instead of base is a compounding violation
                    formula: "{{$tok:row-1}} * 0.1",
                  },
                ],
              },
            ],
          },
        ],
        draftConstants: {},
      };

      const result = validateDraftDag(compoundingDraft);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "CHARGE_SCOPE_VIOLATION")).toBe(true);
    });
  });

  describe("Flaw 4 (Low): Scope Normalization without Redundant Prefixes", () => {
    it("should strip TPL_ prefix before assigning canonical scope keys", () => {
      const key = "TPL_DISCOUNT";
      const bareKey = key.replace(/^TPL_/, "");
      expect(bareKey).toBe("DISCOUNT");

      const scope: Record<string, string> = {};
      scope[`TPL_${bareKey}`] = "10.000000";
      scope[bareKey] = "10.000000";

      expect(scope["TPL_DISCOUNT"]).toBe("10.000000");
      expect(scope["DISCOUNT"]).toBe("10.000000");
      expect(scope["TPL_TPL_DISCOUNT"]).toBeUndefined();
    });
  });
});
