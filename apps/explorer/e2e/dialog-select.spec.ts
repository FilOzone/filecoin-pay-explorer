import { expect, test } from "./fixtures";
import { loginWithTestAccount } from "./privy";

test("pressing the dialog while a select is open closes only the select", async ({ page }) => {
  // USDFC in the wallet makes the setup page approve and deposit in one dialog.
  await page.addInitScript(() => {
    (window as unknown as { __fakeUsdfcBalance: string }).__fakeUsdfcBalance = (5n * 10n ** 18n).toString();
  });
  await page.goto("/console/setup?deposit=2&operator=fwss&network=mainnet");
  await loginWithTestAccount(page);
  await page.getByRole("button", { name: "Review approval and 2 USDFC deposit" }).click({ timeout: 30_000 });

  const dialog = page.getByRole("dialog", { name: "Add a Service" });
  const heading = dialog.getByRole("heading", { name: "Add a Service" });
  await expect(heading).toBeVisible();
  // From setup the service is locked to Warm Storage; the token select is still open to the user.
  await expect(dialog.locator("#service")).toBeDisabled();
  await dialog.locator("#paymentToken").click();
  await expect(page.getByRole("listbox")).toBeVisible();

  // The listbox drops over the fields below the token select, so press the title, which it never covers.
  // Measured now: the dialog recentres as its fields load, and the open select hides it from role queries.
  const title = await page.locator("[data-slot='dialog-title']").boundingBox();
  if (!title) throw new Error("The dialog title has no box");
  // The open select sets `pointer-events: none` on body, so click by position.
  await page.mouse.click(title.x + 5, title.y + 5);
  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(heading).toBeVisible();
});
