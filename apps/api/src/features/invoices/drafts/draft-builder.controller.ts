import { db, decodeFormula, encodeFormula, invoiceDrafts } from "@starter/db";
import { and, eq } from "drizzle-orm";
import { Context } from "hono";

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

async function updateDraft(id: string, updates: any) {
  const [updated] = await db
    .update(invoiceDrafts)
    .set(updates)
    .where(eq(invoiceDrafts.id, id))
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

function buildDraftIndices(draft: any) {
  const sections: any[] = draft.draftSections || [];
  const constants: any = draft.draftConstants || {};

  const tokenToId: Record<string, string> = {};
  const idToToken: Record<string, string> = {};
  const secTokenToId: Record<string, string> = {};
  const secIdToToken: Record<string, string> = {};
  const tplTokenToId: Record<string, string> = {};
  const tplIdToToken: Record<string, string> = {};

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
    const { idToToken, secIdToToken, tplIdToToken } = buildDraftIndices(draft);

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

    await updateDraft(draft.id, {
      draftConstants: constants,
      lastAutoSavedAt: new Date(),
    });
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
    await updateDraft(draft.id, {
      draftConstants: constants,
      lastAutoSavedAt: new Date(),
    });
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
      await updateDraft(draft.id, {
        draftConstants: constants,
        lastAutoSavedAt: new Date(),
      });
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
    await updateDraft(draft.id, {
      draftSections: sections,
      lastAutoSavedAt: new Date(),
    });
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
    await updateDraft(draft.id, {
      draftSections: sections,
      lastAutoSavedAt: new Date(),
    });
    return c.json(sections[idx]);
  }

  static async deleteSection(c: Context) {
    const draft = await getDraft(c);
    if (!draft) return c.json({ error: "Draft not found" }, 404);
    const sectionId = c.req.param("sectionId");

    let sections = draft.draftSections || [];
    sections = sections.filter((s: any) => s.id !== sectionId);
    await updateDraft(draft.id, {
      draftSections: sections,
      lastAutoSavedAt: new Date(),
    });
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

    await updateDraft(draft.id, {
      draftSections: sections,
      lastAutoSavedAt: new Date(),
    });
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
      buildDraftIndices(draft);

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

    await updateDraft(draft.id, {
      draftSections: sections,
      lastAutoSavedAt: new Date(),
    });

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
      buildDraftIndices(draft);

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

    await updateDraft(draft.id, {
      draftSections: sections,
      lastAutoSavedAt: new Date(),
    });

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
      await updateDraft(draft.id, {
        draftSections: sections,
        lastAutoSavedAt: new Date(),
      });
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
      await updateDraft(draft.id, {
        draftSections: sections,
        lastAutoSavedAt: new Date(),
      });
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

    const { idToToken, secIdToToken, tplIdToToken } = buildDraftIndices(draft);
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
      buildDraftIndices(draft);

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

    await updateDraft(draft.id, {
      draftSections: sections,
      lastAutoSavedAt: new Date(),
    });

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
      buildDraftIndices(draft);

    const updateData = { ...body };
    if (updateData.formula !== undefined) {
      updateData.formula = updateData.formula
        ? encodeFormula(updateData.formula, tokenToId, secTokenToId, tplTokenToId)
        : null;
    }

    r.charges[cIdx] = { ...r.charges[cIdx], ...updateData };

    await updateDraft(draft.id, {
      draftSections: sections,
      lastAutoSavedAt: new Date(),
    });

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
      await updateDraft(draft.id, {
        draftSections: sections,
        lastAutoSavedAt: new Date(),
      });
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

    await updateDraft(draft.id, {
      draftSections: sections,
      lastAutoSavedAt: new Date(),
    });
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
      buildDraftIndices(draft);

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

    await updateDraft(draft.id, {
      draftSections: sections,
      lastAutoSavedAt: new Date(),
    });

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
      buildDraftIndices(draft);

    const updateData = { ...body };
    if (updateData.formula !== undefined) {
      updateData.formula = updateData.formula
        ? encodeFormula(updateData.formula, tokenToId, secTokenToId, tplTokenToId)
        : null;
    }

    s.sectionCharges[cIdx] = { ...s.sectionCharges[cIdx], ...updateData };

    await updateDraft(draft.id, {
      draftSections: sections,
      lastAutoSavedAt: new Date(),
    });

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
      await updateDraft(draft.id, {
        draftSections: sections,
        lastAutoSavedAt: new Date(),
      });
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

      await updateDraft(draft.id, {
        draftSections: sections,
        lastAutoSavedAt: new Date(),
      });
    }
    return c.json({ success: true });
  }
}
