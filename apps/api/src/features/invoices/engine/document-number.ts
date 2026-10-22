import { invoiceDocumentSequences, invoiceTemplates } from "@starter/db";
import { eq, sql } from "drizzle-orm";

const MONTH_NAMES = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

export async function generateDocumentNumber(input: {
  organizationId: string;
  projectId: string;
  sourceTemplateId?: string;
  tx: any;
}): Promise<string> {
  const { organizationId, sourceTemplateId, tx } = input;

  // 1. Fetch template formatting options
  let prefix = "INV";
  let format = "{PREFIX}-{YYYY}-{SEQ:4}";

  if (sourceTemplateId) {
    const [tpl] = await tx
      .select({
        documentPrefix: invoiceTemplates.documentPrefix,
        numberingFormat: invoiceTemplates.numberingFormat,
      })
      .from(invoiceTemplates)
      .where(eq(invoiceTemplates.id, sourceTemplateId))
      .limit(1);

    if (tpl) {
      prefix = tpl.documentPrefix || "INV";
      format = tpl.numberingFormat || "{PREFIX}-{YYYY}-{SEQ:4}";
    }
  }

  // 2. Lock & update sequence atomically for the org
  let [seqRow] = await tx
    .select()
    .from(invoiceDocumentSequences)
    .where(eq(invoiceDocumentSequences.organizationId, organizationId))
    .limit(1);

  if (!seqRow) {
    const [newSeq] = await tx
      .insert(invoiceDocumentSequences)
      .values({
        id: crypto.randomUUID(),
        organizationId,
        currentValue: 1,
      })
      .returning();
    seqRow = newSeq;
  } else {
    const [updated] = await tx
      .update(invoiceDocumentSequences)
      .set({ currentValue: sql`${invoiceDocumentSequences.currentValue} + 1` })
      .where(eq(invoiceDocumentSequences.id, seqRow.id))
      .returning();
    seqRow = updated;
  }

  const seqNum = seqRow ? seqRow.currentValue : 1;

  // 3. Evaluate format tokens
  const now = new Date();
  const YYYY = now.getFullYear().toString();
  const YY = YYYY.slice(-2);
  const MM = (now.getMonth() + 1).toString().padStart(2, "0");
  const MMM = MONTH_NAMES[now.getMonth()];
  const DD = now.getDate().toString().padStart(2, "0");

  let docNumber = format
    .replace(/\{PREFIX\}/g, prefix)
    .replace(/\{YYYY\}/g, YYYY)
    .replace(/\{YY\}/g, YY)
    .replace(/\{MM\}/g, MM)
    .replace(/\{MMM\}/g, MMM)
    .replace(/\{DD\}/g, DD);

  docNumber = docNumber.replace(/\{SEQ(?::(\d+))?\}/g, (_: string, pad?: string) => {
    const width = pad ? parseInt(pad, 10) : 4;
    return seqNum.toString().padStart(width, "0");
  });

  return docNumber;
}

export async function getProjectedDocumentNumber(input: {
  organizationId: string;
  sourceTemplateId?: string;
  tx: any;
}): Promise<string> {
  const { organizationId, sourceTemplateId, tx } = input;

  let prefix = "INV";
  let format = "{PREFIX}-{YYYY}-{SEQ:4}";

  if (sourceTemplateId) {
    const [tpl] = await tx
      .select({
        documentPrefix: invoiceTemplates.documentPrefix,
        numberingFormat: invoiceTemplates.numberingFormat,
      })
      .from(invoiceTemplates)
      .where(eq(invoiceTemplates.id, sourceTemplateId))
      .limit(1);

    if (tpl) {
      prefix = tpl.documentPrefix || "INV";
      format = tpl.numberingFormat || "{PREFIX}-{YYYY}-{SEQ:4}";
    }
  }

  const [seqRow] = await tx
    .select()
    .from(invoiceDocumentSequences)
    .where(eq(invoiceDocumentSequences.organizationId, organizationId))
    .limit(1);

  const seqNum = seqRow ? seqRow.currentValue + 1 : 1;

  const now = new Date();
  const YYYY = now.getFullYear().toString();
  const YY = YYYY.slice(-2);
  const MM = (now.getMonth() + 1).toString().padStart(2, "0");
  const MMM = MONTH_NAMES[now.getMonth()];
  const DD = now.getDate().toString().padStart(2, "0");

  let docNumber = format
    .replace(/\{PREFIX\}/g, prefix)
    .replace(/\{YYYY\}/g, YYYY)
    .replace(/\{YY\}/g, YY)
    .replace(/\{MM\}/g, MM)
    .replace(/\{MMM\}/g, MMM)
    .replace(/\{DD\}/g, DD);

  docNumber = docNumber.replace(/\{SEQ(?::(\d+))?\}/g, (_: string, pad?: string) => {
    const width = pad ? parseInt(pad, 10) : 4;
    return seqNum.toString().padStart(width, "0");
  });

  return docNumber;
}
