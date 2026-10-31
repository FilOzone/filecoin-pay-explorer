import { expect, test } from "./fixtures";
import { loginWithTestAccount } from "./privy";

test("clicking another field while a select is open keeps the dialog open", async ({ page }) => {
  // USDFC in the wallet makes the setup page approve and deposit in one dialog, which has the deposit field.
  await page.addInitScript(() => {
    (window as unknown as { __fakeUsdfcBalance: string }).__fakeUsdfcBalance = (5n * 10n ** 18n).toString();
  });
  await page.goto("/console/setup?deposit=2&operator=fwss&network=mainnet");
  await loginWithTestAccount(page);
  await page.getByRole("button", { name: "Add Warm Storage and deposit 2 USDFC" }).click({ timeout: 30_000 });

  const dialog = page.getByRole("dialog", { name: "Add a Service" });
  const heading = dialog.getByRole("heading", { name: "Add a Service" });
  await expect(heading).toBeVisible();
  const field = await dialog.getByPlaceholder("0.0").first().boundingBox();
  await dialog.getByRole("combobox").first().click();
  await expect(page.getByRole("listbox")).toBeVisible();

  // The open select sets `pointer-events: none` on body, so click by position.
  await page.mouse.click((field?.x ?? 0) + 5, (field?.y ?? 0) + 5);
  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(heading).toBeVisible();
});
