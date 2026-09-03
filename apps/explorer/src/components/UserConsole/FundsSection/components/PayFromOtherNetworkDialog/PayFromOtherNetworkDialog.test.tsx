import { NATIVE_TOKEN_ADDRESS } from "@filecoin-project/squid-evm-funding";
import type { ReactNode } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BASE_USDC as BASE_USDC_ADDRESS, NATIVE_USDC_BY_CHAIN } from "@/components/UserConsole/privy-funding";
import { formatUsdfcAmount } from "../../data/funding-runway";
import type { PaymentSource } from "../../data/payment-sources";
import type { SquidDepositQuote } from "../../data/squid-deposit-route";
import type { PaymentToken } from "../../data/squid-payment-tokens";
import { PayFromOtherNetworkDialog } from "./PayFromOtherNetworkDialog";

const RECIPIENT = "0x2222222222222222222222222222222222222222";
const EMBEDDED = "0x1111111111111111111111111111111111111111";
const EXTERNAL = "0x3333333333333333333333333333333333333333";
const BASE_USDC: PaymentToken = {
  chainId: 8453,
  token: "0x4444444444444444444444444444444444444444",
  symbol: "USDC",
  decimals: 6,
};
const BASE_ETH: PaymentToken = {
  chainId: 8453,
  token: NATIVE_TOKEN_ADDRESS,
  symbol: "ETH",
  decimals: 18,
  usdPrice: 3000,
};
const ARB_USDC: PaymentToken = {
  chainId: 42161,
  token: "0x6666666666666666666666666666666666666666",
  symbol: "USDC",
  decimals: 6,
};
const TOKENS_BY_CHAIN: Record<number, PaymentToken[]> = { 8453: [BASE_USDC, BASE_ETH], 42161: [ARB_USDC] };
// A quote whose own WFIL leg prices a FIL top-up: 0.1 FIL costs about 0.09 USDFC.
const QUOTE: SquidDepositQuote = {
  quoteId: "quote-1",
  sourceChainId: 42161,
  sourceAmount: 100_000_000n,
  destinationAmount: 93n * 10n ** 18n,
  minimumDestinationAmount: 92n * 10n ** 18n,
  fees: [],
  gasCosts: [],
  filecoinSwap: { wfil: 6_377_049_200_414_049_325n, usdfc: 4_587_274_747_827_089_410n },
};

