import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FundingLaunchProvider, useFundingLaunch } from "@/components/UserConsole/FundingLaunchContext";
import { FundingHost } from "./FundingHost";

const wallet = vi.hoisted(() => ({
  address: "0xABCDEF0000000000000000000000000000000001" as string | undefined,
  chainId: 314,
}));
const card = vi.hoisted(() => ({ buyWithCard: vi.fn(), label: "Buy USDC with card" }));
const dialogs = vi.hoisted(() => ({
  onPickerOpenChange: undefined as ((open: boolean) => void) | undefined,
  onSelect: undefined as ((method: string) => void) | undefined,
  onUsdcOpenChange: undefined as ((open: boolean) => void) | undefined,
}));

vi.mock("wagmi", () => ({ useConnection: () => wallet }));
vi.mock("@/hooks/useAccountDetails", () => ({
  useAccountTokens: () => ({ data: { userTokens: [{ id: "token-1" }] } }),
}));
vi.mock("./hooks/useCardPurchase", () => ({ useCardPurchase: () => card }));
vi.mock("@/components/UserConsole/DepositDialog", () => ({
  DepositDialog: ({
    depositToken,
    open,
    tokens,
  }: {
    depositToken: { id: string } | null;
    open: boolean;
    tokens: unknown[];
  }) => <div data-deposit-open={open} data-seed={depositToken?.id ?? null} data-token-count={tokens.length} />,
}));
vi.mock("./components", () => ({
  AddFundsDialog: ({
    onOpenChange,
    onSelect,
    open,
    squidAvailable,
    swapAvailable,
  }: {
    onOpenChange: (open: boolean) => void;
    onSelect: (method: string) => void;
    open: boolean;
    squidAvailable: boolean;
    swapAvailable: boolean;
  }) => {
    dialogs.onPickerOpenChange = onOpenChange;
    dialogs.onSelect = onSelect;
    return <div data-picker-open={open} data-squid={squidAvailable} data-swap={swapAvailable} />;
  },
  FundWithUsdcDialog: ({
    accountId,
    onOpenChange,
    open,
  }: {
    accountId: string;
    onOpenChange: (open: boolean) => void;
    open: boolean;
  }) => {
    dialogs.onUsdcOpenChange = onOpenChange;
    return <div data-account={accountId} data-usdc-dialog-open={open} />;
  },
}));

function Launcher() {
  const { openAddFunds, openUsdcFunding, setGuidedTopUp } = useFundingLaunch();
  return (
    <>
      <button data-launch onClick={openUsdcFunding} type='button' />
      <button data-open-picker onClick={() => openAddFunds()} type='button' />
      <button
        data-open-seeded
        onClick={() => openAddFunds({ depositToken: { id: "token-1" } as never })}
        type='button'
      />
      <button data-register={setGuidedTopUp} type='button' />
    </>
  );
}

function renderHost() {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <FundingLaunchProvider>
        <Launcher />
        <FundingHost />
      </FundingLaunchProvider>,
    );
  });
  return renderer;
}
const find = (renderer: ReturnType<typeof create>, prop: string) =>
  renderer.root.find((node) => node.type === "div" && prop in node.props);
const press = (renderer: ReturnType<typeof create>, name: string) =>
  act(() => renderer.root.findByProps({ [name]: true }).props.onClick());

beforeEach(() => {
  wallet.address = "0xABCDEF0000000000000000000000000000000001";
  wallet.chainId = 314;
  vi.clearAllMocks();
});

describe("FundingHost", () => {
  it("renders the USDC dialog once for the lowercase account and opens it on request", () => {
    const renderer = renderHost();
    expect(renderer.root.findAllByProps({ "data-usdc-dialog-open": false }, { deep: false })).toHaveLength(1);
    expect(find(renderer, "data-account").props["data-account"]).toBe("0xabcdef0000000000000000000000000000000001");

    press(renderer, "data-launch");
    expect(find(renderer, "data-account").props["data-usdc-dialog-open"]).toBe(true);

    act(() => dialogs.onUsdcOpenChange?.(false));
    expect(find(renderer, "data-account").props["data-usdc-dialog-open"]).toBe(false);
  });

  it("routes every picker method: USDC dialog, card, deposit, and the guided swap once one is registered", () => {
    const renderer = renderHost();
    expect(find(renderer, "data-picker-open").props["data-swap"]).toBe(false);
    const openSwap = vi.fn();
    act(() =>
      renderer.root.find((n) => n.type === "button" && "data-register" in n.props).props["data-register"](openSwap),
    );
    expect(find(renderer, "data-picker-open").props["data-swap"]).toBe(true);

    press(renderer, "data-open-picker");
    expect(find(renderer, "data-picker-open").props["data-picker-open"]).toBe(true);

    act(() => dialogs.onSelect?.("usdc"));
    expect(find(renderer, "data-picker-open").props["data-picker-open"]).toBe(false);
    expect(find(renderer, "data-account").props["data-usdc-dialog-open"]).toBe(true);

    act(() => dialogs.onSelect?.("card"));
    expect(card.buyWithCard).toHaveBeenCalledOnce();

    act(() => dialogs.onSelect?.("deposit"));
    expect(find(renderer, "data-deposit-open").props["data-deposit-open"]).toBe(true);
    expect(find(renderer, "data-deposit-open").props["data-token-count"]).toBe(1);
    expect(find(renderer, "data-deposit-open").props["data-seed"]).toBeNull();
    act(() => find(renderer, "data-deposit-open").parent?.props.onOpenChange(false));

    // The dashboard names the token it shows, and the deposit opens on it.
    press(renderer, "data-open-seeded");
    act(() => dialogs.onSelect?.("deposit"));
    expect(find(renderer, "data-deposit-open").props["data-seed"]).toBe("token-1");

    act(() => dialogs.onSelect?.("squid"));
    expect(openSwap).toHaveBeenCalledOnce();
  });

  it("opens the plain deposit itself on calibration, with no picker or USDC dialog, and nothing without an address", () => {
    wallet.chainId = 314159;
    const renderer = renderHost();
    expect(renderer.root.findAllByProps({ "data-picker-open": false }, { deep: false })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ "data-usdc-dialog-open": false }, { deep: false })).toHaveLength(0);

    press(renderer, "data-open-picker");
    expect(find(renderer, "data-deposit-open").props["data-deposit-open"]).toBe(true);
    act(() => find(renderer, "data-deposit-open").parent?.props.onOpenChange(false));
    expect(find(renderer, "data-deposit-open").props["data-deposit-open"]).toBe(false);
    // The request was consumed, so the next one opens the deposit again.
    press(renderer, "data-open-picker");
    expect(find(renderer, "data-deposit-open").props["data-deposit-open"]).toBe(true);

    wallet.address = undefined;
    expect(renderHost().root.findAllByType("div")).toHaveLength(0);
  });
});
