import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { loginWithTestAccount } from "./privy";

// CI points the subgraph at placeholder.invalid, which the page's connect-src CSP refuses before any route can answer.
test.use({ bypassCSP: true });

const CUSTOM_SERVICE = "0x4444444444444444444444444444444444444444";

function answerConsoleQueries(page: Page) {
  return Promise.all([
    page.route(
      // CI points the subgraph at placeholder.invalid; a local .env points it at Goldsky.
      (url) => url.hostname === "api.goldsky.com" || url.hostname === "placeholder.invalid",
      (route) => {
        const query = route.request().postData() ?? "";
        if (query.includes("GetAccountOperators")) return route.fulfill({ status: 500, body: "boom" });
        if (query.includes("GetAccountDetails")) {
          const account = { id: "0x1", address: "0x1", totalRails: "0", totalTokens: "0", totalApprovals: "0" };
          return route.fulfill({ json: { data: { accounts: [account] } } });
        }
        return route.fulfill({ json: { data: { accounts: [], userTokens: [], operatorApprovals: [] } } });
      },
    ),
    page.route(
      (url) => url.hostname === "notification-api-production.filoz.workers.dev",
      (route) => route.fulfill({ json: { subscribed: false } }),
    ),
  ]);
}

async function openDialog(page: Page, email: string) {
  await answerConsoleQueries(page);
  await page.goto("/console");
  await loginWithTestAccount(page, { email });
  await expect(page.getByText("Failed to load services")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Add Service", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add a Service" });
  await expect(dialog.getByRole("heading", { name: "Add a Service" })).toBeVisible();
  return dialog;
}

async function chooseCustomServiceInUsdfc(page: Page, dialog: Locator) {
  await dialog.locator("#service").click();
  await page.getByRole("option", { name: "Custom service address…" }).click();
  await dialog.locator("#customService").fill(CUSTOM_SERVICE);
  await dialog.locator("#paymentToken").click();
  await page.getByRole("option", { name: /USDFC/ }).click();
}

// Regression: Add Service did nothing while its section's query was failing, because the dialog was only mounted
// once the list had loaded.
test("Add Service opens the dialog when the services query fails", async ({ page }) => {
  await openDialog(page, "add-service@fake-privy.test");
});

test.describe("adding a service", () => {
  test.skip(process.env.E2E_MODE === "real", "marks the approval in the fake chain");

  test("leads to a service the account already has, without asking for a signature", async ({ page }) => {
    await page.addInitScript((operator) => {
      (window as unknown as { __fakeApprovedOperators: string[] }).__fakeApprovedOperators = [operator];
    }, CUSTOM_SERVICE);
    const dialog = await openDialog(page, "add-service-existing@fake-privy.test");

    await chooseCustomServiceInUsdfc(page, dialog);

    await expect(dialog.getByText("You already have this service")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Add Service", exact: true })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Go to service" }).click();

    await expect(page).toHaveURL(new RegExp(`/console/services/${CUSTOM_SERVICE}$`));
    await expect(dialog).toBeHidden();
    const sent = await page.evaluate(
      () => (window as unknown as { __fakePrivyTransactions?: unknown[] }).__fakePrivyTransactions ?? [],
    );
    expect(sent).toEqual([]);
  });

  test("still offers a service the account does not have", async ({ page }) => {
    const dialog = await openDialog(page, "add-service-new@fake-privy.test");

    await chooseCustomServiceInUsdfc(page, dialog);

    await expect(dialog.getByText("Deposit amount")).toBeVisible();
    await expect(dialog.getByText("You already have this service")).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Add Service", exact: true })).toBeVisible();
  });
});
