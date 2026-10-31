// @vitest-environment jsdom
import type { Synapse } from "@filoz/synapse-sdk";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRailSettlementAmounts } from "./useRailSettlementAmounts";

const MAINNET = 314;
const CALIBRATION = 314159;

let synapse: Synapse | null = null;
vi.mock("./useSynapse", () => ({ default: () => ({ synapse }) }));

const getSettlementAmounts = vi.fn(async () => ({ totalSettledAmount: 5n }));
const synapseOn = (chainId: number) =>
  ({ chain: { id: chainId }, payments: { getSettlementAmounts } }) as unknown as Synapse;

const mount = () => {
  const client = new QueryClient();
  return renderHook(() => useRailSettlementAmounts({ chainId: MAINNET, railId: 7n, untilEpoch: 100n, enabled: true }), {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
};

afterEach(() => {
  cleanup();
  getSettlementAmounts.mockClear();
});

describe("useRailSettlementAmounts", () => {
  it("stays idle while synapse is on another chain than the rail", () => {
    synapse = synapseOn(CALIBRATION);
    const { result } = mount();

    expect(result.current.fetchStatus).toBe("idle");
    expect(getSettlementAmounts).not.toHaveBeenCalled();
  });

  it("reads the amounts once synapse is on the rail's chain", async () => {
    synapse = synapseOn(MAINNET);
    const { result } = mount();

    await waitFor(() => expect(result.current.data).toEqual({ totalSettledAmount: 5n }));
    expect(getSettlementAmounts).toHaveBeenCalledWith({ railId: 7n, untilEpoch: 100n });
  });
});
