# Invoice Generation Workflow — Design Document

**Module:** `apps/api/src/features/invoices/`
**Frontend:** `apps/web/app/(app)/dashboard/invoices/`, `apps/web/components/features/invoices/`
**Last Updated:** 2026-07-10
**Status:** Binding Workflow Spec — Read before any invoice-related implementation

---

## 1. Purpose

This document captures the complete, approved end-to-end invoice generation workflow so that any future implementor (human or agent) can pick up context without requiring re-explanation from the product owner.

---

## 2. The Two Surfaces: Template Configuration vs. Invoice Draft

There are **two completely separate editing surfaces** that must never bleed into each other:

| Surface | Who Edits | What Gets Changed | Where |
|---|---|---|---|
| **Template Configuration** | Admin/Billing Manager | The master template — row formulas, sections, header field definitions, section charges | `/dashboard/invoices/templates/[id]` |
| **Invoice Draft** | Manager/Staff | A per-file copy of the template data — file-specific field values and manual overrides only. The master template is NEVER modified. | `/dashboard/invoices/drafts/[id]` |

**Core Rule:** When a user generates a draft from a file, the system clones the template's structure into the draft's `draftSections` field. Any subsequent editing happens only on that draft copy. The master template is frozen for that invoice.

---

## 3. Full Workflow — Step by Step

### Step 1: Viewing a File

The user opens the **File Details Modal** (project-details-modal). Inside this modal, in the right sidebar, there are two sections relevant to invoicing:

1. **Financials** — shows total expenses, with an "Add Expense" and "Generate Invoice" button.
2. **Invoices** — a dedicated section that lists all **finalized invoices** that have been generated for this specific file. Each invoice shows: document number, status, amount, date. This section is only visible to users with `invoice:view` permission.

### Step 2: Generating an Invoice

1. User clicks **"Generate Invoice"** in the Financials section of the file modal.
2. A `GenerateInvoiceModal` opens and shows a dropdown of all active invoice templates.
3. User selects a template (e.g., "template1") and clicks **Generate**.
4. The frontend calls `PUT /api/invoices/drafts` with `{ projectId, sourceTemplateId }`. This is an **upsert** — if a draft already exists for this user+project, it is overwritten with the new template selection.
5. The backend returns the created/updated draft with its `id`.
6. The frontend **navigates to** `/dashboard/invoices/drafts/[id]`.

> **Why upsert, not create?** A single file can have multiple finalized invoices, but a user should only have one **in-progress draft** at a time per file. This prevents cluttered half-finished drafts. When a draft is finalized into an invoice, it is deleted.

### Step 3: The Invoice Draft Page — View Mode (Default)

When the user arrives at `/dashboard/invoices/drafts/[id]`, they are in **View Mode** by default.

In **View Mode**:
- The draft is **read-only**. No edits are possible.
- The page shows the fully rendered invoice preview, with file fields populated and formulas calculated.
- **Hidden:** Add Row, Add Section, Add Section Charge, formula editor (fx bar), all inline edit buttons.
- **Visible:** A prominent **"Edit Draft"** button in the header.
- **Visible:** A **"Finalize Invoice"** button (if user has `invoice:finalize` permission).
- **Visible:** A **"Save Draft"** button (for saving header field overrides).

**File Header Fields:** The header field section at the top of the invoice (e.g., NAME, STATUS, CLIENT, GRT) is automatically populated from the file's data. The `resolveScope` service reads `project.name`, `project.status`, `project.customFields.grt`, etc., and populates the `FILE_*` token scope. These populated values are displayed in the header grid.

**Formulas:** Every row with a formula (e.g., `100 * GRT`) is automatically evaluated using the resolved `FILE_GRT` token from the project's data. The result is shown in the Value column. If GRT is `500`, the "Port Bill" row would show `50000`.

### Step 4: The Invoice Draft Page — Edit Mode

When the user clicks **"Edit Draft"**, the page switches to **Edit Mode**.

In **Edit Mode**:
- All editing controls **reappear**: Add Row, Add Section, Add Section Charge, formula editor (fx bar), inline cell editing.
- The user can modify rows, labels, formulas, and values for **this specific draft only**.
- Changes are saved to `invoiceDraft.draftSections` — the master template is untouched.
- An **"Exit Edit Mode"** / **"Done Editing"** button returns to View Mode.

The Edit Mode vs View Mode is controlled entirely by a **React state variable** (`isEditMode: boolean`) on the draft page — no URL changes, no separate routes.

### Step 5: Finalizing the Invoice

1. User clicks **"Finalize Invoice"** in View Mode.
2. The system calls `POST /api/invoices/generate` with the final draft data.
3. The backend freezes the invoice: calculates all line items, stores them permanently in `invoice_line_items`, and creates the `invoices` record.
4. The draft (`invoice_drafts` row) is **deleted**.
5. The user is redirected to `/dashboard/invoices`.
6. The finalized invoice now appears in the **Invoices section** of the File Details Modal for that file.

---

## 4. Data Flow — How File Fields Populate the Invoice

```
project.name          → FILE_NAME token
project.status        → FILE_STATUS token  (text, not formula-injectable by default)
project.clientId      → resolved to client.name for display
project.customFields.grt → FILE_GRT token  (numeric, formula-injectable)
project.customFields.nrt → FILE_NRT token
... (any custom field marked isFormulaInjectable on templateHeaderField)
```

The `resolveScope()` service in `token-resolver.service.ts` handles this mapping.
A `templateHeaderField` row links a display label (e.g. "GRT") to a `fileFieldKey` (e.g. `"grt"`) and a `FILE_GRT` token.
When `isFormulaInjectable = true`, the numeric value of that field becomes available to all row formulas.

---

## 5. Permission Guard Summary

| Action | Required Permission |
|---|---|
| View Invoices section in File Modal | `invoice:view` |
| Generate Invoice (open modal) | `invoice:create_draft` |
| View Draft page | `invoice:view` |
| Fill manual values | `invoice:fill_values` |
| Edit line labels | `invoice:edit_line_labels` |
| Manage optional services | `invoice:manage_optional_rows` |
| Author formulas in draft builder | `invoice:author_formulas` |
| Finalize Invoice | `invoice:finalize` |
| Revert Invoice to Draft | `invoice:revert` |
| Void Invoice | `invoice:void` |
| Delete Draft | `invoice:delete` |

---

## 6. Key Implementation Rules

1. **Never modify the master template from the draft editor.** All edits are saved to `invoice_drafts.draftSections` only.
2. **Always pass `projectId` in the preview call.** The engine needs it to resolve `CAT_*` and `FILE_*` tokens.
3. **The draft page starts in View Mode.** Edit Mode is a progressive disclosure — it should feel intentional, not accidental.
4. **Header field values shown in the draft are always live-resolved from the project.** They are not editable directly in the draft — the user edits the file itself to change them.
5. **One draft per user per project.** Enforced by the unique constraint on `(project_id, user_id)` in `invoice_drafts`.
6. **When a draft is finalized, delete it.** The finalized invoice is the permanent record.
