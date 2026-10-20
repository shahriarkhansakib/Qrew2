# Project Statuses & Workflow Engine Architectural Contract

**Location**: `apps/api/src/features/project-statuses/agent.md`  
**Status**: Active / Production Binding Contract  
**Version**: 1.0.0  

This document defines the backend architectural invariants, API contracts, database schemas, and transition security guarantees for project statuses and workflow DAG orchestration.

---

## 1. Core Responsibilities
- **Owns**:
  - `projectStatusesRoute` (`project-statuses.route.ts`): CRUD operations for stages, grid layout updates, atomic node swaps, transition management, and stage field assignments.
  - `computeLayoutSeed` (`layout-seeder.ts`): Graph topological layout seeder for auto-populating Cartesian grid coordinates (`gridColumn`, `gridRow`).
- **Must NEVER Touch**:
  - Direct execution of project creation or project metadata editing (`apps/api/src/features/projects`).

---

## 2. Invariants & Non-Negotiable Rules
1. **Terminal Stage Invariant**:
   - Stages marked `isTerminal: true` are mathematical sink nodes. The endpoint `PUT /:id/transitions` explicitly forbids outbound transitions from terminal nodes (`400 Terminal status cannot have outbound transitions.`).
2. **Atomic Grid Coordinate Swapping**:
   - Reordering or swapping two grid nodes (`POST /:id/swap`) must execute within an atomic PostgreSQL transaction (`db.transaction`) to prevent duplicate coordinate collisions (`409 Conflict`).
3. **Graph Splicing on Deletion**:
   - When deleting an intermediate stage B that connects A → B → C, the deletion handler MUST re-point all inbound edges (A → B) to each of B's outbound targets (A → C) before dropping B. This prevents graph fragmentation.
4. **Initial-to-Completed Immutable Edge**:
   - The edge connecting the initial status (`isInitial: true`) to the default completed status (`isSystem: true`) cannot be removed (`403 Forbidden`).
5. **Foreign Key Integrity**:
   - If projects are currently assigned to a stage, Postgres foreign key constraints (`23503`) prevent deletion, and the route returns a user-friendly `409 Conflict`.
6. **Role-Gated Transitions**:
   - The `allowedRoleIds` column stores role IDs permitted to transition a file across the edge. In `projects.controller.ts:advanceStatus`, if `allowedRoleIds` is non-empty, non-owner users lacking matching roles are rejected with `403 Forbidden`.

---

## 3. Data Model & Schema Mapping
- `projectStatuses`:
  - `id`: UUID primary key.
  - `organizationId`: Multi-tenant isolation scope.
  - `name`: Unique stage name within organization.
  - `color`: Hex color string (`#rrggbb`).
  - `order`: Numeric display order.
  - `isInitial`: Initial stage flag.
  - `isTerminal`: Terminal stage flag.
  - `isDefault`: Default system stage flag.
  - `isSystem`: Immutable system status flag.
  - `gridColumn` & `gridRow`: Cartesian grid placement coordinates.
- `projectStatusTransitions`:
  - `id`: UUID primary key.
  - `organizationId`: Multi-tenant isolation scope.
  - `fromStatusId`: Foreign key referencing source stage.
  - `toStatusId`: Foreign key referencing target stage.
  - `allowedRoleIds`: JSONB string array of role IDs.
- `projectStatusFields`:
  - `id`: UUID primary key.
  - `organizationId`: Multi-tenant isolation scope.
  - `statusId`: Stage foreign key.
  - `fieldId`: Custom field definition foreign key.
  - `isVisibleInStage`: Boolean display visibility flag.
  - `isRequiredToEnter`: Boolean stage-gate validation requirement flag.

---

## 4. Security & PBAC Permissions
- All modification endpoints (`POST /`, `PATCH /:id`, `PATCH /:id/position`, `POST /:id/swap`, `DELETE /:id`, `PUT /:id/transitions`, `PUT /:id/fields`) enforce `requireOrgPermission("workflow:manage")`.
- Reading workflow stages (`GET /`) enforces `requireOrgPermission("file:view")`.

---

## 5. Error States & Codes
- `400 Bad Request`: Stage name collision, self-loop transition, or outbound transitions on terminal node.
- `403 Forbidden`: Renaming or deleting system status, or deleting initial-to-completed transition edge.
- `404 Not Found`: Stage or target status does not exist within the organization.
- `409 Conflict`: Grid coordinate cell collision or stage has existing assigned projects (`23503`).
- `422 Unprocessable Entity`: Attempting to advance a project via an unauthorized transition path.
