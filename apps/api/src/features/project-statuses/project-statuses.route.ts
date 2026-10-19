import { zValidator } from "@hono/zod-validator";
import {
  customFieldDefinitions,
  db,
  projectStatuses,
  projectStatusFields,
  projectStatusTransitions,
} from "@starter/db";
import { and, asc, eq, gte, inArray, not, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { logger } from "../../infra/lib/logger";
import { requireOrgPermission } from "../../infra/middleware/require-permission";
import { computeLayoutSeed } from "./layout-seeder";

const log = logger.child({ module: "project-statuses" });

const projectStatusesRoute = new Hono<{ Variables: { organizationId: string } }>();

// ─── Validation Schemas ────────────────────────────────────────────────────

export const projectStatusesSchema = z.object({
  name: z.string().min(1, "Name is required"),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color")
    .optional(),
  order: z.number().int().min(0).optional(),
  isInitial: z.boolean().optional(),
  isTerminal: z.boolean().optional(),
  gridColumn: z.number().int().min(0).optional(),
  gridRow: z.number().int().optional(),
  insertBump: z.boolean().optional(),
});

const transitionsSchema = z.object({
  // Array of toStatusIds this status is allowed to transition to.
  // Replaces all existing transitions for this status (full replace).
  toStatusIds: z.array(z.string()).min(0).optional(),
  transitions: z
    .array(
      z.object({
        toStatusId: z.string().min(1),
        allowedRoleIds: z.array(z.string()).default([]),
      }),
    )
    .optional(),
});

const statusFieldsSchema = z.object({
  // Full replacement list. Each entry maps a field to this stage.
  fields: z.array(
    z.object({
      fieldId: z.string().min(1),
      isVisibleInStage: z.boolean().default(true),
      isRequiredToEnter: z.boolean().default(false),
    }),
  ),
});

// ─── POST /migrate-defaults — Idempotent: fix Completed + seed transition ──

projectStatusesRoute.post(
  "/migrate-defaults",
  requireOrgPermission("workflow:manage"),
  async (c) => {
    const orgId = c.get("organizationId") as string;

    const statuses = await db
      .select()
      .from(projectStatuses)
      .where(eq(projectStatuses.organizationId, orgId));

    const completedStatus = statuses.find((s) => s.name === "Completed");
    const createdStatus = statuses.find((s) => s.isInitial);

    if (completedStatus && !completedStatus.isSystem) {
      await db
        .update(projectStatuses)
        .set({ isSystem: true, color: "#10b981" })
        .where(eq(projectStatuses.id, completedStatus.id));
    }
    if (createdStatus && createdStatus.color !== "#6366f1") {
      await db
        .update(projectStatuses)
        .set({ color: "#6366f1" })
        .where(eq(projectStatuses.id, createdStatus.id));
    }

    if (createdStatus && completedStatus) {
      const existing = await db.query.projectStatusTransitions.findFirst({
        where: and(
          eq(projectStatusTransitions.organizationId, orgId),
          eq(projectStatusTransitions.fromStatusId, createdStatus.id),
          eq(projectStatusTransitions.toStatusId, completedStatus.id),
        ),
      });
      if (!existing) {
        await db.insert(projectStatusTransitions).values({
          id: crypto.randomUUID(),
          organizationId: orgId,
          fromStatusId: createdStatus.id,
          toStatusId: completedStatus.id,
        });
      }
    }

    // Phase 3: Seed Grid Coordinates for nodes with NULL gridColumn
    const nullNodes = statuses.filter((s) => s.gridColumn === null);
    if (nullNodes.length > 0) {
      // 1. Fetch transitions for seeding layout
      const allTransitions = await db
        .select({
          fromStatusId: projectStatusTransitions.fromStatusId,
          toStatusId: projectStatusTransitions.toStatusId,
        })
        .from(projectStatusTransitions)
        .where(eq(projectStatusTransitions.organizationId, orgId));

      // Group transitions by fromStatusId
      const transitionsByStatus: Record<string, { toStatusId: string }[]> = {};
      for (const t of allTransitions) {
        if (!transitionsByStatus[t.fromStatusId]) transitionsByStatus[t.fromStatusId] = [];
        transitionsByStatus[t.fromStatusId].push({ toStatusId: t.toStatusId });
      }

      // Attach transitions to statuses
      const enrichedStatuses = statuses.map((s) => ({
        ...s,
        transitions: transitionsByStatus[s.id] ?? [],
      }));

      // 2. Compute seed positions using the algorithm
      const layoutCoords = computeLayoutSeed(enrichedStatuses);

      // 3. Update the null nodes
      for (const node of nullNodes) {
        const coords = layoutCoords[node.id];
        if (coords) {
          await db
            .update(projectStatuses)
            .set({ gridColumn: coords.col, gridRow: coords.row })
            .where(eq(projectStatuses.id, node.id));
        }
      }
    }

    return c.json({ success: true });
  },
);

// ─── GET / — List all statuses with their workflow data ───────────────────

projectStatusesRoute.get("/", requireOrgPermission("file:view"), async (c) => {
  const orgId = c.get("organizationId") as string;

  const statuses = await db
    .select()
    .from(projectStatuses)
    .where(eq(projectStatuses.organizationId, orgId))
    .orderBy(asc(projectStatuses.order), asc(projectStatuses.createdAt));

  const statusIds = statuses.map((s) => s.id);

  // Batch-fetch all transitions and field mappings for the org in 2 queries
  const [transitions, fieldMappings] = await Promise.all([
    statusIds.length > 0
      ? db
          .select({
            id: projectStatusTransitions.id,
            fromStatusId: projectStatusTransitions.fromStatusId,
            toStatusId: projectStatusTransitions.toStatusId,
            allowedRoleIds: projectStatusTransitions.allowedRoleIds,
          })
          .from(projectStatusTransitions)
          .where(
            and(
              eq(projectStatusTransitions.organizationId, orgId),
              inArray(projectStatusTransitions.fromStatusId, statusIds),
            ),
          )
      : Promise.resolve([]),
    statusIds.length > 0
      ? db
          .select({
            id: projectStatusFields.id,
            statusId: projectStatusFields.statusId,
            fieldId: projectStatusFields.fieldId,
            isVisibleInStage: projectStatusFields.isVisibleInStage,
            isRequiredToEnter: projectStatusFields.isRequiredToEnter,
            fieldName: customFieldDefinitions.fieldName,
            fieldKey: customFieldDefinitions.fieldKey,
            fieldType: customFieldDefinitions.fieldType,
            isRequired: customFieldDefinitions.isRequired,
            options: customFieldDefinitions.options,
          })
          .from(projectStatusFields)
          .innerJoin(
            customFieldDefinitions,
            eq(projectStatusFields.fieldId, customFieldDefinitions.id),
          )
          .where(
            and(
              eq(projectStatusFields.organizationId, orgId),
              inArray(projectStatusFields.statusId, statusIds),
            ),
          )
      : Promise.resolve([]),
  ]);

  // Group transitions and fields by statusId
  type Transition = (typeof transitions)[number];
  type FieldMapping = (typeof fieldMappings)[number];

  const transitionsByStatus: Record<string, Transition[]> = {};
  for (const t of transitions) {
    if (!transitionsByStatus[t.fromStatusId]) transitionsByStatus[t.fromStatusId] = [];
    transitionsByStatus[t.fromStatusId]!.push(t);
  }

  const fieldsByStatus: Record<string, FieldMapping[]> = {};
  for (const f of fieldMappings) {
    if (!fieldsByStatus[f.statusId]) fieldsByStatus[f.statusId] = [];
    fieldsByStatus[f.statusId]!.push(f);
  }

  const enriched = statuses.map((s) => ({
    ...s,
    transitions: transitionsByStatus[s.id] ?? [],
    statusFields: fieldsByStatus[s.id] ?? [],
    gridColumn: s.gridColumn,
    gridRow: s.gridRow,
  }));

  return c.json(enriched);
});

// ─── POST / — Create a new status node ────────────────────────────────────

projectStatusesRoute.post(
  "/",
  requireOrgPermission("workflow:manage"),
  zValidator("json", projectStatusesSchema),
  async (c) => {
    const orgId = c.get("organizationId") as string;
    const data = c.req.valid("json");

    // Enforce unique stage names
    const [existingName] = await db
      .select({ id: projectStatuses.id })
      .from(projectStatuses)
      .where(and(eq(projectStatuses.organizationId, orgId), eq(projectStatuses.name, data.name)));
    if (existingName) {
      return c.json({ error: "A stage with this name already exists." }, 400);
    }

    if (data.gridColumn !== undefined && data.insertBump) {
      // Shift all existing nodes right to make room
      await db
        .update(projectStatuses)
        .set({ gridColumn: sql`${projectStatuses.gridColumn} + 1` })
        .where(
          and(
            eq(projectStatuses.organizationId, orgId),
            gte(projectStatuses.gridColumn, data.gridColumn),
          ),
        );
    }

    const newId = crypto.randomUUID();
    const [newStatus] = await db
      .insert(projectStatuses)
      .values({
        id: newId,
        organizationId: orgId,
        name: data.name,
        color: data.color ?? "#6b7280",
        order: data.order ?? 0,
        isDefault: false,
        isSystem: false,
        isInitial: data.isInitial ?? false,
        isTerminal: data.isTerminal ?? false,
        gridColumn: data.gridColumn,
        gridRow: data.gridRow,
      })
      .returning();

    log.info({ orgId, statusId: newId }, "Created new workflow status");
    return c.json(newStatus, 201);
  },
);

// ─── PATCH /:id — Update a status node ───────────────────────────────────

projectStatusesRoute.patch(
  "/:id",
  requireOrgPermission("workflow:manage"),
  zValidator("json", projectStatusesSchema),
  async (c) => {
    const orgId = c.get("organizationId") as string;
    const id = c.req.param("id") as string;
    const data = c.req.valid("json");

    const [existing] = await db
      .select()
      .from(projectStatuses)
      .where(and(eq(projectStatuses.id, id), eq(projectStatuses.organizationId, orgId)));

    if (!existing) return c.json({ error: "Status not found" }, 404);

    if (existing.isSystem && data.name !== existing.name) {
      return c.json({ error: "System statuses cannot be renamed" }, 403);
    }

    const updatePayload: Record<string, any> = {
      color: data.color ?? existing.color,
      order: data.order ?? existing.order,
      updatedAt: new Date(),
    };

    // System statuses can update color/order but not name or workflow flags
    if (!existing.isSystem) {
      if (data.name !== existing.name) {
        // Enforce unique stage names
        const [existingName] = await db
          .select({ id: projectStatuses.id })
          .from(projectStatuses)
          .where(
            and(eq(projectStatuses.organizationId, orgId), eq(projectStatuses.name, data.name)),
          );
        if (existingName) {
          return c.json({ error: "A stage with this name already exists." }, 400);
        }
      }
      updatePayload.name = data.name;
      if (data.isInitial !== undefined) updatePayload.isInitial = data.isInitial;
      if (data.isTerminal !== undefined) updatePayload.isTerminal = data.isTerminal;
    }

    if (data.gridColumn !== undefined) updatePayload.gridColumn = data.gridColumn;
    if (data.gridRow !== undefined) updatePayload.gridRow = data.gridRow;

    const [updated] = await db
      .update(projectStatuses)
      .set(updatePayload)
      .where(and(eq(projectStatuses.id, id), eq(projectStatuses.organizationId, orgId)))
      .returning();

    return c.json(updated);
  },
);

// ─── PATCH /:id/position — Update node grid coordinates ────────────────
const positionSchema = z.object({
  gridColumn: z.number().int().min(0),
  gridRow: z.number().int(),
});

projectStatusesRoute.patch(
  "/:id/position",
  requireOrgPermission("workflow:manage"),
  zValidator("json", positionSchema),
  async (c) => {
    const orgId = c.get("organizationId") as string;
    const id = c.req.param("id") as string;
    const { gridColumn, gridRow } = c.req.valid("json");

    const [existing] = await db
      .select()
      .from(projectStatuses)
      .where(and(eq(projectStatuses.id, id), eq(projectStatuses.organizationId, orgId)));

    if (!existing) return c.json({ error: "Status not found" }, 404);

    const [collision] = await db
      .select()
      .from(projectStatuses)
      .where(
        and(
          eq(projectStatuses.organizationId, orgId),
          eq(projectStatuses.gridColumn, gridColumn),
          eq(projectStatuses.gridRow, gridRow),
          not(eq(projectStatuses.id, id)),
        ),
      );

    if (collision) {
      return c.json(
        {
          error: `Grid cell [${gridColumn}, ${gridRow}] is already occupied by "${collision.name}".`,
        },
        409,
      );
    }

    const [updated] = await db
      .update(projectStatuses)
      .set({ gridColumn, gridRow, updatedAt: new Date() })
      .where(and(eq(projectStatuses.id, id), eq(projectStatuses.organizationId, orgId)))
      .returning();

    return c.json(updated);
  },
);

// ─── POST /:id/swap — Atomically swap grid coordinates of two nodes ──────
const swapSchema = z.object({
  targetId: z.string().min(1),
});

projectStatusesRoute.post(
  "/:id/swap",
  requireOrgPermission("workflow:manage"),
  zValidator("json", swapSchema),
  async (c) => {
    const orgId = c.get("organizationId") as string;
    const sourceId = c.req.param("id") as string;
    const { targetId } = c.req.valid("json");

    if (sourceId === targetId) return c.json({ error: "Cannot swap node with itself" }, 400);

    const [sourceNode] = await db
      .select()
      .from(projectStatuses)
      .where(and(eq(projectStatuses.id, sourceId), eq(projectStatuses.organizationId, orgId)));
    const [targetNode] = await db
      .select()
      .from(projectStatuses)
      .where(and(eq(projectStatuses.id, targetId), eq(projectStatuses.organizationId, orgId)));

    if (!sourceNode || !targetNode) return c.json({ error: "One or both statuses not found" }, 404);

    // Swap in a transaction to ensure atomic execution
    const updatedNodes = await db.transaction(async (tx) => {
      const [updatedSource] = await tx
        .update(projectStatuses)
        .set({
          gridColumn: targetNode.gridColumn,
          gridRow: targetNode.gridRow,
          updatedAt: new Date(),
        })
        .where(eq(projectStatuses.id, sourceId))
        .returning();

      const [updatedTarget] = await tx
        .update(projectStatuses)
        .set({
          gridColumn: sourceNode.gridColumn,
          gridRow: sourceNode.gridRow,
          updatedAt: new Date(),
        })
        .where(eq(projectStatuses.id, targetId))
        .returning();

      return [updatedSource, updatedTarget];
    });

    return c.json({ success: true, nodes: updatedNodes });
  },
);

// ─── DELETE /:id — Delete a status node (with splice logic) ──────────────
// When deleting node B that sits between A→B→C, this restores A→C so the
// graph doesn't lose connectivity. All inbound edges to B are re-pointed to
// each of B's outgoing targets (fan-out splice).

projectStatusesRoute.delete("/:id", requireOrgPermission("workflow:manage"), async (c) => {
  const orgId = c.get("organizationId") as string;
  const id = c.req.param("id") as string;

  const [existing] = await db
    .select()
    .from(projectStatuses)
    .where(and(eq(projectStatuses.id, id), eq(projectStatuses.organizationId, orgId)));

  if (!existing) return c.json({ error: "Status not found" }, 404);
  if (existing.isSystem) return c.json({ error: "System statuses cannot be deleted" }, 403);
  if (existing.isDefault) return c.json({ error: "The default status cannot be deleted" }, 403);

  // 1. Find all outgoing transitions from the node being deleted (B's children)
  const outgoing = await db
    .select({ toStatusId: projectStatusTransitions.toStatusId })
    .from(projectStatusTransitions)
    .where(
      and(
        eq(projectStatusTransitions.organizationId, orgId),
        eq(projectStatusTransitions.fromStatusId, id),
      ),
    );
  const childIds = outgoing.map((t) => t.toStatusId);

  // 2. Find all nodes that currently point TO the node being deleted (B's parents)
  const inbound = await db
    .select({
      parentId: projectStatusTransitions.fromStatusId,
      existingToId: projectStatusTransitions.toStatusId,
    })
    .from(projectStatusTransitions)
    .where(
      and(
        eq(projectStatusTransitions.organizationId, orgId),
        eq(projectStatusTransitions.toStatusId, id),
      ),
    );

  // 3. For each parent, remove the edge to B and add edges to all of B's children
  //    (skip if child already exists as a target to avoid duplicates)
  for (const { parentId } of inbound) {
    // Get parent's current transitions (excluding the one pointing to B)
    const parentCurrentTransitions = await db
      .select({ toStatusId: projectStatusTransitions.toStatusId })
      .from(projectStatusTransitions)
      .where(
        and(
          eq(projectStatusTransitions.organizationId, orgId),
          eq(projectStatusTransitions.fromStatusId, parentId),
        ),
      );
    const currentTargets = parentCurrentTransitions
      .map((t) => t.toStatusId)
      .filter((tid) => tid !== id); // remove the edge to B

    // Merge in B's children (no duplicates)
    const newTargets = [...new Set([...currentTargets, ...childIds])].filter(
      (tid) => tid !== parentId,
    );

    // Full-replace parent's transitions
    await db
      .delete(projectStatusTransitions)
      .where(
        and(
          eq(projectStatusTransitions.organizationId, orgId),
          eq(projectStatusTransitions.fromStatusId, parentId),
        ),
      );

    if (newTargets.length > 0) {
      await db.insert(projectStatusTransitions).values(
        newTargets.map((toId) => ({
          id: crypto.randomUUID(),
          organizationId: orgId,
          fromStatusId: parentId,
          toStatusId: toId,
        })),
      );
    }
  }

  // 4. Delete the node — CASCADE removes its own outgoing transitions and field mappings.
  //    If any file is still assigned to this status, Postgres will throw a FK violation (23503).
  try {
    await db
      .delete(projectStatuses)
      .where(and(eq(projectStatuses.id, id), eq(projectStatuses.organizationId, orgId)));
  } catch (err: any) {
    // Postgres FK violation: a project still has this status assigned
    if (err?.code === "23503") {
      return c.json(
        {
          error: `Stage "${existing.name}" cannot be deleted because one or more files are still assigned to it. Re-assign those files to a different stage first.`,
        },
        409,
      );
    }
    throw err; // re-throw unexpected errors
  }

  log.info(
    { orgId, statusId: id, splicedParents: inbound.length, childIds },
    "Deleted workflow status with splice",
  );
  return c.json({ success: true });
});

// ─── PUT /:id/transitions — Set the allowed outgoing transitions ──────────
// Full-replace semantics: deletes all existing transitions for this status,
// then inserts the new list. This makes client-side state management simple.

projectStatusesRoute.put(
  "/:id/transitions",
  requireOrgPermission("workflow:manage"),
  zValidator("json", transitionsSchema),
  async (c) => {
    const orgId = c.get("organizationId") as string;
    const id = c.req.param("id") as string;
    const body = c.req.valid("json");
    const targetTransitions: { toStatusId: string; allowedRoleIds: string[] }[] =
      body.transitions && body.transitions.length > 0
        ? body.transitions
        : (body.toStatusIds || []).map((tid) => ({ toStatusId: tid, allowedRoleIds: [] }));
    const toStatusIds = targetTransitions.map((t) => t.toStatusId);

    // 1. Verify source status exists in this org
    const [source] = await db
      .select()
      .from(projectStatuses)
      .where(and(eq(projectStatuses.id, id), eq(projectStatuses.organizationId, orgId)));

    if (!source) return c.json({ error: "Status not found" }, 404);

    if (source.isTerminal && toStatusIds.length > 0) {
      return c.json({ error: "Terminal status cannot have outbound transitions." }, 400);
    }

    // 2.5 Ensure Initial stage always connects to Completed stage
    if (source.isInitial) {
      const completedNode = await db.query.projectStatuses.findFirst({
        where: and(eq(projectStatuses.organizationId, orgId), eq(projectStatuses.isSystem, true)),
      });
      if (completedNode && !toStatusIds.includes(completedNode.id)) {
        // Wait, we need to know if the connection existed before blocking, but by default it should always exist.
        // If they omit it, re-add it silently to be robust, or block. The user requested "not allowed by the backend".
        return c.json(
          {
            error:
              "The connection between the Created stage and the Completed stage cannot be deleted.",
          },
          403,
        );
      }
    }

    // 3. Validate all target statuses exist in this org
    if (toStatusIds.length > 0) {
      const targets = await db
        .select({ id: projectStatuses.id })
        .from(projectStatuses)
        .where(
          and(eq(projectStatuses.organizationId, orgId), inArray(projectStatuses.id, toStatusIds)),
        );

      if (targets.length !== toStatusIds.length) {
        return c.json({ error: "One or more target statuses not found" }, 400);
      }

      // 4. Prevent self-loops (a status transitioning to itself)
      if (toStatusIds.includes(id)) {
        return c.json({ error: "A status cannot transition to itself" }, 400);
      }
    }

    // 5. Full replace: delete existing + insert new
    await db
      .delete(projectStatusTransitions)
      .where(
        and(
          eq(projectStatusTransitions.organizationId, orgId),
          eq(projectStatusTransitions.fromStatusId, id),
        ),
      );

    if (targetTransitions.length > 0) {
      await db.insert(projectStatusTransitions).values(
        targetTransitions.map((t) => ({
          id: crypto.randomUUID(),
          organizationId: orgId,
          fromStatusId: id,
          toStatusId: t.toStatusId,
          allowedRoleIds: t.allowedRoleIds || [],
        })),
      );
    }

    log.info({ orgId, fromStatusId: id, toStatusIds }, "Updated status transitions");
    return c.json({ success: true, fromStatusId: id, toStatusIds, transitions: targetTransitions });
  },
);

// ─── PUT /:id/fields — Assign fields to a workflow stage ─────────────────
// Full-replace semantics: replaces all existing field mappings for this stage.

projectStatusesRoute.put(
  "/:id/fields",
  requireOrgPermission("workflow:manage"),
  zValidator("json", statusFieldsSchema),
  async (c) => {
    const orgId = c.get("organizationId") as string;
    const id = c.req.param("id") as string;
    const { fields } = c.req.valid("json");

    // 1. Verify status exists in this org
    const [status] = await db
      .select()
      .from(projectStatuses)
      .where(and(eq(projectStatuses.id, id), eq(projectStatuses.organizationId, orgId)));

    if (!status) return c.json({ error: "Status not found" }, 404);

    // 2. Validate all fieldIds belong to this org and are project-type fields
    if (fields.length > 0) {
      const fieldIds = fields.map((f) => f.fieldId);
      const validFields = await db
        .select({ id: customFieldDefinitions.id })
        .from(customFieldDefinitions)
        .where(
          and(
            eq(customFieldDefinitions.organizationId, orgId),
            eq(customFieldDefinitions.entityType, "project"),
            inArray(customFieldDefinitions.id, fieldIds),
          ),
        );

      if (validFields.length !== fieldIds.length) {
        return c.json({ error: "One or more field IDs are invalid or not project fields" }, 400);
      }
    }

    // 3. Full replace
    await db
      .delete(projectStatusFields)
      .where(
        and(eq(projectStatusFields.organizationId, orgId), eq(projectStatusFields.statusId, id)),
      );

    if (fields.length > 0) {
      await db.insert(projectStatusFields).values(
        fields.map((f) => ({
          id: crypto.randomUUID(),
          organizationId: orgId,
          statusId: id,
          fieldId: f.fieldId,
          isVisibleInStage: f.isVisibleInStage,
          isRequiredToEnter: f.isRequiredToEnter,
        })),
      );
    }

    log.info({ orgId, statusId: id, fieldCount: fields.length }, "Updated stage field mappings");
    return c.json({ success: true, statusId: id, fieldCount: fields.length });
  },
);

export { projectStatusesRoute };
