// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import useNetwork from "@/hooks/useNetwork";
import { NetworkProvider } from "./Network";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

it("renders a network-only consumer without subgraph configuration", () => {
  vi.stubEnv("NEXT_PUBLIC_SUBGRAPH_URL_MAINNET", undefined);
  vi.stubEnv("NEXT_PUBLIC_SUBGRAPH_URL_CALIBRATION", undefined);
  const { result } = renderHook(() => useNetwork().network, { wrapper: NetworkProvider });
  expect(result.current).toBe("mainnet");
});

it("validates the selected subgraph URL when a consumer reads it", () => {
  vi.stubEnv("NEXT_PUBLIC_SUBGRAPH_URL_MAINNET", undefined);
  vi.stubEnv("NEXT_PUBLIC_SUBGRAPH_URL_CALIBRATION", "https://subgraph.example/calibration");
  const { result } = renderHook(useNetwork, { wrapper: NetworkProvider });
  expect(() => result.current.subgraphUrl).toThrow("Missing environment variable: NEXT_PUBLIC_SUBGRAPH_URL_MAINNET");
  act(() => result.current.setNetwork("calibration"));
  expect(result.current.subgraphUrl).toBe("https://subgraph.example/calibration");
});
