import { expect, test } from "./fixtures";
import { loginWithTestAccount } from "./privy";

// Regression: Add Service did nothing while the approvals query was failing, because the dialog was only mounted
// once approvals had loaded.
test("Add Service opens the dialog when the approvals query fails", async ({ page }) => {
  await page.route(
    // CI points the subgraph at placeholder.invalid; a local .env points it at Goldsky.
    (url) => url.hostname === "api.goldsky.com" || url.hostname === "placeholder.invalid",
    (route) => {
      // The subgraph is cross-origin, so the browser preflights the POST.
      const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      const query = route.request().postData() ?? "";
      if (query.includes("GetAccountApprovals")) return route.fulfill({ status: 500, headers: cors, body: "boom" });
      if (query.includes("GetAccountDetails")) {
        const account = { id: "0x1", address: "0x1", totalRails: "0", totalTokens: "0", totalApprovals: "0" };
        return route.fulfill({ headers: cors, json: { data: { accounts: [account] } } });
      }
      return route.fulfill({ headers: cors, json: { data: { accounts: [], userTokens: [], operatorApprovals: [] } } });
    },
  );
  await page.route(
    (url) => url.hostname === "notification-api-production.filoz.workers.dev",
    (route) => route.fulfill({ json: { subscribed: false } }),
  );

  await page.goto("/console");
  await loginWithTestAccount(page, { email: "add-service@fake-privy.test" });
  await expect(page.getByText("Failed to load authorized services")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Add Service" }).click();
  await expect(page.getByRole("heading", { name: "Add a Service" })).toBeVisible();
});
