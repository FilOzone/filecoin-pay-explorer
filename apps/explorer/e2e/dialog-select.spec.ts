import { expect, test } from "./fixtures";
import { loginWithTestAccount } from "./privy";

test("clicking another field while a select is open keeps the dialog open", async ({ page }) => {
  await page.goto("/console?deposit=2&operator=fwss&network=mainnet");
  await loginWithTestAccount(page);

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
