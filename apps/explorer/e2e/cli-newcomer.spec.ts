import { expect, test } from "@playwright/test";
import { loginWithTestAccount } from "./privy";

// The link `filecoin-pin login` prints (filecoin-pin src/core/session/console-url.ts).
const SESSION_KEY = "0x00000000000000000000000000000000000000bb";
const AUTHORIZE_LINK = `/console/session-keys?authorize=${SESSION_KEY}&scopes=createDataSet,addPieces&network=mainnet`;

test.describe("CLI newcomer authorizes a session key from `filecoin-pin login`", () => {
  test("signs up by email from the link and sees the key pre-filled for review", async ({ page }) => {
    await page.goto(AUTHORIZE_LINK);

    await loginWithTestAccount(page);

    await expect(page.getByText(`A link is requesting authorization for ${SESSION_KEY}`)).toBeVisible();
  });
});
