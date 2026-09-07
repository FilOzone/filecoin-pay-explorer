import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AddServiceDialog from ".";

const TOKEN = "0x1111111111111111111111111111111111111111";
const OPERATOR = "0x2222222222222222222222222222222222222222";
const HASH = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const mocks = vi.hoisted(() => ({
  dialogContentProps: undefined as Record<string, unknown> | undefined,
  dialogOpenChange: undefined as ((open: boolean) => void) | undefined,
  submit: vi.fn(),
  recheckReceipt: vi.fn(),
  recheckIndexing: vi.fn(),
  reset: vi.fn(),
  lifecycle: {
    stage: "review" as string,
    txHash: undefined as string | undefined,
    error: undefined as Error | undefined,
    watchError: undefined as Error | undefined,
    persistenceWarning: undefined as Error | undefined,
    syncError: undefined as Error | undefined,
    resumedContext: null as { id: string } | null,
    indexingTimedOut: false,
  },
}));

vi.mock("@filecoin-foundation/ui-filecoin/Button", () => ({
  Button: ({ children, variant, ...props }: React.ComponentProps<"button"> & { variant?: string }) => (
    <button data-variant={variant} {...props}>
      {children}
    </button>
  ),
}));
vi.mock("@filecoin-foundation/ui-filecoin/Input", () => ({
  Input: (props: React.ComponentProps<"input">) => <input {...props} />,
}));
vi.mock("@filecoin-pay/ui/components/dialog", () => ({
  Dialog: ({ children, onOpenChange }: { children: React.ReactNode; onOpenChange: (open: boolean) => void }) => {
    mocks.dialogOpenChange = onOpenChange;
    return children;
  },
  DialogContent: ({ children, ...props }: { children: React.ReactNode }) => {
    mocks.dialogContentProps = props;
    return <div>{children}</div>;
  },
  DialogDescription: ({ children }: { children: React.ReactNode }) => children,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => children,
  DialogTitle: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@filecoin-pay/ui/components/label", () => ({
  Label: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@filecoin-pay/ui/components/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => children,
  SelectContent: ({ children }: { children: React.ReactNode }) => children,
  SelectItem: ({ children }: { children: React.ReactNode }) => children,
  SelectSeparator: () => null,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => children,
  SelectValue: () => null,
}));
vi.mock("@/components/shared/CopyButton", () => ({ default: () => null }));
vi.mock("@/components/shared/TokenIcon", () => ({ default: () => null }));
// ExplorerLink (used for the service/token/tx address rows) pulls in
// next/link and useNetwork, neither of which run under this node test
// environment — stub both to plain markup.
vi.mock("@/hooks/useNetwork", () => ({ default: () => ({ network: "mainnet" }) }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/hooks/useSynapse", () => ({
  default: () => ({
    constants: {
      chain: { blockExplorers: { default: { url: "https://example.com" } } },
    },
  }),
}));
// useAddServiceForm is exercised for real (via importOriginal) — only the
// hooks with outside dependencies (network reads, wallet, subgraph) are stubbed.
vi.mock("./hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./hooks")>()),
  useServiceSelection: () => ({
    services: [],
    isLoadingServices: false,
    serviceChoice: OPERATOR,
    chooseService: vi.fn(),
    customServiceInput: "",
    enterCustomServiceAddress: vi.fn(),
    selectedService: undefined,
    operatorAddress: OPERATOR,
    reset: vi.fn(),
  }),
  useTokenSelection: () => ({
    knownTokens: [],
    tokenChoice: TOKEN,
    chooseToken: vi.fn(),
    customTokenInput: "",
    enterCustomTokenAddress: vi.fn(),
    token: { address: TOKEN, symbol: "TKN", decimals: 18 },
    supportsPermit: true,
    customTokenState: "idle",
    balance: 1000n * 10n ** 18n,
    isLoadingBalance: false,
    reset: vi.fn(),
  }),
  useAddServiceLifecycle: () => ({
    ...mocks.lifecycle,
    submit: mocks.submit,
    recheckReceipt: mocks.recheckReceipt,
    recheckIndexing: mocks.recheckIndexing,
    reset: mocks.reset,
  }),
}));

function renderDialog(onOpenChange = vi.fn(), open = true) {
  const makeElement = (isOpen: boolean) => <AddServiceDialog open={isOpen} onOpenChange={onOpenChange} />;
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(makeElement(open));
  });
  return {
    renderer,
    onOpenChange,
    rerender: (isOpen: boolean) => act(() => renderer.update(makeElement(isOpen))),
  };
}

