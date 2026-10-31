import type { Page } from "@playwright/test";
import { decodeFunctionData, type Hex } from "viem";
import { consoleLink, filecoinPin } from "./filecoin-pin";
import { expect, test } from "./fixtures";
import { loginWithTestAccount } from "./privy";

// The "deposit & approve" link login prints once the key is authorized and the account can't upload yet
// (filecoin-pin buildFundingUrl, with its default 2 USDFC suggestion). The console redirects it to /console/setup.
const FUNDING_LINK = "/console?deposit=2&operator=fwss&network=mainnet";
// Nothing to deposit: the account only needs the Warm Storage approval.
const APPROVAL_LINK = "/console?operator=fwss&network=mainnet";

// Mock mode follows the CLI's default network, mainnet, against the fake Privy and fake chain. Against real
// Privy the journeys sign real transactions, so they use calibration and the test account's funded wallet.
const REAL_MODE = process.env.E2E_MODE === "real";
const NETWORK = REAL_MODE ? "calibration" : "mainnet";
// Real Privy waits for the receipt (about a minute on Filecoin) before it shows "Transaction complete".
const WALLET_TIMEOUT = REAL_MODE ? 180_000 : 30_000;

const privyDialog = (page: Page) => page.locator("#privy-dialog");

/** Follows the `filecoin-pin login` link, signs up, and submits "Authorize as ..."; returns the link's query. */
async function authorizeFromCli(page: Page, baseURL: string): Promise<URLSearchParams> {
  test.setTimeout(REAL_MODE ? 300_000 : 30_000);
  const cli = await filecoinPin(baseURL);
  const link = consoleLink(await cli.run("login", "--network", NETWORK, "--no-browser", "--no-wait"), baseURL);
  await page.goto(link);
  await loginWithTestAccount(page);
  // The embedded wallet starts on mainnet.
  if (NETWORK === "calibration") {
    await page.getByRole("button", { name: /Switch network/ }).click();
    await page.getByText("Calibration", { exact: true }).last().click();
  }
  await page.getByRole("button", { name: "Review and authorize" }).click();
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

    // The CLI's session keys link lands on the setup page, which lists the key before anything opens.
    await expect(page).toHaveURL(/\/console\/setup\?/);
    await expect(page.getByRole("heading", { name: "Step 1: Authorize a session key" })).toBeVisible();
    await page.getByRole("button", { name: "Review and authorize" }).click();
    const dialog = page.getByRole("dialog", { name: "New session key" });
    // The link carries the address lowercase; the dialog shows it checksummed.
    await expect(dialog.getByText(new RegExp(`^${sessionKey}$`, "i"))).toBeVisible();
    await expect(dialog.getByText(/^This address came from the link\./)).toBeVisible();
  });

  test("sees the name and days the link suggests prefilled, and can edit them", async ({ page, baseURL }) => {
    const cli = await filecoinPin(`${baseURL}`);
    // The pinned filecoin-pin sends neither; the `filecoin` CLI does.
    const link = `${consoleLink(await cli.run("login", "--no-browser", "--no-wait"), `${baseURL}`)}&name=filecoin-cli&days=7`;
    await page.goto(link);

    await loginWithTestAccount(page);

    await page.getByRole("button", { name: "Review and authorize" }).click();
    const dialog = page.getByRole("dialog", { name: "New session key" });
    const name = dialog.getByRole("textbox", { name: /^Name/ });
    await expect(name).toHaveValue("filecoin-cli");
    await expect(name).toBeEditable();
    const days = dialog.getByRole("textbox", { name: /^Expiration/ });
    await expect(days).toHaveValue("7");
    await expect(days).toBeEditable();
    await expect(days).toHaveAccessibleDescription(/^The key stops working on /);
    await days.fill("0");
    await expect(days).toHaveAttribute("aria-invalid", "true");
    await expect(days).toHaveAccessibleDescription(/^Enter a whole number of days, at least 1/);
  });

  test("reviews the key and is asked to send the registry login for it", async ({ page, baseURL }) => {
    test.skip(REAL_MODE, "decodes the transaction the fake wallet records; real Privy signs and broadcasts it");
    const requested = await authorizeFromCli(page, `${baseURL}`);
    await privyDialog(page).getByRole("button", { name: "Approve" }).click();

    const sent = await page.waitForFunction(
      () =>
        (window as typeof window & { __fakePrivyTransactions?: { to: string; data: Hex }[] })
          .__fakePrivyTransactions?.[0],
    );
    const tx = (await sent.jsonValue()) as { to: string; data: Hex };
    // The contract's published address and ABI, and synapse-core's permission hashes.
    // Imported dynamically: both are ESM-only and Playwright loads this spec as CommonJS.
    const { mainnet } = await import("@filoz/synapse-sdk");
    const permission = await import("@filoz/synapse-core/session-key");
    const permissionFor: Record<string, Hex> = {
      createDataSet: permission.CreateDataSetPermission,
      addPieces: permission.AddPiecesPermission,
      schedulePieceRemovals: permission.SchedulePieceRemovalsPermission,
      terminateService: permission.TerminateServicePermission,
    };
    const registry = mainnet.contracts.sessionKeyRegistry;
    const { functionName, args } = decodeFunctionData({ abi: registry.abi, data: tx.data });
    expect(tx.to.toLowerCase()).toBe(registry.address.toLowerCase());
    expect(functionName).toBe("login");
    expect(`${args?.[0]}`.toLowerCase()).toBe(requested.get("authorize"));
    expect(args?.[2]).toEqual(`${requested.get("scopes")}`.split(",").map((scope) => permissionFor[scope]));
  });

  test("is told to finish in the wallet while it sends", async ({ page, baseURL }) => {
    await authorizeFromCli(page, `${baseURL}`);
    await privyDialog(page).getByRole("button", { name: "Approve" }).click();

    await expect(privyDialog(page).getByText("Loading...")).toBeVisible();
    // Real Privy marks the page behind its modal aria-hidden, so the console dialog is only reachable as hidden.
    await expect(page.getByRole("dialog", { name: "New session key", includeHidden: true })).toContainText("All Done");
  });

  test("sees the key registered after clicking All Done", async ({ page, baseURL }) => {
    await authorizeFromCli(page, `${baseURL}`);
    await privyDialog(page).getByRole("button", { name: "Approve" }).click();
    await privyDialog(page).getByRole("button", { name: "All Done" }).click({ timeout: WALLET_TIMEOUT });

    await expect(page.getByRole("heading", { name: "Session key registered" })).toBeVisible();
  });

  test("still sees the key registered after closing the wallet dialog", async ({ page, baseURL }) => {
    await authorizeFromCli(page, `${baseURL}`);
    await privyDialog(page).getByRole("button", { name: "Approve" }).click();
    await expect(privyDialog(page).getByText("Loading...")).toBeVisible();
    // The login is already sent; real Privy leaves the request unsettled when closed now.
    await privyDialog(page).getByRole("button", { name: "close modal" }).click();

    // Real Privy reopens on "Transaction complete" above the console, hiding the page behind it from roles.
    await expect(page.getByRole("heading", { name: "Session key registered", includeHidden: true })).toBeVisible({
      timeout: WALLET_TIMEOUT,
    });
  });

  test("signs up from the funding link with USDFC in the wallet and approves and deposits in one step", async ({
    page,
  }) => {
    test.skip(REAL_MODE, "sets the wallet's USDFC in the fake chain");
    await page.addInitScript(() => {
      (window as unknown as { __fakeUsdfcBalance: string }).__fakeUsdfcBalance = (5n * 10n ** 18n).toString();
    });
    await page.goto(FUNDING_LINK);

    await loginWithTestAccount(page);
    await expect(page).toHaveURL(/\/console\/setup\?deposit=2&operator=fwss&network=mainnet$/);
    await page.getByRole("button", { name: "Approve and deposit 2 USDFC" }).click({ timeout: 30_000 });

    // The dialog root has no box of its own (everything inside is `fixed`), so assert on its heading.
    const dialog = page.getByRole("dialog", { name: "Add a Service" });
    await expect(dialog.getByRole("heading", { name: "Add a Service" })).toBeVisible();
    // The form renders after a chain read; a cold `next dev` in CI can take well past the default 5s.
    await expect(dialog.getByPlaceholder("0.0").first()).toHaveValue("2", { timeout: 30_000 });
    // The wallet covers it, so the funds step points at the approval instead of offering Add funds.
    await expect(page.getByText("Approving Warm Storage above also deposits the 2 USDFC")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("button", { name: "Add funds" })).toHaveCount(0);
  });

  test("signs up from the funding link with an empty wallet, approves alone and is offered Add funds", async ({
    page,
  }) => {
    test.skip(REAL_MODE, "relies on the fake chain's empty wallet");
    await page.goto(FUNDING_LINK);

    await loginWithTestAccount(page);
    const titles = page.locator("ol > li h2");
    await expect(titles).toHaveText(["Step 1: Approve Warm Storage", "Step 2: Fund Filecoin Pay"], {
      timeout: 30_000,
    });
    // The steps show at once; what the funds step offers waits on the balance read.
    await expect(page.getByRole("button", { name: "Add funds" })).toBeVisible({ timeout: 30_000 });
    // The wallet holds nothing, so the approval goes ahead without the deposit, which Add funds makes.
    await page.getByRole("button", { name: "Approve Warm Storage" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a Service" });
    await expect(dialog.getByRole("heading", { name: "Add a Service" })).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByRole("spinbutton", { name: "Deposit amount" })).toHaveCount(0);
  });

  test("signs up from an approval-only funding link and sees Warm Storage filled in, with no deposit", async ({
    page,
  }) => {
    await page.goto(APPROVAL_LINK);

    await loginWithTestAccount(page);
    await page.getByRole("button", { name: "Approve Warm Storage" }).click({ timeout: 30_000 });

    const dialog = page.getByRole("dialog", { name: "Add a Service" });
    await expect(dialog.getByRole("heading", { name: "Add a Service" })).toBeVisible();
    // A subgraph that lists Warm Storage (real mode) selects it by name and links its contract; CI's
    // placeholder subgraph lists no services, so the operator lands in the custom-address field instead.
    const { mainnet } = await import("@filoz/synapse-sdk");
    const fwss = mainnet.contracts.fwss.address;
    const custom = dialog.getByRole("textbox", { name: /^Service contract address/ });
    const curated = dialog.locator(`a[href$="/address/${fwss}" i]`);
    await expect(custom.or(curated)).toBeVisible({ timeout: 30_000 });
    if (await custom.isVisible()) await expect(custom).toHaveValue(new RegExp(`^${fwss}$`, "i"));
    // An approval-only link offers no deposit at all.
    await expect(dialog.getByRole("spinbutton", { name: "Deposit amount" })).toHaveCount(0);
  });

  test("opens an approval-only funding link on an account that already approved Warm Storage and sees it done", async ({
    page,
  }) => {
    test.skip(REAL_MODE, "marks the approval in the fake chain");
    const { mainnet } = await import("@filoz/synapse-sdk");
    await page.addInitScript((fwss) => {
      (window as unknown as { __fakeApprovedOperators: string[] }).__fakeApprovedOperators = [fwss];
    }, mainnet.contracts.fwss.address);
    await page.goto(APPROVAL_LINK);

    await loginWithTestAccount(page);

    const step = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("heading", { name: /Approve Warm Storage$/ }) });
    await expect(step.getByText("Approved", { exact: true })).toBeVisible({ timeout: 30_000 });
    // Never offered again: its unlimited defaults would overwrite the owner's own limits.
    await expect(page.getByRole("button", { name: /^Approve/ })).toHaveCount(0);
  });
});
