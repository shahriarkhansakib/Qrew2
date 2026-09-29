import { expect, test } from "@playwright/test";

test.describe("Authentication & Dashboard User Flow", () => {
  test("should navigate from landing to sign-up to sign-in and trigger Google OAuth", async ({
    page,
  }) => {
    // 1. User arrives at the homepage
    await page.goto("/");

    // Playwright Best Practice: Use getByRole for headings with a regex for partial matching
    await expect(page.getByRole("heading", { name: /Office management/i })).toBeVisible();

    // 2. Open the signup form
    await page.getByRole("link", { name: "Get Started" }).click();
    await page.waitForURL("**/sign-up");

    // 3. Open the login form from the signup page
    // The link text is "Sign in" at the bottom of the card
    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await page.waitForURL("**/sign-in");

    // Intercept Google OAuth navigation so CI E2E does not hang on external network or Google bot detection
    await page.route("**/accounts.google.com/**", (route) => {
      return route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body>Mock Google OAuth Consent Screen</body></html>",
      });
    });

    // 4. Click the Continue with Google button
    // It could say "Sign in with Google" or similar, so we use a regex for "Google"
    await page.getByRole("button", { name: /Google/i }).click();

    // 5. Verify we are navigated to Google's OAuth consent screen
    // Google's OAuth domain is accounts.google.com
    await page.waitForURL("**/accounts.google.com/**");
    expect(page.url()).toContain("accounts.google.com");
  });
});
