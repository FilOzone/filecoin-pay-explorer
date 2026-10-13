import assert from "node:assert/strict";
import { afterEach, describe, it, vi } from "vitest";
import { calibration, mainnet } from "@/constants/chains";
import { captureFunnelLabels, readFunnelLabels, trackDepositConfirmed, trackFunnelOnce } from "./funnel-analytics";

describe("readFunnelLabels", () => {
  it("defaults a typed URL to console-direct", () => {
    assert.deepEqual(readFunnelLabels(new URLSearchParams()), {
      ft_type: "direct",
      entry_page: "console",
      entry_type: "console-direct",
    });
  });

  it("reads site and docs labels", () => {
    const site = new URLSearchParams("foc_ft=campaign&foc_entry=ipfs-pinning&foc_ref=ipfs-pinning-start-building");
    assert.deepEqual(readFunnelLabels(site), {
      ft_type: "campaign",
      entry_page: "ipfs-pinning",
      entry_type: "from-site",
      foc_ref: "ipfs-pinning-start-building",
    });
    assert.equal(readFunnelLabels(new URLSearchParams("foc_ref=docs-open-console")).entry_type, "from-docs");
  });

  it("drops anything that is not a slug, so IDs can't pass as labels", () => {
    const params = new URLSearchParams(
      "foc_ft=0xAbC123&foc_entry=a%20b&foc_ref=" + "x".repeat(65) + "&foc_jid=anything",
    );
    assert.deepEqual(readFunnelLabels(params), readFunnelLabels(new URLSearchParams()));
  });
});

describe("console funnel events", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("tags events with the captured labels, strips foc_*, and counts only mainnet USDFC deposits", () => {
    const plausible = vi.fn();
    const replaceState = vi.fn();
    vi.stubGlobal("window", {
      plausible,
      history: { replaceState },
      location: {
        href: "https://pay.filecoin.cloud/console?foc_ft=campaign&foc_ref=agent-skills-fund-console&utm_source=x",
      },
    });

    captureFunnelLabels();
    assert.equal(String(replaceState.mock.calls[0][2]), "https://pay.filecoin.cloud/console?utm_source=x");

    trackFunnelOnce("console_view");
    trackFunnelOnce("console_view");
    trackDepositConfirmed(calibration.id, calibration.contracts.usdfc.address, 10n ** 18n);
    trackDepositConfirmed(mainnet.id, mainnet.contracts.usdfc.address, 25n * 10n ** 17n);

    const labels = {
      ft_type: "campaign",
      entry_page: "console",
      entry_type: "from-site",
      foc_ref: "agent-skills-fund-console",
    };
    assert.deepEqual(plausible.mock.calls, [
      ["console_view", { props: labels }],
      ["console_deposit_confirmed", { props: labels, revenue: { currency: "USD", amount: "2.5" } }],
    ]);
  });
});
