# Architectural Decision Records (ADRs)

This directory maintains the persistent log of all critical architectural, business, and domain decisions made throughout the lifecycle of the platform.

Each record documents the context, alternatives considered, exact decision taken, and the consequences for the codebase.

---

## Decision Index

| ADR | Title | Date | Status | Scope |
|:---:|:---|:---:|:---:|:---|
| [**0001**](./0001-four-data-field-categories.md) | **Four-Tier Data Field Categorization Architecture** | 2026-10-15 | Accepted | Schema, Custom Fields, PBAC |
| [**0002**](./0002-invoice-lifecycle-and-correction-workflow.md) | **Invoice State Machine and Non-Destructive Correction Workflow** | 2026-10-16 | Accepted | Invoices, State Transitions, Audit |
| [**0003**](./0003-multi-draft-collaboration-and-audit-trail.md) | **Multi-Draft Project Collaboration and Lightweight Audit Trail** | 2026-10-16 | Accepted | Invoices, Drafts, Collaboration |
| [**0004**](./0004-calculation-precision-and-domain-generalization.md) | **General-Purpose Domain Decoupling, Zero-Float Arithmetic, and Precision** | 2026-10-17 | Accepted | Engine, MathJS, Schema |

---

## ADR Guidelines for Agents and Contributors

1. **Immutability of History**: Once an ADR is marked `Accepted`, do not rewrite historical context. If an architectural decision changes later, create a new ADR that explicitly references and supersedes the older one (e.g., `Supersedes ADR-0004`).
2. **Standard Structure**:
   * **Title**: `ADR-XXXX: Descriptive Noun Phrase`
   * **Status**: `Proposed` | `Accepted` | `Deprecated` | `Superseded`
   * **Date**: ISO Date (`YYYY-MM-DD`)
   * **Context & Problem Statement**: The exact real-world scenario, limitations, or bug driving the decision.
   * **Decision**: Clear bullet points, code contracts, schemas, or Mermaid diagrams specifying the solution.
   * **Consequences**: Explicit positive and negative tradeoffs.
