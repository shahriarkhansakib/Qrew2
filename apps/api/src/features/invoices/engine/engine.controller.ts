import type { RowIdToTokenMap, SecIdToTokenMap, TplIdToTokenMap } from "@starter/db";
import {
  db,
  invoiceTemplates,
  organizationConfigs,
  templateConstants,
  templateHeaderFields,
  templateRowCharges,
  templateRows,
  templateSectionCharges,
  templateSections,
  tokens,
} from "@starter/db";
import { and, eq, inArray } from "drizzle-orm";
import { Context } from "hono";
import { z } from "zod";
import { AstEvaluatorService } from "./ast-evaluator.service";
import { DagValidatorService } from "./dag-validator.service";
import { resolveScope } from "./token-resolver.service";
import type {
  EvaluatorRow,
  EvaluatorRowCharge,
  EvaluatorSection,
  EvaluatorSectionCharge,
} from "./types";

const previewSchema = z.object({
  projectId: z.string().optional().default(""),
  templateId: z.string().optional(),
  draftSections: z.array(z.any()).optional(),
  draftConstants: z.record(z.string(), z.any()).optional(),
  overrides: z.record(z.string(), z.string()).optional(),
  externalOverrides: z.record(z.string(), z.string()).optional(),
  headerFieldValues: z.record(z.string(), z.string()).optional().default({}),
});

/**
 * POST /api/invoices/preview
 *
 * Resolves token scope, builds the V2 EvaluatorSection[] structure from the DB,
 * runs DAG validation + AST evaluation, and returns evaluated sections with
 * grandTotal, resolvedScope, and validationErrors.
 *
 * Zero database writes — read-only computation.
 */
export class EngineController {
  static async previewInvoice(c: Context) {
    try {
      const organizationId = c.get("organizationId") as string;
      if (!organizationId) {
        return c.json(
          {
            success: false,
            error: { code: "UNAUTHORIZED", message: "Organization context required" },
          },
          401,
        );
      }

      const body = await c.req.json();
      const parsed = previewSchema.safeParse(body);

      if (!parsed.success) {
        return c.json(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid payload",
              details: parsed.error.format(),
            },
          },
          400,
        );
      }

      const { projectId, templateId, headerFieldValues } = parsed.data;

      // ─────────────────────────────────────────────────────────────────────
      // 1. Resolve full token scope (FILE_*, GBL_*, EXP_*)
      // ─────────────────────────────────────────────────────────────────────
      const scope = await resolveScope({
        projectId: projectId ?? "",
        organizationId,
        templateId: templateId ?? "",
        db,
        headerFieldValues: headerFieldValues ?? {},
        externalOverrides: parsed.data.externalOverrides,
      });

      // ─────────────────────────────────────────────────────────────────────
      // 2. Build EvaluatorSection[] from the database (template-based path)
      //    Phase 2 will add: draft-based path (draftRows with overrides)
      // ─────────────────────────────────────────────────────────────────────
      let evaluatorSections: EvaluatorSection[] = [];
      const secIdToToken: SecIdToTokenMap = {};
      const tplIdToToken: TplIdToTokenMap = {};
      const idToToken: RowIdToTokenMap = {};
      const { draftSections, overrides, draftConstants } = parsed.data;

