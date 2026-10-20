import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { calibration, mainnet } from "@/constants/chains";

const DIRECT = { ft_type: "direct", entry_page: "console", entry_type: "console-direct" };
const SITE = {
  ft_type: "organic",
  entry_page: "ipfs-pinning",
  entry_type: "from-site",
  ft_source: "google",
  foc_ref: "ipfs-pinning-start-building",
  product: "ipfs-pinning",
};
const SITE_QUERY = "foc_ft=organic:google&foc_entry=ipfs-pinning&foc_ref=ipfs-pinning-start-building";
const MAINNET_USDFC = mainnet.contracts.usdfc.address;

let plausible: ReturnType<typeof vi.fn>;
let replaceState: ReturnType<typeof vi.fn>;

function stubWindow(search: string) {
  plausible = vi.fn();
  replaceState = vi.fn();
  vi.stubGlobal("window", {
    plausible,
    history: { replaceState },
    location: { search, pathname: "/console", hash: "" },
  });
}

// Fresh module per test: labels and once-per-load state are module scoped.
const load = () => import("./funnel-analytics");

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe("readFunnelLabels", () => {
  it("defaults a typed URL to console-direct", async () => {
    const { readFunnelLabels } = await load();
    assert.deepEqual(readFunnelLabels(new URLSearchParams()), DIRECT);
  });

  it("reads site labels", async () => {
    const { readFunnelLabels } = await load();
    assert.deepEqual(readFunnelLabels(new URLSearchParams(SITE_QUERY)), SITE);
  });

  it("marks a docs- ref as from-docs", async () => {
    const { readFunnelLabels } = await load();
    assert.deepEqual(readFunnelLabels(new URLSearchParams("foc_ref=docs-open-console")), {
      ...DIRECT,
      entry_type: "from-docs",
      foc_ref: "docs-open-console",
    });
  });

  it("accepts only known ft_type values", async () => {
    const { readFunnelLabels } = await load();
    assert.equal(readFunnelLabels(new URLSearchParams("foc_ft=campaign")).ft_type, "campaign");
    assert.deepEqual(readFunnelLabels(new URLSearchParams("foc_ft=paid-search:google")), DIRECT);
  });

  it("reads a referral domain as ft_source", async () => {
    const { readFunnelLabels } = await load();
    assert.deepEqual(readFunnelLabels(new URLSearchParams("foc_ft=referral:news.ycombinator.com")), {
      ...DIRECT,
      ft_type: "referral",
      ft_source: "news.ycombinator.com",
    });
  });

  it("takes product from the CTA, then the landing page, then the CLI", async () => {
    const { readFunnelLabels } = await load();
    const product = (query: string) => readFunnelLabels(new URLSearchParams(query)).product;
    assert.equal(product("foc_ref=agent-skills-fund-console&foc_entry=pricing"), "agent-skills");
    assert.equal(product("foc_ref=docs-open-console&foc_entry=data-storage"), "data-storage");
    assert.equal(product("utm_source=filecoin-pin&utm_campaign=fund"), "filecoin-pin");
    assert.equal(product("foc_ref=docs-open-console&utm_source=other"), undefined);
  });

  it("drops lowercase addresses, hashes, and UUIDs", async () => {
    const { readFunnelLabels } = await load();
    for (const id of [
      "0xab5801a7d398351b8be11c439e05c5b3259aec9b",
      "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      "123e4567-e89b-12d3-a456-426614174000",
      "agent-skills-0xab5801a7",
    ]) {
      assert.deepEqual(
        readFunnelLabels(new URLSearchParams({ foc_ref: id, foc_entry: id, foc_ft: `referral:${id}` })),
        { ...DIRECT, ft_type: "referral" },
        id,
      );
    }
  });

  it("drops non-slugs and labels over 64 characters", async () => {
    const { readFunnelLabels } = await load();
    assert.equal(readFunnelLabels(new URLSearchParams("foc_entry=a%20b")).entry_page, "console");
    assert.equal(readFunnelLabels(new URLSearchParams(`foc_entry=${"x".repeat(65)}`)).entry_page, "console");
    assert.equal(readFunnelLabels(new URLSearchParams(`foc_entry=${"x".repeat(64)}`)).entry_page, "x".repeat(64));
  });
});

