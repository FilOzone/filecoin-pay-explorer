import { expect, test } from "./fixtures";
import { loginWithTestAccount } from "./privy";

// CI points the subgraph at placeholder.invalid, which the page's connect-src CSP refuses before any route can answer.
test.use({ bypassCSP: true });

// Regression: Add Service did nothing while the approvals query was failing, because the dialog was only mounted
// once approvals had loaded.
test("Add Service opens the dialog when the approvals query fails", async ({ page }) => {
  await page.route(
    // CI points the subgraph at placeholder.invalid; a local .env points it at Goldsky.
    (url) => url.hostname === "api.goldsky.com" || url.hostname === "placeholder.invalid",
    (route) => {
      const query = route.request().postData() ?? "";
      if (query.includes("GetAccountApprovals")) return route.fulfill({ status: 500, body: "boom" });
      if (query.includes("GetAccountDetails")) {
        const account = { id: "0x1", address: "0x1", totalRails: "0", totalTokens: "0", totalApprovals: "0" };
        return route.fulfill({ json: { data: { accounts: [account] } } });
      }
      return route.fulfill({ json: { data: { accounts: [], userTokens: [], operatorApprovals: [] } } });
    },
  );
  await page.route(
    (url) => url.hostname === "notification-api-production.filoz.workers.dev",
    (route) => route.fulfill({ json: { subscribed: false } }),
  );

  await page.goto("/console");
  await loginWithTestAccount(page, { email: "add-service@fake-privy.test" });
  await expect(page.getByText("Failed to load authorized services")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Add Service", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Add a Service" })).toBeVisible();
});

// Regression: a contract's self-reported name looked curated in the Select Service list, and a copied label hidden
// behind a zero-width space passed the impersonation check.
test("Select Service marks self-reported names and drops disguised curated labels", async ({ page }) => {
  test.skip(process.env.E2E_MODE === "real", "sets the services' metadata in the fake chain");
  const named = "0x00000000000000000000000000000000000000a1";
  const impostor = "0x00000000000000000000000000000000000000b2";
  // Enough distinct payers to clear the mainnet adoption bar.
  const approvals = [named, impostor].flatMap((operator) =>
    Array.from({ length: 11 }, (_, index) => ({
      id: `${operator}-${index}`,
      client: { id: `0x${(index + 1).toString(16).padStart(40, "0")}` },
      operator: { address: operator },
    })),
  );
  await page.addInitScript(
    ({ named, impostor }) => {
      const fake = window as unknown as { __fakeServiceMetadata: Record<string, { name: string }> };
      fake.__fakeServiceMetadata = { [named]: { name: "Acme Storage" }, [impostor]: { name: "Storacha\u200b" } };
    },
    { named, impostor },
  );
  await page.route(
    (url) => url.hostname === "api.goldsky.com" || url.hostname === "placeholder.invalid",
    (route) => {
      const query = route.request().postData() ?? "";
      if (query.includes("GetApprovedOperatorClients")) {
        return route.fulfill({ json: { data: { operatorApprovals: approvals } } });
      }
      if (query.includes("GetAccountDetails")) {
        const account = { id: "0x1", address: "0x1", totalRails: "0", totalTokens: "0", totalApprovals: "0" };
        return route.fulfill({ json: { data: { accounts: [account] } } });
      }
      return route.fulfill({ json: { data: { accounts: [], userTokens: [], operatorApprovals: [] } } });
    },
  );
  await page.route(
    (url) => url.hostname === "notification-api-production.filoz.workers.dev",
    (route) => route.fulfill({ json: { subscribed: false } }),
  );

  await page.goto("/console");
  await loginWithTestAccount(page, { email: "add-service-names@fake-privy.test" });
  await page.getByRole("button", { name: "Add Service", exact: true }).first().click({ timeout: 30_000 });

  const dialog = page.getByRole("dialog", { name: "Add a Service" });
  await dialog.locator("#service").click();
  const acme = page.getByRole("option", { name: /Acme Storage/ });
  await expect(acme.getByRole("img", { name: "Self-reported on-chain name" })).toBeVisible();
  await expect(page.getByRole("option", { name: /Storacha/ })).toHaveCount(0);
});
