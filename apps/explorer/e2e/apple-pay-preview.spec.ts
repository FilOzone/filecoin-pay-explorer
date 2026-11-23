import { expect, test } from "./fixtures";

// Target a separately started preview-mode production build. The regular e2e dev server exercises the local Coinbase simulator.
const port = process.env.E2E_APPLE_PAY_PREVIEW_PORT;
test.skip(!port, "requires a local production build with the PR preview flag enabled");
test.use({ baseURL: port ? `http://localhost:${Number(port)}` : undefined });

const path = "/sandbox/apple-pay";
const wallet = "0x0000000000000000000000000000000000001234";

test("a reviewer can complete the public $5 walkthrough with sample funds and resume after a refresh", async ({
  page,
}) => {
  const checkoutRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() !== "GET" || url.pathname.startsWith("/api/")) {
      checkoutRequests.push(`${request.method()} ${url.pathname}`);
    }
  });
  expect((await page.goto(path))?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Try a $5 Apple Pay top-up" })).toBeVisible();
  await expect(page.getByText(/your card charge is \$0/i)).toBeVisible();
  await expect(page.getByText("Example destination", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to console" })).toHaveAttribute("href", "/console");
  const receipt = page.getByRole("region", { name: "Example receipt" });
  await expect(receipt.getByRole("definition").filter({ hasText: "4.0875 USDFC" })).toBeVisible();
  await expect(receipt.getByRole("definition").filter({ hasText: "0.05 FIL" })).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(page.locator("iframe")).toHaveCount(0);

  await page.getByRole("button", { name: "Simulate $5 payment approval" }).click();
  await expect(page.getByRole("heading", { name: "Demo payment approved" })).toBeVisible();
  await page.getByRole("button", { name: "Approve simulated conversion" }).click();
  const converting = page.getByRole("heading", { name: "Demo conversion in progress" });
  await expect(converting).toBeVisible();
  await page.reload();
  await expect(converting).toBeVisible();
  await page.getByRole("button", { name: "Show deposit confirmation" }).click();
  await expect(page.getByRole("heading", { name: "Demo deposit confirmed" })).toBeVisible();
  await page.getByRole("button", { name: "Restart walkthrough" }).click();
  await expect(page.getByRole("button", { name: "Simulate $5 payment approval" })).toBeEnabled();
  expect(checkoutRequests).toEqual([]);
});

test("an unconfigured preview can illustrate the console wallet while keeping provider orders closed", async ({
  page,
  request,
}) => {
  expect((await page.goto(`${path}?wallet=${wallet}`))?.status()).toBe(200);
  await expect(page.getByText("Wallet in this walkthrough", { exact: true })).toBeVisible();
  await expect(page.getByText(wallet, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Simulate $5 payment approval" })).toBeEnabled();
  const response = await request.post("/api/coinbase/sandbox", {
    headers: { origin: new URL(page.url()).origin },
    data: { action: "order", address: wallet, acceptedTerms: true, attemptId: "aa7fd1e0-d047-4965-b2d8-740ad23ef58e" },
  });
  expect(response.status()).toBe(404);
});
