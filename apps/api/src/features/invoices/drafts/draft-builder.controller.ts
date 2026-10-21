import {
  customFieldDefinitions,
  db,
  decodeFormula,
  encodeFormula,
  invoiceDrafts,
  invoiceTemplates,
  TemplateOptionalRow,
  templateHeaderFields,
  tokens,
} from "@starter/db";
import { and, asc, eq } from "drizzle-orm";
import { Context } from "hono";
import { v4 as uuidv4 } from "uuid";
import { TokenService } from "../../tokens/token.service";
import { validateDraftDag } from "../engine/engine-utils";
import { appendAuditEntry } from "./draft-audit";

async function getDraft(c: Context) {
  const draftId = c.req.param("id") as string;
  const organizationId = c.get("organizationId");
  const [draft] = await db
    .select()
    .from(invoiceDrafts)
    .where(and(eq(invoiceDrafts.id, draftId), eq(invoiceDrafts.organizationId, organizationId)))
    .limit(1);
  return draft;
}

async function updateDraft(
  draftId: string,
  updates: any,
  c?: Context,
  action: string = "Edited draft",
) {
  let updatedHistory;
  if (c) {
    const user = c.get("user") as any;
    const organizationId = c.get("organizationId");
    if (user && organizationId) {
      const current = await db.query.invoiceDrafts.findFirst({
        where: and(eq(invoiceDrafts.id, draftId), eq(invoiceDrafts.organizationId, organizationId)),
        columns: { editHistory: true },
      });
      updatedHistory = appendAuditEntry(current?.editHistory, user, action);
    }
  }

  const [updated] = await db
    .update(invoiceDrafts)
    .set({
      ...updates,
      ...(updatedHistory ? { editHistory: updatedHistory } : {}),
      lastAutoSavedAt: new Date(),
    })
    .where(eq(invoiceDrafts.id, draftId))
    .returning();
  return updated;
}

function toSnakeCase(label: string): string {
  return label
    .toUpperCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/, "");
}

export async function buildDraftIndices(draft: any, organizationId?: string) {
  const sections: any[] = draft.draftSections || [];
  const constants: any = draft.draftConstants || {};

  const tokenToId: Record<string, string> = {};
  const idToToken: Record<string, string> = {};
  const secTokenToId: Record<string, string> = {};
  const secIdToToken: Record<string, string> = {};
  const tplTokenToId: Record<string, string> = {};
  const tplIdToToken: Record<string, string> = {};

  if (draft?.sourceTemplateId) {
    try {
      const orgId = organizationId || draft.organizationId || "";
      const tplMaps = await TokenService.getTemplateTokenMaps(draft.sourceTemplateId, orgId);
      Object.assign(tokenToId, tplMaps.tokenMap);
      Object.assign(idToToken, tplMaps.idToToken);
    } catch (e) {
      console.error("[buildDraftIndices] Failed to load template token maps", e);
    }
  }

  for (const sec of sections) {
    if (sec.id && sec.sectionToken) {
      secTokenToId[`SEC_${sec.sectionToken}`] = sec.id;
      secIdToToken[sec.id] = `SEC_${sec.sectionToken}`;
    }
    for (const r of sec.rows ?? []) {
      if (r.id && r.rowToken) {
        tokenToId[r.rowToken] = r.id;
        idToToken[r.id] = r.rowToken;
      }
    }
  }

  for (const [key, val] of Object.entries(constants as Record<string, any>)) {
    if (val?.id) {
      tplTokenToId[key] = val.id;
      tplTokenToId[`TPL_${key}`] = val.id;
      tplIdToToken[val.id] = key;
    }
  }

  return { tokenToId, idToToken, secTokenToId, secIdToToken, tplTokenToId, tplIdToToken };
}

export class DraftBuilderController {
  static async getSections(c: Context) {
    const draft = await getDraft(c);
    if (!draft) return c.json({ error: "Draft not found" }, 404);
    const { idToToken, secIdToToken, tplIdToToken } = await buildDraftIndices(
      draft,
      c.get("organizationId"),
    );

    const decodedSections = (draft.draftSections || []).map((sec: any) => ({
      ...sec,
      rows: (sec.rows || []).map((r: any) => ({
        ...r,
        formula: decodeFormula(r.formula, idToToken, secIdToToken, tplIdToToken),
        charges: (r.charges || []).map((ch: any) => ({
          ...ch,
          formula: decodeFormula(ch.formula, idToToken, secIdToToken, tplIdToToken) ?? ch.formula,
        })),
      })),
      sectionCharges: (sec.sectionCharges || []).map((sc: any) => ({
        ...sc,
        formula: decodeFormula(sc.formula, idToToken, secIdToToken, tplIdToToken) ?? sc.formula,
      })),
    }));

    return c.json(decodedSections);
  }

  static async getConstants(c: Context) {
    const draft = await getDraft(c);
    if (!draft) return c.json({ error: "Draft not found" }, 404);
    return c.json(draft.draftConstants || {});
  }

  // ── CONSTANTS ─────────────────────────────────────────────────────────────

  static async createConstant(c: Context) {
    const draft = await getDraft(c);
    if (!draft) return c.json({ error: "Draft not found" }, 404);
    const body = await c.req.json();

    const constants = draft.draftConstants || {};
    if (constants[body.key]) {
      return c.json({ error: "Token key already exists in draft" }, 400);
    }

    constants[body.key] = {
      id: crypto.randomUUID(),
      key: body.key,
      value: body.value,
      description: body.description,
    };

    await updateDraft(
      draft.id,
      {
        draftConstants: constants,
      },
      c,
      "Created template constant",
    );
    return c.json(constants[body.key]);
  }

