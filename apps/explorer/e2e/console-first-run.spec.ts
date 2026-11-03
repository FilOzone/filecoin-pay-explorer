import { expect, test } from "./fixtures";
import { loginWithTestAccount } from "./privy";

// CI points the subgraph at placeholder.invalid, which the page's connect-src CSP refuses before any route can answer.
test.use({ bypassCSP: true });

// Fake Privy reports every email login as a new user; the real test account signed up long ago.
test.skip(process.env.E2E_MODE === "real", "needs a login that creates a new user");

test("a new email signup with no Filecoin Pay account lands in Add funds, once", async ({ page }) => {
  await page.route(
    // CI points the subgraph at placeholder.invalid; a local .env points it at Goldsky.
    (url) => url.hostname === "api.goldsky.com" || url.hostname === "placeholder.invalid",
    (route) => route.fulfill({ json: { data: { accounts: [], userTokens: [], operatorApprovals: [] } } }),
  );
  await page.route(
    (url) => url.hostname === "notification-api-production.filoz.workers.dev",
    (route) => route.fulfill({ json: { subscribed: false } }),
  );

  await page.goto("/console");
  await loginWithTestAccount(page, { email: "first-run@fake-privy.test" });

  const addFunds = page.getByRole("dialog", { name: "Add funds" });
  const addFundsHeading = addFunds.getByRole("heading", { name: "Add funds" });
  await expect(addFundsHeading).toBeVisible({ timeout: 30_000 });
  await addFunds.getByRole("button", { name: "Close" }).click();
  await expect(addFundsHeading).toBeHidden();

  // Dismissed, it stays closed, and the welcome card still leads with Add funds.
  await expect(page.getByRole("heading", { name: "Welcome to Filecoin Pay" })).toBeVisible();
  await expect(addFundsHeading).toBeHidden();
  await page.getByRole("button", { name: "Add funds" }).click();
  await expect(addFundsHeading).toBeVisible();
});
