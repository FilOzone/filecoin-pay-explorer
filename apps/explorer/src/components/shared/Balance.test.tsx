import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { FundingLaunchProvider, useFundingLaunch } from "@/components/UserConsole/FundingLaunchContext";
import Balance from "./Balance";

vi.mock("@filecoin-pay/ui/components/button", () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button type='button'>{children}</button>,
}));
vi.mock("@filecoin-pay/ui/components/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button data-menu-item onClick={onClick} type='button'>
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@privy-io/react-auth", () => ({
  useLogout: () => ({ logout: vi.fn() }),
  usePrivy: () => ({ authenticated: false }),
  useWallets: () => ({ wallets: [] }),
}));
vi.mock("wagmi", () => ({
  useAccount: () => ({ address: "0x1111111111111111111111111111111111111111" }),
  useBalance: () => ({ data: { value: 0n }, isLoading: false }),
  useReadContract: () => ({ data: 0n, isLoading: false }),
  useWalletClient: () => ({ data: undefined }),
}));
vi.mock("@/hooks/useSynapse", () => ({
  default: () => ({ constants: { contracts: { usdfc: "0x2222222222222222222222222222222222222222" } } }),
}));
vi.mock("@/assests/FilecoinLogo", () => ({ default: () => null }));
vi.mock("@/assests/USDFCLogo", () => ({ default: () => null }));

function LaunchState() {
  const { isAddFundsOpen } = useFundingLaunch();
  return <output data-open={isAddFundsOpen} />;
}

describe("Balance", () => {
  it("opens the shared funding host from the wallet menu", () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <FundingLaunchProvider>
          <Balance />
          <LaunchState />
        </FundingLaunchProvider>,
      );
    });

    const addFunds = renderer.root
      .findAllByProps({ "data-menu-item": true })
      .find((item) => item.findAllByType("span").some((span) => span.children.includes("Add funds")));
    expect(addFunds).toBeDefined();
    act(() => addFunds?.props.onClick());
    expect(renderer.root.findByType("output").props["data-open"]).toBe(true);
  });
});
