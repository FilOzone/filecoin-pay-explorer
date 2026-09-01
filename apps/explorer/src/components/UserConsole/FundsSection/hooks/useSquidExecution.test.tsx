import { NATIVE_TOKEN_ADDRESS, type SourceToken, type SquidFundingPlan } from "@filecoin-project/squid-evm-funding";
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPlanNetworkGas } from "../data/guided-top-up";
import type { SquidAcquisition } from "../data/squid-acquisition";
import { useSquidExecution } from "./useSquidExecution";

const wallet = vi.hoisted(() => ({
  address: "0x1111111111111111111111111111111111111111" as const,
  chainId: 314,
}));
const switchChainAsync = vi.hoisted(() => vi.fn());
const runSquidAcquisition = vi.hoisted(() => vi.fn());
const sourcePublicClient = vi.hoisted(() => ({}));
const destinationClient = vi.hoisted(() => ({ readContract: vi.fn() }));
const sourceWalletClient = vi.hoisted(() => ({
  account: { address: "0x1111111111111111111111111111111111111111" as const },
}));

vi.mock("wagmi", () => ({
  useAccount: () => wallet,
  usePublicClient: ({ chainId }: { chainId?: number }) => (chainId === 314 ? destinationClient : sourcePublicClient),
  useSwitchChain: () => ({ isPending: false, switchChainAsync }),
  useWalletClient: () => ({ data: sourceWalletClient, isPending: false }),
}));
vi.mock("../data/squid-acquisition-flow", () => ({ runSquidAcquisition }));
vi.mock("../data/squid-acquisition-lock", () => ({
  withSquidAcquisitionLock: (_locks: unknown, _owner: string, callback: () => unknown) => callback(),
}));

const source = (chainId: number): SourceToken => ({
  chainId,
  decimals: 18,
  symbol: "TEST",
  token: "0x2222222222222222222222222222222222222222",
});

const processing: SquidAcquisition = {
  destinationAmount: 10n,
  executionStage: "preparing",
  owner: wallet.address,
  sourceChainId: 8453,
  status: "processing",
  transactionHashes: [],
};
const acquired: SquidAcquisition = { ...processing, deliveredAmount: 10n, status: "acquired" };

function plan(): SquidFundingPlan {
  return {
    maxSourceAmount: 100n,
    owner: wallet.address,
    quotes: [
      {
        actions: [],
        costs: [
          {
            amount: 10n,
            kind: "gas",
            name: "Source gas",
            token: { address: NATIVE_TOKEN_ADDRESS, chainId: 8453, decimals: 18, symbol: "ETH" },
          },
        ],
        destinationAmount: 10n,
        id: "quote",
        requirement: {
          amount: 10n,
          chainId: 314,
          id: "requirement",
          recipient: wallet.address,
          token: "0x80B98d3aa09ffff255c3ba4A241111Ff1262F045",
        },
        sourceAmount: 100n,
      },
    ],
    slippage: 1,
    source: source(8453),
  };
}

let execution!: ReturnType<typeof useSquidExecution>;
let callbacks: {
  onAcquired: (acquisition: SquidAcquisition) => void;
  onBlocked: (acquisition: SquidAcquisition) => void;
  onRejected: () => void;
  onStarted: (acquisition: SquidAcquisition) => void;
};

function Harness({
  latestAllowance = 0n,
  latestBalance = 100n,
  selectedSource = source(8453),
}: {
  latestAllowance?: bigint;
  latestBalance?: bigint;
  selectedSource?: SourceToken;
}) {
  const fundingPlan = plan();
  execution = useSquidExecution({
    integratorId: "test",
    lifecycle: {
      state: "idle",
      onAcquired: callbacks.onAcquired,
      onBlocked: callbacks.onBlocked,
      onRejected: callbacks.onRejected,
      onStarted: callbacks.onStarted,
    },
    onNetworkSwitchingChange: vi.fn(),
    route: {
      bridgeFeeMaximum: 1n,
      networkGasMaximum: getPlanNetworkGas(fundingPlan, 0n).maximum,
      plan: fundingPlan,
      requiredNativeBalance: 1n,
    },
    source: {
      isNative: false,
      refreshExecutionInputs: vi.fn().mockResolvedValue({
        allowance: latestAllowance,
        nativeBalance: 1_000n,
        sourceBalance: latestBalance,
      }),
      token: selectedSource,
    },
  });
  return execution.switchError;
}

describe("useSquidExecution", () => {
  beforeEach(() => {
    wallet.chainId = 314;
    vi.stubGlobal("window", { localStorage: {} });
    switchChainAsync.mockReset().mockRejectedValue({ code: 4001 });
    runSquidAcquisition.mockReset();
    callbacks = {
      onAcquired: vi.fn(),
      onBlocked: vi.fn(),
      onRejected: vi.fn(),
      onStarted: vi.fn(),
    };
  });

  it("clears a rejected switch error when the source-chain selection resets errors", async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<Harness />);
    });
    await act(async () => execution.switchToSourceNetwork());
    expect(renderer.toJSON()).toBe("Network switch cancelled in your wallet.");

    await act(async () => {
      renderer.update(<Harness selectedSource={source(10)} />);
    });
    await act(async () => execution.clearError());
    expect(renderer.toJSON()).toBeNull();
  });

  it("records processing and acquired transitions after a successful acquisition", async () => {
    wallet.chainId = 8453;
    runSquidAcquisition.mockImplementation(async ({ onStarted }) => {
      onStarted(processing);
      return { acquisition: acquired, status: "acquired" };
    });
    await act(async () => {
      create(<Harness />);
    });
    await act(async () => execution.acquire());

    expect(callbacks.onStarted).toHaveBeenCalledWith(processing);
    expect(callbacks.onAcquired).toHaveBeenCalledWith(acquired);
    expect(callbacks.onBlocked).not.toHaveBeenCalled();
    expect(callbacks.onRejected).not.toHaveBeenCalled();
  });

  it("records a recoverable acquisition failure as blocked", async () => {
    wallet.chainId = 8453;
    runSquidAcquisition.mockResolvedValue({
      acquisition: processing,
      error: new Error("receipt pending"),
      status: "blocked",
    });
    await act(async () => {
      create(<Harness />);
    });
    await act(async () => execution.acquire());

    expect(callbacks.onBlocked).toHaveBeenCalledWith(processing);
    expect(callbacks.onRejected).not.toHaveBeenCalled();
  });

  it("stops before execution when the allowance changed", async () => {
    wallet.chainId = 8453;
    await act(async () => {
      create(<Harness latestAllowance={100n} />);
    });
    await act(async () => execution.acquire());

    expect(runSquidAcquisition).not.toHaveBeenCalled();
    expect(execution.error).toContain("allowance changed");
  });

  it("stops before execution when the refreshed source balance is insufficient", async () => {
    wallet.chainId = 8453;
    await act(async () => {
      create(<Harness latestBalance={99n} />);
    });
    await act(async () => execution.acquire());

    expect(runSquidAcquisition).not.toHaveBeenCalled();
    expect(execution.error).toContain("balance no longer covers the quote");
  });
});
