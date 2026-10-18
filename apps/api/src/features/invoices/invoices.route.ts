import { Hono } from "hono";
import { requireAuth } from "../../infra/middleware/auth";
import { requireOrgPermission } from "../../infra/middleware/require-permission";
import { DraftBuilderController } from "./drafts/draft-builder.controller";
import { DraftsController } from "./drafts/drafts.controller";
import { EngineController } from "./engine/engine.controller";
import { InvoicesController } from "./invoices.controller";

export const invoicesRouter = new Hono();

// Only logged in users can access these endpoints
invoicesRouter.use("*", requireAuth);

// Get tokens for token bridge
invoicesRouter.get(
  "/tokens",
  requireOrgPermission(["invoice:view", "finance:view_invoices"]),
  InvoicesController.getTokens,
);

// Math engine preview
invoicesRouter.post(
  "/preview",
  requireOrgPermission(["invoice:view", "finance:manage_invoices"]),
  EngineController.previewInvoice,
);

// --- DRAFTS ---
invoicesRouter.get(
  "/drafts/list",
  requireOrgPermission(["invoice:view", "finance:manage_invoices"]),
  DraftsController.listDrafts,
);

invoicesRouter.get(
  "/drafts",
  requireOrgPermission(["invoice:view", "finance:manage_invoices"]),
  DraftsController.getDraft,
);

invoicesRouter.get(
  "/drafts/:id",
  requireOrgPermission(["invoice:view", "finance:manage_invoices"]),
  DraftsController.getDraftById,
);

invoicesRouter.post(
  "/drafts",
  requireOrgPermission(["invoice:create_draft", "invoice:create", "finance:manage_invoices"]),
  DraftsController.createDraft,
);

invoicesRouter.put(
  "/drafts",
  requireOrgPermission([
    "invoice:fill_values",
    "invoice:edit_line_labels",
    "finance:manage_invoices",
  ]),
  DraftsController.upsertDraft,
);

invoicesRouter.delete(
  "/drafts/:id",
  requireOrgPermission(["invoice:delete", "finance:manage_invoices"]),
  DraftsController.deleteDraft,
);

// --- DRAFT OPTIONAL SERVICE ROWS ---
invoicesRouter.get(
  "/drafts/:id/optional-rows",
  requireOrgPermission(["invoice:view", "finance:view_invoices"]),
  DraftBuilderController.listOptionalRows,
);

invoicesRouter.post(
  "/drafts/:id/optional-rows",
  requireOrgPermission(["invoice:manage_optional_rows", "finance:manage_invoices"]),
  DraftBuilderController.addOptionalRow,
);

invoicesRouter.delete(
  "/drafts/:id/optional-rows/:rowId",
  requireOrgPermission(["invoice:manage_optional_rows", "finance:manage_invoices"]),
  DraftBuilderController.removeOptionalRow,
);

// --- DRAFT BUILDER ---
invoicesRouter.get(
  "/drafts/:id/sections",
  requireOrgPermission("finance:manage_invoices"),
  DraftBuilderController.getSections,
);
invoicesRouter.get(
  "/drafts/:id/constants",
  requireOrgPermission("finance:manage_invoices"),
  DraftBuilderController.getConstants,
);

invoicesRouter.post(
  "/drafts/:id/constants",
  requireOrgPermission("finance:manage_invoices"),
  DraftBuilderController.createConstant,
);
invoicesRouter.patch(
  "/drafts/:id/constants/:constantId",
  requireOrgPermission("finance:manage_invoices"),
  DraftBuilderController.updateConstant,
);
invoicesRouter.delete(
  "/drafts/:id/constants/:constantId",
  requireOrgPermission("finance:manage_invoices"),
  DraftBuilderController.deleteConstant,
);

invoicesRouter.post(
  "/drafts/:id/sections",
  requireOrgPermission("finance:manage_invoices"),
  DraftBuilderController.createSection,
);
invoicesRouter.patch(
  "/drafts/:id/sections/:sectionId",
  requireOrgPermission("finance:manage_invoices"),
  DraftBuilderController.updateSection,
);
invoicesRouter.delete(
  "/drafts/:id/sections/:sectionId",
  requireOrgPermission("finance:manage_invoices"),
  DraftBuilderController.deleteSection,
);
invoicesRouter.post(
  "/drafts/:id/sections/reorder",
  requireOrgPermission("finance:manage_invoices"),
  DraftBuilderController.reorderSections,
);

