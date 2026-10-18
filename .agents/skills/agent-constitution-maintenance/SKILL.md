---
name: agent-constitution-maintenance
description: Strict rules and best practices for creating, maintaining, and synchronizing AGENTS.md / agent.md architectural contracts across the monorepo without drift or conflicting specifications.
---

# Agent Constitution Maintenance (AGENTS.md & Feature Contracts)

This skill governs how architectural directives, invariants, and feature contracts are documented, maintained, and synchronized across this monorepo. Every `AGENTS.md` or `agent.md` is a legally binding contract for AI agents and human engineers.

---

## 1. File Naming & Directory Placement Standards

1. **Standard Filename**:
   - Feature directories use localized `agent.md` files (e.g., `apps/api/src/features/invoices/agent.md`).
   - Root rules and core architectural modules use `AGENTS.md` (e.g., `.agents/AGENTS.md`).
2. **Strict Prohibition on Duplicate Names**:
   - Never allow both `agent.md` AND `AGENTS.md` in the exact same directory. On case-insensitive file systems (Windows, macOS), duplicate files collide and cause non-deterministic behavior.
3. **Identifier Coverage**:
   - Every major domain package or feature folder (`apps/api/src/features/*`, `apps/web/components/features/*`, `packages/db`) MUST maintain an architectural contract defining its invariants, permissions, and models.

---

## 2. Invariant Synchronization (Zero-Drift Rule)

When an architectural contract evolves in one layer, sibling and child files MUST be synchronized in the same changeset:

1. **Schema & Model Evolution**:
   - When a database table, enum, or column changes (e.g. `documentTypeEnum` or `invoice_drafts.editHistory`), all references in backend and frontend `agent.md` files must be updated immediately.
2. **State Machine Consistency**:
   - Status workflows (e.g. `draft -> frozen -> issued -> paid / disputed / void`) must be documented with identical state diagrams across both backend and frontend agent files.
3. **Deprecation Purge**:
   - When an old paradigm is replaced (e.g., single-value row architecture replacing multi-component rows; unified `FILE_<KEY>` token replacing dual-token injection), deprecated instructions must be purged to prevent agents from hallucinating obsolete conventions.

---

## 3. Required Sections in Every Feature Constitution

Every feature-level `agent.md` must contain:
1. **Header Block**: Location, version/status, binding notice.
2. **Core Responsibilities**: What this directory owns and what it must NEVER touch.
3. **Invariants & Non-Negotiable Rules**: Mathematical, security, or PBAC rules that cannot be violated.
4. **Data Model / Schema Mapping**: Exact Drizzle tables, columns, and relations utilized.
5. **Security & PBAC Permissions**: Specific permission keys (`requireOrgPermission(...)`) and tenant isolation rules.
6. **Error States & Codes**: Standard HTTP codes and domain error payloads (`{ error: string }`).
7. **Testing Requirements**: Required test files, mock conventions, and invariant assertions.

---

## 4. Architectural Decision Records (ADRs in `.agents/decisions/`)

Whenever an architectural, domain, or business decision is agreed upon with the user or engineering leads:
1. Create a sequentially numbered ADR in `.agents/decisions/XXXX-<slug>.md`.
2. Follow the standard ADR structure (Title, Status, Date, Deciders, Context, Decision, Consequences).
3. Update `.agents/decisions/README.md` to register the new ADR in the decision index.
4. Update relevant `agent.md` files to reflect the new invariants without drift.

