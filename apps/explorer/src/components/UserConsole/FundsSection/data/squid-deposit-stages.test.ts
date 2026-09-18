import { describe, expect, it } from "vitest";
import { describeSquidDepositProgress, describeSquidDepositStage } from "./squid-deposit-stages";

const approve = { kind: "approve", index: 0, total: 2 } as const;
const route = { kind: "route", index: 1, total: 2 } as const;

describe("squid deposit stages", () => {
  it("numbers the signatures off execution's plan", () => {
    const external = { signature: null, isEmbedded: false, symbol: "USDC" };
    expect(describeSquidDepositStage("approving", { ...external, signature: approve })).toBe(
      "Step 1 of 2: approve USDC in your wallet",
    );
    expect(describeSquidDepositStage("swap-requested", { ...external, signature: route })).toBe(
      "Step 2 of 2: confirm the swap in your wallet",
    );
    expect(
      describeSquidDepositStage("swap-requested", { ...external, signature: { kind: "route", index: 0, total: 1 } }),
    ).toBe("Step 1 of 1: confirm the swap in your wallet");
    expect(describeSquidDepositStage("swap-requested", { ...external, isEmbedded: true, signature: route })).toBe(
      "Step 2 of 2: signing the swap with your Privy wallet…",
    );
    expect(describeSquidDepositStage("swap-requested", external)).toBe("Confirm the swap in your wallet");
    expect(describeSquidDepositStage("bridging", external)).toContain("about two minutes");
  });

  it("counts a reset, approve, route run as three signatures", () => {
    const external = { isEmbedded: false, symbol: "USDT" };
    expect(
      describeSquidDepositStage("approving", { ...external, signature: { kind: "reset", index: 0, total: 3 } }),
    ).toBe("Step 1 of 3: reset the USDT allowance in your wallet");
    expect(
      describeSquidDepositStage("approving", { ...external, signature: { kind: "approve", index: 1, total: 3 } }),
    ).toBe("Step 2 of 3: approve USDT in your wallet");
    expect(
      describeSquidDepositStage("swap-requested", { ...external, signature: { kind: "route", index: 2, total: 3 } }),
    ).toBe("Step 3 of 3: confirm the swap in your wallet");
    expect(
      describeSquidDepositStage("approving", {
        ...external,
        isEmbedded: true,
        signature: { kind: "reset", index: 0, total: 3 },
      }),
    ).toBe("Step 1 of 3: resetting the USDT allowance with your Privy wallet…");
  });

  it("lays the deposit out as a timeline and hides the approval step it did not need", () => {
    expect(
      describeSquidDepositProgress("bridging", { signature: { kind: "route", index: 0, total: 1 }, symbol: "USDC" }),
    ).toEqual([
      { label: "Prepare the route", state: "done" },
      { label: "Confirm the swap", state: "done" },
      { label: "Source network confirms", state: "done" },
      { label: "Bridge and deposit", state: "current" },
      { label: "Confirm balance", state: "upcoming" },
    ]);
    expect(
      describeSquidDepositProgress("approving", { signature: approve, symbol: "USDT" }).map(({ label, state }) => [
        label,
        state,
      ]),
    ).toEqual([
      ["Prepare the route", "done"],
      ["Approve USDT", "current"],
      ["Confirm the swap", "upcoming"],
      ["Source network confirms", "upcoming"],
      ["Bridge and deposit", "upcoming"],
      ["Confirm balance", "upcoming"],
    ]);
    expect(
      describeSquidDepositProgress("bridging", { signature: route, symbol: "USDC" }).map(({ label }) => label),
    ).toContain("Approve USDC");
  });
});
