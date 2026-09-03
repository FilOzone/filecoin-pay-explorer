import { describe, expect, it } from "vitest";
import { describeProgress, describeStage } from "./stages";

describe("describeStage", () => {
  it("describes every deposit stage and numbers the approval and swap signatures", () => {
    const stages = ["preparing", "approving", "swap-requested", "swap-broadcast", "bridging", "verifying"] as const;
    const describeAll = (options: { hasApproved: boolean; isEmbedded: boolean }) =>
      Object.fromEntries(stages.map((stage) => [stage, describeStage(stage, options)]));

    expect(describeAll({ hasApproved: true, isEmbedded: false })).toEqual({
      preparing: "Preparing the route…",
      approving: "Step 1 of 2: approve USDC in your wallet",
      "swap-requested": "Step 2 of 2: confirm the swap in your wallet",
      "swap-broadcast": "Waiting for the source network to confirm…",
      bridging: "Bridging to Filecoin and depositing. This takes about two minutes.",
      verifying: "Confirming your Filecoin Pay balance…",
    });
    expect(describeAll({ hasApproved: false, isEmbedded: true })).toEqual({
      preparing: "Preparing the route…",
      approving: "Step 1 of 2: approving USDC with your Privy wallet…",
      "swap-requested": "Signing the swap with your Privy wallet…",
      "swap-broadcast": "Waiting for the source network to confirm…",
      bridging: "Bridging to Filecoin and depositing. This takes about two minutes.",
      verifying: "Confirming your Filecoin Pay balance…",
    });
    expect(describeStage("swap-requested", { hasApproved: false, isEmbedded: false })).toBe(
      "Confirm the swap in your wallet",
    );
  });
});

describe("describeProgress", () => {
  it("lists the steps in order, showing the approval only when it happened", () => {
    expect(describeProgress("bridging", { hasApproved: true })).toEqual([
      { label: "Prepare the route", state: "done" },
      { label: "Approve USDC", state: "done" },
      { label: "Confirm the swap", state: "done" },
      { label: "Source network confirms", state: "done" },
      { label: "Bridge and deposit", state: "current" },
      { label: "Balance confirmed", state: "upcoming" },
    ]);
    expect(describeProgress("swap-requested", { hasApproved: false }).map((step) => step.label)).toEqual([
      "Prepare the route",
      "Confirm the swap",
      "Source network confirms",
      "Bridge and deposit",
      "Balance confirmed",
    ]);
    expect(describeProgress("approving", { hasApproved: false })[1]).toEqual({
      label: "Approve USDC",
      state: "current",
    });
  });
});
