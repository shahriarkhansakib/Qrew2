/**
 * project_status_transitions — Directed Graph Edges
 *
 * Each row defines one allowed transition in the workflow graph:
 * "A file currently in `fromStatus` can be advanced to `toStatus`."
 *
 * Design Properties:
 * - Supports cycles (A → B → A is valid, e.g. re-opening a closed file).
 * - Supports many-to-many (one status can transition to multiple others and
 *   be reached from multiple others).
 * - Terminal statuses enforced at the application layer: if `toStatus.isTerminal`
 *   is true, no further outgoing transitions are created for it.
 * - uniqueness enforced at DB level: one row per (fromStatusId, toStatusId) pair.
 */

import { relations } from "drizzle-orm";
import { jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { organizations } from "./auth";
import { projectStatuses } from "./project-statuses";

export const projectStatusTransitions = pgTable(
  "project_status_transitions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // The status the file is currently in
    fromStatusId: text("from_status_id")
      .notNull()
      .references(() => projectStatuses.id, { onDelete: "cascade" }),
    // The status the file is allowed to advance to
    toStatusId: text("to_status_id")
      .notNull()
      .references(() => projectStatuses.id, { onDelete: "cascade" }),
    // Role-gating: empty array means available to all roles with project edit permission
    allowedRoleIds: jsonb("allowed_role_ids").$type<string[]>().default([]).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    // One transition edge per (from, to) pair — prevents duplicate graph edges
    unique("status_transition_unique").on(table.fromStatusId, table.toStatusId),
  ],
);

export const projectStatusTransitionsRelations = relations(projectStatusTransitions, ({ one }) => ({
  fromStatus: one(projectStatuses, {
    fields: [projectStatusTransitions.fromStatusId],
    references: [projectStatuses.id],
    relationName: "outgoingTransitions",
  }),
  toStatus: one(projectStatuses, {
    fields: [projectStatusTransitions.toStatusId],
    references: [projectStatuses.id],
    relationName: "incomingTransitions",
  }),
}));

export type ProjectStatusTransition = typeof projectStatusTransitions.$inferSelect;
export type NewProjectStatusTransition = typeof projectStatusTransitions.$inferInsert;
