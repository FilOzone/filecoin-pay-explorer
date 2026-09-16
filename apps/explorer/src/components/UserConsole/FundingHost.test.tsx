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
  onSelect: undefined as ((method: "deposit" | "squid") => void) | undefined,
  squidOpen: false,
}));

vi.mock("wagmi", () => ({ useConnection: () => wallet }));
vi.mock("@/hooks/useAccountDetails", () => ({
  CONSOLE_TOKEN_PAGE_SIZE: 100,
  useAccountTokens: () => ({ data: { userTokens: [{ id: "token-1" }] } }),
}));
vi.mock("./FundsSection/components", () => ({
  AddFundsDialog: ({ onSelect, open }: { onSelect: (method: "deposit" | "squid") => void; open: boolean }) => {
    dialogs.onSelect = onSelect;
    return <div data-picker-open={open} />;
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
  DirectSquidDepositDialog: ({ accountId, open }: { accountId: string; open: boolean }) => {
    dialogs.accountId = accountId;
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
