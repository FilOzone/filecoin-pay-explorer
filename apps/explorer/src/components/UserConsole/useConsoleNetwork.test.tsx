// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useConsoleNetwork } from "./useConsoleNetwork";

const wallet = vi.hoisted(() => ({ chainId: undefined as number | undefined }));
const topUp = vi.hoisted(() => ({ isTopUpActive: false }));

vi.mock("wagmi", () => ({ useConnection: () => wallet }));
vi.mock("@/components/UserConsole/providers/TopUpActivityContext", () => ({ useTopUpActivity: () => topUp }));
// A calibration fallback proves the top-up network comes from the rule, not from a mainnet default.
vi.mock("@/utils/constants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/constants")>()),
  DEFAULT_NETWORK: "calibration",
}));

beforeEach(() => {
  wallet.chainId = undefined;
  topUp.isTopUpActive = false;
});
afterEach(cleanup);

it("follows a Filecoin wallet chain", () => {
  wallet.chainId = 314;
  expect(renderHook(useConsoleNetwork).result.current).toEqual({
    network: "mainnet",
    isFilecoinChain: true,
    isSquidSourceChain: false,
  });
});

it("shows mainnet while a top-up holds the wallet on a Squid source chain", () => {
  wallet.chainId = 8453;
  topUp.isTopUpActive = true;
  expect(renderHook(useConsoleNetwork).result.current).toEqual({
    network: "mainnet",
    isFilecoinChain: false,
    isSquidSourceChain: true,
  });
});

it("keeps the top-up rule to Squid source chains", () => {
  wallet.chainId = 12345;
  topUp.isTopUpActive = true;
  expect(renderHook(useConsoleNetwork).result.current).toEqual({
    network: "calibration",
    isFilecoinChain: false,
    isSquidSourceChain: false,
  });
});