const privy = vi.hoisted(() => ({
  addFunds: vi.fn(),
  authenticated: true,
  login: vi.fn(),
  connectWallet: vi.fn(),
  fundWallet: vi.fn(),
  fundWithCard: vi.fn(),
  wallets: [] as { address: string; walletClientType: string }[],
}));
const topUpActivity = vi.hoisted(() => ({ setTopUpActive: vi.fn() }));
// The paying wallet's balance of the selected token per network, as the balance query and the scan report it.
const balances = vi.hoisted(() => ({ byChain: {} as Record<number, bigint> }));
const scan = vi.hoisted(() => ({ isPending: false, refetch: vi.fn(), sources: [] as unknown[] }));
const quote = vi.hoisted(() => ({ data: undefined as unknown }));
const account = vi.hoisted(() => ({ fil: undefined as bigint | undefined }));

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: RECIPIENT }),
  useBalance: () => ({ data: account.fil === undefined ? undefined : { value: account.fil } }),
  usePublicClient: () => undefined,
}));
vi.mock("@privy-io/react-auth", () => ({
  useAddFunds: () => ({ addFunds: privy.addFunds }),
  useConnectWallet: () => ({ connectWallet: privy.connectWallet }),
  useFiatOnramp: () => ({ fund: privy.fundWithCard }),
  usePrivy: () => ({ authenticated: privy.authenticated, login: privy.login }),
  useFundWallet: () => ({ fundWallet: privy.fundWallet }),
  useWallets: () => ({ ready: true, wallets: privy.wallets }),
}));
vi.mock("@tanstack/react-query", () => ({
  queryOptions: (options: unknown) => options,
  useQuery: ({ enabled, queryKey }: { enabled?: boolean; queryKey: unknown[] }) => ({
    data:
      queryKey[0] === "squid-payment-tokens"
        ? (TOKENS_BY_CHAIN[queryKey[1] as number] ?? [])
        : queryKey[0] === "squid-deposit-balances"
          ? { token: balances.byChain[queryKey[1] as number] ?? 0n, native: 0n, gasPrice: 1n }
          : queryKey[0] === "squid-deposit-quote" && enabled
            ? quote.data
            : undefined,
    error: null,
    isError: false,
    isFetching: false,
    isPending: queryKey[0] !== "squid-payment-tokens",
    refetch: vi.fn(),
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("./usePaymentSourcesAcrossChains", () => ({ usePaymentSourcesAcrossChains: () => scan }));
vi.mock("use-debounce", () => ({ useDebounce: (value: string) => [value] }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/UserConsole/TopUpActivityContext", () => ({ useTopUpActivity: () => topUpActivity }));
vi.mock("@/components/UserConsole/TransactionReview", () => ({
  useTransactionReview: () => ({ requestReview: vi.fn(async () => true), reviewDialog: null }),
}));
vi.mock("@filecoin-foundation/ui-filecoin/Button", () => ({
  Button: ({
    "aria-label": ariaLabel,
    children,
    disabled,
    onClick,
  }: {
    "aria-label"?: string;
    children: ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button aria-label={ariaLabel} disabled={disabled} onClick={onClick} type='button'>
      {children}
    </button>
  ),
}));
vi.mock("@filecoin-foundation/ui-filecoin/Input", () => ({
  Input: ({ onChange, value }: { onChange: (value: string) => void; value: string }) => (
    <input data-amount data-set-amount={onChange} readOnly value={value} />
  ),
}));
vi.mock("@filecoin-pay/ui/components/label", () => ({
  Label: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@filecoin-pay/ui/components/switch", () => ({
  Switch: ({
    "aria-label": ariaLabel,
    checked,
    onCheckedChange,
  }: {
    "aria-label"?: string;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
  }) => <input aria-label={ariaLabel} checked={checked} data-toggle={onCheckedChange} readOnly type='checkbox' />,
}));
vi.mock("@filecoin-pay/ui/components/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => children,
  DialogContent: ({ children }: { children: ReactNode }) => children,
  DialogDescription: ({ children }: { children: ReactNode }) => children,
  DialogFooter: ({ children }: { children: ReactNode }) => children,
  DialogHeader: ({ children }: { children: ReactNode }) => children,
  DialogTitle: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@filecoin-pay/ui/components/select", () => ({
  Select: ({ children }: { children: ReactNode }) => children,
  SelectContent: ({ children }: { children: ReactNode }) => children,
  SelectGroup: ({ children }: { children: ReactNode }) => children,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
  SelectLabel: ({ children }: { children: ReactNode }) => <span data-group-label>{children}</span>,
  SelectTrigger: ({ "aria-label": ariaLabel }: { "aria-label"?: string }) => (
    <button aria-label={ariaLabel} type='button' />
  ),
  SelectValue: () => null,
}));

const source = (token: PaymentToken, balance: bigint): PaymentSource => ({ balance, chainId: token.chainId, token });

async function render() {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<PayFromOtherNetworkDialog accountId='account' onOpenChange={() => undefined} open />);
  });
  return renderer;
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
const text = (renderer: ReturnType<typeof create>) => flatten(renderer.toJSON());
const optionLabels = (renderer: ReturnType<typeof create>) =>
  renderer.root.findAllByType("option").map((option) => option.props.children);
const has = (renderer: ReturnType<typeof create>, ariaLabel: string) =>
  renderer.root.findAllByProps({ "aria-label": ariaLabel }, { deep: false }).length > 0;
/** The Select wrapping a trigger: the nearest ancestor that takes a value. */
const selectAround = (trigger: ReactTestInstance) => {
  let node: ReactTestInstance | null = trigger;
  while (node && !("onValueChange" in node.props)) node = node.parent;
  if (!node) throw new Error("No select around the trigger");
  return node;
};
const setAmount = (renderer: ReturnType<typeof create>, amount: string) =>
  act(async () => {
    renderer.root.findByProps({ "data-amount": true }).props["data-set-amount"](amount);
  });

beforeEach(() => {
  privy.authenticated = true;
  privy.wallets = [
    { address: EMBEDDED, walletClientType: "privy" },
    { address: EXTERNAL, walletClientType: "metamask" },
  ];
  balances.byChain = {};
  scan.isPending = false;
  scan.sources = [];
  quote.data = undefined;
  account.fil = undefined;
  vi.stubGlobal("window", { localStorage: { getItem: () => null, removeItem: vi.fn(), setItem: vi.fn() } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("PayFromOtherNetworkDialog", () => {
  it("lists every connected wallet, offers to connect another, and holds the confirm until a quote exists", async () => {
    const renderer = await render();

    expect(text(renderer)).toContain("Pay from another network");
    // The source shows as a summary line until the user asks to change it.
    expect(has(renderer, "Paying wallet")).toBe(false);
    await act(async () => {
      renderer.root.findByProps({ "aria-label": "Change payment source" }).props.onClick();
    });
    expect(optionLabels(renderer)).toContain("Privy wallet (0x1111...1111)");
    expect(optionLabels(renderer)).toContain("Metamask (0x3333...3333)");
    // Nothing is funded, so no token is offered to pay with; the card panel picks where USDC lands.
    expect(optionLabels(renderer).filter((label) => String(label).includes(" · "))).toEqual([]);
    expect(text(renderer)).toContain("Nothing to pay with on any supported network.");
    expect(optionLabels(renderer).filter((label) => !String(label).includes("("))).toEqual([
      "Base",
      "Ethereum",
      "Arbitrum",
      "Polygon",
    ]);

    await act(async () => {
      renderer.root.findByProps({ "aria-label": "Connect another wallet" }).props.onClick();
    });
    expect(privy.connectWallet).toHaveBeenCalledOnce();

    expect(renderer.root.findByProps({ "aria-label": "Review payment" }).props.disabled).toBe(true);
    expect(has(renderer, "Confirm payment")).toBe(false);
    // Nothing to fill the amount with, so there is no Max.
    expect(text(renderer)).not.toContain("Max (");
    // No network holds anything, so Privy's funding is offered; the embedded wallet is the default payer.
    expect(text(renderer)).toContain("Your Privy wallet holds nothing to pay with on any supported network yet.");
    expect(has(renderer, "Add USDC with Privy")).toBe(true);
    await act(async () => {
      renderer.root.findByProps({ "aria-label": "Buy USDC with card" }).props.onClick();
    });
    // Nothing was scanned yet, so the purchase lands as Base's native USDC.
    expect(privy.fundWithCard).toHaveBeenCalledWith({
      source: {},
      destination: { address: EMBEDDED, chain: "eip155:8453", asset: BASE_USDC_ADDRESS },
      environment: "production",
    });
    expect(topUpActivity.setTopUpActive).toHaveBeenCalledWith(true);

    await act(async () => renderer.unmount());
  });

  it("asks a connect-only wallet to log in before buying USDC with card", async () => {
    privy.authenticated = false;
    const renderer = await render();

    expect(has(renderer, "Buy USDC with card")).toBe(false);
    expect(has(renderer, "Add USDC with Privy")).toBe(false);
    await act(async () => {
      renderer.root.findByProps({ "aria-label": "Log in to buy with card" }).props.onClick();
    });
    expect(privy.login).toHaveBeenCalledOnce();
    expect(privy.fundWithCard).not.toHaveBeenCalled();

    await act(async () => renderer.unmount());
  });

  it("keeps the top-up offer quiet while the scan is still answering", async () => {
    scan.isPending = true;
    const renderer = await render();
    expect(has(renderer, "Buy USDC with card")).toBe(false);
    await act(async () => {
      renderer.root.findByProps({ "aria-label": "Change payment source" }).props.onClick();
    });
    expect(text(renderer)).toContain("Checking balances…");
    await act(async () => renderer.unmount());
  });

  it("pays from the network holding the most USDC and points to it when another pick cannot pay", async () => {
    scan.sources = [source(ARB_USDC, 120_500_000n), source(BASE_USDC, 5_000_000n)];
    balances.byChain = { 8453: 5_000_000n, 42161: 120_500_000n };
    const renderer = await render();

    expect(text(renderer)).toContain("Arbitrum");
    expect(text(renderer)).toContain("Max (120.5 USDC)");
    expect(has(renderer, "Buy USDC with card")).toBe(false);
    expect(has(renderer, "Pay from Arbitrum")).toBe(false);

    await act(async () => {
      renderer.root.findByProps({ "aria-label": "Change payment source" }).props.onClick();
    });
    const sourceLabels = optionLabels(renderer).filter((label) => String(label).includes(" · "));
    expect(sourceLabels).toEqual(["Arbitrum · USDC · 120.5", "Base · USDC · 5"]);
    expect(renderer.root.findAllByProps({ "data-group-label": true })).toHaveLength(0);
    expect(optionLabels(renderer)).not.toContain("Ethereum");
    const sourceSelect = selectAround(renderer.root.findByProps({ "aria-label": "Payment source" }));
    expect(sourceSelect.props.value).toBe(`42161:${ARB_USDC.token}`);

    // Base holds too little for 100, so the dialog points back to Arbitrum instead of selling USDC.
    await setAmount(renderer, "100");
    await act(async () => {
      sourceSelect.props.onValueChange(`8453:${BASE_USDC.token}`);
    });
    expect(text(renderer)).toContain("Arbitrum holds 120.5 USDC, enough for this amount.");
    expect(has(renderer, "Buy USDC with card")).toBe(false);
    await act(async () => {
      renderer.root.findByProps({ "aria-label": "Pay from Arbitrum" }).props.onClick();
    });
    expect(selectAround(renderer.root.findByProps({ "aria-label": "Payment source" })).props.value).toBe(
      `42161:${ARB_USDC.token}`,
    );
    expect(has(renderer, "Pay from Arbitrum")).toBe(false);

    await act(async () => renderer.unmount());
  });

  it("pays with the network's own coin when that is what the wallet holds, USDC still first when both are there", async () => {
    scan.sources = [source(BASE_ETH, 5n * 10n ** 16n)];
    balances.byChain = { 8453: 5n * 10n ** 16n };
    const renderer = await render();

    expect(text(renderer)).toContain("Amount (ETH)");
    expect(text(renderer)).toContain("Max (0.05 ETH)");
    await act(async () => {
      renderer.root.findByProps({ "aria-label": "Change payment source" }).props.onClick();
    });
    expect(optionLabels(renderer).filter((label) => String(label).includes(" · "))).toEqual([
      "Base · ETH · 0.05 (≈ $150.00)",
    ]);
    await act(async () => renderer.unmount());

    scan.sources = [source(BASE_ETH, 5n * 10n ** 16n), source(BASE_USDC, 5_000_000n)];
    balances.byChain = { 8453: 5_000_000n };
    const again = await render();
    expect(text(again)).toContain("Amount (USDC)");
    await act(async () => again.unmount());
  });

  it("hints at another pair or a card purchase once nothing covers the typed amount", async () => {
    scan.sources = [source(ARB_USDC, 120_500_000n), source(BASE_USDC, 5_000_000n)];
    balances.byChain = { 8453: 5_000_000n, 42161: 120_500_000n };
    const renderer = await render();

    await setAmount(renderer, "500");
    expect(text(renderer)).toContain(
      "Not enough USDC on Arbitrum. Choose another token or network above, or buy USDC with card.",
    );
    expect(has(renderer, "Buy USDC with card")).toBe(true);
    // The purchase follows the paying network until the user picks another card network.
    const cardChain = selectAround(renderer.root.findByProps({ "aria-label": "Network to add USDC on" }));
    expect(cardChain.props.value).toBe("42161");
    await act(async () => {
      cardChain.props.onValueChange("137");
    });
    await act(async () => {
      renderer.root.findByProps({ "aria-label": "Buy USDC with card" }).props.onClick();
    });
    // Polygon is not in the scan's answer, so the purchase lands as its native USDC by address,
    // pre-filled with the dollar amount that was typed.
    expect(privy.fundWithCard).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultAmount: "500",
        destination: { address: EMBEDDED, chain: "eip155:137", asset: NATIVE_USDC_BY_CHAIN[137] },
      }),
    );
    await act(async () => {
      selectAround(renderer.root.findByProps({ "aria-label": "Network to add USDC on" })).props.onValueChange("8453");
    });
    await act(async () => {
      renderer.root.findByProps({ "aria-label": "Buy USDC with card" }).props.onClick();
    });
    expect(privy.fundWithCard).toHaveBeenCalledWith(
      expect.objectContaining({ destination: { address: EMBEDDED, chain: "eip155:8453", asset: BASE_USDC.token } }),
    );

    await setAmount(renderer, "100");
    expect(has(renderer, "Buy USDC with card")).toBe(false);
    expect(has(renderer, "Pay from Arbitrum")).toBe(false);
    await act(async () => renderer.unmount());

    // With a single funded pair there is nothing else to choose, so only the card is suggested.
    scan.sources = [source(ARB_USDC, 120_500_000n)];
    const alone = await render();
    await setAmount(alone, "500");
    expect(text(alone)).toContain("Not enough USDC on Arbitrum. Buy USDC with card, or transfer some to this wallet.");
    await act(async () => alone.unmount());
  });

  it("offers to keep FIL for gas, on by default for a wallet without FIL, and the user can turn it off", async () => {
    scan.sources = [source(ARB_USDC, 120_500_000n)];
    balances.byChain = { 42161: 120_500_000n };
    quote.data = QUOTE;
    account.fil = 0n;
    const renderer = await render();
    await setAmount(renderer, "100");

    const toggle = () =>
      renderer.root.find((node) => node.type === "input" && node.props["aria-label"] === "Keep about 0.1 FIL for gas");
    expect(toggle().props.checked).toBe(true);
    expect(text(renderer)).toContain("Your wallet holds 0 FIL. A little FIL lets you sign your first transactions.");
    const topUp = 89_917_660_262_234_738n;
    expect(text(renderer)).toContain("−0.0899 USDFC");
    expect(text(renderer)).toContain(`You receive at least${formatUsdfcAmount(92n * 10n ** 18n - topUp)} USDFC`);

    await act(async () => toggle().props["data-toggle"](false));
    expect(toggle().props.checked).toBe(false);
    expect(text(renderer)).toContain(`You receive at least${formatUsdfcAmount(92n * 10n ** 18n)} USDFC`);
    await act(async () => renderer.unmount());

    // A wallet that already holds FIL starts with the top-up off.
    account.fil = 10n ** 18n;
    const funded = await render();
    await setAmount(funded, "100");
    expect(
      funded.root.find((node) => node.type === "input" && node.props["aria-label"] === "Keep about 0.1 FIL for gas")
        .props.checked,
    ).toBe(false);
    expect(text(funded)).toContain("Your wallet already holds 1 FIL; turn this on to top it up.");
    await act(async () => funded.unmount());
  });
});
