import { test, expect } from "@playwright/test";

// Seed test — exemplar for every later /10x-e2e spec.
// Risk: test-plan.md Risk #1/#3, auth-gate half — a session-scoped route
// (PROTECTED_ROUTES in src/middleware.ts) must fail closed for an
// unauthenticated request, not merely in an integration test against the
// handler, but as the browser actually observes it (redirect + rendered page).
test.use({ storageState: { cookies: [], origins: [] } });

test("unauthenticated request to a protected route redirects to sign-in", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(page).toHaveURL(/\/auth\/signin/);
  await expect(page.getByRole("heading", { name: "ZALOGUJ SIĘ" })).toBeVisible();

  // No data created — nothing to clean up.
});
