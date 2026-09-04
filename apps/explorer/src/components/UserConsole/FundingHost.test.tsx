import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FundingHost } from "./FundingHost";
import { FundingLaunchProvider, useFundingLaunch } from "./FundingLaunchContext";

const wallet = vi.hoisted(() => ({
  address: "0xABCDEF0000000000000000000000000000000001" as string | undefined,
  chainId: 314 as number | undefined,
}));
const dialogs = vi.hoisted(() => ({
  accountId: "",
  onSelect: undefined as ((method: "card" | "deposit" | "squid") => void) | undefined,
  squidInitialSource: undefined as { amount: bigint; chainId: number; decimals: number; token: string } | undefined,
  squidOpen: false,
}));
const card = vi.hoisted(() => ({
  buyWithCard: vi.fn(),
  isBusy: false,
  onPurchased: undefined as ((amount: bigint) => void) | undefined,
  statusMessage: null as string | null,
}));

vi.mock("wagmi", () => ({ useConnection: () => wallet }));
vi.mock("@/hooks/useAccountDetails", () => ({
  CONSOLE_TOKEN_PAGE_SIZE: 100,
  useAccountTokens: () => ({ data: { userTokens: [{ id: "token-1" }] } }),
}));
vi.mock("./FundsSection/components", () => ({
  AddFundsDialog: ({ onSelect, open }: { onSelect: (method: "card" | "deposit" | "squid") => void; open: boolean }) => {
    dialogs.onSelect = onSelect;
    return <div data-picker-open={open} />;
  },
}));
vi.mock("./FundsSection/hooks/useCardPurchase", () => ({
  CARD_CHAIN_ID: 8453,
  CARD_USDC: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  CARD_USDC_DECIMALS: 6,
  useCardPurchase: ({ onPurchased }: { onPurchased: (amount: bigint) => void }) => {
    card.onPurchased = onPurchased;
    return card;
  },
}));
vi.mock("./DepositDialog", () => ({
  DepositDialog: ({
    depositToken,
    onOpenChange,
    open,
    tokens,
  }: {
    depositToken: { id: string } | null;
    onOpenChange: (open: boolean) => void;
    open: boolean;
    tokens: unknown[];
  }) => (
    <button
      data-deposit-open={open}
      data-seed={depositToken?.id ?? ""}
      data-token-count={tokens.length}
      onClick={() => onOpenChange(false)}
      type='button'
    />
  ),
}));
vi.mock("./FundsSection/components/DirectSquidDepositDialog", () => ({
  DirectSquidDepositDialog: ({
    accountId,
    initialSource,
    open,
  }: {
    accountId: string;
    initialSource?: { amount: bigint; chainId: number; decimals: number; token: string };
    open: boolean;
  }) => {
    dialogs.accountId = accountId;
    dialogs.squidInitialSource = initialSource;
    dialogs.squidOpen = open;
    return <div data-account-id={accountId} data-squid-open={open} />;
  },
}));

function Launcher() {
  const { openAddFunds } = useFundingLaunch();
  return (
    <>
      <button data-open onClick={() => openAddFunds()} type='button' />
      <button data-open-seeded onClick={() => openAddFunds({ id: "token-1" } as never)} type='button' />
    </>
  );
}

async function renderHost() {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <FundingLaunchProvider>
        <Launcher />
        <FundingHost />
      </FundingLaunchProvider>,
    );
  });
  return renderer;
}

async function rerenderHost(renderer: ReturnType<typeof create>) {
  await act(async () => {
    renderer.update(
      <FundingLaunchProvider>
        <Launcher />
        <FundingHost />
      </FundingLaunchProvider>,
    );
  });
}

const find = (renderer: ReturnType<typeof create>, prop: string) =>
  renderer.root.find((node) => typeof node.type === "string" && prop in node.props);

beforeEach(() => {
  wallet.address = "0xABCDEF0000000000000000000000000000000001";
  wallet.chainId = 314;
  dialogs.accountId = "";
  dialogs.squidOpen = false;
  dialogs.squidInitialSource = undefined;
  card.buyWithCard.mockClear();
});

describe("FundingHost", () => {
  it("routes mainnet funding to a direct deposit or direct Squid deposit", async () => {
    const renderer = await renderHost();
    expect(dialogs.accountId).toBe("0xabcdef0000000000000000000000000000000001");

    act(() => renderer.root.findByProps({ "data-open-seeded": true }).props.onClick());
    expect(find(renderer, "data-picker-open").props["data-picker-open"]).toBe(true);
    act(() => dialogs.onSelect?.("deposit"));
    expect(find(renderer, "data-deposit-open").props).toMatchObject({
      "data-deposit-open": true,
      "data-seed": "token-1",
      "data-token-count": 1,
    });
    act(() => find(renderer, "data-deposit-open").props.onClick());
    act(() => renderer.root.findByProps({ "data-open": true }).props.onClick());
    act(() => dialogs.onSelect?.("squid"));
    expect(dialogs.squidOpen).toBe(true);
  });

  it("keeps the picker context while Privy starts a card purchase", async () => {
    const renderer = await renderHost();
    act(() => renderer.root.findByProps({ "data-open": true }).props.onClick());
    act(() => dialogs.onSelect?.("card"));

    expect(card.buyWithCard).toHaveBeenCalledOnce();
    expect(find(renderer, "data-picker-open").props["data-picker-open"]).toBe(true);

    act(() => card.onPurchased?.(12_500_000n));
    expect(dialogs.squidOpen).toBe(true);
    expect(dialogs.squidInitialSource).toEqual({
      amount: 12_500_000n,
      chainId: 8453,
      decimals: 6,
      token: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    });
  });

  it("opens direct deposit without a one-choice picker on Calibration", async () => {
    wallet.chainId = 314159;
    const renderer = await renderHost();
    expect(renderer.root.findAll((node) => node.type === "div" && "data-picker-open" in node.props)).toHaveLength(0);
    act(() => renderer.root.findByProps({ "data-open": true }).props.onClick());
    expect(find(renderer, "data-deposit-open").props["data-deposit-open"]).toBe(true);
  });

  it("keeps direct Squid funding open while switching to its source chain", async () => {
    const renderer = await renderHost();
    act(() => renderer.root.findByProps({ "data-open": true }).props.onClick());
    act(() => dialogs.onSelect?.("squid"));
    expect(dialogs.squidOpen).toBe(true);

    wallet.chainId = 8453;
    await rerenderHost(renderer);

    expect(dialogs.squidOpen).toBe(true);
    expect(renderer.root.findAll((node) => node.type === "div" && "data-picker-open" in node.props)).toHaveLength(0);
    expect(renderer.root.findAll((node) => node.type === "button" && "data-deposit-open" in node.props)).toHaveLength(
      0,
    );
  });

  it("closes and resets a direct deposit when the Filecoin network changes", async () => {
    const renderer = await renderHost();
    act(() => renderer.root.findByProps({ "data-open-seeded": true }).props.onClick());
    act(() => dialogs.onSelect?.("deposit"));
    expect(find(renderer, "data-deposit-open").props["data-deposit-open"]).toBe(true);

    wallet.chainId = 314159;
    await rerenderHost(renderer);

    expect(find(renderer, "data-deposit-open").props["data-deposit-open"]).toBe(false);
  });

  it("renders no dialog tree without a connected address", async () => {
    wallet.address = undefined;
    const renderer = await renderHost();
    expect(renderer.root.findAll((node) => node.type === "div" && "data-squid-open" in node.props)).toHaveLength(0);
  });
});
