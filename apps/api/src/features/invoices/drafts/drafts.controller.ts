import {
  db,
  decodeFormula,
  encodeFormula,
  invoiceDrafts,
  invoiceTemplates,
  templateHeaderFields,
  tokens,
} from "@starter/db";
import { and, eq, sql } from "drizzle-orm";
import { Context } from "hono";
import { z } from "zod";
import { toSnakeCase } from "../../invoice-templates/rows/services/row-index.service";
import { TokenService } from "../../tokens/token.service";
import { getProjectedDocumentNumber } from "../engine/document-number";
import { appendAuditEntry } from "./draft-audit";
import { buildDraftIndices } from "./draft-builder.controller";
import { DraftSeeder } from "./draft-seeder";

const draftSchema = z.object({
  id: z.string().optional(),
  projectId: z.string(),
  sourceTemplateId: z
    .string()
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
  draftHeaderValues: z.record(z.string(), z.string()).optional(),
  draftHeaderFields: z.array(z.any()).optional(),
  draftSections: z.array(z.any()).optional(),
  draftConstants: z.record(z.string(), z.any()).optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  action: z.string().optional(),
});

const saveAsTemplateSchema = z.object({
  name: z.string().min(1, "Template name is required"),
  description: z.string().optional(),
  documentPrefix: z.string().optional().default("INV"),
  numberingFormat: z.string().optional().default("{PREFIX}-{YYYY}-{SEQ:4}"),
});

export class DraftsController {
  static async listDrafts(c: Context) {
    try {
      const organizationId = c.get("organizationId");
      const projectId = c.req.query("projectId");

      const whereClause = projectId
        ? and(
            eq(invoiceDrafts.organizationId, organizationId),
            eq(invoiceDrafts.projectId, projectId),
          )
        : eq(invoiceDrafts.organizationId, organizationId);

      const drafts = await db.query.invoiceDrafts.findMany({
        where: whereClause,
        with: {
          project: {
            with: {
              client: true,
              statusRelation: true,
            },
          },
          user: true, // Attach creator user
        },
        orderBy: (d, { desc }) => [desc(d.lastAutoSavedAt)],
      });

      return c.json(drafts);
    } catch (err: any) {
      console.error("[DraftsController.listDrafts]", err);
      return c.json({ error: "Failed to fetch drafts" }, 500);
    }
  }

  static async getDraftById(c: Context) {
    try {
      const organizationId = c.get("organizationId");
      const id = c.req.param("id") as string;

      const draft = await db.query.invoiceDrafts.findFirst({
        where: and(eq(invoiceDrafts.organizationId, organizationId), eq(invoiceDrafts.id, id)),
        with: {
          project: {
            with: {
              client: true,
              statusRelation: true, // Resolve status UUID → { name, color, … }
            },
          },
          user: true, // Attach creator user
        },
      });

      if (!draft) return c.json({ error: "Draft not found" }, 404);

      let projectedDocumentNumber = "INV-0001";
      if (draft.sourceTemplateId) {
        try {
          projectedDocumentNumber = await getProjectedDocumentNumber({
            organizationId,
            sourceTemplateId: draft.sourceTemplateId,
            tx: db,
          });
        } catch {
          // fallback
        }
      }

      return c.json({ ...draft, projectedDocumentNumber });
    } catch (err: any) {
      console.error("[DraftsController.getDraftById]", err);
      return c.json({ error: "Failed to fetch draft" }, 500);
    }
  }

  static async createDraft(c: Context) {
    try {
      const organizationId = c.get("organizationId");
      const user = c.get("user") as any;
      const body = await c.req.json();
      const parsed = draftSchema.safeParse(body);

      if (!parsed.success) {
        return c.json({ error: "Invalid payload", details: parsed.error.format() }, 400);
      }

      const payload = parsed.data;
      const initialAudit = appendAuditEntry([], user, "Created draft");

      let draftName = payload.name;
      if (!draftName || draftName === "Draft") {
        try {
          const existingCount = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(invoiceDrafts)
            .where(eq(invoiceDrafts.organizationId, organizationId));
          const seq = (existingCount[0]?.count ?? 0) + 1;
          draftName = `DFT-${String(seq).padStart(4, "0")}`;
        } catch {
          draftName = "Draft #1";
        }
      }

      const [created] = await db
        .insert(invoiceDrafts)
        .values({
          id: crypto.randomUUID(),
          organizationId,
          projectId: payload.projectId,
          userId: user.id,
          sourceTemplateId: payload.sourceTemplateId,
          draftHeaderValues: payload.draftHeaderValues || {},
          draftHeaderFields: payload.draftHeaderFields || [],
          draftSections: payload.draftSections || [],
          draftConstants: payload.draftConstants || {},
          editHistory: initialAudit,
          name: draftName,
          description: payload.description,
          lastAutoSavedAt: new Date(),
        })
        .returning();

      return c.json(created);
    } catch (err: any) {
      console.error("[DraftsController.createDraft]", err);
      return c.json({ error: "Failed to create draft" }, 500);
    }
  }

