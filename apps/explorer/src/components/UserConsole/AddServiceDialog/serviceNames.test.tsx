// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApprovableService } from "@/hooks/useApprovableServices";
import AddServiceDialog from ".";

const TOKEN = "0x1111111111111111111111111111111111111111" as const;
const CURATED: ApprovableService = {
  address: "0x2222222222222222222222222222222222222222",
  name: "Warm Storage",
  nameSource: "known",
  payerCount: 12,
};
const SELF_REPORTED: ApprovableService = {
  address: "0x3333333333333333333333333333333333333333",
  name: "Acme Storage",
  nameSource: "onchain",
  payerCount: 11,
};

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
  SelectItem: ({ children }: { children: React.ReactNode }) => (
    <div role='option' aria-selected={false} tabIndex={-1}>
      {children}
    </div>
  ),
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
    services: [CURATED, SELF_REPORTED],
    isLoadingServices: false,
    serviceChoice: SELF_REPORTED.address,
    setServiceChoice: vi.fn(),
    customServiceInput: "",
    setCustomServiceInput: vi.fn(),
    selectedService: SELF_REPORTED,
    operatorAddress: SELF_REPORTED.address,
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
  useAddServiceSubmit: () => ({ submit: vi.fn(), isSubmitting: false, isExecuting: false }),
}));

describe("AddServiceDialog service names", () => {
  afterEach(cleanup);

  it("marks a self-reported name in the list and the details card, but not a curated one", () => {
    render(<AddServiceDialog network='mainnet' open onOpenChange={vi.fn()} />);

    const marker = { name: "Self-reported on-chain name" };
    const option = (name: string) => {
      const found = screen.getAllByRole("option").find((o) => o.textContent?.includes(name));
      if (!found) throw new Error(`No option for ${name}`);
      return found;
    };
    expect(within(option("Warm Storage")).queryByRole("img", marker)).toBeNull();
    expect(within(option("Acme Storage")).getByRole("img", marker)).toBeTruthy();
    // One in the list, one on the selected service's details card.
    expect(screen.getAllByRole("img", marker).map((m) => m.parentElement?.textContent)).toEqual([
      expect.stringContaining("Acme Storage"),
      "Acme Storage",
    ]);
  });
});
