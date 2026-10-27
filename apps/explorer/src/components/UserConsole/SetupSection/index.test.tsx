// @vitest-environment jsdom
/** The setup page a CLI link opens: which steps it shows, what each step opens, and when it is done. */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { getAddress, maxUint256 } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getChain } from "@/constants/chains";
import SetupSection from ".";

const OWNER = "0x1111111111111111111111111111111111111111";
const KEY = getAddress("0x00000000000000000000000000000000000000aa");
const FUTURE = BigInt(Math.floor(Date.now() / 1000) + 86_400);

const state = vi.hoisted(() => ({
  network: "mainnet" as "mainnet" | "calibration",
  approved: false as boolean | undefined,
  grants: undefined as { status: "success"; result: bigint }[] | undefined,
  /** The account's `funds` in Filecoin Pay, as the chain reports them; null for an account with none. */
  usdfcFunds: null as bigint | null,
  /** Allowances an approved account holds: unlimited unless a test sets limits. */
  limits: null as [bigint, bigint, bigint] | null,
  /** USDFC in the wallet itself, which decides whether approving and depositing merge. */
  walletUsdfc: 0n,
  /** The last approval read failed, while TanStack still holds the answer before it. */
  approvalRefetchFailed: false,
  /** The Filecoin Pay balance has never been read. */
  fundsUnreadable: false,
  /** The approval has never been read. */
  approvalUnreadable: false,
}));
const refetchApproval = vi.hoisted(() => vi.fn());
const execute = vi.hoisted(() => vi.fn());
const switchChain = vi.hoisted(() => vi.fn());
const openAddFunds = vi.hoisted(() => vi.fn());
const dialogs = vi.hoisted(() => ({
  createKey: [] as Record<string, unknown>[],
  addService: [] as Record<string, unknown>[],
  deposit: [] as Record<string, unknown>[],
  groupKey: [] as Record<string, unknown>[],
}));

vi.mock("wagmi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("wagmi")>()),
  useConnection: () => ({ address: OWNER, chainId: state.network === "mainnet" ? 314 : 314159 }),
  useSwitchChain: () => ({ switchChain, isPending: false }),
  // Only the Warm Storage approval is a single read.
  useReadContract: () => {
    if (state.approved === undefined) return { data: undefined, isPending: true, isError: false };
    if (state.approvalUnreadable) return { data: undefined, isPending: false, isError: true, refetch: refetchApproval };
    const [rate, lockup, period] = state.approved ? (state.limits ?? [maxUint256, maxUint256, 86_400n]) : [0n, 0n, 0n];
    return {
      data: [state.approved, rate, lockup, 0n, 0n, period],
      isPending: false,
      isError: state.approvalRefetchFailed,
      refetch: refetchApproval,
    };
  },
  // Two batched reads: the setup funds (Filecoin Pay account, wallet USDFC, block) and the key grant.
  useReadContracts: ({ contracts }: { contracts: { functionName: string }[] }) => {
    if (contracts[0]?.functionName !== "accounts") {
      return { data: state.grants, dataUpdatedAt: Date.now(), refetch: vi.fn() };
    }
    const account = state.fundsUnreadable
      ? { status: "failure" as const, error: new Error("boom") }
      : { status: "success" as const, result: [state.usdfcFunds ?? 0n, 0n, 0n, 0n] };
    const wallet = { status: "success" as const, result: state.walletUsdfc };
    return { data: [account, wallet, { status: "success" as const, result: 1_000n }], isPending: false };
  },
}));
vi.mock("@/hooks/useContractTransaction", () => ({
  useContractTransaction: () => ({ execute, isExecuting: false }),
}));
vi.mock("@/components/UserConsole/useConsoleNetwork", () => ({
  useConsoleNetwork: () => ({ network: state.network, isFilecoinChain: true, isSquidSourceChain: false }),
}));
vi.mock("@/hooks/useSessionKeys", () => ({
  useSessionKeys: () => ({
    keys: [],
    addKey: vi.fn(),
    removeKey: vi.fn(),
    refetchStatuses: vi.fn(),
    statusReadsPending: false,
    markConfirmed: vi.fn(),
    registry: { address: "0x00000000000000000000000000000000000000cc", abi: [] },
  }),
}));
// The subgraph only fills in the Deposit dialog's token picker.
vi.mock("@/hooks/useAccountDetails", () => ({
  CONSOLE_TOKEN_PAGE_SIZE: 100,
  useAccountTokens: () =>
    state.fundsUnreadable
      ? { isPending: false, isError: true, data: undefined }
      : {
          isPending: false,
          isError: false,
          data: {
            userTokens:
              state.usdfcFunds === null
                ? []
                : [
                    {
                      id: "usdfc",
                      token: { id: getChain(state.network).contracts.usdfc.address.toLowerCase(), decimals: 18 },
                      funds: state.usdfcFunds.toString(),
                      payout: "0",
                      fundsCollected: "0",
                      lockupCurrent: "0",
                      lockupRate: "0",
                      lockupLastSettledUntilEpoch: "0",
                      lockupLastSettledUntilTimestamp: "0",
                    },
                  ],
          },
        },
}));
vi.mock("@/components/UserConsole/providers/FundingLaunchContext", () => ({
  useFundingLaunch: () => ({ openAddFunds }),
}));
vi.mock("@/components/UserConsole/SessionKeysSection/CreateKeyFlow", () => ({
  CreateKeyFlow: (props: Record<string, unknown>) => {
    dialogs.createKey.push(props);
    return props.open ? <div role='dialog' aria-label='New session key' /> : null;
  },
}));
vi.mock("@/components/UserConsole/DepositDialog", () => ({
  DepositDialog: (props: Record<string, unknown>) => {
    dialogs.deposit.push(props);
    return props.open ? <div role='dialog' aria-label='Deposit' /> : null;
  },
}));
vi.mock("@/components/UserConsole/AddServiceDialog", () => ({
  default: (props: Record<string, unknown>) => {
    dialogs.addService.push(props);
    return props.open ? <div role='dialog' aria-label='Add a Service' /> : null;
  },
}));

