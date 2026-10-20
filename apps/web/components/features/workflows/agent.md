# Workflow Studio & Visual Graph Architectural Contract

**Location**: `apps/web/components/features/workflows/agent.md`  
**Status**: Active / Production Binding Contract  
**Version**: 1.0.0  

This document serves as the architectural contract for the interactive Workflow Studio, visual workflow graph, stage creation/editing modals, and transition role-gating interface. Any modifications to files in this directory must strictly respect the invariants defined herein.

---

## 1. Core Responsibilities
- **Owns**:
  - `WorkflowBuilder` (`workflow-builder.tsx`): Main canvas orchestrating status nodes, layout controls, undo/redo state stacks, and action mutations.
  - `WorkflowGraph` (`workflow-graph.tsx`): Interactive 2D coordinate grid, draggable SVG nodes (`WorkflowNodeCircle`), Bezier curves (`edgePath`), arrow markers, and connection mode engine.
  - `AddStageModal` (`add-stage-modal.tsx`) & `EditStageModal` (`edit-stage-modal.tsx`): Stage metadata forms, terminal status flags, required entry fields, and role-gated transition settings.
- **Must NEVER Touch**:
  - Direct execution of financial formulas or AST billing computations (`apps/api/src/features/invoices/engine`).
  - Kanban project drag-and-drop state machines (`apps/web/components/features/projects/kanban-view.tsx`).

---

## 2. Invariants & Non-Negotiable Rules
1. **Interactive Node Click Gating**:
   - Every `WorkflowNodeCircle` container must be directly clickable in both Normal Mode (to open the edit modal) and Connect Mode (to select source and target stages).
   - Drag moves must be distinguished from clicks using pointer drag delta thresholds (`Math.hypot(deltaX, deltaY) > 5`). Repositioning a node on the grid must never trigger the edit modal.
2. **Terminal Stage Invariants**:
   - A terminal stage (`isTerminal: true`) represents an end state (sink node) with zero outgoing transitions (`transitions: []`).
   - Toggling a stage as terminal automatically clears and disables outbound transition selections in the UI and is strictly rejected by the backend if outbound transitions are supplied (`400 Terminal status cannot have outbound transitions.`).
3. **Directed Graph Connectivity & Edge Preservation**:
   - In Connect Mode, selecting a source stage must visually highlight eligible downstream target nodes in emerald (`#10b981`), while disabling invalid targets (e.g., self-loops or initial nodes).
   - When connecting nodes or deleting edges, mutations must preserve existing `allowedRoleIds` metadata for intact transitions rather than resetting them to empty arrays.
   - Deletion of an intermediate node splices inbound edges to downstream target nodes on the backend to prevent graph disconnection.
4. **Initial-to-Completed Immutable Bridge**:
   - The direct connection between the Initial stage (`isInitial: true`) and the System Completed stage (`isSystem: true`) cannot be severed (`403`).

---

## 3. Data Model & Schema Mapping
- `projectStatuses`:
  - `id`: UUID primary key.
  - `name`: Unique stage name within the organization.
  - `color`: Hex color string (`#rrggbb`).
  - `isInitial`: Boolean flag indicating entry stage for newly created projects.
  - `isTerminal`: Boolean flag indicating completion or termination stage.
  - `isSystem`: Boolean flag marking immutable core system stages.
  - `gridColumn` & `gridRow`: Cartesian grid layout coordinates.
- `projectStatusTransitions`:
  - `id`: UUID primary key.
  - `organizationId`: Multi-tenant isolation scope.
  - `fromStatusId`: Source node foreign key.
  - `toStatusId`: Target node foreign key.
  - `allowedRoleIds`: JSONB string array of role IDs authorized to trigger this transition.

---

## 4. Security & PBAC Permissions
- **Route Guard**: All status modifications and workflow updates require `workflow:manage` permission on `@starter/api`.
- **Runtime Transition Enforcement**: Moving projects between stages calls `PATCH /api/projects/:id/advance-status`. If `allowedRoleIds` is populated for the transition, non-owner users must hold an authorized role, or the API rejects with `403 Forbidden`.

---

## 5. Error States & Codes
- `400 Bad Request`: Duplicate stage name, self-loop transition, or adding outbound transitions to a terminal stage.
- `403 Forbidden`: Attempting to delete system/default status, or attempting to remove the immutable initial-to-completed transition edge.
- `409 Conflict`: Grid coordinate collision or attempting to delete a stage that still has assigned projects (`Postgres 23503`).
- `422 Unprocessable Entity`: Attempting to advance a project across an unauthorized or non-existent transition path.
