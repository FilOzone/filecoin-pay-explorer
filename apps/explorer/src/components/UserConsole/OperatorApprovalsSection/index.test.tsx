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
vi.mock("@/components/UserConsole/IncreaseApprovalDialog", () => ({ IncreaseApprovalDialog: () => null }));
const AddServiceButton = ({ onApprove }: { onApprove: () => void }) => (
  <button type='button' onClick={onApprove}>
    Add Service
  </button>
);

vi.mock("./components", () => ({
  ApprovalsLoadingState: ({ onApprove }: { onApprove: () => void }) => <AddServiceButton onApprove={onApprove} />,
  ApprovalsErrorState: ({ onApprove }: { onApprove: () => void }) => <AddServiceButton onApprove={onApprove} />,
  ApprovalsEmptyState: ({ onApprove }: { onApprove: () => void }) => <AddServiceButton onApprove={onApprove} />,
  ApprovalsTable: ({ data }: { data: Array<{ id: string }> }) => (
    <ul>
      {data.map((approval) => (
        <li key={approval.id}>{approval.id}</li>
      ))}
    </ul>
  ),
}));

const account = { id: "0x1111111111111111111111111111111111111111" } as never;

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

    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["1", "2", "3"]);
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
