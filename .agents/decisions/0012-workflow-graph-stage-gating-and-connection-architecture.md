# ADR-0012: Workflow Studio Graph Architecture, Terminal Stage Semantics, Role-Gated Transitions, and Interactive Connection Engine

- **Status**: Accepted
- **Date**: 2026-10-19
- **Scope**: Workflows, Project Statuses, Visual Graph, PBAC, State Machine

---

## 1. Context & Problem Statement

The Workflow Studio enables organizations to define custom operational pipelines (directed state machine graphs) for projects and files. During sprint verification, two core architectural requirements and one critical usability bug were identified:

1. **Terminal Stage Semantic Invariant**:
   - The purpose, mechanisms, and database constraints governing the "Terminal stage" toggle needed formal architectural documentation to prevent invalid transitions and undefined lifecycle states.
2. **Transition & Role-Gating Mechanism**:
   - The "Transitions & Role-Gating" tab defines legal next steps in the state machine and restricts stage advancements by user role. The architectural contracts, API validation, and fallback mechanisms required formal documentation.
3. **Interactive Connection Mode Bug ("Select the source node" Deadlock)**:
   - When entering "Connect" mode in the visual workflow graph, a banner prompted the user to `"Select the source node"`. However, clicking on any node circle produced zero response, preventing edge creation.
   - **Root Cause**: `WorkflowNodeCircle` accepted an `onClick` prop from its parent, but never attached it to its outer container `<div>`. The only click handler existed on a nested hover pencil button (`{!connectMode && <button onClick={onClick} ...>}`), which was unmounted during connect mode. Consequently, the node was completely inert.

---

## 2. Decision & Architecture

### 2.1 Terminal Stage Semantics & Invariants
- **Sink Node Definition**: A terminal stage (`isTerminal: true`) represents an end-state milestone (e.g. `Completed`, `Archived`, `Cancelled`).
- **Zero-Outbound Invariant**: Terminal stages cannot possess outgoing transitions.
  - **Frontend Enforcement**: In `AddStageModal` and `EditStageModal`, toggling "Terminal stage" automatically wipes and disables outgoing transition selections (`setTransitions([])`).
  - **Backend Enforcement**: In `PUT /api/project-statuses/:id/transitions`, if `source.isTerminal && toStatusIds.length > 0`, the server strictly rejects with `400 Bad Request ("Terminal status cannot have outbound transitions.")`.
- **Runtime Lifecycle Behavior**:
  - In Kanban and Project Details views, projects at a terminal stage do not display "Advance Stage" actions; they render immutable badges (`Workflow Finished` / `Workflow Closed`).

### 2.2 Transitions & Role-Gating Architecture
- **Directed Edge Model**: Workflow edges are stored in `project_status_transitions`:
  - `fromStatusId`: Source stage UUID.
  - `toStatusId`: Target stage UUID.
  - `allowedRoleIds`: JSONB string array of organizational role IDs authorized to trigger this transition.
- **PBAC Authorization in `advanceStatus`**:
  - When an authorized member attempts to move a project to a new status (`PATCH /api/projects/:id/advance-status`), the API checks whether an edge exists between `currentStatus` and `targetStatus`.
  - If transitions exist in the organization and no edge connects them, the API returns `422 Unprocessable Entity ("Transition not allowed")`.
  - If `allowedRoleIds` is specified on the transition edge, non-owner users must possess at least one of the matching role IDs, or the API rejects with `403 Forbidden ("You do not have permission to transition to this stage")`.
- **Graph Splice on Intermediate Node Deletion**:
  - When deleting an intermediate stage $B$ situated between $A \to B \to C$, the deletion endpoint automatically repoints all inbound edges ($A \to B$) directly to all of $B$'s outbound targets ($A \to C$). This preserves overall graph connectivity and prevents orphan workflows.
- **Initial-to-Completed Immutable Bridge**:
  - The direct edge between the initial stage (`isInitial: true`) and the default system completed stage (`isSystem: true`) cannot be severed (`403 Forbidden`).

### 2.3 Interactive Connection Engine & Click Gating (`workflow-graph.tsx`)
- **Direct Container Click Handler**: The outer `<div className="group cursor-pointer select-none">` of `WorkflowNodeCircle` now directly receives `onClick={handleClick}`.
- **Drag-vs-Click Threshold Detection**:
  - Repositioning nodes on the Cartesian grid uses pointer capture.
  - Pointer movement is tracked via `dragMovedRef.current = Math.hypot(deltaX, deltaY) > 5`.
  - If the user was dragging the node to another grid cell, click events are suppressed. If pointer movement is within the 5px jitter threshold, it cleanly fires the click handler.
- **Visual Feedback & Guided State Machine**:
  - **Step 1 (Source Selection)**: The top banner prompts `"Click any stage to begin a connection"`. Eligible source nodes pulse with an indigo ring on hover. Terminal nodes show `cursor-not-allowed opacity-40`.
  - **Step 2 (Target Selection)**: Once a source is selected, the banner updates to `"Source: [Stage Name] → Click Target stage to connect"`. The source node maintains a highlighted active ring. Eligible downstream target nodes display an emerald (`#10b981`) ring on hover. Initial nodes or self-loops show `cursor-not-allowed opacity-40`.
  - **Step 3 (Edge Creation & Role Preservation)**: Clicking an eligible target invokes `onConnectNodes(sourceId, targetId)`. The builder mutation preserves all existing `allowedRoleIds` for intact transitions and shows a toast confirmation if already connected.

---

## 3. Consequences

### Positive
- Fully functional, intuitive visual edge creation directly on the canvas without opening modals.
- Eliminates accidental modal launches when dragging nodes across grid coordinates.
- Prevents invalid graph topologies (terminal stages with outbound edges; initial-to-completed bridge deletion).
- Enforces strict role-gating PBAC across project workflows without breaking existing transitions.

### Negative / Tradeoffs
- Rapid clicking immediately following a drag must wait for pointer release to clear the drag threshold ref.
