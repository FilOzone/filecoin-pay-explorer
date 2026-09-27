import type { Page } from "@playwright/test";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set; add it to apps/explorer/.env.e2e.local`);
  return value;
}

/** Log in through the Privy modal: the staging app's test account when E2E_PRIVY=real, any email/code on the fake. */
export async function loginWithTestAccount(page: Page): Promise<void> {
  const real = process.env.E2E_PRIVY === "real";
  const email = real ? requireEnv("E2E_PRIVY_TEST_EMAIL") : "e2e@fake-privy.test";
  const otp = real ? requireEnv("E2E_PRIVY_TEST_OTP") : "000000";

  await page.getByRole("button", { name: "Log in" }).click();
  const modal = page.getByRole("dialog", { name: "log in or sign up" });
  await modal.getByPlaceholder(/email/i).fill(email);
  await modal.getByRole("button", { name: /submit/i }).click();
  await modal.getByRole("heading", { name: "Enter confirmation code" }).waitFor();
  const boxes = modal.getByRole("textbox");
  for (const [i, digit] of [...otp].entries()) await boxes.nth(i).fill(digit);
}
