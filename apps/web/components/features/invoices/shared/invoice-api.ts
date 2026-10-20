import { apiUrl } from "@/lib/constants";

export const invoiceApi = {
  // --- Org Configs ---
  getOrgConfigs: async (_orgId: string) => {
    const res = await fetch(`${apiUrl}/api/org-configs`, { credentials: "include" });
    if (!res.ok) throw new Error("Failed to fetch org configs");
    return res.json();
  },

  // --- PDF Layouts ---
  getPdfLayout: async (_orgId: string) => {
    const res = await fetch(`${apiUrl}/api/invoice-pdf-layouts`, { credentials: "include" });
    if (!res.ok) throw new Error("Failed to fetch PDF layout");
    return res.json();
  },

  // --- Templates ---
  getTemplates: async (_orgId: string, scope?: string) => {
    const url = new URL(`${apiUrl}/api/invoice-templates`);
    if (scope) url.searchParams.append("scope", scope);
    const res = await fetch(url.toString(), { credentials: "include" });
    if (!res.ok) throw new Error("Failed to fetch templates");
    return res.json();
  },

  getTemplateDetail: async (id: string) => {
    const res = await fetch(`${apiUrl}/api/invoice-templates/${id}`, { credentials: "include" });
    if (!res.ok) throw new Error("Failed to fetch template detail");
    return res.json();
  },

  // --- Tokens ---
  getTokens: async (projectId: string, templateId?: string) => {
    const url = new URL(`${apiUrl}/api/invoices/tokens`);
    url.searchParams.append("projectId", projectId);
    if (templateId) url.searchParams.append("templateId", templateId);
    const res = await fetch(url.toString(), { credentials: "include" });
    if (!res.ok) throw new Error("Failed to fetch tokens");
    return res.json();
  },

  // --- Engine ---
  previewInvoice: async (payload: {
    templateId: string;
    projectId?: string;
    inputs?: Record<string, any>;
  }) => {
    const res = await fetch(`${apiUrl}/api/invoices/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Failed to preview invoice");
    }
    const json = await res.json();
    return json.data || json;
  },

  // --- Drafts ---
  getDraft: async (projectId: string) => {
    const res = await fetch(`${apiUrl}/api/invoices/drafts?projectId=${projectId}`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error("Failed to fetch draft");
    return res.json();
  },

  upsertDraft: async (payload: any) => {
    const res = await fetch(`${apiUrl}/api/invoices/drafts`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to save draft");
    return res.json();
  },

  // --- Invoices ---
  generateInvoice: async (payload: any) => {
    const res = await fetch(`${apiUrl}/api/invoices/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to generate invoice");
    return res.json();
  },

  getInvoices: async (projectId: string) => {
    const res = await fetch(`${apiUrl}/api/invoices?projectId=${projectId}`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error("Failed to fetch invoices");
    return res.json();
  },

  getInvoiceDetail: async (id: string) => {
    const res = await fetch(`${apiUrl}/api/invoices/${id}`, { credentials: "include" });
    if (!res.ok) throw new Error("Failed to fetch invoice detail");
    return res.json();
  },

  // --- Optional Service Rows ---
  getDraftOptionalRows: async (draftId: string) => {
    const res = await fetch(`${apiUrl}/api/invoices/drafts/${draftId}/optional-rows`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error("Failed to fetch draft optional rows");
    return res.json();
  },

  addDraftOptionalRow: async (
    draftId: string,
    payload: {
      canonicalToken: string;
      sectionId?: string;
      customLabel?: string;
      customValue?: number;
      customFormula?: string;
    },
  ) => {
    const res = await fetch(`${apiUrl}/api/invoices/drafts/${draftId}/optional-rows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to add optional service row");
    }
    return res.json();
  },

  deleteDraftOptionalRow: async (draftId: string, rowId: string) => {
    const res = await fetch(`${apiUrl}/api/invoices/drafts/${draftId}/optional-rows/${rowId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to delete optional service row");
    }
    return res.json();
  },

  getTemplateOptionalRows: async (templateId: string) => {
    const res = await fetch(`${apiUrl}/api/invoice-templates/${templateId}/optional-rows`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error("Failed to fetch template optional rows");
    return res.json();
  },

  addTemplateOptionalRow: async (templateId: string, payload: any) => {
    const res = await fetch(`${apiUrl}/api/invoice-templates/${templateId}/optional-rows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to add template optional row");
    }
    return res.json();
  },

  updateTemplateOptionalRow: async (templateId: string, idOrToken: string, payload: any) => {
    const res = await fetch(
      `${apiUrl}/api/invoice-templates/${templateId}/optional-rows/${idOrToken}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to update template optional row");
    }
    return res.json();
  },

  deleteTemplateOptionalRow: async (templateId: string, canonicalToken: string) => {
    const res = await fetch(
      `${apiUrl}/api/invoice-templates/${templateId}/optional-rows/${canonicalToken}`,
      {
        method: "DELETE",
        credentials: "include",
      },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to delete template optional row");
    }
    return res.json();
  },

  getDraftTemplateSyncStatus: async (draftId: string) => {
    const res = await fetch(`${apiUrl}/api/invoices/drafts/${draftId}/template-sync-status`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error("Failed to fetch template sync status");
    return res.json();
  },

  syncDraftWithTemplate: async (draftId: string) => {
    const res = await fetch(`${apiUrl}/api/invoices/drafts/${draftId}/sync-template`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.message || "Failed to sync draft with template");
    }
    return res.json();
  },
};