import {
  db,
  expenseCategories,
  organizationConfigs,
  templateConstants,
  templateHeaderFields,
  templateRowCharges,
  templateRows,
  templateSectionCharges,
  templateSections,
  tokens,
  type TokenDomain,
} from "@starter/db";
import { and, eq, isNull, or } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

export interface CreateTokenBaseInput {
  id?: string;
  tokenKey: string;
  label: string;
  description?: string | null;
  domain: TokenDomain;
  organizationId: string;
  templateId?: string | null;
  sortOrder?: number;
  valueType?: "number" | "percentage" | "currency_rate" | "text";
  isInjectable?: boolean;
  isSystem?: boolean;
  isVisible?: boolean;
}

export interface CreateRowTokenInput {
  id?: string;
  templateId: string;
  sectionId: string;
  rowToken: string;
  label: string;
  description?: string | null;
  valueType?: "normal" | "formula";
  formula?: string | null;
  initialValue?: string | null;
  organizationId: string;
  sortOrder?: number;
}

export interface CreateSectionTokenInput {
  id?: string;
  templateId: string;
  sectionToken: string;
  label?: string | null;
  description?: string | null;
  organizationId: string;
  sortOrder?: number;
}

export interface CreateRowChargeTokenInput {
  id?: string;
  rowId: string;
  chargeToken: string;
  label: string;
  subDescription?: string | null;
  qualifier?: string | null;
  tags?: string[] | null;
  formula: string;
  templateId: string;
  organizationId: string;
  sortOrder?: number;
}

export interface CreateSectionChargeTokenInput {
  id?: string;
  sectionId: string;
  templateId: string;
  chargeToken: string;
  label: string;
  subDescription?: string | null;
  qualifier?: string | null;
  tags?: string[] | null;
  formula: string;
  organizationId: string;
  sortOrder?: number;
}

export interface CreateTemplateConstantInput {
  id?: string;
  templateId: string;
  token: string;
  name: string;
  defaultValue?: string | null;
  valueType?: "number" | "percentage" | "currency_rate" | "text";
  organizationId: string;
  sortOrder?: number;
}

export interface CreateFileFieldTokenInput {
  id?: string;
  templateId: string;
  fieldType: "file_field" | "org_constant" | "manual";
  label: string;
  tokenKey: string;
  description?: string | null;
  columnPosition?: string;
  customFieldDefinitionId?: string | null;
  systemFieldKey?: string | null;
  orgConfigKey?: string | null;
  defaultManualValue?: string | null;
  placeholder?: string | null;
  isInjectable?: boolean;
  organizationId: string;
  sortOrder?: number;
}

export interface CreateGlobalConstantInput {
  id?: string;
  configKey: string;
  configValue: string;
  displayLabel: string;
  description?: string | null;
  valueType?: "number" | "percentage" | "currency_rate" | "text";
  isFormulaInjectable?: boolean;
  organizationId: string;
  updatedByUserId?: string | null;
  sortOrder?: number;
}

export interface CreateExpenseCategoryInput {
  id?: string;
  tokenKey: string;
  label: string;
  description?: string | null;
  organizationId: string;
  isSystem?: boolean;
  sortOrder?: number;
}

export function getEvalPrefix(domain: TokenDomain, tokenKey: string): string {
  switch (domain) {
    case "global_constant":
      return tokenKey.startsWith("GBL_") ? tokenKey : `GBL_${tokenKey}`;
    case "expense_category":
      return tokenKey === "EXP_TOTAL"
        ? "EXP_TOTAL"
        : tokenKey.startsWith("EXP_")
          ? tokenKey
          : `EXP_${tokenKey}`;
    case "template_constant":
      return tokenKey.startsWith("TPL_") ? tokenKey : `TPL_${tokenKey}`;
    case "file_field":
      return tokenKey.startsWith("FILE_") ? tokenKey : `FILE_${tokenKey}`;
    default:
      return tokenKey;
  }
}

export class TokenService {
  static async createToken(input: CreateTokenBaseInput, tx: any = db) {
    const id = input.id ?? uuidv4();
    const [created] = await tx
      .insert(tokens)
      .values({
        id,
        tokenKey: input.tokenKey,
        label: input.label,
        description: input.description ?? null,
        domain: input.domain,
        organizationId: input.organizationId,
        templateId: input.templateId ?? null,
        sortOrder: input.sortOrder ?? 0,
        valueType: input.valueType ?? "number",
        isInjectable: input.isInjectable ?? true,
        isSystem: input.isSystem ?? false,
        isVisible: input.isVisible ?? true,
      })
      .returning();
    return created;
  }