  static async updateConstant(c: Context) {
    const draft = await getDraft(c);
    if (!draft) return c.json({ error: "Draft not found" }, 404);
    const constantId = c.req.param("constantId");
    const body = await c.req.json();

    const constants = draft.draftConstants || {};
    const key = Object.keys(constants).find((k) => constants[k].id === constantId);
    if (!key) return c.json({ error: "Constant not found" }, 404);

    constants[key] = { ...constants[key], ...body };
    await updateDraft(
      draft.id,
      {
        draftConstants: constants,
      },
      c,
      "Updated template constant",
    );
    return c.json(constants[key]);
  }

  static async deleteConstant(c: Context) {
    const draft = await getDraft(c);
    if (!draft) return c.json({ error: "Draft not found" }, 404);
    const constantId = c.req.param("constantId");

    const constants = draft.draftConstants || {};
    const key = Object.keys(constants).find((k) => constants[k].id === constantId);
    if (key) {
      delete constants[key];
      await updateDraft(
        draft.id,
        {
          draftConstants: constants,
        },
        c,
        "Deleted template constant",
      );
    }
    return c.json({ success: true });
  }

  // ── SECTIONS ──────────────────────────────────────────────────────────────

  static async createSection(c: Context) {
    const draft = await getDraft(c);
    if (!draft) return c.json({ error: "Draft not found" }, 404);
    const body = await c.req.json();

    const sections = draft.draftSections || [];
    const newSection = {
      id: crypto.randomUUID(),
      label: body.label,
      sectionToken: body.sectionToken,
      description: body.description,
      displayOrder: sections.length,
      sortOrder: body.sortOrder ?? sections.length,
      rows: [],
      sectionCharges: [],
    };

    sections.push(newSection);
    await updateDraft(
      draft.id,
      {
        draftSections: sections,
      },
      c,
      "Created section",
    );
    return c.json(newSection, 201);
  }

  static async updateSection(c: Context) {
    const draft = await getDraft(c);
    if (!draft) return c.json({ error: "Draft not found" }, 404);
    const sectionId = c.req.param("sectionId");
    const body = await c.req.json();

    const sections = draft.draftSections || [];
    const idx = sections.findIndex((s: any) => s.id === sectionId);
    if (idx === -1) return c.json({ error: "Section not found" }, 404);

    sections[idx] = { ...sections[idx], ...body };
    await updateDraft(
      draft.id,
      {
        draftSections: sections,
      },
      c,
      "Updated section",
    );
    return c.json(sections[idx]);
  }

  static async deleteSection(c: Context) {
    const draft = await getDraft(c);
    if (!draft) return c.json({ error: "Draft not found" }, 404);
    const sectionId = c.req.param("sectionId");

    let sections = draft.draftSections || [];
    sections = sections.filter((s: any) => s.id !== sectionId);
    await updateDraft(
      draft.id,
      {
        draftSections: sections,
      },
      c,
      "Deleted section",
    );
    return c.json({ success: true });
  }

  static async reorderSections(c: Context) {
    const draft = await getDraft(c);
    if (!draft) return c.json({ error: "Draft not found" }, 404);
    const body = await c.req.json();
    const { order } = body as { order: { id: string; displayOrder: number }[] };

    const sections = draft.draftSections || [];
    for (const s of sections) {
      const match = order.find((o) => o.id === s.id);
      if (match) s.displayOrder = match.displayOrder;
    }
    sections.sort((a: any, b: any) => (a.displayOrder || 0) - (b.displayOrder || 0));

    await updateDraft(
      draft.id,
      {
        draftSections: sections,
      },
      c,
      "Reordered sections",
    );
    return c.json({ success: true });
  }

  // ── ROWS ──────────────────────────────────────────────────────────────────

  static async createRow(c: Context) {
    const draft = await getDraft(c);
    if (!draft) return c.json({ error: "Draft not found" }, 404);
    const sectionId = c.req.param("sectionId");
    const body = await c.req.json();

    const sections = draft.draftSections || [];
    const s = sections.find((s: any) => s.id === sectionId);
    if (!s) return c.json({ error: "Section not found" }, 404);

    if (sections.some((sec: any) => sec.rows.some((r: any) => r.rowToken === body.rowToken))) {
      return c.json({ error: "Row token must be unique across all sections" }, 400);
    }

    const { tokenToId, idToToken, secTokenToId, secIdToToken, tplTokenToId, tplIdToToken } =
      await buildDraftIndices(draft, c.get("organizationId"));

    const rowId = crypto.randomUUID();
    tokenToId[body.rowToken] = rowId;
    idToToken[rowId] = body.rowToken;

    const encodedFormula = body.formula
      ? encodeFormula(body.formula, tokenToId, secTokenToId, tplTokenToId)
      : null;

    const newRow = {
      id: rowId,
      sectionId,
      ...body,
      formula: encodedFormula,
      displayOrder: s.rows.length,
      sortOrder: body.sortOrder ?? s.rows.length,
      charges: [],
    };
    s.rows.push(newRow);

    await updateDraft(
      draft.id,
      {
        draftSections: sections,
      },
      c,
      "Created row",
    );

    return c.json(
      {
        ...newRow,
        formula: decodeFormula(newRow.formula, idToToken, secIdToToken, tplIdToToken),
      },
      201,
    );
  }

