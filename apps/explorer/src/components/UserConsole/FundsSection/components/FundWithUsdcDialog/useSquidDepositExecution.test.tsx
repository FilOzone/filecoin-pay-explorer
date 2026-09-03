import type { ConnectedWallet } from "@privy-io/react-auth";
import { act, create } from "react-test-renderer";
import type { Hash } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SQUID_SOURCE_CHAINS } from "@/constants/chains";
import { formatUsdfcAmount } from "../../data/funding-runway";
import { SquidDepositError } from "../../data/squid-deposit-execution";
import { getPendingSquidDepositKey, savePendingSquidDeposit } from "../../data/squid-deposit-tracker";
import { type ConfirmDepositInput, useSquidDepositExecution } from "./useSquidDepositExecution";

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const RECIPIENT = "0x2222222222222222222222222222222222222222" as const;
const USDC = "0x3333333333333333333333333333333333333333" as const;
const PAYMENTS = "0x5555555555555555555555555555555555555555" as const;
const USDFC = "0x4444444444444444444444444444444444444444" as const;
const ROUTE_HASH = `0x${"b".repeat(64)}` as Hash;
const DEPOSITED = 92n * 10n ** 18n;

const fns = vi.hoisted(() => ({
  awaitSettlement: vi.fn(),
  execute: vi.fn(),
  invalidate: vi.fn(async () => undefined),
  requestReview: vi.fn(async () => true),
  requestRoute: vi.fn(),
}));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock("sonner", () => ({ toast }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => "query-client" }));
vi.mock("../../data/guided-top-up", () => ({ invalidateTopUpQueries: fns.invalidate }));
vi.mock("../../data/squid-deposit-execution", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../data/squid-deposit-execution")>()),
  awaitSquidDepositSettlement: fns.awaitSettlement,
  executeSquidDeposit: fns.execute,
}));
vi.mock("../../data/squid-deposit-route", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../data/squid-deposit-route")>()),
  requestSquidDepositRoute: fns.requestRoute,
}));

const items = new Map<string, string>();
const storage = {
  getItem: (key: string) => items.get(key) ?? null,
  removeItem: (key: string) => void items.delete(key),
  setItem: (key: string, value: string) => void items.set(key, value),
};

const switchChain = vi.fn(async (_chainId: number) => undefined);
const wallet = {
  address: OWNER,
  walletClientType: "metamask",
  switchChain,
  getEthereumProvider: vi.fn(async () => ({ request: vi.fn() })),
} as unknown as ConnectedWallet;
const quote = {
  quoteId: "quote-1",
  sourceChainId: 8453,
  sourceAmount: 100_000_000n,
  destinationAmount: 93n * 10n ** 18n,
  minimumDestinationAmount: DEPOSITED,
  fees: [],
  gasCosts: [],
};
const executable = { ...quote, transaction: { target: OWNER, data: "0x", value: 0n, gasLimit: 1n } };
const base = SQUID_SOURCE_CHAINS.find((chain) => chain.id === 8453) as ConfirmDepositInput["sourceChain"];
const confirmInput: ConfirmDepositInput = {
  amount: "100",
  parsedAmount: 100_000_000n,
  payingWallet: wallet,
  quote,
  recipient: RECIPIENT,
  sourceChain: base,
  sourceToken: { chainId: 8453, token: USDC, symbol: "USDC", decimals: 6 },
};
const result = { transactionHash: ROUTE_HASH, fundsBefore: 5n, fundsAfter: 5n + DEPOSITED, depositedAmount: DEPOSITED };

type HookProps = Parameters<typeof useSquidDepositExecution>[0];
let latest!: ReturnType<typeof useSquidDepositExecution>;
function Harness(props: HookProps) {
  latest = useSquidDepositExecution(props);
  return null;
}
const onClosed = vi.fn();
const baseProps = (): HookProps => ({
  accountId: "account-1",
  depositTarget: { payments: PAYMENTS, usdfc: USDFC },
  destinationClient: {} as never,
  isEmbedded: false,
  onClosed,
  open: true,
  recipient: RECIPIENT,
  requestReview: fns.requestReview as never,
  sourceClient: {} as never,
  squid: { integratorId: "id" },
});

async function render(props: HookProps = baseProps()) {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<Harness {...props} />);
  });
  return renderer;
}

