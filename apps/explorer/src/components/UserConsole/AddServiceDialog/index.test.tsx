import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AddServiceDialog from ".";

const TOKEN = "0x1111111111111111111111111111111111111111";
const OPERATOR = "0x2222222222222222222222222222222222222222";

const mocks = vi.hoisted(() => ({
  dialogOpenChange: undefined as ((open: boolean) => void) | undefined,
  dialogContentProps: undefined as Record<string, unknown> | undefined,
  onSubmitOnChain: undefined as (() => void) | undefined,
  isSubmitting: false,
  isExecuting: false,
  submit: vi.fn(),
  hasGas: true as boolean | undefined,
  openAddFunds: vi.fn(),
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
  useFundingLaunch: () => ({ openAddFunds: mocks.openAddFunds }),
}));
vi.mock("@/components/shared/TokenIcon", () => ({ default: () => null }));
vi.mock("@/hooks/useSynapse", () => ({
  default: () => ({
    constants: {
      chain: { blockExplorers: { default: { url: "https://example.com" } }, nativeCurrency: { symbol: "FIL" } },
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
  useHasGasForTransaction: () => ({ balance: undefined, hasGas: mocks.hasGas }),
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

type Rendered = ReturnType<ReturnType<typeof create>["toJSON"]>;
const flatten = (node: Rendered | string): string =>
  typeof node === "string"
    ? node
    : Array.isArray(node)
      ? node.map(flatten).join("")
      : node?.children
        ? node.children.map(flatten).join("")
        : "";
const textOf = (renderer: ReturnType<typeof create>) => flatten(renderer.toJSON());

function primaryButton(renderer: ReturnType<typeof create>) {
  return renderer.root.findByProps({ "data-variant": "primary" });
}

beforeEach(() => {
  mocks.hasGas = true;
  mocks.openAddFunds.mockReset();
  mocks.isSubmitting = false;
  mocks.isExecuting = false;
  mocks.submit.mockReset();
  mocks.dialogOpenChange = undefined;
  mocks.dialogContentProps = undefined;
  mocks.onSubmitOnChain = undefined;
});

describe("AddServiceDialog", () => {
  it("sends a wallet without FIL to Add funds instead of letting it submit", () => {
    mocks.hasGas = false;
    const { renderer, onOpenChange } = renderDialog();
    const text = textOf(renderer);
    expect(text).toContain("Your wallet holds no FIL to pay for this transaction.");
    expect(text).toContain("paying from another network can also set a little FIL aside for gas");
    const submit = renderer.root.find(
      (node) =>
        node.type === "button" && node.props["data-variant"] === "primary" && node.children.includes("Add Service"),
    );
    expect(submit.props.disabled).toBe(true);

    const addFunds = renderer.root.find(
      (node) =>
        node.type === "button" && node.props["data-variant"] === "primary" && node.children.includes("Add funds"),
    );
    act(() => addFunds.props.onClick());
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.openAddFunds).toHaveBeenCalledOnce();
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("says nothing about gas while the balance is unknown", () => {
    mocks.hasGas = undefined;
    const { renderer } = renderDialog();
    expect(textOf(renderer)).not.toContain("holds no FIL");
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