  static async updateRow(c: Context) {
    const draft = await getDraft(c);
    if (!draft) return c.json({ error: "Draft not found" }, 404);
    const sectionId = c.req.param("sectionId");
    const rowId = c.req.param("rowId");
    const body = await c.req.json();

    const sections = draft.draftSections || [];
    const s = sections.find((s: any) => s.id === sectionId);
    if (!s) return c.json({ error: "Section not found" }, 404);

    const rIdx = s.rows.findIndex((r: any) => r.id === rowId);
    if (rIdx === -1) return c.json({ error: "Row not found" }, 404);

    const { tokenToId, idToToken, secTokenToId, secIdToToken, tplTokenToId, tplIdToToken } =
      await buildDraftIndices(draft, c.get("organizationId"));

    const updateFields: any = { ...body };
    if (updateFields.rowToken && updateFields.rowToken !== s.rows[rIdx].rowToken) {
      delete updateFields.rowToken; // rowToken is immutable in draft
    }

    if (updateFields.formula !== undefined) {
      updateFields.formula = updateFields.formula
        ? encodeFormula(updateFields.formula, tokenToId, secTokenToId, tplTokenToId)
        : null;
      if (updateFields.formula) updateFields.initialValue = null;
    }
    if (updateFields.initialValue !== undefined) {
      updateFields.initialValue =
        updateFields.initialValue != null ? String(updateFields.initialValue) : null;
      if (updateFields.initialValue != null) updateFields.formula = null;
    }
    if (updateFields.manualValue !== undefined) {
      updateFields.manualValue =
        updateFields.manualValue != null ? String(updateFields.manualValue) : null;
    }

    s.rows[rIdx] = { ...s.rows[rIdx], ...updateFields };

    if (updateFields.formula) {
      const testDraft = { ...draft, draftSections: sections };
      const validation = validateDraftDag(testDraft);
      if (!validation.valid) {
        return c.json(
          {
            error:
              validation.errors[0]?.message ||
              "Invalid formula: circular reference or illegal dependency detected",
            errors: validation.errors,
          },
          422,
        );
      }
    }

    await updateDraft(
      draft.id,
      {
        draftSections: sections,
      },
      c,
      "Updated row",
    );

    return c.json({
      ...s.rows[rIdx],
      formula: decodeFormula(s.rows[rIdx].formula, idToToken, secIdToToken, tplIdToToken),
    });
  }

  static async deleteRow(c: Context) {
    const draft = await getDraft(c);
    if (!draft) return c.json({ error: "Draft not found" }, 404);
    const sectionId = c.req.param("sectionId");
    const rowId = c.req.param("rowId");

    const sections = draft.draftSections || [];
    const s = sections.find((s: any) => s.id === sectionId);
    if (s) {
      s.rows = s.rows.filter((r: any) => r.id !== rowId);
      await updateDraft(
        draft.id,
        {
          draftSections: sections,
        },
        c,
        "Deleted row",
      );
    }
    return c.json({ success: true });
  }

  static async reorderRows(c: Context) {
    const draft = await getDraft(c);
    if (!draft) return c.json({ error: "Draft not found" }, 404);
    const sectionId = c.req.param("sectionId");
    const body = await c.req.json();
    const { order } = body as { order: { id: string; displayOrder: number }[] };

    const sections = draft.draftSections || [];
    const s = sections.find((s: any) => s.id === sectionId);
    if (s) {
      for (const r of s.rows) {
        const match = order.find((o) => o.id === r.id);
        if (match) r.displayOrder = match.displayOrder;
      }
      s.rows.sort((a: any, b: any) => (a.displayOrder || 0) - (b.displayOrder || 0));
      await updateDraft(
        draft.id,
        {
          draftSections: sections,
        },
        c,
        "Reordered rows",
      );
    }
    return c.json({ success: true });
  }

  // ── ROW CHARGES ───────────────────────────────────────────────────────────

  static async listRowCharges(c: Context) {
    const draft = await getDraft(c);
    if (!draft) return c.json({ error: "Draft not found" }, 404);
    const sectionId = c.req.param("sectionId");
    const rowId = c.req.param("rowId");

    const sections = draft.draftSections || [];
    const s = sections.find((s: any) => s.id === sectionId);
    if (!s) return c.json({ error: "Section not found" }, 404);
    const r = s.rows.find((r: any) => r.id === rowId);
    if (!r) return c.json({ error: "Row not found" }, 404);

    const { idToToken, secIdToToken, tplIdToToken } = await buildDraftIndices(
      draft,
      c.get("organizationId"),
    );
    const decodedCharges = (r.charges || []).map((ch: any) => ({
      ...ch,
      formula: decodeFormula(ch.formula, idToToken, secIdToToken, tplIdToToken) ?? ch.formula,
    }));

    return c.json(decodedCharges);
  }

