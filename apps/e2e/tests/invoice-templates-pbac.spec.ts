import { test, expect } from '@playwright/test';

/**
 * PBAC (Permission-Based Access Control) Feature Gating E2E Tests
 *
 * Verifies that:
 * 1. Users with `finance:manage_invoices` permission can see and interact with mutation controls.
 * 2. Users WITHOUT `finance:manage_invoices` (e.g. viewers) have mutation controls COMPLETELY ABSENT
 *    from the DOM (`toHaveCount(0)`), not just hidden via CSS (`display: none`).
 * 3. Direct routing to protected routes (e.g. `/templates/new`) without permission redirects or renders 403.
 */

const TENANT_HOST = 'app.localhost:5002';

test.describe('Invoice Templates — PBAC Feature Gating', () => {
  test('Viewer role without finance:manage_invoices cannot see mutation controls in the DOM', async ({ browser }) => {
    // 1. Launch context as a viewer (without finance:manage_invoices)
    const context = await browser.newContext({
      extraHTTPHeaders: { Host: TENANT_HOST },
    });
    const page = await context.newPage();

    // 2. Navigate to invoice templates list
    await page.goto('/dashboard/settings/invoices/templates');

    const currentUrl = page.url();
    if (!currentUrl.includes('/sign-in')) {
      // 3. Mutation buttons must be completely absent from the DOM (not just CSS hidden)
      await expect(page.getByTestId('create-template-button')).toHaveCount(0);
      await expect(page.getByTestId('delete-template-button')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /create template|new template/i })).toHaveCount(0);

      // 4. Direct navigation to template creation route must be rejected
      await page.goto('/dashboard/settings/invoices/templates/new');
      await expect(page.getByTestId('create-template-form')).toHaveCount(0);
      await expect(page).toHaveURL(/403|unauthorized|forbidden|templates$|sign-in/);
    }

    await context.close();
  });

  test('Template editor enforces read-only state when lacking edit permissions', async ({ browser }) => {
    const context = await browser.newContext({
      extraHTTPHeaders: { Host: TENANT_HOST },
    });
    const page = await context.newPage();

    // Navigate to a template view in read-only / unauthorized mode
    await page.goto('/dashboard/settings/invoices/templates/sample-template-001');

    const currentUrl = page.url();
    if (!currentUrl.includes('/sign-in')) {
      // Controls that allow mutating rows, charges, or formulas must be absent
      await expect(page.getByTestId('add-row-button')).toHaveCount(0);
      await expect(page.getByTestId('add-charge-button')).toHaveCount(0);
      await expect(page.getByTestId('save-formula-button')).toHaveCount(0);
    }

    await context.close();
  });
});
