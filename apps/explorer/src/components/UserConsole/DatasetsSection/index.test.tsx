import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DatasetsSection } from ".";

const observed = vi.hoisted(() => ({ accountId: "", page: 0 }));

const mockUseAccountDataSets = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useAccountDataSets", () => ({
  useAccountDataSets: (accountId: string, page: number) => {
    observed.accountId = accountId;
    observed.page = page;
    return mockUseAccountDataSets();
  },
}));
vi.mock("wagmi", () => ({
  useBlockNumber: () => ({ data: undefined }),
}));
vi.mock("./components", () => ({
  DatasetsEmptyState: () => <div>No datasets</div>,
  DatasetsErrorState: () => <div>Failed to load datasets</div>,
  DatasetsLoadingState: () => <div>Loading datasets</div>,
  DatasetsSectionLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DatasetsTable: () => <div>Datasets table</div>,
}));

const render = () =>
  renderToStaticMarkup(<DatasetsSection accountId='0x1111111111111111111111111111111111111111' network='mainnet' />);

describe("DatasetsSection", () => {
  it("shows the empty state when the payer has no datasets", () => {
    mockUseAccountDataSets.mockReturnValue({
      data: { dataSets: [], hasMore: false },
      isLoading: false,
      isError: false,
    });

    const markup = render();

    expect(markup).toContain("No datasets");
    expect(markup).not.toContain("Datasets table");
  });

  it("shows the loading state before data arrives", () => {
    mockUseAccountDataSets.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    expect(render()).toContain("Loading datasets");
  });

  it("shows the error state when the query fails", () => {
    mockUseAccountDataSets.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    expect(render()).toContain("Failed to load datasets");
  });

  it("renders the table once datasets come back", () => {
    mockUseAccountDataSets.mockReturnValue({
      data: { dataSets: [{ id: "0x1", dataSetId: 1n }], hasMore: false },
      isLoading: false,
      isError: false,
    });

    expect(render()).toContain("Datasets table");
  });

  it("reads the connected payer's datasets", () => {
    mockUseAccountDataSets.mockReturnValue({
      data: { dataSets: [], hasMore: false },
      isLoading: false,
      isError: false,
    });

    render();

    expect(observed.accountId).toBe("0x1111111111111111111111111111111111111111");
    expect(observed.page).toBe(1);
  });
});