      if (draftSections && draftSections.length > 0) {
        // Use provided draft sections directly
        evaluatorSections = draftSections;

        // Build lookup maps from draftSections
        for (const sec of draftSections) {
          if (sec.id && sec.sectionToken) {
            secIdToToken[sec.id] = `SEC_${sec.sectionToken}`;
          }
          for (const row of sec.rows ?? []) {
            if (row.id && row.rowToken) {
              idToToken[row.id] = row.rowToken;
            }
          }
        }

        // Inject draft constants into scope as BigNumber-style strings and build tplIdToToken
        if (draftConstants) {
          for (const [key, val] of Object.entries(draftConstants)) {
            if (val?.id) {
              tplIdToToken[val.id] = key;
            }
            const raw = val?.value ?? val; // handle both object and primitive
            const numVal = parseFloat(String(raw));
            if (!isNaN(numVal)) {
              const fixed = numVal.toFixed(6);
              scope[key] = fixed;
              scope[`TPL_${key}`] = fixed;
            }
          }
        }

        // If templateId is also provided, load template constants / sections / rows as fallback maps
        if (templateId) {
          const [dbSections, dbRows, dbConstants] = await Promise.all([
            db
              .select({ id: templateSections.id, sectionToken: tokens.tokenKey })
              .from(templateSections)
              .innerJoin(tokens, eq(tokens.id, templateSections.id))
              .where(eq(templateSections.templateId, templateId)),
            db
              .select({ id: templateRows.id, rowToken: tokens.tokenKey })
              .from(templateRows)
              .innerJoin(tokens, eq(tokens.id, templateRows.id))
              .where(eq(templateRows.templateId, templateId)),
            db
              .select({ id: templateConstants.id, token: tokens.tokenKey })
              .from(templateConstants)
              .innerJoin(tokens, eq(tokens.id, templateConstants.id))
              .where(eq(templateConstants.templateId, templateId)),
          ]);
          for (const r of dbRows) {
            if (!idToToken[r.id]) idToToken[r.id] = r.rowToken;
          }
          for (const s of dbSections) {
            if (!secIdToToken[s.id]) secIdToToken[s.id] = `SEC_${s.sectionToken}`;
          }
          for (const c of dbConstants) {
            if (!tplIdToToken[c.id]) tplIdToToken[c.id] = c.token;
          }
        }

        // Apply overrides to rows
        if (overrides && Object.keys(overrides).length > 0) {
          for (const sec of evaluatorSections) {
            for (const row of sec.rows) {
              if (overrides[row.rowToken] !== undefined) {
                row.manualValue = overrides[row.rowToken];
              }
            }
          }
        }
      } else if (templateId) {
        // Fetch sections, rows, and section charges in parallel
        const [dbSections, dbRows, dbSectionCharges, dbConstants] = await Promise.all([
          db
            .select({
              id: templateSections.id,
              templateId: templateSections.templateId,
              sectionToken: tokens.tokenKey,
              label: tokens.label,
              description: tokens.description,
              sortOrder: tokens.sortOrder,
            })
            .from(templateSections)
            .innerJoin(tokens, eq(tokens.id, templateSections.id))
            .where(eq(templateSections.templateId, templateId))
            .orderBy(tokens.sortOrder),
          db
            .select({
              id: templateRows.id,
              templateId: templateRows.templateId,
              sectionId: templateRows.sectionId,
              valueType: templateRows.valueType,
              formula: templateRows.formula,
              initialValue: templateRows.initialValue,
              rowToken: tokens.tokenKey,
              label: tokens.label,
              description: tokens.description,
              sortOrder: tokens.sortOrder,
            })
            .from(templateRows)
            .innerJoin(tokens, eq(tokens.id, templateRows.id))
            .where(eq(templateRows.templateId, templateId))
            .orderBy(tokens.sortOrder),
          db
            .select({
              id: templateSectionCharges.id,
              templateId: templateSectionCharges.templateId,
              sectionId: templateSectionCharges.sectionId,
              formula: templateSectionCharges.formula,
              qualifier: templateSectionCharges.qualifier,
              tags: templateSectionCharges.tags,
              chargeToken: tokens.tokenKey,
              label: tokens.label,
              subDescription: tokens.description,
              sortOrder: tokens.sortOrder,
            })
            .from(templateSectionCharges)
            .innerJoin(tokens, eq(tokens.id, templateSectionCharges.id))
            .where(eq(templateSectionCharges.templateId, templateId))
            .orderBy(tokens.sortOrder),
          db
            .select({
              id: templateConstants.id,
              templateId: templateConstants.templateId,
              defaultValue: templateConstants.defaultValue,
              token: tokens.tokenKey,
              name: tokens.label,
            })
            .from(templateConstants)
            .innerJoin(tokens, eq(tokens.id, templateConstants.id))
            .where(eq(templateConstants.templateId, templateId)),
        ]);

        // templateRowCharges has no templateId column — fetch by rowId list
        const rowIds = dbRows.map((r) => r.id);
        const dbRowCharges =
          rowIds.length > 0
            ? await db
                .select({
                  id: templateRowCharges.id,
                  rowId: templateRowCharges.rowId,
                  formula: templateRowCharges.formula,
                  qualifier: templateRowCharges.qualifier,
                  tags: templateRowCharges.tags,
                  chargeToken: tokens.tokenKey,
                  label: tokens.label,
                  subDescription: tokens.description,
                  sortOrder: tokens.sortOrder,
                })
                .from(templateRowCharges)
                .innerJoin(tokens, eq(tokens.id, templateRowCharges.id))
                .where(inArray(templateRowCharges.rowId, rowIds))
                .orderBy(tokens.sortOrder)
            : [];

        // Build idToToken map: rowId -> rowToken (for decoding {{$row:uuid}} refs)
        for (const row of dbRows) {
          idToToken[row.id] = row.rowToken;
        }

        for (const sec of dbSections) {
          if (sec.sectionToken) secIdToToken[sec.id] = `SEC_${sec.sectionToken}`;
        }

        for (const c of dbConstants) {
          if (c.token) tplIdToToken[c.id] = c.token;

          // Publish to scope just like we do for draftConstants
          if (c.defaultValue && c.token) {
            const numVal = parseFloat(c.defaultValue);
            if (!isNaN(numVal)) {
              const fixed = numVal.toFixed(6);
              scope[c.token] = fixed;
              scope[`TPL_${c.token}`] = fixed;
            }
          }
        }

        // Assemble the nested V2 EvaluatorSection[] structure
        evaluatorSections = dbSections.map((sec): EvaluatorSection => {
          const sectionRows = dbRows.filter((r) => r.sectionId === sec.id);
          const sectionSectionCharges = dbSectionCharges.filter((sc) => sc.sectionId === sec.id);

          const rows: EvaluatorRow[] = sectionRows.map((r): EvaluatorRow => {
            const rowCharges = dbRowCharges.filter((c) => c.rowId === r.id);

            const charges: EvaluatorRowCharge[] = rowCharges.map(
              (c): EvaluatorRowCharge => ({
                id: c.id,
                chargeToken: c.chargeToken,
                label: c.label,
                subDescription: c.subDescription ?? undefined,
                qualifier: c.qualifier ?? undefined,
                tags: c.tags ?? undefined,
                formula: c.formula,
                sortOrder: c.sortOrder,
              }),
            );

            return {
              id: r.id,
              rowToken: r.rowToken,
              label: r.label,
              sectionId: r.sectionId,
              valueType: r.valueType, // 'normal' | 'formula'
              formula: r.formula ?? null, // stored as {{$row:uuid}}, decoded in evaluator
              initialValue: r.initialValue ?? null,
              manualValue: null, // no staff override on fresh template load
              charges,
              sortOrder: r.sortOrder,
            };
          });

          const sectionCharges: EvaluatorSectionCharge[] = sectionSectionCharges.map(
            (sc): EvaluatorSectionCharge => ({
              id: sc.id,
              chargeToken: sc.chargeToken,
              label: sc.label,
              subDescription: sc.subDescription ?? undefined,
              qualifier: sc.qualifier ?? undefined,
              tags: sc.tags ?? undefined,
              formula: sc.formula,
              sortOrder: sc.sortOrder,
            }),
          );

          return {
            id: sec.id,
            sectionToken: sec.sectionToken,
            label: sec.label ?? undefined,
            sortOrder: sec.sortOrder,
            rows,
            sectionCharges,
          };
        });
      }

