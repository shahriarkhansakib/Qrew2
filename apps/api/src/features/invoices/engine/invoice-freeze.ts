import {
  db,
  invoiceDrafts,
  invoiceLineItems,
  invoices,
  invoiceTemplates,
  templateConstants,
  templateRows,
  templateSections,
  tokens,
} from "@starter/db";
import { and, eq } from "drizzle-orm";
import { AstEvaluatorService } from "./ast-evaluator.service";
import { DagValidatorService } from "./dag-validator.service";
import { generateDocumentNumber } from "./document-number";
import { resolveScope } from "./token-resolver.service";

interface FreezeParams {
  organizationId: string;
  projectId: string;
  clientId: string;
  userId: string;
  sourceTemplateId?: string;
  sourceTemplateVersion?: number;
  headerFieldValues?: Record<string, string>;
  issuedToClientName: string;
  currency?: string;
  notes?: string;
}

/**
 * The Atomic Freeze Transaction (V2)
 *
 * Loads draft from DB, resolves scope, runs DAG validator and AST evaluator server-side.
 * Rejects with 422 if any formula remains unresolved or produces an error.
 * Persists to DB atomically — any failure = full rollback.
 */
export async function freezeInvoice(params: FreezeParams) {
  return await db.transaction(async (tx) => {
    // ─────────────────────────────────────────────────────────────────────
    // STEP 1: Load draft sections from invoice_drafts DB table
    // ─────────────────────────────────────────────────────────────────────
    const [draft] = await tx
      .select()
      .from(invoiceDrafts)
      .where(
        and(eq(invoiceDrafts.projectId, params.projectId), eq(invoiceDrafts.userId, params.userId)),
      )
      .limit(1);

    const draftSections: any[] = draft?.draftSections ?? [];

    // ─────────────────────────────────────────────────────────────────────
    // STEP 2: Server-side token resolution & DAG validation
    // ─────────────────────────────────────────────────────────────────────
    const headerFieldValues = params.headerFieldValues ?? draft?.draftHeaderValues ?? {};
    const scope = await resolveScope({
      projectId: params.projectId,
      organizationId: params.organizationId,
      templateId: params.sourceTemplateId ?? "",
      db: tx,
      headerFieldValues,
    });

    // Build lookup maps for formula decoding from draft and template
    const idToToken: Record<string, string> = {};
    const secIdToToken: Record<string, string> = {};
    const tplIdToToken: Record<string, string> = {};

    // 1. Primary source: draftSections (these contain the live draft UUIDs)
    for (const sec of draftSections) {
      if (sec.id && sec.sectionToken) {
        secIdToToken[sec.id] = `SEC_${sec.sectionToken}`;
      }
      for (const r of sec.rows ?? []) {
        if (r.id && r.rowToken) {
          idToToken[r.id] = r.rowToken;
        }
      }
    }

    // 2. Draft constants
    if (draft?.draftConstants) {
      for (const [key, val] of Object.entries(draft.draftConstants as Record<string, any>)) {
        if (val?.id) {
          tplIdToToken[val.id] = key;
        }
      }
    }

    // 3. Fallback / supplementary source: master template definitions
    if (params.sourceTemplateId) {
      const rows = await tx
        .select({ id: templateRows.id, rowToken: tokens.tokenKey })
        .from(templateRows)
        .innerJoin(tokens, eq(tokens.id, templateRows.id))
        .where(eq(templateRows.templateId, params.sourceTemplateId));
      for (const r of rows) {
        if (!idToToken[r.id]) idToToken[r.id] = r.rowToken;
      }

      const secs = await tx
        .select({ id: templateSections.id, sectionToken: tokens.tokenKey })
        .from(templateSections)
        .innerJoin(tokens, eq(tokens.id, templateSections.id))
        .where(eq(templateSections.templateId, params.sourceTemplateId));
      for (const s of secs) {
        if (!secIdToToken[s.id]) secIdToToken[s.id] = `SEC_${s.sectionToken}`;
      }

      const consts = await tx
        .select({ id: templateConstants.id, token: tokens.tokenKey })
        .from(templateConstants)
        .innerJoin(tokens, eq(tokens.id, templateConstants.id))
        .where(eq(templateConstants.templateId, params.sourceTemplateId));
      for (const c of consts) {
        if (!tplIdToToken[c.id]) tplIdToToken[c.id] = c.token;
      }
    }

    const dagResult = DagValidatorService.validate(
      draftSections,
      new Set(Object.keys(scope)),
      idToToken,
      secIdToToken,
      tplIdToToken,
    );
    if (!dagResult.valid) {
      throw new Error(
        `CANNOT_FREEZE_UNRESOLVED: Template has dependency errors: ${dagResult.errors.map((e) => e.message).join("; ")}`,
      );
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // STEP 3: Server-side AST Evaluation
    // ─────────────────────────────────────────────────────────────────────────────
    const evalResult = AstEvaluatorService.evaluate(
      draftSections,
      scope,
      idToToken,
      secIdToToken,
      tplIdToToken,
      dagResult.topologicalOrder,
    );
    if (evalResult.errors.length > 0) {
      throw new Error(
        `CANNOT_FREEZE_UNRESOLVED: Evaluation errors: ${evalResult.errors.map((e) => e.message).join("; ")}`,
      );
    }

    let totalBase = 0;
    for (const section of evalResult.evaluatedSections) {
      totalBase += parseFloat(section.sectionBase ?? "0");
    }

    const grandTotalNum = parseFloat(evalResult.grandTotal ?? "0");
    const totalChargesNum = grandTotalNum - totalBase;

    const grandTotal = grandTotalNum.toFixed(6);
    const totalBaseStr = totalBase.toFixed(6);
    const totalChargesStr = totalChargesNum.toFixed(6);

    // ─────────────────────────────────────────────────────────────────────
    // STEP 4: Insert invoice placeholder (status='draft')
    // ─────────────────────────────────────────────────────────────────────
    const [invoice] = await tx
      .insert(invoices)
      .values({
        id: crypto.randomUUID(),
        organizationId: params.organizationId,
        projectId: params.projectId,
        clientId: params.clientId,
        documentNumber: "PENDING",
        status: "draft",
        sourceTemplateId: params.sourceTemplateId ?? null,
        sourceTemplateVersion: params.sourceTemplateVersion ?? null,
        generatedByUserId: params.userId,
        issuedToClientName: params.issuedToClientName,
        currency: params.currency ?? "USD",
        totalBaseAmount: totalBaseStr,
        totalChargesAmount: totalChargesStr,
        grandTotalAmount: grandTotal,
        notes: params.notes ?? null,
        schemaVersion: "2.0",
      })
      .returning();

    // ─────────────────────────────────────────────────────────────────────
    // STEP 5: Generate document number using atomic sequence
    // ─────────────────────────────────────────────────────────────────────
    const documentNumber = await generateDocumentNumber({
      organizationId: params.organizationId,
      projectId: params.projectId,
      sourceTemplateId: params.sourceTemplateId,
      tx,
    });

    // ─────────────────────────────────────────────────────────────────────
    // STEP 6: Write line items from SERVER-evaluated sections
    // ─────────────────────────────────────────────────────────────────────
    const lineItemInserts: any[] = [];
    let displayOrder = 0;

    for (const section of evalResult.evaluatedSections) {
      for (const row of section.rows ?? []) {
        lineItemInserts.push({
          id: crypto.randomUUID(),
          invoiceId: invoice.id,
          sectionToken: section.sectionToken ?? null,
          sectionLabel: section.label ?? null,
          rowToken: row.rowToken,
          lineType: "row",
          label: row.label,
          subDescription: null,
          qualifier: null,
          formulaSnapshot: null,
          componentsSnapshot: null,
          chargesSnapshot: row.charges?.length > 0 ? row.charges : null,
          baseValue: row.baseValue,
          chargesValue: row.chargesValue,
          totalValue: row.totalValue,
          computationCurrency: params.currency ?? "USD",
          isVisible: true,
          displayOrder: displayOrder++,
        });

        for (const charge of row.charges ?? []) {
          lineItemInserts.push({
            id: crypto.randomUUID(),
            invoiceId: invoice.id,
            sectionToken: section.sectionToken ?? null,
            sectionLabel: section.label ?? null,
            rowToken: charge.chargeToken,
            lineType: "row_charge",
            label: charge.label,
            subDescription: charge.subDescription ?? null,
            qualifier: charge.qualifier ?? null,
            formulaSnapshot: charge.formulaSnapshot ?? null,
            componentsSnapshot: null,
            chargesSnapshot: null,
            baseValue: "0.000000",
            chargesValue: charge.value,
            totalValue: charge.value,
            computationCurrency: params.currency ?? "USD",
            isVisible: true,
            displayOrder: displayOrder++,
          });
        }
      }

      for (const sc of section.sectionCharges ?? []) {
        lineItemInserts.push({
          id: crypto.randomUUID(),
          invoiceId: invoice.id,
          sectionToken: section.sectionToken ?? null,
          sectionLabel: section.label ?? null,
          rowToken: sc.chargeToken,
          lineType: "section_charge",
          label: sc.label,
          subDescription: sc.subDescription ?? null,
          qualifier: sc.qualifier ?? null,
          formulaSnapshot: sc.formulaSnapshot ?? null,
          componentsSnapshot: null,
          chargesSnapshot: null,
          baseValue: "0.000000",
          chargesValue: sc.value,
          totalValue: sc.value,
          computationCurrency: params.currency ?? "USD",
          isVisible: true,
          displayOrder: displayOrder++,
        });
      }
    }

    if (lineItemInserts.length > 0) {
      await tx.insert(invoiceLineItems).values(lineItemInserts);
    }

    // ─────────────────────────────────────────────────────────────────────
    // STEP 7: Fetch template name & build historicalFormat
    // ─────────────────────────────────────────────────────────────────────
    let templateName = "Custom Invoice";
    if (params.sourceTemplateId) {
      const [tpl] = await tx
        .select({ name: invoiceTemplates.name })
        .from(invoiceTemplates)
        .where(eq(invoiceTemplates.id, params.sourceTemplateId))
        .limit(1);
      if (tpl) templateName = tpl.name;
    }

    const resolvedScope = {
      schemaVersion: "2.0",
      resolvedAt: new Date().toISOString(),
      projectId: params.projectId,
      tokens: scope,
    };

    const historicalFormat = {
      schemaVersion: "2.0",
      templateId: params.sourceTemplateId ?? "custom",
      templateVersion: params.sourceTemplateVersion ?? 1,
      templateName,
      sections: evalResult.evaluatedSections,
    };

    // ─────────────────────────────────────────────────────────────────────
    // STEP 8: Atomic status change to 'frozen'
    // ─────────────────────────────────────────────────────────────────────
    const [frozen] = await tx
      .update(invoices)
      .set({
        status: "frozen",
        documentNumber,
        historicalFormat,
        resolvedScope,
        resolvedHeaderValues: headerFieldValues,
        totalBaseAmount: totalBaseStr,
        totalChargesAmount: totalChargesStr,
        grandTotalAmount: grandTotal,
        frozenAt: new Date(),
        schemaVersion: "2.0",
      })
      .where(eq(invoices.id, invoice.id))
      .returning();

    // ─────────────────────────────────────────────────────────────────────
    // STEP 9: Delete the draft
    // ─────────────────────────────────────────────────────────────────────
    await tx
      .delete(invoiceDrafts)
      .where(
        and(eq(invoiceDrafts.projectId, params.projectId), eq(invoiceDrafts.userId, params.userId)),
      );

    return frozen;
  });
}
