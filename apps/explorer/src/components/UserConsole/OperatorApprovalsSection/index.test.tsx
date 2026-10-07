// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OperatorApprovalsSection } from ".";

const query = vi.hoisted(() => ({
  data: undefined as { operatorApprovals: unknown[] } | undefined,
  isLoading: false,
  isError: false,
}));

vi.mock("@filecoin-foundation/ui-filecoin/Button", () => ({
  Button: ({ children, variant: _variant, ...props }: React.ComponentProps<"button"> & { variant?: string }) => (
    <button type='button' {...props}>
      {children}
    </button>
  ),
}));
vi.mock("@/hooks/useAccountDetails", () => ({ useAccountApprovals: () => query }));
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
  ApprovalsTable: () => null,
}));

const account = { id: "0x1111111111111111111111111111111111111111" } as never;

const dialogOpen = () => screen.getByTestId("add-service-dialog").dataset.open;

afterEach(cleanup);

describe("OperatorApprovalsSection Add Service", () => {
  beforeEach(() => {
    query.data = undefined;
    query.isLoading = false;
    query.isError = false;
  });

  it.each([
    ["loading", { isLoading: true }],
    ["error", { isError: true }],
    ["empty", { data: { operatorApprovals: [] } }],
    ["populated", { data: { operatorApprovals: [{ id: "1" }] } }],
  ])("opens the dialog from the %s state", (_name, state) => {
    Object.assign(query, state);
    render(<OperatorApprovalsSection account={account} network='mainnet' />);
    expect(dialogOpen()).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Add Service" }));
    expect(dialogOpen()).toBe("true");
  });
});