  static async getDraft(c: Context) {
    try {
      const organizationId = c.get("organizationId");
      const projectId = c.req.query("projectId");
      const draftId = c.req.query("draftId");

      if (draftId) {
        const draft = await db.query.invoiceDrafts.findFirst({
          where: and(
            eq(invoiceDrafts.organizationId, organizationId),
            eq(invoiceDrafts.id, draftId),
          ),
          with: {
            user: true,
            project: {
              with: {
                client: true,
                statusRelation: true,
              },
            },
          },
        });
        return c.json(draft || null);
      }

      if (!projectId) {
        return c.json({ error: "projectId or draftId is required" }, 400);
      }

      // Return the most recently updated draft for this project
      const draft = await db.query.invoiceDrafts.findFirst({
        where: and(
          eq(invoiceDrafts.organizationId, organizationId),
          eq(invoiceDrafts.projectId, projectId),
        ),
        with: {
          user: true,
          project: {
            with: {
              client: true,
              statusRelation: true,
            },
          },
        },
        orderBy: (d, { desc }) => [desc(d.lastAutoSavedAt)],
      });

      return c.json(draft || null);
    } catch (err: any) {
      console.error("[DraftsController.getDraft]", err);
      return c.json({ error: "Failed to fetch draft" }, 500);
    }
  }

  static async upsertDraft(c: Context) {
    try {
      const organizationId = c.get("organizationId");
      const user = c.get("user") as any;
      const body = await c.req.json();
      const parsed = draftSchema.safeParse(body);

      if (!parsed.success) {
        return c.json({ error: "Invalid payload", details: parsed.error.format() }, 400);
      }

      const payload = parsed.data;

      // 1. Look up target draft if explicit id provided
      let existing = null;
      if (payload.id) {
        existing = await db.query.invoiceDrafts.findFirst({
          where: and(
            eq(invoiceDrafts.organizationId, organizationId),
            eq(invoiceDrafts.id, payload.id),
          ),
        });
      }

      let { draftSections, draftConstants, draftHeaderValues, draftHeaderFields } = payload;

      // 2. If generating a new draft from template (no existing draft targeted)
      if (!existing && (!draftSections || draftSections.length === 0)) {
        const templateId = payload.sourceTemplateId;
        if (templateId) {
          const seeded = await DraftSeeder.hydrateFromTemplate(
            templateId,
            payload.projectId,
            organizationId,
          );
          draftSections = seeded.draftSections;
          draftConstants = seeded.draftConstants;
          draftHeaderValues = { ...seeded.draftHeaderValues, ...(payload.draftHeaderValues || {}) };
          draftHeaderFields = seeded.draftHeaderFields;
        }
      }

      if (existing) {
        let auditAction = payload.action;
        if (!auditAction) {
          if (payload.name && payload.name !== existing.name) {
            auditAction = `Renamed draft to "${payload.name}"`;
          } else if (
            payload.draftHeaderValues &&
            payload.draftHeaderValues !== existing.draftHeaderValues
          ) {
            auditAction = "Updated file header fields";
          } else if (payload.draftSections && payload.draftSections !== existing.draftSections) {
            auditAction = "Updated sections and line items";
          } else if (payload.draftConstants && payload.draftConstants !== existing.draftConstants) {
            auditAction = "Updated draft constants";
          } else {
            auditAction = "Updated draft";
          }
        }

        const updatedAudit = appendAuditEntry(existing.editHistory, user, auditAction);

        const [updated] = await db
          .update(invoiceDrafts)
          .set({
            ...(payload.sourceTemplateId !== undefined
              ? { sourceTemplateId: payload.sourceTemplateId }
              : {}),
            ...(payload.draftHeaderValues !== undefined
              ? { draftHeaderValues: payload.draftHeaderValues }
              : {}),
            ...(payload.draftHeaderFields !== undefined
              ? { draftHeaderFields: payload.draftHeaderFields }
              : {}),
            ...(payload.draftSections !== undefined
              ? { draftSections: payload.draftSections }
              : {}),
            ...(payload.draftConstants !== undefined
              ? { draftConstants: payload.draftConstants }
              : {}),
            ...(payload.name !== undefined ? { name: payload.name } : {}),
            ...(payload.description !== undefined ? { description: payload.description } : {}),
            editHistory: updatedAudit,
            lastAutoSavedAt: new Date(),
          })
          .where(eq(invoiceDrafts.id, existing.id))
          .returning();
        return c.json(updated);
      } else {
        const initialAudit = appendAuditEntry([], user, "Created draft");

        let draftName = payload.name;
        if (!draftName || draftName === "Draft") {
          try {
            const existingCount = await db
              .select({ count: sql<number>`count(*)::int` })
              .from(invoiceDrafts)
              .where(eq(invoiceDrafts.organizationId, organizationId));
            const seq = (existingCount[0]?.count ?? 0) + 1;
            draftName = `DFT-${String(seq).padStart(4, "0")}`;
          } catch {
            draftName = "Draft #1";
          }
        }

        const [created] = await db
          .insert(invoiceDrafts)
          .values({
            id: crypto.randomUUID(),
            organizationId,
            projectId: payload.projectId,
            userId: user.id,
            sourceTemplateId: payload.sourceTemplateId,
            draftHeaderValues: draftHeaderValues || {},
            draftHeaderFields: draftHeaderFields || [],
            draftSections: draftSections || [],
            draftConstants: draftConstants || {},
            editHistory: initialAudit,
            name: draftName,
            description: payload.description,
            lastAutoSavedAt: new Date(),
          })
          .returning();
        return c.json(created);
      }
    } catch (err: any) {
      console.error("[DraftsController.upsertDraft]", err);
      // Item 1.2: Sanitize error response, no stack trace leak
      return c.json(
        { error: "Failed to save draft", details: err?.message || "Unknown error" },
        500,
      );
    }
  }

