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
};
