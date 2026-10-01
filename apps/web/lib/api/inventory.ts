/**
 * lib/api/inventory.ts
 * Typed API client for all inventory module endpoints.
 * All functions use credentials: "include" to send the session cookie.
 *
 * WHY a dedicated module instead of inline fetch calls:
 * Centralizing API calls makes it easy to update the base URL, add auth headers,
 * handle error responses uniformly, and reuse types across hook files.
 */

import { apiUrl } from "@/lib/constants";

// ─── Shared fetch helper ──────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${apiUrl}${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    let errMsg = data.error || `Request failed: ${res.status}`;
    if (data.details && typeof data.details === "object" && !errMsg.includes(":")) {
      try {
        const detailStr = JSON.stringify(data.details);
        if (detailStr.length < 200) {
          errMsg += `: ${detailStr}`;
        }
      } catch (_e) {}
    }
    throw new Error(errMsg);
  }
  return res.json();
}

// ─── Brands ───────────────────────────────────────────────────────────────────

export const brandsApi = {
  list: () => apiFetch<any[]>("/api/inventory/brands"),
  create: (data: any) =>
    apiFetch<any>("/api/inventory/brands", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: any) =>
    apiFetch<any>(`/api/inventory/brands/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  remove: (id: string) => apiFetch<any>(`/api/inventory/brands/${id}`, { method: "DELETE" }),
};

// ─── Product Categories ───────────────────────────────────────────────────────

export const productCategoriesApi = {
  list: () => apiFetch<any[]>("/api/inventory/product-categories"),
  create: (data: any) =>
    apiFetch<any>("/api/inventory/product-categories", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: any) =>
    apiFetch<any>(`/api/inventory/product-categories/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  remove: (id: string) =>
    apiFetch<any>(`/api/inventory/product-categories/${id}`, { method: "DELETE" }),
};

// ─── Products ─────────────────────────────────────────────────────────────────

export const productsApi = {
  list: (params?: { type?: string; categoryId?: string; isActive?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.type) qs.set("type", params.type);
    if (params?.categoryId) qs.set("categoryId", params.categoryId);
    if (params?.isActive !== undefined) qs.set("isActive", String(params.isActive));
    return apiFetch<any[]>(`/api/inventory/products?${qs}`);
  },
  getById: (id: string) => apiFetch<any>(`/api/inventory/products/${id}`),
  create: (data: any) =>
    apiFetch<any>("/api/inventory/products", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: any) =>
    apiFetch<any>(`/api/inventory/products/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  remove: (id: string) => apiFetch<any>(`/api/inventory/products/${id}`, { method: "DELETE" }),
};

// ─── Customers ────────────────────────────────────────────────────────────────

export const customersApi = {
  list: () => apiFetch<any[]>("/api/inventory/customers"),
  create: (data: any) =>
    apiFetch<any>("/api/inventory/customers", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: any) =>
    apiFetch<any>(`/api/inventory/customers/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  remove: (id: string) => apiFetch<any>(`/api/inventory/customers/${id}`, { method: "DELETE" }),
};

// ─── Warehouses ───────────────────────────────────────────────────────────────

export const warehousesApi = {
  list: () => apiFetch<any[]>("/api/inventory/warehouses"),
  create: (data: any) =>
    apiFetch<any>("/api/inventory/warehouses", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: any) =>
    apiFetch<any>(`/api/inventory/warehouses/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  remove: (id: string) => apiFetch<any>(`/api/inventory/warehouses/${id}`, { method: "DELETE" }),
};

// ─── Purchases ────────────────────────────────────────────────────────────────

export const purchasesApi = {
  list: (status?: string) =>
    apiFetch<any[]>(`/api/inventory/purchases${status ? `?status=${status}` : ""}`),
  getById: (id: string) => apiFetch<any>(`/api/inventory/purchases/${id}`),
  create: (data: any) =>
    apiFetch<any>("/api/inventory/purchases", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: any) =>
    apiFetch<any>(`/api/inventory/purchases/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  remove: (id: string) => apiFetch<any>(`/api/inventory/purchases/${id}`, { method: "DELETE" }),
  // Status transitions — these write to the ledger.
  confirm: (id: string) =>
    apiFetch<any>(`/api/inventory/purchases/${id}/confirm`, { method: "PATCH" }),
  cancel: (id: string) =>
    apiFetch<any>(`/api/inventory/purchases/${id}/cancel`, { method: "PATCH" }),
};

// ─── Sales ────────────────────────────────────────────────────────────────────

export const salesApi = {
  list: (status?: string) =>
    apiFetch<any[]>(`/api/inventory/sales${status ? `?status=${status}` : ""}`),
  getById: (id: string) => apiFetch<any>(`/api/inventory/sales/${id}`),
  create: (data: any) =>
    apiFetch<any>("/api/inventory/sales", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: any) =>
    apiFetch<any>(`/api/inventory/sales/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  remove: (id: string) => apiFetch<any>(`/api/inventory/sales/${id}`, { method: "DELETE" }),
  confirm: (id: string) => apiFetch<any>(`/api/inventory/sales/${id}/confirm`, { method: "PATCH" }),
  cancel: (id: string) => apiFetch<any>(`/api/inventory/sales/${id}/cancel`, { method: "PATCH" }),
};

// ─── Stock & Transactions (read-only ledger queries) ─────────────────────────

export const inventoryApi = {
  // Returns current stock levels grouped by product + stockState.
  getStock: (productId?: string) =>
    apiFetch<any[]>(`/api/inventory/stock${productId ? `?productId=${productId}` : ""}`),

  // Paginated transaction history.
  getTransactions: (params?: {
    productId?: string;
    warehouseId?: string;
    transactionType?: string;
    page?: number;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.productId) qs.set("productId", params.productId);
    if (params?.warehouseId) qs.set("warehouseId", params.warehouseId);
    if (params?.transactionType) qs.set("transactionType", params.transactionType);
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    return apiFetch<{ data: any[]; page: number; limit: number }>(
      `/api/inventory/transactions?${qs}`,
    );
  },

  // Fetch eligible returns for a party (customer or supplier)
  getEligibleReturns: (params: { partyId?: string; type: "SALE_RETURN" | "PURCHASE_RETURN" }) => {
    const qs = new URLSearchParams();
    if (params.partyId && params.partyId !== "__none__") qs.set("partyId", params.partyId);
    qs.set("type", params.type);
    return apiFetch<any[]>(`/api/inventory/eligible-returns?${qs}`);
  },

  // Record a direct inventory transaction (return, adjustment, etc.).
  createTransaction: (data: any) =>
    apiFetch<any>("/api/inventory/transactions", { method: "POST", body: JSON.stringify(data) }),
};

// ─── Dedicated Sale & Purchase Returns API ─────────────────────────────────────

export const returnsApi = {
  listSaleReturns: () => apiFetch<any[]>("/api/inventory/returns/sale"),
  listPurchaseReturns: () => apiFetch<any[]>("/api/inventory/returns/purchase"),
  getSaleReturnById: (id: string) => apiFetch<any>(`/api/inventory/returns/sale/${id}`),
  getPurchaseReturnById: (id: string) => apiFetch<any>(`/api/inventory/returns/purchase/${id}`),
  getEligibleItems: (params: { partyId?: string; type: "SALE_RETURN" | "PURCHASE_RETURN" }) => {
    const qs = new URLSearchParams();
    if (params.partyId && params.partyId !== "__none__") qs.set("partyId", params.partyId);
    qs.set("type", params.type);
    return apiFetch<any[]>(`/api/inventory/returns/eligible-items?${qs}`);
  },
  createSaleReturn: (data: any) =>
    apiFetch<any>("/api/inventory/returns/sale", { method: "POST", body: JSON.stringify(data) }),
  createPurchaseReturn: (data: any) =>
    apiFetch<any>("/api/inventory/returns/purchase", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};
