// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useServiceMetadata } from "./useServiceMetadata";

const multicall = vi.hoisted(() => vi.fn());
vi.mock("@/services/viem/client", () => ({ getPublicClient: () => ({ multicall }) }));

const SERVICE = "0x1111111111111111111111111111111111111111";
const EOA = "0x2222222222222222222222222222222222222222";

const ok = (result: string) => ({ status: "success", result });
const failed = { status: "failure", error: new Error("execution reverted") };

const mount = (addresses: string[]) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useServiceMetadata(addresses, "mainnet"), {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
};

afterEach(() => {
  cleanup();
  multicall.mockReset();
});

describe("useServiceMetadata", () => {
  it("keeps sanitised fields and drops empty, failed, and non-URL values", async () => {
    multicall.mockImplementation(async ({ contracts }: { contracts: Array<{ address: string }> }) =>
      contracts[0].address === SERVICE
        ? [ok("x".repeat(300)), ok(""), ok("javascript:alert(1)")]
        : [failed, failed, failed],
    );

    const { result } = mount([SERVICE.toUpperCase().replace("0X", "0x"), EOA, "not-an-address"]);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(multicall).toHaveBeenCalledTimes(2);
    expect([...result.current.metadata]).toEqual([[SERVICE, { name: "x".repeat(256) }]]);
  });

  it("keeps a plain http(s) homepage", async () => {
    multicall.mockResolvedValue([ok("Svc"), ok("Does things"), ok("https://example.com/svc")]);

    const { result } = mount([SERVICE]);
    await waitFor(() => expect(result.current.metadata.size).toBe(1));

    expect(result.current.metadata.get(SERVICE)).toEqual({
      name: "Svc",
      description: "Does things",
      homepage: "https://example.com/svc",
    });
  });

  it("collapses whitespace so a description cannot fake an address line", async () => {
    multicall.mockResolvedValue([ok("  Svc\n\tName "), ok("Legit\n0xFake"), ok(" \n ")]);

    const { result } = mount([SERVICE]);
    await waitFor(() => expect(result.current.metadata.size).toBe(1));

    expect(result.current.metadata.get(SERVICE)).toEqual({ name: "Svc Name", description: "Legit 0xFake" });
  });

  it("drops a name that is only whitespace", async () => {
    multicall.mockResolvedValue([ok("\n \t"), failed, failed]);

    const { result } = mount([SERVICE]);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.metadata.size).toBe(0);
  });

  it("rejects a homepage with whitespace tricks", async () => {
    multicall.mockResolvedValue([ok("Svc"), failed, ok("https://ok.com evil")]);

    const { result } = mount([SERVICE]);
    await waitFor(() => expect(result.current.metadata.size).toBe(1));

    expect(result.current.metadata.get(SERVICE)).toEqual({ name: "Svc" });
  });
});
