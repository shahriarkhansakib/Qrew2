import { Hono } from "hono";
import { adminRouter } from "./features/admin/admin.route";
import { authRouter } from "./features/auth/auth.route";
import { brandsRouter } from "./features/brands/brands.route";
import { customersRouter } from "./features/customers/customers.route";
import { expenseCategoriesRouter } from "./features/expense-categories/expense-categories.route";
import { expensesRouter } from "./features/expenses/expenses.route";
import { inventoryRouter } from "./features/inventory/inventory.route";
import { invoiceTemplatesRouter } from "./features/invoice-templates/invoice-templates.route";
import { invoicesRouter } from "./features/invoices/invoices.route";
import { orgConfigsRouter } from "./features/org-configs/org-configs.route";
import { productCategoriesRouter } from "./features/product-categories/product-categories.route";
import { productsRouter } from "./features/products/products.route";
import { purchasesRouter } from "./features/purchases/purchases.route";
import { requisitionsRouter } from "./features/requisitions/requisitions.route";
import { salesRouter } from "./features/sales/sales.route";
import { superAdminRouter } from "./features/super-admin/super-admin.route";
import { systemRouter } from "./features/system/system.route";
import { uploadsRouter } from "./features/uploads/uploads.route";
import { usersRouter } from "./features/users/users.route";
import { walletRouter } from "./features/wallet/wallet.route";
import { warehousesRouter } from "./features/warehouses/warehouses.route";
import { workspacesRouter } from "./features/workspaces/workspaces.route";
import { logger as apiLogger } from "./infra/lib/logger";
import type { AuthVariables } from "./infra/middleware/auth";
import { rateLimit } from "./infra/middleware/rate-limit";

const app = new Hono<{ Variables: AuthVariables }>();

// ---------------------------------------------------------------
// Global Middleware (The Core)
// ---------------------------------------------------------------
// Custom Pino request logger — replaces hono/logger with structured JSON
app.use("*", async (c, next) => {
  c.set("logger" as any, apiLogger);
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  apiLogger.info(
    { module: "http", method: c.req.method, path: c.req.path, status: c.res.status, ms },
    `${c.req.method} ${c.req.path} ${c.res.status} ${ms}ms`,
  );
});

app.use("*", rateLimit(200, 60)); // 200 reqs per minute

// ---------------------------------------------------------------
// Feature Modules (Vertical Slices)
// ---------------------------------------------------------------
app.route("/api/system", systemRouter);
app.route("/api/auth", authRouter);
app.route("/api/uploads", uploadsRouter);
app.route("/api/users", usersRouter);
app.route("/api/workspaces", workspacesRouter);
app.route("/api/org-configs", orgConfigsRouter);
app.route("/api/expense-categories", expenseCategoriesRouter);
app.route("/api/requisitions", requisitionsRouter);
app.route("/api/expenses", expensesRouter);
app.route("/api/wallet", walletRouter);
app.route("/api/invoices", invoicesRouter);
app.route("/api/invoice-templates", invoiceTemplatesRouter);
app.route("/api/admin", adminRouter);
app.route("/api/super-admin", superAdminRouter);

// Inventory Module
app.route("/api/inventory/product-categories", productCategoriesRouter);
app.route("/api/inventory/products", productsRouter);
app.route("/api/inventory/customers", customersRouter);
app.route("/api/inventory/brands", brandsRouter);
app.route("/api/inventory/warehouses", warehousesRouter);
app.route("/api/inventory/purchases", purchasesRouter);
app.route("/api/inventory/sales", salesRouter);
app.route("/api/inventory", inventoryRouter);

// ---------------------------------------------------------------
// Fallbacks & Error Handling
// ---------------------------------------------------------------
app.notFound((c) => {
  return c.json(
    { error: "Not Found", message: `${c.req.method} ${c.req.path} does not exist.` },
    404,
  );
});

app.onError((err, c) => {
  apiLogger.error(
    { module: "http", err, path: c.req.path, method: c.req.method },
    "Unhandled exception",
  );
  const isDev = process.env.NODE_ENV === "development";

  return c.json(
    {
      error: "Internal Server Error",
      message: isDev ? err.message : "Something went wrong.",
    },
    500,
  );
});

export default app;
