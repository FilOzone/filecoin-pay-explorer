// @vitest-environment jsdom
import { TIME_CONSTANTS } from "@filoz/synapse-sdk";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OperatorApprovalState } from "@/hooks/useOperatorApproval";
import EditLimitsDialog from "./EditLimitsDialog";

const TOKEN = 10n ** 18n;
const { EPOCHS_PER_DAY } = TIME_CONSTANTS;

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  isExecuting: false,
  refetch: vi.fn(),
  read: {} as { data?: unknown; isFetchedAfterMount: boolean; isError: boolean; isFetching: boolean },
  readArgs: [] as unknown[],
  dialogOnOpenChange: undefined as ((open: boolean) => void) | undefined,
  contentProps: undefined as Record<string, unknown> | undefined,
}));

vi.mock("@filecoin-foundation/ui-filecoin/Button", () => ({
  Button: ({ children, variant: _variant, ...props }: React.ComponentProps<"button"> & { variant?: string }) => (
    <button {...props} type='button'>
      {children}
    </button>
  ),
}));
vi.mock("@filecoin-foundation/ui-filecoin/Input", () => ({
  Input: ({ onChange, ...props }: { onChange: (value: string) => void; value: string }) => (
    <input {...props} onChange={(event) => onChange(event.target.value)} />
  ),
}));
vi.mock("@filecoin-pay/ui/components/dialog", () => ({
  Dialog: ({ children, onOpenChange }: { children: React.ReactNode; onOpenChange: (open: boolean) => void }) => {
    mocks.dialogOnOpenChange = onOpenChange;
    return children;
  },
  DialogContent: ({ children, ...props }: { children: React.ReactNode }) => {
    mocks.contentProps = props;
    return children;
  },
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => children,
  DialogHeader: ({ children }: { children: React.ReactNode }) => children,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));
vi.mock("@filecoin-pay/ui/components/label", () => ({
  Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
}));
vi.mock("@/hooks/useContractTransaction", () => ({
  useContractTransaction: () => ({ execute: mocks.execute, isExecuting: mocks.isExecuting }),
}));
vi.mock("@/hooks/useOperatorApproval", () => ({
  useOperatorApproval: (...args: unknown[]) => {
    mocks.readArgs = args;
    return { ...mocks.read, refetch: mocks.refetch };
  },
}));

const OWNER = "0x1111111111111111111111111111111111111111";
const OPERATOR = "0x4444444444444444444444444444444444444444";
const TOKEN_ADDRESS = "0x3333333333333333333333333333333333333333";
// The subgraph returns BigInt scalars as strings.
const token = { id: TOKEN_ADDRESS, symbol: "USDFC", decimals: "18" } as never;

const onChain: OperatorApprovalState = {
  isApproved: true,
  rateAllowance: 0n,
  lockupAllowance: 50n * TOKEN,
  maxLockupPeriod: 30n * EPOCHS_PER_DAY,
  rateUsage: 0n,
  lockupUsage: 0n,
};

const fresh = (data: OperatorApprovalState) => ({ data, isFetchedAfterMount: true, isError: false, isFetching: false });

function renderDialog(onOpenChange = vi.fn()) {
  render(
    <EditLimitsDialog
      network='mainnet'
      owner={OWNER}
      operator={OPERATOR}
      token={token}
      open
      onOpenChange={onOpenChange}
      onConfirmed={vi.fn()}
    />,
  );
  const button = (name: string) => screen.getByRole("button", { name });
  const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
  return { button, type };
}

afterEach(cleanup);

describe("EditLimitsDialog", () => {
  beforeEach(() => {
    mocks.execute.mockReset();
    mocks.refetch.mockReset();
    mocks.isExecuting = false;
    mocks.read = fresh(onChain);
  });

  it("reads the approval for this token, owner and operator", () => {
    renderDialog();
    expect(mocks.readArgs).toEqual(["mainnet", TOKEN_ADDRESS, OWNER, OPERATOR]);
  });

  // Regression: increases were added to the indexed allowance, which can trail the chain.
  it("waits for this opening's chain read instead of a cached one", () => {
    mocks.read = { data: onChain, isFetchedAfterMount: false, isError: false, isFetching: true };
    renderDialog();
    expect(screen.queryByLabelText("Lockup limit (USDFC)")).toBeNull();
  });

  // Regression: a form opened before the last update confirmed kept that update's old value and signed it back.
  it("waits for the last update to confirm before offering the form", () => {
    mocks.isExecuting = true;
    renderDialog();
    expect(screen.getByText("Waiting for your last update to confirm...")).toBeTruthy();
    expect(screen.queryByLabelText("Lockup limit (USDFC)")).toBeNull();
  });

  it("names each Unlimited checkbox after its limit", () => {
    renderDialog();
    expect(screen.getAllByRole("checkbox").map((box) => box.getAttribute("aria-label"))).toEqual([
      "Unlimited rate",
      "Unlimited lockup",
      "Unlimited lockup period",
    ]);
  });

  it("starts from the chain's values", () => {
    renderDialog();
    expect(screen.getByLabelText<HTMLInputElement>("Lockup limit (USDFC)").value).toBe("50");
    expect(screen.getByLabelText<HTMLInputElement>("Max lockup period (days)").value).toBe("30");
  });

  it("offers a retry when the chain read fails", () => {
    mocks.read = { data: undefined, isFetchedAfterMount: true, isError: true, isFetching: false };
    const { button } = renderDialog();
    fireEvent.click(button("Try again"));
    expect(mocks.refetch).toHaveBeenCalled();
  });

  it("lowers a limit with absolute values after showing old and new", async () => {
    const { button, type } = renderDialog();
    type("Lockup limit (USDFC)", "20");

    const comparison = screen.getByRole("table", { name: "Current and new limits" });
    expect(comparison.textContent).toContain("Lockup50.000 USDFC20.000 USDFC");

    await act(async () => fireEvent.click(button("Update limits")));
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "setOperatorApproval",
        args: [TOKEN_ADDRESS, OPERATOR, true, 0n, 20n * TOKEN, 30n * EPOCHS_PER_DAY],
        metadata: { type: "updateApproval", operator: OPERATOR, token: "USDFC" },
      }),
    );
  });

  it("warns before setting a limit below what the service uses", () => {
    mocks.read = fresh({ ...onChain, lockupUsage: 40n * TOKEN });
    const { type } = renderDialog();
    expect(screen.queryByText("Below what this service already uses")).toBeNull();

    type("Lockup limit (USDFC)", "30");
    expect(screen.getByText("Below what this service already uses")).toBeTruthy();
  });

  it.each([
    ["an exponent lockup", "Lockup limit (USDFC)", "1e5"],
    ["a fractional number of days", "Max lockup period (days)", "1.5"],
  ])("disables Update limits for %s instead of getting stuck", async (_name, label, value) => {
    const { button, type } = renderDialog();
    type(label, value);

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(button("Update limits").hasAttribute("disabled")).toBe(true);
    await act(async () => fireEvent.click(button("Update limits")));
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("keeps Update limits disabled while nothing has changed", () => {
    const { button } = renderDialog();
    expect(button("Update limits").hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("revokes after a confirmation", async () => {
    const { button } = renderDialog();
    fireEvent.click(button("Revoke"));
    expect(screen.getByRole("heading", { name: "Revoke USDFC approval?" })).toBeTruthy();

    await act(async () => fireEvent.click(button("Revoke")));
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        args: [TOKEN_ADDRESS, OPERATOR, false, 0n, 0n, 0n],
        metadata: { type: "revokeApproval", operator: OPERATOR, token: "USDFC" },
      }),
    );
  });

  it("approves a revoked service again", async () => {
    mocks.read = fresh({ ...onChain, isApproved: false, lockupAllowance: 0n, maxLockupPeriod: 0n });
    const { button, type } = renderDialog();
    expect(screen.getByRole("heading", { name: "Approve service again" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Revoke" })).toBeNull();

    type("Lockup limit (USDFC)", "5");
    type("Max lockup period (days)", "30");
    await act(async () => fireEvent.click(button("Approve")));
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.objectContaining({ args: [TOKEN_ADDRESS, OPERATOR, true, 0n, 5n * TOKEN, 30n * EPOCHS_PER_DAY] }),
    );
  });

  it("keeps the edit and can retry after the wallet rejects", async () => {
    mocks.execute.mockRejectedValue(new Error("rejected"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { button, type } = renderDialog();
    type("Lockup limit (USDFC)", "20");
    await act(async () => fireEvent.click(button("Update limits")));

    expect(screen.getByLabelText<HTMLInputElement>("Lockup limit (USDFC)").value).toBe("20");
    expect(button("Update limits").hasAttribute("disabled")).toBe(false);
  });

  it("refuses close requests while the wallet signature is pending, but not while the receipt is tracked", async () => {
    const onOpenChange = vi.fn();
    let submit!: () => void;
    mocks.execute.mockReturnValue(new Promise<void>((resolve) => (submit = resolve)));
    const { button, type } = renderDialog(onOpenChange);
    type("Lockup limit (USDFC)", "20");
    fireEvent.click(button("Update limits"));

    act(() => mocks.dialogOnOpenChange?.(false));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(mocks.contentProps?.showCloseButton).toBe(false);

    mocks.isExecuting = true;
    await act(async () => submit());
    expect(mocks.contentProps?.showCloseButton).toBe(true);
    act(() => mocks.dialogOnOpenChange?.(false));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes once the transaction is submitted on chain", async () => {
    const onOpenChange = vi.fn();
    mocks.execute.mockImplementation(async ({ onSubmitOnChain }) => onSubmitOnChain());
    const { button, type } = renderDialog(onOpenChange);
    type("Lockup limit (USDFC)", "20");
    await act(async () => fireEvent.click(button("Update limits")));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
