import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import {
  invoiceTemplates,
  templateHeaderFields,
  templateRows,
  templateSections,
  tokens,
} from "./schema";

/**
 * Seeds general agency templates for organizations that don't have any templates configured.
 * Uses canonical tokens (EXP_TOTAL) and AST math functions (CLAMP, MIN).
 */
export async function seedAgencyTemplates(db: any, orgId: string, userId: string) {
  // Check if organization already has templates
  const existing = await db
    .select({ id: invoiceTemplates.id })
    .from(invoiceTemplates)
    .where(eq(invoiceTemplates.organizationId, orgId))
    .limit(1);

  if (existing.length > 0) {
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Template 1: Creative Agency Retainer & Pass-Through
  // ─────────────────────────────────────────────────────────────────────────
  const tpl1Id = uuidv4();
  await db.insert(invoiceTemplates).values({
    id: tpl1Id,
    organizationId: orgId,
    name: "Creative Agency Retainer & Pass-Through",
    description:
      "Full agency retainer with strategy fee, dynamic reimbursable expenses (EXP_TOTAL), and administrative handling markup.",
    documentPrefix: "INV",
    numberingFormat: "{PREFIX}-{YYYY}-{SEQ:4}",
    createdByUserId: userId,
  });

  // Header field: Project Name
  const h1TokenId = uuidv4();
  await db.insert(tokens).values({
    id: h1TokenId,
    organizationId: orgId,
    templateId: tpl1Id,
    tokenKey: "FILE_NAME",
    label: "Project Name",
    domain: "file_field",
    sortOrder: 1,
    isInjectable: false,
    isVisible: true,
  });
  await db.insert(templateHeaderFields).values({
    id: h1TokenId,
    templateId: tpl1Id,
    fieldType: "file_field",
    systemFieldKey: "name",
  });

  // Header field: Client
  const h2TokenId = uuidv4();
  await db.insert(tokens).values({
    id: h2TokenId,
    organizationId: orgId,
    templateId: tpl1Id,
    tokenKey: "FILE_CLIENT_ID",
    label: "Client",
    domain: "file_field",
    sortOrder: 2,
    isInjectable: false,
    isVisible: true,
  });
  await db.insert(templateHeaderFields).values({
    id: h2TokenId,
    templateId: tpl1Id,
    fieldType: "file_field",
    systemFieldKey: "clientId",
  });

  // Section 1: Services
  const sec1TokenId = uuidv4();
  await db.insert(tokens).values({
    id: sec1TokenId,
    organizationId: orgId,
    templateId: tpl1Id,
    tokenKey: "SERVICES",
    label: "Retainer & Strategy Services",
    domain: "section",
    sortOrder: 1,
    isInjectable: true,
    isVisible: true,
  });
  await db.insert(templateSections).values({
    id: sec1TokenId,
    templateId: tpl1Id,
  });

  // Row 1: Retainer Fee
  const r1TokenId = uuidv4();
  await db.insert(tokens).values({
    id: r1TokenId,
    organizationId: orgId,
    templateId: tpl1Id,
    tokenKey: "RETAINER_FEE",
    label: "Monthly Retainer Fee",
    domain: "row",
    sortOrder: 1,
    isInjectable: true,
    isVisible: true,
  });
  await db.insert(templateRows).values({
    id: r1TokenId,
    templateId: tpl1Id,
    sectionId: sec1TokenId,
    valueType: "normal",
    initialValue: "4500.000000",
  });

  // Row 2: Strategy Hours
  const r2TokenId = uuidv4();
  await db.insert(tokens).values({
    id: r2TokenId,
    organizationId: orgId,
    templateId: tpl1Id,
    tokenKey: "STRATEGY_HOURS",
    label: "Senior Consulting & Strategy",
    domain: "row",
    sortOrder: 2,
    isInjectable: true,
    isVisible: true,
  });
  await db.insert(templateRows).values({
    id: r2TokenId,
    templateId: tpl1Id,
    sectionId: sec1TokenId,
    valueType: "normal",
    initialValue: "1200.000000",
  });

  // Section 2: Reimbursable Expenses
  const sec2TokenId = uuidv4();
  await db.insert(tokens).values({
    id: sec2TokenId,
    organizationId: orgId,
    templateId: tpl1Id,
    tokenKey: "EXPENSES",
    label: "Reimbursable Project Expenses",
    domain: "section",
    sortOrder: 2,
    isInjectable: true,
    isVisible: true,
  });
  await db.insert(templateSections).values({
    id: sec2TokenId,
    templateId: tpl1Id,
  });

  // Row 3: Pass-Through Expenses (EXP_TOTAL)
  const r3TokenId = uuidv4();
  await db.insert(tokens).values({
    id: r3TokenId,
    organizationId: orgId,
    templateId: tpl1Id,
    tokenKey: "BILLED_EXPENSES",
    label: "Pass-Through Project Expenses",
    domain: "row",
    sortOrder: 1,
    isInjectable: true,
    isVisible: true,
  });
  await db.insert(templateRows).values({
    id: r3TokenId,
    templateId: tpl1Id,
    sectionId: sec2TokenId,
    valueType: "formula",
    formula: "EXP_TOTAL",
    initialValue: "0.000000",
  });

  // Row 4: Admin Handling Markup with CLAMP function
  const r4TokenId = uuidv4();
  await db.insert(tokens).values({
    id: r4TokenId,
    organizationId: orgId,
    templateId: tpl1Id,
    tokenKey: "ADMIN_HANDLING",
    label: "Expense Handling & Administration",
    domain: "row",
    sortOrder: 2,
    isInjectable: true,
    isVisible: true,
  });
  await db.insert(templateRows).values({
    id: r4TokenId,
    templateId: tpl1Id,
    sectionId: sec2TokenId,
    valueType: "formula",
    formula: "CLAMP(EXP_TOTAL * 0.10, 50, 500)",
    initialValue: "0.000000",
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Template 2: Time & Materials Consulting
  // ─────────────────────────────────────────────────────────────────────────
  const tpl2Id = uuidv4();
  await db.insert(invoiceTemplates).values({
    id: tpl2Id,
    organizationId: orgId,
    name: "Time & Materials Consulting",
    description:
      "Hourly professional services billing with dynamic expense pass-through and capped volume adjustment.",
    documentPrefix: "TNM",
    numberingFormat: "{PREFIX}-{YYYY}-{SEQ:4}",
    createdByUserId: userId,
  });

  // Header fields for Template 2
  const t2h1TokenId = uuidv4();
  await db.insert(tokens).values({
    id: t2h1TokenId,
    organizationId: orgId,
    templateId: tpl2Id,
    tokenKey: "FILE_NAME",
    label: "Project Name",
    domain: "file_field",
    sortOrder: 1,
    isInjectable: false,
    isVisible: true,
  });
  await db.insert(templateHeaderFields).values({
    id: t2h1TokenId,
    templateId: tpl2Id,
    fieldType: "file_field",
    systemFieldKey: "name",
  });

  // Section 1: Consulting
  const t2sec1TokenId = uuidv4();
  await db.insert(tokens).values({
    id: t2sec1TokenId,
    organizationId: orgId,
    templateId: tpl2Id,
    tokenKey: "CONSULTING",
    label: "Professional Consulting Hours",
    domain: "section",
    sortOrder: 1,
    isInjectable: true,
    isVisible: true,
  });
  await db.insert(templateSections).values({
    id: t2sec1TokenId,
    templateId: tpl2Id,
  });

  const t2r1TokenId = uuidv4();
  await db.insert(tokens).values({
    id: t2r1TokenId,
    organizationId: orgId,
    templateId: tpl2Id,
    tokenKey: "CONSULTING_BASE",
    label: "Consulting Base Deliverables",
    domain: "row",
    sortOrder: 1,
    isInjectable: true,
    isVisible: true,
  });
  await db.insert(templateRows).values({
    id: t2r1TokenId,
    templateId: tpl2Id,
    sectionId: t2sec1TokenId,
    valueType: "normal",
    initialValue: "3200.000000",
  });

  // Section 2: Disbursements
  const t2sec2TokenId = uuidv4();
  await db.insert(tokens).values({
    id: t2sec2TokenId,
    organizationId: orgId,
    templateId: tpl2Id,
    tokenKey: "DISBURSEMENTS",
    label: "Expenses & Disbursements",
    domain: "section",
    sortOrder: 2,
    isInjectable: true,
    isVisible: true,
  });
  await db.insert(templateSections).values({
    id: t2sec2TokenId,
    templateId: tpl2Id,
  });

  const t2r2TokenId = uuidv4();
  await db.insert(tokens).values({
    id: t2r2TokenId,
    organizationId: orgId,
    templateId: tpl2Id,
    tokenKey: "DIRECT_EXPENSES",
    label: "Direct Project Disbursements",
    domain: "row",
    sortOrder: 1,
    isInjectable: true,
    isVisible: true,
  });
  await db.insert(templateRows).values({
    id: t2r2TokenId,
    templateId: tpl2Id,
    sectionId: t2sec2TokenId,
    valueType: "formula",
    formula: "EXP_TOTAL",
    initialValue: "0.000000",
  });
}
