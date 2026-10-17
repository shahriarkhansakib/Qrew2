import { db, invoiceDrafts } from "@starter/db";
import { and, eq } from "drizzle-orm";
import { Context } from "hono";
import { z } from "zod";
import { appendAuditEntry } from "./draft-audit";
import { DraftSeeder } from "./draft-seeder";

const draftSchema = z.object({
  id: z.string().optional(),
  projectId: z.string(),
  sourceTemplateId: z
    .string()
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
  draftHeaderValues: z.record(z.string(), z.string()).optional(),
  draftHeaderFields: z.array(z.any()).optional(),
  draftSections: z.array(z.any()).optional(),
  draftConstants: z.record(z.string(), z.any()).optional(),
  name: z.string().optional(),
  description: z.string().optional(),
});

export class DraftsController {
  static async listDrafts(c: Context) {
    try {
      const organizationId = c.get("organizationId");
      const projectId = c.req.query("projectId");

      const whereClause = projectId
        ? and(
            eq(invoiceDrafts.organizationId, organizationId),
            eq(invoiceDrafts.projectId, projectId),
          )
        : eq(invoiceDrafts.organizationId, organizationId);

      const drafts = await db.query.invoiceDrafts.findMany({
        where: whereClause,
        with: {
          project: {
            with: {
              client: true,
              statusRelation: true,
            },
          },
          user: true, // Attach creator user
        },
        orderBy: (d, { desc }) => [desc(d.lastAutoSavedAt)],
      });

      return c.json(drafts);
    } catch (err: any) {
      console.error("[DraftsController.listDrafts]", err);
      return c.json({ error: "Failed to fetch drafts" }, 500);
    }
  }

  static async getDraftById(c: Context) {
    try {
      const organizationId = c.get("organizationId");
      const id = c.req.param("id") as string;

      const draft = await db.query.invoiceDrafts.findFirst({
        where: and(eq(invoiceDrafts.organizationId, organizationId), eq(invoiceDrafts.id, id)),
        with: {
          project: {
            with: {
              client: true,
              statusRelation: true, // Resolve status UUID → { name, color, … }
            },
          },
          user: true, // Attach creator user
        },
      });

      if (!draft) return c.json({ error: "Draft not found" }, 404);

      return c.json(draft);
    } catch (err: any) {
      console.error("[DraftsController.getDraftById]", err);
      return c.json({ error: "Failed to fetch draft" }, 500);
    }
  }

  static async createDraft(c: Context) {
    try {
      const organizationId = c.get("organizationId");
      const user = c.get("user") as any;
      const body = await c.req.json();
      const parsed = draftSchema.safeParse(body);

      if (!parsed.success) {
        return c.json({ error: "Invalid payload", details: parsed.error.format() }, 400);
      }

      const payload = parsed.data;
      const initialAudit = appendAuditEntry([], user, "Created draft");

      const [created] = await db
        .insert(invoiceDrafts)
        .values({
          id: crypto.randomUUID(),
          organizationId,
          projectId: payload.projectId,
          userId: user.id,
          sourceTemplateId: payload.sourceTemplateId,
          draftHeaderValues: payload.draftHeaderValues || {},
          draftHeaderFields: payload.draftHeaderFields || [],
          draftSections: payload.draftSections || [],
          draftConstants: payload.draftConstants || {},
          editHistory: initialAudit,
          name: payload.name || "Draft",
          description: payload.description,
          lastAutoSavedAt: new Date(),
        })
        .returning();

      return c.json(created);
    } catch (err: any) {
      console.error("[DraftsController.createDraft]", err);
      return c.json({ error: "Failed to create draft" }, 500);
    }
  }

  static async getDraft(c: Context) {
    try {
      const organizationId = c.get("organizationId");
      const projectId = c.req.query("projectId");
      const draftId = c.req.query("draftId");

      if (draftId) {
        const draft = await db.query.invoiceDrafts.findFirst({
          where: and(
            eq(invoiceDrafts.organizationId, organizationId),
            eq(invoiceDrafts.id, draftId),
          ),
          with: {
            user: true,
            project: {
              with: {
                client: true,
                statusRelation: true,
              },
            },
          },
        });
        return c.json(draft || null);
      }

      if (!projectId) {
        return c.json({ error: "projectId or draftId is required" }, 400);
      }

      // Return the most recently updated draft for this project
      const draft = await db.query.invoiceDrafts.findFirst({
        where: and(
          eq(invoiceDrafts.organizationId, organizationId),
          eq(invoiceDrafts.projectId, projectId),
        ),
        with: {
          user: true,
          project: {
            with: {
              client: true,
              statusRelation: true,
            },
          },
        },
        orderBy: (d, { desc }) => [desc(d.lastAutoSavedAt)],
      });

      return c.json(draft || null);
    } catch (err: any) {
      console.error("[DraftsController.getDraft]", err);
      return c.json({ error: "Failed to fetch draft" }, 500);
    }
  }

