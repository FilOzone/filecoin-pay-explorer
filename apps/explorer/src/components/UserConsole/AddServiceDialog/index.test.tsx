import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AddServiceDialog from ".";

const TOKEN = "0x1111111111111111111111111111111111111111";
const OPERATOR = "0x2222222222222222222222222222222222222222";

const mocks = vi.hoisted(() => ({
  dialogOpenChange: undefined as ((open: boolean) => void) | undefined,
  dialogOpen: false,
  dialogContentProps: undefined as Record<string, unknown> | undefined,
  onSubmitOnChain: undefined as (() => void) | undefined,
  isSubmitting: false,
  isExecuting: false,
  submit: vi.fn(),
  filBalanceStatus: "funded" as "loading" | "unavailable" | "insufficient" | "funded",
  filBalanceOwner: "0xABCDEF0000000000000000000000000000000001",
  refreshFilBalance: vi.fn(),
  isCorrectChain: true,
  isSwitchingNetwork: false,
  switchToFilecoin: vi.fn(),
  isSquidOpen: false,
  openSquid: vi.fn(),
  network: "mainnet" as "mainnet" | "calibration",
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
  Dialog: ({
    children,
    onOpenChange,
    open,
  }: {
    children: React.ReactNode;
    onOpenChange: (open: boolean) => void;
    open: boolean;
  }) => {
    mocks.dialogOpenChange = onOpenChange;
    mocks.dialogOpen = open;
    return children;
  },
  DialogContent: ({ children, ...props }: { children: React.ReactNode }) => {
    mocks.dialogContentProps = props;
    return <div>{children}</div>;
  },
  DialogDescription: ({ children }: { children: React.ReactNode }) => children,
  DialogFooter: ({ children }: { children: React.ReactNode }) => children,
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
vi.mock("@/components/UserConsole/FundingLaunchContext", () => ({
  useFundingLaunch: () => ({ isSquidOpen: mocks.isSquidOpen, openSquid: mocks.openSquid }),
}));
vi.mock("@/components/shared/TokenIcon", () => ({ default: () => null }));
vi.mock("@/hooks/useSynapse", () => ({
  default: () => ({
    constants: {
      chain: { blockExplorers: { default: { url: "https://example.com" } }, slug: mocks.network },
      faucets:
        mocks.network === "calibration" ? [{ name: "Get FIL", url: "https://faucet.example.com/filecoin" }] : undefined,
      label: mocks.network === "calibration" ? "Calibration" : "Mainnet",
    },
  }),
}));
vi.mock("./hooks", () => ({
  CUSTOM_OPTION: "custom",
  useServiceSelection: () => ({
    services: [],
    isLoadingServices: false,
    serviceChoice: OPERATOR,
    setServiceChoice: vi.fn(),
    customServiceInput: "",
    setCustomServiceInput: vi.fn(),
    selectedService: undefined,
    operatorAddress: OPERATOR,
    reset: vi.fn(),
  }),
  useTokenSelection: () => ({
    knownTokens: [],
    tokenChoice: TOKEN,
    setTokenChoice: vi.fn(),
    customTokenInput: "",
    setCustomTokenInput: vi.fn(),
    token: { address: TOKEN, symbol: "TKN", decimals: 18 },
    supportsPermit: true,
    customTokenState: "idle",
    balance: 1000n * 10n ** 18n,
    isLoadingBalance: false,
    reset: vi.fn(),
  }),
  useFilecoinGasBalance: () => ({
    isCorrectChain: mocks.isCorrectChain,
    isSwitchingNetwork: mocks.isSwitchingNetwork,
    owner: mocks.filBalanceOwner,
    refresh: mocks.refreshFilBalance,
    status: mocks.filBalanceStatus,
    switchToFilecoin: mocks.switchToFilecoin,
  }),
  useAddServiceSubmit: (onSubmitOnChain: () => void) => {
    mocks.onSubmitOnChain = onSubmitOnChain;
    return { submit: mocks.submit, isSubmitting: mocks.isSubmitting, isExecuting: mocks.isExecuting };
  },
}));

function renderDialog(onOpenChange = vi.fn()) {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<AddServiceDialog open onOpenChange={onOpenChange} />);
  });
  return { renderer, onOpenChange };
}

