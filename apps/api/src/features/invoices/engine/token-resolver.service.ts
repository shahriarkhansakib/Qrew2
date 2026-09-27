import type { ResolvedScopeV2 } from "@starter/db";
import {
  customFieldDefinitions,
  expenseCategories,
  expenses,
  organizationConfigs,
  projectStatuses,
  projects,
  templateConstants,
  templateHeaderFields,
  tokens,
} from "@starter/db";
import { and, eq, sql } from "drizzle-orm";
import * as math from "mathjs";

const bigMath = math.create(math.all, { number: "BigNumber", precision: 20 });

export interface ResolveScopeInput {
  projectId: string;
  organizationId: string;
  templateId: string;
  /** Any TX-aware drizzle instance (db or tx inside a transaction) */
  db: any;
  /** Manual header field overrides from the invoice draft/generator */
  headerFieldValues?: Record<string, string>;
  /** External token overrides from preview / test input panel */
  externalOverrides?: Record<string, string>;
}

/**
 * Resolves the full token scope for a given project + template combination.
 *
 * Returns Record<tokenKey, BigNumber-as-string> — never undefined for known tokens.
 *
 * 1. EXP_* — SUM of expenses per category + EXP_TOTAL
 * 2. GBL_* — organization_configs WHERE tokens.isInjectable = true
 * 3. TPL_* — template_constants for the given template
 * 4. FILE_* — from projects.customFields + direct columns per template_header_fields config
 *
 * All values stored as serialized BigNumber strings (e.g. "4200.000000")
 */
