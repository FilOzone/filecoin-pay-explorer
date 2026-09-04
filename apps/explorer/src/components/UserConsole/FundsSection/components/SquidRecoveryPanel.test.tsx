import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import type { DepositingSquidAcquisition, ProcessingSquidAcquisition } from "../data/squid-acquisition";
import { SquidRecoveryPanel } from "./SquidRecoveryPanel";

vi.mock("@filecoin-foundation/ui-filecoin/Button", () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button type='button'>{children}</button>,
}));

const processing: ProcessingSquidAcquisition = {
  destinationAmount: 10n,
  executionStage: "swap-requested",
  owner: "0x1111111111111111111111111111111111111111",
  sourceChainId: 8453,
  status: "processing",
  transactionHashes: [],
};
const depositing: DepositingSquidAcquisition = {
  ...processing,
  executionStage: undefined,
  status: "depositing",
};

function buttonLabels(renderer: ReturnType<typeof create>) {
  return renderer.root.findAllByType("button").map((button) => button.children.join(""));
}

describe("SquidRecoveryPanel", () => {
  it("renders only the actions valid for each recovery state", async () => {
    let manual!: ReturnType<typeof create>;
    await act(async () => {
      manual = create(
        <SquidRecoveryPanel
          onClear={vi.fn()}
          onContinue={vi.fn()}
          state={{ acquisition: processing, coordinationError: null, kind: "manual-verification" }}
        />,
      );
    });
    expect(buttonLabels(manual)).toEqual(["USDFC arrived, continue to deposit", "USDFC did not arrive, clear"]);

    let automatic!: ReturnType<typeof create>;
    await act(async () => {
      automatic = create(
        <SquidRecoveryPanel
          onClear={vi.fn()}
          onRetryAutomatic={vi.fn()}
          state={{ acquisition: processing, kind: "automatic-retryable-error", message: "RPC unavailable" }}
        />,
      );
    });
    expect(buttonLabels(automatic)).toEqual(["Retry automatic check now", "USDFC did not arrive, clear"]);

    let deposit!: ReturnType<typeof create>;
    await act(async () => {
      deposit = create(
        <SquidRecoveryPanel
          onClear={vi.fn()}
          onRetryDeposit={vi.fn()}
          state={{ acquisition: depositing, kind: "deposit-recovery" }}
        />,
      );
    });
    expect(buttonLabels(deposit)).toEqual(["Deposit failed, retry", "Deposit completed, clear"]);
  });
});
