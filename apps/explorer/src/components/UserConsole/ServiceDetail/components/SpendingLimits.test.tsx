// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import type { TransactionReceipt } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ServiceApproval } from "@/hooks/useAccountServices";
import SpendingLimits from "./SpendingLimits";

const mocks = vi.hoisted(() => ({
  approvals: undefined as ServiceApproval[] | undefined,
  isError: false,
  executeQuery: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("@/hooks/useAccountServices", () => ({
  useServiceApprovals: () => ({ data: mocks.approvals, isError: mocks.isError, isLoading: false }),
}));
vi.mock("@/hooks/useGraphQLQuery", () => ({
  useGraphQLClient: () => ({ executeQuery: mocks.executeQuery }),
}));
vi.mock("@/utils/query-invalidation", () => ({ invalidateAccountQueries: mocks.invalidate }));
vi.mock("@filecoin-foundation/ui-filecoin/Button", () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => (
    <button type='button' onClick={onClick}>
      {children}
    </button>
  ),
}));
vi.mock("./EditLimitsDialog", () => ({
  default: ({ open, onConfirmed, onOpenChange }: ComponentProps<typeof import("./EditLimitsDialog").default>) =>
    open ? (
      <div role='dialog'>
        <input aria-label='Draft limit' defaultValue='50' />
        <button
          type='button'
          onClick={() => {
            onConfirmed(receipt);
            onOpenChange(false);
          }}
        >
          Confirm update
        </button>
      </div>
    ) : null,
}));

const OWNER = "0x1111111111111111111111111111111111111111";
const OPERATOR = "0x2222222222222222222222222222222222222222";
const approval: ServiceApproval = {
  id: "0x01",
  isApproved: true,
  rateAllowance: "0",
  lockupAllowance: "50",
  maxLockupPeriod: "86400",
  token: { id: "0x3333333333333333333333333333333333333333", symbol: "USDFC", decimals: "18" },
};
const receipt: TransactionReceipt = {
  blockHash: "0x01",
  blockNumber: 42n,
  contractAddress: null,
  cumulativeGasUsed: 0n,
  effectiveGasPrice: 0n,
  from: OWNER,
  gasUsed: 0n,
  logs: [],
  logsBloom: "0x",
  status: "success",
  to: OPERATOR,
  transactionHash: "0x02",
  transactionIndex: 0,
  type: "legacy",
};

let client: QueryClient;
const view = () => (
  <QueryClientProvider client={client}>
    <SpendingLimits network='mainnet' operator={OPERATOR} userAddress={OWNER} />
  </QueryClientProvider>
);

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mocks.approvals = [approval];
  mocks.isError = false;
  mocks.executeQuery.mockReset().mockResolvedValue({ _meta: { block: { number: 41 } } });
  mocks.invalidate.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.useRealTimers();
});

describe("SpendingLimits", () => {
  it("keeps the draft and table mounted when an approvals refresh fails", () => {
    const { rerender } = render(view());
    fireEvent.click(screen.getByRole("button", { name: "Edit USDFC limits" }));
    const draft = screen.getByLabelText<HTMLInputElement>("Draft limit");
    fireEvent.change(draft, { target: { value: "20" } });

    mocks.isError = true;
    rerender(view());

    expect(screen.getByLabelText("Draft limit")).toBe(draft);
    expect(draft.value).toBe("20");
    expect(screen.getByRole("button", { name: "Edit USDFC limits" })).toBeTruthy();
  });

  it("waits beyond 30 seconds and refreshes only once the receipt's block is indexed", async () => {
    vi.useFakeTimers();
    render(view());
    fireEvent.click(screen.getByRole("button", { name: "Edit USDFC limits" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Confirm update" })));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(32_000);
    });

    expect(screen.getByRole("status").textContent).toContain("These limits refresh once it is indexed");
    expect(mocks.invalidate).not.toHaveBeenCalled();

    mocks.executeQuery.mockResolvedValue({ _meta: { block: { number: 42 } } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(mocks.invalidate).toHaveBeenCalledWith(expect.any(QueryClient), OWNER, { repeatAfterMs: [] });
    expect(screen.queryByRole("status")).toBeNull();
  });
});