      // ─────────────────────────────────────────────────────────────────────
      // 3. DAG validation (runs on V2 EvaluatorSection[])
      // ─────────────────────────────────────────────────────────────────────
      const externalTokens = new Set(Object.keys(scope));
      // We skip rebuilding idToToken if it was already built in the DB path.
      // But for draft path, we don't have secIdToToken or tplIdToToken because formulas are plaintext!
      const idToTokenForDag: RowIdToTokenMap = Object.keys(idToToken).length > 0 ? idToToken : {};
      if (Object.keys(idToTokenForDag).length === 0) {
        for (const sec of evaluatorSections) {
          for (const row of sec.rows) {
            idToTokenForDag[row.id] = row.rowToken;
          }
        }
      }

      const dagResult = DagValidatorService.validate(
        evaluatorSections,
        externalTokens,
        idToTokenForDag,
        secIdToToken,
        tplIdToToken,
      );

      // ─────────────────────────────────────────────────────────────────────
      // 4. AST evaluation (V2 signature)
      // ─────────────────────────────────────────────────────────────────────
      const allValidationErrors: Array<{ code: string; message: string; rowToken?: string }> = [
        ...dagResult.errors,
      ];

      let evaluatedSections: any[] = [];
      let grandTotal = "0.000000";

      if (evaluatorSections.length > 0) {
        const result = AstEvaluatorService.evaluate(
          evaluatorSections,
          scope,
          idToTokenForDag,
          secIdToToken,
          tplIdToToken,
          dagResult.topologicalOrder,
        );
        evaluatedSections = result.evaluatedSections;
        grandTotal = result.grandTotal;
        allValidationErrors.push(...result.errors);

        // ── Collect per-row notices (e.g. UNRESOLVED_REFERENCE from zero-filled tokens) ──
        // These are soft warnings that don't abort evaluation but should be surfaced to the UI.
        for (const sec of evaluatedSections) {
          for (const row of sec.rows ?? []) {
            if (row.notices && row.notices.length > 0) {
              for (const notice of row.notices) {
                allValidationErrors.push({
                  ...notice,
                  // Ensure rowToken is always set so the frontend can match to the correct row
                  rowToken: notice.rowToken ?? row.rowToken,
                });
              }
            }
          }
        }
      }

