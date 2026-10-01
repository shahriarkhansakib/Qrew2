---
name: playwright-e2e-testing
description: Write and audit Playwright end-to-end tests for the Next.js frontend, including multi-tenant host-header isolation, PBAC feature gating, and strict visual/headed locators.
---

# Playwright E2E Testing (Multi-Tenant Next.js Frontend)

You are testing the customer-facing surface of a multi-tenant B2B platform deployed on Vercel. 
The two failure modes that matter most in E2E here are: **Tenant A's browser rendering Tenant B's data**, and **a UI control being visible/clickable for a user who lacks the PBAC permission to use it**.

## Guidelines

### 1. Location and Config
- Tests must strictly target the Next.js frontend, but test files live within the `apps/e2e/` directory (standalone E2E app).
- Always respect `playwright.config.ts`. Prefer headed testing standards for visual checks, and use the configured webServer and project matrices.

### 2. Tenant Isolation via Host Headers
This app is multi-tenant by subdomain/host (e.g. `app.lawfirm.com`). Every isolation test must simulate this at the network layer using Playwright contexts, not query parameters.
- Log in to Tenant A (`Host: app.lawfirm.com`), navigate to a data view, and explicitly search the rendered page for a known Tenant-B identifier. Assert `toHaveCount(0)`. Absence of an error is not proof of isolation.
- Test the inverse: attempt to load a Tenant-B resource by direct URL while authenticated under Tenant A. Assert a 404/redirect.

### 3. Feature Gating via PBAC
For every UI element gated by a permission token (e.g., `inventory:manage_brands`):
- Authenticate a user **with** the permission. Assert the element `toBeVisible()` and `toBeEnabled()`.
- Authenticate a user **without** the permission. Assert the element is completely absent from the DOM (`toHaveCount(0)`), not merely hidden via CSS (`display: none`).
- Navigate directly to the protected route without permission and assert it redirects or renders a 403 page.

### 4. Auth & Storage State Rigor
- Use Playwright's `storageState` pattern to log in once per role/tenant combination, saving it to distinct JSON files (e.g., `.auth/lawfirm-admin.json`, `.auth/lawfirm-viewer.json`).
- **Never share a single `storageState` file across specs that test different tenants or permissions.**

### 5. Strict Locators & React 19 State
- Do not assert on instant network responses. Await Next.js Server Actions or TanStack Query mutations by checking UI invalidations: `expect(page.getByRole('button')).toBeVisible()`.
- Rely strictly on accessibility locators (`getByRole`, `getByText`, `getByTestId`). Never assert on hardcoded Tailwind classes.

## Anti-Patterns
- **URL-only tenant simulation:** `page.goto('/dashboard?tenant=lawfirm')` bypasses the actual host-based middleware resolution.
- **Weak PBAC assertion:** Checking React DevTools state or asserting `not.toContain('Manage')` instead of explicitly asserting DOM absence (`toHaveCount(0)`).
- **Hard-coded sleeps:** `page.waitForTimeout(3000)` creates flaky tests. Use built-in auto-waiting (`expect(locator).toBeVisible()`).
- **Shared Contexts:** Reusing one logged-in `storageState` across isolation tests makes it easy to silently test the wrong identity.

## Example Test

```typescript
// apps/e2e/tests/tenant-isolation.spec.ts
import { test, expect } from '@playwright/test';

const TENANT_A_HOST = 'app.lawfirm.com';
const TENANT_B_HOST = 'app.freightco.com';

test.describe('Tenant Isolation & PBAC Gating', () => {
  test('Tenant A sees only Tenant A data, and cannot access Tenant B by direct URL', async ({ browser }) => {
    // WHY: We simulate isolation at the network layer via Host headers
    const context = await browser.newContext({
      extraHTTPHeaders: { Host: TENANT_A_HOST },
      storageState: 'e2e/.auth/lawfirm-admin.json',
    });
    const page = await context.newPage();

    await page.goto('/files');
    await expect(page.getByTestId('file-row')).not.toHaveCount(0);

    // Known-only-to-Tenant-B identifier must NEVER appear in the DOM.
    await expect(page.getByText('FRT-9981-B')).toHaveCount(0);

    // Direct URL bypass attempt
    await page.goto('/files/tenant-b-file-id-000123');
    await expect(page).toHaveURL(/404|not-found/);

    await context.close();
  });

  test('Viewer role without inventory:manage_brands cannot see mutation controls', async ({ browser }) => {
    // WHY: Ensure PBAC maps to actual UI disablement/absence, preventing unauthorized mutations
    const context = await browser.newContext({
      extraHTTPHeaders: { Host: TENANT_A_HOST },
      storageState: 'e2e/.auth/lawfirm-viewer.json', // Distinct storage state!
    });
    const page = await context.newPage();

    await page.goto('/inventory/brands');
    
    // Element must be completely absent, not just hidden by CSS
    await expect(page.getByTestId('add-brand-button')).toHaveCount(0);

    // Direct routing bypass attempt
    await page.goto('/inventory/brands/new');
    await expect(page.getByTestId('brand-form')).toHaveCount(0);

    await context.close();
  });
});
```
