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
2. **Dynamic Terminal & Initial Node Semantics**:
   - There is no manual boolean toggle (`isTerminal`). A node is dynamically terminal if and only if its outgoing edge count is 0 (`out-degree = 0`).
   - A node is dynamically a starting node if its inbound edge count is 0 (`in-degree = 0`). `Created` is the designated primary default entry point for new projects.
   - Unconnected draft stages ($in=0 \land out=0$) are classified as unlinked draft nodes with neutral styling, preventing premature initial/terminal classification.
3. **Five Semantic Node Categories & Color Palette**:
   - **Default Initial (`Created`)**: Royal Indigo (`#6366f1`)
   - **Other Starting Nodes** ($in=0 \land out>0$): Vibrant Violet (`#8b5cf6`)
   - **Default Terminal (`Completed`)**: Signature Emerald (`#10b981`)
   - **Other Terminal Nodes** ($in>0 \land out=0$): Teal / Mint (`#0d9488` / `#14b8a6`) or Rose (`#f43f5e` for negative outcomes)
   - **Intermediate Nodes** ($in>0 \land out>0$): Sky Blue (`#3b82f6` or user custom)
4. **Edge Creation Exclusivity & Modal Transition Gating**:
   - Edge creation is strictly confined to the 3 visual gestures on the canvas (Node `+`, Edge `+`, Connect tool).
   - The Stage Modal's "Transitions & Role-Gating" tab displays ONLY directly connected outgoing edges, allowing staff to configure role PBAC (`allowedRoleIds`) or disconnect edges. Checkboxes creating new edges are strictly prohibited.
5. **Path Reachability Invariant (Liveness / BFS)**:
   - Direct edge between `Created` and `Completed` is NOT required; workflows can pass through arbitrary intermediate pipelines.
   - However, a directed path must always connect `Created` to `Completed` ($\text{Created} \rightsquigarrow \text{Completed}$).
   - Every active starting node ($in=0 \land out>0$) must have a directed path to at least one completion node ($\forall s \in S \quad \exists t \in T : s \rightsquigarrow t$). Live graph health is displayed in the canvas toolbar.

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
