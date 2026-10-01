import {
  db,
  expenseCategories,
  templateRowCharges,
  templateRows,
  templateSectionCharges,
  tokens,
} from "@starter/db";
import { and, eq, like, or } from "drizzle-orm";
import { type Context } from "hono";
import { z } from "zod";
import { auth } from "../../infra/lib/auth";
import { TokenService } from "../tokens/token.service";

const createCategorySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  tokenKey: z
    .string()
    .regex(/^[A-Z0-9_]+$/, "Must be UPPER_SNAKE_CASE")
    .optional(),
});

const updateCategorySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  tokenKey: z
    .string()
    .regex(/^[A-Z0-9_]+$/, "Must be UPPER_SNAKE_CASE")
    .optional(),
});

const RESERVED_PREFIXES = ["GBL_", "FILE_", "TPL_", "EXP_", "SEC_"];

function generateTokenKey(name: string) {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export async function createCategory(c: Context) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  const organizationId = session?.session?.activeOrganizationId;

  if (!organizationId) {
    return c.json({ error: "Missing organization ID" }, 401);
  }

  const body = await c.req.json();
  const parsed = createCategorySchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid data", details: parsed.error.format() }, 400);
  }

  let tokenKey = parsed.data.tokenKey;
  if (!tokenKey) {
    tokenKey = generateTokenKey(parsed.data.name);
  }

  if (RESERVED_PREFIXES.some((p) => tokenKey!.startsWith(p))) {
    return c.json(
      { error: "Token key cannot start with reserved prefixes (GBL_, FILE_, TPL_, EXP_, SEC_)" },
      400,
    );
  }

  try {
    const created = await TokenService.createExpenseCategory({
      tokenKey,
      label: parsed.data.name,
      description: parsed.data.description,
      organizationId,
      isSystem: false,
    });

    return c.json(
      {
        id: created.id,
        organizationId,
        name: created.name,
        description: created.description,
        tokenKey: created.tokenKey,
      },
      201,
    );
  } catch (error: any) {
    if (error.code === "23505") {
      return c.json({ error: "Category with this token already exists" }, 409);
    }
    throw error;
  }
}

export async function updateCategory(c: Context) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  const organizationId = session?.session?.activeOrganizationId;

  if (!organizationId) {
    return c.json({ error: "Missing organization ID" }, 401);
  }

  const id = c.req.param("id");
  if (!id) {
    return c.json({ error: "Missing ID" }, 400);
  }

  const body = await c.req.json();
  const parsed = updateCategorySchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid data", details: parsed.error.format() }, 400);
  }

  const cat = await db
    .select({
      id: expenseCategories.id,
      isSystem: tokens.isSystem,
    })
    .from(expenseCategories)
    .innerJoin(tokens, eq(tokens.id, expenseCategories.id))
    .where(and(eq(expenseCategories.id, id), eq(expenseCategories.organizationId, organizationId)))
    .limit(1);

  if (cat.length === 0) {
    return c.json({ error: "Category not found" }, 404);
  }

  if (cat[0].isSystem) {
    return c.json({ error: "Cannot modify system expense categories" }, 403);
  }

  if (parsed.data.tokenKey && RESERVED_PREFIXES.some((p) => parsed.data.tokenKey!.startsWith(p))) {
    return c.json(
      { error: "Token key cannot start with reserved prefixes (GBL_, FILE_, TPL_, EXP_, SEC_)" },
      400,
    );
  }

  try {
    const patch: any = {};
    if (parsed.data.name !== undefined) patch.label = parsed.data.name;
    if (parsed.data.description !== undefined) patch.description = parsed.data.description;
    if (parsed.data.tokenKey !== undefined) patch.tokenKey = parsed.data.tokenKey;

    const updated = await TokenService.updateToken(id, patch);

    return c.json({
      id,
      organizationId,
      name: updated.label,
      description: updated.description,
      tokenKey: updated.tokenKey,
    });
  } catch (error: any) {
    if (error.code === "23505") {
      return c.json({ error: "Category with this token already exists" }, 409);
    }
    throw error;
  }
}

export async function listCategories(c: Context) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  const organizationId = session?.session?.activeOrganizationId;

  if (!organizationId) {
    return c.json({ error: "Missing organization ID" }, 401);
  }

  const categories = await db
    .select({
      id: expenseCategories.id,
      organizationId: expenseCategories.organizationId,
      name: tokens.label,
      description: tokens.description,
      tokenKey: tokens.tokenKey,
    })
    .from(expenseCategories)
    .innerJoin(tokens, eq(tokens.id, expenseCategories.id))
    .where(and(eq(expenseCategories.organizationId, organizationId), eq(tokens.isSystem, false)))
    .orderBy(tokens.sortOrder);

  return c.json(categories);
}

export async function deleteCategory(c: Context) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  const organizationId = session?.session?.activeOrganizationId;

  if (!organizationId) {
    return c.json({ error: "Missing organization ID" }, 401);
  }

  const id = c.req.param("id");

  if (!id) {
    return c.json({ error: "Missing ID" }, 400);
  }

  const cat = await db
    .select({
      id: expenseCategories.id,
      isSystem: tokens.isSystem,
    })
    .from(expenseCategories)
    .innerJoin(tokens, eq(tokens.id, expenseCategories.id))
    .where(and(eq(expenseCategories.id, id), eq(expenseCategories.organizationId, organizationId)))
    .limit(1);

  if (cat.length === 0) {
    return c.json({ error: "Category not found" }, 404);
  }

  if (cat[0].isSystem) {
    return c.json({ error: "Cannot delete system expense categories" }, 403);
  }

  // Check if category is used in formulas
  const [rows, rowCharges, secCharges] = await Promise.all([
    db
      .select({ id: templateRows.id })
      .from(templateRows)
      .where(
        or(
          like(templateRows.formula, `%{{$tok:${id}}}%`),
          like(templateRows.formula, `%{{$exp:${id}}}%`),
        ),
      ),
    db
      .select({ id: templateRowCharges.id })
      .from(templateRowCharges)
      .where(
        or(
          like(templateRowCharges.formula, `%{{$tok:${id}}}%`),
          like(templateRowCharges.formula, `%{{$exp:${id}}}%`),
        ),
      ),
    db
      .select({ id: templateSectionCharges.id })
      .from(templateSectionCharges)
      .where(
        or(
          like(templateSectionCharges.formula, `%{{$tok:${id}}}%`),
          like(templateSectionCharges.formula, `%{{$exp:${id}}}%`),
        ),
      ),
  ]);

  if (rows.length > 0 || rowCharges.length > 0 || secCharges.length > 0) {
    return c.json(
      {
        error:
          "Cannot delete this category because it is referenced in one or more invoice template formulas.",
      },
      409,
    );
  }

  try {
    await TokenService.deleteToken(id);
    return c.json({ success: true });
  } catch (error: any) {
    if (error.code === "23503") {
      return c.json(
        { error: "Cannot delete this category because it is already used in expenses." },
        409,
      );
    }
    throw error;
  }
}
