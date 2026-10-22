import {
  customFieldDefinitions,
  db,
  expenses,
  invoices,
  projectStatuses,
  projectStatusFields,
  projectStatusLogs,
  projectStatusTransitions,
  projects,
} from "@starter/db";
import { and, asc, count, desc, eq, ne, type SQL, sql, sum } from "drizzle-orm";
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
  static async listProjects(c: Context): Promise<any> {
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

  static async createProject(c: Context): Promise<any> {
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

  static async updateProject(c: Context): Promise<any> {
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

    if (baseValidation.data.status && baseValidation.data.status !== existing.status) {
      return c.json(
        {
          error: "Direct status updates forbidden",
          message:
            "Project status cannot be changed directly via general updates. Use the advance-status workflow endpoint.",
        },
        400,
      );
    }

    const [updatedProject] = await db
      .update(projects)
      .set({
        clientId: baseValidation.data.clientId,
        name: baseValidation.data.name,
        status: existing.status,
        customFields: customFieldsValidation.data,
        version: sql`${projects.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(projects.id, id), eq(projects.organizationId, orgId)))
      .returning();

    return c.json(updatedProject);
  }

  static async archiveProject(c: Context): Promise<any> {
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

  static async unarchiveProject(c: Context): Promise<any> {
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

  static async deleteProject(c: Context): Promise<any> {
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

  static async deleteAttachment(c: Context): Promise<any> {
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

  static async getAttachmentUploadUrl(c: Context): Promise<any> {
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

  static async saveAttachment(c: Context): Promise<any> {
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

  static async listAttachments(c: Context): Promise<any> {
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

  static async renameAttachment(c: Context): Promise<any> {
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
    const user = c.get("user") as any;
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
      .select({
        id: projectStatusTransitions.id,
        allowedRoleIds: projectStatusTransitions.allowedRoleIds,
      })
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

    // Role-gating check (Option 1)
    const isOwner = c.get("isOwner") as boolean;
    const memberRole = c.get("memberRole") as string;
    const memberRoleIds = (c.get("memberRoleIds") as string[]) || [];
    if (
      !isOwner &&
      allowedTransition?.allowedRoleIds &&
      allowedTransition.allowedRoleIds.length > 0
    ) {
      const allowed = allowedTransition.allowedRoleIds;
      const hasMatchingRole =
        (memberRole && allowed.includes(memberRole)) ||
        memberRoleIds.some((id) => allowed.includes(id));
      if (!hasMatchingRole) {
        return c.json(
          {
            error: "Forbidden",
            message: `Your role does not have permission to advance files to "${targetStatus.name}".`,
          },
          403,
        );
      }
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
    const rawMergedFields = {
      ...((project.customFields as Record<string, any>) ?? {}),
      ...incomingCustomFields,
    };

    const missingFields: { fieldId: string; fieldKey: string; fieldName: string }[] = [];
    for (const rf of requiredFields) {
      const value = rawMergedFields[rf.fieldKey];
      const isEmpty = value === undefined || value === null || value === "";
      if (isEmpty) {
        missingFields.push({
          fieldId: rf.fieldId,
          fieldKey: rf.fieldKey,
          fieldName: rf.fieldName,
        });
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

    // 5b. Validate custom fields schema against organization definitions
    const definitions = await db.query.customFieldDefinitions.findMany({
      where: and(
        eq(customFieldDefinitions.organizationId, orgId),
        eq(customFieldDefinitions.entityType, "project"),
      ),
    });

    const dynamicSchema = createDynamicZodSchema(definitions);
    const customFieldsValidation = dynamicSchema.safeParse(rawMergedFields);

    if (!customFieldsValidation.success) {
      return c.json(
        {
          error: "Custom Fields Validation Error",
          message: "One or more custom fields have invalid data formats.",
          details: customFieldsValidation.error.format(),
        },
        422,
      );
    }

    // 6. Execute the transition — update status, append previous status to history,
    //    and merge any validated submitted field values.
    const previousHistory: string[] = Array.isArray(project.statusHistory)
      ? project.statusHistory
      : [];
    const previousStageFieldHistory: any[] = Array.isArray(project.stageFieldHistory)
      ? project.stageFieldHistory
      : [];

    const stageSnapshot = {
      stageId: project.status,
      timestamp: new Date().toISOString(),
      fields: { ...rawMergedFields },
    };

    const currentVersion = project.version ?? 1;
    const [updatedProject] = await db
      .update(projects)
      .set({
        status: toStatusId,
        statusHistory: [...previousHistory, project.status], // append the stage we're leaving
        stageFieldHistory: [...previousStageFieldHistory, stageSnapshot], // record stage field audit snapshot
        customFields: customFieldsValidation.data,
        version: sql`${projects.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(projects.id, id),
          eq(projects.organizationId, orgId),
          eq(projects.version, currentVersion),
        ),
      )
      .returning();

    if (!updatedProject) {
      return c.json(
        {
          error: "Concurrent update conflict",
          message:
            "This file was modified concurrently by another user or session. Please refresh and try again.",
        },
        409,
      );
    }

    // 7. Insert relational status audit log (Option 3)
    try {
      const [lastLog] = await db
        .select({ changedAt: projectStatusLogs.changedAt })
        .from(projectStatusLogs)
        .where(
          and(eq(projectStatusLogs.projectId, id), eq(projectStatusLogs.organizationId, orgId)),
        )
        .orderBy(desc(projectStatusLogs.changedAt))
        .limit(1);

      const timeInPreviousStageSeconds = lastLog
        ? Math.max(0, Math.floor((Date.now() - new Date(lastLog.changedAt).getTime()) / 1000))
        : project.createdAt
          ? Math.max(0, Math.floor((Date.now() - new Date(project.createdAt).getTime()) / 1000))
          : 0;

      await db.insert(projectStatusLogs).values({
        id: uuidv4(),
        organizationId: orgId,
        projectId: id,
        fromStatusId: project.status,
        toStatusId,
        changedById: user?.id ?? null,
        changedAt: new Date(),
        timeInPreviousStageSeconds,
        stageSnapshot: { ...rawMergedFields },
      });
    } catch (logErr) {
      log.error({ logErr, projectId: id }, "Failed to write project status log");
    }

    log.info(
      { orgId, projectId: id, fromStatus: project.status, toStatus: toStatusId },
      "Project status advanced",
    );

    const { scrubEntityData, getScrubberConfig } = await import("../../infra/lib/data-scrubber");
    const scrubberConfig = await getScrubberConfig(c, "project");
    const scrubbedProject = scrubEntityData(updatedProject, scrubberConfig, "project");

    return c.json(scrubbedProject);
  }

  static async getStatusLogs(c: Context): Promise<any> {
    const orgId = c.get("organizationId");
    const id = c.req.param("id") as string;
    if (!id) return c.json({ error: "Missing project ID" }, 400);

    const { users } = await import("@starter/db");

    const logs = await db
      .select({
        id: projectStatusLogs.id,
        projectId: projectStatusLogs.projectId,
        fromStatusId: projectStatusLogs.fromStatusId,
        toStatusId: projectStatusLogs.toStatusId,
        changedById: projectStatusLogs.changedById,
        changedAt: projectStatusLogs.changedAt,
        timeInPreviousStageSeconds: projectStatusLogs.timeInPreviousStageSeconds,
        stageSnapshot: projectStatusLogs.stageSnapshot,
        changedByName: users.name,
        changedByEmail: users.email,
      })
      .from(projectStatusLogs)
      .leftJoin(users, eq(projectStatusLogs.changedById, users.id))
      .where(and(eq(projectStatusLogs.projectId, id), eq(projectStatusLogs.organizationId, orgId)))
      .orderBy(desc(projectStatusLogs.changedAt));

    return c.json({ logs });
  }

  static async getWorkflowVelocityAnalytics(c: Context): Promise<any> {
    const orgId = c.get("organizationId");

    // 1. Fetch all workflow statuses for this org
    const statuses = await db
      .select({
        id: projectStatuses.id,
        name: projectStatuses.name,
        color: projectStatuses.color,
        isTerminal: projectStatuses.isTerminal,
        gridColumn: projectStatuses.gridColumn,
        gridRow: projectStatuses.gridRow,
      })
      .from(projectStatuses)
      .where(eq(projectStatuses.organizationId, orgId))
      .orderBy(asc(projectStatuses.gridColumn), asc(projectStatuses.gridRow));

    // 2. Fetch project counts per status
    const projectCounts = await db
      .select({
        status: projects.status,
        count: count(projects.id),
      })
      .from(projects)
      .where(and(eq(projects.organizationId, orgId), ne(projects.lifecycleState, "archived")))
      .groupBy(projects.status);

    const countByStatus: Record<string, number> = {};
    for (const row of projectCounts) {
      if (row.status) countByStatus[row.status] = Number(row.count);
    }

    // 3. Aggregate transitions & time spent per stage from projectStatusLogs
    const logAggregates = await db
      .select({
        fromStatusId: projectStatusLogs.fromStatusId,
        transitionCount: count(projectStatusLogs.id),
        avgSeconds: sql<number>`coalesce(avg(${projectStatusLogs.timeInPreviousStageSeconds}), 0)`,
        maxSeconds: sql<number>`coalesce(max(${projectStatusLogs.timeInPreviousStageSeconds}), 0)`,
        minSeconds: sql<number>`coalesce(min(${projectStatusLogs.timeInPreviousStageSeconds}), 0)`,
      })
      .from(projectStatusLogs)
      .where(eq(projectStatusLogs.organizationId, orgId))
      .groupBy(projectStatusLogs.fromStatusId);

    const logMap: Record<string, any> = {};
    for (const la of logAggregates) {
      if (la.fromStatusId) {
        logMap[la.fromStatusId] = la;
      }
    }

    const formatDuration = (sec: number) => {
      if (sec < 60) return `${Math.round(sec)}s`;
      if (sec < 3600) return `${Math.round(sec / 60)}m`;
      if (sec < 86400) return `${(sec / 3600).toFixed(1)}h`;
      return `${(sec / 86400).toFixed(1)}d`;
    };

    let maxAvgDuration = 0;
    let bottleneckStageId: string | null = null;

    const stageMetrics = statuses.map((s) => {
      const stats = logMap[s.id];
      const avgDuration = stats ? Number(stats.avgSeconds) : 0;
      const transitionCount = stats ? Number(stats.transitionCount) : 0;
      const activeCount = countByStatus[s.id] || 0;

      if (!s.isTerminal && avgDuration > maxAvgDuration && transitionCount > 0) {
        maxAvgDuration = avgDuration;
        bottleneckStageId = s.id;
      }

      return {
        statusId: s.id,
        statusName: s.name,
        color: s.color,
        isTerminal: s.isTerminal,
        activeFilesCount: activeCount,
        transitionCount,
        avgDurationSeconds: Math.round(avgDuration),
        formattedAvgDuration: formatDuration(avgDuration),
        isBottleneck: false,
      };
    });

    if (bottleneckStageId) {
      const bStage = stageMetrics.find((m) => m.statusId === bottleneckStageId);
      if (bStage) bStage.isBottleneck = true;
    }

    const totalActiveFiles = Object.values(countByStatus).reduce((a, b) => a + b, 0);
    const totalTransitions = stageMetrics.reduce((a, b) => a + b.transitionCount, 0);

    return c.json({
      stageMetrics,
      totalActiveFiles,
      totalTransitions,
      bottleneckStage: stageMetrics.find((m) => m.isBottleneck) || null,
    });
  }
}
