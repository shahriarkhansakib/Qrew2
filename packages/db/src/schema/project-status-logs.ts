import { relations } from "drizzle-orm";
import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { projectStatuses } from "./project-statuses";
import { projects } from "./projects";

export const projectStatusLogs = pgTable("project_status_logs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  fromStatusId: text("from_status_id").references(() => projectStatuses.id, {
    onDelete: "set null",
  }),
  toStatusId: text("to_status_id")
    .notNull()
    .references(() => projectStatuses.id, { onDelete: "cascade" }),
  changedById: text("changed_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  changedAt: timestamp("changed_at", { mode: "date" }).defaultNow().notNull(),
  timeInPreviousStageSeconds: integer("time_in_previous_stage_seconds").default(0).notNull(),
  stageSnapshot: jsonb("stage_snapshot").$type<Record<string, any>>().default({}).notNull(),
});

export const projectStatusLogsRelations = relations(projectStatusLogs, ({ one }) => ({
  project: one(projects, {
    fields: [projectStatusLogs.projectId],
    references: [projects.id],
  }),
  fromStatus: one(projectStatuses, {
    fields: [projectStatusLogs.fromStatusId],
    references: [projectStatuses.id],
    relationName: "fromStatusLogs",
  }),
  toStatus: one(projectStatuses, {
    fields: [projectStatusLogs.toStatusId],
    references: [projectStatuses.id],
    relationName: "toStatusLogs",
  }),
  changedBy: one(users, {
    fields: [projectStatusLogs.changedById],
    references: [users.id],
  }),
}));

export type ProjectStatusLog = typeof projectStatusLogs.$inferSelect;
export type NewProjectStatusLog = typeof projectStatusLogs.$inferInsert;
