import {
  clients,
  customFieldDefinitions,
  db,
  projects,
  templateConstants,
  templateHeaderFields,
  templateRowCharges,
  templateRows,
  templateSectionCharges,
  templateSections,
  tokens,
} from "@starter/db";
import { and, asc, eq, inArray } from "drizzle-orm";

export class DraftSeeder {
  /**
   * Reads a template and all its relations from the database and returns
   * the JSON structures for `draftSections`, `draftConstants`, `draftHeaderValues`, and `draftHeaderFields`.
   */
  static async hydrateFromTemplate(
    templateId: string,
    projectId?: string,
    organizationId?: string,
  ) {
    // 1. Fetch template constants
    const tConstants = await db
      .select({
        id: templateConstants.id,
        defaultValue: templateConstants.defaultValue,
        token: tokens.tokenKey,
        name: tokens.label,
        valueType: tokens.valueType,
      })
      .from(templateConstants)
      .innerJoin(tokens, eq(tokens.id, templateConstants.id))
      .where(eq(templateConstants.templateId, templateId));

    const draftConstants: Record<string, any> = {};
    for (const tc of tConstants) {
      draftConstants[tc.token] = {
        id: crypto.randomUUID(), // New UUIDs for draft instances
        key: tc.token,
        value: tc.defaultValue,
        valueType: tc.valueType,
        description: tc.name,
      };
    }

    // 2. Fetch template header fields to initialize draftHeaderValues if needed
    const tHeaders = await db
      .select({
        id: templateHeaderFields.id,
        templateId: templateHeaderFields.templateId,
        customFieldDefinitionId: templateHeaderFields.customFieldDefinitionId,
        systemFieldKey: templateHeaderFields.systemFieldKey,
        fieldKey: customFieldDefinitions.fieldKey,
        defaultManualValue: templateHeaderFields.defaultManualValue,
        label: tokens.label,
        description: tokens.description,
        sortOrder: tokens.sortOrder,
        isInjectable: tokens.isInjectable,
        isVisible: tokens.isVisible,
        valueType: tokens.valueType,
      })
      .from(templateHeaderFields)
      .innerJoin(tokens, eq(tokens.id, templateHeaderFields.id))
      .leftJoin(
        customFieldDefinitions,
        eq(templateHeaderFields.customFieldDefinitionId, customFieldDefinitions.id),
      )
      .where(eq(templateHeaderFields.templateId, templateId))
      .orderBy(asc(tokens.sortOrder));

    // Fetch project if provided to populate header values
    let project: any = null;
    if (projectId && organizationId) {
      const [proj] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)))
        .limit(1);
      if (proj) {
        project = proj;
        const [client] = await db
          .select()
          .from(clients)
          .where(eq(clients.id, project.clientId))
          .limit(1);
        project.client = client;
      }
    }

    const draftHeaderValues: Record<string, string> = {};
    for (const th of tHeaders) {
      let val = th.defaultManualValue || "";
      if (project) {
        const lookupKey = th.fieldKey || th.systemFieldKey;
        if (lookupKey === "clientId") val = project.client?.name || "";
        else if (lookupKey === "name" || lookupKey === "status")
          val = project[lookupKey] || "";
        else if (lookupKey && project.customFields)
          val = (project.customFields as any)[lookupKey] || "";
      }
      draftHeaderValues[th.id] = String(val ?? "");
    }

    // 3. Fetch template sections
    const tSections = await db
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
      .orderBy(asc(tokens.sortOrder));

    // Fetch related rows and charges
    const tRows = await db
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
      .orderBy(asc(tokens.sortOrder));

    const rowIds = tRows.map((r) => r.id);
    let tRowCharges: any[] = [];
    if (rowIds.length > 0) {
      tRowCharges = await db
        .select({
          id: templateRowCharges.id,
          rowId: templateRowCharges.rowId,
          qualifier: templateRowCharges.qualifier,
          tags: templateRowCharges.tags,
          formula: templateRowCharges.formula,
          chargeToken: tokens.tokenKey,
          label: tokens.label,
          subDescription: tokens.description,
          sortOrder: tokens.sortOrder,
        })
        .from(templateRowCharges)
        .innerJoin(tokens, eq(tokens.id, templateRowCharges.id))
        .where(inArray(templateRowCharges.rowId, rowIds))
        .orderBy(asc(tokens.sortOrder));
    }

    const tSectionCharges = await db
      .select({
        id: templateSectionCharges.id,
        sectionId: templateSectionCharges.sectionId,
        templateId: templateSectionCharges.templateId,
        qualifier: templateSectionCharges.qualifier,
        tags: templateSectionCharges.tags,
        formula: templateSectionCharges.formula,
        chargeToken: tokens.tokenKey,
        label: tokens.label,
        subDescription: tokens.description,
        sortOrder: tokens.sortOrder,
      })
      .from(templateSectionCharges)
      .innerJoin(tokens, eq(tokens.id, templateSectionCharges.id))
      .where(eq(templateSectionCharges.templateId, templateId))
      .orderBy(asc(tokens.sortOrder));

    const draftSections: any[] = [];

    // ── Build old-template-rowId → new-draft-rowId map BEFORE processing rows.
    // Template formulas store row references as {{$tok:TEMPLATE_ROW_UUID}}.
    // The draft assigns new UUIDs to every row, so we must remap all formula
    // strings to point to the new draft UUIDs before saving.
    const oldIdToNewId: Record<string, string> = {};
    for (const tr of tRows) {
      oldIdToNewId[tr.id] = crypto.randomUUID();
    }

    /** Replace every {{$tok:OLD_UUID}} or {{$row:OLD_UUID}} occurrence with {{$tok:NEW_UUID}}. */
    function remapFormula(formula: string | null | undefined): string | null {
      if (!formula) return formula ?? null;
      return formula
        .replace(/\{\{\$tok:([^}]+)\}\}/g, (_, id) => {
          return `{{$tok:${oldIdToNewId[id] ?? id}}}`;
        })
        .replace(/\{\{\$row:([^}]+)\}\}/g, (_, id) => {
          return `{{$tok:${oldIdToNewId[id] ?? id}}}`;
        });
    }

    for (const ts of tSections) {
      const sectionId = crypto.randomUUID();

      const rows = tRows
        .filter((r) => r.sectionId === ts.id)
        .map((tr) => {
          const rowId = oldIdToNewId[tr.id]; // use the pre-assigned new ID

          const charges = tRowCharges
            .filter((rc) => rc.rowId === tr.id)
            .map((trc) => ({
              id: crypto.randomUUID(),
              chargeToken: trc.chargeToken,
              label: trc.label,
              subDescription: trc.subDescription,
              qualifier: trc.qualifier,
              tags: trc.tags || [],
              formula: remapFormula(trc.formula), // remap charge formulas too
              sortOrder: trc.sortOrder,
            }));

          return {
            id: rowId,
            sectionId,
            label: tr.label,
            rowToken: tr.rowToken,
            description: tr.description,
            valueType: tr.valueType,
            formula: remapFormula(tr.formula), // remap row formula
            initialValue: tr.initialValue,
            sortOrder: tr.sortOrder,
            charges,
          };
        });

      const sectionCharges = tSectionCharges
        .filter((sc) => sc.sectionId === ts.id)
        .map((tsc) => ({
          id: crypto.randomUUID(),
          sectionId,
          chargeToken: tsc.chargeToken,
          label: tsc.label,
          subDescription: tsc.subDescription,
          qualifier: tsc.qualifier,
          tags: tsc.tags || [],
          formula: tsc.formula,
          sortOrder: tsc.sortOrder,
        }));

      draftSections.push({
        id: sectionId,
        label: ts.label,
        sectionToken: ts.sectionToken,
        description: ts.description,
        sortOrder: ts.sortOrder,
        rows,
        sectionCharges,
      });
    }

    return {
      draftSections,
      draftConstants,
      draftHeaderValues,
      draftHeaderFields: tHeaders,
    };
  }
}