function primaryButton(renderer: ReturnType<typeof create>) {
  return renderer.root.findByProps({ "data-variant": "primary" });
}

function findButtonByText(renderer: ReturnType<typeof create>, text: string) {
  return renderer.root.findAllByType("button").find((button) => button.children.includes(text));
}

function textContent(renderer: ReturnType<typeof create>) {
  return JSON.stringify(renderer.toJSON());
}

beforeEach(() => {
  mocks.dialogContentProps = undefined;
  mocks.dialogOpenChange = undefined;
  mocks.submit.mockReset();
  mocks.recheckReceipt.mockReset();
  mocks.recheckIndexing.mockReset();
  mocks.reset.mockReset();
  mocks.lifecycle = {
    stage: "review",
    txHash: undefined,
    error: undefined,
    watchError: undefined,
    persistenceWarning: undefined,
    syncError: undefined,
    resumedContext: null,
    indexingTimedOut: false,
  };
});

describe("AddServiceDialog", () => {
  it("shows invalid deposit feedback and rejects mixed negative spending limits", () => {
    const { renderer } = renderDialog();
    expect(primaryButton(renderer).props.disabled).toBe(false);

    act(() => renderer.root.findByProps({ id: "amount" }).props.onChange("1e5"));
    expect(textContent(renderer)).toContain("Enter a valid amount.");
    expect(primaryButton(renderer).props.disabled).toBe(true);

    act(() => renderer.root.findByProps({ id: "amount" }).props.onChange(""));
    const limitsToggle = findButtonByText(renderer, "Set spending limits (optional)");
    act(() => limitsToggle?.props.onClick());
    const unlimited = renderer.root.findAllByType("input").find((input) => input.props.type === "checkbox");
    act(() => unlimited?.props.onChange({ target: { checked: false } }));
    act(() => renderer.root.findByProps({ id: "lockupAllowance" }).props.onChange("0"));
    act(() => renderer.root.findByProps({ id: "rateAllowance" }).props.onChange("1"));
    expect(primaryButton(renderer).props.disabled).toBe(false);

    act(() => renderer.root.findByProps({ id: "lockupAllowance" }).props.onChange("-1"));
    expect(primaryButton(renderer).props.disabled).toBe(true);
  });

  it("submits through the lifecycle coordinator instead of calling onOpenChange directly", () => {
    const { renderer, onOpenChange } = renderDialog();
    act(() => primaryButton(renderer).props.onClick());
    expect(mocks.submit).toHaveBeenCalledWith(
      expect.objectContaining({ operatorAddress: OPERATOR, token: expect.objectContaining({ address: TOKEN }) }),
    );
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it.each([
    "awaiting-signature",
    "submitted",
    "confirmed",
    "waiting-for-indexer",
    "complete",
  ])("stays open and renders a status panel instead of the form while stage is %s", (stage) => {
    mocks.lifecycle.stage = stage;
    mocks.lifecycle.txHash = HASH;
    const { renderer, onOpenChange } = renderDialog();
    // The form's service selector is gone; onOpenChange was never invoked to close the dialog.
    expect(renderer.root.findAllByProps({ id: "service" })).toHaveLength(0);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("blocks closing only while awaiting a wallet signature", () => {
    mocks.lifecycle.stage = "awaiting-signature";
    renderDialog();
    expect(mocks.dialogContentProps?.showCloseButton).toBe(false);
    const preventDefault = vi.fn();
    act(() => {
      (mocks.dialogContentProps?.onEscapeKeyDown as (event: { preventDefault: () => void }) => void)({
        preventDefault,
      });
    });
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it.each([
    "submitted",
    "waiting-for-indexer",
  ])("allows closing while stage is %s (progress is durably tracked)", (stage) => {
    mocks.lifecycle.stage = stage;
    const { renderer, onOpenChange } = renderDialog();
    expect(mocks.dialogContentProps?.showCloseButton).toBe(true);
    const close = findButtonByText(renderer, "Close");
    act(() => close?.props.onClick());
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.reset).not.toHaveBeenCalled();
  });

  it("shows a recoverable failure and lets the user try again from a blank slate", () => {
    mocks.lifecycle.stage = "failed";
    mocks.lifecycle.error = new Error("execution reverted");
    const { renderer } = renderDialog();
    expect(textContent(renderer)).toContain("execution reverted");

    const tryAgain = findButtonByText(renderer, "Try again");
    act(() => tryAgain?.props.onClick());
    expect(mocks.reset).toHaveBeenCalledTimes(1);
  });

  it("completion clears the run and closes on Done", () => {
    mocks.lifecycle.stage = "complete";
    const { renderer, onOpenChange } = renderDialog();
    expect(textContent(renderer)).toContain("Service added");

    const done = findButtonByText(renderer, "Done");
    act(() => done?.props.onClick());
    expect(mocks.reset).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("offers a manual recheck once the indexing wait times out", () => {
    mocks.lifecycle.stage = "waiting-for-indexer";
    mocks.lifecycle.indexingTimedOut = true;
    const { renderer } = renderDialog();
    const checkNow = findButtonByText(renderer, "Check now");
    act(() => checkNow?.props.onClick());
    expect(mocks.recheckIndexing).toHaveBeenCalledTimes(1);
  });

  it("offers a manual recheck when the receipt watch errors, without treating it as a failure", () => {
    mocks.lifecycle.stage = "submitted";
    mocks.lifecycle.watchError = new Error("network request failed");
    const { renderer } = renderDialog();
    expect(textContent(renderer)).toContain("Couldn't check on this transaction");
    const checkAgain = findButtonByText(renderer, "Check again");
    act(() => checkAgain?.props.onClick());
    expect(mocks.recheckReceipt).toHaveBeenCalledTimes(1);
  });

  it("shows the confirmed stage distinctly from submitted, not as 'Broadcasting'", () => {
    mocks.lifecycle.stage = "confirmed";
    const { renderer } = renderDialog();
    expect(textContent(renderer)).toContain("Confirmed on-chain");
    expect(textContent(renderer)).not.toContain("Broadcasting");
  });

  it("shows 'Transaction submitted' (not 'Broadcasting') while waiting for confirmation", () => {
    mocks.lifecycle.stage = "submitted";
    const { renderer } = renderDialog();
    expect(textContent(renderer)).toContain("Transaction submitted");
    expect(textContent(renderer)).not.toContain("Broadcasting");
  });

  it.each([
    "submitted",
    "confirmed",
    "waiting-for-indexer",
  ])("surfaces a persistence warning without changing stage or blocking closing, in stage %s", (stage) => {
    mocks.lifecycle.stage = stage;
    mocks.lifecycle.persistenceWarning = new Error("recovery could not be saved");
    const { renderer } = renderDialog();
    expect(textContent(renderer)).toContain("recovery could not be saved");
    expect(mocks.dialogContentProps?.showCloseButton).toBe(true);
  });

  it("offers a Try again for a sync error, wired to recheckIndexing (which retries onIndexed directly)", () => {
    mocks.lifecycle.stage = "waiting-for-indexer";
    mocks.lifecycle.syncError = new Error("invalidation failed");
    const { renderer } = renderDialog();
    expect(textContent(renderer)).toContain("didn't go through");
    const tryAgain = findButtonByText(renderer, "Try again");
    act(() => tryAgain?.props.onClick());
    expect(mocks.recheckIndexing).toHaveBeenCalledTimes(1);
  });

  it("does not reopen a dialog the user closed on a transaction they just submitted", () => {
    // Fresh submission this mount — never loaded from storage.
    mocks.lifecycle.stage = "submitted";
    mocks.lifecycle.resumedContext = null;
    const { rerender, onOpenChange } = renderDialog(vi.fn(), true);
    onOpenChange.mockClear();

    rerender(false); // the user closed it via the footer's Close button
    expect(onOpenChange).not.toHaveBeenCalledWith(true);
  });

  it("auto-opens a dialog that starts closed when a resumed transaction is still being tracked", () => {
    mocks.lifecycle.stage = "waiting-for-indexer";
    mocks.lifecycle.resumedContext = { id: "resumed" };
    const { onOpenChange } = renderDialog(vi.fn(), false);
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it("resets a terminal run when dismissed via Escape/outside-click/X, not just the footer buttons", () => {
    mocks.lifecycle.stage = "failed";
    const { onOpenChange } = renderDialog();
    act(() => mocks.dialogOpenChange?.(false));
    expect(mocks.reset).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not reset an in-flight run dismissed via Escape/outside-click/X", () => {
    mocks.lifecycle.stage = "waiting-for-indexer";
    const { onOpenChange } = renderDialog();
    act(() => mocks.dialogOpenChange?.(false));
    expect(mocks.reset).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("blocks Escape/outside-click/X the same as the footer while awaiting a wallet signature", () => {
    mocks.lifecycle.stage = "awaiting-signature";
    const { onOpenChange } = renderDialog();
    act(() => mocks.dialogOpenChange?.(false));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(mocks.reset).not.toHaveBeenCalled();
  });
});
