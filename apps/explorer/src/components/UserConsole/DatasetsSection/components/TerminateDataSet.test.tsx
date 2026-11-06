// @vitest-environment jsdom
import { fwss } from "@filoz/synapse-core/abis";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getChain } from "@/constants/chains";
import { TerminateDataSet } from "./TerminateDataSet";

const PAYER = "0x1111111111111111111111111111111111111111";

type ExecuteParams = { onConfirmed: () => void; onReverted: (error: Error) => void };

const mocks = vi.hoisted(() => ({
  execute: vi.fn<(params: ExecuteParams) => Promise<string>>(),
  useContractTransaction: vi.fn(),
}));

vi.mock("@filecoin-pay/ui/components/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div role='dialog'>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => children,
  DialogDescription: ({ children }: { children: React.ReactNode }) => children,
  DialogFooter: ({ children }: { children: React.ReactNode }) => children,
  DialogHeader: ({ children }: { children: React.ReactNode }) => children,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));
vi.mock("wagmi", () => ({
  useConnection: () => ({ address: PAYER }),
}));
vi.mock("@/hooks/useContractTransaction", () => ({
  useContractTransaction: (options: unknown) => {
    mocks.useContractTransaction(options);
    return { execute: mocks.execute, isExecuting: false };
  },
}));

afterEach(cleanup);

const lastExecuteCall = () => {
  const call = mocks.execute.mock.calls.at(-1);
  if (!call) throw new Error("execute was not called");
  return call[0];
};

function openAndConfirm() {
  fireEvent.click(screen.getByRole("button", { name: "Terminate" }));
  fireEvent.click(screen.getByRole("button", { name: "Terminate data set" }));
}

describe("TerminateDataSet", () => {
  beforeEach(() => {
    mocks.execute.mockReset();
    mocks.execute.mockResolvedValue("0xhash");
  });

  it("sends the payer's terminateService for the dataset to the network's Warm Storage contract", async () => {
    render(<TerminateDataSet dataSetId={7n} network='calibration' />);
    openAndConfirm();

    const chain = getChain("calibration");
    expect(mocks.useContractTransaction).toHaveBeenLastCalledWith({
      account: PAYER,
      contractAddress: chain.contracts.fwss.address,
      abi: fwss,
      chainId: chain.id,
      explorerUrl: chain.blockExplorers?.default.url,
    });
    expect(mocks.execute).toHaveBeenCalledWith({
      functionName: "terminateService",
      args: [7n, "0x"],
      metadata: { type: "terminateDataSet", dataSetId: "7" },
      onConfirmed: expect.any(Function),
      onReverted: expect.any(Function),
    });
    await screen.findAllByRole("button", { name: /Terminating…/ });
  });

  it("stays pending until the receipt, then closes and stays terminated", async () => {
    render(<TerminateDataSet dataSetId={7n} network='mainnet' />);
    openAndConfirm();

    await screen.findAllByRole("button", { name: /Terminating…/ });
    for (const button of screen.getAllByRole("button")) expect(button).toHaveProperty("disabled", true);

    act(() => lastExecuteCall().onConfirmed());

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Terminated" })).toHaveProperty("disabled", true);
  });

  it("can be retried after the transaction reverts", async () => {
    render(<TerminateDataSet dataSetId={7n} network='mainnet' />);
    openAndConfirm();
    await screen.findAllByRole("button", { name: /Terminating…/ });

    act(() => lastExecuteCall().onReverted(new Error("reverted")));

    expect(screen.getByRole("button", { name: "Terminate data set" })).toHaveProperty("disabled", false);
  });

  it("can be retried after the wallet rejects", async () => {
    mocks.execute.mockRejectedValue(new Error("User rejected the request."));
    render(<TerminateDataSet dataSetId={7n} network='mainnet' />);
    openAndConfirm();

    expect(await screen.findByRole("button", { name: "Terminate data set" })).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: "Terminate" })).toHaveProperty("disabled", false);
  });
});