beforeEach(() => {
  items.clear();
  vi.stubGlobal("window", { dispatchEvent: vi.fn(), localStorage: storage });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useSquidDepositExecution", () => {
  it("confirms a deposit: executable route, pending record while broadcast, then finish and close", async () => {
    fns.requestRoute.mockResolvedValue(executable);
    fns.execute.mockImplementation(async ({ onBroadcast, onStage }) => {
      onStage?.("approving");
      onStage?.("swap-requested");
      onBroadcast?.({ transactionHash: ROUTE_HASH, fundsBefore: 5n });
      expect(items.get(getPendingSquidDepositKey(RECIPIENT))).toContain(ROUTE_HASH);
      onStage?.("swap-broadcast", ROUTE_HASH);
      return result;
    });
    await render();

    await act(async () => latest.confirm(confirmInput));

    expect(switchChain).toHaveBeenCalledWith(8453);
    expect(fns.requestRoute).toHaveBeenCalledWith(
      {
        payments: PAYMENTS,
        usdfc: USDFC,
        owner: OWNER,
        recipient: RECIPIENT,
        sourceChainId: 8453,
        sourceToken: USDC,
        sourceAmount: 100_000_000n,
      },
      { integratorId: "id" },
      { quoteOnly: false },
    );
    expect(fns.requestReview).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith(`Deposited ${formatUsdfcAmount(DEPOSITED)} USDFC into Filecoin Pay`);
    expect(fns.invalidate).toHaveBeenCalledWith("query-client", "account-1", RECIPIENT);
    expect(onClosed).toHaveBeenCalledOnce();
    expect(items.size).toBe(0);
    expect({
      stage: latest.stage,
      pending: latest.pendingDeposit,
      error: latest.error,
      approved: latest.hasApproved,
    }).toEqual({
      stage: null,
      pending: null,
      error: null,
      approved: true,
    });
  });

  it("asks an embedded wallet to review first and switches it back to Filecoin on close", async () => {
    fns.requestRoute.mockResolvedValue(executable);
    fns.execute.mockResolvedValue(result);
    await render({ ...baseProps(), isEmbedded: true });

    await act(async () => latest.confirm(confirmInput));

    expect(fns.requestReview).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Fund with 100 USDC",
        rows: expect.arrayContaining([{ label: "Network", value: "Base" }]),
      }),
    );
    expect(switchChain.mock.calls.map(([chainId]) => chainId)).toEqual([8453, 314]);
  });

  it("stops when the embedded wallet declines the review", async () => {
    fns.requestReview.mockResolvedValueOnce(false);
    await render({ ...baseProps(), isEmbedded: true });
    await act(async () => latest.confirm(confirmInput));
    expect(fns.requestRoute).not.toHaveBeenCalled();
    expect(latest.stage).toBeNull();
  });

  it("clears a failed deposit but keeps a timed-out one for resume", async () => {
    fns.requestRoute.mockResolvedValue(executable);
    fns.execute.mockImplementation(async ({ onBroadcast }) => {
      onBroadcast?.({ transactionHash: ROUTE_HASH, fundsBefore: 5n });
      throw new SquidDepositError("Squid could not complete the route.", "failed", ROUTE_HASH);
    });
    await render();
    await act(async () => latest.confirm(confirmInput));
    expect({ error: latest.error, pending: latest.pendingDeposit, stored: items.size }).toEqual({
      error: "Squid could not complete the route.",
      pending: null,
      stored: 0,
    });

    fns.execute.mockImplementation(async ({ onBroadcast }) => {
      onBroadcast?.({ transactionHash: ROUTE_HASH, fundsBefore: 5n });
      throw new SquidDepositError("Squid has not confirmed the route yet.", "timeout", ROUTE_HASH);
    });
    await act(async () => latest.confirm(confirmInput));
    expect(latest.error).toBe("Squid has not confirmed the route yet.");
    expect(latest.pendingDeposit?.transactionHash).toBe(ROUTE_HASH);
    expect(items.has(getPendingSquidDepositKey(RECIPIENT))).toBe(true);
  });

  it("resumes a stored deposit when opened and finishes it", async () => {
    savePendingSquidDeposit(storage, {
      recipient: RECIPIENT,
      owner: OWNER,
      sourceChainId: 8453,
      quoteId: "quote-1",
      transactionHash: ROUTE_HASH,
      sourceAmount: 100_000_000n,
      minimumDestinationAmount: DEPOSITED,
      fundsBefore: 5n,
      startedAt: 1,
    });
    fns.awaitSettlement.mockResolvedValue(result);

    await render();
    await act(async () => undefined);

    expect(fns.awaitSettlement).toHaveBeenCalledWith(
      expect.objectContaining({
        fundsBefore: 5n,
        quoteId: "quote-1",
        sourceChainId: 8453,
        target: { payments: PAYMENTS, usdfc: USDFC, recipient: RECIPIENT },
        transactionHash: ROUTE_HASH,
      }),
    );
    expect(toast.success).toHaveBeenCalledOnce();
    expect(onClosed).toHaveBeenCalledOnce();
    expect(items.size).toBe(0);
  });

  it("dismisses a stored deposit on request", async () => {
    savePendingSquidDeposit(storage, {
      recipient: RECIPIENT,
      owner: OWNER,
      sourceChainId: 8453,
      quoteId: "quote-1",
      transactionHash: ROUTE_HASH,
      sourceAmount: 100_000_000n,
      minimumDestinationAmount: DEPOSITED,
      fundsBefore: 5n,
      startedAt: 1,
    });
    fns.awaitSettlement.mockImplementation(() => new Promise(() => undefined));
    await render();

    expect(items.size).toBe(1);
    act(() => latest.dismissPendingDeposit());
    expect({ stored: items.size, pending: latest.pendingDeposit }).toEqual({ stored: 0, pending: null });
  });
});