invoicesRouter.post(
  "/drafts/:id/sections/:sectionId/rows",
  requireOrgPermission("finance:manage_invoices"),
  DraftBuilderController.createRow,
);
invoicesRouter.patch(
  "/drafts/:id/sections/:sectionId/rows/:rowId",
  requireOrgPermission("finance:manage_invoices"),
  DraftBuilderController.updateRow,
);
invoicesRouter.delete(
  "/drafts/:id/sections/:sectionId/rows/:rowId",
  requireOrgPermission("finance:manage_invoices"),
  DraftBuilderController.deleteRow,
);
invoicesRouter.post(
  "/drafts/:id/sections/:sectionId/rows/reorder",
  requireOrgPermission("finance:manage_invoices"),
  DraftBuilderController.reorderRows,
);
invoicesRouter.put(
  "/drafts/:id/sections/:sectionId/rows/reorder",
  requireOrgPermission("finance:manage_invoices"),
  DraftBuilderController.reorderRows,
);

// --- DRAFT ROW CHARGES ---
invoicesRouter.get(
  "/drafts/:id/sections/:sectionId/rows/:rowId/charges",
  requireOrgPermission("finance:view_invoices"),
  DraftBuilderController.listRowCharges,
);
invoicesRouter.post(
  "/drafts/:id/sections/:sectionId/rows/:rowId/charges",
  requireOrgPermission("finance:manage_invoices"),
  DraftBuilderController.createRowCharge,
);
invoicesRouter.patch(
  "/drafts/:id/sections/:sectionId/rows/:rowId/charges/:chargeId",
  requireOrgPermission("finance:manage_invoices"),
  DraftBuilderController.updateRowCharge,
);
invoicesRouter.delete(
  "/drafts/:id/sections/:sectionId/rows/:rowId/charges/:chargeId",
  requireOrgPermission("finance:manage_invoices"),
  DraftBuilderController.deleteRowCharge,
);
invoicesRouter.put(
  "/drafts/:id/sections/:sectionId/rows/:rowId/charges/reorder",
  requireOrgPermission("finance:manage_invoices"),
  DraftBuilderController.reorderRowCharges,
);

// --- DRAFT SECTION CHARGES ---
// Canonical section-charges routes (matching web builder & template conventions)
invoicesRouter.post(
  "/drafts/:id/sections/:sectionId/section-charges",
  requireOrgPermission("finance:manage_invoices"),
  DraftBuilderController.createSectionCharge,
);
invoicesRouter.patch(
  "/drafts/:id/sections/:sectionId/section-charges/:chargeId",
  requireOrgPermission("finance:manage_invoices"),
  DraftBuilderController.updateSectionCharge,
);
invoicesRouter.delete(
  "/drafts/:id/sections/:sectionId/section-charges/:chargeId",
  requireOrgPermission("finance:manage_invoices"),
  DraftBuilderController.deleteSectionCharge,
);
invoicesRouter.put(
  "/drafts/:id/sections/:sectionId/section-charges/reorder",
  requireOrgPermission("finance:manage_invoices"),
  DraftBuilderController.reorderSectionCharges,
);

// Fallback aliases without 'section-' prefix
invoicesRouter.post(
  "/drafts/:id/sections/:sectionId/charges",
  requireOrgPermission("finance:manage_invoices"),
  DraftBuilderController.createSectionCharge,
);
invoicesRouter.patch(
  "/drafts/:id/sections/:sectionId/charges/:chargeId",
  requireOrgPermission("finance:manage_invoices"),
  DraftBuilderController.updateSectionCharge,
);
invoicesRouter.delete(
  "/drafts/:id/sections/:sectionId/charges/:chargeId",
  requireOrgPermission("finance:manage_invoices"),
  DraftBuilderController.deleteSectionCharge,
);

// --- GENERATION & MUTATION ---
invoicesRouter.post(
  "/generate",
  requireOrgPermission(["invoice:finalize", "finance:manage_invoices"]),
  InvoicesController.generateInvoice,
);

invoicesRouter.post(
  "/:id/issue",
  requireOrgPermission(["invoice:finalize", "finance:manage_invoices"]),
  InvoicesController.issueInvoice,
);

invoicesRouter.post(
  "/:id/void",
  requireOrgPermission(["invoice:void", "finance:manage_invoices"]),
  InvoicesController.voidInvoice,
);

invoicesRouter.post(
  "/:id/unfreeze",
  requireOrgPermission(["invoice:revert", "finance:manage_invoices"]),
  InvoicesController.unfreezeInvoice,
);

invoicesRouter.post(
  "/:id/dispute",
  requireOrgPermission(["invoice:view", "finance:manage_invoices"]),
  InvoicesController.disputeInvoice,
);

invoicesRouter.post(
  "/:id/mark-paid",
  requireOrgPermission(["invoice:finalize", "finance:manage_invoices"]),
  InvoicesController.markPaid,
);

// List invoices
invoicesRouter.get(
  "/",
  requireOrgPermission(["invoice:view", "finance:view_invoices"]),
  InvoicesController.listInvoices,
);

// Get single invoice
invoicesRouter.get(
  "/:id",
  requireOrgPermission(["invoice:view", "finance:view_invoices"]),
  InvoicesController.getInvoice,
);