  static async createRowCharge(c: Context) {
    const draft = await getDraft(c);
    if (!draft) return c.json({ error: "Draft not found" }, 404);
    const sectionId = c.req.param("sectionId");
    const rowId = c.req.param("rowId");
    const body = await c.req.json();

    const sections = draft.draftSections || [];
    const s = sections.find((s: any) => s.id === sectionId);
    if (!s) return c.json({ error: "Section not found" }, 404);
    const r = s.rows.find((r: any) => r.id === rowId);
    if (!r) return c.json({ error: "Row not found" }, 404);

    const { tokenToId, idToToken, secTokenToId, secIdToToken, tplTokenToId, tplIdToToken } =
      await buildDraftIndices(draft, c.get("organizationId"));

    const chargeToken = body.chargeToken || `${r.rowToken}_${toSnakeCase(body.label)}`;
    const encodedFormula = body.formula
      ? encodeFormula(body.formula, tokenToId, secTokenToId, tplTokenToId)
      : body.formula;

    const newCharge = {
      id: crypto.randomUUID(),
      rowId,
      label: body.label,
      chargeToken,
      subDescription: body.subDescription ?? null,
      qualifier: body.qualifier ?? null,
      tags: body.tags ?? [],
      formula: encodedFormula,
      sortOrder: body.sortOrder ?? (r.charges || []).length,
    };

    if (!r.charges) r.charges = [];
    r.charges.push(newCharge);

    if (encodedFormula) {
      const testDraft = { ...draft, draftSections: sections };
      const validation = validateDraftDag(testDraft);
      if (!validation.valid) {
        return c.json(
          {
            error:
              validation.errors[0]?.message ||
              "Invalid charge formula: circular reference or illegal dependency detected",
            errors: validation.errors,
          },
          422,
        );
      }
    }

    await updateDraft(
      draft.id,
      {
        draftSections: sections,
      },
      c,
      "Created row charge",
    );

    return c.json(
      {
        ...newCharge,
        formula:
          decodeFormula(newCharge.formula, idToToken, secIdToToken, tplIdToToken) ??
          newCharge.formula,
      },
      201,
    );
  }

  static async updateRowCharge(c: Context) {
    const draft = await getDraft(c);
    if (!draft) return c.json({ error: "Draft not found" }, 404);
    const sectionId = c.req.param("sectionId");
    const rowId = c.req.param("rowId");
    const chargeId = c.req.param("chargeId");
    const body = await c.req.json();

    const sections = draft.draftSections || [];
    const s = sections.find((s: any) => s.id === sectionId);
    if (!s) return c.json({ error: "Section not found" }, 404);
    const r = s.rows.find((r: any) => r.id === rowId);
    if (!r?.charges) return c.json({ error: "Row not found" }, 404);

    const cIdx = r.charges.findIndex((ch: any) => ch.id === chargeId);
    if (cIdx === -1) return c.json({ error: "Charge not found" }, 404);

    const { tokenToId, idToToken, secTokenToId, secIdToToken, tplTokenToId, tplIdToToken } =
      await buildDraftIndices(draft, c.get("organizationId"));

    const updateData = { ...body };
    if (updateData.formula !== undefined) {
      updateData.formula = updateData.formula
        ? encodeFormula(updateData.formula, tokenToId, secTokenToId, tplTokenToId)
        : null;
    }

    r.charges[cIdx] = { ...r.charges[cIdx], ...updateData };

    if (updateData.formula) {
      const testDraft = { ...draft, draftSections: sections };
      const validation = validateDraftDag(testDraft);
      if (!validation.valid) {
        return c.json(
          {
            error:
              validation.errors[0]?.message ||
              "Invalid charge formula: circular reference or illegal dependency detected",
            errors: validation.errors,
          },
          422,
        );
      }
    }

    await updateDraft(
      draft.id,
      {
        draftSections: sections,
      },
      c,
      "Updated row charge",
    );

    return c.json({
      ...r.charges[cIdx],
      formula:
        decodeFormula(r.charges[cIdx].formula, idToToken, secIdToToken, tplIdToToken) ??
        r.charges[cIdx].formula,
    });
  }

  static async deleteRowCharge(c: Context) {
    const draft = await getDraft(c);
    if (!draft) return c.json({ error: "Draft not found" }, 404);
    const sectionId = c.req.param("sectionId");
    const rowId = c.req.param("rowId");
    const chargeId = c.req.param("chargeId");

    const sections = draft.draftSections || [];
    const s = sections.find((s: any) => s.id === sectionId);
    if (!s) return c.json({ error: "Section not found" }, 404);
    const r = s.rows.find((r: any) => r.id === rowId);
    if (r?.charges) {
      r.charges = r.charges.filter((ch: any) => ch.id !== chargeId);
      await updateDraft(
        draft.id,
        {
          draftSections: sections,
        },
        c,
        "Deleted row charge",
      );
    }
    return c.json({ success: true });
  }

  static async reorderRowCharges(c: Context) {
    const draft = await getDraft(c);
    if (!draft) return c.json({ error: "Draft not found" }, 404);
    const sectionId = c.req.param("sectionId");
    const rowId = c.req.param("rowId");
    const body = await c.req.json();
    const orderedIds = (body.orderedIds ||
      (body.order ? body.order.map((o: any) => o.id) : [])) as string[];

    const sections = draft.draftSections || [];
    const s = sections.find((s: any) => s.id === sectionId);
    if (!s) return c.json({ error: "Section not found" }, 404);
    const r = s.rows.find((r: any) => r.id === rowId);
    if (!r?.charges) return c.json({ error: "Row not found" }, 404);

    const chargeMap = new Map<string, any>(r.charges.map((ch: any) => [ch.id, ch]));
    const reordered: any[] = [];
    for (let i = 0; i < orderedIds.length; i++) {
      const ch = chargeMap.get(orderedIds[i]);
      if (ch) {
        ch.sortOrder = i;
        reordered.push(ch);
        chargeMap.delete(orderedIds[i]);
      }
    }
    for (const remaining of Array.from(chargeMap.values())) {
      remaining.sortOrder = reordered.length;
      reordered.push(remaining);
    }
    r.charges = reordered;

    await updateDraft(
      draft.id,
      {
        draftSections: sections,
      },
      c,
      "Reordered row charges",
    );
    return c.json({ success: true });
  }

