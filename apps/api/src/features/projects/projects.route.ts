import { Hono } from "hono";
import { requireOrgPermission } from "../../infra/middleware/require-permission";
import { projectStatusesRoute } from "../project-statuses/project-statuses.route";
import { ProjectsController } from "./projects.controller";

export const projectsRouter = new Hono();

// IMPORTANT: Mount /statuses and /analytics BEFORE /:id routes so Hono matches the literal path first
projectsRouter.route("/statuses", projectStatusesRoute);
projectsRouter.get(
  "/analytics/workflow-velocity",
  requireOrgPermission("file:view"),
  ProjectsController.getWorkflowVelocityAnalytics,
);

projectsRouter.get("/", requireOrgPermission("file:view"), ProjectsController.listProjects);
projectsRouter.post("/", requireOrgPermission("file:create"), ProjectsController.createProject);
projectsRouter.get(
  "/:id/status-logs",
  requireOrgPermission("file:view"),
  ProjectsController.getStatusLogs,
);
projectsRouter.put("/:id", requireOrgPermission("file:edit"), ProjectsController.updateProject);
projectsRouter.patch(
  "/:id/advance-status",
  requireOrgPermission("file:advance_status"),
  ProjectsController.advanceStatus,
);
projectsRouter.patch(
  "/:id/archive",
  requireOrgPermission("file:delete"),
  ProjectsController.archiveProject,
);
projectsRouter.patch(
  "/:id/unarchive",
  requireOrgPermission("file:delete"),
  ProjectsController.unarchiveProject,
);
projectsRouter.delete(
  "/:id",
  requireOrgPermission("file:delete"),
  ProjectsController.deleteProject,
);

// Attachments
projectsRouter.post(
  "/:id/attachments/presigned",
  requireOrgPermission("file:edit"),
  ProjectsController.getAttachmentUploadUrl,
);
projectsRouter.post(
  "/:id/attachments",
  requireOrgPermission("file:edit"),
  ProjectsController.saveAttachment,
);
projectsRouter.get(
  "/:id/attachments",
  requireOrgPermission("file:view"),
  ProjectsController.listAttachments,
);
projectsRouter.get(
  "/:id/attachments/:attachmentId/proxy",
  requireOrgPermission("file:view"),
  ProjectsController.proxyAttachment,
);
projectsRouter.patch(
  "/:id/attachments/:attachmentId",
  requireOrgPermission("file:edit"),
  ProjectsController.renameAttachment,
);
projectsRouter.delete(
  "/:id/attachments/:attachmentId",
  requireOrgPermission("file:edit"),
  ProjectsController.deleteAttachment,
);
