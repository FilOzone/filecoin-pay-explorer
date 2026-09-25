import { expect, test } from "@playwright/test";
import { loginWithTestAccount } from "./privy";

// The link `filecoin-pin logout` prints for the saved session key (filecoin-pin 2.1.1).
const REVOKE_LINK = "/console/session-keys?revoke=0x00000000000000000000000000000000000000bb&network=mainnet";

test.describe("CLI user revokes a session key from `filecoin-pin logout`", () => {
  test("follows the revoke link for a key the wallet never authorized and is told so", async ({ page }) => {
    // Blockscout's answer for a wallet with no SessionKeyRegistry grants.
    await page.route(
      (url) => url.pathname === "/api" && url.searchParams.get("module") === "logs",
      (route) => route.fulfill({ json: { status: "0", message: "No records found", result: [] } }),
    );
    await page.goto(REVOKE_LINK);

    await loginWithTestAccount(page);

    await expect(page.getByText("That session key is not in this wallet's list")).toBeVisible();
  });
});