  // ── SECTION CHARGES ───────────────────────────────────────────────────────

  static async createSectionCharge(c: Context) {
    const draft = await getDraft(c);
    if (!draft) return c.json({ error: "Draft not found" }, 404);
    const sectionId = c.req.param("sectionId");
    const body = await c.req.json();

    const sections = draft.draftSections || [];
    const s = sections.find((s: any) => s.id === sectionId);
    if (!s) return c.json({ error: "Section not found" }, 404);

    const { tokenToId, idToToken, secTokenToId, secIdToToken, tplTokenToId, tplIdToToken } =
      await buildDraftIndices(draft, c.get("organizationId"));

    const encodedFormula = body.formula
      ? encodeFormula(body.formula, tokenToId, secTokenToId, tplTokenToId)
      : body.formula;

    const newCharge = {
      id: crypto.randomUUID(),
      sectionId,
      ...body,
      formula: encodedFormula,
      displayOrder: (s.sectionCharges || []).length,
      sortOrder: body.sortOrder ?? (s.sectionCharges || []).length,
    };
    if (!s.sectionCharges) s.sectionCharges = [];
    s.sectionCharges.push(newCharge);

    if (encodedFormula) {
      const testDraft = { ...draft, draftSections: sections };
      const validation = validateDraftDag(testDraft);
      if (!validation.valid) {
        return c.json(
          {
            error:
              validation.errors[0]?.message ||
              "Invalid section charge formula: circular reference or illegal dependency detected",
            errors: validation.errors,
          },
          422,
        );
      }
    }

    await updateDraft(
      draft.id,
      {
        draftSections: sections,
      },
      c,
      "Created section charge",
    );

    return c.json(
      {
        ...newCharge,
        formula:
          decodeFormula(newCharge.formula, idToToken, secIdToToken, tplIdToToken) ??
          newCharge.formula,
      },
      201,
    );
  }

  static async updateSectionCharge(c: Context) {
    const draft = await getDraft(c);
    if (!draft) return c.json({ error: "Draft not found" }, 404);
    const sectionId = c.req.param("sectionId");
    const chargeId = c.req.param("chargeId");
    const body = await c.req.json();

    const sections = draft.draftSections || [];
    const s = sections.find((s: any) => s.id === sectionId);
    if (!s) return c.json({ error: "Section not found" }, 404);

    const cIdx = (s.sectionCharges || []).findIndex((ch: any) => ch.id === chargeId);
    if (cIdx === -1) return c.json({ error: "Charge not found" }, 404);

    const { tokenToId, idToToken, secTokenToId, secIdToToken, tplTokenToId, tplIdToToken } =
      await buildDraftIndices(draft, c.get("organizationId"));

    const updateData = { ...body };
    if (updateData.formula !== undefined) {
      updateData.formula = updateData.formula
        ? encodeFormula(updateData.formula, tokenToId, secTokenToId, tplTokenToId)
        : null;
    }

    s.sectionCharges[cIdx] = { ...s.sectionCharges[cIdx], ...updateData };

    if (updateData.formula) {
      const testDraft = { ...draft, draftSections: sections };
      const validation = validateDraftDag(testDraft);
      if (!validation.valid) {
        return c.json(
          {
            error:
              validation.errors[0]?.message ||
              "Invalid section charge formula: circular reference or illegal dependency detected",
            errors: validation.errors,
          },
          422,
        );
      }
    }

    await updateDraft(
      draft.id,
      {
        draftSections: sections,
      },
      c,
      "Updated section charge",
    );

    return c.json({
      ...s.sectionCharges[cIdx],
      formula:
        decodeFormula(s.sectionCharges[cIdx].formula, idToToken, secIdToToken, tplIdToToken) ??
        s.sectionCharges[cIdx].formula,
    });
  }

  static async deleteSectionCharge(c: Context) {
    const draft = await getDraft(c);
    if (!draft) return c.json({ error: "Draft not found" }, 404);
    const sectionId = c.req.param("sectionId");
    const chargeId = c.req.param("chargeId");

    const sections = draft.draftSections || [];
    const s = sections.find((s: any) => s.id === sectionId);
    if (s?.sectionCharges) {
      s.sectionCharges = s.sectionCharges.filter((ch: any) => ch.id !== chargeId);
      await updateDraft(
        draft.id,
        {
          draftSections: sections,
        },
        c,
        "Deleted section charge",
      );
    }
    return c.json({ success: true });
  }

