# ADR-0006: Optional Period Billing, Backend Engine Isolation, and Multi-Draft Lifecycle

- **Status**: Accepted
- **Date**: 2026-10-17
- **Deciders**: Software Architecture Team, Lead Product Engineer
- **Context**: Invoicing Pipeline, Expense Lifecycles, Multi-Draft Collaboration, Bundle Architecture

---

## Context & Problem Statement

As the platform expanded from maritime agency billing into general professional services (creative agencies, consulting firms, architecture studios, and software consultancies), several critical architectural decisions were required:

1. **Mandatory vs. Optional Period Billing**:
   * Some billing models require milestone or monthly retainer cycles (e.g., "March 2026 Out-of-Pocket Expenses").
   * However, forcing users to always specify billing dates would disrupt fixed-fee engagements, turnkey project deliverables, and continuous lifetime retainers.
   * If a draft is created and additional project expenses continue to be logged, the invoice must reflect the latest figures automatically rather than storing static, stale numbers.

2. **Backend Engine Isolation vs. Client Bundle Concerns**:
   * Evaluated replacing `mathjs` on the server with a lightweight combination (`jsep` + `decimal.js`, ~35 KB).
   * We needed to determine if replacing `mathjs` on the backend yielded any client browser bundle reduction or if it introduced unnecessary mathematical regression risks.

3. **Multi-Draft Collaboration & Lifecycle Guardrails**:
   * Multiple team members may collaborate on different draft scenarios for a single project (e.g., standard billing vs. discounted milestone).
   * Finalization must target the exact selected draft by `draftId` rather than blindly guessing by `projectId` and `userId`.
   * Reverting an invoice for correction must require an explicit confirmation dialog and immediately transition into the restored draft editor.

---

## Decision

### 1. Non-Mandatory Period Billing with "Full Lifetime" Default

* **Default to Full Project Timeline**:
  * Period-based billing is **strictly optional**. The default setting in `GenerateInvoiceModal` is **Full Project Timeline (Dynamic Live Sync)**.
  * When period dates are omitted (`periodStart = null`, `periodEnd = null`), `token-resolver.service.ts` omits `gte`/`lte` timestamp conditions and sums all recorded expenses for the project.
* **Dynamic Token-Driven Real-Time Sync**:
  * Drafts store token references (e.g. `EXP_TOTAL`, `EXP_TRAVEL`) rather than static numeric amounts.
  * Whenever a draft is opened, previewed, or finalized, the engine re-evaluates tokens against the live database `expenses` table in real time. If team members log new expenses while a draft is open, they are automatically calculated on the next preview.
* **Optional Date Range Scoping**:
  * When a user explicitly chooses "Specific Billing Period", `PERIOD_START` and `PERIOD_END` are saved in `draftHeaderValues`.
  * The resolver applies `expenses.createdAt >= periodStart` and `expenses.createdAt <= periodEnd` to isolate expenses for that specific billing cycle.

### 2. Backend Engine Isolation & Preserving MathJS

* **Zero Frontend Bundle Contribution**:
  * `mathjs` is imported and executed strictly inside `@starter/api` on the Node.js server. It contributes **0 KB** to client browsers.
  * Client-side preview in `@starter/web` relies on a pure, isolated TypeScript evaluator with MathJS BigNumber evaluation matching backend parity.
* **No Rewrite to `jsep + decimal.js`**:
  * Rewriting the server engine to `jsep + decimal.js` would offer zero browser performance benefit while risking calculation regressions across hundreds of financial tests.
  * Formula security is enforced via strict keystroke gating (`useFormulaKeyDown`), regex allowlists (`VALID_CHAR_RE`), and DAG validation, completely mitigating expression injection risks.

### 3. Multi-Draft Collaboration & Explicit Draft Targeting

* **Targeted Finalization**:
  * `freezeInvoice` accepts an optional `draftId?: string`. When provided, it loads and deletes the exact targeted draft, allowing organizations to maintain multiple drafts per project without cross-draft interference.
* **Project Page & Modal Visibility**:
  * Both the project details page (`/dashboard/projects/[id]`) and modal (`ProjectDetailsModal`) display active collaborative drafts alongside finalized invoices.
  * Shows creator attribution, last auto-saved timestamp, and one-click "Resume Draft" actions.

### 4. Guarded Invoice Correction ("Revert to Draft")

* **Confirmation Dialog**:
  * Triggering "Revert to Draft (Correct)" on frozen, issued, or disputed invoices now presents a confirmation `AlertDialog`.
  * Warns the user that the frozen invoice will be safely converted back into an editable draft session.
* **Seamless Workflow**:
  * Backend `InvoicesController.unfreezeInvoice` creates an active draft titled `Correction: <DocNum>`, copies snapshot sections and headers, deletes the previous frozen invoice to release document sequence locks, and returns `{ success: true, draftId }`.
  * The frontend immediately redirects the user to `/dashboard/invoices/drafts/<draftId>` to proceed with edits.

### 5. Out-of-the-Box General Agency Seed Templates

* `seedAgencyTemplates` in `@starter/db` automatically seeds standard templates for any organization:
  1. **Creative Agency Retainer & Pass-Through**: Retainer fee + strategy consulting + pass-through expenses (`EXP_TOTAL`) + administrative markup (`CLAMP(EXP_TOTAL * 0.10, 50, 500)`).
  2. **Time & Materials Consulting**: Hourly consulting + direct disbursements (`EXP_TOTAL`) + volume adjustment (`MIN(CONSULTING_BASE * 0.05, 200)`).

---

## Consequences & Compliance

* **Positive**:
  * Maximum flexibility for both continuous retainers and cycle-based milestone billing.
  * Real-time expense updates ensure drafts are never stale.
  * Multi-draft collaboration prevents overwriting concurrent team drafts.
  * High stability with zero mathematical regressions and zero client bundle inflation.
* **Compliance**:
  * Adheres to the 4 Data Field Categorization Rules and PBAC security guidelines.
  * Retains append-only immutability for expense records.
