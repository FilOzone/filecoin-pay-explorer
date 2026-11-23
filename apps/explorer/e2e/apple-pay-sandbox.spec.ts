import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const wallet = "0x0000000000000000000000000000000000001234";
const path = `/sandbox/apple-pay?wallet=${wallet}`;
const quote = { paymentTotal: "5.00", feeTotal: "0.10", purchaseAmount: "4.900000" };
const orderId = "03c7e32f-35f5-46c0-baad-c29ebed1b304";
const paymentUrl = "https://pay.coinbase.com/v2/api-onramp/apple-pay?sessionToken=fixture&useApplePaySandbox=true";

async function installProviderFrame(page: Page, parentOrigin: string) {
  await page.route(
    (url) => url.href === paymentUrl,
    (route) =>
      route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: `<!doctype html><html lang="en"><head><title>Local Coinbase fixture</title>
      <style>
        body { font: 14px system-ui; color: #182641; margin: 12px }
        p { margin: 0 0 8px; font-weight: 600 }
        button { background: #213f73; border: 0; border-radius: 8px; color: white; padding: 8px 12px }
      </style>
    </head><body>
      <p>Local test fixture · Simulated Apple Pay</p>
      <button data-event="commit_success">Simulate payment approval</button>
      <button hidden data-event="polling_success">Complete simulation</button>
      <button data-event="commit_error">Simulate provider error</button>
      <script>
        document.addEventListener("click", (event) => {
          if (event.target.dataset.event) {
            if (event.target.dataset.event === "commit_success") {
              document.querySelectorAll("button").forEach((button) => { button.hidden = button.dataset.event !== "polling_success" });
            }
            parent.postMessage({ eventName: "onramp_api." + event.target.dataset.event,
              data: { errorCode: "FIXTURE", errorMessage: "Sandbox payment failed" } }, ${JSON.stringify(parentOrigin)});
          }
        });
        parent.postMessage({ eventName: "onramp_api.load_success" }, ${JSON.stringify(parentOrigin)});
      </script>
    </body></html>`,
      }),
  );
}

test.beforeEach(() => {
  test.skip(process.env.E2E_MODE === "real", "exercises the local-only Coinbase test simulator");
});