  static async reorderSectionCharges(c: Context) {
    const draft = await getDraft(c);
    if (!draft) return c.json({ error: "Draft not found" }, 404);
    const sectionId = c.req.param("sectionId");
    const body = await c.req.json();
    const orderedIds = (body.orderedIds ||
      (body.order ? body.order.map((o: any) => o.id) : [])) as string[];

    const sections = draft.draftSections || [];
    const s = sections.find((s: any) => s.id === sectionId);
    if (s?.sectionCharges) {
      const chargeMap = new Map<string, any>(s.sectionCharges.map((ch: any) => [ch.id, ch]));
      const reordered: any[] = [];
      for (let i = 0; i < orderedIds.length; i++) {
        const ch = chargeMap.get(orderedIds[i]);
        if (ch) {
          ch.sortOrder = i;
          reordered.push(ch);
          chargeMap.delete(orderedIds[i]);
        }
      }
      for (const remaining of Array.from(chargeMap.values())) {
        remaining.sortOrder = reordered.length;
        reordered.push(remaining);
      }
      s.sectionCharges = reordered;

      await updateDraft(
        draft.id,
        {
          draftSections: sections,
        },
        c,
        "Reordered section charges",
      );
    }
    return c.json({ success: true });
  }

  static async listOptionalRows(c: Context) {
    const draft = await getDraft(c);
    if (!draft) return c.json({ error: "Draft not found" }, 404);
    if (!draft.sourceTemplateId) {
      return c.json({ available: [], optionalRows: [], attached: [], activeRowTokens: [] });
    }

    const tpl = await db.query.invoiceTemplates.findFirst({
      where: eq(invoiceTemplates.id, draft.sourceTemplateId),
    });

    const optionalRows = (tpl?.optionalRows as TemplateOptionalRow[]) || [];
    const sections: any[] = draft.draftSections || [];
    const activeRowTokens: string[] = [];
    const attached: any[] = [];

    for (const sec of sections) {
      for (const r of sec.rows || []) {
        if (r.rowToken) activeRowTokens.push(r.rowToken);
        if (r.isOptionalService || r.templateOptionalRowId) {
          attached.push({
            rowId: r.id,
            token: r.rowToken,
            canonicalToken: r.canonicalToken || r.rowToken?.replace(/_\d+$/, ""),
            label: r.label,
            sectionId: sec.id,
            sectionToken: sec.sectionToken,
            sectionTitle: sec.headerName || sec.sectionToken,
            valueType: r.valueType,
            initialValue: r.initialValue,
            formula: r.formula,
          });
        }
      }
    }

    return c.json({
      available: optionalRows,
      optionalRows,
      attached,
      activeRowTokens,
    });
  }

  static async addOptionalRow(c: Context) {
    const draft = await getDraft(c);
    if (!draft) return c.json({ error: "Draft not found" }, 404);
    if (!draft.sourceTemplateId) return c.json({ error: "Draft has no template assigned" }, 400);

    const body = await c.req.json();
    const { canonicalToken, optionalRowId, sectionId, customLabel, customValue, customFormula } =
      body;
    const targetLookup = canonicalToken || optionalRowId;
    if (!targetLookup) {
      return c.json({ error: "canonicalToken or optionalRowId is required" }, 400);
    }

    const tpl = await db.query.invoiceTemplates.findFirst({
      where: eq(invoiceTemplates.id, draft.sourceTemplateId),
    });

    const catalog = (tpl?.optionalRows as TemplateOptionalRow[]) || [];
    const templateItem = catalog.find(
      (item) => item.rowToken === targetLookup || item.id === targetLookup,
    );
    if (!templateItem) return c.json({ error: "Optional row not found in template catalog" }, 404);

    const sections: any[] = draft.draftSections || [];
    if (sections.length === 0) return c.json({ error: "Draft has no sections" }, 400);

    // Target section: provided sectionId, or matching suggestedSectionToken, or first section
    let targetSection = sections.find((s: any) => s.id === sectionId);
    if (!targetSection && templateItem.suggestedSectionToken) {
      targetSection = sections.find(
        (s: any) =>
          s.sectionToken === templateItem.suggestedSectionToken ||
          `SEC_${s.sectionToken}` === templateItem.suggestedSectionToken,
      );
    }
    if (!targetSection) {
      targetSection = sections[0];
    }

    // Determine unique token: base token, or sequential suffix if repeated
    const existingTokens = new Set<string>();
    for (const s of sections) {
      for (const r of s.rows || []) {
        if (r.rowToken) existingTokens.add(r.rowToken);
      }
    }

    let finalToken = templateItem.rowToken;
    if (existingTokens.has(finalToken)) {
      let counter = 2;
      while (existingTokens.has(`${templateItem.rowToken}_${counter}`)) {
        counter++;
      }
      finalToken = `${templateItem.rowToken}_${counter}`;
    }

    if (!targetSection.rows) targetSection.rows = [];

    const newRow = {
      id: uuidv4(),
      rowToken: finalToken,
      canonicalToken: templateItem.rowToken,
      label: customLabel?.trim() || templateItem.label,
      subDescription: templateItem.subDescription || null,
      valueType: templateItem.valueType,
      formula: customFormula !== undefined ? customFormula : templateItem.formula || null,
      initialValue:
        customValue !== undefined
          ? parseFloat(customValue) || null
          : templateItem.initialValue
            ? parseFloat(templateItem.initialValue) || null
            : null,
      sortOrder: targetSection.rows.length,
      isOptionalService: true,
      templateOptionalRowId: templateItem.id,
      charges: [],
    };

    targetSection.rows.push(newRow);

    await updateDraft(
      draft.id,
      { draftSections: sections },
      c,
      `Added optional service "${newRow.label}" (${newRow.rowToken})`,
    );

    return c.json({ success: true, row: newRow, allocatedToken: finalToken });
  }

