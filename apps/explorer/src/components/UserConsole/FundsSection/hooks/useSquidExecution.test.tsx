import type { SourceToken } from "@filecoin-project/squid-evm-funding";
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSquidExecution } from "./useSquidExecution";

const wallet = vi.hoisted(() => ({
  address: "0x1111111111111111111111111111111111111111" as const,
  chainId: 314,
}));
const switchChainAsync = vi.hoisted(() => vi.fn());

vi.mock("wagmi", () => ({
  useAccount: () => wallet,
  usePublicClient: () => undefined,
  useSwitchChain: () => ({ isPending: false, switchChainAsync }),
  useWalletClient: () => ({ data: undefined, isPending: false }),
}));

const source = (chainId: number): SourceToken => ({
  chainId,
  decimals: 18,
  symbol: "TEST",
  token: "0x2222222222222222222222222222222222222222",
});

let execution!: ReturnType<typeof useSquidExecution>;

function Harness({ selectedSource }: { selectedSource: SourceToken }) {
  execution = useSquidExecution({
    acquisitionState: "idle",
    bridgeFeeMaximum: 1n,
    integratorId: "test",
    isNativeSource: false,
    networkGasMaximum: 1n,
    onAcquired: vi.fn(),
    onAcquisitionStateChange: vi.fn(),
    onBlocked: vi.fn(),
    onNetworkSwitchingChange: vi.fn(),
    refetchNativeBalance: vi.fn(),
    refetchSourceAllowance: vi.fn(),
    refetchSourceBalance: vi.fn(),
    requiredNativeBalance: 1n,
    source: selectedSource,
  });
  return execution.switchError;
}

describe("useSquidExecution error reset", () => {
  beforeEach(() => {
    switchChainAsync.mockRejectedValue({ code: 4001 });
  });

  it("clears a rejected switch error when the source-chain selection resets errors", async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<Harness selectedSource={source(8453)} />);
    });
    await act(async () => execution.switchToSourceNetwork());
    expect(renderer.toJSON()).toBe("Network switch cancelled in your wallet.");

    await act(async () => {
      renderer.update(<Harness selectedSource={source(10)} />);
    });
    await act(async () => execution.clearError());
    expect(renderer.toJSON()).toBeNull();
  });
});
