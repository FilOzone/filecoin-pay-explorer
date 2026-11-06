// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatasetsSection } from ".";

const mockUseAccountDataSets = vi.hoisted(() => vi.fn());
const mocks = vi.hoisted(() => ({ blockNumber: undefined as bigint | undefined, execute: vi.fn() }));

vi.mock("@/hooks/useAccountDataSets", () => ({
  useAccountDataSets: () => mockUseAccountDataSets(),
}));
vi.mock("wagmi", () => ({
  useBlockNumber: () => ({ data: mocks.blockNumber }),
  useConnection: () => ({ address: undefined }),
}));
vi.mock("@/hooks/useContractTransaction", () => ({
  useContractTransaction: () => ({ execute: mocks.execute, isExecuting: false }),
}));
// The explorer URL network differs from the console's, so links must follow the prop.
vi.mock("@/hooks/useNetwork", () => ({
  default: () => ({ network: "calibration" }),
}));
// The barrel pulls in ui-filecoin navigation, which can't resolve next/navigation under vitest.
vi.mock("@/components/shared", async () => ({
  CopyableText: (await import("@/components/shared/CopyableText")).default,
  RailStateBadge: (await import("@/components/shared/RailStateBadge")).RailStateBadge,
  StyledLink: (await import("@/components/shared/StyledLink")).default,
}));
vi.mock("@filecoin-pay/ui/components/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: () => null,
}));

afterEach(cleanup);

const PROVIDER = "0x2222222222222222222222222222222222222222";

// Subgraph BigInt fields arrive as decimal strings.
const wireRow = {
  id: "0x07",
  dataSetId: "7",
  provider: PROVIDER,
  totalSize: String(2n * 1024n ** 3n),
  lastWriteAt: "1700000000",
  pdpRail: {
    paymentRate: "1000000000000",
    state: "ACTIVE",
    endEpoch: "0",
    token: { id: "0xtoken", symbol: "USDFC", decimals: "18" },
  },
};

// A new element each call: rerendering the same element object would let React skip the update.
const section = () => <DatasetsSection accountId='0x1111111111111111111111111111111111111111' network='mainnet' />;
const renderSection = () => render(section());

const activeDataSet = (dataSetId: string) => ({ ...wireRow, id: `0x0${dataSetId}`, dataSetId });

const loaded = (dataSets: unknown[]) => ({ data: { dataSets, hasMore: false }, isLoading: false, isError: false });

const rowOf = (dataSetId: string) => {
  const row = screen.getAllByRole("row").find((candidate) =>
    within(candidate)
      .queryByRole("link", { name: /PDP Explorer/ })
      ?.getAttribute("href")
      ?.endsWith(`/dataset/${dataSetId}`),
  );
  if (!row) throw new Error(`No row for dataset #${dataSetId}`);
  return row;
};

beforeEach(() => {
  mocks.blockNumber = undefined;
  mocks.execute.mockReset();
});

describe("DatasetsSection", () => {
  it("shows the empty state when the payer has no datasets", () => {
    mockUseAccountDataSets.mockReturnValue({
      data: { dataSets: [], hasMore: false },
      isLoading: false,
      isError: false,
    });

    renderSection();

    expect(screen.getByText("No data sets")).toBeTruthy();
  });

  it("shows the loading state before data arrives", () => {
    mockUseAccountDataSets.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    renderSection();

    expect(screen.getByText("Loading data sets...")).toBeTruthy();
  });

  it("shows the error state when the query fails", () => {
    mockUseAccountDataSets.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    renderSection();

    expect(screen.getByText("Failed to load data sets")).toBeTruthy();
  });

  it("renders a wire-format row with its size, spend, status and links", () => {
    mockUseAccountDataSets.mockReturnValue({
      data: { dataSets: [wireRow], hasMore: false },
      isLoading: false,
      isError: false,
    });

    renderSection();

    expect(screen.getByText("2.00 GiB")).toBeTruthy();
    expect(screen.getByText("0.087 USDFC")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByRole("link", { name: /PDP Explorer/ }).getAttribute("href")).toBe(
      "https://pdp.filecoin.cloud/mainnet/dataset/7",
    );
    expect(screen.getByTitle(PROVIDER).getAttribute("href")).toBe(`/mainnet/accounts/${PROVIDER}`);
  });

  it("offers Terminate only for datasets whose storage payment is still running", () => {
    const terminated = { ...activeDataSet("8"), pdpRail: { ...wireRow.pdpRail, state: "TERMINATED" } };
    mockUseAccountDataSets.mockReturnValue(loaded([activeDataSet("7"), terminated]));

    renderSection();

    expect(within(rowOf("7")).getByRole("button", { name: "Terminate" })).toBeTruthy();
    expect(within(rowOf("8")).queryByRole("button", { name: "Terminate" })).toBeNull();
  });

  it("keeps an open confirmation through a block update", () => {
    mocks.blockNumber = 1n;
    mockUseAccountDataSets.mockReturnValue(loaded([wireRow]));
    const { rerender } = renderSection();

    fireEvent.click(screen.getByRole("button", { name: "Terminate" }));
    expect(screen.getByRole("dialog", { name: "Terminate data set #7?" })).toBeTruthy();

    mocks.blockNumber = 2n;
    rerender(section());

    expect(screen.getByRole("dialog", { name: "Terminate data set #7?" })).toBeTruthy();
  });

  it("keeps a pending termination on its dataset when a refresh reorders the rows", () => {
    // Never settles, so the termination stays pending.
    mocks.execute.mockReturnValue(new Promise(() => {}));
    mockUseAccountDataSets.mockReturnValue(loaded([activeDataSet("7"), activeDataSet("8")]));
    const { rerender } = renderSection();

    fireEvent.click(within(rowOf("7")).getByRole("button", { name: "Terminate" }));
    fireEvent.click(screen.getByRole("button", { name: "Terminate data set" }));
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({ args: [7n, "0x"] }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    mockUseAccountDataSets.mockReturnValue(loaded([activeDataSet("8"), activeDataSet("7")]));
    rerender(section());

    expect(within(rowOf("7")).getByRole("button", { name: "Terminating…" })).toBeTruthy();
    expect(within(rowOf("8")).getByRole("button", { name: "Terminate" })).toBeTruthy();
  });
});