  static async upsertDraft(c: Context) {
    try {
      const organizationId = c.get("organizationId");
      const user = c.get("user") as any;
      const body = await c.req.json();
      const parsed = draftSchema.safeParse(body);

      if (!parsed.success) {
        return c.json({ error: "Invalid payload", details: parsed.error.format() }, 400);
      }

      const payload = parsed.data;

      // 1. Look up target draft if explicit id provided
      let existing = null;
      if (payload.id) {
        existing = await db.query.invoiceDrafts.findFirst({
          where: and(
            eq(invoiceDrafts.organizationId, organizationId),
            eq(invoiceDrafts.id, payload.id),
          ),
        });
      }

      let { draftSections, draftConstants, draftHeaderValues, draftHeaderFields } = payload;

      // 2. If generating a new draft from template (no existing draft targeted)
      if (!existing && (!draftSections || draftSections.length === 0)) {
        const templateId = payload.sourceTemplateId;
        if (templateId) {
          const seeded = await DraftSeeder.hydrateFromTemplate(
            templateId,
            payload.projectId,
            organizationId,
          );
          draftSections = seeded.draftSections;
          draftConstants = seeded.draftConstants;
          draftHeaderValues = { ...seeded.draftHeaderValues, ...(payload.draftHeaderValues || {}) };
          draftHeaderFields = seeded.draftHeaderFields;
        }
      }

      if (existing) {
        const updatedAudit = appendAuditEntry(existing.editHistory, user, "Updated draft");

        const [updated] = await db
          .update(invoiceDrafts)
          .set({
            ...(payload.sourceTemplateId !== undefined
              ? { sourceTemplateId: payload.sourceTemplateId }
              : {}),
            ...(payload.draftHeaderValues !== undefined
              ? { draftHeaderValues: payload.draftHeaderValues }
              : {}),
            ...(payload.draftHeaderFields !== undefined
              ? { draftHeaderFields: payload.draftHeaderFields }
              : {}),
            ...(payload.draftSections !== undefined
              ? { draftSections: payload.draftSections }
              : {}),
            ...(payload.draftConstants !== undefined
              ? { draftConstants: payload.draftConstants }
              : {}),
            ...(payload.name !== undefined ? { name: payload.name } : {}),
            ...(payload.description !== undefined ? { description: payload.description } : {}),
            editHistory: updatedAudit,
            lastAutoSavedAt: new Date(),
          })
          .where(eq(invoiceDrafts.id, existing.id))
          .returning();
        return c.json(updated);
      } else {
        const initialAudit = appendAuditEntry([], user, "Created draft");

        const [created] = await db
          .insert(invoiceDrafts)
          .values({
            id: crypto.randomUUID(),
            organizationId,
            projectId: payload.projectId,
            userId: user.id,
            sourceTemplateId: payload.sourceTemplateId,
            draftHeaderValues: draftHeaderValues || {},
            draftHeaderFields: draftHeaderFields || [],
            draftSections: draftSections || [],
            draftConstants: draftConstants || {},
            editHistory: initialAudit,
            name: payload.name || "Draft",
            description: payload.description,
            lastAutoSavedAt: new Date(),
          })
          .returning();
        return c.json(created);
      }
    } catch (err: any) {
      console.error("[DraftsController.upsertDraft]", err);
      // Item 1.2: Sanitize error response, no stack trace leak
      return c.json(
        { error: "Failed to save draft", details: err?.message || "Unknown error" },
        500,
      );
    }
  }

  static async deleteDraft(c: Context): Promise<Response> {
    try {
      const organizationId = c.get("organizationId");
      const id = c.req.param("id");

      await db
        .delete(invoiceDrafts)
        .where(
          and(
            eq(invoiceDrafts.id, id!),
            eq(invoiceDrafts.organizationId, organizationId!),
          ),
        );

      return new Response(null, { status: 204 });
    } catch (err: any) {
      console.error("[DraftsController.deleteDraft]", err);
      return c.json({ error: "Failed to delete draft" }, 500);
    }
  }
}
