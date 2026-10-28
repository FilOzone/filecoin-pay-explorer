// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DatasetsSection } from ".";

const mockUseAccountDataSets = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useAccountDataSets", () => ({
  useAccountDataSets: () => mockUseAccountDataSets(),
}));
vi.mock("wagmi", () => ({
  useBlockNumber: () => ({ data: undefined }),
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

const renderSection = () =>
  render(<DatasetsSection accountId='0x1111111111111111111111111111111111111111' network='mainnet' />);

describe("DatasetsSection", () => {
  it("shows the empty state when the payer has no datasets", () => {
    mockUseAccountDataSets.mockReturnValue({
      data: { dataSets: [], hasMore: false },
      isLoading: false,
      isError: false,
    });

    renderSection();

    expect(screen.getByText("No datasets")).toBeTruthy();
  });

  it("shows the loading state before data arrives", () => {
    mockUseAccountDataSets.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    renderSection();

    expect(screen.getByText("Loading datasets...")).toBeTruthy();
  });

  it("shows the error state when the query fails", () => {
    mockUseAccountDataSets.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    renderSection();

    expect(screen.getByText("Failed to load datasets")).toBeTruthy();
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
});
