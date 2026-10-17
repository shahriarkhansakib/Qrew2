# ADR-0003: Multi-Draft Project Collaboration and Lightweight Audit Trail

- **Status**: Accepted
- **Date**: 2026-10-16
- **Deciders**: Software Architecture Team, Lead Product Engineer
- **Context**: Invoice Drafting / Team Collaboration Architecture

---

## Context & Problem Statement

Initial prototypes constrained invoice drafts to a single draft per project per user (`UNIQUE (projectId, userId)`). In real agency environments, multiple team members (account managers, billing specialists, finance directors) frequently work on different billing proposals, retainers, and milestone drafts for the same client project. Furthermore, team members must be able to collaborate on each other's drafts without losing creator attribution or having unmonitored edits.

A full-fledged event-sourcing or row-level audit table was deemed unnecessarily heavy for draft-state edits, but team visibility into "who changed what and when" was an absolute requirement.

---

## Decision

We removed the single-draft restriction and introduced multi-draft collaboration backed by an embedded, lightweight JSONB audit trail (`editHistory`).

### 1. Unlimited Project Drafts
* Projects can have any number of drafts created by any team member with `finance:manage_invoices` permissions.
* The draft table constraint is keyed by `id` (primary key).
* Each draft explicitly preserves the creator's identity (`userId`) for lifecycle attribution.

### 2. Organization-Wide Shared Editing
* Any user in the organization holding the `finance:manage_invoices` permission can view and edit any active draft within that organization.
* Multi-tenant scoping (`eq(invoiceDrafts.organizationId, orgId)`) is enforced unconditionally on all draft CRUD operations.

### 3. Lightweight JSONB Audit Trail (`editHistory`)
* Stored directly inside `invoice_drafts.editHistory` (`DraftEditAuditEntry[]`).
* Structure:
  ```typescript
  export interface DraftEditAuditEntry {
    userId: string;
    userName: string;
    action: string;      // e.g., "Updated line items", "Changed payment terms"
    timestamp: string;   // ISO 8601 string
  }
  ```
* **Coalescing Rule**: Consecutive edits by the same user within 2 minutes coalesce into a single entry to prevent database bloat from rapid autosaves or iterative keystrokes.
* **Storage Cap**: The audit array is capped at the 50 most recent entries per draft to ensure constant-size payload serialization.

---

## Consequences

* **Positive**:
  * Unlocks realistic agency workflows where billing teams draft multiple invoice scenarios for a client.
  * Clear accountability: creators and subsequent editors are visibly identified.
  * Zero overhead: no secondary database table joins or complex migrations required.
