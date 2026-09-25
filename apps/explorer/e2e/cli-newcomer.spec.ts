import { expect, test } from "@playwright/test";
import { consoleLink, filecoinPin } from "./filecoin-pin";
import { loginWithTestAccount } from "./privy";

// The "deposit & approve" link login prints once the key is authorized and the account can't upload yet
// (filecoin-pin buildFundingUrl, with its default 2 USDFC suggestion).
const FUNDING_LINK = "/console?deposit=2&operator=fwss&network=mainnet";

test.describe("CLI newcomer authorizes a session key from `filecoin-pin login`", () => {
  test("signs up by email from the link and sees the key pre-filled for review", async ({ page, baseURL }) => {
    const cli = await filecoinPin(`${baseURL}`);
    const link = consoleLink(await cli.run("login", "--no-browser", "--no-wait"), `${baseURL}`);
    const sessionKey = new URL(link, baseURL).searchParams.get("authorize");
    await page.goto(link);

    await loginWithTestAccount(page);

    await expect(page.getByText(`A link is requesting authorization for ${sessionKey}`)).toBeVisible();
  });

  test("signs up from the funding link and sees deposit & approve pre-filled", async ({ page }) => {
    await page.goto(FUNDING_LINK);

    await loginWithTestAccount(page);

    const dialog = page.getByRole("dialog", { name: "Add a Service" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByPlaceholder("0.0").first()).toHaveValue("2");
  });
});