test("review and consent open one sandbox order, then only the provider frame advances payment", async ({ page }) => {
  const requests: unknown[] = [];
  const broadcasts: string[] = [];
  page.on("request", (request) => {
    if (
      /"(?:eth_sendTransaction|eth_sendRawTransaction|eth_sendUserOperation|wallet_sendCalls)"/.test(
        request.postData() ?? "",
      )
    ) {
      broadcasts.push(request.url());
    }
  });
  await page.route("**/api/coinbase/sandbox", (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    return route.fulfill({ json: body.action === "quote" ? { quote } : { orderId, paymentUrl, quote } });
  });
  await page.goto(path);
  await installProviderFrame(page, new URL(page.url()).origin);
  await expect(page.getByRole("heading", { name: "Apple Pay sandbox" })).toBeVisible();
  expect(requests).toEqual([]);
  const getQuote = page.getByRole("button", { name: "Get $5 sandbox quote" });
  await expect(getQuote).toBeDisabled();
  await page.getByRole("checkbox", { name: /I accept Coinbase.s terms/ }).check();
  expect(requests).toEqual([]);
  await getQuote.click();
  await expect(page.getByText("Coinbase fees", { exact: true })).toBeVisible();
  const frame = page.locator('iframe[title="Coinbase sandbox Apple Pay"]');
  const create = page.getByRole("button", { name: "Create sandbox order" });
  await expect(create).toBeEnabled();
  await expect(frame).toHaveCount(0);
  expect(requests).toEqual([{ action: "quote", address: wallet, acceptedTerms: true }]);
  await create.click();
  await expect(frame).toHaveAttribute("src", paymentUrl);
  await expect(frame).toHaveAttribute("allow", "payment");
  await expect(frame).toHaveAttribute("sandbox", "allow-scripts allow-same-origin");
  await expect(frame).toHaveAttribute("referrerpolicy", "no-referrer");
  await page.evaluate(() => {
    const event = { eventName: "onramp_api.polling_success" };
    const frame = document.querySelector<HTMLIFrameElement>('iframe[title="Coinbase sandbox Apple Pay"]');
    // Each message matches only one of Coinbase's required sender attributes.
    window.dispatchEvent(
      new MessageEvent("message", { data: event, origin: "https://pay.coinbase.com", source: window }),
    );
    window.dispatchEvent(
      new MessageEvent("message", { data: event, origin: location.origin, source: frame?.contentWindow }),
    );
  });
  await expect(page.getByText("Sandbox payment complete", { exact: true })).toHaveCount(0);
  const provider = frame.contentFrame();
  await provider.getByRole("button", { name: "Simulate payment approval" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Payment approved." })).toBeVisible();
  await provider.getByRole("button", { name: "Complete simulation" }).click();
  await expect(page.getByText("Sandbox payment complete", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sandbox payment complete" })).toBeVisible();
  await expect(frame).toHaveCount(0);
  await page.getByRole("button", { name: "Start another test" }).click();
  await expect(page.getByRole("checkbox", { name: /I accept Coinbase.s terms/ })).not.toBeChecked();
  await expect(getQuote).toBeDisabled();
  expect(requests).toEqual([
    { action: "quote", address: wallet, acceptedTerms: true },
    {
      action: "order",
      address: wallet,
      acceptedTerms: true,
      attemptId: expect.stringMatching(/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i),
    },
  ]);
  expect(broadcasts).toEqual([]);
});

test("an unavailable quote explains the configuration error before any order", async ({ page }) => {
  const error = "Set CDP_API_KEY_ID and CDP_API_KEY_SECRET on the local server.";
  const requests: unknown[] = [];
  await page.route("**/api/coinbase/sandbox", (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ status: 503, json: { error } });
  });
  await page.goto(path);
  await page.getByRole("checkbox", { name: /I accept Coinbase.s terms/ }).check();
  await page.getByRole("button", { name: "Get $5 sandbox quote" }).click();
  await expect(page.getByRole("region", { name: "Apple Pay sandbox" }).getByRole("alert")).toHaveText(error);
  await expect(page.locator('iframe[title="Coinbase sandbox Apple Pay"]')).toHaveCount(0);
  expect(requests).toEqual([{ action: "quote", address: wallet, acceptedTerms: true }]);
});

test("updated order terms require a second review and the provider can report a failed payment", async ({ page }) => {
  const changed = { ...quote, feeTotal: "0.20", purchaseAmount: "4.800000" };
  const actions: string[] = [];
  await page.route("**/api/coinbase/sandbox", (route) => {
    const { action } = route.request().postDataJSON();
    actions.push(action);
    return route.fulfill({ json: action === "quote" ? { quote } : { orderId, paymentUrl, quote: changed } });
  });
  await page.goto(path);
  await installProviderFrame(page, new URL(page.url()).origin);
  await page.getByRole("checkbox", { name: /I accept Coinbase.s terms/ }).check();
  await page.getByRole("button", { name: "Get $5 sandbox quote" }).click();
  await page.getByRole("button", { name: "Create sandbox order" }).click();
  await expect(page.getByText("Review updated quote", { exact: true })).toBeVisible();
  await expect(page.getByText("$0.20", { exact: true })).toBeVisible();
  const frame = page.locator('iframe[title="Coinbase sandbox Apple Pay"]');
  await expect(frame).toHaveCount(0);
  await page.getByRole("button", { name: "Accept updated quote" }).click();
  await frame.contentFrame().getByRole("button", { name: "Simulate provider error" }).click();
  await expect(page.getByRole("region", { name: "Test payment" }).getByRole("alert")).toContainText(
    "start this sandbox payment",
  );
  await expect(page.getByText("Sandbox payment complete", { exact: true })).toHaveCount(0);
  expect(actions).toEqual(["quote", "order"]);
});

test("reloading after a lost order response preserves the unknown outcome without reordering", async ({ page }) => {
  const actions: string[] = [];
  await page.route("**/api/coinbase/sandbox", (route) => {
    const { action } = route.request().postDataJSON();
    actions.push(action);
    return action === "order" ? route.abort("connectionfailed") : route.fulfill({ json: { quote } });
  });
  await page.goto(path);
  await page.getByRole("checkbox", { name: /I accept Coinbase.s terms/ }).check();
  await page.getByRole("button", { name: "Get $5 sandbox quote" }).click();
  const create = page.getByRole("button", { name: "Create sandbox order" });
  await create.click();
  const unknownOutcome = page.getByRole("status").filter({ hasText: "Its outcome is unknown" });
  await expect(unknownOutcome).toBeVisible();
  await page.reload();
  await expect(unknownOutcome).toBeVisible();
  await expect(create).toHaveCount(0);
  await expect(page.locator('iframe[title="Coinbase sandbox Apple Pay"]')).toHaveCount(0);
  expect(actions).toEqual(["quote", "order"]);
});
