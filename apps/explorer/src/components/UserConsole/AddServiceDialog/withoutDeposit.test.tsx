// @vitest-environment jsdom
/** `withoutDeposit`: the setup page's approval-only step, which funds the account in a step of its own. */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AddServiceDialog from ".";

const TOKEN = "0x1111111111111111111111111111111111111111";
const OPERATOR = "0x2222222222222222222222222222222222222222";
const submit = vi.hoisted(() => vi.fn());

vi.mock("@filecoin-pay/ui/components/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => children,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
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
vi.mock("@/components/shared/TokenIcon", () => ({ default: () => null }));
vi.mock("@/components/UserConsole/providers/FundingLaunchContext", () => ({
  useFundingLaunch: () => ({ isSquidOpen: false, openSquid: vi.fn() }),
}));
vi.mock("./hooks", () => ({
  CUSTOM_OPTION: "custom",
  useServiceSelection: () => ({
    services: [{ address: OPERATOR, name: "Warm Storage", payerCount: 3 }],
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
    knownTokens: [{ address: TOKEN, symbol: "USDFC", decimals: 18 }],
    tokenChoice: TOKEN,
    setTokenChoice: vi.fn(),
    customTokenInput: "",
    setCustomTokenInput: vi.fn(),
    token: { address: TOKEN, symbol: "USDFC", decimals: 18 },
    supportsPermit: true,
    customTokenState: "idle",
    balance: 5n * 10n ** 18n,
    isLoadingBalance: false,
    reset: vi.fn(),
  }),
  useFilecoinGasBalance: () => ({
    chainId: 314,
    isCorrectChain: true,
    isSwitchingNetwork: false,
    owner: "0xABCDEF0000000000000000000000000000000001",
    refresh: vi.fn().mockResolvedValue("funded"),
    status: "funded",
    switchToFilecoin: vi.fn(),
    targetChainId: 314,
  }),
  useAddServiceSubmit: () => ({ submit, isSubmitting: false, isExecuting: false }),
}));

function renderDialog(withoutDeposit: boolean) {
  render(
    <AddServiceDialog
      network='mainnet'
      open
      onOpenChange={vi.fn()}
      // A prefill with an amount, to show the flag wins over it.
      prefill={{ operator: OPERATOR, token: TOKEN, amount: "2" }}
      withoutDeposit={withoutDeposit}
    />,
  );
}

describe("AddServiceDialog withoutDeposit", () => {
  beforeEach(() => submit.mockReset().mockResolvedValue(undefined));
  afterEach(cleanup);

  it("shows the deposit field by default", () => {
    renderDialog(false);

    expect(screen.getByText("Deposit amount")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Deposit and Add Service" })).toBeTruthy();
  });

  it("hides the deposit field and approves without depositing, whatever the prefill says", async () => {
    renderDialog(true);

    expect(screen.queryByText("Deposit amount")).toBeNull();
    expect(screen.queryByRole("spinbutton")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add Service" }));
    });

    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0][0]).toEqual(expect.objectContaining({ parsedDeposit: null, depositAmountLabel: "" }));
  });
});
