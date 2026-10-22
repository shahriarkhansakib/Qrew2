"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { invoiceApi } from "@/components/features/invoices/shared/invoice-api";
import { invoiceKeys } from "@/components/features/invoices/shared/invoice-keys";
import { safeEval } from "@/lib/formula-evaluator";
import { type SelectedCell, useBuilderContext } from "./builder-context";
import { preprocessForSave } from "./formula-bar-utils";

export function useSaveCellMutation() {
  const queryClient = useQueryClient();
  const { setSelectedCell, apiBasePath, invalidateKey, mode } = useBuilderContext();

  return useMutation({
    mutationFn: async ({ cell, rawInput }: { cell: SelectedCell; rawInput: string }) => {
      const trimmed = rawInput.trim();
      const isFillMode = mode === "fill";
      const isCharge = Boolean(cell.chargeId || cell.isSectionCharge);

      let evaluatedManualValue: number | null = null;
      let isFormula = isCharge;

      if (!isCharge) {
        if (isFillMode) {
          // Fill Mode: strictly manual calculation or scalar entry
          if (!trimmed) {
            evaluatedManualValue = null;
          } else {
            const allowedMathFunctions = new Set([
              "MIN",
              "MAX",
              "ROUND",
              "CLAMP",
              "ABS",
              "FLOOR",
              "CEIL",
            ]);
            const idents = trimmed.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
            const invalidIdents = idents.filter(
              (id) => !allowedMathFunctions.has(id.toUpperCase()),
            );
            if (invalidIdents.length > 0) {
              throw new Error(
                `"${invalidIdents.join(", ")}" is not allowed in Fill Mode. Switch to Builder Mode to author formulas with tokens, or enter a number / calculation.`,
              );
            }

            const calculated = safeEval(trimmed);
            if (calculated === null || !Number.isFinite(calculated)) {
              throw new Error(
                "Invalid calculation. Please enter a valid number or mathematical expression.",
              );
            }
            evaluatedManualValue = calculated;
          }
          isFormula = false;
        } else {
          // Builder / Template Mode: dynamic transition between formula and normal value
          const hasFormulaChars =
            Boolean(trimmed) &&
            (/[A-Za-z_]/.test(trimmed) ||
              trimmed.includes("//") ||
              (trimmed.includes("%") && !/^\s*[\d.]+\s*$/.test(trimmed)));

          isFormula = hasFormulaChars;

          if (!isFormula && trimmed) {
            const calculated = safeEval(trimmed);
            evaluatedManualValue =
              calculated != null && Number.isFinite(calculated)
                ? calculated
                : parseFloat(trimmed) || null;
          }
        }
      }

      const processedFormula = isFormula ? preprocessForSave(trimmed) : trimmed;

      // ── Catalog Line Item ──
      if (cell.isCatalogItem) {
        const payload: Record<string, any> = {
          valueType: isFormula ? "formula" : "normal",
          formula: isFormula ? processedFormula : null,
          initialValue: isFormula
            ? null
            : evaluatedManualValue != null
              ? evaluatedManualValue
              : trimmed
                ? parseFloat(trimmed) || null
                : null,
        };

        if (cell.columnKey && cell.row) {
          payload.cellValues = {
            ...(cell.row.cellValues || {}),
            [cell.columnKey]: isFormula
              ? processedFormula
              : evaluatedManualValue != null
                ? evaluatedManualValue
                : trimmed,
          };
        }

        if (cell.templateId) {
          await invoiceApi.updateTemplateOptionalRow(
            cell.templateId,
            cell.rowId || cell.token || "",
            payload,
          );
        }
        return { cell, isCatalog: true };
      }

      // ── Section Charge ──
      if (cell.isSectionCharge && cell.chargeId) {
        const res = await fetch(
          `${apiBasePath}/sections/${cell.sectionId}/section-charges/${cell.chargeId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ formula: processedFormula }),
          },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to save section charge");
        }
        return { json: await res.json(), templateId: cell.templateId };
      }

      // ── Row Charge ──
      if (cell.chargeId && cell.row) {
        const res = await fetch(
          `${apiBasePath}/sections/${cell.sectionId}/rows/${cell.rowId}/charges/${cell.chargeId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ formula: processedFormula }),
          },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to save row charge formula");
        }
        return { json: await res.json(), templateId: cell.templateId };
      }

      // ── Normal Row ──
      const payload: Record<string, any> = {
        valueType: isFormula ? "formula" : "normal",
        formula: isFormula ? processedFormula : null,
        initialValue: isFormula
          ? null
          : evaluatedManualValue != null
            ? evaluatedManualValue
            : trimmed
              ? parseFloat(trimmed) || null
              : null,
      };

      if (cell.columnKey && cell.row) {
        payload.cellValues = {
          ...(cell.row.cellValues || {}),
          [cell.columnKey]: isFormula
            ? processedFormula
            : evaluatedManualValue != null
              ? evaluatedManualValue
              : trimmed,
        };
      }

      const res = await fetch(`${apiBasePath}/sections/${cell.sectionId}/rows/${cell.rowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save");
      }
      return { json: await res.json(), templateId: cell.templateId };
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: invalidateKey });
      if (data?.isCatalog && data.cell) {
        if (data.cell.templateId) {
          queryClient.invalidateQueries({
            queryKey: invoiceKeys.optionalRows.byTemplate(data.cell.templateId),
          });
        }
        if (data.cell.draftId) {
          queryClient.invalidateQueries({
            queryKey: invoiceKeys.optionalRows.byDraft(data.cell.draftId),
          });
        }
        toast.success("Updated line item formula / value");
      }
      setSelectedCell(null);
    },
    onError: (err: any) => toast.error(err.message || "Failed to save cell value"),
  });
}