  static async updateToken(
    id: string,
    patch: {
      tokenKey?: string;
      label?: string;
      description?: string | null;
      sortOrder?: number;
      valueType?: "number" | "percentage" | "currency_rate" | "text";
      isInjectable?: boolean;
      isVisible?: boolean;
    },
    tx: any = db,
  ) {
    const [updated] = await tx
      .update(tokens)
      .set({
        ...patch,
        updatedAt: new Date(),
      })
      .where(eq(tokens.id, id))
      .returning();
    return updated;
  }

  static async deleteToken(id: string, tx: any = db) {
    const query = tx.delete(tokens).where(eq(tokens.id, id));
    if (typeof query?.returning === "function") {
      const [deleted] = await query.returning();
      return deleted ?? null;
    }
    return query;
  }

  static async renameToken(id: string, newTokenKey: string, newLabel: string, tx: any = db) {
    return this.updateToken(id, { tokenKey: newTokenKey, label: newLabel }, tx);
  }

  static async createRowToken(input: CreateRowTokenInput, tx: any = db) {
    const id = input.id ?? uuidv4();
    await this.createToken(
      {
        id,
        tokenKey: input.rowToken,
        label: input.label,
        description: input.description,
        domain: "row",
        organizationId: input.organizationId,
        templateId: input.templateId,
        sortOrder: input.sortOrder,
        isInjectable: true,
      },
      tx,
    );

    const [row] = await tx
      .insert(templateRows)
      .values({
        id,
        templateId: input.templateId,
        sectionId: input.sectionId,
        valueType: input.valueType ?? "normal",
        formula: input.formula ?? null,
        initialValue: input.initialValue ?? null,
      })
      .returning();

    return {
      ...row,
      rowToken: input.rowToken,
      label: input.label,
      description: input.description ?? null,
      sortOrder: input.sortOrder ?? 0,
    };
  }

  static async createSectionToken(input: CreateSectionTokenInput, tx: any = db) {
    const id = input.id ?? uuidv4();
    await this.createToken(
      {
        id,
        tokenKey: input.sectionToken,
        label: input.label ?? input.sectionToken,
        description: input.description,
        domain: "section",
        organizationId: input.organizationId,
        templateId: input.templateId,
        sortOrder: input.sortOrder,
        isInjectable: true,
      },
      tx,
    );

    const [section] = await tx
      .insert(templateSections)
      .values({
        id,
        templateId: input.templateId,
      })
      .returning();

    return {
      ...section,
      sectionToken: input.sectionToken,
      label: input.label ?? null,
      description: input.description ?? null,
      sortOrder: input.sortOrder ?? 0,
    };
  }

  static async createRowChargeToken(input: CreateRowChargeTokenInput, tx: any = db) {
    const id = input.id ?? uuidv4();
    await this.createToken(
      {
        id,
        tokenKey: input.chargeToken,
        label: input.label,
        description: input.subDescription,
        domain: "row_charge",
        organizationId: input.organizationId,
        templateId: input.templateId,
        sortOrder: input.sortOrder,
        isInjectable: true,
      },
      tx,
    );

    const [charge] = await tx
      .insert(templateRowCharges)
      .values({
        id,
        rowId: input.rowId,
        qualifier: input.qualifier ?? null,
        tags: input.tags ?? null,
        formula: input.formula,
      })
      .returning();

    return {
      ...charge,
      chargeToken: input.chargeToken,
      label: input.label,
      subDescription: input.subDescription ?? null,
      sortOrder: input.sortOrder ?? 0,
    };
  }

  static async createSectionChargeToken(input: CreateSectionChargeTokenInput, tx: any = db) {
    const id = input.id ?? uuidv4();
    await this.createToken(
      {
        id,
        tokenKey: input.chargeToken,
        label: input.label,
        description: input.subDescription,
        domain: "section_charge",
        organizationId: input.organizationId,
        templateId: input.templateId,
        sortOrder: input.sortOrder,
        isInjectable: true,
      },
      tx,
    );

    const [charge] = await tx
      .insert(templateSectionCharges)
      .values({
        id,
        sectionId: input.sectionId,
        templateId: input.templateId,
        qualifier: input.qualifier ?? null,
        tags: input.tags ?? null,
        formula: input.formula,
      })
      .returning();

    return {
      ...charge,
      chargeToken: input.chargeToken,
      label: input.label,
      subDescription: input.subDescription ?? null,
      sortOrder: input.sortOrder ?? 0,
    };
  }

  static async createTemplateConstant(input: CreateTemplateConstantInput, tx: any = db) {
    const id = input.id ?? uuidv4();
    await this.createToken(
      {
        id,
        tokenKey: input.token,
        label: input.name,
        domain: "template_constant",
        organizationId: input.organizationId,
        templateId: input.templateId,
        valueType: input.valueType ?? "number",
        sortOrder: input.sortOrder,
        isInjectable: true,
      },
      tx,
    );

    const [constant] = await tx
      .insert(templateConstants)
      .values({
        id,
        templateId: input.templateId,
        defaultValue: input.defaultValue ?? null,
      })
      .returning();

    return {
      ...constant,
      token: input.token,
      name: input.name,
      valueType: input.valueType ?? "number",
      sortOrder: input.sortOrder ?? 0,
    };
  }

