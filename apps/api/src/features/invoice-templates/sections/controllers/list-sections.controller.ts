import {
  db,
  invoiceTemplates,
  templateRowCharges,
  templateRows,
  templateSectionCharges,
  templateSections,
} from "@starter/db";
import { and, asc, eq } from "drizzle-orm";
import { Context } from "hono";
import { getTemplateFormulaContext } from "../../services/template-formula-context.service";

export async function listSections(c: Context) {
  const templateId = c.req.param("templateId") as string;
  const organizationId = c.get("organizationId");
  if (!organizationId) return c.json({ error: "Unauthorized" }, 401);

  const template = await db.query.invoiceTemplates.findFirst({
    where: and(
      eq(invoiceTemplates.id, templateId),
      eq(invoiceTemplates.organizationId, organizationId),
    ),
  });
  if (!template) return c.json({ error: "Template not found" }, 404);

  const sections = await db.query.templateSections.findMany({
    where: eq(templateSections.templateId, templateId),
    with: {
      token: true,
      rows: {
        with: {
          token: true,
          charges: {
            with: {
              token: true,
            },
          },
        },
      },
      sectionCharges: {
        with: {
          token: true,
        },
      },
    },
  });

  // Sort sections, rows, row charges, section charges by token.sortOrder
  sections.sort((a, b) => (a.token?.sortOrder ?? 0) - (b.token?.sortOrder ?? 0));
  for (const sec of sections) {
    (sec.rows || []).sort((a, b) => (a.token?.sortOrder ?? 0) - (b.token?.sortOrder ?? 0));
    for (const row of sec.rows || []) {
      (row.charges || []).sort((a, b) => (a.token?.sortOrder ?? 0) - (b.token?.sortOrder ?? 0));
    }
    (sec.sectionCharges || []).sort(
      (a, b) => (a.token?.sortOrder ?? 0) - (b.token?.sortOrder ?? 0),
    );
  }

  const context = await getTemplateFormulaContext(templateId, organizationId);

  const decodedSections = sections.map((sec) => ({
    ...sec,
    sectionToken: sec.token?.tokenKey ?? (sec as any).sectionToken,
    label: sec.token?.label ?? (sec as any).label,
    description: sec.token?.description ?? (sec as any).description,
    sortOrder: sec.token?.sortOrder ?? (sec as any).sortOrder ?? 0,
    rows: (sec.rows || []).map((row) => ({
      ...row,
      formula: context.decode(row.formula),
      rowToken: row.token?.tokenKey ?? (row as any).rowToken,
      label: row.token?.label ?? (row as any).label,
      description: row.token?.description ?? (row as any).description,
      sortOrder: row.token?.sortOrder ?? (row as any).sortOrder ?? 0,
      charges: (row.charges || []).map((ch) => ({
        ...ch,
        formula: context.decode(ch.formula) ?? ch.formula,
        chargeToken: ch.token?.tokenKey ?? (ch as any).chargeToken,
        label: ch.token?.label ?? (ch as any).label,
        subDescription: ch.token?.description ?? (ch as any).subDescription,
        sortOrder: ch.token?.sortOrder ?? (ch as any).sortOrder ?? 0,
      })),
    })),
    sectionCharges: (sec.sectionCharges || []).map((sc) => ({
      ...sc,
      formula: context.decode(sc.formula) ?? sc.formula,
      chargeToken: sc.token?.tokenKey ?? (sc as any).chargeToken,
      label: sc.token?.label ?? (sc as any).label,
      subDescription: sc.token?.description ?? (sc as any).subDescription,
      sortOrder: sc.token?.sortOrder ?? (sc as any).sortOrder ?? 0,
    })),
  }));

  return c.json(decodedSections);
}
