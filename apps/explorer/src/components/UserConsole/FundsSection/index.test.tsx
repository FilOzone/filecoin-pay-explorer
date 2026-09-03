import type { Account, UserToken } from "@filecoin-pay/types";
import type { ReactNode } from "react";
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FundingLaunchProvider, useFundingLaunch } from "../FundingLaunchContext";
import { FundsSection } from ".";

const USDFC = "0x3333333333333333333333333333333333333333";
const OTHER_TOKEN = "0x4444444444444444444444444444444444444444";

const tokenState = vi.hoisted(() => ({ userTokens: [] as UserToken[] }));

vi.mock("@/hooks/useAccountDetails", () => ({
  useAccountTokens: () => ({ data: { userTokens: tokenState.userTokens }, isError: false, isLoading: false }),
}));
vi.mock("@/hooks/useSynapse", () => ({
  default: () => ({ constants: { contracts: { usdfc: USDFC } } }),
}));
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

beforeEach(() => {
  tokenState.userTokens = [];
  vi.stubGlobal("window", { clearInterval: vi.fn(), setInterval: vi.fn(() => 1) });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function LaunchState() {
  const launch = useFundingLaunch();
  return <div data-funding-open={launch.isAddFundsOpen} data-token-id={launch.depositToken?.id ?? ""} />;
}

async function openFundingFrom(buttonLabel: string) {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <FundingLaunchProvider>
        <FundsSection account={account} network='mainnet' />
        <LaunchState />
      </FundingLaunchProvider>,
    );
  });

  await act(async () => {
    renderer.root.findByProps({ "aria-label": buttonLabel }).props.onClick();
  });
  return renderer;
}

describe("FundsSection funding launch", () => {
  it("opens the shared host without a seed for an account with no indexed tokens", async () => {
    const renderer = await openFundingFrom("Add funds to empty account");
    expect(renderer.root.findByProps({ "data-funding-open": true }).props["data-token-id"]).toBe("");
  });

  it("opens the shared host on the token shown in the overview", async () => {
    tokenState.userTokens = [
      {
        id: "account-other-token",
        token: { id: OTHER_TOKEN },
      } as unknown as UserToken,
    ];

    const renderer = await openFundingFrom("Add funds to populated account");
    expect(renderer.root.findByProps({ "data-funding-open": true }).props["data-token-id"]).toBe("account-other-token");
  });
});