  static async createFileFieldToken(input: CreateFileFieldTokenInput, tx: any = db) {
    const id = input.id ?? uuidv4();
    await this.createToken(
      {
        id,
        tokenKey: input.tokenKey,
        label: input.label,
        description: input.description,
        domain: "file_field",
        organizationId: input.organizationId,
        templateId: input.templateId,
        sortOrder: input.sortOrder,
        isInjectable: input.isInjectable ?? true,
      },
      tx,
    );

    const [field] = await tx
      .insert(templateHeaderFields)
      .values({
        id,
        templateId: input.templateId,
        fieldType: input.fieldType,
        columnPosition: input.columnPosition ?? "left",
        customFieldDefinitionId: input.customFieldDefinitionId ?? null,
        systemFieldKey: input.systemFieldKey ?? null,
        orgConfigKey: input.orgConfigKey ?? null,
        defaultManualValue: input.defaultManualValue ?? null,
        placeholder: input.placeholder ?? null,
      })
      .returning();

    return {
      ...field,
      tokenKey: input.tokenKey,
      label: input.label,
      description: input.description ?? null,
      sortOrder: input.sortOrder ?? 0,
      isInjectable: input.isInjectable ?? true,
    };
  }

  static async createGlobalConstant(input: CreateGlobalConstantInput, tx: any = db) {
    const id = input.id ?? uuidv4();
    await this.createToken(
      {
        id,
        tokenKey: input.configKey,
        label: input.displayLabel,
        description: input.description,
        domain: "global_constant",
        organizationId: input.organizationId,
        templateId: null,
        valueType: input.valueType ?? "number",
        sortOrder: input.sortOrder,
        isInjectable: input.isFormulaInjectable ?? false,
      },
      tx,
    );

    const [config] = await tx
      .insert(organizationConfigs)
      .values({
        id,
        organizationId: input.organizationId,
        configKey: input.configKey,
        configValue: input.configValue,
        updatedByUserId: input.updatedByUserId ?? null,
      })
      .returning();

    return {
      ...config,
      displayLabel: input.displayLabel,
      valueType: input.valueType ?? "number",
      isFormulaInjectable: input.isFormulaInjectable ?? false,
      sortOrder: input.sortOrder ?? 0,
    };
  }

  static async createExpenseCategory(input: CreateExpenseCategoryInput, tx: any = db) {
    const id = input.id ?? uuidv4();
    await this.createToken(
      {
        id,
        tokenKey: input.tokenKey,
        label: input.label,
        description: input.description,
        domain: "expense_category",
        organizationId: input.organizationId,
        templateId: null,
        sortOrder: input.sortOrder,
        isInjectable: true,
        isSystem: input.isSystem ?? false,
      },
      tx,
    );

    const [category] = await tx
      .insert(expenseCategories)
      .values({
        id,
        organizationId: input.organizationId,
      })
      .returning();

    return {
      ...category,
      tokenKey: input.tokenKey,
      name: input.label,
      description: input.description ?? null,
      isSystem: input.isSystem ?? false,
      sortOrder: input.sortOrder ?? 0,
    };
  }

  static async getTemplateTokenMaps(templateId: string, organizationId: string, tx: any = db) {
    const rows = await tx
      .select()
      .from(tokens)
      .where(
        or(
          eq(tokens.templateId, templateId),
          and(eq(tokens.organizationId, organizationId), isNull(tokens.templateId)),
        ),
      );

    const tokenMap: Record<string, string> = {};
    const idToToken: Record<string, string> = {};
    const idToEvalToken: Record<string, string> = {};

    for (const row of rows) {
      tokenMap[row.tokenKey] = row.id;
      idToToken[row.id] = row.tokenKey;

      const evalPrefix = getEvalPrefix(row.domain, row.tokenKey);
      idToEvalToken[row.id] = evalPrefix;

      // Also register prefixed aliases in tokenMap for robust encoding
      if (row.domain === "file_field") {
        tokenMap[`FILE_${row.tokenKey}`] = row.id;
      } else if (row.domain === "global_constant") {
        tokenMap[`GBL_${row.tokenKey}`] = row.id;
        tokenMap[`ORG_${row.tokenKey}`] = row.id;
      } else if (row.domain === "template_constant") {
        tokenMap[`TPL_${row.tokenKey}`] = row.id;
      } else if (row.domain === "expense_category" && row.tokenKey !== "EXP_TOTAL") {
        tokenMap[`EXP_${row.tokenKey}`] = row.id;
      }
    }

    return { tokenMap, idToToken, idToEvalToken };
  }
}
