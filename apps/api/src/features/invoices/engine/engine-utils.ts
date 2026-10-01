import {
  db,
  type RowIdToTokenMap,
  type SecIdToTokenMap,
  type TplIdToTokenMap,
  templateConstants,
  templateRowCharges,
  templateRows,
  templateSectionCharges,
  templateSections,
  tokens,
} from "@starter/db";
import { eq, inArray } from "drizzle-orm";
import { DagValidatorService } from "./dag-validator.service";
import { type DagValidationResult, type EvaluatorSection } from "./types";

export async function validateTemplateDag(
  templateId: string,
  tx: any = db,
): Promise<DagValidationResult> {
  const [dbSections, dbRows, dbSectionCharges, dbConstants] = await Promise.all([
    tx
      .select({
        id: templateSections.id,
        templateId: templateSections.templateId,
        sectionToken: tokens.tokenKey,
        label: tokens.label,
        sortOrder: tokens.sortOrder,
      })
      .from(templateSections)
      .innerJoin(tokens, eq(tokens.id, templateSections.id))
      .where(eq(templateSections.templateId, templateId))
      .orderBy(tokens.sortOrder),
    tx
      .select({
        id: templateRows.id,
        templateId: templateRows.templateId,
        sectionId: templateRows.sectionId,
        valueType: templateRows.valueType,
        formula: templateRows.formula,
        initialValue: templateRows.initialValue,
        rowToken: tokens.tokenKey,
        label: tokens.label,
        sortOrder: tokens.sortOrder,
      })
      .from(templateRows)
      .innerJoin(tokens, eq(tokens.id, templateRows.id))
      .where(eq(templateRows.templateId, templateId))
      .orderBy(tokens.sortOrder),
    tx
      .select({
        id: templateSectionCharges.id,
        templateId: templateSectionCharges.templateId,
        sectionId: templateSectionCharges.sectionId,
        formula: templateSectionCharges.formula,
        chargeToken: tokens.tokenKey,
        label: tokens.label,
        sortOrder: tokens.sortOrder,
      })
      .from(templateSectionCharges)
      .innerJoin(tokens, eq(tokens.id, templateSectionCharges.id))
      .where(eq(templateSectionCharges.templateId, templateId))
      .orderBy(tokens.sortOrder),
    tx
      .select({
        id: templateConstants.id,
        templateId: templateConstants.templateId,
        token: tokens.tokenKey,
        name: tokens.label,
      })
      .from(templateConstants)
      .innerJoin(tokens, eq(tokens.id, templateConstants.id))
      .where(eq(templateConstants.templateId, templateId)),
  ]);

  const rowIds = dbRows.map((r: any) => r.id);
  const dbRowCharges =
    rowIds.length > 0
      ? await tx
          .select({
            id: templateRowCharges.id,
            rowId: templateRowCharges.rowId,
            formula: templateRowCharges.formula,
            chargeToken: tokens.tokenKey,
            label: tokens.label,
            sortOrder: tokens.sortOrder,
          })
          .from(templateRowCharges)
          .innerJoin(tokens, eq(tokens.id, templateRowCharges.id))
          .where(inArray(templateRowCharges.rowId, rowIds))
          .orderBy(tokens.sortOrder)
      : [];

  const idToToken: RowIdToTokenMap = {};
  for (const row of dbRows) {
    idToToken[row.id] = row.rowToken;
  }

  const secIdToToken: SecIdToTokenMap = {};
  for (const sec of dbSections) {
    if (sec.sectionToken) secIdToToken[sec.id] = `SEC_${sec.sectionToken}`;
  }

  const tplIdToToken: TplIdToTokenMap = {};
  for (const c of dbConstants) {
    if (c.token) tplIdToToken[c.id] = c.token;
  }

  const evaluatorSections: EvaluatorSection[] = dbSections.map((sec: any) => {
    const secRows = dbRows
      .filter((r: any) => r.sectionId === sec.id)
      .map((row: any) => ({
        id: row.id,
        rowToken: row.rowToken,
        label: row.label,
        sectionId: sec.id,
        valueType: row.valueType,
        formula: row.formula ?? undefined,
        initialValue: row.initialValue ?? undefined,
        manualValue: null,
        sortOrder: row.sortOrder,
        charges: dbRowCharges
          .filter((rc: any) => rc.rowId === row.id)
          .map((rc: any) => ({
            id: rc.id,
            chargeToken: rc.chargeToken ?? undefined,
            label: rc.label,
            formula: rc.formula ?? undefined,
            sortOrder: rc.sortOrder,
          })),
      }));

    const sCharges = dbSectionCharges
      .filter((sc: any) => sc.sectionId === sec.id)
      .map((sc: any) => ({
        id: sc.id,
        chargeToken: sc.chargeToken,
        label: sc.label,
        formula: sc.formula ?? undefined,
        sortOrder: sc.sortOrder,
      }));

    return {
      id: sec.id,
      sectionToken: sec.sectionToken,
      sortOrder: sec.sortOrder,
      rows: secRows as any,
      sectionCharges: sCharges as any,
    };
  });

  return DagValidatorService.validate(
    evaluatorSections as any,
    new Set(),
    idToToken,
    secIdToToken,
    tplIdToToken,
  );
}
