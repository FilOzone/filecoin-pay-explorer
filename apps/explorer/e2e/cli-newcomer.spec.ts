import { expect, test } from "@playwright/test";
import { decodeFunctionData, type Hex, parseAbi } from "viem";
import { consoleLink, filecoinPin } from "./filecoin-pin";
import { loginWithTestAccount } from "./privy";

// SessionKeyRegistry on mainnet, and the scopes `filecoin-pin login` requests by default.
const MAINNET_SESSION_KEY_REGISTRY = "0x74FD50525A958aF5d484601E252271f9625231aB";
const REGISTRY_ABI = parseAbi(["function login(address signer, uint256 expiry, bytes32[] permissions, string origin)"]);
const CREATE_DATA_SET_TYPEHASH = "0x25ebf20299107c91b4624d5bac3a16d32cabf0db23b450ee09ab7732983b1dc9";
const ADD_PIECES_TYPEHASH = "0x954bdc254591a7eab1b73f03842464d9283a08352772737094d710a4428fd183";

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

  test("reviews the key and is asked to send the registry login for it", async ({ page, baseURL }) => {
    test.skip(
      process.env.E2E_PRIVY === "real",
      "reads the transaction the fake wallet records; the real embedded wallet signs and broadcasts it",
    );
    const cli = await filecoinPin(`${baseURL}`);
    const link = consoleLink(await cli.run("login", "--no-browser", "--no-wait"), `${baseURL}`);
    const sessionKey = new URL(link, baseURL).searchParams.get("authorize");
    await page.goto(link);
    await loginWithTestAccount(page);

    await page.getByRole("button", { name: "Review & authorize" }).click();
    await page.getByRole("button", { name: /^Authorize as / }).click();

    const sent = await page.waitForFunction(
      () =>
        (window as typeof window & { __fakePrivyTransactions?: { to: string; data: Hex }[] })
          .__fakePrivyTransactions?.[0],
    );
    const tx = (await sent.jsonValue()) as { to: string; data: Hex };
    const { functionName, args } = decodeFunctionData({ abi: REGISTRY_ABI, data: tx.data });
    expect(tx.to.toLowerCase()).toBe(MAINNET_SESSION_KEY_REGISTRY.toLowerCase());
    expect(functionName).toBe("login");
    expect(args[0].toLowerCase()).toBe(sessionKey);
    expect(args[2]).toEqual([CREATE_DATA_SET_TYPEHASH, ADD_PIECES_TYPEHASH]);
  });

  test("signs up from the funding link and sees deposit & approve pre-filled", async ({ page }) => {
    await page.goto(FUNDING_LINK);

    await loginWithTestAccount(page);

    const dialog = page.getByRole("dialog", { name: "Add a Service" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByPlaceholder("0.0").first()).toHaveValue("2");
  });
});
