import { describe, expect, it } from "vitest";
import { describeSquidDepositProgress, describeSquidDepositStage } from "./squid-deposit-stages";

describe("squid deposit stages", () => {
  it("numbers the signatures only when an approval was part of this run", () => {
    const external = { hasApproved: false, isEmbedded: false, symbol: "USDC" };
    expect(describeSquidDepositStage("approving", external)).toBe("Step 1 of 2: approve USDC in your wallet");
    expect(describeSquidDepositStage("swap-requested", external)).toBe("Confirm the swap in your wallet");
    expect(describeSquidDepositStage("swap-requested", { ...external, hasApproved: true })).toBe(
      "Step 2 of 2: confirm the swap in your wallet",
    );
    expect(describeSquidDepositStage("swap-requested", { ...external, isEmbedded: true })).toBe(
      "Signing the swap with your Privy wallet…",
    );
    expect(describeSquidDepositStage("bridging", external)).toContain("about two minutes");
  });

  it("lays the deposit out as a timeline and hides the approval step it did not need", () => {
    expect(describeSquidDepositProgress("bridging", { hasApproved: false, symbol: "USDC" })).toEqual([
      { label: "Prepare the route", state: "done" },
      { label: "Confirm the swap", state: "done" },
      { label: "Source network confirms", state: "done" },
      { label: "Bridge and deposit", state: "current" },
      { label: "Balance confirmed", state: "upcoming" },
    ]);
    expect(
      describeSquidDepositProgress("approving", { hasApproved: false, symbol: "USDT" }).map(({ label, state }) => [
        label,
        state,
      ]),
    ).toEqual([
      ["Prepare the route", "done"],
      ["Approve USDT", "current"],
      ["Confirm the swap", "upcoming"],
      ["Source network confirms", "upcoming"],
      ["Bridge and deposit", "upcoming"],
      ["Balance confirmed", "upcoming"],
    ]);
  });
});
