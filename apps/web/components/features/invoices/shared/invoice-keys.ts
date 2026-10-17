export const invoiceKeys = {
  // Org Configs
  orgConfigs: {
    all: (orgId: string) => ["org-configs", orgId] as const,
  },

  // PDF Layout
  pdfLayout: {
    byOrg: (orgId: string) => ["pdf-layout", orgId] as const,
  },

  // Templates
  templates: {
    list: (orgId: string, scope?: string) => ["invoice-templates", "list", orgId, scope] as const,
    detail: (id: string) => ["invoice-templates", "detail", id] as const,
    rows: (templateId: string) => ["invoice-templates", "rows", templateId] as const,
  },

  // Tokens
  tokens: {
    byContext: (projectId: string, templateId?: string) =>
      ["invoice-tokens", projectId, templateId] as const,
  },

  // Preview (do NOT cache aggressively — always fresh)
  preview: {
    byDraft: (projectId: string) => ["invoice-preview", projectId] as const,
  },

  // Drafts
  drafts: {
    byProject: (projectId: string) => ["invoice-drafts", "project", projectId] as const,
  },

  // Invoices
  invoices: {
    list: (projectId: string) => ["invoices", "list", projectId] as const,
    detail: (id: string) => ["invoices", "detail", id] as const,
  },

  // Optional Rows
  optionalRows: {
    byDraft: (draftId: string) => ["draft-optional-rows", draftId] as const,
    byTemplate: (templateId: string) => ["template-optional-rows", templateId] as const,
  },
};
