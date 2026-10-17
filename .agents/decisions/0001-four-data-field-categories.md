# ADR-0001: Four-Tier Data Field Categorization Architecture

- **Status**: Accepted
- **Date**: 2026-10-15
- **Deciders**: Software Architecture Team, Product Engineering
- **Context**: B2B SaaS Monolith / Custom Fields & PBAC Architecture

---

## Context & Problem Statement

As this platform expands into an extensible multi-tenant agency management and billing platform, entities (Projects, Clients, Invoices, Expenses) require customized fields and access controls. Previously, there was a risk of architectural overlap where custom fields, system fields, metadata, and financial computations were mixed together in the schema builder, leading to potential data leaks and inconsistent permission enforcement.

We needed a strict, unambiguous categorization rule governing how all fields across the monorepo are defined, stored, and protected.

---

## Decision

Every field across the entire platform MUST be categorized into one of the following four distinct categories:

### Category 1: Configurable System Fields
* **Definition**: Fields natively built into the entity (e.g., Project Name, Project Status, Client Name) that need to appear in the Custom Fields UI so administrators can configure whether they are "Detailed", "Sensitive", or "Private".
* **Implementation**: Hardcoded into `SYSTEM_FIELDS` arrays on the custom fields settings page. Note: Fundamental identifiers (e.g., Name, Status) are not eligible for `isPrivate`.
* **Backend Enforcement**: Configuration toggles are stored in `org_settings.metadata` (e.g. `sysDetailedFields`, `sysPrivateFields`). The backend API MUST inspect these settings and explicitly delete (scrub) the data from API payloads before sending responses to clients lacking required permissions (e.g., non-owners for Private fields).

### Category 2: Custom Fields
* **Definition**: Dynamic fields created by end-users (e.g., custom dates, text inputs, numeric parameters, single-select dropdowns).
* **Implementation**: Definitions are stored in `custom_field_definitions`. Values are stored inside the `customFields` JSONB column of the entity. They strictly respect "Detailed", "Sensitive", and "Private" PBAC flags.
* **Backend Enforcement**: The backend MUST filter unauthorized keys out of the `customFields` JSONB payload before serialization. Hiding fields in the frontend UI is not sufficient.

### Category 3: Immutable Auto-Fields (Metadata)
* **Definition**: System-generated metadata columns (e.g., `createdAt`, `updatedAt`, `createdBy`, `id`). These are strictly read-only.
* **Implementation**: These fields MUST NEVER be placed in the Custom Fields schema builder because users cannot configure their definition or storage. Instead, visibility is controlled by user-level Table View Settings (e.g. a "Columns" dropdown on data tables).

### Category 4: Computed / Financial Fields
* **Definition**: Aggregated, calculated, or highly sensitive financial totals (e.g., `totalExpenses`, `totalRevenue`, `invoiceCount`, `margin`).
* **Implementation**: DO NOT govern these fields using the Custom Fields "Sensitive" toggle. Financial and computed data MUST be strictly wrapped in hardcoded Role-Based Access Control (PBAC) components (e.g., `<Can I="finance:view_expenses">`) in the frontend and gated by endpoint authorization in the backend. If a user lacks the explicit permission, the column/field is completely omitted.

---

## Consequences & Compliance

* **Positive**:
  * Prevents privilege escalation and unintended disclosure of financial aggregates.
  * Eliminates schema bloat in `custom_field_definitions`.
  * Simplifies UI configuration by separating administrative schema design from end-user table column preferences.
* **Negative**:
  * Engineers must verify that any newly added entity property is consciously assigned to one of the 4 tiers before exposing it in controllers or UI.
