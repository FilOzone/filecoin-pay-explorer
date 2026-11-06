// @vitest-environment jsdom
import { fwss } from "@filoz/synapse-core/abis";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getChain } from "@/constants/chains";
import type { Network } from "@/types";
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

let queryClient: QueryClient;

const renderButton = (dataSetId = 7n, network: Network = "mainnet") =>
  render(
    <QueryClientProvider client={queryClient}>
      <TerminateDataSet dataSetId={dataSetId} network={network} />
    </QueryClientProvider>,
  );

// The mutation starts `execute` a tick after the click.
const executeCall = async () => {
  await waitFor(() => expect(mocks.execute).toHaveBeenCalled());
  const call = mocks.execute.mock.calls.at(-1);
  if (!call) throw new Error("execute was not called");
  return call[0];
};

function openAndConfirm(container: HTMLElement = document.body) {
  fireEvent.click(within(container).getByRole("button", { name: "Terminate" }));
  fireEvent.click(within(container).getByRole("button", { name: "Terminate data set" }));
}

describe("TerminateDataSet", () => {
  beforeEach(() => {
    queryClient = new QueryClient();
    mocks.execute.mockReset();
    mocks.execute.mockResolvedValue("0xhash");
  });

  it("sends the payer's terminateService for the dataset to the network's Warm Storage contract", async () => {
    renderButton(7n, "calibration");
    openAndConfirm();

    const chain = getChain("calibration");
    expect(mocks.useContractTransaction).toHaveBeenLastCalledWith({
      account: PAYER,
      contractAddress: chain.contracts.fwss.address,
      abi: fwss,
      chainId: chain.id,
      explorerUrl: chain.blockExplorers?.default.url,
    });
    expect(await executeCall()).toEqual({
      functionName: "terminateService",
      args: [7n, "0x"],
      metadata: { type: "terminateDataSet", dataSetId: "7" },
      onConfirmed: expect.any(Function),
      onReverted: expect.any(Function),
    });
    await screen.findAllByRole("button", { name: /Terminating…/ });
  });

  it("stays pending until the receipt, then closes and stays terminated", async () => {
    renderButton();
    openAndConfirm();

    await screen.findAllByRole("button", { name: /Terminating…/ });
    for (const button of screen.getAllByRole("button")) expect(button).toHaveProperty("disabled", true);

    const { onConfirmed } = await executeCall();
    act(() => onConfirmed());

    expect(await screen.findByRole("button", { name: "Terminated" })).toHaveProperty("disabled", true);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("marks every button for the data set, and no other data set or network", async () => {
    const opened = renderButton();
    const sameDataSet = renderButton();
    const otherDataSet = renderButton(8n);
    const otherNetwork = renderButton(7n, "calibration");

    openAndConfirm(opened.container);

    expect(await within(sameDataSet.container).findByRole("button", { name: "Terminating…" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(within(otherDataSet.container).getByRole("button", { name: "Terminate" })).toHaveProperty("disabled", false);
    expect(within(otherNetwork.container).getByRole("button", { name: "Terminate" })).toHaveProperty("disabled", false);

    const { onConfirmed } = await executeCall();
    act(() => onConfirmed());

    expect(await within(sameDataSet.container).findByRole("button", { name: "Terminated" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("keeps the termination's state when its row unmounts before the receipt", async () => {
    const { unmount } = renderButton();
    openAndConfirm();
    await screen.findAllByRole("button", { name: /Terminating…/ });
    const { onConfirmed } = await executeCall();
    unmount();

    renderButton();
    expect(await screen.findByRole("button", { name: "Terminating…" })).toHaveProperty("disabled", true);
    cleanup();

    act(() => onConfirmed());
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));

    renderButton();
    expect(screen.getByRole("button", { name: "Terminated" })).toHaveProperty("disabled", true);
  });

  it("can be retried after the transaction reverts", async () => {
    renderButton();
    openAndConfirm();
    await screen.findAllByRole("button", { name: /Terminating…/ });

    const { onReverted } = await executeCall();
    act(() => onReverted(new Error("reverted")));

    expect(await screen.findByRole("button", { name: "Terminate data set" })).toHaveProperty("disabled", false);

    fireEvent.click(screen.getByRole("button", { name: "Terminate data set" }));
    await screen.findAllByRole("button", { name: /Terminating…/ });
    expect(mocks.execute).toHaveBeenCalledTimes(2);
  });

  it("can be retried after the wallet rejects", async () => {
    mocks.execute.mockRejectedValue(new Error("User rejected the request."));
    renderButton();
    openAndConfirm();

    await executeCall();
    expect(await screen.findByRole("button", { name: "Terminate" })).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: "Terminate data set" })).toHaveProperty("disabled", false);
  });
});
