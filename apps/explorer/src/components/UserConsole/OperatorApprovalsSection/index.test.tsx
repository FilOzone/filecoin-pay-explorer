// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OperatorApprovalsSection } from ".";

const query = vi.hoisted(() => ({
  data: undefined as { pages: Array<{ operatorApprovals: unknown[] }> } | undefined,
  isLoading: false,
  isError: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: vi.fn(),
}));

vi.mock("@filecoin-foundation/ui-filecoin/Button", () => ({
  Button: ({ children, variant: _variant, ...props }: React.ComponentProps<"button"> & { variant?: string }) => (
    <button type='button' {...props}>
      {children}
    </button>
  ),
}));
vi.mock("@/hooks/useAccountDetails", () => ({ useInfiniteAccountApprovals: () => query }));
vi.mock("@/components/UserConsole/AddServiceDialog", () => ({
  default: ({ open }: { open: boolean }) => <div data-testid='add-service-dialog' data-open={String(open)} />,
}));
vi.mock("@/components/UserConsole/IncreaseApprovalDialog", () => ({
  IncreaseApprovalDialog: ({ approval, open }: { approval: { id: string }; open: boolean }) => (
    <div data-testid='increase-dialog' data-approval={approval.id} data-open={String(open)} />
  ),
}));
const AddServiceButton = ({ onApprove }: { onApprove: () => void }) => (
  <button type='button' onClick={onApprove}>
    Add Service
  </button>
);

vi.mock("./components", () => ({
  ApprovalsLoadingState: ({ onApprove }: { onApprove: () => void }) => <AddServiceButton onApprove={onApprove} />,
  ApprovalsErrorState: ({ onApprove }: { onApprove: () => void }) => <AddServiceButton onApprove={onApprove} />,
  ApprovalsEmptyState: ({ onApprove }: { onApprove: () => void }) => <AddServiceButton onApprove={onApprove} />,
  ApprovalsTable: ({ data }: { data: { id: string; onIncrease: (approval: { id: string }) => void }[] }) => (
    <ul>
      {data.map((approval) => (
        <li key={approval.id}>
          <button type='button' onClick={() => approval.onIncrease(approval)}>
            Increase {approval.id}
          </button>
        </li>
      ))}
    </ul>
  ),
}));

const account = { id: "0x1111111111111111111111111111111111111111" } as never;
const otherAccount = { id: "0x2222222222222222222222222222222222222222" } as never;

const dialogOpen = () => screen.getByTestId("add-service-dialog").dataset.open;

afterEach(cleanup);

describe("OperatorApprovalsSection Add Service", () => {
  beforeEach(() => {
    query.data = undefined;
    query.isLoading = false;
    query.isError = false;
    query.hasNextPage = false;
  });

  it.each([
    ["loading", { isLoading: true }],
    ["error", { isError: true }],
    ["empty", { data: { pages: [{ operatorApprovals: [] }] } }],
    ["populated", { data: { pages: [{ operatorApprovals: [{ id: "1" }] }] } }],
  ])("opens the dialog from the %s state", (_name, state) => {
    Object.assign(query, state);
    render(<OperatorApprovalsSection account={account} network='mainnet' />);
    expect(dialogOpen()).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Add Service" }));
    expect(dialogOpen()).toBe("true");
  });
});

describe("OperatorApprovalsSection Increase", () => {
  beforeEach(() => {
    query.data = { pages: [{ operatorApprovals: [{ id: "mainnet-approval" }] }] };
    query.isLoading = false;
    query.isError = false;
    query.hasNextPage = false;
  });

  it.each([
    ["network", { account, network: "calibration" as const }],
    ["account", { account: otherAccount, network: "mainnet" as const }],
  ])("drops the open form when the %s changes", (_name, next) => {
    const { rerender } = render(<OperatorApprovalsSection account={account} network='mainnet' />);
    fireEvent.click(screen.getByRole("button", { name: "Increase mainnet-approval" }));
    expect(screen.getByTestId("increase-dialog").dataset).toMatchObject({ approval: "mainnet-approval", open: "true" });

    // Cached empty approvals render straight away, without a loading state in between.
    query.data = { pages: [{ operatorApprovals: [] }] };
    rerender(<OperatorApprovalsSection account={next.account} network={next.network} />);
    expect(screen.queryByTestId("increase-dialog")).toBeNull();

    // Switching back must not bring the old form back.
    query.data = { pages: [{ operatorApprovals: [{ id: "mainnet-approval" }] }] };
    rerender(<OperatorApprovalsSection account={account} network='mainnet' />);
    expect(screen.queryByTestId("increase-dialog")).toBeNull();
  });
});

describe("OperatorApprovalsSection paging", () => {
  beforeEach(() => {
    query.isLoading = false;
    query.isError = false;
    query.fetchNextPage.mockReset();
  });

  it("lists approvals from every loaded page and loads the next one on request", () => {
    query.data = { pages: [{ operatorApprovals: [{ id: "1" }, { id: "2" }] }, { operatorApprovals: [{ id: "3" }] }] };
    query.hasNextPage = true;
    render(<OperatorApprovalsSection account={account} network='mainnet' />);

    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Increase 1",
      "Increase 2",
      "Increase 3",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(query.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("offers no Load more once the last page is loaded", () => {
    query.data = { pages: [{ operatorApprovals: [{ id: "1" }] }] };
    query.hasNextPage = false;
    render(<OperatorApprovalsSection account={account} network='mainnet' />);

    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });
});