// The step's own behaviour is in GroupKeyStep.test.tsx; here, only where it sits and what it is given.
vi.mock("./GroupKeyStep", () => ({
  GroupKeyStep: (props: { number: number; onIssued: () => void } & Record<string, unknown>) => {
    dialogs.groupKey.push(props);
    return (
      <li>
        <h2>
          <span className='sr-only'>Step {props.number}: </span>Give this key access to encrypted uploads
        </h2>
        <button type='button' onClick={props.onIssued}>
          Issue
        </button>
      </li>
    );
  },
}));

// secp256k1's generator point: a well-formed key-agreement key. The page only checks its signature in the step.
const PUBKEY_G =
  "0x0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8";
const KEY_LINK = `authorize=${KEY.toLowerCase()}&scopes=createDataSet,addPieces&network=mainnet&name=filecoin-cli&days=7`;
const ONE_USDFC = 10n ** 18n;

async function open(query: string) {
  let rerender!: () => Promise<void>;
  await act(async () => {
    const result = render(<SetupSection query={query} />);
    rerender = () => act(async () => result.rerender(<SetupSection query={query} />));
  });
  return { rerender };
}
const steps = () => screen.queryAllByRole("listitem").filter((item) => item.parentElement?.tagName === "OL");
const stepTitles = () => steps().map((step) => within(step).getByRole("heading", { level: 2 }).textContent);

