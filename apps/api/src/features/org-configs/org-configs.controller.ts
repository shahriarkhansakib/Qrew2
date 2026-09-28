import {
  db,
  invoiceTemplates,
  organizationConfigs,
  templateRowCharges,
  templateRows,
  templateSectionCharges,
  tokens,
} from "@starter/db";
import { and, eq, sql } from "drizzle-orm";
import { type Context } from "hono";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { auth } from "../../infra/lib/auth";
import { TokenService } from "../tokens/token.service";

const createConfigSchema = z.object({
  configKey: z
    .string()
    .min(1)
    .regex(/^[A-Z0-9_]+$/, "Must be UPPER_SNAKE_CASE"),
  configValue: z.string().optional().default(""),
  displayLabel: z.string().optional(),
  valueType: z.enum(["number", "percentage", "currency_rate", "text"]),
  isFormulaInjectable: z.boolean().default(false),
});

const updateConfigSchema = z.object({
  configValue: z.string().optional(),
  displayLabel: z.string().min(1).optional(),
  isFormulaInjectable: z.boolean().optional(),
});

export async function createConfig(c: Context) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  const organizationId = session?.session?.activeOrganizationId;
  const userId = session?.user?.id;

  if (!organizationId || !userId) {
    return c.json({ error: "Missing organization ID or user ID" }, 401);
  }

  const body = await c.req.json();
  const parsed = createConfigSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid data", details: parsed.error.format() }, 400);
  }

  const bareKey = parsed.data.configKey.replace(/^(GBL_|ORG_)/, "");
  const configKey = `GBL_${bareKey}`;

  try {
    const newConfig = await TokenService.createGlobalConstant({
      id: uuidv4(),
      configKey: bareKey,
      configValue: parsed.data.configValue,
      displayLabel: parsed.data.displayLabel || bareKey,
      valueType: parsed.data.valueType,
      isFormulaInjectable: parsed.data.isFormulaInjectable,
      organizationId,
      updatedByUserId: userId,
    });

    return c.json({ ...newConfig, configKey, displayKey: bareKey }, 201);
  } catch (err: any) {
    if (err.code === "23505") {
      // Postgres unique violation
      return c.json({ error: "Config key must be unique per organization" }, 409);
    }
    console.error("Failed to create org config:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function listConfigs(c: Context) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  const organizationId = session?.session?.activeOrganizationId;

  if (!organizationId) {
    return c.json({ error: "Missing organization ID" }, 401);
  }

  const configs = await db
    .select({
      id: organizationConfigs.id,
      organizationId: organizationConfigs.organizationId,
      configKey: organizationConfigs.configKey,
      configValue: organizationConfigs.configValue,
      updatedByUserId: organizationConfigs.updatedByUserId,
      createdAt: organizationConfigs.createdAt,
      updatedAt: organizationConfigs.updatedAt,
      displayLabel: tokens.label,
      valueType: tokens.valueType,
      isFormulaInjectable: tokens.isInjectable,
      sortOrder: tokens.sortOrder,
    })
    .from(organizationConfigs)
    .innerJoin(tokens, eq(tokens.id, organizationConfigs.id))
    .where(eq(organizationConfigs.organizationId, organizationId));

  const transformed = configs.map((conf) => ({
    ...conf,
    displayKey: conf.configKey.replace(/^(GBL_|ORG_)/, ""),
  }));

  return c.json(transformed);
}

export async function updateConfig(c: Context) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  const organizationId = session?.session?.activeOrganizationId;
  const userId = session?.user?.id;

  if (!organizationId || !userId) {
    return c.json({ error: "Missing organization ID or user ID" }, 401);
  }

  const id = c.req.param("id");
  if (!id) return c.json({ error: "Missing ID" }, 400);

  const body = await c.req.json();
  const parsed = updateConfigSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid data", details: parsed.error.format() }, 400);
  }

  const tokenPatch: any = {};
  if (parsed.data.displayLabel !== undefined) tokenPatch.label = parsed.data.displayLabel;
  if (parsed.data.isFormulaInjectable !== undefined)
    tokenPatch.isInjectable = parsed.data.isFormulaInjectable;

  const configPatch: any = { updatedByUserId: userId };
  if (parsed.data.configValue !== undefined) configPatch.configValue = parsed.data.configValue;

  await db.transaction(async (tx) => {
    if (Object.keys(tokenPatch).length > 0) {
      await TokenService.updateToken(id, tokenPatch, tx);
    }
    await tx
      .update(organizationConfigs)
      .set(configPatch)
      .where(
        and(eq(organizationConfigs.id, id), eq(organizationConfigs.organizationId, organizationId)),
      );
  });

  const [updatedConfig] = await db
    .select({
      id: organizationConfigs.id,
      organizationId: organizationConfigs.organizationId,
      configKey: organizationConfigs.configKey,
      configValue: organizationConfigs.configValue,
      updatedByUserId: organizationConfigs.updatedByUserId,
      createdAt: organizationConfigs.createdAt,
      updatedAt: organizationConfigs.updatedAt,
      displayLabel: tokens.label,
      valueType: tokens.valueType,
      isFormulaInjectable: tokens.isInjectable,
      sortOrder: tokens.sortOrder,
    })
    .from(organizationConfigs)
    .innerJoin(tokens, eq(tokens.id, organizationConfigs.id))
    .where(
      and(eq(organizationConfigs.id, id), eq(organizationConfigs.organizationId, organizationId)),
    );

  if (!updatedConfig) {
    return c.json({ error: "Config not found" }, 404);
  }

  return c.json({
    ...updatedConfig,
    displayKey: updatedConfig.configKey.replace(/^(GBL_|ORG_)/, ""),
  });
}

