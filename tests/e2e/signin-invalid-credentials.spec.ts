import { test, expect } from "@playwright/test";

// Risk: signin-invalid-credentials-error — the redirect-with-?error= convention
// (backend.md §3) must surface a real error to the user and must not sign them
// in. This exists only in the rendered UI (the ServerError alert) and crosses
// the browser → server-redirect → client-render boundary; an integration test
// against the handler alone wouldn't prove the message actually reaches the
// page the user sees.
test.use({ storageState: { cookies: [], origins: [] } });

test("invalid sign-in credentials render an error message and do not sign the user in", async ({ page }) => {
  await page.goto("/auth/signin");

  // A form rendered by a client-side framework (a React island) drops input
  // typed before it hydrates. Retry fill + submit until the page reflects the
  // result; clear before filling since re-filling the same value fires no
  // change event in a controlled input.
  await expect(async () => {
    await page.getByRole("textbox", { name: "E-mail" }).fill("");
    await page.getByRole("textbox", { name: "E-mail" }).fill(`e2e-invalid-${Date.now()}@panelekspertow.example`);
    await page.getByRole("textbox", { name: "Hasło" }).fill("");
    await page.getByRole("textbox", { name: "Hasło" }).fill("definitely-wrong-password");
    await page.getByRole("button", { name: "Zaloguj się" }).click();
    await page.waitForURL(/\/auth\/signin\?error=/, { timeout: 5_000 });
  }).toPass();

  await expect(page.getByRole("alert")).toBeVisible();
  // The user must stay signed out — not just "an alert appeared."
  await expect(page.getByText("Niezalogowany")).toBeVisible();
  await expect(page.getByRole("button", { name: "Wyloguj" })).toBeHidden();

  // No data created — nothing to clean up.
});
