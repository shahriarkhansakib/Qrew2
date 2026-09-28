import { customFieldDefinitions, db, members } from "@starter/db";
import { and, eq, type SQL } from "drizzle-orm";
import { type Context } from "hono";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { auth } from "../../infra/lib/auth";
import { logger } from "../../infra/lib/logger";

const log = logger.child({ module: "custom-fields" });

// ─── Validation Schemas ────────────────────────────────────────────────────

const createDefinitionSchema = z.object({
  entityType: z.enum(["client", "project", "staff"]),
  fieldName: z.string().min(1),
  // fieldKey is always normalized to UPPERCASE_WITH_UNDERSCORES server-side.
  // Client must not rely on case; the transformed value is what gets stored.
  fieldKey: z
    .string()
    .min(1)
    .transform((val) =>
      val
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_|_$/g, ""),
    ),
  fieldType: z.enum([
    "text",
    "number",
    "date",
    "boolean",
    "single_select",
    "multi_select",
    "others",
  ]),
  isRequired: z.boolean().default(false),
  options: z.array(z.string()).nullable().optional(),
  isDetailed: z.boolean().default(false),
  isSensitive: z.boolean().default(false),
  // Category 3 (Private): completely hidden from all non-owners regardless of workflow state
  isPrivate: z.boolean().default(false),
});

// ─── Helper: resolve org ownership ────────────────────────────────────────
/**
 * Returns true if the requesting user is an org owner or super-admin.
 * Private fields are only visible to these roles.
 */
async function _isOrgOwnerOrAdmin(userId: string, orgId: string): Promise<boolean> {
  const _sessionData = await auth.api.getSession({ headers: new Headers() });
  // Check via direct DB lookup — role='owner' on the members table
  const member = await db.query.members.findFirst({
    where: and(eq(members.userId, userId), eq(members.organizationId, orgId)),
  });
  return member?.role === "owner";
}

// ─── Controller ───────────────────────────────────────────────────────────

export class CustomFieldsController {
  static async listDefinitions(c: Context): Promise<any> {
    const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });
    const orgId = sessionData?.session?.activeOrganizationId;
    const userId = sessionData?.user?.id;
    const userRole = sessionData?.user?.role; // 'super_admin' if global admin

    if (!orgId || !userId) {
      return c.json({ error: "Unauthorized", message: "No active organization selected." }, 401);
    }

    const entityType = c.req.query("entityType");

    let conditions: SQL | undefined = eq(customFieldDefinitions.organizationId, orgId);
    if (
      entityType &&
      (entityType === "client" || entityType === "project" || entityType === "staff")
    ) {
      conditions = and(conditions, eq(customFieldDefinitions.entityType, entityType));
    }

    const definitions = await db.query.customFieldDefinitions.findMany({
      where: conditions,
      orderBy: (defs, { asc }) => [asc(defs.createdAt)],
    });

    // Category 3 (Private): filter out private fields for non-owners/non-super-admins.
    // Super admins bypass all tenant restrictions.
    if (userRole !== "super_admin") {
      const member = await db.query.members.findFirst({
        where: and(eq(members.userId, userId), eq(members.organizationId, orgId)),
      });
      const isOwner = member?.role === "owner";
      if (!isOwner) {
        return c.json(definitions.filter((d) => !d.isPrivate));
      }
    }

    return c.json(definitions);
  }

  static async createDefinition(c: Context): Promise<any> {
    const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });
    const orgId = sessionData?.session?.activeOrganizationId;

    if (!orgId) {
      return c.json({ error: "Unauthorized", message: "No active organization selected." }, 401);
    }

    const body = await c.req.json();
    const result = createDefinitionSchema.safeParse(body);

    if (!result.success) {
      return c.json({ error: "Validation Error", details: result.error.format() }, 400);
    }

    const data = result.data;

    // Ensure fieldKey is unique for this org and entity type
    const existing = await db.query.customFieldDefinitions.findFirst({
      where: and(
        eq(customFieldDefinitions.organizationId, orgId),
        eq(customFieldDefinitions.entityType, data.entityType),
        eq(customFieldDefinitions.fieldKey, data.fieldKey),
      ),
    });

    if (existing) {
      return c.json({ error: "Field key already exists for this entity type" }, 409);
    }

    const [newDef] = await db
      .insert(customFieldDefinitions)
      .values({
        id: uuidv4(),
        organizationId: orgId,
        entityType: data.entityType,
        fieldName: data.fieldName,
        fieldKey: data.fieldKey,
        fieldType: data.fieldType,
        isRequired: data.isRequired,
        options: data.options ?? null,
        isDetailed: data.isDetailed,
        isSensitive: data.isSensitive,
        isPrivate: data.isPrivate,
      })
      .returning();

    log.info(
      { orgId, fieldId: newDef.id, fieldKey: newDef.fieldKey },
      "Created custom field definition",
    );
    return c.json(newDef, 201);
  }

  static async deleteDefinition(c: Context): Promise<any> {
    const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });
    const orgId = sessionData?.session?.activeOrganizationId;

    if (!orgId) {
      return c.json({ error: "Unauthorized", message: "No active organization selected." }, 401);
    }

    const id = c.req.param("id");
    if (!id) return c.json({ error: "Missing ID" }, 400);

    const existing = await db.query.customFieldDefinitions.findFirst({
      where: and(
        eq(customFieldDefinitions.id, id),
        eq(customFieldDefinitions.organizationId, orgId),
      ),
    });

    if (!existing) return c.json({ error: "Not Found" }, 404);

    if (existing.isSeeded) {
      return c.json({ error: "Seeded (system) fields cannot be deleted" }, 403);
    }

    await db.delete(customFieldDefinitions).where(eq(customFieldDefinitions.id, id));
    log.info({ orgId, fieldId: id }, "Deleted custom field definition");
    return c.json({ success: true });
  }

  static async updateDefinition(c: Context): Promise<any> {
    const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });
    const orgId = sessionData?.session?.activeOrganizationId;

    if (!orgId) {
      return c.json({ error: "Unauthorized", message: "No active organization selected." }, 401);
    }

    const id = c.req.param("id");
    if (!id) return c.json({ error: "Missing ID" }, 400);

    const body = await c.req.json();

    const existing = await db.query.customFieldDefinitions.findFirst({
      where: and(
        eq(customFieldDefinitions.id, id),
        eq(customFieldDefinitions.organizationId, orgId),
      ),
    });

    if (!existing) return c.json({ error: "Not Found" }, 404);

    // fieldKey and fieldType are immutable after creation to preserve data integrity
    const updatedData = {
      fieldName: body.fieldName ?? existing.fieldName,
      isRequired: body.isRequired ?? existing.isRequired,
      options: body.options !== undefined ? body.options : existing.options,
      isDetailed: body.isDetailed !== undefined ? body.isDetailed : existing.isDetailed,
      isSensitive: body.isSensitive !== undefined ? body.isSensitive : existing.isSensitive,
      isPrivate: body.isPrivate !== undefined ? body.isPrivate : existing.isPrivate,
    };

    const [updatedDef] = await db
      .update(customFieldDefinitions)
      .set(updatedData)
      .where(eq(customFieldDefinitions.id, id))
      .returning();

    return c.json(updatedDef, 200);
  }
}
