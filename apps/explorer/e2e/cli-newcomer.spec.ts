import { expect, test } from "@playwright/test";
import { loginWithTestAccount } from "./privy";

// The link `filecoin-pin login` prints (filecoin-pin src/core/session/console-url.ts).
const SESSION_KEY = "0x00000000000000000000000000000000000000bb";
const AUTHORIZE_LINK = `/console/session-keys?authorize=${SESSION_KEY}&scopes=createDataSet,addPieces&network=mainnet`;
// The "deposit & approve" link login prints once the key is authorized and the account can't upload yet
// (filecoin-pin buildFundingUrl, with its default 2 USDFC suggestion).
const FUNDING_LINK = "/console?deposit=2&operator=fwss&network=mainnet";

test.describe("CLI newcomer authorizes a session key from `filecoin-pin login`", () => {
  test("signs up by email from the link and sees the key pre-filled for review", async ({ page }) => {
    await page.goto(AUTHORIZE_LINK);

    await loginWithTestAccount(page);

    await expect(page.getByText(`A link is requesting authorization for ${SESSION_KEY}`)).toBeVisible();
  });

  test("signs up from the funding link and sees deposit & approve pre-filled", async ({ page }) => {
    await page.goto(FUNDING_LINK);

    await loginWithTestAccount(page);

    const dialog = page.getByRole("dialog", { name: "Add a Service" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByPlaceholder("0.0").first()).toHaveValue("2");
  });
});