function primaryButton(renderer: ReturnType<typeof create>) {
  return renderer.root.find(
    (node) =>
      node.type === "button" &&
      node.props["data-variant"] === "primary" &&
      node.children.some((child) => typeof child === "string" && child.includes("Add Service")),
  );
}

beforeEach(() => {
  mocks.dialogOpen = false;
  mocks.filBalanceStatus = "funded";
  mocks.filBalanceOwner = "0xABCDEF0000000000000000000000000000000001";
  mocks.isCorrectChain = true;
  mocks.isSwitchingNetwork = false;
  mocks.isSquidOpen = false;
  mocks.network = "mainnet";
  mocks.openSquid.mockReset();
  mocks.refreshFilBalance.mockReset().mockResolvedValue("funded");
  mocks.switchToFilecoin.mockReset();
  mocks.isSubmitting = false;
  mocks.isExecuting = false;
  mocks.submit.mockReset();
  mocks.dialogOpenChange = undefined;
  mocks.dialogContentProps = undefined;
  mocks.onSubmitOnChain = undefined;
});

describe("AddServiceDialog", () => {
  it("blocks an empty FIL wallet and opens the Squid flow with its FIL option visible", () => {
    mocks.filBalanceStatus = "insufficient";
    const { renderer, onOpenChange } = renderDialog();

    expect(primaryButton(renderer).props.disabled).toBe(true);
    const addFil = renderer.root.findAllByType("button").find((button) => button.children.includes("Add FIL"));
    act(() => addFil?.props.onClick());

    expect(mocks.openSquid).toHaveBeenCalledOnce();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it.each(["loading", "unavailable"] as const)("fails closed while the FIL balance is %s", (status) => {
    mocks.filBalanceStatus = status;
    const { renderer } = renderDialog();

    expect(primaryButton(renderer).props.disabled).toBe(true);
    if (status === "unavailable") {
      const retry = renderer.root.findAllByType("button").find((button) => button.children.includes("Retry"));
      act(() => retry?.props.onClick());
      expect(mocks.refreshFilBalance).toHaveBeenCalledOnce();
    }
  });

  it("uses the Calibration faucet instead of the mainnet-only Squid route", () => {
    mocks.network = "calibration";
    mocks.filBalanceStatus = "insufficient";
    const { renderer } = renderDialog();

    expect(primaryButton(renderer).props.disabled).toBe(true);
    expect(
      renderer.root.findAllByType("a").some((link) => link.props.href === "https://faucet.example.com/filecoin"),
    ).toBe(true);
    expect(mocks.openSquid).not.toHaveBeenCalled();
  });

  it("fails closed on a source network and offers a switch back to Filecoin", () => {
    mocks.isCorrectChain = false;
    const { renderer } = renderDialog();

    expect(primaryButton(renderer).props.disabled).toBe(true);
    const switchBack = renderer.root
      .findAllByType("button")
      .find((button) => button.children.includes("Switch to Mainnet"));
    act(() => switchBack?.props.onClick());
    expect(mocks.switchToFilecoin).toHaveBeenCalledOnce();
  });

  it("refreshes FIL after returning from Squid", () => {
    mocks.isSquidOpen = true;
    const { renderer } = renderDialog();
    mocks.refreshFilBalance.mockClear();

    mocks.isSquidOpen = false;
    act(() => renderer.update(<AddServiceDialog open onOpenChange={vi.fn()} />));

    expect(mocks.refreshFilBalance).toHaveBeenCalledOnce();
  });

  it("rechecks FIL immediately before submitting", async () => {
    const { renderer } = renderDialog();
    mocks.refreshFilBalance.mockResolvedValue("insufficient");

    await act(() => primaryButton(renderer).props.onClick());

    expect(mocks.refreshFilBalance).toHaveBeenCalledOnce();
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("unblocks after an insufficient balance refreshes above the reserve", () => {
    mocks.filBalanceStatus = "insufficient";
    const { renderer } = renderDialog();
    expect(primaryButton(renderer).props.disabled).toBe(true);

    mocks.filBalanceStatus = "funded";
    act(() => renderer.update(<AddServiceDialog open onOpenChange={vi.fn()} />));

    expect(primaryButton(renderer).props.disabled).toBe(false);
  });

  it("keeps the form while Squid is open and restores it after cancellation", () => {
    const { renderer } = renderDialog();
    act(() => renderer.root.findByProps({ id: "amount" }).props.onChange("7"));

    mocks.isSquidOpen = true;
    act(() => renderer.update(<AddServiceDialog open onOpenChange={vi.fn()} />));
    expect(mocks.dialogOpen).toBe(false);

    mocks.isSquidOpen = false;
    act(() => renderer.update(<AddServiceDialog open onOpenChange={vi.fn()} />));
    expect(mocks.dialogOpen).toBe(true);
    expect(renderer.root.findByProps({ id: "amount" }).props.value).toBe("7");
  });

  it("clears the old owner's form after an account switch", () => {
    const { renderer } = renderDialog();
    act(() => renderer.root.findByProps({ id: "amount" }).props.onChange("7"));

    mocks.filBalanceOwner = "0xABCDEF0000000000000000000000000000000002";
    act(() => renderer.update(<AddServiceDialog open onOpenChange={vi.fn()} />));

    expect(renderer.root.findByProps({ id: "amount" }).props.value).toBe("");
  });

  it("blocks every user close while busy but still closes after onchain submission", () => {
    mocks.isSubmitting = true;
    const { renderer, onOpenChange } = renderDialog();

    act(() => mocks.dialogOpenChange?.(false));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(mocks.dialogContentProps?.showCloseButton).toBe(false);
    const preventEscape = vi.fn();
    const preventOutside = vi.fn();
    act(() => {
      (mocks.dialogContentProps?.onEscapeKeyDown as (event: { preventDefault: () => void }) => void)({
        preventDefault: preventEscape,
      });
      (mocks.dialogContentProps?.onPointerDownOutside as (event: { preventDefault: () => void }) => void)({
        preventDefault: preventOutside,
      });
    });
    expect([preventEscape.mock.calls.length, preventOutside.mock.calls.length]).toEqual([1, 1]);
    const cancel = renderer.root
      .findAllByProps({ "data-variant": "ghost" })
      .find((button) => button.children.includes("Cancel"));
    expect(cancel?.props.disabled).toBe(true);

    act(() => mocks.onSubmitOnChain?.());
    expect(onOpenChange.mock.calls).toEqual([[false]]);
  });

  it("shows invalid deposit feedback and rejects mixed negative spending limits", () => {
    const { renderer } = renderDialog();
    expect(primaryButton(renderer).props.disabled).toBe(false);

    act(() => renderer.root.findByProps({ id: "amount" }).props.onChange("1e5"));
    expect(JSON.stringify(renderer.toJSON())).toContain("Enter a valid amount.");
    expect(primaryButton(renderer).props.disabled).toBe(true);

    act(() => renderer.root.findByProps({ id: "amount" }).props.onChange(""));
    const limitsToggle = renderer.root
      .findAllByType("button")
      .find((button) => button.children.includes("Set spending limits (optional)"));
    act(() => limitsToggle?.props.onClick());
    const unlimited = renderer.root.findAllByType("input").find((input) => input.props.type === "checkbox");
    act(() => unlimited?.props.onChange({ target: { checked: false } }));
    act(() => renderer.root.findByProps({ id: "lockupAllowance" }).props.onChange("0"));
    act(() => renderer.root.findByProps({ id: "rateAllowance" }).props.onChange("1"));
    expect(primaryButton(renderer).props.disabled).toBe(false);

    act(() => renderer.root.findByProps({ id: "lockupAllowance" }).props.onChange("-1"));
    expect(primaryButton(renderer).props.disabled).toBe(true);
  });
});