describe("SetupSection", () => {
  beforeEach(() => {
    state.network = "mainnet";
    state.approved = false;
    state.grants = [
      { status: "success", result: 0n },
      { status: "success", result: 0n },
    ];
    state.usdfcFunds = null;
    state.limits = null;
    state.walletUsdfc = 0n;
    state.approvalRefetchFailed = false;
    state.fundsUnreadable = false;
    state.approvalUnreadable = false;
    refetchApproval.mockReset();
    execute.mockReset().mockResolvedValue("0xhash");
    switchChain.mockReset();
    openAddFunds.mockReset();
    dialogs.createKey = [];
    dialogs.addService = [];
    dialogs.deposit = [];
    dialogs.groupKey = [];
    window.sessionStorage.clear();
  });

  afterEach(cleanup);

  it("refuses a link it cannot read, and offers nothing to approve", async () => {
    await open("authorize=0xnope&scopes=addPieces&network=mainnet");

    expect(screen.getByRole("alert").textContent).toBe(
      "This setup link cannot be usedIt does not contain a valid session key address. Nothing was changed. Run the command again for a new link.",
    );
    expect(steps()).toEqual([]);
  });

  it("asks for a switch, and shows no steps, when the link is for another network", async () => {
    await open("deposit=2&operator=fwss&network=calibration");

    const notice = screen.getByRole("alert");
    expect(notice.textContent).toContain("This request is for calibration");
    expect(steps()).toEqual([]);
    fireEvent.click(within(notice).getByRole("button", { name: /Switch to/ }));
    expect(switchChain).toHaveBeenCalledWith({ chainId: getChain("calibration").id });
  });

  it("lists the key, the approval and the funds, in that order, for a key link", async () => {
    await open(KEY_LINK);

    expect(stepTitles()).toEqual([
      "Step 1: Authorize a session key",
      "Step 2: Approve Warm Storage",
      "Step 3: Fund Filecoin Pay",
    ]);
    expect(steps()[0].textContent).toContain(KEY);
    expect(steps()[0].textContent).toContain("filecoin-cli");
    expect(steps()[0].textContent).toContain("After 7 days");
  });

  it("adds the group key step after the key, only for a link with a pubkey, waiting for the authorization", async () => {
    const PUBKEY = `0x04${"ab".repeat(64)}`;
    const keyAgreementLink = `${KEY_LINK}&pubkey=${PUBKEY}&pubkeysig=0x${"cd".repeat(65)}`;
    // Not a point on the curve: the parser refuses it, so the page offers nothing.
    await open(keyAgreementLink);
    expect(screen.getByRole("alert").textContent).toContain("The session key's encryption key in it cannot be read.");
    expect(steps()).toEqual([]);
    cleanup();

    const pubkey = PUBKEY_G;
    const link = `${KEY_LINK}&pubkey=${pubkey}&pubkeysig=0x${"cd".repeat(65)}&node=keyspace`;
    await open(link);
    expect(stepTitles()).toEqual([
      "Step 1: Authorize a session key",
      "Step 2: Give this key access to encrypted uploads",
      "Step 3: Approve Warm Storage",
      "Step 4: Fund Filecoin Pay",
    ]);
    const before = dialogs.groupKey.at(-1);
    expect({ sessionKey: before?.sessionKey, expires: before?.expires, keyAgreement: before?.keyAgreement }).toEqual({
      sessionKey: KEY,
      expires: null,
      keyAgreement: { pubkey, pubkeysig: `0x${"cd".repeat(65)}`, node: "keyspace" },
    });
    cleanup();

    state.grants = [
      { status: "success", result: FUTURE },
      { status: "success", result: FUTURE + 10n },
    ];
    await open(link);
    expect(dialogs.groupKey.at(-1)?.expires).toBe(FUTURE);
  });

  it("is not complete until the group key Grant is made, when the link asks for one", async () => {
    state.approved = true;
    state.grants = [
      { status: "success", result: FUTURE },
      { status: "success", result: FUTURE },
    ];
    state.usdfcFunds = 2n * ONE_USDFC;
    await open(`${KEY_LINK}&balance=2&pubkey=${PUBKEY_G}&pubkeysig=0x${"cd".repeat(65)}&node=keyspace`);
    expect(screen.queryByText("✓ Setup complete")).toBeNull();

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Issue" })));
    expect(screen.getByText("✓ Setup complete")).toBeTruthy();
  });

  it("opens the key dialog with the link's request, and only when asked", async () => {
    await open(KEY_LINK);
    expect(screen.queryByRole("dialog", { name: "New session key" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Review and authorize" }));

    expect(screen.getByRole("dialog", { name: "New session key" })).toBeTruthy();
    const props = dialogs.createKey.at(-1);
    expect({
      prefillAddress: props?.prefillAddress,
      prefillScopes: props?.prefillScopes,
      prefillName: props?.prefillName,
      prefillDays: props?.prefillDays,
      existingKey: props?.existingKey,
    }).toEqual({
      prefillAddress: KEY,
      prefillScopes: ["createDataSet", "addPieces"],
      prefillName: "filecoin-cli",
      prefillDays: 7,
      existingKey: null,
    });
  });

  it("refuses to authorize the connected wallet as its own session key", async () => {
    await open(`authorize=${OWNER}&scopes=addPieces&network=mainnet`);

    expect(screen.getByRole("alert").textContent).toContain("This is your wallet address");
    expect(screen.queryByRole("button", { name: "Review and authorize" })).toBeNull();
  });

  it("shows a key with every scope live as done, with no button", async () => {
    state.grants = [
      { status: "success", result: FUTURE },
      { status: "success", result: FUTURE },
    ];
    await open(KEY_LINK);

    expect(steps()[0].textContent).toContain("Authorized until");
    expect(screen.queryByRole("button", { name: "Review and authorize" })).toBeNull();
  });

  it("approves and deposits in one step when the wallet holds the deposit, filled with the link's amount", async () => {
    state.walletUsdfc = 2n * ONE_USDFC;
    await open("deposit=2&operator=fwss&network=mainnet");

    expect(stepTitles()).toEqual(["Step 1: Approve Warm Storage", "Step 2: Fund Filecoin Pay"]);
    // The funds step points at the approval rather than offering a second deposit.
    expect(steps()[1].textContent).toContain("Approving Warm Storage above also deposits the 2 USDFC");
    expect(within(steps()[1]).queryByRole("button")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Approve and deposit 2 USDFC" }));

    expect(screen.getByRole("dialog", { name: "Add a Service" })).toBeTruthy();
    expect(dialogs.addService.at(-1)?.prefill).toEqual({
      token: getChain("mainnet").contracts.usdfc.address,
      operator: getChain("mainnet").contracts.fwss.address,
      amount: "2",
    });
    expect(dialogs.addService.at(-1)?.withoutDeposit).toBe(false);
  });

  it("never offers the approval again once Warm Storage is approved", async () => {
    state.approved = true;
    await open("operator=fwss&network=mainnet");

    expect(steps()[0].textContent).toContain("Approved");
    expect(screen.queryByRole("button", { name: /^Approve/ })).toBeNull();
  });

  it("opens the usual Add funds flow when the wallet cannot cover the deposit", async () => {
    await open("network=mainnet");

    fireEvent.click(screen.getByRole("button", { name: "Add funds" }));
    expect(openAddFunds).toHaveBeenCalledWith();
    expect(screen.queryByRole("dialog", { name: "Deposit" })).toBeNull();
  });

  it("adds the link's deposit on top of what Filecoin Pay holds, approving in the same step", async () => {
    // 7.342 already in Filecoin Pay does not count against the 2 to add.
    state.usdfcFunds = 7_342n * 10n ** 15n;
    state.walletUsdfc = 5n * ONE_USDFC;
    await open("deposit=2&operator=fwss&network=mainnet");

    fireEvent.click(screen.getByRole("button", { name: "Approve and deposit 2 USDFC" }));
    expect(dialogs.addService.at(-1)?.prefill).toEqual(expect.objectContaining({ amount: "2" }));
    expect(dialogs.addService.at(-1)?.withoutDeposit).toBe(false);
  });

  it("approves alone and offers Add funds when the wallet holds less than the deposit, whatever Filecoin Pay holds", async () => {
    // 5 in the wallet, 7.342 in Filecoin Pay, 10 to add.
    state.usdfcFunds = 7_342n * 10n ** 15n;
    state.walletUsdfc = 5n * ONE_USDFC;
    await open("deposit=10&operator=fwss&network=mainnet");

    expect(stepTitles()).toEqual(["Step 1: Approve Warm Storage", "Step 2: Fund Filecoin Pay"]);
    expect(within(steps()[1]).getByRole("button", { name: "Add funds" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Approve Warm Storage" }));
    expect(dialogs.addService.at(-1)?.withoutDeposit).toBe(true);
  });

  it("checks a link's balance against what is available, and deposits the gap", async () => {
    state.approved = true;
    state.usdfcFunds = 7_342n * 10n ** 15n;
    state.walletUsdfc = 20n * ONE_USDFC;
    await open("deposit=10&balance=17.342&network=mainnet");

    expect(stepTitles()).toEqual(["Step 1: Approve Warm Storage", "Step 2: Fund Filecoin Pay"]);
    fireEvent.click(screen.getByRole("button", { name: "Deposit 10 USDFC" }));
    const props = dialogs.deposit.at(-1);
    expect({ amount: props?.initialAmount, token: props?.initialTokenAddress }).toEqual({
      amount: "10",
      token: getChain("mainnet").contracts.usdfc.address,
    });
    expect(openAddFunds).not.toHaveBeenCalled();

    cleanup();
    state.usdfcFunds = 17_342n * 10n ** 15n;
    await open("deposit=10&balance=17.342&network=mainnet");
    expect(steps()[1].textContent).toContain("17.342 USDFC available");
    expect(screen.getByText("✓ Setup complete")).toBeTruthy();
  });

  it("without a balance, is done once this tab sees the deposit go in, and keeps that across a reload", async () => {
    state.approved = true;
    state.usdfcFunds = 7n * ONE_USDFC;
    state.walletUsdfc = 20n * ONE_USDFC;
    const { rerender } = await open("deposit=2&network=mainnet");
    expect(screen.getByRole("button", { name: "Deposit 2 USDFC" })).toBeTruthy();

    state.usdfcFunds = 9n * ONE_USDFC;
    await rerender();
    expect(screen.queryByRole("button", { name: /^Deposit/ })).toBeNull();
    expect(screen.getByText("✓ Setup complete")).toBeTruthy();

    // A reload in this tab remembers where it started.
    cleanup();
    await open("deposit=2&network=mainnet");
    expect(screen.getByText("✓ Setup complete")).toBeTruthy();

    // Another tab starts from what is there now, so it asks again.
    cleanup();
    window.sessionStorage.clear();
    await open("deposit=2&network=mainnet");
    expect(screen.getByRole("button", { name: "Deposit 2 USDFC" })).toBeTruthy();
  });

  it("says setup is complete only once every requested step is done", async () => {
    state.approved = true;
    state.grants = [
      { status: "success", result: FUTURE },
      { status: "success", result: FUTURE },
    ];
    state.usdfcFunds = ONE_USDFC;
    await open(`${KEY_LINK}&balance=2`);
    expect(screen.queryByText("✓ Setup complete")).toBeNull();

    cleanup();
    state.usdfcFunds = 2n * ONE_USDFC;
    await open(`${KEY_LINK}&balance=2`);
    expect(screen.getByText("✓ Setup complete")).toBeTruthy();
  });

  it("asks for funds too when the link does not say, but not for an approval-only link", async () => {
    state.approved = true;
    state.walletUsdfc = ONE_USDFC;
    await open("network=mainnet");
    expect(stepTitles()).toEqual(["Step 1: Approve Warm Storage", "Step 2: Fund Filecoin Pay"]);
    expect(screen.queryByText("✓ Setup complete")).toBeNull();

    cleanup();
    await open("operator=fwss&network=mainnet");
    expect(stepTitles()).toEqual(["Step 1: Approve Warm Storage"]);
    expect(screen.getByText("✓ Setup complete")).toBeTruthy();
  });

  it("counts the funds as done once Add funds fills Filecoin Pay, keeping the order", async () => {
    const { rerender } = await open("deposit=2&operator=fwss&network=mainnet");
    expect(within(steps()[1]).getByRole("button", { name: "Add funds" })).toBeTruthy();

    // The card or swap route deposited straight into Filecoin Pay.
    state.usdfcFunds = 2n * ONE_USDFC;
    await rerender();

    expect(stepTitles()).toEqual(["Step 1: Approve Warm Storage", "Step 2: Fund Filecoin Pay"]);
    expect(within(steps()[1]).queryByRole("button")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Approve Warm Storage" }));
    expect(dialogs.addService.at(-1)?.withoutDeposit).toBe(true);
  });

  it("keeps an approval it has read when a later read fails, rather than offering it again", async () => {
    state.approved = true;
    state.approvalRefetchFailed = true;
    await open("operator=fwss&network=mainnet");

    expect(steps()[0].textContent).toContain("Approved");
    expect(screen.queryByRole("button", { name: /^Approve/ })).toBeNull();
  });

  it("does not count an earlier request's deposit for a new key asking the same amount in this tab", async () => {
    state.approved = true;
    state.usdfcFunds = 7n * ONE_USDFC;
    state.walletUsdfc = 20n * ONE_USDFC;
    const first = `${KEY_LINK}&deposit=2`;
    const { rerender } = await open(first);
    state.usdfcFunds = 9n * ONE_USDFC;
    await rerender();
    expect(screen.queryByRole("button", { name: /^Deposit/ })).toBeNull();

    cleanup();
    const otherKey = getAddress("0x00000000000000000000000000000000000000bb");
    await open(`${KEY_LINK.replace(KEY.toLowerCase(), otherKey.toLowerCase())}&deposit=2`);
    expect(screen.getByRole("button", { name: "Deposit 2 USDFC" })).toBeTruthy();
  });

  it("stays complete for this visit once the balance is reached, as lockup draws it down", async () => {
    state.approved = true;
    state.usdfcFunds = 2n * ONE_USDFC;
    const { rerender } = await open("balance=2&network=mainnet");
    expect(screen.getByText("✓ Setup complete")).toBeTruthy();

    state.usdfcFunds = 2n * ONE_USDFC - 10n ** 15n;
    await rerender();
    expect(screen.getByText("✓ Setup complete")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Deposit/ })).toBeNull();
  });

  it("follows the balance once a read that failed answers, without changing the steps", async () => {
    state.approved = true;
    state.fundsUnreadable = true;
    const { rerender } = await open("balance=2&network=mainnet");
    expect(steps()[1].textContent).toContain("Could not read your balance");
    expect(within(steps()[1]).getByRole("button", { name: "Add funds" })).toBeTruthy();

    state.fundsUnreadable = false;
    state.usdfcFunds = 2n * ONE_USDFC;
    await rerender();
    expect(stepTitles()).toEqual(["Step 1: Approve Warm Storage", "Step 2: Fund Filecoin Pay"]);
    expect(within(steps()[1]).queryByRole("button")).toBeNull();
    expect(screen.getByText("✓ Setup complete")).toBeTruthy();
  });

  it("keeps the Deposit dialog mounted from before the approval until after the deposit lands", async () => {
    state.walletUsdfc = 5n * ONE_USDFC;
    const { rerender } = await open("deposit=2&network=mainnet");
    expect(dialogs.deposit.length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Deposit 2 USDFC" })).toBeNull();

    // Approved with no deposit: the deposit is offered on its own.
    state.approved = true;
    await rerender();
    expect(screen.getByRole("button", { name: "Deposit 2 USDFC" })).toBeTruthy();

    // The deposit lands; the dialog that sent it is still rendered.
    state.usdfcFunds = 2n * ONE_USDFC;
    const rendered = dialogs.deposit.length;
    await rerender();
    expect(screen.queryByRole("button", { name: "Deposit 2 USDFC" })).toBeNull();
    expect(dialogs.deposit.length).toBeGreaterThan(rendered);
  });

  it("offers no deposit for a deposit link until it has read where the balance started", async () => {
    state.approved = true;
    state.walletUsdfc = 20n * ONE_USDFC;
    state.fundsUnreadable = true;
    const { rerender } = await open("deposit=2&network=mainnet");
    expect(steps()[1].textContent).toContain("Could not read your balance");
    expect(within(steps()[1]).queryByRole("button")).toBeNull();

    // The read recovers: the deposit is measured from here.
    state.fundsUnreadable = false;
    state.usdfcFunds = 7n * ONE_USDFC;
    await rerender();
    expect(screen.getByRole("button", { name: "Deposit 2 USDFC" })).toBeTruthy();
  });

  it("starts again when the page moves to another setup link without unmounting", async () => {
    state.approved = true;
    state.usdfcFunds = 2n * ONE_USDFC;
    state.walletUsdfc = 20n * ONE_USDFC;
    let result!: ReturnType<typeof render>;
    await act(async () => {
      result = render(<SetupSection query='balance=2&network=mainnet' />);
    });
    expect(screen.getByText("✓ Setup complete")).toBeTruthy();

    await act(async () => result.rerender(<SetupSection query='balance=10&network=mainnet' />));
    expect(screen.queryByText("✓ Setup complete")).toBeNull();
    expect(screen.getByRole("button", { name: "Deposit 8 USDFC" })).toBeTruthy();
  });

  it("counts an approval and its deposit as soon as the chain shows them, offering no second deposit", async () => {
    state.walletUsdfc = 5n * ONE_USDFC;
    const { rerender } = await open("deposit=2&operator=fwss&network=mainnet");
    expect(screen.getByRole("button", { name: "Approve and deposit 2 USDFC" })).toBeTruthy();

    // The receipt lands: approval and deposit in the same read, whatever the subgraph has indexed.
    state.approved = true;
    state.usdfcFunds = 2n * ONE_USDFC;
    state.walletUsdfc = 3n * ONE_USDFC;
    await rerender();
    expect(screen.queryByRole("button", { name: /^Deposit/ })).toBeNull();
    expect(screen.getByText("✓ Setup complete")).toBeTruthy();
  });

  it("offers a Retry, not an approval, when the approval could not be read", async () => {
    state.approvalUnreadable = true;
    state.walletUsdfc = 5n * ONE_USDFC;
    await open("deposit=2&operator=fwss&network=mainnet");

    expect(steps()[0].textContent).toContain("Could not read the approval");
    expect(screen.queryByRole("button", { name: /^Approve/ })).toBeNull();
    // The funds step waits too, rather than depositing beside an approval it may not need.
    expect(within(steps()[1]).queryByRole("button")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Could not read the approval. Retry" }));
    expect(refetchApproval).toHaveBeenCalledTimes(1);
  });

  it("says a one-day key expires after 1 day", async () => {
    await open(KEY_LINK.replace("days=7", "days=1"));

    expect(steps()[0].textContent).toContain("After 1 day, unless you change it");
  });

  describe("a link asking for unlimited approval", () => {
    const LIMITS: [bigint, bigint, bigint] = [10n ** 18n, 5n * 10n ** 18n, 2_880n];

    it("keeps the owner's limits as approved when the link does not ask", async () => {
      state.approved = true;
      state.limits = LIMITS;
      await open("operator=fwss&network=mainnet");

      expect(steps()[0].textContent).toContain("Approved");
      expect(screen.queryByRole("button", { name: "Remove spending limits" })).toBeNull();
      expect(screen.getByText("✓ Setup complete")).toBeTruthy();
    });

    it("shows the owner's limits beside what the tool needs, and is not done", async () => {
      state.approved = true;
      state.limits = LIMITS;
      await open("operator=fwss&network=mainnet&approval=unlimited");

      const rows = within(steps()[0])
        .getAllByRole("row")
        .map((row) => row.textContent);
      expect(rows).toEqual([
        "LimitYoursNeeded",
        "Rate1.000 USDFC per epoch (too low)Unlimited",
        "Lockup5.000 USDFC (too low)Unlimited",
        "Lockup period1 day (too low)At least 30 days",
      ]);
      expect(steps()[0].textContent).toContain("Approved with limits");
      expect(screen.queryByText("✓ Setup complete")).toBeNull();
    });

    it("lifts every limit after the owner confirms, keeping it on Warm Storage and USDFC", async () => {
      state.approved = true;
      state.limits = LIMITS;
      await open("operator=fwss&network=mainnet&approval=unlimited");

      fireEvent.click(screen.getByRole("button", { name: "Remove spending limits" }));
      expect(execute).not.toHaveBeenCalled();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Remove limits" }));
      });

      expect(execute).toHaveBeenCalledTimes(1);
      expect(execute.mock.calls[0][0].functionName).toBe("setOperatorApproval");
      expect(execute.mock.calls[0][0].args).toEqual([
        getChain("mainnet").contracts.usdfc.address,
        getChain("mainnet").contracts.fwss.address,
        true,
        maxUint256,
        maxUint256,
        86_400n,
      ]);
    });

    it("counts an unlimited approval as done", async () => {
      state.approved = true;
      await open("operator=fwss&network=mainnet&approval=unlimited");

      expect(steps()[0].textContent).toContain("Approved");
      expect(screen.queryByRole("button", { name: "Remove spending limits" })).toBeNull();
      expect(screen.getByText("✓ Setup complete")).toBeTruthy();
    });

    it("still offers Add a Service when nothing is approved yet", async () => {
      await open("operator=fwss&network=mainnet&approval=unlimited");

      expect(screen.getByRole("button", { name: "Approve Warm Storage" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Remove spending limits" })).toBeNull();
    });
  });
});
