import type { Page } from "@playwright/test";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set; add it to apps/explorer/.env.e2e.local`);
  return value;
}

/** Logs in with the configured real account or a selectable fake identity. */
export async function loginWithTestAccount(page: Page, options: { email?: string } = {}): Promise<void> {
  const real = process.env.E2E_MODE === "real";
  const email = real ? requireEnv("E2E_PRIVY_TEST_EMAIL") : (options.email ?? "e2e@fake-privy.test");
  const otp = real ? requireEnv("E2E_PRIVY_TEST_OTP") : "000000";

  await page.getByRole("button", { name: "Log in" }).click();
  const modal = page.getByRole("dialog", { name: "log in or sign up" });
  await modal.getByPlaceholder(/email/i).fill(email);
  await modal.getByRole("button", { name: /submit/i }).click();
  await modal.getByRole("heading", { name: "Enter confirmation code" }).waitFor();
  const boxes = modal.getByRole("textbox");
  for (const [i, digit] of [...otp].entries()) await boxes.nth(i).fill(digit);
}

export async function logoutFromConsole(page: Page): Promise<void> {
  // The network trigger has an aria-label; the wallet trigger does not.
  await page.locator('[data-slot="dropdown-menu-trigger"]:not([aria-label])').click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
}

// A fresh e2e wallet has no subgraph or notification history; these stub that empty state.
export async function stubAccountBackgroundRequests(page: Page): Promise<void> {
  await page.route(
    (url) => url.hostname === "api.goldsky.com",
    (route) => {
      const query = route.request().postData() ?? "";
      const data = query.includes("GetAccountTokens") ? { userTokens: [] } : { accounts: [] };
      return route.fulfill({ json: { data } });
    },
  );
  await page.route(
    (url) => url.hostname === "notification-api-production.filoz.workers.dev",
    (route) => route.fulfill({ json: { subscribed: false } }),
  );
}
