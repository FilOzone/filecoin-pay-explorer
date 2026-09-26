import { expect, type Page, test } from "@playwright/test";
import { decodeFunctionData, type Hex, keccak256, toBytes } from "viem";
import { FWSS_PERMISSION_PREIMAGES } from "../src/utils/fwssPermissionPreimages";
import { installFakeChain } from "./fake-chain";
import { consoleLink, filecoinPin } from "./filecoin-pin";
import { loginWithTestAccount } from "./privy";

// The "deposit & approve" link login prints once the key is authorized and the account can't upload yet
// (filecoin-pin buildFundingUrl, with its default 2 USDFC suggestion).
const FUNDING_LINK = "/console?deposit=2&operator=fwss&network=mainnet";

// The fake Privy's dialog and the fake chain stand in for real Privy and Filecoin; against real Privy these
// journeys would sign and broadcast from an unfunded account.
function skipAgainstRealPrivy() {
  test.skip(process.env.E2E_PRIVY === "real", "drives the fake Privy transaction dialog and the fake chain");
}

const privyDialog = (page: Page) => page.locator("#privy-dialog");

/** Follows the `filecoin-pin login` link, signs up, and submits "Authorize as ..."; returns the link's query. */
async function authorizeFromCli(page: Page, baseURL: string): Promise<URLSearchParams> {
  await installFakeChain(page);
  const cli = await filecoinPin(baseURL);
  const link = consoleLink(await cli.run("login", "--no-browser", "--no-wait"), baseURL);
  await page.goto(link);
  await loginWithTestAccount(page);
  await page.getByRole("button", { name: "Review & authorize" }).click();
  await page.getByRole("button", { name: /^Authorize as / }).click();
  return new URL(link, baseURL).searchParams;
}

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
    skipAgainstRealPrivy();
    const requested = await authorizeFromCli(page, `${baseURL}`);
    await privyDialog(page).getByRole("button", { name: "Approve" }).click();

    const sent = await page.waitForFunction(
      () =>
        (window as typeof window & { __fakePrivyTransactions?: { to: string; data: Hex }[] })
          .__fakePrivyTransactions?.[0],
    );
    const tx = (await sent.jsonValue()) as { to: string; data: Hex };
    // The contract's published address and ABI, and the FWSS type strings the permissions hash.
    const { mainnet } = await import("@filoz/synapse-sdk");
    const registry = mainnet.contracts.sessionKeyRegistry;
    const { functionName, args } = decodeFunctionData({ abi: registry.abi, data: tx.data });
    expect(tx.to.toLowerCase()).toBe(registry.address.toLowerCase());
    expect(functionName).toBe("login");
    expect(`${args?.[0]}`.toLowerCase()).toBe(requested.get("authorize"));
    expect(args?.[2]).toEqual(
      `${requested.get("scopes")}`
        .split(",")
        .map((scope) => keccak256(toBytes(FWSS_PERMISSION_PREIMAGES[scope as keyof typeof FWSS_PERMISSION_PREIMAGES]))),
    );
  });

  test("is told to finish in the wallet while it sends", async ({ page, baseURL }) => {
    skipAgainstRealPrivy();
    await authorizeFromCli(page, `${baseURL}`);
    await privyDialog(page).getByRole("button", { name: "Approve" }).click();

    await expect(privyDialog(page).getByText("Loading...")).toBeVisible();
    await expect(page.getByRole("dialog", { name: "New session key" })).toContainText("All Done");
  });

  test("sees the key registered after clicking All Done", async ({ page, baseURL }) => {
    skipAgainstRealPrivy();
    await authorizeFromCli(page, `${baseURL}`);
    await privyDialog(page).getByRole("button", { name: "Approve" }).click();
    await privyDialog(page).getByRole("button", { name: "All Done" }).click();

    await expect(page.getByRole("heading", { name: "Session key registered" })).toBeVisible();
  });

  test("still sees the key registered after closing the wallet dialog", async ({ page, baseURL }) => {
    skipAgainstRealPrivy();
    await authorizeFromCli(page, `${baseURL}`);
    await privyDialog(page).getByRole("button", { name: "Approve" }).click();
    await expect(privyDialog(page).getByText("Loading...")).toBeVisible();
    // The login is already sent; real Privy leaves the request unsettled when closed now.
    await privyDialog(page).getByRole("button", { name: "close modal" }).click();

    await expect(page.getByRole("heading", { name: "Session key registered" })).toBeVisible({ timeout: 30_000 });
  });

  test("signs up from the funding link and sees deposit & approve pre-filled", async ({ page }) => {
    await page.goto(FUNDING_LINK);

    await loginWithTestAccount(page);

    const dialog = page.getByRole("dialog", { name: "Add a Service" });
    await expect(dialog).toBeVisible();
    // The form renders after a chain read; a cold `next dev` in CI can take well past the default 5s.
    await expect(dialog.getByPlaceholder("0.0").first()).toHaveValue("2", { timeout: 30_000 });
  });
});
