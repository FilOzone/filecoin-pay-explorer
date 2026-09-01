import type { Account, UserToken } from "@filecoin-pay/types";
import type { ReactNode } from "react";
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
vi.mock("@/components/UserConsole/DepositDialog", () => ({
  DepositDialog: ({ open }: { open: boolean }) => (open ? <div data-direct-deposit /> : null),
}));
vi.mock("@/components/UserConsole/WithdrawDialog", () => ({ WithdrawDialog: () => null }));
// Stubbed out: these tests are about guided funding, not the chart.
vi.mock("@/components/UserConsole/SpendChart", () => ({ SpendChart: () => null }));
vi.mock("./components", () => ({
  AddFundsDialog: ({ onSelect, open }: { onSelect: (method: "deposit" | "squid") => void; open: boolean }) =>
    open ? <button aria-label='Choose Squid funding' onClick={() => onSelect("squid")} type='button' /> : null,
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

async function expectGuidedTopUpFrom(buttonLabel: string) {
  const onGuidedTopUp = vi.fn();
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<FundsSection account={account} network='mainnet' onGuidedTopUp={onGuidedTopUp} />);
  });

  await act(async () => {
    renderer.root.findByProps({ "aria-label": buttonLabel }).props.onClick();
  });
  expect(renderer.root.findAllByProps({ "data-direct-deposit": true })).toHaveLength(0);

  await act(async () => {
    renderer.root.findByProps({ "aria-label": "Choose Squid funding" }).props.onClick();
  });
  expect(onGuidedTopUp).toHaveBeenCalledOnce();

  await act(async () => renderer.unmount());
}

describe("FundsSection guided funding", () => {
  it("offers guided funding when an existing account has no indexed tokens", async () => {
    await expectGuidedTopUpFrom("Add funds to empty account");
  });

  it("offers guided funding when the visible token list does not contain USDFC", async () => {
    tokenState.userTokens = [
      {
        id: "account-other-token",
        token: { id: OTHER_TOKEN },
      } as unknown as UserToken,
    ];

    await expectGuidedTopUpFrom("Add funds to populated account");
  });
});
