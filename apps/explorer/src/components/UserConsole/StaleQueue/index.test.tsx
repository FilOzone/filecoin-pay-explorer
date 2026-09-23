import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { StaleQueue } from ".";

const mockUseStaleDataSets = vi.hoisted(() => vi.fn());
const mockUseMutedDataSets = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useStaleDataSets", () => ({
  useStaleDataSets: () => mockUseStaleDataSets(),
}));
vi.mock("@/hooks/useMutedDataSets", () => ({
  useMutedDataSets: () => mockUseMutedDataSets(),
}));
vi.mock("wagmi", () => ({
  useBlockNumber: () => ({ data: undefined }),
}));
vi.mock("./components", () => ({
  StaleQueueLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  StaleQueueLoadingState: () => <div>Checking for inactive datasets</div>,
  StaleQueueErrorState: () => <div>Failed to load inactive datasets</div>,
  StaleQueueRow: ({ dataSet }: { dataSet: { id: string } }) => <div>Row {dataSet.id}</div>,
}));

const ACCOUNT = "0x1111111111111111111111111111111111111111";
const TOKEN = { id: "0xtoken", symbol: "USDFC", decimals: 18 };
const ACTIVE_RAIL = { paymentRate: "10", state: "ACTIVE", endEpoch: "0", token: TOKEN };

const staleDataSet = (id: string, dataSetId: string) => ({
  id,
  dataSetId,
  lastWriteAt: "0",
  pdpRail: ACTIVE_RAIL,
});

const render = () => renderToStaticMarkup(<StaleQueue accountId={ACCOUNT} network='mainnet' />);

describe("StaleQueue", () => {
  it("renders nothing when nothing is stale", () => {
    mockUseStaleDataSets.mockReturnValue({ data: [], isLoading: false, isError: false });
    mockUseMutedDataSets.mockReturnValue({ data: undefined });

    expect(render()).toBe("");
  });

  it("shows the loading state before data arrives", () => {
    mockUseStaleDataSets.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    mockUseMutedDataSets.mockReturnValue({ data: undefined });

    expect(render()).toContain("Checking for inactive datasets");
  });

  it("shows the error state when the query fails", () => {
    mockUseStaleDataSets.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    mockUseMutedDataSets.mockReturnValue({ data: undefined });

    expect(render()).toContain("Failed to load inactive datasets");
  });

  it("renders a row for each stale, unmuted dataset", () => {
    mockUseStaleDataSets.mockReturnValue({
      data: [staleDataSet("0xa", "1"), staleDataSet("0xb", "2")],
      isLoading: false,
      isError: false,
    });
    mockUseMutedDataSets.mockReturnValue({ data: undefined });

    const markup = render();
    expect(markup).toContain("Row 0xa");
    expect(markup).toContain("Row 0xb");
  });

  it("excludes a muted dataset from the queue", () => {
    mockUseStaleDataSets.mockReturnValue({
      data: [staleDataSet("0xa", "1"), staleDataSet("0xb", "2")],
      isLoading: false,
      isError: false,
    });
    mockUseMutedDataSets.mockReturnValue({ data: new Set(["1"]) });

    const markup = render();
    expect(markup).not.toContain("Row 0xa");
    expect(markup).toContain("Row 0xb");
  });

  it("renders nothing once every stale dataset is muted", () => {
    mockUseStaleDataSets.mockReturnValue({
      data: [staleDataSet("0xa", "1")],
      isLoading: false,
      isError: false,
    });
    mockUseMutedDataSets.mockReturnValue({ data: new Set(["1"]) });

    expect(render()).toBe("");
  });
});
