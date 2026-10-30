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

  await page.getByRole("button", { name: "Continue with email or Google" }).click();
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