  static async deleteDraft(c: Context): Promise<Response> {
    try {
      const organizationId = c.get("organizationId");
      const id = c.req.param("id");

      await db
        .delete(invoiceDrafts)
        .where(and(eq(invoiceDrafts.id, id!), eq(invoiceDrafts.organizationId, organizationId!)));

      return new Response(null, { status: 204 });
    } catch (err: any) {
      console.error("[DraftsController.deleteDraft]", err);
      return c.json({ error: "Failed to delete draft" }, 500);
    }
  }

  static async saveAsTemplate(c: Context) {
    try {
      const organizationId = c.get("organizationId");
      const user = c.get("user") as any;
      const id = c.req.param("id") as string;
      const body = await c.req.json();
      const parsed = saveAsTemplateSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ error: "Invalid payload", details: parsed.error.format() }, 400);
      }

      const draft = await db.query.invoiceDrafts.findFirst({
        where: and(eq(invoiceDrafts.organizationId, organizationId), eq(invoiceDrafts.id, id)),
      });

      if (!draft) return c.json({ error: "Draft not found" }, 404);

      const newTemplateId = crypto.randomUUID();
      const { name, description, documentPrefix, numberingFormat } = parsed.data;

      // 1. Check source template for optional rows to inherit
      let optionalRowsToSeed: any[] = [];
      if (draft.sourceTemplateId) {
        try {
          const [sourceTpl] = await db
            .select({ optionalRows: invoiceTemplates.optionalRows })
            .from(invoiceTemplates)
            .where(eq(invoiceTemplates.id, draft.sourceTemplateId))
            .limit(1);
          if (Array.isArray(sourceTpl?.optionalRows)) {
            optionalRowsToSeed = sourceTpl.optionalRows;
          }
        } catch (e) {
          console.error("[saveAsTemplate] Failed to fetch source optional rows", e);
        }
      }

      // 1. Create invoice template
      const [template] = await db
        .insert(invoiceTemplates)
        .values({
          id: newTemplateId,
          organizationId,
          name,
          description: description || draft.description,
          documentPrefix: documentPrefix || "INV",
          numberingFormat: numberingFormat || "{PREFIX}-{YYYY}-{SEQ:4}",
          optionalRows: optionalRowsToSeed,
          createdByUserId: user.id,
        })
        .returning();

      // 2. Migrate Header Fields (if draft has draftHeaderFields)
      let headerMigrated = false;
      if (Array.isArray(draft.draftHeaderFields) && draft.draftHeaderFields.length > 0) {
        for (const field of draft.draftHeaderFields) {
          const tokenKey = toSnakeCase(field.tokenKey || field.fileFieldKey || field.label);
          await TokenService.createFileFieldToken({
            id: crypto.randomUUID(),
            templateId: newTemplateId,
            fieldType: (field.fieldType as any) || "file_field",
            label: field.label,
            tokenKey,
            systemFieldKey:
              field.systemFieldKey || (field.customFieldDefinitionId ? null : field.fileFieldKey),
            customFieldDefinitionId: field.customFieldDefinitionId ?? null,
            isInjectable: field.isFormulaInjectable ?? false,
            organizationId,
            sortOrder: field.sortOrder ?? 0,
          });
        }
        headerMigrated = true;
      } else if (draft.sourceTemplateId) {
        const sourceHeaders = await db
          .select({
            header: templateHeaderFields,
            token: tokens,
          })
          .from(templateHeaderFields)
          .innerJoin(tokens, eq(tokens.id, templateHeaderFields.id))
          .where(eq(templateHeaderFields.templateId, draft.sourceTemplateId));
        if (sourceHeaders.length > 0) {
          for (const { header: h, token: tok } of sourceHeaders) {
            await TokenService.createFileFieldToken({
              id: crypto.randomUUID(),
              templateId: newTemplateId,
              fieldType: h.fieldType as any,
              label: tok.label,
              tokenKey: tok.tokenKey,
              description: tok.description,
              columnPosition: h.columnPosition,
              customFieldDefinitionId: h.customFieldDefinitionId,
              systemFieldKey: h.systemFieldKey,
              orgConfigKey: h.orgConfigKey,
              defaultManualValue: h.defaultManualValue,
              placeholder: h.placeholder,
              isInjectable: tok.isInjectable ?? false,
              organizationId,
              sortOrder: tok.sortOrder ?? 0,
            });
          }
          headerMigrated = true;
        }
      }

      if (!headerMigrated) {
        // Fallback: Seed standard system fields and custom fields
        const systemFields = [
          {
            fieldType: "file_field" as const,
            fileFieldKey: "name",
            label: "Name",
            sortOrder: 0,
            isFormulaInjectable: false,
          },
          {
            fieldType: "file_field" as const,
            fileFieldKey: "clientId",
            label: "Client",
            sortOrder: 1,
            isFormulaInjectable: false,
          },
          {
            fieldType: "file_field" as const,
            fileFieldKey: "status",
            label: "Status",
            sortOrder: 2,
            isFormulaInjectable: false,
          },
        ];
        const { customFieldDefinitions } = await import("@starter/db");
        const projectFields = await db
          .select()
          .from(customFieldDefinitions)
          .where(
            and(
              eq(customFieldDefinitions.organizationId, organizationId),
              eq(customFieldDefinitions.entityType, "project"),
            ),
          );
        const customFieldsToSeed = projectFields.map((field: any, idx: number) => ({
          fieldType: "file_field" as const,
          fileFieldKey: field.fieldKey,
          customFieldDefinitionId: field.id,
          label: field.fieldName,
          sortOrder: systemFields.length + idx,
          isFormulaInjectable: field.fieldType === "number",
        }));
        for (const f of [...systemFields, ...customFieldsToSeed]) {
          const tokenKey = toSnakeCase(f.fileFieldKey || f.label);
          await TokenService.createFileFieldToken({
            id: crypto.randomUUID(),
            templateId: newTemplateId,
            fieldType: f.fieldType,
            label: f.label,
            tokenKey,
            systemFieldKey: (f as any).customFieldDefinitionId ? null : f.fileFieldKey,
            customFieldDefinitionId: (f as any).customFieldDefinitionId ?? null,
            isInjectable: f.isFormulaInjectable,
            organizationId,
            sortOrder: f.sortOrder,
          });
        }
      }

      // 3. Migrate Template Constants
      const constants = (draft.draftConstants as Record<string, any>) || {};
      const newTplTokenToId: Record<string, string> = {};
      const oldDraftIdToNewId: Record<string, string> = {};

      let constSort = 0;
      for (const [key, constant] of Object.entries(constants)) {
        const displayVal = constant?.value ?? constant;
        const newConstId = crypto.randomUUID();
        if (constant?.id) oldDraftIdToNewId[constant.id] = newConstId;
        oldDraftIdToNewId[key] = newConstId;
        oldDraftIdToNewId[`TPL_${key}`] = newConstId;
        newTplTokenToId[key] = newConstId;
        newTplTokenToId[`TPL_${key}`] = newConstId;

        await TokenService.createTemplateConstant({
          id: newConstId,
          templateId: newTemplateId,
          token: key,
          name: constant?.description || constant?.name || key,
          defaultValue: displayVal != null ? String(displayVal) : null,
          valueType: constant?.valueType || "number",
          organizationId,
          sortOrder: constSort++,
        });
      }

      // 4. Migrate Sections, Rows, and Charges with Formula Remapping
      const sections: any[] = (draft.draftSections as any[]) || [];
      const {
        idToToken: draftIdToToken,
        secIdToToken: draftSecIdToToken,
        tplIdToToken: draftTplIdToToken,
      } = await buildDraftIndices(draft, organizationId);

      const newRowTokenToId: Record<string, string> = {};
      const newSecTokenToId: Record<string, string> = {};

      for (let sIdx = 0; sIdx < sections.length; sIdx++) {
        const section = sections[sIdx];
        const newSectionId = crypto.randomUUID();
        if (section.id) oldDraftIdToNewId[section.id] = newSectionId;
        const secToken = section.sectionToken || `SECTION_${sIdx + 1}`;
        newSecTokenToId[secToken] = newSectionId;
        newSecTokenToId[`SEC_${secToken}`] = newSectionId;

        for (const row of section.rows || []) {
          const newRowId = crypto.randomUUID();
          if (row.id) oldDraftIdToNewId[row.id] = newRowId;
          if (row.rowToken) newRowTokenToId[row.rowToken] = newRowId;

          for (const charge of row.charges || []) {
            const newChargeId = crypto.randomUUID();
            if (charge.id) oldDraftIdToNewId[charge.id] = newChargeId;
            if (charge.chargeToken) newRowTokenToId[charge.chargeToken] = newChargeId;
          }
        }

        for (const secCharge of section.charges || section.sectionCharges || []) {
          const newSecChargeId = crypto.randomUUID();
          if (secCharge.id) oldDraftIdToNewId[secCharge.id] = newSecChargeId;
          if (secCharge.chargeToken) newRowTokenToId[secCharge.chargeToken] = newSecChargeId;
        }
      }

      function remapFormula(formula: string | null | undefined): string | null {
        if (!formula) return formula ?? null;

        // 1. Decode to plain human-readable tokens using draft dictionary
        const decoded =
          decodeFormula(formula, draftIdToToken, draftSecIdToToken, draftTplIdToToken) ?? formula;

        // 2. Re-encode using new template token map
        let encoded = encodeFormula(decoded, newRowTokenToId, newSecTokenToId, newTplTokenToId);

        // 3. Fallback: replace any remaining UUID tags
        if (!encoded || encoded === decoded) {
          encoded = formula
            .replace(/\{\{\$tok:([^}]+)\}\}/g, (_, id) => `{{$tok:${oldDraftIdToNewId[id] ?? id}}}`)
            .replace(/\{\{\$row:([^}]+)\}\}/g, (_, id) => `{{$tok:${oldDraftIdToNewId[id] ?? id}}}`)
            .replace(/\{\{\$sec:([^}]+)\}\}/g, (_, id) => `{{$tok:${oldDraftIdToNewId[id] ?? id}}}`)
            .replace(
              /\{\{\$tpl:([^}]+)\}\}/g,
              (_, id) => `{{$tok:${oldDraftIdToNewId[id] ?? id}}}`,
            );
        }

        return encoded;
      }

      for (let sIdx = 0; sIdx < sections.length; sIdx++) {
        const section = sections[sIdx];
        const newSectionId = oldDraftIdToNewId[section.id] || crypto.randomUUID();
        const secToken = section.sectionToken || `SECTION_${sIdx + 1}`;

        await TokenService.createSectionToken({
          id: newSectionId,
          templateId: newTemplateId,
          sectionToken: secToken,
          label: section.label || String(sIdx + 1),
          description: section.description || null,
          organizationId,
          sortOrder: section.sortOrder ?? sIdx,
        });

        const rows = section.rows || [];
        for (let rIdx = 0; rIdx < rows.length; rIdx++) {
          const row = rows[rIdx];
          const newRowId = oldDraftIdToNewId[row.id] || crypto.randomUUID();

          await TokenService.createRowToken({
            id: newRowId,
            templateId: newTemplateId,
            sectionId: newSectionId,
            rowToken: row.rowToken,
            label: row.label || row.rowToken,
            description: row.description || null,
            valueType: row.valueType || "normal",
            formula: remapFormula(row.formula),
            initialValue: row.initialValue != null ? String(row.initialValue) : null,
            organizationId,
            sortOrder: row.sortOrder ?? rIdx,
          });

          const charges = row.charges || [];
          for (let cIdx = 0; cIdx < charges.length; cIdx++) {
            const charge = charges[cIdx];
            const newChargeId = oldDraftIdToNewId[charge.id] || crypto.randomUUID();
            await TokenService.createRowChargeToken({
              id: newChargeId,
              rowId: newRowId,
              templateId: newTemplateId,
              chargeToken: charge.chargeToken,
              label: charge.label || charge.chargeToken,
              subDescription: charge.subDescription || null,
              qualifier: charge.qualifier || null,
              tags: charge.tags || null,
              formula: remapFormula(charge.formula) || "",
              organizationId,
              sortOrder: charge.sortOrder ?? cIdx,
            });
          }
        }

        const secCharges = section.charges || section.sectionCharges || [];
        for (let scIdx = 0; scIdx < secCharges.length; scIdx++) {
          const charge = secCharges[scIdx];
          const newSecChargeId = oldDraftIdToNewId[charge.id] || crypto.randomUUID();
          await TokenService.createSectionChargeToken({
            id: newSecChargeId,
            sectionId: newSectionId,
            templateId: newTemplateId,
            chargeToken: charge.chargeToken,
            label: charge.label || charge.chargeToken,
            subDescription: charge.subDescription || null,
            qualifier: charge.qualifier || null,
            tags: charge.tags || null,
            formula: remapFormula(charge.formula) || "",
            organizationId,
            sortOrder: charge.sortOrder ?? scIdx,
          });
        }
      }

      return c.json(template, 201);
    } catch (err: any) {
      console.error("[DraftsController.saveAsTemplate]", err);
      return c.json({ error: "Failed to save draft as template", message: err.message }, 500);
    }
  }

  static async getTemplateSyncStatus(c: Context) {
    try {
      const id = c.req.param("id") as string;
      const organizationId = c.get("organizationId");
      if (!organizationId) return c.json({ error: "Unauthorized" }, 401);

      const [draft] = await db
        .select()
        .from(invoiceDrafts)
        .where(and(eq(invoiceDrafts.id, id), eq(invoiceDrafts.organizationId, organizationId)))
        .limit(1);

      if (!draft) return c.json({ error: "Draft not found" }, 404);

      if (!draft.sourceTemplateId) {
        return c.json({
          hasTemplateDrift: false,
          message: "Draft is not linked to a master template",
        });
      }

      const [template] = await db
        .select()
        .from(invoiceTemplates)
        .where(
          and(
            eq(invoiceTemplates.id, draft.sourceTemplateId),
            eq(invoiceTemplates.organizationId, organizationId),
          ),
        )
        .limit(1);

      if (!template) {
        return c.json({
          hasTemplateDrift: false,
          message: "Linked master template no longer exists",
        });
      }

      const draftVersion = draft.sourceTemplateVersion ?? 1;
      const templateVersion = template.version ?? 1;
      const templateUpdatedAt = template.updatedAt;
      const draftCreatedAt = draft.createdAt;

      const isVersionDrifted = templateVersion > draftVersion;
      const isTimeDrifted = templateUpdatedAt > draftCreatedAt;
      const candidateDrift = isVersionDrifted || isTimeDrifted;

      const formulaUpdates: string[] = [];
      const addedRows: string[] = [];
      const addedSections: string[] = [];

      if (candidateDrift) {
        try {
          const hydrated = await DraftSeeder.hydrateFromTemplate(
            template.id,
            draft.projectId,
            organizationId,
          );

          const draftSections = (draft.draftSections as any[]) || [];
          const draftRowTokens = new Set<string>();
          const draftRowFormulaMap = new Map<string, string>();
          const draftSectionTokens = new Set<string>();

          for (const s of draftSections) {
            if (s.sectionToken) draftSectionTokens.add(s.sectionToken);
            for (const r of s.rows || []) {
              if (r.rowToken) {
                draftRowTokens.add(r.rowToken);
                draftRowFormulaMap.set(r.rowToken, r.formula || "");
              }
            }
          }

          for (const s of hydrated.draftSections) {
            if (!draftSectionTokens.has(s.sectionToken)) {
              addedSections.push(s.label || s.sectionToken);
            }
            for (const r of s.rows || []) {
              if (!draftRowTokens.has(r.rowToken)) {
                addedRows.push(r.label || r.rowToken);
              } else {
                const existingFormula = draftRowFormulaMap.get(r.rowToken) || "";
                if (r.formula && r.formula !== existingFormula) {
                  formulaUpdates.push(r.label || r.rowToken);
                }
              }
            }
          }
        } catch (diffErr) {
          console.error("[getTemplateSyncStatus] Failed to compute detailed diff", diffErr);
        }
      }

      const totalStructuralChanges =
        formulaUpdates.length + addedRows.length + addedSections.length;
      // Real drift requires higher template version OR actual detected structural/formula changes
      const hasTemplateDrift = isVersionDrifted || totalStructuralChanges > 0;

      return c.json({
        hasTemplateDrift,
        templateId: template.id,
        templateName: template.name,
        templateVersion,
        draftTemplateVersion: draftVersion,
        templateUpdatedAt,
        changes: {
          formulaUpdates,
          addedRows,
          addedSections,
        },
      });
    } catch (err: any) {
      console.error("[DraftsController.getTemplateSyncStatus]", err);
      return c.json(
        { error: "Failed to retrieve template sync status", message: err.message },
        500,
      );
    }
  }

  static async syncWithTemplate(c: Context) {
    try {
      const id = c.req.param("id") as string;
      const organizationId = c.get("organizationId");
      const user = c.get("user");
      if (!organizationId || !user) return c.json({ error: "Unauthorized" }, 401);

      const [draft] = await db
        .select()
        .from(invoiceDrafts)
        .where(and(eq(invoiceDrafts.id, id), eq(invoiceDrafts.organizationId, organizationId)))
        .limit(1);

      if (!draft) return c.json({ error: "Draft not found" }, 404);
      if (!draft.sourceTemplateId)
        return c.json({ error: "Draft is not linked to a master template" }, 400);

      const [template] = await db
        .select()
        .from(invoiceTemplates)
        .where(
          and(
            eq(invoiceTemplates.id, draft.sourceTemplateId),
            eq(invoiceTemplates.organizationId, organizationId),
          ),
        )
        .limit(1);

      if (!template) return c.json({ error: "Master template not found" }, 404);

      // 1. Hydrate fresh structure from the master template
      const hydrated = await DraftSeeder.hydrateFromTemplate(
        template.id,
        draft.projectId,
        organizationId,
      );

      const currentSections: any[] = (draft.draftSections as any[]) || [];
      const mergedSections: any[] = [];

      // 2. Perform 3-way non-destructive merge:
      for (const tplSec of hydrated.draftSections) {
        const existingSec = currentSections.find(
          (s: any) => s.sectionToken === tplSec.sectionToken || s.id === tplSec.id,
        );

        if (!existingSec) {
          mergedSections.push(tplSec);
          continue;
        }

        const mergedRows: any[] = [];
        const existingRows: any[] = existingSec.rows || [];

        for (const tplRow of tplSec.rows || []) {
          const existingRow = existingRows.find((r: any) => r.rowToken === tplRow.rowToken);

          if (!existingRow) {
            mergedRows.push(tplRow);
          } else {
            mergedRows.push({
              ...tplRow,
              id: existingRow.id,
              initialValue: existingRow.initialValue ?? tplRow.initialValue,
              manualValue: existingRow.manualValue ?? null,
              label: existingRow.label || tplRow.label,
              description: existingRow.description || tplRow.description,
              charges: (tplRow.charges || []).map((tc: any) => {
                const existingCharge = (existingRow.charges || []).find(
                  (c: any) => c.chargeToken === tc.chargeToken,
                );
                return existingCharge
                  ? { ...tc, id: existingCharge.id, label: existingCharge.label || tc.label }
                  : tc;
              }),
            });
          }
        }

        for (const er of existingRows) {
          if (er.isOptional || !tplSec.rows.some((tr: any) => tr.rowToken === er.rowToken)) {
            mergedRows.push(er);
          }
        }

        const mergedSecCharges = (tplSec.sectionCharges || []).map((sc: any) => {
          const existingSc = (existingSec.sectionCharges || []).find(
            (c: any) => c.chargeToken === sc.chargeToken,
          );
          return existingSc ? { ...sc, id: existingSc.id } : sc;
        });

        mergedSections.push({
          ...tplSec,
          id: existingSec.id,
          label: existingSec.label || tplSec.label,
          description: existingSec.description || tplSec.description,
          rows: mergedRows,
          sectionCharges: mergedSecCharges,
        });
      }

      for (const cs of currentSections) {
        if (!hydrated.draftSections.some((ts: any) => ts.sectionToken === cs.sectionToken)) {
          mergedSections.push(cs);
        }
      }

      const mergedConstants = {
        ...(hydrated.draftConstants || {}),
        ...(draft.draftConstants || {}),
      };

      const mergedHeaderFields =
        Array.isArray(draft.draftHeaderFields) && draft.draftHeaderFields.length > 0
          ? draft.draftHeaderFields
          : hydrated.draftHeaderFields;

      const syncAction = `Synced draft with master template "${template.name}" (v${template.version})`;
      const updatedAudit = appendAuditEntry(draft.editHistory || [], user, syncAction);

      const [updated] = await db
        .update(invoiceDrafts)
        .set({
          draftSections: mergedSections,
          draftConstants: mergedConstants,
          draftHeaderFields: mergedHeaderFields,
          sourceTemplateVersion: template.version,
          editHistory: updatedAudit,
          lastAutoSavedAt: new Date(),
        })
        .where(eq(invoiceDrafts.id, draft.id))
        .returning();

      return c.json({
        success: true,
        message: `Successfully synchronized with master template v${template.version}`,
        draft: updated,
      });
    } catch (err: any) {
      console.error("[DraftsController.syncWithTemplate]", err);
      return c.json({ error: "Failed to sync draft with template", message: err.message }, 500);
    }
  }

  /**
   * Resets a draft completely back to its initial state from the master template and file/project data.
   */
  static async resetToTemplateInitial(c: Context) {
    const draftId = c.req.param("id");
    const organizationId = c.get("organizationId");
    const user = c.get("user");

    if (!draftId) return c.json({ error: "Draft ID required" }, 400);

    try {
      const [draft] = await db
        .select()
        .from(invoiceDrafts)
        .where(and(eq(invoiceDrafts.id, draftId), eq(invoiceDrafts.organizationId, organizationId)))
        .limit(1);

      if (!draft) return c.json({ error: "Draft not found" }, 404);
      if (!draft.sourceTemplateId) {
        return c.json({ error: "This draft is not linked to any source template." }, 400);
      }

      const [template] = await db
        .select()
        .from(invoiceTemplates)
        .where(
          and(
            eq(invoiceTemplates.id, draft.sourceTemplateId),
            eq(invoiceTemplates.organizationId, organizationId),
          ),
        )
        .limit(1);

      if (!template) return c.json({ error: "Master template not found" }, 404);

      // Hydrate fresh initial state from the master template and project
      const hydrated = await DraftSeeder.hydrateFromTemplate(
        template.id,
        draft.projectId,
        organizationId,
      );

      const resetAction = `Reset draft to initial state from template "${template.name}" (v${template.version})`;
      const updatedAudit = appendAuditEntry(draft.editHistory || [], user, resetAction);

      const [updated] = await db
        .update(invoiceDrafts)
        .set({
          draftSections: hydrated.draftSections,
          draftConstants: hydrated.draftConstants,
          draftHeaderValues: hydrated.draftHeaderValues,
          draftHeaderFields: hydrated.draftHeaderFields,
          sourceTemplateVersion: template.version,
          editHistory: updatedAudit,
          lastAutoSavedAt: new Date(),
        })
        .where(eq(invoiceDrafts.id, draft.id))
        .returning();

      return c.json({
        success: true,
        message: "Successfully reset draft to initial template state",
        draft: updated,
      });
    } catch (err: any) {
      console.error("[DraftsController.resetToTemplateInitial]", err);
      return c.json({ error: "Failed to reset draft", message: err.message }, 500);
    }
  }
}