describe("funnel labels", () => {
  it("leaves the URL untouched", async () => {
    stubWindow(`?${SITE_QUERY}&utm_source=x&deposit=2`);
    const { trackConsoleView } = await load();
    trackConsoleView();
    assert.equal(replaceState.mock.calls.length, 0);
  });

  it("keeps the first labels read this page load", async () => {
    stubWindow(`?${SITE_QUERY}`);
    const { trackConsoleView, trackWalletConnected } = await load();
    trackConsoleView();
    window.location.search = "?foc_ft=campaign";
    trackWalletConnected("external");
    assert.deepEqual(plausible.mock.calls[1], [
      "console_wallet_connected",
      { props: { ...SITE, wallet_type: "external", account: "returning" } },
    ]);
  });

  it("reads the labels again after the Google login redirect reloads the page", async () => {
    stubWindow(`?${SITE_QUERY}&privy_oauth_code=c&privy_oauth_state=s&privy_oauth_provider=google`);
    const { trackWalletConnected } = await load();
    trackWalletConnected("embedded", true);
    assert.deepEqual(plausible.mock.calls, [
      ["console_wallet_connected", { props: { ...SITE, wallet_type: "embedded", account: "new" } }],
    ]);
  });

  it("reads a typed URL as console-direct", async () => {
    stubWindow("");
    const { trackConsoleView } = await load();
    trackConsoleView();
    assert.deepEqual(plausible.mock.calls, [["console_view", { props: DIRECT }]]);
  });
});

describe("trackConsoleView", () => {
  it("sends console_view once per page load", async () => {
    stubWindow(`?${SITE_QUERY}`);
    const { trackConsoleView } = await load();
    trackConsoleView();
    trackConsoleView();
    assert.deepEqual(plausible.mock.calls, [["console_view", { props: SITE }]]);
  });
});

describe("trackWalletConnected", () => {
  it("sends every connect with the wallet type and whether the account is new", async () => {
    stubWindow(`?${SITE_QUERY}`);
    const { trackWalletConnected } = await load();
    trackWalletConnected("embedded", true);
    trackWalletConnected("external");
    assert.deepEqual(plausible.mock.calls, [
      ["console_wallet_connected", { props: { ...SITE, wallet_type: "embedded", account: "new" } }],
      ["console_wallet_connected", { props: { ...SITE, wallet_type: "external", account: "returning" } }],
    ]);
  });
});

describe("trackDepositConfirmed", () => {
  it("sends a mainnet USDFC deposit with the exact amount as revenue", async () => {
    stubWindow("");
    const { trackDepositConfirmed } = await load();
    trackDepositConfirmed(mainnet.id, MAINNET_USDFC, 1_234_567_890_123_456_789n);
    assert.deepEqual(plausible.mock.calls, [
      ["console_deposit_confirmed", { props: DIRECT, revenue: { currency: "USD", amount: "1.234567890123456789" } }],
    ]);
  });

  it("matches the USDFC address case-insensitively", async () => {
    stubWindow("");
    const { trackDepositConfirmed } = await load();
    trackDepositConfirmed(mainnet.id, `0x${MAINNET_USDFC.slice(2).toUpperCase()}`, 10n ** 18n);
    assert.equal(plausible.mock.calls.length, 1);
  });

  it("ignores calibration, even with the mainnet USDFC address", async () => {
    stubWindow("");
    const { trackDepositConfirmed } = await load();
    trackDepositConfirmed(calibration.id, calibration.contracts.usdfc.address, 10n ** 18n);
    trackDepositConfirmed(calibration.id, MAINNET_USDFC, 10n ** 18n);
    assert.equal(plausible.mock.calls.length, 0);
  });

  it("ignores other tokens on mainnet", async () => {
    stubWindow("");
    const { trackDepositConfirmed } = await load();
    trackDepositConfirmed(mainnet.id, "0x1111111111111111111111111111111111111111", 10n ** 18n);
    assert.equal(plausible.mock.calls.length, 0);
  });
});

describe("card and USDC-gas deposit events", () => {
  it("counts card USDC that landed, whether or not a deposit follows", async () => {
    stubWindow("");
    const { trackCardUsdcLanded } = await load();
    trackCardUsdcLanded("embedded");
    assert.deepEqual(plausible.mock.calls, [["card_usdc_landed", { props: { ...DIRECT, wallet_type: "embedded" } }]]);
  });

  it("follows a USDC-gas deposit from submission to its outcome, with a reason label on failure", async () => {
    stubWindow(SITE_QUERY);
    const { trackUsdcGasDeposit, trackUsdcGasDepositFailed } = await load();
    trackUsdcGasDeposit("submitted");
    trackUsdcGasDeposit("completed");
    trackUsdcGasDepositFailed("reverted");
    assert.deepEqual(plausible.mock.calls, [
      ["usdc_gas_deposit_submitted", { props: SITE }],
      ["usdc_gas_deposit_completed", { props: SITE }],
      ["usdc_gas_deposit_failed", { props: { ...SITE, reason: "reverted" } }],
    ]);
  });
});
