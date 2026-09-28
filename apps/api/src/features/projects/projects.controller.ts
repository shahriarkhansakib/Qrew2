import {
  customFieldDefinitions,
  db,
  expenses,
  invoices,
  projectStatuses,
  projectStatusFields,
  projectStatusTransitions,
  projects,
} from "@starter/db";
import { and, count, eq, ne, type SQL, sql, sum } from "drizzle-orm";
import { type Context } from "hono";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { logger } from "../../infra/lib/logger";
import { createDynamicZodSchema } from "../custom-fields/custom-fields.service";

const log = logger.child({ module: "projects" });

const baseProjectSchema = z.object({
  name: z.string().min(1, "Name is required"),
  clientId: z.string().min(1, "Client ID is required"),
  status: z.string().optional(),

  customFields: z.record(z.string(), z.any()).default({}), // We validate this deeper inside the controller
});

export class ProjectsController {
  static async listProjects(c: Context) {
    const orgId = c.get("organizationId");
    const clientId = c.req.query("clientId");
    const statusFilter = c.req.query("status"); // 'archived' or 'active'

    let conditions: SQL | undefined = eq(projects.organizationId, orgId);
    if (clientId) {
      conditions = and(conditions, eq(projects.clientId, clientId));
    }

    // Filter by status
    if (statusFilter === "archived") {
      conditions = and(conditions, eq(projects.lifecycleState, "archived"));
    } else {
      // Default: show all non-archived
      conditions = and(conditions, ne(projects.lifecycleState, "archived"));
    }

    const result = await db.query.projects.findMany({
      where: conditions,
      with: { client: true, statusRelation: true },
      orderBy: (p, { desc }) => [desc(p.createdAt)],
    });

    // Compute total expenses and invoice count per project in a single query
    const projectIds = result.map((p) => p.id);
    const expenseTotals: Record<string, string> = {};
    const invoiceCounts: Record<string, number> = {};

    if (projectIds.length > 0) {
      const _inClause = sql`${projects.id} IN (${sql.join(
        projectIds.map((id) => sql`${id}`),
        sql`, `,
      )})`; // safe placeholder trick

      const totals = await db
        .select({
          projectId: expenses.projectId,
          total: sum(expenses.amount),
        })
        .from(expenses)
        .where(
          and(
            eq(expenses.organizationId, orgId),
            sql`${expenses.projectId} IN (${sql.join(
              projectIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          ),
        )
        .groupBy(expenses.projectId);

      for (const row of totals) {
        if (row.projectId) {
          expenseTotals[row.projectId] = row.total || "0";
        }
      }

      const invCounts = await db
        .select({
          projectId: invoices.projectId,
          count: count(invoices.id),
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.organizationId, orgId),
            sql`${invoices.projectId} IN (${sql.join(
              projectIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          ),
        )
        .groupBy(invoices.projectId);

      for (const row of invCounts) {
        if (row.projectId) {
          invoiceCounts[row.projectId] = Number(row.count) || 0;
        }
      }
    }

    // Merge totalExpenses and invoiceCounts into each project
    const enrichedResult = result.map((project) => ({
      ...project,
      totalExpenses: expenseTotals[project.id] || "0",
      invoiceCount: invoiceCounts[project.id] || 0,
    }));

    const { scrubEntityData, getScrubberConfig } = await import("../../infra/lib/data-scrubber");
    const scrubberConfig = await getScrubberConfig(c, "project");
    const scrubbedResult = enrichedResult.map((p) => scrubEntityData(p, scrubberConfig, "project"));

    return c.json(scrubbedResult);
  }

  static async createProject(c: Context) {
    const orgId = c.get("organizationId");
    const body = await c.req.json();

    const baseValidation = baseProjectSchema.safeParse(body);
    if (!baseValidation.success) {
      return c.json({ error: "Validation Error", details: baseValidation.error.format() }, 400);
    }

    const defaultStatus = await db.query.projectStatuses.findFirst({
      where: and(eq(projectStatuses.organizationId, orgId), eq(projectStatuses.isDefault, true)),
    });

    if (!defaultStatus) {
      return c.json(
        { error: "System Configuration Error: No default status found for this organization." },
        500,
      );
    }

    // Fetch ALL project custom field definitions for this org (no status filter needed;
    // fields are now mapped per-stage via project_status_fields junction table)
    const definitions = await db.query.customFieldDefinitions.findMany({
      where: and(
        eq(customFieldDefinitions.organizationId, orgId),
        eq(customFieldDefinitions.entityType, "project"),
      ),
    });

    const dynamicSchema = createDynamicZodSchema(definitions);
    const customFieldsValidation = dynamicSchema.safeParse(baseValidation.data.customFields);

    if (!customFieldsValidation.success) {
      return c.json(
        { error: "Custom Fields Validation Error", details: customFieldsValidation.error.format() },
        400,
      );
    }

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth(); // 0-indexed
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
    const nextMonthYear = currentMonth === 11 ? currentYear + 1 : currentYear;
    const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
    const firstDayOfNextMonth = new Date(nextMonthYear, nextMonth, 1);

    const [maxSeq] = await db
      .select({ max: sql<number>`MAX(${projects.fileSequenceNumber})` })
      .from(projects)
      .where(
        and(
          eq(projects.organizationId, orgId),
          sql`${projects.createdAt} >= ${firstDayOfMonth.toISOString()}`,
          sql`${projects.createdAt} < ${firstDayOfNextMonth.toISOString()}`,
        ),
      );

    const nextSeq = (maxSeq?.max || 0) + 1;

    const [newProject] = await db
      .insert(projects)
      .values({
        id: uuidv4(),
        organizationId: orgId,
        clientId: baseValidation.data.clientId,
        name: baseValidation.data.name,
        status: defaultStatus.id,
        fileSequenceNumber: nextSeq,
        customFields: customFieldsValidation.data,
      })
      .returning();

    log.info({ orgId, projectId: newProject.id }, "Created new project");
    return c.json(newProject, 201);
  }

  static async updateProject(c: Context) {
    const orgId = c.get("organizationId");
    const id = c.req.param("id");
    if (!id) {
      return c.json({ error: "Missing ID" }, 400);
    }
    const body = await c.req.json();

    const existing = await db.query.projects.findFirst({
      where: and(eq(projects.id, id), eq(projects.organizationId, orgId)),
    });

    if (!existing) return c.json({ error: "Not Found" }, 404);

    const baseValidation = baseProjectSchema.safeParse(body);
    if (!baseValidation.success) {
      return c.json({ error: "Validation Error", details: baseValidation.error.format() }, 400);
    }

    const definitions = await db.query.customFieldDefinitions.findMany({
      where: and(
        eq(customFieldDefinitions.organizationId, orgId),
        eq(customFieldDefinitions.entityType, "project"),
      ),
    });

    const dynamicSchema = createDynamicZodSchema(definitions);
    const customFieldsValidation = dynamicSchema.safeParse(baseValidation.data.customFields);

    if (!customFieldsValidation.success) {
      return c.json(
        {
          error: "Custom Fields Validation Error",
          details: customFieldsValidation.error.format(),
        },
        400,
      );
    }

    const [updatedProject] = await db
      .update(projects)
      .set({
        clientId: baseValidation.data.clientId,
        name: baseValidation.data.name,
        status: baseValidation.data.status,
        customFields: customFieldsValidation.data,
      })
      .where(eq(projects.id, id))
      .returning();

    return c.json(updatedProject);
  }

  static async archiveProject(c: Context) {
    const orgId = c.get("organizationId");
    const id = c.req.param("id");
    if (!id) {
      return c.json({ error: "Missing ID" }, 400);
    }

    const existing = await db.query.projects.findFirst({
      where: and(eq(projects.id, id), eq(projects.organizationId, orgId)),
    });

    if (!existing) return c.json({ error: "Not Found" }, 404);
    if (existing.lifecycleState === "archived") {
      return c.json({ error: "Already archived" }, 400);
    }

    const [updated] = await db
      .update(projects)
      .set({
        lifecycleState: "archived",
        archivedAt: new Date(),
      })
      .where(eq(projects.id, id))
      .returning();

    return c.json(updated);
  }

  static async unarchiveProject(c: Context) {
    const orgId = c.get("organizationId");
    const id = c.req.param("id");
    if (!id) {
      return c.json({ error: "Missing ID" }, 400);
    }

    const existing = await db.query.projects.findFirst({
      where: and(eq(projects.id, id), eq(projects.organizationId, orgId)),
    });

    if (!existing) return c.json({ error: "Not Found" }, 404);
    if (existing.lifecycleState !== "archived") {
      return c.json({ error: "Not archived" }, 400);
    }

    const [updated] = await db
      .update(projects)
      .set({
        lifecycleState: "open",
        archivedAt: null,
      })
      .where(eq(projects.id, id))
      .returning();

    return c.json(updated);
  }

  static async deleteProject(c: Context) {
    const orgId = c.get("organizationId");
    const id = c.req.param("id");
    if (!id) {
      return c.json({ error: "Missing ID" }, 400);
    }

    const existing = await db.query.projects.findFirst({
      where: and(eq(projects.id, id), eq(projects.organizationId, orgId)),
    });

    if (!existing) return c.json({ error: "Not Found" }, 404);
    if (existing.lifecycleState !== "archived") {
      return c.json({ error: "Must archive file before deleting" }, 400);
    }

    // Delete attachments from S3
    const { projectAttachments } = await import("@starter/db");
    const attachments = await db
      .select()
      .from(projectAttachments)
      .where(eq(projectAttachments.projectId, id));

    if (attachments.length > 0) {
      const { UploadsService } = await import("../uploads/uploads.service");
      await Promise.all(
        attachments.map((att) => UploadsService.deleteProjectAttachment(orgId, id, att.id)),
      );
    }

    // Then delete project (attachments table should cascade if FK exists, but Drizzle doesn't automatically do it unless configured in the DB. Let's explicitly delete attachments from DB just in case)
    await db.delete(projectAttachments).where(eq(projectAttachments.projectId, id));
    await db.delete(projects).where(eq(projects.id, id));

    return c.json({ success: true });
  }

  static async deleteAttachment(c: Context) {
    const orgId = c.get("organizationId");
    const projectId = c.req.param("id");
    const attachmentId = c.req.param("attachmentId");

    if (!projectId || !attachmentId) {
      return c.json({ error: "Missing projectId or attachmentId" }, 400);
    }

    const { projectAttachments } = await import("@starter/db");

    const existing = await db.query.projectAttachments.findFirst({
      where: and(
        eq(projectAttachments.id, attachmentId),
        eq(projectAttachments.projectId, projectId),
        eq(projectAttachments.organizationId, orgId),
      ),
    });

    if (!existing) return c.json({ error: "Not Found" }, 404);

    // Delete from S3
    const { UploadsService } = await import("../uploads/uploads.service");
    await UploadsService.deleteProjectAttachment(orgId, projectId, attachmentId);

    // Delete from DB
    await db.delete(projectAttachments).where(eq(projectAttachments.id, attachmentId));

    return c.json({ success: true });
  }

  static async getAttachmentUploadUrl(c: Context) {
    const orgId = c.get("organizationId");
    const projectId = c.req.param("id");

    if (!projectId) {
      return c.json({ error: "Missing projectId" }, 400);
    }

    const body = await c.req.json();

    if (!body.contentType || !body.fileName) {
      return c.json({ error: "contentType and fileName are required" }, 400);
    }

    const fileId = uuidv4();
    const { UploadsService } = await import("../uploads/uploads.service");
    const result = await UploadsService.generateProjectAttachmentPresignedPut(
      orgId,
      projectId,
      fileId,
      body.contentType,
    );

    return c.json({ ...result, fileId });
  }

  static async saveAttachment(c: Context) {
    const orgId = c.get("organizationId");
    const projectId = c.req.param("id");

    if (!projectId) {
      return c.json({ error: "Missing projectId" }, 400);
    }

    const user = c.get("user");
    const body = await c.req.json();

    const { projectAttachments } = await import("@starter/db");

    const [attachment] = await db
      .insert(projectAttachments)
      .values({
        id: body.fileId || uuidv4(),
        organizationId: orgId,
        projectId,
        uploadedBy: user?.id,
        fileName: body.fileName,
        fileSize: body.fileSize,
        fileType: body.fileType,
        fileUrl: body.fileUrl,
      })
      .returning();

    return c.json(attachment, 201);
  }

  static async listAttachments(c: Context) {
    const orgId = c.get("organizationId");
    const projectId = c.req.param("id");

    if (!projectId) {
      return c.json({ error: "Missing projectId" }, 400);
    }

    const { projectAttachments } = await import("@starter/db");

    const result = await db.query.projectAttachments.findMany({
      where: and(
        eq(projectAttachments.organizationId, orgId),
        eq(projectAttachments.projectId, projectId),
      ),
      with: {
        uploader: true,
      },
      orderBy: (pa, { desc }) => [desc(pa.createdAt)],
    });

    return c.json(result);
  }

  static async renameAttachment(c: Context) {
    const orgId = c.get("organizationId");
    const projectId = c.req.param("id");
    const attachmentId = c.req.param("attachmentId");

    if (!projectId || !attachmentId) {
      return c.json({ error: "Missing parameters" }, 400);
    }

    const body = await c.req.json();
    if (!body.fileName) {
      return c.json({ error: "fileName is required" }, 400);
    }

    const { projectAttachments } = await import("@starter/db");

    const [updated] = await db
      .update(projectAttachments)
      .set({ fileName: body.fileName })
      .where(
        and(
          eq(projectAttachments.id, attachmentId),
          eq(projectAttachments.projectId, projectId),
          eq(projectAttachments.organizationId, orgId),
        ),
      )
      .returning();

    if (!updated) {
      return c.json({ error: "Attachment not found" }, 404);
    }

    return c.json(updated);
  }

  static async proxyAttachment(c: Context): Promise<any> {
    const orgId = c.get("organizationId");
    const projectId = c.req.param("id");
    const attachmentId = c.req.param("attachmentId");

    if (!projectId || !attachmentId) {
      return c.json({ error: "Missing parameters" }, 400);
    }

    const { projectAttachments } = await import("@starter/db");
    const attachment = await db.query.projectAttachments.findFirst({
      where: and(
        eq(projectAttachments.organizationId, orgId),
        eq(projectAttachments.projectId, projectId),
        eq(projectAttachments.id, attachmentId),
      ),
    });

    if (!attachment) return c.json({ error: "Not found" }, 404);

    try {
      const response = await fetch(attachment.fileUrl);
      if (!response.ok) throw new Error("Failed to fetch from storage");

      return new Response(response.body, {
        headers: {
          "Content-Type": attachment.fileType || "application/octet-stream",
          "Content-Disposition": `attachment; filename="${attachment.fileName}"`,
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (e: any) {
      log.error({ err: e }, "Failed to proxy attachment");
      return c.json({ error: "Failed to download file" }, 500);
    }
  }

  /**
   * PATCH /:id/advance-status
   *
   * Advances a file to a new workflow status. Enforces:
   *   1. The requested transition must be explicitly configured in project_status_transitions.
   *   2. All fields marked `isRequiredToEnter` for the target status must already have
   *      values stored in the file's customFields JSONB (Scenario A).
   *
   * On success, updates the project's `status` field.
   */
  static async advanceStatus(c: Context): Promise<any> {
    const orgId = c.get("organizationId");
    const id = c.req.param("id");
    if (!id) return c.json({ error: "Missing project ID" }, 400);

    const body = await c.req.json();
    const toStatusId: string | undefined = body.toStatusId;
    // Optional: extra field values the user is submitting as part of this transition
    const incomingCustomFields: Record<string, any> = body.customFields ?? {};

    if (!toStatusId) {
      return c.json({ error: "toStatusId is required" }, 400);
    }

    // 1. Fetch the project (must belong to this org)
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, id), eq(projects.organizationId, orgId)),
    });
    if (!project) return c.json({ error: "Project not found" }, 404);
    if (project.lifecycleState === "archived") {
      return c.json({ error: "Archived files cannot change status" }, 400);
    }

    // 2. Prevent no-op transitions
    if (project.status === toStatusId) {
      return c.json({ error: "File is already in the requested status" }, 400);
    }

    // 3. Validate the target status exists in this org
    const [targetStatus] = await db
      .select()
      .from(projectStatuses)
      .where(and(eq(projectStatuses.id, toStatusId), eq(projectStatuses.organizationId, orgId)));

    if (!targetStatus) {
      return c.json({ error: "Target status not found" }, 404);
    }

    // 4. Validate the transition is allowed in the workflow graph
    const [allowedTransition] = await db
      .select({ id: projectStatusTransitions.id })
      .from(projectStatusTransitions)
      .where(
        and(
          eq(projectStatusTransitions.organizationId, orgId),
          eq(projectStatusTransitions.fromStatusId, project.status),
          eq(projectStatusTransitions.toStatusId, toStatusId),
        ),
      );

    // If workflows are configured (transitions exist), enforce the graph.
    // If NO transitions are configured at all for this org, allow free status changes
    // (graceful degradation for orgs with workflows disabled).
    const hasAnyTransitions = await db
      .select({ id: projectStatusTransitions.id })
      .from(projectStatusTransitions)
      .where(eq(projectStatusTransitions.organizationId, orgId))
      .limit(1);

    if (hasAnyTransitions.length > 0 && !allowedTransition) {
      return c.json(
        {
          error: "Transition not allowed",
          message: `Files cannot move from the current status to "${targetStatus.name}". Check your workflow configuration.`,
        },
        422,
      );
    }

    // 5. Check Scenario A: fields required BEFORE entering the target status
    const requiredFields = await db
      .select({
        fieldId: projectStatusFields.fieldId,
        fieldKey: customFieldDefinitions.fieldKey,
        fieldName: customFieldDefinitions.fieldName,
        isRequiredToEnter: projectStatusFields.isRequiredToEnter,
      })
      .from(projectStatusFields)
      .innerJoin(customFieldDefinitions, eq(projectStatusFields.fieldId, customFieldDefinitions.id))
      .where(
        and(
          eq(projectStatusFields.organizationId, orgId),
          eq(projectStatusFields.statusId, toStatusId),
          eq(projectStatusFields.isRequiredToEnter, true),
        ),
      );

    // Merge existing customFields with incoming overrides for this transition
    const mergedFields = { ...project.customFields, ...incomingCustomFields };

    const missingFields: { fieldKey: string; fieldName: string }[] = [];
    for (const rf of requiredFields) {
      const value = mergedFields[rf.fieldKey];
      const isEmpty = value === undefined || value === null || value === "";
      if (isEmpty) {
        missingFields.push({ fieldKey: rf.fieldKey, fieldName: rf.fieldName });
      }
    }

    if (missingFields.length > 0) {
      return c.json(
        {
          error: "Required fields missing",
          message: `The following fields must be filled before advancing to "${targetStatus.name}".`,
          missingFields,
        },
        422,
      );
    }

    // 6. Execute the transition — update status, append previous status to history,
    //    and merge any submitted field values.
    const previousHistory: string[] = Array.isArray(project.statusHistory)
      ? project.statusHistory
      : [];
    const [updatedProject] = await db
      .update(projects)
      .set({
        status: toStatusId,
        statusHistory: [...previousHistory, project.status], // append the stage we're leaving
        customFields: mergedFields,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id))
      .returning();

    log.info(
      { orgId, projectId: id, fromStatus: project.status, toStatus: toStatusId },
      "Project status advanced",
    );

    return c.json(updatedProject);
  }
}
