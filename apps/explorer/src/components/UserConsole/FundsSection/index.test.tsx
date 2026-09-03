import type { Account, UserToken } from "@filecoin-pay/types";
import type { ReactNode } from "react";
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FundsSection } from ".";

const USDFC = "0x3333333333333333333333333333333333333333";
const OTHER_TOKEN = "0x4444444444444444444444444444444444444444";

const tokenState = vi.hoisted(() => ({ userTokens: [] as UserToken[] }));
const launch = vi.hoisted(() => ({ openAddFunds: vi.fn() }));

vi.mock("@/hooks/useAccountDetails", () => ({
  useAccountTokens: () => ({ data: { userTokens: tokenState.userTokens }, isError: false, isLoading: false }),
}));
vi.mock("@/hooks/useSynapse", () => ({
  default: () => ({ constants: { contracts: { usdfc: USDFC } } }),
}));
vi.mock("@/components/UserConsole/FundingLaunchContext", () => ({ useFundingLaunch: () => launch }));
vi.mock("@/components/UserConsole/WithdrawDialog", () => ({ WithdrawDialog: () => null }));
vi.mock("./components", () => ({
  FundsEmptyState: ({ onDeposit }: { onDeposit: () => void }) => (
    <button aria-label='Add funds to empty account' onClick={onDeposit} type='button' />
  ),
  FundsErrorState: () => null,
  FundsLoadingState: () => null,
  FundsOverview: () => null,
  FundsSectionLayout: ({ children, handleOpenDeposit }: { children: ReactNode; handleOpenDeposit: () => void }) => (
    <div>
      <button aria-label='Add funds to populated account' onClick={handleOpenDeposit} type='button' />
      {children}
    </div>
  ),
  TokenSelect: () => null,
}));

const account = { id: "account" } as unknown as Account;
const userToken = (id: string, tokenId: string) => ({ id, token: { id: tokenId } }) as unknown as UserToken;

async function render() {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<FundsSection account={account} network='mainnet' />);
  });
  return renderer;
}

beforeEach(() => {
  tokenState.userTokens = [];
  vi.clearAllMocks();
  vi.stubGlobal("window", { clearInterval: vi.fn(), setInterval: vi.fn(() => 1) });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FundsSection add funds", () => {
  it("hands the request to the funding host with no token when the account has none indexed", async () => {
    const renderer = await render();
    await act(async () => {
      renderer.root.findByProps({ "aria-label": "Add funds to empty account" }).props.onClick();
    });
    expect(launch.openAddFunds).toHaveBeenCalledExactlyOnceWith({ depositToken: null });
    await act(async () => renderer.unmount());
  });

  it("names the shown token, USDFC by contract address before anything else, so the deposit opens on it", async () => {
    const other = userToken("account-other", OTHER_TOKEN);
    const usdfc = userToken("account-usdfc", USDFC.toUpperCase().replace("0X", "0x"));
    tokenState.userTokens = [other, usdfc];
    const renderer = await render();
    await act(async () => {
      renderer.root.findByProps({ "aria-label": "Add funds to populated account" }).props.onClick();
    });
    expect(launch.openAddFunds).toHaveBeenCalledExactlyOnceWith({ depositToken: usdfc });
    await act(async () => renderer.unmount());
  });
});
