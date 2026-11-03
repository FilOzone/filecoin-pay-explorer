// @vitest-environment jsdom
import type { DataSet } from "@filecoin-pay/types";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getChain } from "@/constants/chains";
import { TerminateDataSet } from "./TerminateDataSet";

const PAYER = "0x1111111111111111111111111111111111111111";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  hookOptions: undefined as unknown,
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
    mocks.hookOptions = options;
    return { execute: mocks.execute, isExecuting: false };
  },
}));

afterEach(cleanup);

// Subgraph BigInt fields arrive as decimal strings.
const dataSet = { id: "0x07", dataSetId: "7" } as unknown as DataSet;

type ExecuteParams = { onConfirmed: () => void; onReverted: (error: Error) => void };

const lastExecuteCall = () => mocks.execute.mock.calls.at(-1)?.[0] as ExecuteParams;

function openAndConfirm() {
  fireEvent.click(screen.getByRole("button", { name: "Terminate" }));
  fireEvent.click(screen.getByRole("button", { name: "Terminate dataset" }));
}

describe("TerminateDataSet", () => {
  beforeEach(() => {
    mocks.execute.mockReset();
    mocks.execute.mockResolvedValue("0xhash");
  });

  it("sends the payer's terminateService for the dataset to the network's Warm Storage contract", async () => {
    render(<TerminateDataSet dataSet={dataSet} network='calibration' />);
    openAndConfirm();

    const chain = getChain("calibration");
    expect(mocks.hookOptions).toEqual({
      account: PAYER,
      contractAddress: chain.contracts.fwss.address,
      abi: chain.contracts.fwss.abi,
      chainId: chain.id,
      explorerUrl: chain.blockExplorers?.default.url,
    });
    expect(mocks.execute).toHaveBeenCalledWith({
      functionName: "terminateService",
      args: [7n],
      metadata: { type: "terminateDataSet", dataSetId: "7" },
      onConfirmed: expect.any(Function),
      onReverted: expect.any(Function),
    });
    await screen.findAllByRole("button", { name: /Terminating…/ });
  });

  it("stays pending until the receipt, then closes and stays terminated", async () => {
    render(<TerminateDataSet dataSet={dataSet} network='mainnet' />);
    openAndConfirm();

    await screen.findAllByRole("button", { name: /Terminating…/ });
    expect(screen.getAllByRole("button").every((button) => (button as HTMLButtonElement).disabled)).toBe(true);

    act(() => lastExecuteCall().onConfirmed());

    expect(screen.queryByRole("dialog")).toBeNull();
    const trigger = screen.getByRole("button", { name: "Terminated" }) as HTMLButtonElement;
    expect(trigger.disabled).toBe(true);
  });

  it("can be retried after the transaction reverts", async () => {
    render(<TerminateDataSet dataSet={dataSet} network='mainnet' />);
    openAndConfirm();
    await screen.findAllByRole("button", { name: /Terminating…/ });

    act(() => lastExecuteCall().onReverted(new Error("reverted")));

    expect((screen.getByRole("button", { name: "Terminate dataset" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("can be retried after the wallet rejects", async () => {
    mocks.execute.mockRejectedValue(new Error("User rejected the request."));
    render(<TerminateDataSet dataSet={dataSet} network='mainnet' />);
    openAndConfirm();

    const confirm = (await screen.findByRole("button", { name: "Terminate dataset" })) as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Terminate" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
