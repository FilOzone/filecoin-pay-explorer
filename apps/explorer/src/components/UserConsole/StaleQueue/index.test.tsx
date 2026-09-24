import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Network } from "@/types";
import { StaleQueue } from ".";

const mockUseStaleDataSets = vi.hoisted(() => vi.fn());
const mockUseMutedDataSets = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useStaleDataSets", () => ({
  useStaleDataSets: () => mockUseStaleDataSets(),
}));
vi.mock("@/hooks/useMutedDataSets", () => ({
  useMutedDataSets: (walletAddress: string | undefined) => mockUseMutedDataSets(walletAddress),
}));
vi.mock("@/utils/network", () => ({
  isNotificationsEligibleNetwork: (network: Network) => network === "mainnet",
}));
vi.mock("wagmi", () => ({
  useBlockNumber: () => ({ data: undefined }),
}));
vi.mock("../DatasetsSection", () => ({
  DatasetsPagination: ({ page, hasMore }: { page: number; hasMore: boolean }) => (
    <nav>
      Page {page}
      {hasMore ? " with next" : ""}
    </nav>
  ),
}));
vi.mock("./components", () => ({
  StaleQueueLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  StaleQueueErrorState: () => <div>Failed to load inactive datasets</div>,
  StaleQueueRow: ({ dataSet, canMute }: { dataSet: { id: string }; canMute: boolean }) => (
    <div>
      Row {dataSet.id}
      {canMute ? " with Keep" : ""}
    </div>
  ),
}));

const ACCOUNT = "0x1111111111111111111111111111111111111111";
const TOKEN = { id: "0xtoken", symbol: "USDFC", decimals: 18 };

const staleDataSet = (id: string, dataSetId: string, paymentRate = "10") => ({
  id,
  dataSetId,
  lastWriteAt: "0",
  pdpRail: { paymentRate, state: "ACTIVE", endEpoch: "0", token: TOKEN },
});

const loaded = (dataSets: unknown[], reachedPageLimit = false) => ({
  data: { dataSets, reachedPageLimit },
  isLoading: false,
  isError: false,
});

const render = (network: Network = "mainnet") =>
  renderToStaticMarkup(<StaleQueue accountId={ACCOUNT} network={network} />);

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_NOTIFICATIONS_API_URL", "https://notifications.test");
  mockUseMutedDataSets.mockReturnValue({ data: undefined, isLoading: false });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("StaleQueue", () => {
  it("renders nothing when nothing is stale", () => {
    mockUseStaleDataSets.mockReturnValue(loaded([]));

    expect(render()).toBe("");
  });

  it("renders nothing while the stale datasets load", () => {
    mockUseStaleDataSets.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    expect(render()).toBe("");
  });

  it("renders nothing while mutes load, so muted rows never flash in", () => {
    mockUseStaleDataSets.mockReturnValue(loaded([staleDataSet("0xa", "1")]));
    mockUseMutedDataSets.mockReturnValue({ data: undefined, isLoading: true });

    expect(render()).toBe("");
  });

  it("shows the error state when the query fails", () => {
    mockUseStaleDataSets.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    expect(render()).toContain("Failed to load inactive datasets");
  });

  it("renders rows highest spend first", () => {
    mockUseStaleDataSets.mockReturnValue(loaded([staleDataSet("0xa", "1", "1"), staleDataSet("0xb", "2", "20")]));

    const markup = render();
    expect(markup.indexOf("Row 0xb")).toBeGreaterThan(-1);
    expect(markup.indexOf("Row 0xb")).toBeLessThan(markup.indexOf("Row 0xa"));
  });

  it("excludes a muted dataset from the queue", () => {
    mockUseStaleDataSets.mockReturnValue(loaded([staleDataSet("0xa", "1"), staleDataSet("0xb", "2")]));
    mockUseMutedDataSets.mockReturnValue({ data: new Set(["1"]), isLoading: false });

    const markup = render();
    expect(markup).not.toContain("Row 0xa");
    expect(markup).toContain("Row 0xb with Keep");
  });

  it("renders nothing once every stale dataset is muted", () => {
    mockUseStaleDataSets.mockReturnValue(loaded([staleDataSet("0xa", "1")]));
    mockUseMutedDataSets.mockReturnValue({ data: new Set(["1"]), isLoading: false });

    expect(render()).toBe("");
  });

  it("shows ten rows per page and pages through the rest", () => {
    const dataSets = Array.from({ length: 12 }, (_, i) => staleDataSet(`0x${i + 1}`, String(i + 1)));
    mockUseStaleDataSets.mockReturnValue(loaded(dataSets));

    const markup = render();
    expect(markup.match(/Row 0x/g)).toHaveLength(10);
    expect(markup).not.toContain("Row 0x11");
    expect(markup).toContain("Page 1 with next");
  });

  it("hides pagination when everything fits on one page", () => {
    mockUseStaleDataSets.mockReturnValue(loaded([staleDataSet("0xa", "1")]));

    expect(render()).not.toContain("Page");
  });

  it("says when the list stopped at the load limit", () => {
    mockUseStaleDataSets.mockReturnValue(loaded([staleDataSet("0xa", "1")], true));

    expect(render()).toContain("Only 10,000 of them are ranked here.");
  });

  it("skips mutes and Keep off the notifications network", () => {
    mockUseStaleDataSets.mockReturnValue(loaded([staleDataSet("0xa", "1")]));

    const markup = render("calibration");
    expect(mockUseMutedDataSets).toHaveBeenLastCalledWith(undefined);
    expect(markup).toContain("Row 0xa");
    expect(markup).not.toContain("with Keep");
  });

  it("skips Keep when the notifications API is not configured", () => {
    vi.stubEnv("NEXT_PUBLIC_NOTIFICATIONS_API_URL", "");
    mockUseStaleDataSets.mockReturnValue(loaded([staleDataSet("0xa", "1")]));

    expect(render()).not.toContain("with Keep");
  });
});
