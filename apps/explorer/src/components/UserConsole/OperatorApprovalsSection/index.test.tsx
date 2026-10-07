import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

function render() {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<OperatorApprovalsSection account={account} network='mainnet' />);
  });
  return renderer;
}

const dialogOpen = (r: ReturnType<typeof create>) =>
  r.root.findByProps({ "data-testid": "add-service-dialog" }).props["data-open"];

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
    const r = render();
    expect(dialogOpen(r)).toBe("false");

    act(() => {
      r.root.findByType("button").props.onClick();
    });
    expect(dialogOpen(r)).toBe("true");
  });
});
