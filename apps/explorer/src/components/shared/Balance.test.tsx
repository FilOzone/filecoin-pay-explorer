import type { ReactNode } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Balance from "./Balance";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const SHORT_ADDRESS = "0x1111...1111";

const privy = vi.hoisted(() => ({
  authenticated: false,
  exportWallet: vi.fn(),
  logout: vi.fn(),
}));
const funding = vi.hoisted(() => ({ openAddFunds: vi.fn() }));
const wallet = vi.hoisted(() => ({ chainId: 314 }));

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: ADDRESS, chainId: wallet.chainId, connector: { name: "MetaMask" } }),
  useBalance: () => ({ data: { value: 0n }, isLoading: false }),
  useDisconnect: () => ({ disconnect: vi.fn() }),
  useReadContract: () => ({ data: 0n, isLoading: false }),
  useWalletClient: () => ({ data: undefined }),
}));
vi.mock("@privy-io/react-auth", () => ({
  useExportWallet: () => ({ exportWallet: privy.exportWallet }),
  usePrivy: () => ({ authenticated: privy.authenticated, logout: privy.logout, user: null }),
}));
vi.mock("@/hooks/useSynapse", () => ({
  default: () => ({ constants: { contracts: { usdfc: "0x2222222222222222222222222222222222222222" }, faucets: [] } }),
}));
vi.mock("@/components/UserConsole/FundingLaunchContext", () => ({ useFundingLaunch: () => funding }));
vi.mock("@/components/UserConsole/TransactionReview", () => ({
  isReviewEnabled: () => false,
  setReviewEnabled: vi.fn(),
  useIsEmbeddedSigner: () => false,
}));
vi.mock("@filecoin-pay/ui/components/button", () => ({
  Button: ({ children }: { children: ReactNode }) => <button type='button'>{children}</button>,
}));
vi.mock("@filecoin-pay/ui/components/skeleton", () => ({ Skeleton: () => <span data-skeleton /> }));
vi.mock("@filecoin-pay/ui/components/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => children,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => children,
  DropdownMenuGroup: ({ children }: { children: ReactNode }) => children,
  DropdownMenuItem: ({ children, onClick }: { children: ReactNode; onClick?: (e: unknown) => void }) => (
    <button data-menu-item onClick={onClick} type='button'>
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => <span data-menu-label>{children}</span>,
  DropdownMenuSeparator: () => null,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => children,
}));

const stringChildren = (node: ReactTestInstance) =>
  node
    .findAllByType("span")
    .map((span) =>
      [span.props.children]
        .flat()
        .filter((c): c is string => typeof c === "string")
        .join("")
        .trim(),
    )
    .filter(Boolean);
const menuItem = (renderer: ReturnType<typeof create>, label: string) =>
  renderer.root.find((node) => node.props["data-menu-item"] === true && stringChildren(node).includes(label));
const menuLabels = (renderer: ReturnType<typeof create>) =>
  renderer.root.findAllByProps({ "data-menu-item": true }).map((item) =>
    item
      .findAllByType("span")
      .map((span) => span.props.children)
      .find((c) => typeof c === "string"),
  );
const groupLabels = (renderer: ReturnType<typeof create>) =>
  renderer.root.findAllByProps({ "data-menu-label": true }).map((label) => label.props.children);

async function render() {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<Balance />);
  });
  return renderer;
}

beforeEach(() => {
  wallet.chainId = 314;
  vi.clearAllMocks();
});

describe("Balance wallet menu", () => {
  it("keeps the trigger compact: short address and the two balances without unit text", async () => {
    const renderer = await render();
    const trigger = renderer.root.find((node) => node.type === "button" && !("data-menu-item" in node.props));
    expect(stringChildren(trigger)).toEqual([SHORT_ADDRESS, "0.00", "0.00"]);
    await act(async () => renderer.unmount());
  });

  it("orders the menu as address, add funds, settings, then the way out, on every network", async () => {
    for (const chainId of [314, 314159]) {
      wallet.chainId = chainId;
      const renderer = await render();
      expect(JSON.stringify(renderer.toJSON())).not.toContain("MetaMask wallet");
      expect(menuLabels(renderer)).toEqual([SHORT_ADDRESS, "Add funds", "Add USDFC to wallet", "Disconnect"]);
      expect(groupLabels(renderer)).toEqual(["Settings"]);
      await act(async () => renderer.unmount());
    }
  });

  it("copies the full address when the address row is clicked", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, "clipboard", { value: { writeText }, configurable: true });
    const renderer = await render();
    await act(async () => {
      await menuItem(renderer, SHORT_ADDRESS).props.onClick({ preventDefault: vi.fn() });
    });
    expect(writeText).toHaveBeenCalledWith(ADDRESS);
    await act(async () => renderer.unmount());
  });

  it("opens the console-wide add-funds picker from Add funds", async () => {
    const renderer = await render();
    await act(async () => {
      menuItem(renderer, "Add funds").props.onClick();
    });
    expect(funding.openAddFunds).toHaveBeenCalledOnce();
    await act(async () => renderer.unmount());
  });
});