  static async removeOptionalRow(c: Context) {
    const draft = await getDraft(c);
    if (!draft) return c.json({ error: "Draft not found" }, 404);
    const rowId = c.req.param("rowId");
    if (!rowId) return c.json({ error: "rowId is required" }, 400);

    const sections: any[] = draft.draftSections || [];
    let removedLabel = "Optional service";
    let removedToken = "";
    let found = false;

    for (const s of sections) {
      if (s.rows) {
        const idx = s.rows.findIndex((r: any) => r.id === rowId);
        if (idx !== -1) {
          const targetRow = s.rows[idx];
          if (targetRow.isOptionalService !== true) {
            return c.json(
              { error: "Only prebuilt optional service rows can be deleted from drafts" },
              400,
            );
          }
          removedLabel = targetRow.label || removedLabel;
          removedToken = targetRow.rowToken || "";
          s.rows.splice(idx, 1);
          // Re-index remaining rows
          s.rows.forEach((r: any, i: number) => {
            r.sortOrder = i;
          });
          found = true;
          break;
        }
      }
    }

    if (!found) return c.json({ error: "Row not found in draft" }, 404);

    await updateDraft(
      draft.id,
      { draftSections: sections },
      c,
      `Removed optional service "${removedLabel}" (${removedToken})`,
    );

    return c.json({
      success: true,
      deletedRowId: rowId,
      token: removedToken,
      label: removedLabel,
    });
  }

