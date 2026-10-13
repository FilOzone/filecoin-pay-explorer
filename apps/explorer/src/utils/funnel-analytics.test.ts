import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { calibration, mainnet } from "@/constants/chains";

const DIRECT = { ft_type: "direct", entry_page: "console", entry_type: "console-direct" };
const SITE = {
  ft_type: "campaign",
  entry_page: "ipfs-pinning",
  entry_type: "from-site",
  foc_ref: "ipfs-pinning-start-building",
};
const SITE_QUERY = "foc_ft=campaign&foc_entry=ipfs-pinning&foc_ref=ipfs-pinning-start-building";
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
    assert.equal(readFunnelLabels(new URLSearchParams("foc_ft=organic")).ft_type, "organic");
    assert.equal(readFunnelLabels(new URLSearchParams("foc_ft=paid-search")).ft_type, "direct");
  });

  it("drops lowercase addresses, hashes, and UUIDs", async () => {
    const { readFunnelLabels } = await load();
    for (const id of [
      "0xab5801a7d398351b8be11c439e05c5b3259aec9b",
      "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      "123e4567-e89b-12d3-a456-426614174000",
      "agent-skills-0xab5801a7",
    ]) {
      assert.deepEqual(readFunnelLabels(new URLSearchParams({ foc_ref: id, foc_entry: id })), DIRECT, id);
    }
  });

  it("drops non-slugs and labels over 64 characters", async () => {
    const { readFunnelLabels } = await load();
    assert.equal(readFunnelLabels(new URLSearchParams("foc_entry=a%20b")).entry_page, "console");
    assert.equal(readFunnelLabels(new URLSearchParams(`foc_entry=${"x".repeat(65)}`)).entry_page, "console");
    assert.equal(readFunnelLabels(new URLSearchParams(`foc_entry=${"x".repeat(64)}`)).entry_page, "x".repeat(64));
  });
});

describe("captureFunnelLabels", () => {
  it("drops foc_* params, including foc_jid, and keeps the rest", async () => {
    stubWindow(`?${SITE_QUERY}&foc_jid=v123&utm_source=x&deposit=2`);
    const { captureFunnelLabels } = await load();
    captureFunnelLabels();
    assert.deepEqual(replaceState.mock.calls, [[null, "", "/console?utm_source=x&deposit=2"]]);
  });

  it("leaves a URL with no foc_* params alone", async () => {
    stubWindow("?utm_source=x");
    const { captureFunnelLabels } = await load();
    captureFunnelLabels();
    assert.equal(replaceState.mock.calls.length, 0);
  });

  it("reads labels once per page load", async () => {
    stubWindow(`?${SITE_QUERY}`);
    const { captureFunnelLabels, trackFunnelOnce } = await load();
    captureFunnelLabels();
    window.location.search = "?foc_ft=organic";
    captureFunnelLabels();
    trackFunnelOnce("console_view");
    assert.deepEqual(plausible.mock.calls, [["console_view", { props: SITE }]]);
  });
});

describe("trackFunnelOnce", () => {
  it("sends each event once per page load", async () => {
    stubWindow(`?${SITE_QUERY}`);
    const { captureFunnelLabels, trackFunnelOnce } = await load();
    captureFunnelLabels();
    trackFunnelOnce("console_view");
    trackFunnelOnce("console_view");
    trackFunnelOnce("console_wallet_connected");
    assert.deepEqual(plausible.mock.calls, [
      ["console_view", { props: SITE }],
      ["console_wallet_connected", { props: SITE }],
    ]);
  });

  it("falls back to console-direct labels before capture", async () => {
    stubWindow(`?${SITE_QUERY}`);
    const { trackFunnelOnce } = await load();
    trackFunnelOnce("console_view");
    assert.deepEqual(plausible.mock.calls, [["console_view", { props: DIRECT }]]);
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
