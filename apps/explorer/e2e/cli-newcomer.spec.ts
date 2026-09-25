import { expect, test } from "@playwright/test";
import { decodeFunctionData, type Hex } from "viem";
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

  test("reviews the key and is asked to send the registry login for it", async ({ page, baseURL }) => {
    test.skip(
      process.env.E2E_PRIVY === "real",
      "reads the transaction the fake wallet records; the real embedded wallet signs and broadcasts it",
    );
    const cli = await filecoinPin(`${baseURL}`);
    const link = consoleLink(await cli.run("login", "--no-browser", "--no-wait"), `${baseURL}`);
    const requested = new URL(link, baseURL).searchParams;
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
    // The contract's published address and ABI; typehash values are unit-tested in sessionKeys.test.ts.
    // Imported dynamically: the SDK is ESM-only and Playwright loads this spec as CommonJS.
    const { mainnet } = await import("@filoz/synapse-sdk");
    const registry = mainnet.contracts.sessionKeyRegistry;
    const { functionName, args } = decodeFunctionData({ abi: registry.abi, data: tx.data });
    expect(tx.to.toLowerCase()).toBe(registry.address.toLowerCase());
    expect(functionName).toBe("login");
    expect(`${args?.[0]}`.toLowerCase()).toBe(requested.get("authorize"));
    expect(args?.[2]).toHaveLength(`${requested.get("scopes")}`.split(",").length);
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