export async function resolveScope(input: ResolveScopeInput): Promise<Record<string, string>> {
  const {
    projectId,
    organizationId,
    templateId,
    db,
    headerFieldValues = {},
    externalOverrides,
  } = input;
  const scope: Record<string, string> = {};

  // -----------------------------------------------------------------------
  // 1. EXP_* — expense category sums for this project + EXP_TOTAL
  // -----------------------------------------------------------------------

  // Zero-initialize all non-system categories
  const allCategories = await db
    .select({
      id: expenseCategories.id,
      tokenKey: tokens.tokenKey,
      isSystem: tokens.isSystem,
    })
    .from(expenseCategories)
    .innerJoin(tokens, eq(tokens.id, expenseCategories.id))
    .where(eq(tokens.organizationId, organizationId));

  let expTotal = bigMath.bignumber(0);
  for (const cat of allCategories) {
    if (!cat.isSystem && cat.tokenKey) {
      scope[`EXP_${cat.tokenKey}`] = "0.000000";
      scope[cat.tokenKey] = "0.000000";
    }
  }

  // Compute actual sums and override the zeros
  const categorySums = await db
    .select({
      tokenKey: tokens.tokenKey,
      isSystem: tokens.isSystem,
      total: sql<string>`COALESCE(SUM(${expenses.amount}::numeric), 0)::text`,
    })
    .from(expenseCategories)
    .innerJoin(tokens, eq(tokens.id, expenseCategories.id))
    .leftJoin(
      expenses,
      and(
        eq(expenses.categoryId, expenseCategories.id),
        eq(expenses.projectId, projectId),
        eq(expenses.organizationId, organizationId),
      ),
    )
    .where(and(eq(tokens.organizationId, organizationId), eq(tokens.isSystem, false)))
    .groupBy(tokens.tokenKey, tokens.isSystem, expenseCategories.id);

  for (const row of categorySums) {
    if (row.tokenKey) {
      const bn = bigMath.bignumber(row.total ?? "0");
      const formatted = (bn as math.BigNumber).toFixed(6);
      scope[`EXP_${row.tokenKey}`] = formatted;
      scope[row.tokenKey] = formatted;
      expTotal = bigMath.add(expTotal, bn);
    }
  }

  // Register EXP_TOTAL
  const expTotalFormatted = (expTotal as math.BigNumber).toFixed(6);
  scope["EXP_TOTAL"] = expTotalFormatted;

  // -----------------------------------------------------------------------
  // 2. GBL_* — injectable organization constants
  // -----------------------------------------------------------------------
  const orgConfigs = await db
    .select({
      tokenKey: tokens.tokenKey,
      configValue: organizationConfigs.configValue,
    })
    .from(organizationConfigs)
    .innerJoin(tokens, eq(tokens.id, organizationConfigs.id))
    .where(
      and(
        eq(tokens.organizationId, organizationId),
        eq(tokens.isInjectable, true),
      ),
    );

  for (const conf of orgConfigs) {
    const bn = bigMath.bignumber(conf.configValue ?? "0");
    const formatted = (bn as math.BigNumber).toFixed(6);
    const bareKey = conf.tokenKey.replace(/^(GBL_|ORG_)/, "");
    scope[`GBL_${bareKey}`] = formatted;
    scope[bareKey] = formatted;
  }

  // -----------------------------------------------------------------------
  // 3. TPL_* — template constants
  // -----------------------------------------------------------------------
  const tplConsts = await db
    .select({
      tokenKey: tokens.tokenKey,
      defaultValue: templateConstants.defaultValue,
    })
    .from(templateConstants)
    .innerJoin(tokens, eq(tokens.id, templateConstants.id))
    .where(eq(templateConstants.templateId, templateId));

  for (const c of tplConsts) {
    const val = parseFloat(c.defaultValue ?? "0");
    const bn = bigMath.bignumber(isNaN(val) ? 0 : val);
    const formatted = (bn as math.BigNumber).toFixed(6);
    const bareToken = c.tokenKey.replace(/^TPL_/, "");
    scope[`TPL_${bareToken}`] = formatted;
    scope[bareToken] = formatted;
  }

  // -----------------------------------------------------------------------
  // 4. FILE_* — project fields per template header field configuration
  // -----------------------------------------------------------------------

  // Fetch the project row (for customFields + direct columns)
  const [projectData] = await db
    .select({
      project: projects,
      statusName: projectStatuses.name,
    })
    .from(projects)
    .leftJoin(projectStatuses, eq(projects.status, projectStatuses.id))
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)))
    .limit(1);

  const project = projectData?.project;
  const statusName = projectData?.statusName;

  // Fetch injectable header fields for this template
  const headerFields = await db
    .select({
      id: templateHeaderFields.id,
      tokenKey: tokens.tokenKey,
      customFieldDefinitionId: templateHeaderFields.customFieldDefinitionId,
      systemFieldKey: templateHeaderFields.systemFieldKey,
      defaultManualValue: templateHeaderFields.defaultManualValue,
      fieldKey: customFieldDefinitions.fieldKey,
    })
    .from(templateHeaderFields)
    .innerJoin(tokens, eq(tokens.id, templateHeaderFields.id))
    .leftJoin(
      customFieldDefinitions,
      eq(templateHeaderFields.customFieldDefinitionId, customFieldDefinitions.id),
    )
    .where(
      and(
        eq(templateHeaderFields.templateId, templateId),
        eq(tokens.isInjectable, true),
      ),
    );

  for (const field of headerFields) {
    const bareKey = field.tokenKey.toUpperCase().replace(/^FILE_/, "");
    const tokenKey = `FILE_${bareKey}`;

    // Check if staff provided a manual override for this field
    if (headerFieldValues[field.id] !== undefined) {
      const bn = bigMath.bignumber(headerFieldValues[field.id] || "0");
      const formatted = (bn as math.BigNumber).toFixed(6);
      scope[tokenKey] = formatted;
      scope[bareKey] = formatted;
      continue;
    }

    // Try to read from project data
    if (project) {
      let rawValue: string | number | null = null;
      const lookupKey = field.fieldKey || field.systemFieldKey;

      if (lookupKey === "status") {
        rawValue = statusName ?? project.status;
      } else if (lookupKey && lookupKey in (project as any)) {
        rawValue = (project as any)[lookupKey];
      } else if (lookupKey && project.customFields && lookupKey in project.customFields) {
        rawValue = project.customFields[lookupKey];
      }

      if (rawValue !== null && rawValue !== undefined) {
        const parsed = parseFloat(String(rawValue));
        if (!isNaN(parsed)) {
          const bn = bigMath.bignumber(parsed);
          const formatted = (bn as math.BigNumber).toFixed(6);
          scope[tokenKey] = formatted;
          scope[bareKey] = formatted;
          continue;
        }
      }
    }

    // Use field default or 0
    const defaultVal = field.defaultManualValue ?? "0";
    const parsed = parseFloat(defaultVal);
    const bn = bigMath.bignumber(isNaN(parsed) ? 0 : parsed);
    const formatted = (bn as math.BigNumber).toFixed(6);
    scope[tokenKey] = formatted;
    scope[bareKey] = formatted;
  }

  // Inject all project custom fields under bare key and FILE_<KEY> prefix
  if (project && project.customFields) {
    for (const [key, value] of Object.entries(project.customFields)) {
      if (value !== null && value !== undefined) {
        const parsed = parseFloat(String(value));
        if (!isNaN(parsed)) {
          const bn = bigMath.bignumber(parsed);
          const formatted = (bn as math.BigNumber).toFixed(6);
          const bareKey = key.toUpperCase().replace(/^FILE_/, "");
          scope[`FILE_${bareKey}`] = formatted;
          scope[bareKey] = formatted;
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // 5. External Overrides (e.g. from preview test input panel)
  // -----------------------------------------------------------------------
  if (externalOverrides) {
    for (const [k, v] of Object.entries(externalOverrides)) {
      const parsed = parseFloat(v);
      if (!isNaN(parsed)) {
        const formatted = bigMath.bignumber(parsed).toFixed(6);
        scope[k] = formatted;
        const bare = k.replace(/^(EXP_|FILE_|GBL_|TPL_)/, "");
        if (bare !== k) {
          scope[bare] = formatted;
        }
      }
    }
  }

  return scope;
}

/**
 * Resolves the scope and wraps it in a ResolvedScopeV2 object for storage
 * in invoices.resolved_scope.
 */
export async function resolveScopeWithMeta(
  input: ResolveScopeInput,
): Promise<{ scope: Record<string, string>; meta: ResolvedScopeV2 }> {
  const scope = await resolveScope(input);
  const meta: ResolvedScopeV2 = {
    schemaVersion: "2.0",
    resolvedAt: new Date().toISOString(),
    projectId: input.projectId,
    tokens: scope,
  };
  return { scope, meta };
}
