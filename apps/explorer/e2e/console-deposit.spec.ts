import { expect, test } from "./fixtures";

// CI points the subgraph at placeholder.invalid, which the page's connect-src CSP refuses before any route can answer.
test.use({ bypassCSP: true });

const usdfc = {
  id: "0x80b98d3aa09ffff255c3ba4a241111ff1262f045",
  name: "USD for Filecoin",
  symbol: "USDFC",
  decimals: "18",
};
const userToken = {
  id: "user-usdfc",
  funds: "0",
  lockupCurrent: "0",
  lockupRate: "0",
  lockupLastSettledUntilEpoch: "0",
  lockupLastSettledUntilTimestamp: "0",
  payout: "0",
  fundsCollected: "0",
  token: usdfc,
};

test("Deposit tokens says how to fix an amount it cannot deposit", async ({ page }) => {
  test.skip(process.env.E2E_MODE === "real", "needs the fake extension");
  await page.route(
    // CI points the subgraph at placeholder.invalid; a local .env points it at Goldsky.
    (url) => url.hostname === "api.goldsky.com" || url.hostname === "placeholder.invalid",
    (route) => {
      const query = route.request().postData() ?? "";
      const data = query.includes("GetAccountTokens") ? { userTokens: [userToken] } : { accounts: [] };
      return route.fulfill({ json: { data } });
    },
  );
  await page.goto("/console");
  await page.getByRole("button", { name: "Connect existing wallet" }).click();
  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-slot="dropdown-menu-trigger"]:not([aria-label])').click();
  await page.getByRole("menuitem", { name: "Add funds" }).click();
  await page.getByRole("button", { name: "Deposit token" }).click();

  const deposit = page.getByRole("dialog", { name: "Deposit tokens" });
  await deposit
    .getByRole("list", { name: "Other tokens in your account" })
    .getByRole("button", { name: /USDFC/ })
    .click();
  const hint = deposit.getByText("Enter a plain number greater than 0, like 1.5.");

  for (const value of ["1e5", "0"]) {
    await deposit.getByLabel("Amount").fill(value);
    await expect(hint).toBeVisible();
    await expect(deposit.getByRole("button", { name: "Deposit", exact: true })).toBeDisabled();
  }

  await deposit.getByLabel("Amount").fill("1");
  await expect(hint).toBeHidden();
});