      // ─────────────────────────────────────────────────────────────────────
      // 5. Fetch header field definitions for the template (for display)
      // ─────────────────────────────────────────────────────────────────────
      let headerFieldDefs: any[] = [];
      if (templateId) {
        headerFieldDefs = await db
          .select({
            id: templateHeaderFields.id,
            templateId: templateHeaderFields.templateId,
            fieldType: templateHeaderFields.fieldType,
            columnPosition: templateHeaderFields.columnPosition,
            customFieldDefinitionId: templateHeaderFields.customFieldDefinitionId,
            systemFieldKey: templateHeaderFields.systemFieldKey,
            orgConfigKey: templateHeaderFields.orgConfigKey,
            defaultManualValue: templateHeaderFields.defaultManualValue,
            placeholder: templateHeaderFields.placeholder,
            tokenKey: tokens.tokenKey,
            label: tokens.label,
            sortOrder: tokens.sortOrder,
          })
          .from(templateHeaderFields)
          .innerJoin(tokens, eq(tokens.id, templateHeaderFields.id))
          .where(eq(templateHeaderFields.templateId, templateId))
          .orderBy(tokens.sortOrder);
      }

      // ─────────────────────────────────────────────────────────────────────
      // 6. Return response
      //    evaluatedSections already grouped by section from the evaluator
      // ─────────────────────────────────────────────────────────────────────
      return c.json({
        success: true,
        data: {
          sections: evaluatedSections,
          grandTotal,
          headerFieldDefs,
          resolvedScope: {
            schemaVersion: "2.0",
            resolvedAt: new Date().toISOString(),
            projectId,
            tokens: scope,
          },
          validationErrors: allValidationErrors,
        },
      });
    } catch (err: any) {
      console.error("[EngineController.previewInvoice]", err);
      return c.json(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to preview invoice",
            details: err.message,
          },
        },
        500,
      );
    }
  }
}
