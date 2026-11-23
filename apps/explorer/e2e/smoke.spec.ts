import { expect, test } from "./fixtures";
import { loginWithTestAccount } from "./privy";

test("a Privy email login reaches the console", async ({ page }) => {
  await page.goto("/console");

  await loginWithTestAccount(page, { dismissFundingPrompt: true });

  await expect(page.getByRole("link", { name: "Session Keys" })).toBeVisible({ timeout: 30_000 });
});
