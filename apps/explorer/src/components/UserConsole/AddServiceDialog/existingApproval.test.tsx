// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mainnet } from "@/constants/chains";
import AddServiceDialog, { type AddServicePrefill } from ".";

const TOKEN = "0x1111111111111111111111111111111111111111" as const;
const OPERATOR = "0x2222222222222222222222222222222222222222" as const;
const OWNER = "0x3333333333333333333333333333333333333333" as const;
const NOTICE = "You already have this service";

/** The contract's `operatorApprovals` tuple; only the first field decides anything here. */
const approval = (isApproved: boolean) => [isApproved, 1n, 1n, 0n, 0n, 86400n] as const;

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
  push: vi.fn(),
  refetch: vi.fn(),
  readContract: vi.fn(),
  read: { data: undefined as unknown, isError: false, isFetching: false },
  operatorAddress: undefined as string | undefined,
}));

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: "0x3333333333333333333333333333333333333333" }),
  useReadContract: (config: unknown) => {
    mocks.readContract(config);
    return { ...mocks.read, refetch: mocks.refetch };
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
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
// Everything but useExistingApproval, which runs for real against the mocked wagmi read.
vi.mock("./hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./hooks")>()),
  useServiceSelection: () => ({
    services: [],
    isLoadingServices: false,
    serviceChoice: OPERATOR,
    setServiceChoice: vi.fn(),
    customServiceInput: "",
    setCustomServiceInput: vi.fn(),
    selectedService: undefined,
    operatorAddress: mocks.operatorAddress,
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
    chainId: mainnet.id,
    isCorrectChain: true,
    isSwitchingNetwork: false,
    owner: OWNER,
    refresh: vi.fn().mockResolvedValue("funded"),
    status: "funded",
    switchToFilecoin: vi.fn(),
    targetChainId: mainnet.id,
  }),
  useAddServiceSubmit: () => ({ submit: mocks.submit, isSubmitting: false, isExecuting: false }),
}));

function renderDialog(prefill?: AddServicePrefill) {
  const onOpenChange = vi.fn();
  render(<AddServiceDialog network='mainnet' open onOpenChange={onOpenChange} prefill={prefill} />);
  return { onOpenChange };
}

const addServiceButton = () => screen.getByRole<HTMLButtonElement>("button", { name: "Add Service" });

describe("AddServiceDialog with an existing approval", () => {
  beforeEach(() => {
    mocks.submit.mockReset().mockResolvedValue(undefined);
    mocks.push.mockReset();
    mocks.readContract.mockReset();
    mocks.refetch.mockReset().mockResolvedValue({ data: approval(false), isError: false });
    mocks.read = { data: approval(false), isError: false, isFetching: false };
    mocks.operatorAddress = OPERATOR;
  });
  afterEach(cleanup);

  it("reads the approval for this account, service and token on the dialog's network", () => {
    renderDialog();

    expect(mocks.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: mainnet.contracts.payments.address,
        chainId: mainnet.id,
        functionName: "operatorApprovals",
        args: [TOKEN, OWNER, OPERATOR],
        query: expect.objectContaining({ enabled: true }),
      }),
    );
  });

  it("leads to the service instead of offering another approval", () => {
    mocks.read.data = approval(true);
    const { onOpenChange } = renderDialog();

    expect(screen.getByText(NOTICE)).toBeTruthy();
    expect(screen.queryByText("Deposit amount")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add Service" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Go to service" }));

    expect(mocks.push).toHaveBeenCalledWith(`/console/services/${OPERATOR}`);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("does not lead a setup link away from its remaining steps", () => {
    mocks.read.data = approval(true);
    renderDialog({ operator: OPERATOR, token: TOKEN, amount: "" });

    expect(screen.getByText(NOTICE)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Go to service" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add Service" })).toBeNull();
  });

  it("keeps the form for a service without an approval, so a removed service or new token can be added", async () => {
    renderDialog();

    expect(screen.queryByText(NOTICE)).toBeNull();
    expect(screen.getByText("Deposit amount")).toBeTruthy();
    expect(addServiceButton().disabled).toBe(false);

    await act(async () => {
      fireEvent.click(addServiceButton());
    });
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });

  it("does not ask for anything until a service is chosen", () => {
    mocks.operatorAddress = undefined;
    mocks.read.data = undefined;
    renderDialog();

    expect(mocks.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ args: undefined, query: expect.objectContaining({ enabled: false }) }),
    );
    expect(screen.queryByText(/Could not check/)).toBeNull();
    expect(addServiceButton().disabled).toBe(true);
  });

  it("holds the submit until the read answers", () => {
    mocks.read = { data: undefined, isError: false, isFetching: true };
    renderDialog();

    expect(screen.getByRole("status")).toBeTruthy();
    expect(addServiceButton().disabled).toBe(true);
  });

  it("fails closed when the read fails, and retries on request", () => {
    mocks.read = { data: undefined, isError: true, isFetching: false };
    renderDialog();

    expect(addServiceButton().disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });

  it("does not submit over an approval the cached read had not seen", async () => {
    mocks.refetch.mockResolvedValue({ data: approval(true), isError: false });
    renderDialog();

    await act(async () => {
      fireEvent.click(addServiceButton());
    });

    expect(mocks.refetch).toHaveBeenCalledTimes(1);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("does not submit when the fresh read fails, whatever the cache says", async () => {
    mocks.refetch.mockResolvedValue({ data: approval(false), isError: true });
    renderDialog();

    await act(async () => {
      fireEvent.click(addServiceButton());
    });

    expect(mocks.submit).not.toHaveBeenCalled();
  });
});