export async function deleteConfig(c: Context) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  const organizationId = session?.session?.activeOrganizationId;

  if (!organizationId) {
    return c.json({ error: "Missing organization ID" }, 401);
  }

  const id = c.req.param("id");
  if (!id) return c.json({ error: "Missing ID" }, 400);

  // 1. Get the config to know its key
  const [config] = await db
    .select()
    .from(organizationConfigs)
    .where(
      and(eq(organizationConfigs.id, id), eq(organizationConfigs.organizationId, organizationId)),
    );

  if (!config) {
    return c.json({ error: "Config not found" }, 404);
  }

  const bareKey = config.configKey.replace(/^(GBL_|ORG_)/, "");
  const gblTokenToFind = `%GBL_${bareKey}%`;
  const uuidTokenToFind = `%{{$tok:${id}}}%`;

  // 2. Block if used in any template formula
  const [rowsUsingConfig, rowChargesUsingConfig, secChargesUsingConfig] = await Promise.all([
    db
      .select({ id: templateRows.id })
      .from(templateRows)
      .innerJoin(invoiceTemplates, eq(invoiceTemplates.id, templateRows.templateId))
      .where(
        and(
          eq(invoiceTemplates.organizationId, organizationId),
          sql`(${templateRows.formula} LIKE ${gblTokenToFind} OR ${templateRows.formula} LIKE ${uuidTokenToFind})`,
        ),
      )
      .limit(1),
    db
      .select({ id: templateRowCharges.id })
      .from(templateRowCharges)
      .innerJoin(templateRows, eq(templateRowCharges.rowId, templateRows.id))
      .innerJoin(invoiceTemplates, eq(templateRows.templateId, invoiceTemplates.id))
      .where(
        and(
          eq(invoiceTemplates.organizationId, organizationId),
          sql`(${templateRowCharges.formula} LIKE ${gblTokenToFind} OR ${templateRowCharges.formula} LIKE ${uuidTokenToFind})`,
        ),
      )
      .limit(1),
    db
      .select({ id: templateSectionCharges.id })
      .from(templateSectionCharges)
      .innerJoin(invoiceTemplates, eq(templateSectionCharges.templateId, invoiceTemplates.id))
      .where(
        and(
          eq(invoiceTemplates.organizationId, organizationId),
          sql`(${templateSectionCharges.formula} LIKE ${gblTokenToFind} OR ${templateSectionCharges.formula} LIKE ${uuidTokenToFind})`,
        ),
      )
      .limit(1),
  ]);

  if (
    rowsUsingConfig.length > 0 ||
    rowChargesUsingConfig.length > 0 ||
    secChargesUsingConfig.length > 0
  ) {
    return c.json(
      { error: "Cannot delete config because it is used in one or more template formulas" },
      409,
    );
  }

  // 3. Delete the config via TokenService (cascades to organizationConfigs)
  await TokenService.deleteToken(id);

  return c.json({ success: true });
}