  static async listHeaderFields(c: Context) {
    const draft = await getDraft(c);
    if (!draft) return c.json({ error: "Draft not found" }, 404);
    if (Array.isArray(draft.draftHeaderFields) && draft.draftHeaderFields.length > 0) {
      let modified = false;
      const normalized = draft.draftHeaderFields.map((f: any, idx: number) => {
        let col = f.columnPosition;
        if (col !== "left" && col !== "right") {
          col = idx % 2 === 0 ? "left" : "right";
          modified = true;
        }
        return {
          ...f,
          columnPosition: col,
          fieldType: f.fieldType || "file_field",
          isFormulaInjectable: f.isFormulaInjectable ?? f.isInjectable ?? false,
          fileFieldKey: f.fileFieldKey || f.fieldKey || f.systemFieldKey,
          tokenKey: f.tokenKey || (f.fieldKey || f.systemFieldKey || "").toUpperCase(),
        };
      });
      if (modified) {
        await updateDraft(draft.id, { draftHeaderFields: normalized }, c);
      }
      return c.json(normalized);
    }

    if (draft.sourceTemplateId) {
      try {
        const fields = await db
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
            fieldKey: customFieldDefinitions.fieldKey,
            tokenKey: tokens.tokenKey,
            label: tokens.label,
            description: tokens.description,
            isFormulaInjectable: tokens.isInjectable,
            sortOrder: tokens.sortOrder,
          })
          .from(templateHeaderFields)
          .innerJoin(tokens, eq(tokens.id, templateHeaderFields.id))
          .leftJoin(
            customFieldDefinitions,
            eq(templateHeaderFields.customFieldDefinitionId, customFieldDefinitions.id),
          )
          .where(eq(templateHeaderFields.templateId, draft.sourceTemplateId))
          .orderBy(asc(tokens.sortOrder));

        if (fields.length > 0) {
          const draftFields = fields.map((f) => ({
            id: crypto.randomUUID(),
            label: f.label || "Field",
            fieldType: f.fieldType || "file_field",
            fileFieldKey: f.fieldKey || f.systemFieldKey || f.tokenKey,
            tokenKey: f.tokenKey || f.fieldKey,
            isFormulaInjectable: f.isFormulaInjectable ?? false,
            columnPosition: f.columnPosition || "left",
            sortOrder: f.sortOrder ?? 0,
            defaultManualValue: f.defaultManualValue || "",
          }));
          await updateDraft(draft.id, { draftHeaderFields: draftFields }, c);
          return c.json(draftFields);
        }
      } catch (err) {
        console.error(
          "[listHeaderFields] Failed to populate draft header fields from template",
          err,
        );
      }
    }

    // Fallback: Seed default system fields and project custom fields so File Details is never empty
    const defaultFields = [
      {
        id: crypto.randomUUID(),
        label: "Name",
        fieldType: "file_field",
        fileFieldKey: "name",
        tokenKey: "NAME",
        columnPosition: "left",
        sortOrder: 0,
        isFormulaInjectable: false,
      },
      {
        id: crypto.randomUUID(),
        label: "Client",
        fieldType: "file_field",
        fileFieldKey: "clientId",
        tokenKey: "CLIENT",
        columnPosition: "left",
        sortOrder: 1,
        isFormulaInjectable: false,
      },
      {
        id: crypto.randomUUID(),
        label: "Status",
        fieldType: "file_field",
        fileFieldKey: "status",
        tokenKey: "STATUS",
        columnPosition: "right",
        sortOrder: 0,
        isFormulaInjectable: false,
      },
    ];

    try {
      const orgId = c.get("organizationId");
      if (orgId) {
        const projectCustomFields = await db
          .select()
          .from(customFieldDefinitions)
          .where(
            and(
              eq(customFieldDefinitions.organizationId, orgId),
              eq(customFieldDefinitions.entityType, "project"),
            ),
          );

        projectCustomFields.forEach((cf: any, idx: number) => {
          defaultFields.push({
            id: crypto.randomUUID(),
            label: cf.fieldName || cf.fieldKey,
            fieldType: "file_field",
            fileFieldKey: cf.fieldKey,
            tokenKey: cf.fieldKey.toUpperCase(),
            columnPosition: idx % 2 === 0 ? "right" : "left",
            sortOrder: Math.floor(idx / 2) + 1,
            isFormulaInjectable: cf.fieldType === "number" || cf.fieldType === "currency",
          });
        });
      }

      await updateDraft(draft.id, { draftHeaderFields: defaultFields }, c);
      return c.json(defaultFields);
    } catch (e) {
      console.error("[listHeaderFields] Failed to seed default header fields", e);
      return c.json(defaultFields);
    }
  }

  static async createHeaderField(c: Context) {
    const draft = await getDraft(c);
    if (!draft) return c.json({ error: "Draft not found" }, 404);
    const body = await c.req.json();
    const fields = Array.isArray(draft.draftHeaderFields) ? [...draft.draftHeaderFields] : [];
    const cleanToken = (body.fileFieldKey || body.label || "FIELD")
      .trim()
      .replace(/[^a-zA-Z0-9]/g, "_")
      .toUpperCase();

    const newField = {
      id: crypto.randomUUID(),
      label: body.label || "New Field",
      fieldType: body.fieldType || "file_field",
      fileFieldKey: cleanToken,
      tokenKey: cleanToken,
      isFormulaInjectable: body.isFormulaInjectable ?? false,
      columnPosition: body.columnPosition || "left",
      sortOrder: fields.length,
      defaultManualValue: body.defaultManualValue || "",
    };

    fields.push(newField);
    await updateDraft(
      draft.id,
      { draftHeaderFields: fields },
      c,
      `Added description field "${newField.label}"`,
    );
    return c.json(newField, 201);
  }

  static async updateHeaderField(c: Context) {
    const draft = await getDraft(c);
    if (!draft) return c.json({ error: "Draft not found" }, 404);
    const fieldId = c.req.param("fieldId");
    const body = await c.req.json();
    const fields = Array.isArray(draft.draftHeaderFields) ? [...draft.draftHeaderFields] : [];
    const idx = fields.findIndex((f) => f.id === fieldId);
    if (idx === -1) return c.json({ error: "Header field not found" }, 404);

    fields[idx] = { ...fields[idx], ...body };
    await updateDraft(
      draft.id,
      { draftHeaderFields: fields },
      c,
      `Updated description field "${fields[idx].label}"`,
    );
    return c.json(fields[idx]);
  }

  static async deleteHeaderField(c: Context) {
    const draft = await getDraft(c);
    if (!draft) return c.json({ error: "Draft not found" }, 404);
    const fieldId = c.req.param("fieldId");
    const fields = Array.isArray(draft.draftHeaderFields) ? [...draft.draftHeaderFields] : [];
    const filtered = fields.filter((f) => f.id !== fieldId);
    filtered.forEach((f, i) => {
      f.sortOrder = i;
    });

    await updateDraft(draft.id, { draftHeaderFields: filtered }, c, "Deleted description field");
    return c.json({ success: true, deletedId: fieldId });
  }

  static async reorderHeaderFields(c: Context) {
    const draft = await getDraft(c);
    if (!draft) return c.json({ error: "Draft not found" }, 404);
    const body = await c.req.json();
    const updates = body.updates || body.fields || [];
    const fields = Array.isArray(draft.draftHeaderFields) ? [...draft.draftHeaderFields] : [];
    const updateMap = new Map((updates || []).map((u: any) => [u.fieldId, u]));

    for (const f of fields) {
      const u: any = updateMap.get(f.id);
      if (u) {
        if (u.sortOrder !== undefined) f.sortOrder = u.sortOrder;
        if (u.columnPosition !== undefined) f.columnPosition = u.columnPosition;
      }
    }

    await updateDraft(draft.id, { draftHeaderFields: fields }, c, "Reordered description fields");
    return c.json({ success: true });
  }

  static async updateHeaderValues(c: Context) {
    const draft = await getDraft(c);
    if (!draft) return c.json({ error: "Draft not found" }, 404);

    const body = await c.req.json();
    const currentHeaderValues = (draft.draftHeaderValues as Record<string, any>) || {};
    const updates: Record<string, any> = {};

    if (body.values && typeof body.values === "object" && !Array.isArray(body.values)) {
      Object.assign(updates, body.values);
    } else if (body.key !== undefined && body.value !== undefined) {
      updates[body.key] = String(body.value);
      if (body.fieldId) updates[body.fieldId] = String(body.value);
      if (body.tokenKey) updates[body.tokenKey] = String(body.value);
    } else if (body.fieldId !== undefined && body.value !== undefined) {
      updates[body.fieldId] = String(body.value);
      if (body.tokenKey) updates[body.tokenKey] = String(body.value);
    } else if (typeof body === "object" && !Array.isArray(body)) {
      Object.assign(updates, body);
    }

    const merged = { ...currentHeaderValues, ...updates };

    await updateDraft(
      draft.id,
      { draftHeaderValues: merged },
      c,
      "Updated custom file field values",
    );

    return c.json({ success: true, draftHeaderValues: merged });
  }
}
